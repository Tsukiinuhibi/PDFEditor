// 插入圖片：從網址 — a picture downloaded by its web address (PNG, JPEG, GIF, WebP, BMP, SVG) and placed like a picture
// file; an address that is not a picture says so. A local web server stands in for the internet.
import { launch } from './_env.mjs';
import http from 'http';
import zlib from 'zlib';

let failed = 0;
const check = (name, ok, detail = '') => { console.log(`${ok ? '✔' : '✘'} ${name}${detail !== '' ? '  ' + (typeof detail === 'string' ? detail : JSON.stringify(detail)) : ''}`); if (!ok) { failed++; process.exitCode = 1; } };

// a 40×20 red PNG, made here
const png = (() => {
  const w = 40, h = 20, raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) raw.set([220, 30, 30], y * (w * 3 + 1) + 1 + x * 3);
  const crcT = Array.from({length:256}, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc = b => { let c = 0xffffffff; for (const v of b) c = crcT[(c ^ v) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (t, d) => { const l = Buffer.alloc(4); l.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(t), d]), c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([l, td, c]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr.set([8, 2, 0, 0, 0], 8);
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
})();
const SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="60" height="30"><rect width="60" height="30" fill="#1c64d9"/></svg>';
const server = http.createServer((req, res) => {
  const u = req.url;
  if (u === '/pics/red.png') { res.writeHead(200, {'Content-Type':'image/png', 'Content-Length':png.length}); res.end(png); return; }
  if (u === '/noext') { res.writeHead(200, {'Content-Type':'application/octet-stream'}); res.end(png); return; }   // (no name, no type: the bytes say PNG)
  if (u === '/logo.svg') { res.writeHead(200, {'Content-Type':'image/svg+xml'}); res.end(SVG); return; }
  if (u === '/page.png') { res.writeHead(200, {'Content-Type':'text/html'}); res.end('<!doctype html><html><body>Please sign in</body></html>'); return; }
  res.writeHead(404, {'Content-Type':'text/plain'}); res.end('not here');
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const BASE = `http://127.0.0.1:${server.address().port}`;

const { app } = await launch('imgurl.pdf');
const win = await app.firstWindow(); win.on('pageerror', e => console.log('PAGEERR', e.message)); win.on('console', m => { if (m.type() === 'error') console.log('C', m.text().slice(0, 300)); });
await win.waitForFunction(() => !!(window.__pdfapp && window.__pdfapp.S.pages.length), null, {timeout:30000});
await win.waitForTimeout(1500);
const Ev = win.evaluate.bind(win);
await win.click('[data-view="single"]'); await win.waitForTimeout(400);
const dlg = () => Ev(() => ({open:!!document.querySelector('#urlIn') && document.querySelector('#mask').classList.contains('show'), title:(document.querySelector('#modal .mh') || {}).textContent || '',
  err:(document.querySelector('#urlErr') || {}).textContent || ''}));
const fill = async u => { await Ev(u => { const i = document.querySelector('#urlIn'); i.value = u; i.dispatchEvent(new Event('input', {bubbles:true})); }, u); await win.waitForTimeout(200); };
const pictures = () => Ev(async () => (await window.__pdfapp.getAnns(0)).filter(a => a.subtype === 'Stamp').length);
const at = (x, y) => Ev(({x, y}) => { const app = window.__pdfapp, e = app.S.els[0].getBoundingClientRect(); return {x:e.left + x * app.S.scale, y:e.top + y * app.S.scale}; }, {x, y});

// the 插入 menu lists it
await win.click('[data-amenu="insert"] .sp-arr'); await win.waitForTimeout(300);
const menu = await Ev(() => document.querySelector('#toolMenu').textContent);
check('插入 ▾ lists 「從網址插入圖片…」', menu.includes('從網址插入圖片'), menu);
await win.click('#toolMenu button:has-text("從網址插入圖片")'); await win.waitForTimeout(500);
let d = await dlg();
check('a window asks for the picture\'s address', d.open && d.title === '從網址插入圖片', d);

// a PNG: downloaded, then placed by a click like a picture file
const n0 = await pictures();
await fill(BASE + '/pics/red.png'); await win.click('#urlGo'); await win.waitForTimeout(2500);
d = await dlg();
const pend = await Ev(() => ({tool:window.__pdfapp.S.tool, bar:document.querySelector('#hint').textContent}));
check('a PNG address: the window closes, the picture waits to be placed (插入圖片 tool, its name in the bar)', !d.open && pend.tool === 'image' && pend.bar.includes('red.png'), {d, pend});
{ const p = await at(200, 300); await win.mouse.click(p.x, p.y); await win.waitForTimeout(2000); }
const n1 = await pictures();
check('placed: one more picture on the page', n1 === n0 + 1, {n0, n1});
await Ev(() => window.__pdfapp.setTool('select')); await win.waitForTimeout(300);

// an address without a name or a type (the bytes are a PNG); an SVG
for (const [u, name, px] of [['/noext', 'no name', 380], ['/logo.svg', 'SVG', 480]]) {
  await Ev(() => { window.__pdfapp.actions.imageUrl(); }); await win.waitForTimeout(500);
  await fill(BASE + u); await win.click('#urlGo'); await win.waitForTimeout(2500);
  const t = await Ev(() => window.__pdfapp.S.tool);
  if (t === 'image') { const p = await at(px, 300); await win.mouse.click(p.x, p.y); await win.waitForTimeout(2000); }
  await Ev(() => window.__pdfapp.setTool('select')); await win.waitForTimeout(300);
  check(`${name}: placed`, t === 'image', t);
}
check('three pictures placed in all', (await pictures()) === n0 + 3, await pictures());

// not a picture; not found
await Ev(() => { window.__pdfapp.actions.imageUrl(); }); await win.waitForTimeout(500);
await fill(BASE + '/page.png'); await win.click('#urlGo'); await win.waitForTimeout(2000);
d = await dlg();
check('a web page: the window stays, says it is not a picture', d.open && d.err.includes('不是圖片'), d);
await fill(BASE + '/missing.png'); await win.click('#urlGo'); await win.waitForTimeout(2000);
d = await dlg();
check('not found: the window stays, says so', d.open && d.err.includes('找不到'), d);
await win.keyboard.press('Escape'); await win.waitForTimeout(400);
check('closed: no picture waiting', (await Ev(() => window.__pdfapp.S.tool)) !== 'image');

console.log(failed ? `\n${failed} check(s) failed` : '\nall checks passed');
server.close();
await app.evaluate(({app}) => app.exit(0)).catch(() => {});
