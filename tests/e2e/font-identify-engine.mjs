// 字型辨識的比對引擎（app/fontid.js）: the blank fallback font, glyphs out of a scanned picture, glyph-by-glyph
// matching against installed fonts, and the Google Fonts subset loader (with a fake source, no network).
import { launch } from './_env.mjs';
import { execFileSync } from 'child_process';
import fs from 'fs';

let failed = 0;
const check = (name, ok, detail = '') => { console.log(`${ok ? '✔' : '✘'} ${name}${detail !== '' ? '  ' + (typeof detail === 'string' ? detail : JSON.stringify(detail)) : ''}`); if (!ok) { failed++; process.exitCode = 1; } };
const open = async name => {
  const { app } = await launch(name);
  const win = await app.firstWindow(); win.on('pageerror', e => console.log('PAGEERR', e.message)); win.on('console', m => { if (m.type() === 'error') console.log('C', m.text().slice(0, 300)); });
  await win.waitForTimeout(3000);
  return { app, win, A:win.evaluate.bind(win) };
};

// a line of text as a scanner would see it: blurred, with fixed-seed speckle; the symbols are Tesseract-like boxes
// (each character's ink box from a clean drawing), confidence 95
const SCAN_JS = `window.__scan = function ({css, text, px, blur = .8, noise = 20, seed = 1, weight = 400}) {
  const chars = [...text], f = weight + ' ' + px + 'px ' + css;
  const m = document.createElement('canvas').getContext('2d'); m.font = f; m.fontKerning = 'none';
  const W = Math.ceil(m.measureText(text).width + px * 2), H = Math.ceil(px * 2.2), x0 = px / 2, base = px * 1.4;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d', {willReadFrequently:true}); g.fillStyle = '#fff'; g.fillRect(0, 0, W, H);
  g.filter = blur > 0 ? 'blur(' + blur + 'px)' : 'none'; g.fillStyle = '#111'; g.font = f; g.fontKerning = 'none'; g.fillText(text, x0, base); g.filter = 'none';
  const im = g.getImageData(0, 0, W, H); let s = seed;
  const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
  for (let o = 0; o < im.data.length; o += 4) { const n = (rnd() - .5) * 2 * noise; for (let q = 0; q < 3; q++) im.data[o + q] = Math.max(0, Math.min(255, im.data[o + q] + n)); }
  g.putImageData(im, 0, 0);
  const k = document.createElement('canvas'); k.width = W; k.height = H; const kg = k.getContext('2d', {willReadFrequently:true});
  const symbols = []; let x = x0;
  for (const ch of chars) {
    const adv = m.measureText(ch).width;
    kg.fillStyle = '#fff'; kg.fillRect(0, 0, W, H); kg.fillStyle = '#000'; kg.font = f; kg.fontKerning = 'none'; kg.fillText(ch, x, base);
    const L = Math.max(0, Math.floor(x - px)), R = Math.min(W, Math.ceil(x + adv + px)), d = kg.getImageData(L, 0, R - L, H).data;
    let bx0 = 1e9, by0 = 1e9, bx1 = -1, by1 = -1;
    for (let yy = 0; yy < H; yy++) for (let xx = 0; xx < R - L; xx++) if (d[(yy * (R - L) + xx) * 4] < 128) { bx0 = Math.min(bx0, xx + L); bx1 = Math.max(bx1, xx + L); by0 = Math.min(by0, yy); by1 = Math.max(by1, yy); }
    if (bx1 >= 0) symbols.push({text:ch, confidence:95, bbox:{x0:bx0, y0:by0, x1:bx1 + 1, y1:by1 + 1}});
    x += adv;
  }
  return {canvas:c, symbols};
};`;

// ---- part 1: the blank fallback font ----------------------------------------------------------
let { app, win, A } = await open('fid1.pdf');
await A(() => FontId.ready());
const hg = (css, ch) => A(([c, h]) => FontId.hasGlyph(c, h), [css, ch]);
check('blank font loaded', await A(() => document.fonts.check('16px "PDFE Blank"')));
check('latin font has A', await hg('"DejaVu Serif"', 'A'));
check('latin font lacks 中', !(await hg('"DejaVu Serif"', '中')));
check('cjk font has 中', await hg('"WenQuanYi Zen Hei"', '中'));
check('type 1 font unusable', !(await hg('"Bitstream Charter"', 'A')));
check('missing font', !(await hg('"No Such Font 123"', 'A')));
check('bundled font', await A(async () => { await document.fonts.load('16px "PDFE Sans"', '中'); return FontId.hasGlyph('"PDFE Sans"', '中'); }));
check('font string', (await A(() => FontId.fontString('"DejaVu Serif"', 50, 700))) === '700 50px "DejaVu Serif", "PDFE Blank"');
// ---- part 2: the glyphs to compare, out of a scanned picture ----------------------------------
await A(SCAN_JS);
let r = await A(() => { const s = __scan({css:'"DejaVu Serif"', text:'Quick brown fox Rag 2025 il1', px:46, blur:.8, noise:20, seed:1});
  s.symbols.push({text:'Z', confidence:40, bbox:s.symbols[0].bbox}, {text:',', confidence:99, bbox:s.symbols[1].bbox}, {text:'Q', confidence:96, bbox:s.symbols[0].bbox});
  const g = FontId.glyphsFromImage(s.canvas, s.symbols); return {latin:g.latin.map(x => x.ch), cjk:g.cjk.length, order:g.order, ok:g.latin.every(x => x.ink > 20 && x.grid.length === 2304)}; });
check('filters low confidence, punctuation, ilI1|', !r.latin.some(c => 'Z,il1|'.includes(c)), r.latin);
check('unique, capped at 16', new Set(r.latin).size === r.latin.length && r.latin.length === 16, r.latin);
check('preferred order first', r.latin.slice(0, 7).join('') === 'agkRQ25', r.latin);
check('grids filled', r.ok && r.cjk === 0);
check('order keeps the reading order', r.order === 'QuckbrownfoxRag2025Q', r.order);
r = await A(() => { const s = __scan({css:'"WenQuanYi Zen Hei"', text:'中華民國臺灣字型辨識測試範例永東國酬愛鬱靈鷹', px:46, seed:2});
  const g = FontId.glyphsFromImage(s.canvas, s.symbols); return {n:g.cjk.length, latin:g.latin.length, inkDown:g.cjk.every((x, k) => !k || g.cjk[k - 1].ink >= x.ink), uniq:new Set(g.cjk.map(x => x.ch)).size}; });
check('chinese: 16 of 21, most ink first', r.n === 16 && r.uniq === 16 && r.inkDown && r.latin === 0, r);
r = await A(() => { const s = __scan({css:'"DejaVu Serif"', text:'Quick brown fox Rag 2025', px:10, seed:3}); const g = FontId.glyphsFromImage(s.canvas, s.symbols); return g.latin.length + g.cjk.length; });
check('too small: none', r === 0, r);
r = await A(() => { const s = __scan({css:'"DejaVu Serif"', text:'Quick brown fox Rag 2025', px:46, seed:4}), c = document.createElement('canvas'); c.width = s.canvas.width; c.height = s.canvas.height;
  const g0 = c.getContext('2d'); g0.fillStyle = '#fff'; g0.fillRect(0, 0, c.width, c.height); const g = FontId.glyphsFromImage(c, s.symbols); return g.latin.length + g.cjk.length; });
check('blank paper: none', r === 0, r);
r = await A(() => { const s = __scan({css:'"DejaVu Serif"', text:'Quick brown fox Rag 2025', px:46, seed:5});
  const w0 = FontId.glyphsFromImage(s.canvas, s.symbols).latin.find(x => x.ch === 'R').w;
  const sym = s.symbols.find(x => x.text === 'R'); sym.bbox = {...sym.bbox, x0:sym.bbox.x0 - 6, x1:sym.bbox.x1 + 6};
  const w1 = FontId.glyphsFromImage(s.canvas, s.symbols).latin.find(x => x.ch === 'R').w; return {w0, w1}; });
check('neighbour ink left out', Math.abs(r.w1 - r.w0) <= 2, r);
await app.close();

// ---- part 3: matching a scan against the installed fonts ---------------------------------------
// the candidates: every font family on this machine (as the app lists them) and the bundled 思源黑體
const FAMS = [...new Set(execFileSync('fc-list', [':', 'family'], {encoding:'utf8'}).split('\n').map(l => l.split(',')[0].replace(/\\-/g, '-').trim()).filter(Boolean))].sort();
const C = [...FAMS.map(f => ({key:f, css:'"' + f.replace(/["\\]/g, '\\$&') + '"', label:f, source:'local', family:f})), {key:'builtin', css:'"PDFE Sans"', label:'思源黑體（內建）', source:'builtin', family:''}];
const L = 'Quick brown fox Rag 2025', CJ = '中華民國臺灣字型辨識測試範例永東國酬愛鬱靈鷹';
({ app, win, A } = await open('fid3.pdf'));
await A(SCAN_JS); await A(() => FontId.ready());
await A(t => document.fonts.load('46px "PDFE Sans"', t), CJ);
const top = (scan, cands) => A(async ([s, c]) => { const sc = __scan(s), set = FontId.glyphsFromImage(sc.canvas, sc.symbols);
  const r = await FontId.identify(set.cjk.length >= 3 ? set.cjk : set.latin, c); return r.results.map(x => ({k:x.cand.key, pct:x.pct, bold:x.bold, twins:x.twins.map(t => t.key)})); }, [scan, cands]);
r = await top({css:'"DejaVu Serif"', text:L, px:42, blur:.8, noise:20, seed:2}, C);
check('DejaVu Serif first, ≥ 70%, ahead of others', r[0].k === 'DejaVu Serif' && r[0].pct >= 70 && r[0].pct > r[1].pct, r.slice(0, 3));
check('Bitstream Charter (Type 1) left out', !r.some(x => x.k === 'Bitstream Charter' || x.twins.includes('Bitstream Charter')));
r = await top({css:'"Liberation Sans"', text:L, px:42, blur:.8, noise:20, seed:3, weight:700}, C);
check('Liberation Sans bold first, marked bold', r[0].k === 'Liberation Sans' && r[0].bold, r.slice(0, 3));
r = await top({css:'"WenQuanYi Zen Hei"', text:CJ, px:42, blur:.8, noise:20, seed:4}, C);
const wq = r[0] ? [r[0].k, ...r[0].twins] : [];
check('WenQuanYi Zen Hei first, its mono twin merged', wq.includes('WenQuanYi Zen Hei') && wq.includes('WenQuanYi Zen Hei Mono'), r.slice(0, 3));
r = await top({css:'"PDFE Sans"', text:CJ, px:42, blur:.8, noise:20, seed:5}, C);
check('bundled 思源黑體 first', r[0].k === 'builtin', r.slice(0, 3));
r = await top({css:'"DejaVu Serif"', text:L, px:150, blur:1.5, noise:20, seed:6}, C);
check('very large glyphs', r[0].k === 'DejaVu Serif', r.slice(0, 3));
r = await top({css:'"WenQuanYi Zen Hei"', text:CJ, px:42, seed:7}, C.filter(c => c.key === 'DejaVu Serif'));
check('no candidate has the glyphs: no results', Array.isArray(r) && r.length === 0, r);
r = await A(async c => { const sc = __scan({css:'"DejaVu Serif"', text:'Quick brown fox Rag 2025', px:42, seed:8}), set = FontId.glyphsFromImage(sc.canvas, sc.symbols);
  return await FontId.identify(set.latin, c, {stop:() => true}); }, C);
check('stop: null', r === null, r);
// the same outlines once installed and once as a web font: one row, the installed one first
const libSerif = fs.readFileSync('/usr/share/fonts/truetype/liberation/LiberationSerif-Regular.ttf').toString('base64');
r = await A(async b64 => { const ff = new FontFace('PDFE GF T', Uint8Array.from(atob(b64), c => c.charCodeAt(0))); await ff.load(); document.fonts.add(ff);
  const sc = __scan({css:'"Liberation Serif"', text:'Quick brown fox Rag 2025', px:42, seed:9}), set = FontId.glyphsFromImage(sc.canvas, sc.symbols);
  const a = await FontId.identify(set.latin, [{key:'local:Liberation Serif', css:'"Liberation Serif"', label:'Liberation Serif', source:'local'}]);
  const g = await FontId.identify(set.latin, [{key:'google:Tinos', css:'"PDFE GF T"', label:'Tinos', source:'google'}], {sigma:a.sigma, keep:a.keep});
  const m = FontId.mergeResults(g.results, a.results); return m.map(x => ({k:x.cand.key, twins:x.twins.map(t => t.key)})); }, libSerif);
check('merge: one row, installed first', r.length === 1 && r[0].k === 'local:Liberation Serif' && r[0].twins.includes('google:Tinos'), r);
// hundreds of fonts: quick enough, and the window keeps responding meanwhile
r = await A(async c => { const many = []; for (let k = 0; k < 25; k++) for (const x of c) many.push({...x, key:x.key + '|' + k});
  const sc = __scan({css:'"DejaVu Serif"', text:'Quick brown fox Rag 2025', px:42, seed:10}), set = FontId.glyphsFromImage(sc.canvas, sc.symbols);
  // the window keeps drawing: the longest time between two frames while matching runs (up to its end)
  let last = performance.now(), gap = 0, on = true, frames = 0; const tick = () => { const t = performance.now(); gap = Math.max(gap, t - last); last = t; frames++; if (on) requestAnimationFrame(tick); }; requestAnimationFrame(tick);
  const t0 = performance.now(), res = await FontId.identify(set.latin, many); const ms = performance.now() - t0; on = false; gap = Math.max(gap, performance.now() - last);
  return {n:many.length, ms:Math.round(ms), gap:Math.round(gap), frames, first:res.results[0].cand.key}; }, C);
check('500+ candidates: < 8 s, never stalls > 100 ms', r.n >= 500 && r.ms < 8000 && r.gap < 100 && r.first.startsWith('DejaVu Serif|'), r);
await app.close();

console.log(failed ? `\n${failed} check(s) failed` : '\nall checks passed');
