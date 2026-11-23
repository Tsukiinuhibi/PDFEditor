// 開啟 Word 檔: a Word file (from 開啟, dropped in, or given to the program) is turned into a PDF by Word and opens in a new
// tab as that PDF (named .pdf; saved as a new file next to the Word file; the Word file is never written). Linux has no
// Word: the real handler says so; then the main process's word:open is replaced here by a fake Word.
import { launch, ROOT, TMP } from './_env.mjs';
import { _electron as electron } from 'playwright-core';
import { createRequire } from 'module';
import { PDFDocument } from 'pdf-lib';
import fs from 'fs';
import path from 'path';

let failed = 0;
const check = (name, ok, detail = '') => { console.log(`${ok ? '✔' : '✘'} ${name}${detail !== '' ? '  ' + (typeof detail === 'string' ? detail : JSON.stringify(detail)) : ''}`); if (!ok) { failed++; process.exitCode = 1; } };

const { app } = await launch('first.pdf');
const win = await app.firstWindow(); win.on('pageerror', e => console.log('PAGEERR', e.message)); win.on('console', m => { if (m.type() === 'error') console.log('C', m.text().slice(0, 300)); });
await win.waitForFunction(() => !!(window.__pdfapp && window.__pdfapp.S.pages.length), null, {timeout:30000});
await win.waitForTimeout(1500);
const Ev = win.evaluate.bind(win);
const send = p => app.evaluate(({BrowserWindow}, p) => BrowserWindow.getAllWindows()[0].webContents.send('open-path', p), p);
const toasts = () => Ev(() => [...document.querySelectorAll('.toast')].map(t => t.textContent));
const tabs = () => Ev(() => [...document.querySelectorAll('.dtab .nm')].map(t => t.textContent));
const docx = path.join(TMP, '會議 紀錄.docx'); fs.writeFileSync(docx, 'PK not really a word file');
const before = fs.readFileSync(docx);

// ---- the real handler, without Word: said plainly -------------------------------------------------------------------
await send(docx); await win.waitForTimeout(2500);
{ const t = await toasts(); check('no Word on this computer: says Microsoft Word is needed; no new tab', t.some(x => /Microsoft Word/.test(x)) && (await tabs()).length === 1, {t, tabs:await tabs()}); }

// ---- a fake Word in the main process --------------------------------------------------------------------------------
const mk = await PDFDocument.create(); mk.addPage([400, 300]); mk.addPage([400, 300]);
const PDF64 = Buffer.from(await mk.save()).toString('base64');
await app.evaluate(({ipcMain}, PDF64) => {
  global.__w = {calls:[], cancelled:[]};
  ipcMain.removeHandler('word:open'); ipcMain.handle('word:open', async (_e, id, p) => {
    global.__w.calls.push({id, p});
    if (/slow/.test(p)) { await new Promise(r => { global.__w.release = r; }); return global.__w.cancelled.includes(id) ? {ok:false, why:'cancel'} : {ok:true, data:Buffer.from(PDF64, 'base64')}; }
    if (/twin-a/.test(p)) await new Promise(r => setTimeout(r, 1500));   // (a slower one: the next arrives meanwhile)
    if (/bad/.test(p)) return {ok:false, why:'word', msg:'測試用的錯誤'};
    if (/locked/.test(p)) return {ok:false, why:'password', msg:'「locked.docx」有密碼保護，請先在 Word 裡移除密碼再開啟'};
    return {ok:true, data:Buffer.from(PDF64, 'base64')};
  });
  ipcMain.removeHandler('word:cancel'); ipcMain.handle('word:cancel', (_e, id) => { global.__w.cancelled.push(id); if (global.__w.release) global.__w.release(); });
}, PDF64);
const W = () => app.evaluate(() => ({calls:global.__w.calls, cancelled:global.__w.cancelled}));

await send(docx); await win.waitForTimeout(3000);
{ const st = await Ev(() => ({n:window.__pdfapp.S.pages.length, name:window.__pdfapp.S.name, path:window.__pdfapp.S.handle && window.__pdfapp.S.handle.path, dirty:window.__pdfapp.S.dirty})), t = await tabs();
  check('a Word file: Word is asked to turn it into a PDF (the file\'s own path)', (await W()).calls.some(c => c.p === docx), await W());
  check('it opens in a new tab as a PDF named after it (會議 紀錄.pdf), with its pages', t.length === 2 && t.includes('會議 紀錄.pdf') && st.n === 2 && st.name === '會議 紀錄.pdf', {t, st});
  check('the tab remembers the Word file (saved as a new PDF next to it)', st.path === docx, st);
  check('the Word file is not touched, nothing is written next to it', fs.readFileSync(docx).equals(before) && !fs.existsSync(docx.replace(/\.docx$/, '.pdf')));
  const tt = await toasts(); check('said: opened with Word', tt.some(x => /Word/.test(x) && /會議 紀錄/.test(x)), tt); }

// the same Word file again: its tab, not another conversion
{ const n0 = (await W()).calls.length; await Ev(() => document.querySelectorAll('.dtab')[0].click()); await win.waitForTimeout(800);
  await send(docx); await win.waitForTimeout(1500);
  check('the same Word file again: switches to its tab, Word not asked again', (await tabs()).length === 2 && (await W()).calls.length === n0 && await Ev(() => window.__pdfapp.S.name) === '會議 紀錄.pdf', {tabs:await tabs(), calls:(await W()).calls.length}); }

// a slow conversion: a window says what is going on; 〔取消〕 stops Word, nothing opens
await send(path.join(TMP, 'slow.docx')); await win.waitForTimeout(1200);
{ const m = await Ev(() => document.querySelector('#mask').classList.contains('show') ? document.querySelector('#modal').textContent : null);
  check('while Word works: a window says so (with 取消)', !!m && /Word/.test(m) && /slow\.docx/.test(m) && /取消/.test(m), m);
  await Ev(() => [...document.querySelectorAll('#modal .mf button')].find(b => b.textContent.includes('取消')).click()); await win.waitForTimeout(1500);
  const w = await W(), id = w.calls.find(c => /slow/.test(c.p)).id;
  check('〔取消〕: Word is stopped (that conversion), the window closes, no new tab', w.cancelled.includes(id) && (await tabs()).length === 2 && !(await Ev(() => document.querySelector('#mask').classList.contains('show'))), {w, tabs:await tabs()}); }

// Word fails / a file with a password: said, no new tab
await send(path.join(TMP, 'bad.docx')); await win.waitForTimeout(2000);
{ const t = await toasts(); check('Word fails: its message is shown, no new tab', t.some(x => /測試用的錯誤/.test(x)) && (await tabs()).length === 2, t); }
await send(path.join(TMP, 'locked.docx')); await win.waitForTimeout(2000);
{ const t = await toasts(); check('a file with a password: said so, no new tab', t.some(x => /密碼保護/.test(x)) && (await tabs()).length === 2, t); }

// given to the program (a second start, as 「開啟檔案」 from Explorer): the running window opens it
const other = path.join(TMP, '第二份.docx'); fs.writeFileSync(other, 'PK');
const require = createRequire(import.meta.url);
try { const a2 = await electron.launch({executablePath:require('electron'), args:[...(process.platform === 'linux' ? ['--no-sandbox'] : []), ROOT, other], env:{...process.env, PDFE_USER_DATA:path.join(TMP, 'profile')}, timeout:15000}); await a2.close().catch(() => {}); } catch (_) {}
await win.waitForTimeout(3000);
check('a Word file given to the program: the running window opens it', (await W()).calls.some(c => c.p === other) && (await tabs()).includes('第二份.pdf'), {calls:(await W()).calls.map(c => c.p), tabs:await tabs()});

// ---- (review) ------------------------------------------------------------------------------------------------------
await app.evaluate(({ipcMain}) => {
  ipcMain.removeHandler('word:zone'); ipcMain.handle('word:zone', (_e, p) => /web/.test(p) ? 3 : 0);
  global.__saveAsked = null; ipcMain.removeHandler('file:choose-save'); ipcMain.handle('file:choose-save', (_e, suggested) => { global.__saveAsked = suggested; return null; });
});
// two Word files given at once: one after the other, both open
{ const a = path.join(TMP, 'twin-a.docx'), b = path.join(TMP, 'twin-b.docx'); await send(a); await send(b); await win.waitForTimeout(5000);
  const t = await tabs(); check('(review) two Word files given at once: both open, one after the other', t.includes('twin-a.pdf') && t.includes('twin-b.pdf'), t); }
// a window already open (設定) when a Word file arrives: it stays; the Word file waits for it
{ await Ev(() => { window.__pdfapp.actions.settings(); }); await win.waitForTimeout(800);
  const title0 = await Ev(() => document.querySelector('#modal .mh').textContent);
  await send(path.join(TMP, 'later.docx')); await win.waitForTimeout(1500);
  const title1 = await Ev(() => document.querySelector('#mask').classList.contains('show') ? document.querySelector('#modal .mh').textContent : null);
  check('(review) a window open when a Word file arrives: it stays (not replaced)', title1 === title0 && !(await tabs()).includes('later.pdf'), {title0, title1});
  await win.keyboard.press('Escape'); await win.waitForTimeout(400); await Ev(() => { if (document.querySelector('#mask').classList.contains('show')) document.querySelector('#modal .mf button').click(); });
  await win.waitForTimeout(3500);
  check('(review) …then the Word file opens', (await tabs()).includes('later.pdf'), await tabs()); }
// a Word file from the internet: asked first; 取消 → Word not asked
{ const web = path.join(TMP, 'web-file.docx'); const n0 = (await W()).calls.length;
  await send(web); await win.waitForTimeout(1500);
  const m = await Ev(() => document.querySelector('#mask').classList.contains('show') ? document.querySelector('#modal').textContent : null);
  check('(review) a Word file from the internet: asked first (保護的檢視)', !!m && /網路/.test(m) && /保護的檢視/.test(m), m);
  await Ev(() => [...document.querySelectorAll('#modal .mf button')].find(b => b.textContent.includes('取消')).click()); await win.waitForTimeout(1200);
  check('(review) …取消: Word is not asked, nothing opens', (await W()).calls.length === n0 && !(await tabs()).includes('web-file.pdf'), {calls:(await W()).calls.length, n0});
  await send(web); await win.waitForTimeout(1500);
  await Ev(() => [...document.querySelectorAll('#modal .mf button')].find(b => b.textContent.trim() === '開啟').click()); await win.waitForTimeout(3000);
  check('(review) …開啟: it opens', (await tabs()).includes('web-file.pdf'), await tabs()); }
// a Word file dropped that is not on the disk (from a mail): said, not read as a PDF
{ await Ev(() => { const dt = new DataTransfer(); dt.items.add(new File(['PK'], '郵件附件.docx')); window.dispatchEvent(new DragEvent('drop', {dataTransfer:dt, bubbles:true, cancelable:true})); }); await win.waitForTimeout(1500);
  const t = await toasts(); check('(review) a Word file dropped from a mail (no path): asked to save it first, not read as a PDF', t.some(x => /存到電腦/.test(x)) && !t.some(x => /Invalid PDF/.test(x)), t); }
// 轉存 Word in a tab opened from X.docx: not suggested as X.docx (the original)
{ const k = (await tabs()).indexOf('會議 紀錄.pdf'); await Ev(k => document.querySelectorAll('.dtab')[k].click(), k); await win.waitForTimeout(1000);
  await Ev(() => { window.__pdfapp.actions.exportWord(); }); await win.waitForTimeout(1500);
  await Ev(() => { const h = document.querySelector('#wdHow'); if (h) { h.value = 'builtin'; h.dispatchEvent(new Event('change', {bubbles:true})); } }); await win.waitForTimeout(300);
  await Ev(() => document.querySelector('#wdGo').click()); await win.waitForTimeout(1500);
  const asked = await app.evaluate(() => global.__saveAsked);
  check('(review) 轉存 Word from a tab opened from 會議 紀錄.docx: suggested 會議 紀錄_轉存.docx, not the original name', !!asked && /會議 紀錄_轉存\.docx$/.test(asked), asked);
  await win.keyboard.press('Escape'); await win.waitForTimeout(400); }

console.log(failed ? `\n${failed} check(s) failed` : '\nall checks passed');
await app.evaluate(({app}) => app.exit(0)).catch(() => {});
