'use strict';
/*
 * PDF 工作台 — Electron main process
 *  - serves the renderer from a private app:// origin (so fetch, workers and cMaps behave like a website)
 *  - native open / save / write-back-to-original through IPC
 *  - "open with" (.pdf file association) and single-instance handling
 *  - automatic updates from GitHub Releases (electron-updater)
 */
const { app, BrowserWindow, ipcMain, dialog, protocol, net, shell, Menu, nativeTheme, clipboard } = require('electron');
const path = require('path');
const fs = require('fs/promises');
const { pathToFileURL } = require('url');

const isDev = !app.isPackaged;
let win = null;
let pendingOpen = [];          // PDF paths waiting for the renderer
let rendererReady = false;

protocol.registerSchemesAsPrivileged([{
  scheme: 'app',
  privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true },
}]);

/* ---------------- single instance + open-with ---------------- */
const pdfArgs = argv => argv.slice(1).filter(a => /\.pdf$/i.test(a) && !a.startsWith('-'));
// a separate profile (used by the end-to-end tests so they never touch the installed app's data)
if (process.env.PDFE_USER_DATA) app.setPath('userData', process.env.PDFE_USER_DATA);
// whether the program ran on this computer before (Chromium writes Preferences into the profile on every start; it is
// looked at before this start writes it): a new install does not get the 「已更新到」 window
const usedBefore = require('fs').existsSync(path.join(app.getPath('userData'), 'Preferences'));
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', (_e, argv) => {
    pdfArgs(argv).forEach(queueOpen);
    if (win) { if (win.isMinimized()) win.restore(); win.focus(); }
  });
}
function queueOpen(p) {
  const abs = path.resolve(p);
  if (rendererReady && win) win.webContents.send('open-path', abs);
  else pendingOpen.push(abs);
}
pdfArgs(process.argv).forEach(queueOpen);

/* ---------------- window ---------------- */
function createWindow() {
  win = new BrowserWindow({
    width: 1400, height: 900, minWidth: 900, minHeight: 600,
    title: 'PDF 工作台',
    backgroundColor: '#cfcbc2',
    icon: path.join(__dirname, 'build', 'icon.png'),
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
    },
  });
  Menu.setApplicationMenu(null);
  win.loadURL('app://bundle/app/index.html');

  // links open in the real browser, never inside the app
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e, url) => {
    if (!url.startsWith('app://')) { e.preventDefault(); if (/^https?:/i.test(url)) shell.openExternal(url); }
  });

  // the renderer blocks unload while there are unsaved edits; ask the user
  win.webContents.on('will-prevent-unload', e => {
    const choice = dialog.showMessageBoxSync(win, {
      type: 'warning', buttons: ['不儲存並關閉', '取消'], defaultId: 1, cancelId: 1,
      title: 'PDF 工作台', message: '文件有尚未儲存的修改', detail: '關閉後這些修改將會遺失。',
    });
    if (choice === 0) e.preventDefault();
  });

  if (process.env.PDFEDITOR_DEVTOOLS) win.webContents.openDevTools({ mode: 'detach' });
  // Windows sends mouse side buttons (and some keyboards' back/forward keys) as app commands too;
  // the page decides whether a binding uses them
  win.on('app-command', (_e, cmd) => send('app-command', cmd));
  win.on('closed', () => { win = null; rendererReady = false; });
}

/* ---------------- IPC: files ---------------- */
const send = (ch, payload) => { if (win && !win.isDestroyed()) win.webContents.send(ch, payload); };
const toBuf = data => Buffer.from(data.buffer ? new Uint8Array(data.buffer, data.byteOffset, data.byteLength) : data);

ipcMain.handle('renderer-ready', () => {
  rendererReady = true;
  const list = pendingOpen; pendingOpen = [];
  return list;
});
ipcMain.handle('file:open-dialog', async () => {
  const r = await dialog.showOpenDialog(win, {
    title: '開啟 PDF（可一次選擇多個檔案）', properties: ['openFile', 'multiSelections'],
    filters: [{ name: 'PDF 文件', extensions: ['pdf'] }, { name: '所有檔案', extensions: ['*'] }],
  });
  return r.canceled ? [] : r.filePaths;
});
/* folders the renderer may export into: ones the user picked, or where an opened PDF lives */
const allowedDirs = new Set();
const allowDir = d => { if (d) allowedDirs.add(path.resolve(d)); };
// folders the user explicitly picked are remembered across launches
const pickedFile = () => path.join(app.getPath('userData'), 'export-dirs.json');
let picked = [];
async function loadPicked() {
  try { picked = JSON.parse(await fs.readFile(pickedFile(), 'utf8')).filter(x => typeof x === 'string'); } catch (_) { picked = []; }
  picked.forEach(allowDir);
}
async function rememberPicked(d) {
  picked = [path.resolve(d), ...picked.filter(x => x !== path.resolve(d))].slice(0, 20);
  allowDir(d);
  await fs.writeFile(pickedFile(), JSON.stringify(picked)).catch(() => {});
}
const isAllowed = d => {
  const r = path.resolve(d);
  for (const a of allowedDirs) if (r === a || r.startsWith(a + path.sep)) return true;
  return false;
};
const RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\..*)?$/i;
function safeName(n) {
  let s = String(n || '').replace(/[\x00-\x1f\\/:*?"<>|]/g, '_').replace(/[. ]+$/, '').trim();
  if (!s || s === '.' || s === '..') s = 'page';
  if (RESERVED.test(s)) s = '_' + s;
  return s.slice(0, 200);
}

ipcMain.handle('file:read', async (_e, p) => {
  allowDir(path.dirname(p));
  const data = await fs.readFile(p);
  return { name: path.basename(p), path: p, data: new Uint8Array(data.buffer, data.byteOffset, data.byteLength) };
});
ipcMain.handle('file:write', async (_e, p, data) => {
  // write to a temp file first, then replace, so a crash never leaves a half-written PDF
  const tmp = p + '.pdfeditor-tmp';
  await fs.writeFile(tmp, toBuf(data));
  try { await fs.rename(tmp, p); }
  catch (err) { await fs.copyFile(tmp, p); await fs.unlink(tmp).catch(() => {}); }
  return true;
});
ipcMain.handle('file:save-as', async (_e, suggested, data, opts) => {
  const ext = (path.extname(suggested).slice(1) || 'bin').toLowerCase();
  const avoid = ((opts && opts.avoid) || []).map(p => path.resolve(p).toLowerCase());
  let r;
  for (;;) {
    r = await dialog.showSaveDialog(win, {
      title: '另存新檔', defaultPath: suggested,
      filters: [{ name: ext.toUpperCase() + ' 檔案', extensions: [ext] }, { name: '所有檔案', extensions: ['*'] }],
    });
    if (r.canceled || !r.filePath) return null;
    if (!avoid.includes(path.resolve(r.filePath).toLowerCase())) break;
    // never write over the file that was opened for editing
    await dialog.showMessageBox(win, { type: 'warning', title: '不能覆蓋原檔', message: '不能存回原本的檔案', detail: '修改後的內容一律另存新檔，請換一個檔名或位置。', buttons: ['重新選擇'] });
    suggested = r.filePath.replace(/(\.[^.\\/]+)?$/, '_已編輯$1');
  }
  await fs.writeFile(r.filePath, toBuf(data));
  allowDir(path.dirname(r.filePath));
  return r.filePath;
});
// 轉存 Word with Microsoft Word: Word 2013 and later open a PDF as an editable document (their own conversion). Word is
// found through the registry and run in the background by PowerShell over COM: the PDF opened read-only without the
// conversion question, saved as .docx, Word always closed. The paths go in environment variables (Chinese paths survive);
// the conversion question (DisableConvertPdfWarning) is turned off for the run and put back afterwards. Word writes into a
// temporary folder; the .docx is copied to its place only when it is done.
const { execFile } = require('child_process');
const os = require('os');
const WORD_PS = `$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$in = $env:PDFE_IN; $out = $env:PDFE_OUT
$key = "HKCU:\\Software\\Microsoft\\Office\\$($env:PDFE_WORDVER).0\\Word\\Options"
$had = $null
try { $had = (Get-ItemProperty -Path $key -Name DisableConvertPdfWarning -ErrorAction Stop).DisableConvertPdfWarning } catch { }
try { if (-not (Test-Path $key)) { New-Item -Path $key -Force | Out-Null }; Set-ItemProperty -Path $key -Name DisableConvertPdfWarning -Value 1 -Type DWord } catch { }
$word = $null; $code = 0
try {
  $word = New-Object -ComObject Word.Application
  $word.Visible = $false
  $word.DisplayAlerts = 0
  # FileName, ConfirmConversions, ReadOnly, AddToRecentFiles
  $doc = $word.Documents.Open($in, $false, $true, $false)
  try { $doc.SaveAs2($out, 16) } finally { $doc.Close(0) }
  [Console]::Out.WriteLine('PDFE_OK')
} catch {
  [Console]::Out.WriteLine('PDFE_ERR:' + $_.Exception.Message); $code = 2
} finally {
  if ($word) { try { $word.Quit(0) } catch { }; [void][System.Runtime.InteropServices.Marshal]::ReleaseComObject($word) }
  try { if ($null -eq $had) { Remove-ItemProperty -Path $key -Name DisableConvertPdfWarning -ErrorAction SilentlyContinue } else { Set-ItemProperty -Path $key -Name DisableConvertPdfWarning -Value $had -Type DWord } } catch { }
}
exit $code
`;
const runFile = (file, args, opts = {}) => new Promise(res => { const child = execFile(file, args, { windowsHide: true, encoding: 'utf8', maxBuffer: 4 << 20, ...opts },
  (err, stdout, stderr) => res({ err, stdout: String(stdout || ''), stderr: String(stderr || '') })); if (opts.onChild) opts.onChild(child); });
const wordVersion = async () => {
  if (process.platform !== 'win32') return 0;
  const m = /Word\.Application\.(\d+)/.exec((await runFile('reg', ['query', 'HKCR\\Word.Application\\CurVer', '/ve'])).stdout);
  return m ? +m[1] : 0;
};
// the Word this program started (an /Automation WINWORD.EXE started after `since`): closed when a run is stopped
const killWord = since => runFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command',
  "Get-CimInstance Win32_Process -Filter \"Name='WINWORD.EXE'\" | Where-Object { $_.CommandLine -match 'Automation' -and $_.CreationDate -ge [datetime]::Parse('"
  + since.toISOString() + "') } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }"], { timeout: 20000 });
const wordJobs = new Map();   // id → {child, since, cancelled}
ipcMain.handle('word:detect', async () => { const v = await wordVersion(); return v >= 15 ? { ok: true, version: v } : { ok: false }; });
ipcMain.handle('word:convert', async (_e, id, pdf, out) => {
  const v = await wordVersion();
  if (v < 15) return { ok: false, why: 'word', msg: '這台電腦沒有可以轉換 PDF 的 Word（需要 Word 2013 以後的版本）' };
  if (typeof out !== 'string' || !isAllowed(path.dirname(out))) return { ok: false, why: 'word', msg: '不能存到這個位置' };
  const job = { since: new Date(Date.now() - 3000), cancelled: false, child: null }; wordJobs.set(id, job);
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'pdfe-word-'));
  try {
    const inPdf = path.join(dir, 'in.pdf'), tmpOut = path.join(dir, 'out.docx'), ps1 = path.join(dir, 'convert.ps1');
    await fs.writeFile(inPdf, toBuf(pdf)); await fs.writeFile(ps1, '﻿' + WORD_PS, 'utf8');
    const r = await runFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', ps1],
      { timeout: 10 * 60 * 1000, env: { ...process.env, PDFE_IN: inPdf, PDFE_OUT: tmpOut, PDFE_WORDVER: String(v) }, onChild: c => { job.child = c; } });
    if (job.cancelled) { await killWord(job.since); return { ok: false, why: 'cancel' }; }
    if (r.err && r.err.killed) { await killWord(job.since); return { ok: false, why: 'timeout' }; }
    if (!/PDFE_OK/.test(r.stdout)) { const m = /PDFE_ERR:(.*)/.exec(r.stdout); return { ok: false, why: 'word', msg: (m ? m[1] : r.stderr || (r.err && r.err.message) || '').trim().slice(0, 300) }; }
    await fs.copyFile(tmpOut, out);
    return { ok: true };
  } catch (err) { return { ok: false, why: 'word', msg: String((err && err.message) || err) }; }
  finally { wordJobs.delete(id); fs.rm(dir, { recursive: true, force: true }).catch(() => {}); }
});
ipcMain.handle('word:cancel', (_e, id) => { const j = wordJobs.get(id); if (j) { j.cancelled = true; if (j.child) j.child.kill(); } });
// a place for a new file of another kind (a .docx): the save dialog only, the caller writes there; never the opened PDF
ipcMain.handle('file:choose-save', async (_e, suggested, opts) => {
  const ext = (path.extname(String(suggested)).slice(1) || 'bin').toLowerCase();
  const avoid = ((opts && opts.avoid) || []).map(p => path.resolve(p).toLowerCase());
  for (;;) {
    const r = await dialog.showSaveDialog(win, { title: '另存新檔', defaultPath: suggested,
      filters: [{ name: ext.toUpperCase() + ' 檔案', extensions: [ext] }, { name: '所有檔案', extensions: ['*'] }] });
    if (r.canceled || !r.filePath) return null;
    if (!avoid.includes(path.resolve(r.filePath).toLowerCase())) { allowDir(path.dirname(r.filePath)); return r.filePath; }
    await dialog.showMessageBox(win, { type: 'warning', title: '不能覆蓋原檔', message: '不能存到原本的檔案', detail: '請換一個檔名或位置。' });
  }
});
// open a file this program wrote (a .docx in Word) with the computer's default program
ipcMain.handle('app:open-path', async (_e, p) => (typeof p === 'string' && isAllowed(path.dirname(p)) ? shell.openPath(p) : 'not allowed'));
ipcMain.handle('export:default-dir', (_e, pdfPath, last) => {
  if (last && picked.includes(path.resolve(last))) return path.resolve(last);
  if (pdfPath && isAllowed(path.dirname(pdfPath))) return path.dirname(pdfPath);
  const pics = app.getPath('pictures'); allowDir(pics); return pics;
});
ipcMain.handle('export:choose-dir', async (_e, current) => {
  const r = await dialog.showOpenDialog(win, {
    title: '選擇圖片輸出位置', defaultPath: current || app.getPath('pictures'),
    properties: ['openDirectory', 'createDirectory', 'promptToCreate'],
  });
  if (r.canceled || !r.filePaths.length) return null;
  await rememberPicked(r.filePaths[0]);
  return r.filePaths[0];
});
// resolve final names inside root/sub according to the conflict policy, without writing
ipcMain.handle('export:plan', async (_e, root, sub, names, policy) => {
  if (!isAllowed(root)) throw new Error('不允許寫入這個資料夾');
  const dir = sub ? path.join(root, safeName(sub)) : root;
  const taken = new Set();
  const out = [];
  for (const raw of names) {
    const ext = path.extname(raw), base = safeName(raw.slice(0, raw.length - ext.length)) ;
    let name = base + ext, k = 1, exists = false;
    const existsOnDisk = async nm => fs.access(path.join(dir, nm)).then(() => true, () => false);
    if (policy === 'rename') {
      while (taken.has(name.toLowerCase()) || await existsOnDisk(name)) name = `${base} (${++k})${ext}`;
    } else {
      exists = await existsOnDisk(name);
    }
    taken.add(name.toLowerCase());
    out.push({ name, exists, skip: policy === 'skip' && exists });
  }
  return { dir, files: out };
});
ipcMain.handle('export:write', async (_e, root, sub, name, data) => {
  if (!isAllowed(root)) throw new Error('不允許寫入這個資料夾');
  const dir = sub ? path.join(root, safeName(sub)) : root;
  await fs.mkdir(dir, { recursive: true });
  const full = path.join(dir, safeName(path.basename(name, path.extname(name))) + path.extname(name));
  if (path.dirname(full) !== dir) throw new Error('檔名無效');
  await fs.writeFile(full, toBuf(data));
  return full;
});
ipcMain.handle('export:open-folder', (_e, dir) => { if (isAllowed(dir)) shell.openPath(dir); });
ipcMain.handle('app:info', () => {
  let user = '';
  try { user = require('os').userInfo().username || ''; } catch (_) {}
  return { version: app.getVersion(), dev: isDev, platform: process.platform, user, usedBefore };
});
// 顯示模式: 'system' follows Windows; the title bar, dialogs and prefers-color-scheme all follow themeSource
// 滴管: a snapshot of this window, sampled by the renderer
ipcMain.handle('app:capture', async e => {
  const img = await e.sender.capturePage();
  return img.isEmpty() ? null : img.toDataURL();
});
ipcMain.handle('app:set-theme', (_e, t) => {
  nativeTheme.themeSource = ['system', 'light', 'dark'].includes(t) ? t : 'system';
  if (win && !win.isDestroyed()) win.setBackgroundColor(nativeTheme.shouldUseDarkColors ? '#141416' : '#cfcbc2');
  return nativeTheme.shouldUseDarkColors;
});
ipcMain.handle('app:open-external', (_e, url) => { if (/^(https?:\/\/|mailto:)/i.test(String(url))) shell.openExternal(url); });

/* ---------------- 從網址開啟 ---------------- */
// a PDF downloaded into memory through Chromium's network (redirects, the system's proxy and certificates); the page sees
// the progress and can stop it. Only http / https, at most 500 MB, stopped after 60 s without data; it must start %PDF.
const URL_MAX = 500 * 1024 * 1024, downloads = new Map();
// the file name: the server's (filename*=UTF-8'' first, then filename), else the address's last part; always .pdf
function urlFileName(cd, href) {
  let n = '';
  const star = /filename\*\s*=\s*([^']*)'[^']*'([^;]+)/i.exec(cd || ''), plain = /filename\s*=\s*("([^"]*)"|[^;]+)/i.exec(cd || '');
  try { if (star) n = decodeURIComponent(star[2].trim().replace(/^"|"$/g, '')); } catch (_) {}
  if (!n && plain) { n = (plain[2] != null ? plain[2] : plain[1]).trim(); try { n = Buffer.from(n, 'latin1').toString('utf8'); } catch (_) {} }   // raw UTF-8 bytes come as latin1
  if (!n) { try { n = decodeURIComponent(new URL(href).pathname.split('/').filter(Boolean).pop() || ''); } catch (_) {} }
  n = safeName(path.basename(n || 'download'));
  return /\.pdf$/i.test(n) ? n : n + '.pdf';
}
ipcMain.handle('url:fetch', async (e, id, url) => {
  let u; try { u = new URL(String(url)); } catch (_) { return { ok: false, why: 'bad' }; }
  if (!/^https?:$/.test(u.protocol)) return { ok: false, why: 'bad' };
  const ctl = new AbortController(); downloads.set(id, ctl);
  let idle = null; const wake = () => { clearTimeout(idle); idle = setTimeout(() => ctl.abort('idle'), 60000); };
  try {
    wake();
    const res = await net.fetch(u.href, { signal: ctl.signal, redirect: 'follow' });
    if (!res.ok) return { ok: false, why: 'status', status: res.status };
    const total = +res.headers.get('content-length') || 0;
    if (total > URL_MAX) return { ok: false, why: 'big' };
    const reader = res.body.getReader(), parts = []; let got = 0, last = 0;
    for (;;) {
      const { done, value } = await reader.read(); if (done) break;
      wake(); parts.push(Buffer.from(value)); got += value.length;
      if (got > URL_MAX) { ctl.abort('big'); return { ok: false, why: 'big' }; }
      if (Date.now() - last > 150) { last = Date.now(); if (!e.sender.isDestroyed()) e.sender.send('url:progress', id, got, total); }
    }
    const data = Buffer.concat(parts);
    if (!data.subarray(0, 1024).includes('%PDF')) return { ok: false, why: 'notpdf' };
    return { ok: true, data, name: urlFileName(res.headers.get('content-disposition'), res.url || u.href), url: res.url || u.href };
  } catch (err) {
    const r = ctl.signal.aborted ? String(ctl.signal.reason || 'cancel') : '';
    return { ok: false, why: r === 'idle' ? 'idle' : r === 'big' ? 'big' : r ? 'cancel' : 'net', msg: String((err && err.message) || err) };
  } finally { clearTimeout(idle); downloads.delete(id); }
});
ipcMain.handle('url:cancel', (_e, id) => { const c = downloads.get(id); if (c) c.abort('cancel'); });
ipcMain.handle('app:clipboard-text', () => clipboard.readText());

/* ---------------- 列印 ---------------- */
// the printers (the page lists 「系統預設印表機」 first: Electron does not say which one is the default) and printing this
// window, whose print view (#printRoot) the page has filled with the sides of paper. The end-to-end tests put their own
// printer list and printing in place (global.__pdfePrinters / __pdfePrintHook).
ipcMain.handle('print:printers', async e => {
  const list = global.__pdfePrinters ? await global.__pdfePrinters() : await e.sender.getPrintersAsync();
  return (list || []).map(p => ({ name: p.name, label: p.displayName || p.name }));
});
ipcMain.handle('print:run', (e, o) => new Promise(resolve => {
  const opts = {
    silent: !o.dialog, printBackground: true, deviceName: o.deviceName || undefined, copies: o.copies, collate: o.collate,
    duplexMode: o.duplexMode, color: o.color, landscape: o.landscape, pageSize: o.pageSize, margins: { marginType: 'none' },
  };
  const done = (ok, why) => resolve({ ok: !!ok, why: why || '' });
  try { (global.__pdfePrintHook || ((wc, op, cb) => wc.print(op, cb)))(e.sender, opts, done); }
  catch (err) { done(false, String((err && err.message) || err)); }
}));

/* ---------------- auto update ---------------- */
let updater = null;
let updateState = { state: 'idle' };
// electron-updater finds no notes in these releases' latest.yml: the release page's text (the same version) instead
let latestRelease = null;
function setUpdate(s) {
  if ((s.state === 'available' || s.state === 'ready') && !s.notes && latestRelease && String(latestRelease.tag_name || '').replace(/^v/, '') === s.version)
    s = { ...s, notes: notesText(latestRelease.body) };
  updateState = s; send('update', s);
}

// updates come from the Forgejo server named in package.json (updateServer); without it the
// built-in app-update.yml is used. The newest release is looked up through the Forgejo API and
// the updater is pointed at that release's download folder (latest.yml + installer).
const UPD = require('./package.json').updateServer || null;
async function pointFeed() {
  if (!UPD) return;
  const r = await net.fetch(`${UPD.host}/api/v1/repos/${UPD.repo}/releases/latest`, { headers: { Accept: 'application/json' } });
  if (r.status === 404) throw new Error('更新伺服器上還沒有任何版本');
  if (!r.ok) throw new Error(`無法連線到更新伺服器（${r.status}）`);
  const j = await r.json();
  latestRelease = j;
  updater.setFeedURL({ provider: 'generic', url: `${UPD.host}/${UPD.repo}/releases/download/${encodeURIComponent(j.tag_name)}` });
}
async function checkNow() { await pointFeed(); return updater.checkForUpdates(); }
const quietCheck = () => checkNow().catch(e => { if (updateState.state === 'checking' || updateState.state === 'idle') setUpdate({ state: 'error', message: String(e.message || e).split('\n')[0] }); });

function initUpdater() {
  if (isDev) return;
  try { ({ autoUpdater: updater } = require('electron-updater')); } catch (e) { console.error(e); return; }
  updater.autoDownload = true;
  updater.autoInstallOnAppQuit = true;
  updater.allowPrerelease = false;
  updater.on('checking-for-update', () => setUpdate({ state: 'checking' }));
  updater.on('update-available', info => setUpdate({ state: 'available', version: info.version, notes: notesText(info.releaseNotes), date: info.releaseDate }));
  updater.on('update-not-available', info => setUpdate({ state: 'latest', version: info.version }));
  updater.on('download-progress', p => setUpdate({ ...updateState, state: 'downloading', percent: Math.round(p.percent), bps: p.bytesPerSecond }));
  updater.on('update-downloaded', info => setUpdate({ state: 'ready', version: info.version, notes: notesText(info.releaseNotes) }));
  updater.on('error', err => setUpdate({ state: 'error', message: String(err && err.message || err).split('\n')[0] }));
  // check shortly after start, then every 4 hours
  setTimeout(quietCheck, 4000);
  setInterval(quietCheck, 4 * 3600 * 1000);
}
function notesText(n) {
  if (!n) return '';
  const s = Array.isArray(n) ? n.map(x => x.note || '').join('\n') : String(n);
  return s.replace(/<br\s*\/?>/gi, '\n').replace(/<\/(p|li|h\d)>/gi, '\n').replace(/<li>/gi, '• ').replace(/<[^>]+>/g, '').replace(/\n{3,}/g, '\n\n').trim();
}
ipcMain.handle('update:state', () => (isDev ? { state: 'dev' } : updateState));
ipcMain.handle('update:check', async () => {
  if (isDev) return { state: 'dev' };
  if (!updater) return { state: 'error', message: '更新模組無法載入' };
  if (['checking', 'downloading', 'ready'].includes(updateState.state)) return updateState;
  try {
    const r = await checkNow();
    if (!r) setUpdate({ state: 'unsupported' });   // updater inactive for this install type
  } catch (e) { setUpdate({ state: 'error', message: String(e.message || e).split('\n')[0] }); }
  return updateState;
});
ipcMain.handle('update:install', () => {
  if (updater && updateState.state === 'ready') setImmediate(() => updater.quitAndInstall(false, true));
  return true;
});

/* ---------------- app lifecycle ---------------- */
app.whenReady().then(async () => {
  await loadPicked();
  const root = __dirname;
  protocol.handle('app', req => {
    const { host, pathname } = new URL(req.url);
    if (host !== 'bundle') return new Response('not found', { status: 404 });
    const rel = decodeURIComponent(pathname);
    const full = path.normalize(path.join(root, rel));
    if (!full.startsWith(root)) return new Response('forbidden', { status: 403 });
    return net.fetch(pathToFileURL(full).toString());
  });
  createWindow();
  initUpdater();
});
app.on('open-file', (e, p) => { e.preventDefault(); queueOpen(p); });   // macOS
app.on('window-all-closed', () => app.quit());
