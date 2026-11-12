// 文字辨識: drag a box; the PDF's own text comes out exactly, pictures of text (scans) are read by OCR
// (horizontal Chinese + English, vertical Chinese); the result can be copied.
import { launch, launchPath, TMP, ROOT } from './_env.mjs';
import { createRequire } from 'module';
import path from 'path';
import fs from 'fs';
const require = createRequire(import.meta.url);
const { PDFDocument } = require('pdf-lib');
const fontkit = require('@pdf-lib/fontkit');

// 1. pictures of text, drawn in the app's own window with the bundled font (what a clean scan looks like)
let { app } = await launch('ocr0.pdf');
let win = await app.firstWindow(); await win.waitForTimeout(3000);
const pics = await win.evaluate(async () => {
  await document.fonts.load('400 40px "PDFE Sans"', '繁體中文字');
  const draw = (w, h, fn) => { const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d');
    g.fillStyle = '#fff'; g.fillRect(0, 0, w, h); g.fillStyle = '#1a1a1a'; fn(g); return c.toDataURL('image/png').split(',')[1]; };
  const hz = draw(1400, 300, g => { g.font = '56px "PDFE Sans"'; g.fillText('掃描文件的文字辨識測試', 40, 90); g.fillText('繁體中文與 English 混排 2026', 40, 180);
    g.font = '44px "PDFE Sans"'; g.fillText('第三行：可以複製出來。', 40, 262); });
  const vt = draw(260, 900, g => { g.font = '60px "PDFE Sans"'; [...'直書文字辨識'].forEach((ch, k) => g.fillText(ch, 150, 90 + k * 76)); [...'第二欄'].forEach((ch, k) => g.fillText(ch, 40, 90 + k * 76)); });
  // a poor scan: small print, grey paper, speckles, scanned at low resolution (drawn small, then blown up)
  const small = draw(700, 120, g => { g.fillStyle = '#e9e5dc'; g.fillRect(0, 0, 700, 120); g.fillStyle = '#2a2a2a'; g.font = '22px "PDFE Sans"';
    g.fillText('會議紀錄：本週五下午三點於二樓會議室舉行。', 12, 40); g.fillText('請攜帶筆電與上月的報表（共 12 頁）。', 12, 86);
    let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;   // the same speckles every run
    for (let k = 0; k < 900; k++) { g.fillStyle = rnd() < .5 ? 'rgba(0,0,0,.35)' : 'rgba(255,255,255,.5)'; g.fillRect(rnd() * 700, rnd() * 120, 1.5, 1.5); } });
  const poor = await new Promise(res => { const im = new Image(); im.onload = () => { const c = document.createElement('canvas'); c.width = 1400; c.height = 240; const g = c.getContext('2d');
    g.imageSmoothingEnabled = true; g.drawImage(im, 0, 0, 1400, 240); res(c.toDataURL('image/png').split(',')[1]); }; im.src = 'data:image/png;base64,' + small; });
  return {hz, vt, poor};
});
await app.evaluate(({app}) => app.exit(0)).catch(() => {});

// 2. the test file: one line of real text, the two pictures
const REAL = '這是 PDF 裡真正的文字 Real text 123';
const doc = await PDFDocument.create(); doc.registerFontkit(fontkit);
const page = doc.addPage([595, 842]);
const font = await doc.embedFont(fs.readFileSync(path.join(ROOT, 'app', 'fonts', 'NotoSansTC-Regular.ttf')), {subset:true});
page.drawText(REAL, {x:60, y:780, size:16, font});
const hz = await doc.embedPng(Buffer.from(pics.hz, 'base64')), vt = await doc.embedPng(Buffer.from(pics.vt, 'base64'));
page.drawImage(hz, {x:60, y:560, width:470, height:470 * 300 / 1400});
page.drawImage(vt, {x:450, y:180, width:78, height:78 * 900 / 260});
const poor = await doc.embedPng(Buffer.from(pics.poor, 'base64'));
page.drawImage(poor, {x:60, y:420, width:330, height:330 * 240 / 1400});
const file = path.join(TMP, 'ocr.pdf'); fs.writeFileSync(file, await doc.save());

// 3. use it
({ app } = await launchPath(file));
win = await app.firstWindow(); win.on('pageerror', e => console.log('PAGEERR', e.message)); win.on('console', m => { if (m.type() === 'error') console.log('C', m.text().slice(0, 300)); });
await win.waitForTimeout(3500);
await win.click('[data-view="single"]'); await win.waitForTimeout(500);
await win.click('[data-tool="ocr"]'); await win.waitForTimeout(500);
const A = win.evaluate.bind(win);
// drag a box given in PDF points (x, y from the bottom-left, like pdf-lib), bringing it into view first
async function dragPdfBox(x0, y0, x1, y1){
  if (await A(() => !!document.querySelector('#ocrPanel'))) {   // the last result window may sit where the next box goes: Esc closes it
    await win.keyboard.press('Escape'); await win.waitForTimeout(150);
    console.log('   (Esc:', await A(() => !document.querySelector('#ocrPanel')) ? 'window closed,' : 'window STILL OPEN,', 'tool', await A(() => window.__pdfapp.S.tool) + ')');
  }
  const r = await A(({x0, y0, x1, y1}) => { const app = window.__pdfapp, pg = app.S.pages[0], a = pg.vp1.convertToViewportPoint(x0, y1), b = pg.vp1.convertToViewportPoint(x1, y0);
    const vw = document.querySelector('#viewer'), vr = vw.getBoundingClientRect(); let e = app.S.els[0].getBoundingClientRect();
    vw.scrollTop += e.top + (a[1] + b[1]) / 2 * app.S.scale - (vr.top + vr.height / 2); e = app.S.els[0].getBoundingClientRect();
    return {ax:e.left + a[0] * app.S.scale, ay:e.top + a[1] * app.S.scale, bx:e.left + b[0] * app.S.scale, by:e.top + b[1] * app.S.scale}; }, {x0, y0, x1, y1});
  await win.waitForTimeout(400);
  await win.mouse.move(r.ax, r.ay); await win.mouse.down(); await win.mouse.move(r.bx, r.by, {steps:8}); await win.mouse.up();
}
// wait for the result window to settle
async function result(timeout = 90000){
  const t0 = Date.now();
  for (;;) {
    const s = await A(() => { const p = document.querySelector('#ocrPanel'); if (!p) return null;
      return {text:p.querySelector('.ocr-tx').value, src:p.querySelector('.ocr-src').textContent, msg:p.querySelector('.ocr-msg').textContent, busy:p.querySelector('[data-o="copy"]').disabled}; });
    if (s && !s.busy) return {...s, ms:Date.now() - t0};
    if (Date.now() - t0 > timeout) return {...s, timeout:true};
    await win.waitForTimeout(300);
  }
}
// how much of the expected text was read: longest common subsequence over the characters (spaces ignored)
const score = (got, want) => { const a = [...got.replace(/\s/g, '')], b = [...want.replace(/\s/g, '')], d = Array(b.length + 1).fill(0);
  for (const x of a) { let prev = 0; for (let j = 1; j <= b.length; j++) { const t = d[j]; d[j] = x === b[j - 1] ? prev + 1 : Math.max(d[j], d[j - 1]); prev = t; } }
  return Math.round(d[b.length] / b.length * 100) + '%'; };

await dragPdfBox(50, 770, 400, 805);
let r = await result();
console.log('real text      ', JSON.stringify(r.text), '| exact', r.text === REAL, '|', r.src);
await win.click('#ocrPanel [data-o="copy"]'); await win.waitForTimeout(400);
console.log('clipboard      ', JSON.stringify(await app.evaluate(({clipboard}) => clipboard.readText())));
await win.screenshot({path:TMP + '/ocr_real.png'});

await dragPdfBox(55, 555, 535, 665);
r = await result();
console.log('scanned (hz)   ', JSON.stringify(r.text), '|', r.src, '|', r.msg, '|', Math.round(r.ms / 100) / 10 + 's');
console.log('   read', score(r.text, '掃描文件的文字辨識測試繁體中文與English混排2026第三行：可以複製出來。'), 'of the characters');
await win.screenshot({path:TMP + '/ocr_hz.png'});

await dragPdfBox(445, 175, 533, 455);
r = await result();
console.log('scanned (vert) ', JSON.stringify(r.text), '|', r.src, '|', Math.round(r.ms / 100) / 10 + 's');
console.log('   read', score(r.text, '直書文字辨識第二欄'), 'of the characters');
await win.screenshot({path:TMP + '/ocr_vt.png'});

await dragPdfBox(55, 412, 395, 482);
r = await result();
console.log('poor scan      ', JSON.stringify(r.text), '|', r.src);
console.log('   read', score(r.text, '會議紀錄：本週五下午三點於二樓會議室舉行。請攜帶筆電與上月的報表（共12頁）。'), 'of the characters');
await win.screenshot({path:TMP + '/ocr_poor.png'});

// the real-text box again, forced through OCR
await dragPdfBox(50, 770, 400, 805); await result();
await win.click('#ocrPanel [data-o="image"]'); r = await result();
console.log('real via OCR   ', JSON.stringify(r.text), '|', r.src, '| read', score(r.text, REAL));
await win.keyboard.press('Escape'); await win.waitForTimeout(300);
console.log('closed by Esc  ', await A(() => !document.querySelector('#ocrPanel') && !document.querySelector('.ocrmark')));
await app.evaluate(({app}) => app.exit(0)).catch(() => {});
