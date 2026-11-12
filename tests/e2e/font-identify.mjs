// 字型辨識 in the 文字辨識 window: the 字型 tab names the font of a scanned piece of text (installed fonts, the
// bundled 思源黑體, Google Fonts through a fake source), the fonts the PDF records for its own text, and 套用 /
// 下載 / the font menu's 字型辨識結果 section.
import { launch, launchPath, TMP, ROOT } from './_env.mjs';
import { createRequire } from 'module';
import path from 'path';
import fs from 'fs';
const require = createRequire(import.meta.url);
const { PDFDocument } = require('pdf-lib');

let failed = 0, pageErrors = 0;
const check = (name, ok, detail = '') => { console.log(`${ok ? '✔' : '✘'} ${name}${detail !== '' ? '  ' + (typeof detail === 'string' ? detail : JSON.stringify(detail)) : ''}`); if (!ok) { failed++; process.exitCode = 1; } };
const watch = win => { win.on('pageerror', e => { pageErrors++; console.log('PAGEERR', e.message); }); win.on('console', m => { if (m.type() === 'error') console.log('C', m.text().slice(0, 300)); }); };
const GF = fs.readFileSync(path.join(ROOT, 'tests', 'e2e', 'fixtures', 'gf-test.ttf')).toString('base64');
const CJ = '中華民國臺灣字型辨識測試範例', LT = 'Quick brown fox Rag 2025';

// ---- the scans: drawn in the app's window (blur 0.8 px, fixed-seed speckle), put into a PDF ----------------
let { app } = await launch('fid-pics.pdf');
let win = await app.firstWindow(); watch(win); await win.waitForTimeout(3000);
const pics = await win.evaluate(async ({gf, CJ, LT}) => {
  const ff = new FontFace('PDFE GF Test', Uint8Array.from(atob(gf), c => c.charCodeAt(0))); await ff.load(); document.fonts.add(ff);
  await document.fonts.load('44px "PDFE Sans"', CJ);
  let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const finish = (g, c) => { g.filter = 'none'; const im = g.getImageData(0, 0, c.width, c.height);
    for (let o = 0; o < im.data.length; o += 4) { const n = (rnd() - .5) * 36; for (let q = 0; q < 3; q++) im.data[o + q] = Math.max(0, Math.min(255, im.data[o + q] + n)); }
    g.putImageData(im, 0, 0); return {b64:c.toDataURL('image/png').split(',')[1], w:c.width, h:c.height}; };
  const canvas = (w, h) => { const c = document.createElement('canvas'); c.width = Math.ceil(w); c.height = Math.ceil(h); const g = c.getContext('2d', {willReadFrequently:true});
    g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.filter = 'blur(.8px)'; g.fillStyle = '#1a1a1a'; return {c, g}; };
  // one line made of [font, text] pieces
  const line = (parts, {px = 44, weight = 400} = {}) => {
    const m = document.createElement('canvas').getContext('2d'); let w = 0;
    for (const [css, t] of parts) { m.font = `${weight} ${px}px ${css}`; w += m.measureText(t).width; }
    const {c, g} = canvas(w + px * 1.5, px * 2);
    let x = px * .75; for (const [css, t] of parts) { g.font = `${weight} ${px}px ${css}`; g.fillText(t, x, px * 1.35); x += g.measureText(t).width; }
    return finish(g, c);
  };
  const column = (css, text, px = 48) => { const ch = [...text], {c, g} = canvas(px * 1.8, ch.length * px * 1.25 + px);
    g.font = `${px}px ${css}`; ch.forEach((t, k) => g.fillText(t, px * .4, px * 1.2 + k * px * 1.25)); return finish(g, c); };
  const shapes = () => { const {c, g} = canvas(700, 90); g.lineWidth = 4; g.strokeStyle = '#1a1a1a';
    for (let k = 0; k < 6; k++) { g.beginPath(); g.moveTo(20 + k * 110, 80); g.lineTo(90 + k * 110, 10); g.stroke(); }
    g.beginPath(); g.moveTo(10, 45); for (let x = 10; x < 690; x += 6) g.lineTo(x, 45 + 18 * Math.sin(x / 23)); g.stroke(); return finish(g, c); };
  return {
    dejavu:line([['"DejaVu Serif"', LT]]), libbold:line([['"Liberation Sans"', LT]], {weight:700}), wqy:line([['"WenQuanYi Zen Hei"', CJ]]),
    noto:line([['"PDFE Sans"', CJ]]), mixed:line([['"WenQuanYi Zen Hei"', '中華民國臺灣字型 '], ['"DejaVu Serif"', 'Quick Rag 2025']]),
    gf:line([['"PDFE GF Test"', LT]]), shapes:shapes(), vert:column('"WenQuanYi Zen Hei"', '中華民國臺灣字型辨識'),
  };
}, {gf:GF, CJ, LT});
await app.evaluate(({app}) => app.exit(0)).catch(() => {});

const doc = await PDFDocument.create(), page = doc.addPage([595, 842]), BOX = {};
const PPT = 2.98;   // image pixels per point: about 215 dpi, as a scanner might deliver
const place = async (name, x, top) => { const p = pics[name], img = await doc.embedPng(Buffer.from(p.b64, 'base64')), w = p.w / PPT, h = p.h / PPT;
  page.drawImage(img, {x, y:top - h, width:w, height:h}); BOX[name] = {x0:x - 4, y0:top - h - 4, x1:x + w + 4, y1:top + 4}; };
await place('dejavu', 30, 815); await place('libbold', 30, 760); await place('wqy', 30, 705); await place('noto', 30, 650);
await place('mixed', 30, 595); await place('gf', 30, 540); await place('shapes', 30, 470); await place('vert', 480, 440);
const file = path.join(TMP, 'fid-scans.pdf'); fs.writeFileSync(file, await doc.save());

// ---- part 1: the 字型 tab on scans -------------------------------------------------------------------------
({ app } = await launchPath(file));
win = await app.firstWindow(); watch(win); await win.waitForTimeout(3500);
const A = win.evaluate.bind(win);
await A(() => window.__pdfapp.fontReady());   // the Chinese names of the installed fonts are read
await win.click('[data-view="single"]'); await win.waitForTimeout(500);
await win.click('[data-tool="ocr"]'); await win.waitForTimeout(500);
// a fake Google Fonts: it knows only "Gelasio", which it serves as the condensed test font
await A(gf => {
  window.__gf = {urls:[], mode:'ok'};
  window.__pdfapp.fontIdGoogle(async url => {
    __gf.urls.push(url);
    if (__gf.mode === 'throw') throw new TypeError('Failed to fetch');
    const fams = new URL(url).searchParams.getAll('family').map(f => f.split(':')[0]);
    const css = fams.filter(f => f === 'Gelasio').map(f => `@font-face {\n  font-family: '${f}';\n  font-weight: 400;\n  src: url(data:font/ttf;base64,${gf}) format('truetype');\n}\n`).join('');
    return {ok:true, status:200, text:async () => css};
  });
}, GF);
async function dragPdfBox({x0, y0, x1, y1}){
  if (await A(() => !!document.querySelector('#ocrPanel'))) { await win.keyboard.press('Escape'); await win.waitForTimeout(150); }
  const r = await A(({x0, y0, x1, y1}) => { const app = window.__pdfapp, pg = app.S.pages[0], a = pg.vp1.convertToViewportPoint(x0, y1), b = pg.vp1.convertToViewportPoint(x1, y0);
    const vw = document.querySelector('#viewer'), vr = vw.getBoundingClientRect(); let e = app.S.els[0].getBoundingClientRect();
    vw.scrollTop += e.top + (a[1] + b[1]) / 2 * app.S.scale - (vr.top + vr.height / 2); e = app.S.els[0].getBoundingClientRect();
    return {ax:e.left + a[0] * app.S.scale, ay:e.top + a[1] * app.S.scale, bx:e.left + b[0] * app.S.scale, by:e.top + b[1] * app.S.scale}; }, {x0, y0, x1, y1});
  await win.waitForTimeout(300);
  await win.mouse.move(r.ax, r.ay); await win.mouse.down(); await win.mouse.move(r.bx, r.by, {steps:8}); await win.mouse.up();
}
const state = () => A(() => window.__pdfapp.fontIdState());
// the 字型 tab once it has settled (results or a message)
async function settled(timeout = 120000){
  const t0 = Date.now();
  for (;;) {
    await win.waitForTimeout(400);
    const s = await state();
    if (s && !s.busy && (s.groups.length || s.pdf.length || s.msg)) return {...s, ms:Date.now() - t0};
    if (Date.now() - t0 > timeout) return {...s, timeout:true};
  }
}
const first = s => s.groups[0] && s.groups[0].rows[0] || {};
const fontTab = async () => { await win.click('#ocrPanel [data-ot="font"]'); };

await dragPdfBox(BOX.dejavu); await win.waitForTimeout(300); await fontTab();
let s = await settled();
check('DejaVu Serif scan', first(s).label === 'DejaVu Serif' && first(s).src.includes('本機') && first(s).pct >= 70, s.groups[0] ? s.groups[0].rows.slice(0, 3) : s);
check('one group, no heading', s.groups.length === 1 && !s.groups[0].title, s.groups.map(g => g.title));
check('Google asked with sorted unique characters', __checkSorted(await A(() => __gf.urls)), (await A(() => __gf.urls[0] || '')).slice(-60));
await win.screenshot({path:TMP + '/fid-dejavu.png'});
await dragPdfBox(BOX.libbold); s = await settled();
check('opens on the 字型 tab again', s.tab === 'font');
check('Liberation Sans bold scan', first(s).label === 'Liberation Sans' && first(s).bold, s.groups[0] && s.groups[0].rows.slice(0, 3));
await dragPdfBox(BOX.wqy); s = await settled();
check('文泉驛正黑 scan (mono twin merged)', /文泉驛正黑/.test(first(s).label) && /／/.test(first(s).label), s.groups[0] && s.groups[0].rows.slice(0, 3));
await dragPdfBox(BOX.noto); s = await settled();
check('bundled 思源黑體 scan', first(s).label === '思源黑體（內建）' && first(s).src.includes('內建'), s.groups[0] && s.groups[0].rows.slice(0, 3));
await dragPdfBox(BOX.mixed); s = await settled();
check('mixed line: two groups', JSON.stringify(s.groups.map(g => g.title)) === '["中文","英數字"]', s.groups.map(g => g.title));
check('mixed line: each group right', s.groups.length === 2 && /文泉驛正黑/.test(s.groups[0].rows[0].label) && s.groups[1].rows[0].label === 'DejaVu Serif', s.groups.map(g => g.rows.slice(0, 2)));
check('a long name leaves its source tag in view', await A(() => [...document.querySelectorAll('#ocrPanel .fi-row')].every(r => { const n = r.querySelector('.fi-name').getBoundingClientRect(), t = r.querySelector('.fi-src').getBoundingClientRect(); return t.width > 0 && t.right <= n.right + .5 && t.left >= n.left; })));
check('the full name on hover', await A(() => { const l = document.querySelector('#ocrPanel .fi-row .fi-label'); return !!l && l.title.split('／').length >= 3; }));
await dragPdfBox(BOX.vert); s = await settled();
check('vertical column', /文泉驛正黑/.test(first(s).label), s.groups[0] ? s.groups[0].rows.slice(0, 3) : s);
await dragPdfBox(BOX.shapes); s = await settled();
check('not text: too few glyphs', s.msg === '這個範圍能比對的字太少，請框大一點或框清楚的字' && !s.groups.length, s);
await dragPdfBox(BOX.gf); s = await settled();
check('a Google font first (fake source)', first(s).label === 'Gelasio' && first(s).src.includes('Google Fonts') && first(s).action === 'download', s.groups[0] && s.groups[0].rows.slice(0, 3));
check('installed fonts get 套用', s.groups[0].rows.some(x => x.src.includes('本機') && x.action === 'apply'), s.groups[0].rows.map(x => x.action));
await win.screenshot({path:TMP + '/fid-google.png'});
// Google off: not asked, remembered
const asked0 = await A(() => __gf.urls.length);
await win.click('#ocrPanel input[data-o="gf"]'); await win.click('#ocrPanel [data-o="refont"]'); s = await settled();
check('Google off: not asked', (await A(() => __gf.urls.length)) === asked0 && !s.groups.some(g => g.rows.some(x => x.src.includes('Google'))), s.groups[0] && s.groups[0].rows.slice(0, 2));
check('Google off: remembered', (await A(() => localStorage.getItem('pdfeditor.fontid.v1'))) === '{"google":false}');
await win.click('#ocrPanel input[data-o="gf"]');
await A(() => { __gf.mode = 'throw'; }); await win.click('#ocrPanel [data-o="refont"]'); s = await settled();
check('offline, already downloaded: listed, not called unreachable', first(s).label === 'Gelasio' && s.msg !== '連不上 Google Fonts，只比對了這台電腦的字型', {msg:s.msg, first:first(s)});
await dragPdfBox(BOX.mixed); s = await settled();
check('Google unreachable: said so, installed fonts listed', s.msg === '連不上 Google Fonts，只比對了這台電腦的字型' && s.groups.length === 2 && s.groups.every(g => g.rows.length && !g.rows.some(x => x.src.includes('Google'))), {msg:s.msg, rows:s.groups.map(g => g.rows.slice(0, 1))});
await A(() => { __gf.mode = 'ok'; });
// a new box while matching: only the new box's result
await dragPdfBox(BOX.wqy); await win.waitForTimeout(600); await dragPdfBox(BOX.dejavu); s = await settled();
check('new box while matching: its own result only', first(s).label === 'DejaVu Serif' && s.groups.length === 1, s.groups.map(g => g.rows[0]));
check('no page errors', pageErrors === 0, pageErrors);
await app.evaluate(({app}) => app.exit(0)).catch(() => {});

function __checkSorted(urls){
  if (!urls.length) return false;
  return urls.every(u => { const t = [...new URL(u).searchParams.get('text')]; return t.join('') === [...new Set(t)].sort((a, b) => a.codePointAt(0) - b.codePointAt(0)).join(''); });
}
console.log(failed ? `\n${failed} check(s) failed` : '\nall checks passed');
