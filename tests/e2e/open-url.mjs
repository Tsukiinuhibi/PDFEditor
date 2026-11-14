// 從網址開啟: a PDF is downloaded by its web address (pasted in a small window, or a link dragged in from a browser) and
// opened in a new tab; pages that are not PDFs, missing files and stopped downloads open nothing. A local web server
// stands in for the internet.
import { launch, ROOT } from './_env.mjs';
import http from 'http';
import fs from 'fs';
import path from 'path';

let failed = 0;
const check = (name, ok, detail = '') => { console.log(`${ok ? '✔' : '✘'} ${name}${detail !== '' ? '  ' + (typeof detail === 'string' ? detail : JSON.stringify(detail)) : ''}`); if (!ok) { failed++; process.exitCode = 1; } };

const PDF = fs.readFileSync(path.join(ROOT, 'tests', 'e2e', 'fixtures', 'sample.pdf'));
const slow = new Set(), held = new Set();
const server = http.createServer((req, res) => {
  const u = req.url;
  if (u === '/files/a.pdf' || u === '/noext') { res.writeHead(200, {'Content-Type':'application/pdf', 'Content-Length':PDF.length}); res.end(PDF); return; }
  if (u === '/r') { res.writeHead(302, {Location:'/dl'}); res.end(); return; }
  if (u === '/dl') {   // chunked (no Content-Length), a Chinese file name
    res.writeHead(200, {'Content-Type':'application/octet-stream', 'Content-Disposition':`attachment; filename="report.pdf"; filename*=UTF-8''${encodeURIComponent('報告.pdf')}`});
    res.write(PDF.subarray(0, 1000)); setTimeout(() => res.end(PDF.subarray(1000)), 200); return;
  }
  if (u === '/raw') {   // the name as raw UTF-8 bytes in filename="…" (Node writes a header string's characters as single bytes)
    res.writeHead(200, {'Content-Type':'application/pdf', 'Content-Disposition':Buffer.from('attachment; filename="報告.pdf"').toString('latin1')}); res.end(PDF); return;
  }
  if (u === '/bad') { res.writeHead(200, {'Content-Type':'application/pdf', 'Content-Disposition':`attachment; filename*=UTF-8''${encodeURIComponent('a/b?c*.pdf')}`}); res.end(PDF); return; }
  if (u === '/files/' + encodeURIComponent('報告2.pdf')) { res.writeHead(200, {'Content-Type':'application/pdf'}); res.end(PDF); return; }
  // (v1.0.48) names in Latin-1 and in Big5 bytes, a name that is only dots, a sign-in page, an error with a long body, a locked PDF
  if (u === '/latin1') { res.writeHead(200, {'Content-Type':'application/pdf', 'Content-Disposition':'attachment; filename="r\u00e9sum\u00e9.pdf"'}); res.end(PDF); return; }
  if (u === '/big5') { res.writeHead(200, {'Content-Type':'application/pdf', 'Content-Disposition':'attachment; filename="' + Buffer.from('b3f8a769aed12e706466', 'hex').toString('latin1') + '"'}); res.end(PDF); return; }
  if (u === '/named/fallback.pdf') { res.writeHead(200, {'Content-Type':'application/pdf', 'Content-Disposition':'attachment; filename="..."'}); res.end(PDF); return; }
  // (fix pass) a name with nothing before .pdf; a percent-encoded name; an RFC 2047 name
  if (u === '/stem') { res.writeHead(200, {'Content-Type':'application/pdf', 'Content-Disposition':'attachment; filename=".pdf"'}); res.end(PDF); return; }
  if (u === '/pct') { res.writeHead(200, {'Content-Type':'application/pdf', 'Content-Disposition':'attachment; filename="%E4%B8%AD%E6%96%87.pdf"'}); res.end(PDF); return; }
  if (u === '/b64') { res.writeHead(200, {'Content-Type':'application/pdf', 'Content-Disposition':'attachment; filename="=?UTF-8?B?' + Buffer.from('中文2.pdf').toString('base64') + '?="'}); res.end(PDF); return; }
  if (u === '/401') { res.writeHead(401, {'Content-Type':'text/plain'}); res.end('sign in'); return; }
  if (u === '/404big' || u === '/huge2.pdf') {
    held.add(res); res.writeHead(u === '/404big' ? 404 : 200, {'Content-Type':'application/pdf', 'Content-Length':u === '/404big' ? 50 * 1024 * 1024 : 600 * 1024 * 1024});
    res.write(Buffer.alloc(4096, 32)); req.on('close', () => held.delete(res)); return;
  }
  if (u === '/locked.pdf') { const b = fs.readFileSync(path.join(ROOT, 'tests', 'e2e', 'fixtures', 'encrypted', 'r6-userpw.pdf')); res.writeHead(200, {'Content-Type':'application/pdf', 'Content-Length':b.length}); res.end(b); return; }
  if (u === '/page.pdf') { res.writeHead(200, {'Content-Type':'text/html'}); res.end('<!doctype html><html><body>Please sign in</body></html>'); return; }
  if (u === '/huge.pdf') { slow.add(res); res.writeHead(200, {'Content-Type':'application/pdf', 'Content-Length':600 * 1024 * 1024}); res.write(PDF.subarray(0, 1024)); req.on('close', () => slow.delete(res)); return; }
  if (u === '/slow.pdf') { slow.add(res); res.writeHead(200, {'Content-Type':'application/pdf', 'Content-Length':PDF.length * 50}); res.write(PDF.subarray(0, 4096)); req.on('close', () => slow.delete(res)); return; }
  res.writeHead(404, {'Content-Type':'text/plain'}); res.end('not here');
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const BASE = `http://127.0.0.1:${server.address().port}`;

const { app } = await launch('u.pdf');
const win = await app.firstWindow(); win.on('pageerror', e => console.log('PAGEERR', e.message)); win.on('console', m => { if (m.type() === 'error') console.log('C', m.text().slice(0, 300)); });
await win.waitForTimeout(3000);
await win.waitForFunction(() => !!(window.__pdfapp && window.__pdfapp.S.pages.length), null, {timeout:30000});
const Ev = win.evaluate.bind(win);
const tabs = () => Ev(() => [...document.querySelectorAll('.dtab .nm')].map(n => n.textContent));
const dlg = () => Ev(() => ({open:!!document.querySelector('#urlIn') && document.querySelector('#mask').classList.contains('show'), err:(document.querySelector('#urlErr') || {}).textContent || '',
  st:(document.querySelector('#urlSt') || {}).textContent || '', go:!!(document.querySelector('#urlGo') || {}).disabled, val:(document.querySelector('#urlIn') || {}).value || ''}));
const fill = async u => { await Ev(u => { const i = document.querySelector('#urlIn'); i.value = u; i.dispatchEvent(new Event('input', {bubbles:true})); }, u); await win.waitForTimeout(200); };
const go = async (ms = 3000) => { await win.click('#urlGo'); await win.waitForTimeout(ms); };
const nPages = () => Ev(() => window.__pdfapp.S.pages.length);
const pages0 = await nPages();
const clip0 = await app.evaluate(({clipboard}) => clipboard.readText());

// ---- part 1: the window -------------------------------------------------------------------------------------------------
await app.evaluate(({clipboard}, u) => clipboard.writeText(u), `${BASE}/files/a.pdf`);
await win.keyboard.press('Control+Shift+O'); await win.waitForTimeout(800);
let d = await dlg();
check('Ctrl+Shift+O: 「從網址開啟」, the address on the clipboard already filled in', d.open && d.val === `${BASE}/files/a.pdf`, d);
await go();
let t = await tabs();
check('a.pdf: opened in a new tab named a.pdf, with all its pages', t.length === 2 && t[1] === 'a.pdf' && (await nPages()) === pages0 && !(await dlg()).open, {t, pages:await nPages()});
await win.keyboard.press('Control+Shift+O'); await win.waitForTimeout(600);
await fill(`${BASE}/r`); await go();
await win.keyboard.press('Control+Shift+O'); await win.waitForTimeout(600);
await fill(`${BASE}/noext`); await go();
t = await tabs();
check('moved on to another address and named by the server (報告.pdf); an address without .pdf: noext.pdf', t[2] === '報告.pdf' && t[3] === 'noext.pdf', t);
await win.keyboard.press('Control+Shift+O'); await win.waitForTimeout(600);
await fill(`${BASE}/page.pdf`); await go();
d = await dlg();
const t1 = await tabs();
await fill(`${BASE}/missing`); await go();
const d404 = await dlg();
await fill('ftp://example.com/a.pdf');
const dftp = await dlg();
check('a web page: 「不是 PDF 檔」, nothing opened, the window stays; 404: 「找不到這個檔案（404）」; ftp://: a red line, 〔開啟〕 off',
  d.open && d.err.includes('不是 PDF 檔') && t1.length === 4 && d404.err.includes('找不到這個檔案（404）') && dftp.err.includes('http:// 或 https://') && dftp.go, {d, d404, dftp});
await fill(`${BASE}/slow.pdf`); await win.click('#urlGo'); await win.waitForTimeout(1500);
const during = await dlg();
await win.click('#urlCancel'); await win.waitForTimeout(1500);
const stopped = await dlg();
check('a slow download: 「下載中…」, 〔取消〕 stops it, nothing opened, the window stays', during.st.includes('下載中') && stopped.open && !stopped.st && (await tabs()).length === 4 && !slow.size, {during, stopped, slow:slow.size});
await win.click('#urlGo'); await win.waitForTimeout(1200);
await win.keyboard.press('Escape'); await win.waitForTimeout(2500);
check('the window closed during a download: the download stops, nothing opens later', !(await dlg()).open && (await tabs()).length === 4 && !slow.size, {tabs:await tabs(), slow:slow.size});

// ---- part 2: a link dropped on the window ---------------------------------------------------------------------------------
const drop = u => Ev(u => { const dt = new DataTransfer(); dt.setData('text/uri-list', u); window.dispatchEvent(new DragEvent('drop', {dataTransfer:dt, bubbles:true, cancelable:true})); }, u);
await drop(`${BASE}/files/a.pdf`); await win.waitForTimeout(3500);
t = await tabs();
check('a link dropped on the window: downloaded and opened (a.pdf)', t.length === 5 && t[4] === 'a.pdf' && !(await dlg()).open, t);
await drop(`${BASE}/page.pdf`); await win.waitForTimeout(3000);
d = await dlg();
check('a link to a web page: the window says it is not a PDF, nothing opened', d.open && d.err.includes('不是 PDF 檔') && (await tabs()).length === 5, d);
await win.click('#urlCancel'); await win.waitForTimeout(400);

// ---- part 3 (final review): file names; a link dropped while a download runs or over another window -----------------------
for (const u of ['/raw', '/bad', '/files/' + encodeURIComponent('報告2.pdf')]) { await win.keyboard.press('Control+Shift+O'); await win.waitForTimeout(600); await fill(BASE + u); await go(); }
t = await tabs();
check('names: raw UTF-8 filename="報告.pdf" → 報告.pdf; a/b?c*.pdf → b_c_.pdf; %E5… in the address → 報告2.pdf', JSON.stringify(t.slice(-3)) === JSON.stringify(['報告.pdf', 'b_c_.pdf', '報告2.pdf']), t);
const nTabs = t.length;
await win.keyboard.press('Control+Shift+O'); await win.waitForTimeout(600);
await fill(`${BASE}/huge.pdf`); await go(1500);
const big = await dlg();
check('a file over 500 MB (by its Content-Length): 「檔案太大（超過 500 MB）」, nothing opened', big.open && big.err.includes('檔案太大') && (await tabs()).length === nTabs, big);
await win.keyboard.press('Escape'); await win.waitForTimeout(500);
await win.keyboard.press('Control+Shift+O'); await win.waitForTimeout(600);
await fill(`${BASE}/slow.pdf`); await win.click('#urlGo'); await win.waitForTimeout(1200);
await drop(`${BASE}/files/a.pdf`); await win.waitForTimeout(2500);
const mid = await dlg();
check('a link dropped while a download runs: left alone (the window still shows that download), nothing opened', mid.open && mid.val.endsWith('/slow.pdf') && mid.st.includes('下載中') && (await tabs()).length === nTabs, {mid, tabs:(await tabs()).length});
await win.click('#urlCancel'); await win.waitForTimeout(1200); await win.click('#urlCancel'); await win.waitForTimeout(500);
await Ev(() => { window.__pdfapp.actions.settings(); }); await win.waitForTimeout(800);   // (its promise ends when the window closes)
const title0 = await Ev(() => document.querySelector('#modal .mh').textContent);
await drop(`${BASE}/files/a.pdf`); await win.waitForTimeout(2500);
const over = await Ev(() => ({title:document.querySelector('#modal .mh').textContent, shown:document.querySelector('#mask').classList.contains('show')}));
check('a link dropped over another window (設定): that window stays, nothing downloaded or opened', over.shown && over.title === title0 && !title0.includes('從網址開啟') && (await tabs()).length === nTabs, {title0, over});
await win.keyboard.press('Escape'); await win.waitForTimeout(500);

// ---- part 4 (v1.0.48): names, messages, a window opened again at once, the clipboard, a locked PDF, a clashing shortcut ---------
const toasts = () => Ev(() => [...document.querySelectorAll('#toasts .toast')].map(t => t.textContent));
const openUrl = async u => { await win.keyboard.press('Control+Shift+O'); await win.waitForTimeout(600); await fill(u); };
for (const u of ['/latin1', '/big5', '/named/fallback.pdf']) { await openUrl(BASE + u); await go(); }
t = await tabs();
// (Chromium decodes the header as UTF-8: Latin-1 or Big5 bytes arrive as U+FFFD, their bytes lost — the address's own name then)
check('names: Latin-1 or Big5 bytes (lost to U+FFFD on the way) → the address\'s own name, no mojibake; a name of only dots → the address\'s own (fallback.pdf)', JSON.stringify(t.slice(-3)) === JSON.stringify(['latin1.pdf', 'big5.pdf', 'fallback.pdf']), t.slice(-3));
for (const u of ['/stem', '/pct', '/b64']) { await openUrl(BASE + u); await go(); }
const tNames2 = (await tabs()).slice(-3);
check('(fix pass) names: nothing before .pdf → the address\'s own (stem.pdf); percent-encoded → 中文.pdf; RFC 2047 =?UTF-8?B?…?= → 中文2.pdf', JSON.stringify(tNames2) === JSON.stringify(['stem.pdf', '中文.pdf', '中文2.pdf']), tNames2);
const why5 = await Ev(() => ['ERR_BLOCKED_BY_ADMINISTRATOR', 'ERR_NETWORK_CHANGED', 'ERR_HTTP2_PROTOCOL_ERROR'].map(code => window.__pdfapp.urlWhy({why:'net', code})));
check('(fix pass) messages: blocked → the administrator or firewall; the network changed → try again; any other code → 「下載失敗（代碼：…）」',
  /系統管理員|防火牆/.test(why5[0]) && /再試一次/.test(why5[1]) && why5[2] === '下載失敗（代碼：HTTP2_PROTOCOL_ERROR）', why5);
t = await tabs();
const nT4 = t.length;
await openUrl(`${BASE}/401`); await go(1500);
const d401 = await dlg();
const deadPort = await new Promise(res => { const s2 = http.createServer(); s2.listen(0, '127.0.0.1', () => { const p = s2.address().port; s2.close(() => res(p)); }); });   // (nothing listens there)
await fill(`http://127.0.0.1:${deadPort}/a.pdf`); await go(2500);
const dRef = await dlg();
await fill(`http://someone:secret@127.0.0.1:${deadPort}/a.pdf`); await go(2500);
const dCred = await dlg();
check('401: says it needs signing in; no connection: says so in Chinese, without the error code; an address with a password: says so, without the password',
  /登入/.test(d401.err) && /連不上/.test(dRef.err) && /帳號|密碼/.test(dCred.err) && !/ERR_|net::|secret|Error|TypeError/.test(dRef.err + d401.err + dCred.err), {e401:d401.err, eRef:dRef.err, eCred:dCred.err});
const heldGone = async () => { for (let t = 0; t < 25 && held.size; t++) await win.waitForTimeout(200); };   // (the server hears the close within moments, not at a garbage collection)
await fill(`${BASE}/404big`); await go(1000); await heldGone();
const after404 = held.size;
await fill(`${BASE}/huge2.pdf`); await go(1000); await heldGone();
check('an error page with a long body, a file too large: the connection is closed at once (not left to garbage collection)', after404 === 0 && held.size === 0, {after404, held:held.size, err:(await dlg()).err});
check('the progress line: with a compressed download (more received than the size it gave), only what was received', !/ \/ /.test(await Ev(() => window.__pdfapp.urlProgress(12 * 1048576, 3 * 1048576))) && / \/ 3\.0/.test(await Ev(() => window.__pdfapp.urlProgress(1048576, 3 * 1048576))),
  await Ev(() => [window.__pdfapp.urlProgress(12 * 1048576, 3 * 1048576), window.__pdfapp.urlProgress(1048576, 3 * 1048576)]));
await win.keyboard.press('Escape'); await win.waitForTimeout(400);
// the clipboard is handed to the page only when it holds an address
await app.evaluate(({clipboard}) => clipboard.writeText('a shopping list, not an address'));
const clipTxt = await Ev(() => window.desktop.clipboardText());
await app.evaluate(({clipboard}, u) => clipboard.writeText(u), `${BASE}/files/a.pdf`);
const clipUrl = await Ev(() => window.desktop.clipboardText());
check('the clipboard reaches the page only when it holds a web address', clipTxt === '' && clipUrl === `${BASE}/files/a.pdf`, {clipTxt, clipUrl});
// a downloaded PDF that needs a password: says so; opening one shows the busy sign
await Ev(() => { window.__busySeen = false; new MutationObserver(() => { if (document.querySelector('#busy').classList.contains('show')) window.__busySeen = true; }).observe(document.querySelector('#busy'), {attributes:true}); });
await openUrl(`${BASE}/files/a.pdf`); await go();
const busySeen = await Ev(() => window.__busySeen);
await openUrl(`${BASE}/locked.pdf`); await go();
const tLocked = await toasts();
check('opening a downloaded PDF shows the busy sign; one that needs a password says so', busySeen && tLocked.some(x => /密碼/.test(x)) && (await tabs()).length === nT4 + 1, {busySeen, tLocked, tabs:(await tabs()).length});
// Ctrl+Shift+O pressed twice quickly: one window; Esc closes it and nothing is left behind
await win.keyboard.press('Control+Shift+O'); await win.keyboard.press('Control+Shift+O'); await win.waitForTimeout(800);
const twice = await dlg(); await win.keyboard.press('Escape'); await win.waitForTimeout(500);
const afterEsc = await Ev(() => ({mask:document.querySelector('#mask').classList.contains('show'), modals:document.querySelectorAll('#modal').length}));
check('Ctrl+Shift+O twice in a row: one window, and Esc leaves nothing behind', twice.open && !afterEsc.mask && afterEsc.modals === 1, {twice, afterEsc});
// a shortcut set to Ctrl+Shift+O before 從網址開啟 took it: said once, and taken off that action
await Ev(k => localStorage.setItem(k, JSON.stringify({firstPage:[null, {type:'key', code:'KeyO', label:'O', ctrl:true, shift:true, alt:false}], lastPage:'not a list'})), 'pdfeditor.bindings.v1');   // (with broken entries too)
await win.reload(); await win.waitForFunction(() => !!(window.__pdfapp && window.__pdfapp.S), null, {timeout:30000}); await win.waitForTimeout(2500);
const tKeys = await toasts(), keysNow = await Ev(k => localStorage.getItem(k), 'pdfeditor.bindings.v1');
check('a custom shortcut on Ctrl+Shift+O (taken by 從網址開啟): the person is told, and it is taken off', tKeys.some(x => /Ctrl \+ Shift \+ O/.test(x) && /第一頁/.test(x)) && !/KeyO/.test(keysNow || ''), {tKeys, keysNow});
await app.evaluate(({clipboard}, t) => clipboard.writeText(t), clip0);
// (last: url:cancel stays replaced by a no-op after it)
// Esc while downloading, and the window opened again at once: 〔開啟〕 works although the stopped download has not wound down
await app.evaluate(({ipcMain}) => { ipcMain.removeHandler('url:cancel'); ipcMain.handle('url:cancel', () => {}); });   // (the stop is slow here: it never comes)
await openUrl(`${BASE}/slow.pdf`); await win.click('#urlGo'); await win.waitForTimeout(1200);
await win.keyboard.press('Escape'); await win.waitForTimeout(300);
await openUrl(`${BASE}/files/a.pdf`);
const again = await dlg(), nAgain = (await tabs()).length;
if (!again.go) await go(); else await win.waitForTimeout(1500);
check('closed with Esc during a download and opened again at once: 〔開啟〕 works and opens the new address', again.open && !again.go && (await tabs()).length === nAgain + 1, {again, before:nAgain, after:(await tabs()).length});
slow.forEach(r => r.destroy()); await win.waitForTimeout(800);
if ((await dlg()).open) { await win.keyboard.press('Escape'); await win.waitForTimeout(400); }

console.log(failed ? `\n${failed} check(s) failed` : '\nall checks passed');
slow.forEach(r => r.destroy()); held.forEach(r => r.destroy()); server.close();
await app.evaluate(({app}) => app.exit(0)).catch(() => {});
