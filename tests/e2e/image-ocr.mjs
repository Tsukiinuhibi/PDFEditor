// 插入的圖片做文字辨識: a picture inserted here (its text is pixels) is selected and 〔辨識文字〕 in its bar reads the text
// in it, in the 文字辨識 window, as a box drawn with the 文字辨識 tool would.
import { launch } from './_env.mjs';
import http from 'http';

let failed = 0;
const check = (name, ok, detail = '') => { console.log(`${ok ? '✔' : '✘'} ${name}${detail !== '' ? '  ' + (typeof detail === 'string' ? detail : JSON.stringify(detail)) : ''}`); if (!ok) { failed++; process.exitCode = 1; } };

const { app } = await launch('imgocr.pdf');
const win = await app.firstWindow(); win.on('pageerror', e => console.log('PAGEERR', e.message)); win.on('console', m => { if (m.type() === 'error') console.log('C', m.text().slice(0, 300)); });
await win.waitForFunction(() => !!(window.__pdfapp && window.__pdfapp.S.pages.length), null, {timeout:30000});
await win.waitForTimeout(1500);
const Ev = win.evaluate.bind(win);
await win.click('[data-view="single"]'); await win.waitForTimeout(400);

// a picture of text, drawn in the page and served by a local web server (inserted with 從網址插入圖片)
const b64 = await Ev(() => { const c = document.createElement('canvas'); c.width = 600; c.height = 160; const g = c.getContext('2d');
  g.fillStyle = '#fff'; g.fillRect(0, 0, 600, 160); g.fillStyle = '#000'; g.font = 'bold 64px sans-serif'; g.fillText('HELLO 2026', 30, 105); return c.toDataURL('image/png').split(',')[1]; });
const PNG = Buffer.from(b64, 'base64');
const server = http.createServer((req, res) => { res.writeHead(200, {'Content-Type':'image/png', 'Content-Length':PNG.length}); res.end(PNG); });
await new Promise(r => server.listen(0, '127.0.0.1', r));
const at = (x, y) => Ev(({x, y}) => { const app = window.__pdfapp, e = app.S.els[0].getBoundingClientRect(); return {x:e.left + x * app.S.scale, y:e.top + y * app.S.scale}; }, {x, y});
await Ev(() => { window.__pdfapp.actions.imageUrl(); }); await win.waitForTimeout(500);
await Ev(u => { const i = document.querySelector('#urlIn'); i.value = u; i.dispatchEvent(new Event('input', {bubbles:true})); }, `http://127.0.0.1:${server.address().port}/hello.png`);
await win.click('#urlGo'); await win.waitForTimeout(2500);
{ const p = await at(150, 200), q = await at(450, 280); await win.mouse.move(p.x, p.y); await win.mouse.down(); await win.mouse.move(q.x, q.y, {steps:6}); await win.mouse.up(); await win.waitForTimeout(2000); }
await Ev(() => window.__pdfapp.setTool('select')); await win.waitForTimeout(300);
const pic = (await Ev(async () => (await window.__pdfapp.getAnns(0)).filter(a => a.subtype === 'Stamp').map(a => ({x:a.x, y:a.y, w:a.w, h:a.h}))))[0];
check('(a picture of text inserted)', !!pic, pic);
{ const p = await at(pic.x + pic.w / 2, pic.y + pic.h / 2); await win.mouse.click(p.x, p.y); await win.waitForTimeout(1200); }
const btn = await Ev(() => !!document.querySelector('#hint.objbar [data-o="ocr"]'));
check('the bar of a selected picture has 〔辨識文字〕', btn);
if (btn) await win.click('#hint.objbar [data-o="ocr"]');
let r = null;
for (let k = 0; k < 120; k++) {
  await win.waitForTimeout(500);
  r = await Ev(() => { const p = document.querySelector('#ocrPanel'); return p ? {text:p.querySelector('.ocr-tx').value, src:p.querySelector('.ocr-src').textContent, busy:p.querySelector('[data-o="copy"]').disabled} : null; });
  if (r && !r.busy && r.text) break;
}
check('〔辨識文字〕: the 文字辨識 window reads the picture\'s text (HELLO 2026)', !!r && /HELLO/.test(r.text) && /2026/.test(r.text) && /影像辨識/.test(r.src), r);

console.log(failed ? `\n${failed} check(s) failed` : '\nall checks passed');
server.close();
await app.evaluate(({app}) => app.exit(0)).catch(() => {});
