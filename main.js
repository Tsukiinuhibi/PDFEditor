'use strict';
/*
 * PDF 工作台 — Electron main process
 *  - serves the renderer from a private app:// origin (so fetch, workers and cMaps behave like a website)
 *  - native open / save / write-back-to-original through IPC
 *  - "open with" (.pdf file association) and single-instance handling
 *  - automatic updates from GitHub Releases (electron-updater)
 */
const { app, BrowserWindow, ipcMain, dialog, protocol, net, shell, Menu, nativeTheme } = require('electron');
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
  return { version: app.getVersion(), dev: isDev, platform: process.platform, user };
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
ipcMain.handle('app:open-external', (_e, url) => { if (/^https:\/\//i.test(url)) shell.openExternal(url); });

/* ---------------- auto update ---------------- */
let updater = null;
let updateState = { state: 'idle' };
function setUpdate(s) { updateState = s; send('update', s); }

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
