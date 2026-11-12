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
const SCAN_JS = `window.__scan = function ({css, text, px, blur = .8, noise = 20, seed = 1, weight = 400, vert = false, invert = false}) {
  if (vert) return __scanColumn({css, text, px, blur, noise, seed, weight});
  const chars = [...text], f = weight + ' ' + px + 'px ' + css;
  const m = document.createElement('canvas').getContext('2d'); m.font = f; m.fontKerning = 'none';
  const W = Math.ceil(m.measureText(text).width + px * 2), H = Math.ceil(px * 2.2), x0 = px / 2, base = px * 1.4;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d', {willReadFrequently:true}); g.fillStyle = invert ? '#141414' : '#fff'; g.fillRect(0, 0, W, H);
  g.filter = blur > 0 ? 'blur(' + blur + 'px)' : 'none'; g.fillStyle = invert ? '#eee' : '#111'; g.font = f; g.fontKerning = 'none'; g.fillText(text, x0, base); g.filter = 'none';
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
};
window.__scanColumn = function ({css, text, px, blur, noise, seed, weight}) {
  const chars = [...text], f = weight + ' ' + px + 'px ' + css, W = Math.ceil(px * 2), H = Math.ceil(chars.length * px * 1.25 + px);
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d', {willReadFrequently:true}); g.fillStyle = '#fff'; g.fillRect(0, 0, W, H);
  g.filter = blur > 0 ? 'blur(' + blur + 'px)' : 'none'; g.fillStyle = '#111'; g.font = f;
  chars.forEach((ch, k) => g.fillText(ch, px * .5, px * 1.2 + k * px * 1.25)); g.filter = 'none';
  const im = g.getImageData(0, 0, W, H); let s = seed;
  const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
  for (let o = 0; o < im.data.length; o += 4) { const n = (rnd() - .5) * 2 * noise; for (let q = 0; q < 3; q++) im.data[o + q] = Math.max(0, Math.min(255, im.data[o + q] + n)); }
  g.putImageData(im, 0, 0);
  const k2 = document.createElement('canvas'); k2.width = W; k2.height = H; const kg = k2.getContext('2d', {willReadFrequently:true});
  const symbols = [];
  chars.forEach((ch, k) => { kg.fillStyle = '#fff'; kg.fillRect(0, 0, W, H); kg.fillStyle = '#000'; kg.font = f; kg.fillText(ch, px * .5, px * 1.2 + k * px * 1.25);
    const d = kg.getImageData(0, 0, W, H).data; let bx0 = 1e9, by0 = 1e9, bx1 = -1, by1 = -1;
    for (let yy = 0; yy < H; yy++) for (let xx = 0; xx < W; xx++) if (d[(yy * W + xx) * 4] < 128) { bx0 = Math.min(bx0, xx); bx1 = Math.max(bx1, xx); by0 = Math.min(by0, yy); by1 = Math.max(by1, yy); }
    if (bx1 >= 0) symbols.push({text:ch, confidence:95, bbox:{x0:bx0, y0:by0, x1:bx1 + 1, y1:by1 + 1}}); });
  const line = {x0:Math.min(...symbols.map(x => x.bbox.x0)), y0:Math.min(...symbols.map(x => x.bbox.y0)), x1:Math.max(...symbols.map(x => x.bbox.x1)), y1:Math.max(...symbols.map(x => x.bbox.y1))};
  symbols.forEach(x => { x.line = line; x.li = 1; x.vert = true; });
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
check('order keeps the reading order', r.order === 'QuckbrownfoxRag2025', r.order);
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
const sameBoxes = r => r.exact.length >= 6 && r.got.length === r.exact.length && r.exact.every(([ch, w, h]) => { const g = r.got.find(x => x[0] === ch); return g && Math.abs(g[1] - w) <= 2 && Math.abs(g[2] - h) <= 2; });
r = await A(() => { const s = __scan({css:'"WenQuanYi Zen Hei"', text:'中華民國臺灣字型', px:46, seed:12});
  const exact = FontId.glyphsFromImage(s.canvas, s.symbols).cjk.map(g => [g.ch, g.w, g.h]);
  // like Tesseract's boxes for Chinese: 60% as wide, off-centre by 15% of the width
  const loose = s.symbols.map(x => { const w = x.bbox.x1 - x.bbox.x0, c = (x.bbox.x0 + x.bbox.x1) / 2 + w * .15; return {...x, bbox:{...x.bbox, x0:Math.round(c - w * .3), x1:Math.round(c + w * .3)}}; });
  return {exact, got:FontId.glyphsFromImage(s.canvas, loose).cjk.map(g => [g.ch, g.w, g.h])}; });
check('loose OCR boxes: the whole glyph', sameBoxes(r), r);
r = await A(() => { const s = __scan({css:'"WenQuanYi Zen Hei"', text:'中華民國臺灣字型', px:46, seed:13, vert:true});
  const exact = FontId.glyphsFromImage(s.canvas, s.symbols).cjk.map(g => [g.ch, g.w, g.h]);
  // a column: each character's box only roughly placed (60% as tall, off-centre), the column's box right
  const rough = s.symbols.map(x => { const h = x.bbox.y1 - x.bbox.y0, c = (x.bbox.y0 + x.bbox.y1) / 2 - h * .12; return {...x, bbox:{...x.bbox, y0:Math.round(c - h * .3), y1:Math.round(c + h * .3)}}; });
  return {exact, got:FontId.glyphsFromImage(s.canvas, rough).cjk.map(g => [g.ch, g.w, g.h])}; });
check('vertical column, rough boxes: the whole glyph', sameBoxes(r), r);
r = await A(() => { const s = __scan({css:'"WenQuanYi Zen Hei"', text:'中華民國臺灣字型', px:46, seed:15});
  const exact = FontId.glyphsFromImage(s.canvas, s.symbols).cjk.map(g => [g.ch, g.w, g.h]).filter(g => g[0] !== '字');
  // Tesseract missed a character: its strokes must not make the characters next to it wider
  return {exact, got:FontId.glyphsFromImage(s.canvas, s.symbols.filter(x => x.text !== '字')).cjk.map(g => [g.ch, g.w, g.h])}; });
check('a character the OCR missed: its neighbours stay whole and alone', sameBoxes(r), r);
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
r = await top({css:'"DejaVu Serif"', text:L, px:42, blur:.8, noise:20, seed:14, invert:true}, C);
check('light text on a dark background', r.length > 0 && r[0].k === 'DejaVu Serif', r.slice(0, 3));
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

// ---- part 4: Google Fonts (a fake source serving local font files, no network) -------------------
({ app, win, A } = await open('fid4.pdf'));
await A(SCAN_JS); await A(() => FontId.ready());
const LIB = f => fs.readFileSync('/usr/share/fonts/truetype/liberation/' + f).toString('base64');
await A(fonts => {
  window.__gf = {urls:[], mode:'ok', fonts};
  // answers like fonts.googleapis.com/css2: one @font-face per family and weight, the files as data: URLs
  window.__gfFetch = async url => {
    __gf.urls.push(url);
    if (__gf.mode === 'throw') throw new TypeError('Failed to fetch');
    if (__gf.mode === 'hang') return new Promise(() => {});
    if (__gf.mode === 'first' && __gf.urls.length > 1) return new Promise(() => {});   // only the first request is answered
    const fams = new URL(url).searchParams.getAll('family').map(f => f.split(':')[0]);
    if (fams.includes('Bad Family')) return {ok:false, status:400, text:async () => ''};
    const css = fams.map(f => (__gf.fonts[f] || __gf.fonts.Arimo).map(([w, b64]) =>
      `@font-face {\n  font-family: '${f}';\n  font-style: normal;\n  font-weight: ${w};\n  src: url(data:font/ttf;base64,${b64}) format('truetype');\n}\n`).join('')).join('');
    return {ok:true, status:200, text:async () => css};
  };
}, {Tinos:[[400, LIB('LiberationSerif-Regular.ttf')], [700, LIB('LiberationSerif-Bold.ttf')]], Arimo:[[400, LIB('LiberationSans-Regular.ttf')]]});
const E = (family, bold = false) => ({family, zh:'', script:'latin', bold});
r = await A(async ents => { __gf.urls = []; __gf.mode = 'ok';
  const res = await FontId.loadGoogle(ents, 'ARag', {fetchCss:__gfFetch});
  return {urls:__gf.urls, n:res.cands.length, offline:res.offline, failed:res.failed, cands:res.cands.map(c => ({key:c.key, css:c.css, label:c.label, src:c.source, hasR:FontId.hasGlyph(c.css, 'R')}))}; },
  [E('Tinos', true), E('Arimo'), ...Array.from({length:10}, (_, k) => E('Fake Latin ' + k))]);
check('2 batched requests', r.urls.length === 2, r.urls.map(u => u.slice(0, 120)));
check('text= is the characters given', r.urls.every(u => new URL(u).searchParams.get('text') === 'ARag'), r.urls[0].slice(-40));
check('bold entries ask for 400;700', r.urls[0].includes('family=Tinos:wght@400;700') && r.urls[0].includes('family=Arimo&') && !/Fake\+Latin\+0:wght/.test(r.urls[0]), r.urls[0].slice(0, 160));
check('12 candidates usable', r.n === 12 && r.cands.every(c => /^"PDFE GF \d+"$/.test(c.css) && c.hasR && c.src === 'google' && c.key === 'google:' + c.label), r.cands.slice(0, 2));
r = await A(async ents => { const n0 = __gf.urls.length; const res = await FontId.loadGoogle(ents, 'ARag', {fetchCss:__gfFetch}); return {more:__gf.urls.length - n0, n:res.cands.length}; }, [E('Tinos', true), E('Arimo')]);
check('same family and characters: from the cache', r.more === 0 && r.n === 2, r);
r = await A(async ents => { __gf.urls = []; const res = await FontId.loadGoogle(ents, 'BRag', {fetchCss:__gfFetch}); return {urls:__gf.urls.length, failed:res.failed, n:res.cands.length, offline:res.offline}; }, [E('Tinos', true), E('Bad Family'), E('Arimo')]);
check('a bad name: retried one by one, the others load', r.urls === 4 && JSON.stringify(r.failed) === '["Bad Family"]' && r.n === 2 && !r.offline, r);
r = await A(async ents => { __gf.mode = 'throw'; const res = await FontId.loadGoogle(ents, 'CRag', {fetchCss:__gfFetch}); __gf.mode = 'ok'; return {offline:res.offline, n:res.cands.length}; }, [E('Tinos', true), E('Arimo')]);
check('no network: offline', r.offline && r.n === 0, r);
r = await A(async ents => { __gf.mode = 'hang'; const t0 = performance.now(); const res = await FontId.loadGoogle(ents, 'DRag', {fetchCss:__gfFetch, timeout:300}); __gf.mode = 'ok'; return {offline:res.offline, n:res.cands.length, ms:Math.round(performance.now() - t0)}; }, [E('Tinos', true), E('Arimo')]);
check('a request that never answers: offline after the timeout', r.offline && r.n === 0 && r.ms < 2000, r);
r = await A(async ents => { __gf.urls = []; __gf.mode = 'hang'; const t0 = performance.now(); const res = await FontId.loadGoogle(ents, 'ERag', {fetchCss:__gfFetch, timeout:300}); __gf.mode = 'ok';
  return {asked:__gf.urls.length, ms:Math.round(performance.now() - t0), offline:res.offline}; }, Array.from({length:140}, (_, k) => E('Fake Latin ' + k)));
check('no answer at all: no more batches asked, quick', r.offline && r.asked <= 6 && r.ms < 700, r);
r = await A(async ents => { __gf.urls = []; __gf.mode = 'first'; const t0 = performance.now(); const res = await FontId.loadGoogle(ents, 'FRag', {fetchCss:__gfFetch, timeout:5000, deadline:600}); __gf.mode = 'ok';
  return {ms:Math.round(performance.now() - t0), n:res.cands.length, offline:res.offline}; }, [E('Tinos', true), ...Array.from({length:30}, (_, k) => E('Fake Latin ' + k))]);
check('an overall deadline: what answered is kept', r.ms < 1500 && r.n >= 1 && !r.offline, r);
check('request characters: unique, in code point order', (await A(() => FontId.requestChars([...'RagRag2025'].map(ch => ({ch}))))) === '025Rag');
check('specimen page', (await A(() => FontId.specimenUrl('Noto Serif TC'))) === 'https://fonts.google.com/specimen/Noto+Serif+TC');
r = await A(async ents => { const sc = __scan({css:'"Liberation Serif"', text:'Quick brown fox Rag 2025', px:42, seed:11}), set = FontId.glyphsFromImage(sc.canvas, sc.symbols);
  const g = await FontId.loadGoogle(ents, FontId.requestChars(set.latin), {fetchCss:__gfFetch}); const res = await FontId.identify(set.latin, g.cands); return res.results.map(x => x.cand.key); }, [E('Tinos', true), E('Arimo')]);
check('a Liberation Serif scan: Tinos (same drawing) first', r[0] === 'google:Tinos', r);
check('the list: Chinese and Latin families, no Noto Sans TC', await A(() => FontId.GOOGLE.some(e => e.script === 'cjk' && e.family === 'Noto Serif TC' && e.zh === '思源宋體') && FontId.GOOGLE.filter(e => e.script === 'latin').length >= 100 && !FontId.GOOGLE.some(e => e.family === 'Noto Sans TC') && new Set(FontId.GOOGLE.map(e => e.family)).size === FontId.GOOGLE.length));
await app.close();

console.log(failed ? `\n${failed} check(s) failed` : '\nall checks passed');
