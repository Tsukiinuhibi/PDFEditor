// 字型辨識 in the 文字辨識 window: the 字型 tab names the font of a scanned piece of text (installed fonts, the
// bundled 思源黑體, Google Fonts through a fake source), the fonts the PDF records for its own text, and 套用 /
// 下載 / the font menu's 字型辨識結果 section.
import { launch, launchPath, TMP, ROOT } from './_env.mjs';
import { createRequire } from 'module';
import path from 'path';
import fs from 'fs';
const require = createRequire(import.meta.url);
const { PDFDocument, StandardFonts, setTextRenderingMode, TextRenderingMode } = require('pdf-lib');
const fontkit = require('@pdf-lib/fontkit');

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
let A = win.evaluate.bind(win), A2 = A;
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
  A = win.evaluate.bind(win);
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

// ---- part 2: the fonts the PDF records for its own text ----------------------------------------------------
// one line per case; a font's recorded name is set with pdf-lib's customName (BaseFont and FontName)
const DJV = fs.readFileSync('/usr/share/fonts/truetype/dejavu/DejaVuSerif.ttf');
const d2 = await PDFDocument.create(); d2.registerFontkit(fontkit);
const p2 = d2.addPage([595, 842]), LINE = {};
const big5 = String.fromCharCode(0xB7, 0x73, 0xB2, 0xD3, 0xA9, 0xFA, 0xC5, 0xE9);   // 新細明體 in Big5
const named = customName => d2.embedFont(DJV, {subset:true, customName});
const line = async (key, y, text, font) => { p2.drawText(text, {x:60, y, size:16, font}); LINE[key] = {x0:50, y0:y - 7, x1:340, y1:y + 19}; };
await line('dejavu', 780, 'Real DejaVu text 2026', await d2.embedFont(DJV, {subset:true}));
await line('big5', 740, 'Big5 named font', await named(big5));
await line('helv', 700, 'Helvetica line', await d2.embedFont(StandardFonts.Helvetica));
await line('google', 660, 'Google named font', await named('ABCDEF+LXGWWenKaiTC-Regular'));
await line('generic', 620, 'Generic named font', await named('F1'));
// a scan with an OCR text layer over it: invisible text (render mode 3) in "GlyphLessFont"
{ const img = await d2.embedPng(Buffer.from(pics.dejavu.b64, 'base64')), w = pics.dejavu.w / PPT, h = pics.dejavu.h / PPT, ghost = await named('GlyphLessFont');
  p2.drawImage(img, {x:40, y:520, width:w, height:h});
  p2.pushOperators(setTextRenderingMode(TextRenderingMode.Invisible)); p2.drawText(LT, {x:52, y:527, size:15, font:ghost}); p2.pushOperators(setTextRenderingMode(TextRenderingMode.Fill));
  LINE.ghost = {x0:36, y0:516, x1:40 + w + 4, y1:520 + h + 4}; }
const file2 = path.join(TMP, 'fid-pdffonts.pdf'); fs.writeFileSync(file2, await d2.save());
({ app } = await launchPath(file2));
win = await app.firstWindow(); watch(win); await win.waitForTimeout(3500);
await win.evaluate(() => window.__pdfapp.fontReady());
await win.click('[data-view="single"]'); await win.waitForTimeout(500);
await win.click('[data-tool="ocr"]'); await win.waitForTimeout(500);
await win.evaluate(() => window.__pdfapp.fontIdGoogle(async () => ({ok:true, status:200, text:async () => ''})));   // no network
A2 = win.evaluate.bind(win);
await dragPdfBox(LINE.dejavu); await win.waitForTimeout(300); await win.click('#ocrPanel [data-ot="font"]');
s = await settled();
check('embedded DejaVu Serif', s.pdf.length === 1 && s.pdf[0].name.includes('DejaVu Serif') && s.pdf[0].pct === 100 && s.pdf[0].tags.includes('已內嵌') && s.pdf[0].action === 'apply' && !s.groups.length, s.pdf);
check('the PDF\'s own text: no shape matching until asked', !s.groups.length && await A2(() => !!document.querySelector('#ocrPanel [data-o="byshape"]')));
await win.click('#ocrPanel [data-o="byshape"]'); s = await settled();
check('用字形比對找相似字型', first(s).label === 'DejaVu Serif' && s.pdf.length === 1, s.groups[0] ? s.groups[0].rows.slice(0, 2) : s);
await dragPdfBox(LINE.big5); s = await settled();
check('Big5 name read as 新細明體', s.pdf.length === 1 && s.pdf[0].name.includes('新細明體') && s.pdf[0].action === '' && await A2(() => document.querySelector('#ocrPanel .fi-pdf .fi-none').textContent === '這台電腦沒有'), s.pdf);
await dragPdfBox(LINE.helv); s = await settled();
check('standard Helvetica: a stand-in', s.pdf.length === 1 && s.pdf[0].name.includes('Helvetica，以 Liberation Sans 代替') && s.pdf[0].tags.includes('未內嵌') && s.pdf[0].action === 'apply', s.pdf);
await dragPdfBox(LINE.google); s = await settled();
check('a Google family: 下載', s.pdf.length === 1 && s.pdf[0].action === 'download', s.pdf);
await dragPdfBox(LINE.generic); s = await settled();
check('no usable name', s.pdf.length === 1 && s.pdf[0].name === 'PDF 沒有記錄字型名稱' && s.pdf[0].pct == null && s.pdf[0].action === '', s.pdf);
await dragPdfBox(LINE.ghost); s = await settled();
check('hidden OCR layer: not listed, the picture compared', !s.pdf.length && first(s).label === 'DejaVu Serif', {pdf:s.pdf, first:first(s)});
check('no page errors (part 2)', pageErrors === 0, pageErrors);
await app.evaluate(({app}) => app.exit(0)).catch(() => {});

// ---- part 3: 套用, 下載 and the font menu's 字型辨識結果 ---------------------------------------------------
const gfOnly = gf => window.__pdfapp.fontIdGoogle(async url => { const fams = new URL(url).searchParams.getAll('family').map(f => f.split(':')[0]);
  return {ok:true, status:200, text:async () => fams.filter(f => f === 'Gelasio').map(f => `@font-face {\n  font-family: '${f}';\n  font-weight: 400;\n  src: url(data:font/ttf;base64,${gf}) format('truetype');\n}\n`).join('')}; });
({ app } = await launchPath(file));
win = await app.firstWindow(); watch(win); await win.waitForTimeout(3500);
await win.evaluate(() => window.__pdfapp.fontReady());
await app.evaluate(({shell}) => { shell.openExternal = async u => { globalThis.__opened = u; }; });   // the browser is not opened
await win.click('[data-view="single"]'); await win.waitForTimeout(500);
await win.click('[data-tool="ocr"]'); await win.waitForTimeout(500);
await win.evaluate(gfOnly, GF);
await dragPdfBox(BOX.dejavu); await win.waitForTimeout(300); await win.click('#ocrPanel [data-ot="font"]'); s = await settled();
await win.click('#ocrPanel .fi-img .fi-row[data-key="local:DejaVu Serif"] [data-fa="apply"]');
check('套用 sets the default font', (await A(() => window.__pdfapp.tbStyle().font)) === 'DejaVu Serif');
check('套用 says so', await A(() => [...document.querySelectorAll('#toasts .toast')].some(t => t.textContent === '已設為文字方塊的預設字型：DejaVu Serif')));
await dragPdfBox(BOX.gf); s = await settled();
await win.click('#ocrPanel .fi-row[data-key="google:Gelasio"] [data-fa="download"]'); await win.waitForTimeout(500);
check('下載 opens the specimen page', (await app.evaluate(() => globalThis.__opened)) === 'https://fonts.google.com/specimen/Gelasio');
check('下載 leaves a hint', await A(() => (document.querySelector('#ocrPanel .fi-row[data-key="google:Gelasio"] .fi-hint') || {}).textContent === '安裝後重新開啟 PDF 工作台，再比對一次就能套用'));
// the font menu offers the installed fonts just found, with their similarity
await dragPdfBox(BOX.dejavu); s = await settled();
await win.click('[data-tool="textbox"]'); await win.waitForTimeout(500);
await win.click('#hint [data-tbfont]'); await win.waitForTimeout(400);
const fm = await A(() => { const el = [...document.querySelectorAll('#fontMenu .fm-list > *')], k = el.findIndex(e => e.classList.contains('fm-sec') && e.textContent === '字型辨識結果'), it = k >= 0 ? el[k + 1] : null;
  return {k, f:it && it.dataset.f, text:it && it.textContent, after預設:k > 0 && el[k - 2] && el[k - 2].textContent === '預設'}; });
check('font menu: 字型辨識結果, right after 預設', fm.k >= 0 && fm.after預設 && fm.f === 'DejaVu Serif' && /DejaVu Serif　\d+%/.test(fm.text), fm);
await win.keyboard.press('Escape'); await win.waitForTimeout(200);
await win.click('[data-tool="ocr"]'); await win.waitForTimeout(400);
await dragPdfBox(BOX.noto); s = await settled();
await win.click('#ocrPanel .fi-img .fi-row[data-key="builtin"] [data-fa="apply"]');
check('套用 思源黑體（內建）: back to the default font', (await A(() => window.__pdfapp.tbStyle().font)) === '');
await app.evaluate(({app}) => app.exit(0)).catch(() => {});
// the PDF's Helvetica: 套用 takes its stand-in; the PDF's fonts lead the font menu's list
({ app } = await launchPath(file2));
win = await app.firstWindow(); watch(win); await win.waitForTimeout(3500);
await win.evaluate(() => window.__pdfapp.fontReady());
await win.click('[data-view="single"]'); await win.waitForTimeout(500);
await win.click('[data-tool="ocr"]'); await win.waitForTimeout(500);
await win.evaluate(() => window.__pdfapp.fontIdGoogle(async () => ({ok:true, status:200, text:async () => ''})));
await dragPdfBox(LINE.helv); await win.waitForTimeout(300); await win.click('#ocrPanel [data-ot="font"]'); s = await settled();
await win.click('#ocrPanel .fi-pdf [data-fa="apply"]');
check('套用 a stand-in: Liberation Sans', (await A(() => window.__pdfapp.tbStyle().font)) === 'Liberation Sans');
await dragPdfBox(LINE.dejavu); s = await settled();
await win.click('#ocrPanel [data-o="byshape"]'); s = await settled();
{ const rec = await A(() => window.__pdfapp.fontIdRecent()), famOf = k => k === 'builtin' ? '' : k.slice(6);
  const next = s.groups[0].rows.find(x => (x.key.startsWith('local:') || x.key === 'builtin') && x.key !== 'local:DejaVu Serif');
  check('font menu list: the PDF\'s font first at 100%, then the shapes found', rec.length <= 5 && rec[0].family === 'DejaVu Serif' && rec[0].pct === 100 && !!next && rec[1].family === famOf(next.key) && rec[1].pct === next.pct && rec.filter(r => r.family === 'DejaVu Serif').length === 1, rec); }
check('no page errors (part 3)', pageErrors === 0, pageErrors);
await app.evaluate(({app}) => app.exit(0)).catch(() => {});

function __checkSorted(urls){
  if (!urls.length) return false;
  return urls.every(u => { const t = [...new URL(u).searchParams.get('text')]; return t.join('') === [...new Set(t)].sort((a, b) => a.codePointAt(0) - b.codePointAt(0)).join(''); });
}
console.log(failed ? `\n${failed} check(s) failed` : '\nall checks passed');
