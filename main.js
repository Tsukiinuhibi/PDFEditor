'use strict';
/*
 * PDF 工作台 — Electron main process
 *  - serves the renderer from a private app:// origin (so fetch, workers and cMaps behave like a website)
 *  - native open / save / write-back-to-original through IPC
 *  - "open with" (.pdf file association) and single-instance handling
 *  - automatic updates from GitHub Releases (electron-updater)
 */
const { app, BrowserWindow, ipcMain, dialog, protocol, net, shell, Menu } = require('electron');
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
    title: '開啟 PDF', properties: ['openFile'],
    filters: [{ name: 'PDF 文件', extensions: ['pdf'] }, { name: '所有檔案', extensions: ['*'] }],
  });
  return r.canceled || !r.filePaths.length ? null : r.filePaths[0];
});
ipcMain.handle('file:read', async (_e, p) => {
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
ipcMain.handle('file:save-as', async (_e, suggested, data) => {
  const ext = (path.extname(suggested).slice(1) || 'bin').toLowerCase();
  const r = await dialog.showSaveDialog(win, {
    title: '另存新檔', defaultPath: suggested,
    filters: [{ name: ext.toUpperCase() + ' 檔案', extensions: [ext] }, { name: '所有檔案', extensions: ['*'] }],
  });
  if (r.canceled || !r.filePath) return null;
  await fs.writeFile(r.filePath, toBuf(data));
  return r.filePath;
});
ipcMain.handle('app:info', () => ({ version: app.getVersion(), dev: isDev, platform: process.platform }));
ipcMain.handle('app:open-external', (_e, url) => { if (/^https:\/\//i.test(url)) shell.openExternal(url); });

/* ---------------- auto update ---------------- */
let updater = null;
let updateState = { state: 'idle' };
function setUpdate(s) { updateState = s; send('update', s); }

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
  setTimeout(() => updater.checkForUpdates().catch(() => {}), 4000);
  setInterval(() => updater.checkForUpdates().catch(() => {}), 4 * 3600 * 1000);
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
    const r = await updater.checkForUpdates();
    if (!r) setUpdate({ state: 'unsupported' });   // updater inactive for this install type
  } catch (e) { setUpdate({ state: 'error', message: String(e.message || e).split('\n')[0] }); }
  return updateState;
});
ipcMain.handle('update:install', () => {
  if (updater && updateState.state === 'ready') setImmediate(() => updater.quitAndInstall(false, true));
  return true;
});

/* ---------------- app lifecycle ---------------- */
app.whenReady().then(() => {
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
