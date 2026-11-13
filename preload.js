'use strict';
// Narrow bridge between the page and the main process. The page never gets Node access.
const { contextBridge, ipcRenderer, webUtils } = require('electron');

contextBridge.exposeInMainWorld('desktop', {
  ready: () => ipcRenderer.invoke('renderer-ready'),
  info: () => ipcRenderer.invoke('app:info'),
  openDialog: () => ipcRenderer.invoke('file:open-dialog'),
  readFile: p => ipcRenderer.invoke('file:read', p),
  writeFile: (p, data) => ipcRenderer.invoke('file:write', p, data),
  saveAs: (name, data, opts) => ipcRenderer.invoke('file:save-as', name, data, opts),
  pathForFile: f => { try { return webUtils.getPathForFile(f) || ''; } catch (_) { return ''; } },
  openExternal: url => ipcRenderer.invoke('app:open-external', url),
  setTheme: t => ipcRenderer.invoke('app:set-theme', t),
  capture: () => ipcRenderer.invoke('app:capture'),
  exportImages: {
    defaultDir: (pdfPath, last) => ipcRenderer.invoke('export:default-dir', pdfPath, last),
    chooseDir: current => ipcRenderer.invoke('export:choose-dir', current),
    plan: (root, sub, names, policy) => ipcRenderer.invoke('export:plan', root, sub, names, policy),
    write: (root, sub, name, data) => ipcRenderer.invoke('export:write', root, sub, name, data),
    openFolder: dir => ipcRenderer.invoke('export:open-folder', dir),
  },
  print: {
    printers: () => ipcRenderer.invoke('print:printers'),
    run: opts => ipcRenderer.invoke('print:run', opts),
  },
  onOpenPath: cb => ipcRenderer.on('open-path', (_e, p) => cb(p)),
  onAppCommand: cb => ipcRenderer.on('app-command', (_e, c) => cb(c)),
  update: {
    state: () => ipcRenderer.invoke('update:state'),
    check: () => ipcRenderer.invoke('update:check'),
    install: () => ipcRenderer.invoke('update:install'),
    on: cb => ipcRenderer.on('update', (_e, s) => cb(s)),
  },
});
