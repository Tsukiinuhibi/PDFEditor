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
const slow = new Set();
const server = http.createServer((req, res) => {
  const u = req.url;
  if (u === '/files/a.pdf' || u === '/noext') { res.writeHead(200, {'Content-Type':'application/pdf', 'Content-Length':PDF.length}); res.end(PDF); return; }
  if (u === '/r') { res.writeHead(302, {Location:'/dl'}); res.end(); return; }
  if (u === '/dl') {   // chunked (no Content-Length), a Chinese file name
    res.writeHead(200, {'Content-Type':'application/octet-stream', 'Content-Disposition':`attachment; filename="report.pdf"; filename*=UTF-8''${encodeURIComponent('報告.pdf')}`});
    res.write(PDF.subarray(0, 1000)); setTimeout(() => res.end(PDF.subarray(1000)), 200); return;
  }
  if (u === '/page.pdf') { res.writeHead(200, {'Content-Type':'text/html'}); res.end('<!doctype html><html><body>Please sign in</body></html>'); return; }
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
check('a web page: 「不是 PDF 檔」, nothing opened, the window stays; 404: 「下載失敗（404）」; ftp://: a red line, 〔開啟〕 off',
  d.open && d.err.includes('不是 PDF 檔') && t1.length === 4 && d404.err.includes('下載失敗（404）') && dftp.err.includes('http:// 或 https://') && dftp.go, {d, d404, dftp});
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

console.log(failed ? `\n${failed} check(s) failed` : '\nall checks passed');
slow.forEach(r => r.destroy()); server.close();
await app.evaluate(({app}) => app.exit(0)).catch(() => {});
