/* ====================================================================
   字型辨識 (font identification): which font a piece of scanned text is set in, glyph by glyph. Plain canvas and
   arithmetic: nothing here touches the document. The 文字辨識 window (app/index.html) gives it the glyphs (the
   picture and Tesseract's box for each character) and shows what it finds.
   ==================================================================== */
(() => {
  'use strict';
  // "PDFE Blank" maps every code point to an empty glyph: a character drawn as `<font>, "PDFE Blank"` comes out
  // blank when the font lacks it, instead of in some fallback font that would be compared by mistake
  let blank = null;
  const ready = () => blank || (blank = (async () => {
    const ff = new FontFace('PDFE Blank', 'url(fonts/blank.ttf)');
    await ff.load(); document.fonts.add(ff);
  })());
  const fontString = (css, px, weight = 400) => `${weight} ${px}px ${css}, "PDFE Blank"`;
  const measure = document.createElement('canvas').getContext('2d');
  // does the font draw anything for ch (a missing character falls through to the blank font: no ink)
  function hasGlyph(css, ch, weight = 400){
    measure.font = fontString(css, 100, weight);
    const m = measure.measureText(ch);
    return m.actualBoundingBoxAscent + m.actualBoundingBoxDescent > 1;
  }

  /* ---- the glyphs to compare, out of the scanned picture -------------------------------------------------
     Each glyph is fitted (keeping its shape) into an N×N grid of ink coverage, 0 = paper … 1 = ink. */
  const N = 48;
  const HAN = /\p{Script=Han}/u, LATIN = /[A-Za-z0-9]/, SKIP = 'ilI1|';
  const PREFER = 'agekyRGQ235';   // letters whose shapes differ most between fonts come first
  function grayOf(img){
    const W = img.width, H = img.height, d = img.getContext('2d', {willReadFrequently:true}).getImageData(0, 0, W, H).data, g = new Uint8Array(W * H);
    for (let k = 0, o = 0; k < g.length; k++, o += 4) g[k] = (d[o] * 77 + d[o + 1] * 150 + d[o + 2] * 29) >> 8;
    return g;
  }
  // ink and paper of the whole picture: the darkest 0.2% and the 60th percentile
  function levels(g){
    const hist = new Uint32Array(256); for (let k = 0; k < g.length; k++) hist[g[k]]++;
    const at = q => { const lim = g.length * q; let n = 0; for (let v = 0; v < 256; v++) { n += hist[v]; if (n > lim) return v; } return 255; };
    return {fg:at(.002), bg:at(.6)};
  }
  // the grid of a box in a grey picture (bg = paper, fg = ink level)
  function gridOf(gray, W, box, bg, fg){
    const w = box.x1 - box.x0, h = box.y1 - box.y0, s = (N - 4) / Math.max(w, h), ox = (N - w * s) / 2, oy = (N - h * s) / 2;
    const grid = new Float32Array(N * N), span = Math.max(1, bg - fg);
    const cov = (x, y) => { const v = (bg - gray[(box.y0 + y) * W + box.x0 + x]) / span; return v < 0 ? 0 : v > 1 ? 1 : v; };
    if (s >= 1) {   // a small glyph: each cell takes the nearest pixel
      for (let gy = 0; gy < N; gy++) for (let gx = 0; gx < N; gx++) {
        const x = Math.floor((gx + .5 - ox) / s), y = Math.floor((gy + .5 - oy) / s);
        if (x >= 0 && y >= 0 && x < w && y < h) grid[gy * N + gx] = cov(x, y);
      }
    } else {        // a large one: each cell averages the pixels that land in it
      const cnt = new Float32Array(N * N);
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const k = Math.min(N - 1, Math.floor(oy + (y + .5) * s)) * N + Math.min(N - 1, Math.floor(ox + (x + .5) * s)); grid[k] += cov(x, y); cnt[k]++;
      }
      for (let k = 0; k < grid.length; k++) if (cnt[k]) grid[k] /= cnt[k];
    }
    return grid;
  }
  // the glyph's own ink inside an OCR box: the strokes (8-connected) that lie mostly inside it. Strokes of the
  // neighbours that reach into the box, and specks, are left out. The strokes are followed up to half the box
  // height outside it, so a neighbour's stroke is judged as a whole.
  function cleanBox(gray, W, H, b, T){
    const m = Math.max(2, Math.round((b.y1 - b.y0) / 2));
    const X0 = Math.max(0, b.x0 - m), Y0 = Math.max(0, b.y0 - m), X1 = Math.min(W, b.x1 + m), Y1 = Math.min(H, b.y1 + m), w = X1 - X0, h = Y1 - Y0;
    if (w <= 0 || h <= 0) return null;
    const seen = new Uint8Array(w * h), stack = [];
    let x0 = Infinity, y0 = Infinity, x1 = -1, y1 = -1;
    for (let start = 0; start < w * h; start++) {
      if (seen[start] || gray[(Y0 + ((start / w) | 0)) * W + X0 + start % w] >= T) continue;
      let n = 0, inside = 0, cx0 = Infinity, cy0 = Infinity, cx1 = -1, cy1 = -1;
      seen[start] = 1; stack.push(start);
      while (stack.length) {
        const q = stack.pop(), qx = q % w, qy = (q / w) | 0, ax = X0 + qx, ay = Y0 + qy; n++;
        if (ax >= b.x0 && ax < b.x1 && ay >= b.y0 && ay < b.y1) inside++;
        if (ax < cx0) cx0 = ax; if (ax > cx1) cx1 = ax; if (ay < cy0) cy0 = ay; if (ay > cy1) cy1 = ay;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          const nx = qx + dx, ny = qy + dy; if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          const r = ny * w + nx; if (!seen[r] && gray[(Y0 + ny) * W + X0 + nx] < T) { seen[r] = 1; stack.push(r); }
        }
      }
      if (n >= 3 && inside / n > .5) { x0 = Math.min(x0, cx0); y0 = Math.min(y0, cy0); x1 = Math.max(x1, cx1); y1 = Math.max(y1, cy1); }
    }
    return x1 < 0 ? null : {x0, y0, x1:x1 + 1, y1:y1 + 1};
  }
  // the glyphs worth comparing: confident, a letter / digit / Han character, not too small, each character once
  // (its most confident reading); Chinese with the most strokes first, Latin with the telling letters first.
  // order: the characters that passed, in reading order (for the sample text)
  function glyphsFromImage(img, symbols, {max = 16} = {}){
    const out = {cjk:[], latin:[], order:''}, W = img.width, H = img.height;
    if (!W || !H) return out;
    const gray = grayOf(img), {fg, bg} = levels(gray);
    if (bg - fg < 40) return out;   // no ink to speak of
    const T = (fg + bg) / 2, best = new Map();
    for (const s of symbols || []) {
      const ch = s && s.text; if (!ch || [...ch].length !== 1 || !(s.confidence >= 75) || SKIP.includes(ch)) continue;
      const kind = HAN.test(ch) ? 'cjk' : LATIN.test(ch) ? 'latin' : ''; if (!kind) continue;
      const b = cleanBox(gray, W, H, s.bbox, T); if (!b || b.y1 - b.y0 < 10) continue;
      out.order += ch;
      const cur = best.get(ch); if (!cur || s.confidence > cur.conf) best.set(ch, {kind, conf:s.confidence, b});
    }
    for (const [ch, {kind, b}] of best) {
      const grid = gridOf(gray, W, b, bg, fg); let ink = 0; for (let k = 0; k < grid.length; k++) ink += grid[k];
      out[kind].push({ch, w:b.x1 - b.x0, h:b.y1 - b.y0, ink, grid});
    }
    const pref = ch => { const k = PREFER.indexOf(ch); return k < 0 ? PREFER.length : k; };
    out.cjk = out.cjk.sort((a, b) => b.ink - a.ink).slice(0, max);
    out.latin = out.latin.sort((a, b) => pref(a.ch) - pref(b.ch) || b.ink - a.ink).slice(0, max);
    return out;
  }

  /* ---- matching: each candidate font draws the same characters, at the scanned glyph's height and blurred like
     the scan, and the two are compared cell by cell ------------------------------------------------------
     per glyph:  shape (how far each one's ink lies from the other's) × √(ink amount ratio) × size agreement
                 × font-size agreement (one font draws all its glyphs at one size: fonts whose x-height or cap
                 height differ from the scan's are pulled apart)
     per font:   the average over the glyphs. Two stages: every font on 6 glyphs, then the best 24 on all of them,
                 regular and bold, blurred like the scan. Glyphs no good font matches (OCR misreads, bad boxes)
                 are left out of the second stage. */
  const SIGMAS = [0, .5, 1, 1.5, 2, 2.5], MAX_H = 64;
  // let the window draw and handle input between chunks of work (a message task: no 4 ms timer clamp, and unlike
  // scheduler.yield() it does not jump ahead of the window's own drawing)
  const yieldPort = new MessageChannel(), yieldWaiting = [];
  yieldPort.port1.onmessage = () => { const r = yieldWaiting.shift(); if (r) r(); };
  const yieldNow = () => new Promise(r => { yieldWaiting.push(r); yieldPort.port2.postMessage(0); });
  // 3-4 chamfer distance from each cell to the nearest ink cell, in cells
  function distOf(mask){
    const INF = 1e6, d = new Float32Array(N * N);
    for (let k = 0; k < d.length; k++) d[k] = mask[k] ? 0 : INF;
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const k = y * N + x; let v = d[k];
      if (x) v = Math.min(v, d[k - 1] + 3);
      if (y) { v = Math.min(v, d[k - N] + 3); if (x) v = Math.min(v, d[k - N - 1] + 4); if (x < N - 1) v = Math.min(v, d[k - N + 1] + 4); }
      d[k] = v;
    }
    for (let y = N - 1; y >= 0; y--) for (let x = N - 1; x >= 0; x--) {
      const k = y * N + x; let v = d[k];
      if (x < N - 1) v = Math.min(v, d[k + 1] + 3);
      if (y < N - 1) { v = Math.min(v, d[k + N] + 3); if (x < N - 1) v = Math.min(v, d[k + N + 1] + 4); if (x) v = Math.min(v, d[k + N - 1] + 4); }
      d[k] = v;
    }
    for (let k = 0; k < d.length; k++) d[k] /= 3;
    return d;
  }
  function shapeOf(grid){
    const mask = new Uint8Array(N * N); let n = 0;
    for (let k = 0; k < mask.length; k++) if (grid[k] >= .5) { mask[k] = 1; n++; }
    return {mask, n, dist:distOf(mask)};
  }
  const srcShapes = new WeakMap();   // a scanned glyph's mask and distances, worked out once
  const shapeOfGlyph = g => { let v = srcShapes.get(g); if (!v) { v = shapeOf(g.grid); srcShapes.set(g, v); } return v; };
  const rc = document.createElement('canvas'), rg = rc.getContext('2d', {willReadFrequently:true});
  // ch in the candidate font, its ink as tall as the scanned glyph (at most MAX_H px), blurred like the scan;
  // null when the font lacks it. P: the font size it took, at the scan's scale
  function candGlyph(css, ch, weight, h, sigma){
    rg.filter = 'none'; rg.font = fontString(css, 100, weight);
    const m = rg.measureText(ch), asc = m.actualBoundingBoxAscent, desc = m.actualBoundingBoxDescent, ink = asc + desc;
    if (!(ink > 1)) return null;
    const H = Math.min(h, MAX_H), sc = H / ink, sg = sigma * H / h, pad = Math.ceil(3 * sg) + 2;
    const W = Math.ceil((m.actualBoundingBoxLeft + m.actualBoundingBoxRight) * sc) + 2 * pad, HH = Math.ceil(ink * sc) + 2 * pad;
    if (W < 1 || HH < 1) return null;
    if (rc.width < W) rc.width = W; if (rc.height < HH) rc.height = HH;
    rg.fillStyle = '#fff'; rg.fillRect(0, 0, W, HH);
    rg.filter = sg > 0 ? `blur(${sg}px)` : 'none'; rg.fillStyle = '#000'; rg.font = fontString(css, 100 * sc, weight);
    rg.textBaseline = 'alphabetic'; rg.textAlign = 'left'; rg.fontKerning = 'none';
    rg.fillText(ch, pad + m.actualBoundingBoxLeft * sc, pad + asc * sc); rg.filter = 'none';
    const d = rg.getImageData(0, 0, W, HH).data, gray = new Uint8Array(W * HH); let fg = 255;
    for (let k = 0, o = 0; k < gray.length; k++, o += 4) { const v = (d[o] * 77 + d[o + 1] * 150 + d[o + 2] * 29) >> 8; gray[k] = v; if (v < fg) fg = v; }
    if (fg > 200) return null;
    const T = (fg + 255) / 2; let x0 = Infinity, y0 = Infinity, x1 = -1, y1 = -1;
    for (let y = 0; y < HH; y++) for (let x = 0; x < W; x++) if (gray[y * W + x] < T) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    if (x1 < 0) return null;
    const back = h / H;   // to the scan's scale
    return {P:100 * sc * back, w:(x1 + 1 - x0) * back, h:(y1 + 1 - y0) * back, grid:gridOf(gray, W, {x0, y0, x1:x1 + 1, y1:y1 + 1}, 255, fg)};
  }
  const median = a => { const s = [...a].sort((x, y) => x - y); return s[s.length >> 1]; };
  // how well one font matches the glyphs: {score, per:[{ch, v}], grids} or null when it lacks more than 30% of them
  function fontScore(css, glyphs, weight, sigma){
    const pairs = []; let miss = 0;
    for (const g of glyphs) {
      const r = candGlyph(css, g.ch, weight, g.h, sigma);
      if (!r) { if (++miss > glyphs.length * .3) return null; continue; }
      const a = shapeOfGlyph(g), b = shapeOf(r.grid);
      if (!a.n || !b.n) { if (++miss > glyphs.length * .3) return null; continue; }
      let s1 = 0, s2 = 0;
      for (let k = 0; k < a.mask.length; k++) { if (a.mask[k]) s1 += b.dist[k]; if (b.mask[k]) s2 += a.dist[k]; }
      const d = (s1 / a.n + s2 / b.n) / 2;
      pairs.push({g, r, shape:Math.exp(-d / 1.5), wgt:Math.min(a.n, b.n) / Math.max(a.n, b.n)});
    }
    if (!pairs.length) return null;
    const k = median(pairs.map(p => p.g.h / p.r.h)), Pm = median(pairs.map(p => p.r.P));
    const ratio = (x, y) => Math.min(x, y) / Math.max(x, y);
    const per = pairs.map(p => ({ch:p.g.ch, v:p.shape * Math.sqrt(p.wgt) * ratio(p.g.w, k * p.r.w) * ratio(p.g.h, k * p.r.h) * ratio(p.r.P, Pm)}));
    return {score:per.reduce((t, x) => t + x.v, 0) / per.length, per, grids:pairs.map(p => p.r.grid)};
  }
  // the same drawing (fonts that are copies of each other) gives the same hash
  function hashOf(grids){
    let h = 2166136261;
    for (const g of grids) for (let k = 0; k < g.length; k++) { h ^= g[k] >= .5 ? 1 : 0; h = Math.imul(h, 16777619); }
    return (h >>> 0).toString(16) + ':' + grids.length;
  }
  // fonts with the same drawing become one result (the better scored one first; at a tie the installed one)
  function mergeResults(...lists){
    const by = new Map(), rank = r => r.cand.source === 'google' ? 1 : 0;
    for (const list of lists) for (const r of list || []) {
      const cur = by.get(r.hash);
      if (!cur) { by.set(r.hash, {...r, twins:[...(r.twins || [])]}); continue; }
      if (r.score > cur.score + 1e-9 || (Math.abs(r.score - cur.score) <= 1e-9 && rank(r) < rank(cur))) by.set(r.hash, {...r, twins:[cur.cand, ...cur.twins, ...(r.twins || [])]});
      else cur.twins.push(r.cand, ...(r.twins || []));
    }
    return [...by.values()].sort((a, b) => b.score - a.score);
  }
  // which of the candidate fonts the glyphs are set in, best first. sigma / keep: take the blur and the glyph set
  // of an earlier run (the Google fonts are compared after the installed ones, on the same terms). null if stop()
  async function identify(glyphs, cands, {sigma = null, keep = null, onProgress = null, stop = null} = {}){
    await ready();
    const empty = {results:[], sigma:sigma == null ? 0 : sigma, keep:keep || glyphs.map(g => g.ch)};
    if (!glyphs.length || !cands.length) return empty;
    const chars = glyphs.map(g => g.ch).join('');
    for (const c of cands) if (c.source !== 'local') {   // web and bundled fonts: their glyphs must be loaded to be measured
      try { await document.fonts.load(fontString(c.css, 50, 400), chars); await document.fonts.load(fontString(c.css, 50, 700), chars); } catch (_) {}
    }
    const nTop = Math.min(24, cands.length), total = cands.length + (keep ? 0 : 2 * nTop) + (sigma == null ? SIGMAS.length : 0) + nTop;
    let done = 0, last = performance.now();
    const step = async () => { done++; if (performance.now() - last > 12) { if (onProgress) onProgress(done, total); await yieldNow(); last = performance.now(); } return stop && stop(); };
    // 1. every font, on the 6 most telling glyphs
    const g6 = glyphs.slice(0, 6), s1 = [];
    for (const c of cands) { const r = fontScore(c.css, g6, 400, 0); if (r) s1.push({c, v:r.score}); if (await step()) return null; }
    s1.sort((a, b) => b.v - a.v);
    const top = s1.slice(0, 24).map(x => x.c);
    if (!top.length) return empty;
    // 2. glyphs that none of the best fonts matches are misreads: left out from here on
    let kept = keep ? glyphs.filter(g => keep.includes(g.ch)) : glyphs, best = null;
    if (!keep) {
      const hi = new Map(glyphs.map(g => [g.ch, 0]));
      for (const c of top) {
        for (const w of [400, 700]) {
          const r = fontScore(c.css, glyphs, w, 0); if (!r) continue;
          for (const p of r.per) hi.set(p.ch, Math.max(hi.get(p.ch), p.v));
          if (!best || r.score > best.v) best = {c, w, v:r.score};
          if (await step()) return null;
        }
      }
      const m = median([...hi.values()]);
      kept = glyphs.filter(g => hi.get(g.ch) >= m * .6);
    }
    if (!kept.length) return {...empty, keep:[]};
    // 3. the scan's blur: whichever makes the best font match best
    if (sigma == null) {
      const ref = best || {c:top[0], w:400}; let bv = -1; sigma = 0;
      for (const sg of SIGMAS) { const r = fontScore(ref.c.css, kept, ref.w, sg); if (r && r.score > bv) { bv = r.score; sigma = sg; } if (await step()) return null; }
    }
    // 4. the best 24 again on all the glyphs, regular and bold, blurred like the scan
    const res = [];
    for (const c of top) {
      const a = fontScore(c.css, kept, 400, sigma), b = fontScore(c.css, kept, 700, sigma);
      if (a || b) {
        const bold = !!(b && (!a || b.score - a.score >= .02)), score = bold || !a ? b.score : a.score;
        res.push({cand:c, score, pct:Math.round(score * 100), bold, hash:hashOf((a || b).grids), twins:[]});
      }
      if (await step()) return null;
    }
    if (onProgress) onProgress(total, total);
    return {results:mergeResults(res), sigma, keep:kept.map(g => g.ch)};
  }

  /* ---- Google Fonts: free fonts compared online. Only the characters being compared are downloaded (the CSS2
     API's text= subset: a few KB), as web fonts under names of our own ("PDFE GF n") so an installed font of the
     same name cannot stand in for them. ----------------------------------------------------------------
     [family, Chinese name or '', 'cjk' | 'latin', 1 = has a bold (700) weight]; names and weights are checked
     against Google by scripts/check-google-fonts.mjs. Noto Sans TC is left out: it is the bundled 思源黑體. */
  // google-fonts-list:start
  const GOOGLE_LIST = [
    ['Noto Serif TC', '思源宋體', 'cjk', 1], ['Noto Sans HK', '思源黑體 香港', 'cjk', 1], ['Noto Serif HK', '思源宋體 香港', 'cjk', 1],
    ['LXGW WenKai TC', '霞鶩文楷 TC', 'cjk', 1], ['LXGW WenKai Mono TC', '霞鶩文楷等寬 TC', 'cjk', 1], ['Cactus Classical Serif', '仙人掌明體', 'cjk', 0],
    ['Chiron Hei HK', '昭源黑體', 'cjk', 1], ['Chiron Sung HK', '昭源宋體', 'cjk', 1], ['Chiron GoRound TC', '昭源甜圓體', 'cjk', 1],
    ['Huninn', '粉圓', 'cjk', 0], ['Iansui', '芫荽', 'cjk', 0], ['Noto Sans JP', '思源黑體 日文', 'cjk', 1], ['Noto Serif JP', '思源宋體 日文', 'cjk', 1],
    ['Zen Maru Gothic', '', 'cjk', 1], ['Zen Kaku Gothic New', '', 'cjk', 1], ['Zen Old Mincho', '', 'cjk', 1], ['Shippori Mincho', '', 'cjk', 1],
    ['Kaisei Decol', '', 'cjk', 1], ['Kaisei Opti', '', 'cjk', 1], ['Kaisei Tokumin', '', 'cjk', 1], ['Klee One', '', 'cjk', 0],
    ['Kosugi', '', 'cjk', 0], ['Kosugi Maru', '', 'cjk', 0], ['M PLUS 1p', '', 'cjk', 1], ['M PLUS Rounded 1c', '', 'cjk', 1], ['Murecho', '', 'cjk', 1],
    ['Sawarabi Mincho', '', 'cjk', 0], ['Sawarabi Gothic', '', 'cjk', 0], ['BIZ UDGothic', '', 'cjk', 1], ['BIZ UDPGothic', '', 'cjk', 1],
    ['BIZ UDMincho', '', 'cjk', 1], ['BIZ UDPMincho', '', 'cjk', 1], ['Yuji Syuku', '', 'cjk', 0], ['Hina Mincho', '', 'cjk', 0],
    ['Kiwi Maru', '', 'cjk', 0], ['Dela Gothic One', '', 'cjk', 0], ['Yomogi', '', 'cjk', 0],
    ['Roboto', '', 'latin', 1], ['Open Sans', '', 'latin', 1], ['Noto Sans', '', 'latin', 1], ['Noto Serif', '', 'latin', 1], ['Lato', '', 'latin', 1],
    ['Montserrat', '', 'latin', 1], ['Poppins', '', 'latin', 1], ['Inter', '', 'latin', 1], ['Roboto Condensed', '', 'latin', 1], ['Source Sans 3', '', 'latin', 1],
    ['Oswald', '', 'latin', 1], ['Raleway', '', 'latin', 1], ['Nunito', '', 'latin', 1], ['Nunito Sans', '', 'latin', 1], ['Ubuntu', '', 'latin', 1],
    ['Rubik', '', 'latin', 1], ['Merriweather', '', 'latin', 1], ['Merriweather Sans', '', 'latin', 1], ['Playfair Display', '', 'latin', 1],
    ['Roboto Mono', '', 'latin', 1], ['Roboto Slab', '', 'latin', 1], ['PT Sans', '', 'latin', 1], ['PT Serif', '', 'latin', 1], ['Lora', '', 'latin', 1],
    ['Work Sans', '', 'latin', 1], ['Mulish', '', 'latin', 1], ['DM Sans', '', 'latin', 1], ['DM Serif Display', '', 'latin', 0], ['DM Serif Text', '', 'latin', 0],
    ['Fira Sans', '', 'latin', 1], ['Fira Code', '', 'latin', 1], ['Quicksand', '', 'latin', 1], ['Barlow', '', 'latin', 1], ['Barlow Condensed', '', 'latin', 1],
    ['Kanit', '', 'latin', 1], ['Titillium Web', '', 'latin', 1], ['IBM Plex Sans', '', 'latin', 1], ['IBM Plex Serif', '', 'latin', 1], ['IBM Plex Mono', '', 'latin', 1],
    ['Heebo', '', 'latin', 1], ['Karla', '', 'latin', 1], ['Libre Franklin', '', 'latin', 1], ['Josefin Sans', '', 'latin', 1], ['Manrope', '', 'latin', 1],
    ['Archivo', '', 'latin', 1], ['Archivo Narrow', '', 'latin', 1], ['Cabin', '', 'latin', 1], ['Bitter', '', 'latin', 1], ['Libre Baskerville', '', 'latin', 1],
    ['EB Garamond', '', 'latin', 1], ['Cormorant Garamond', '', 'latin', 1], ['Crimson Text', '', 'latin', 1], ['Crimson Pro', '', 'latin', 1],
    ['Source Serif 4', '', 'latin', 1], ['Source Code Pro', '', 'latin', 1], ['Anton', '', 'latin', 0], ['Bebas Neue', '', 'latin', 0], ['Abril Fatface', '', 'latin', 0],
    ['Pacifico', '', 'latin', 0], ['Dancing Script', '', 'latin', 1], ['Caveat', '', 'latin', 1], ['Lobster', '', 'latin', 0], ['Great Vibes', '', 'latin', 0],
    ['Satisfy', '', 'latin', 0], ['Shadows Into Light', '', 'latin', 0], ['Indie Flower', '', 'latin', 0], ['Permanent Marker', '', 'latin', 0], ['Amatic SC', '', 'latin', 1],
    ['Courier Prime', '', 'latin', 1], ['Space Mono', '', 'latin', 1], ['Space Grotesk', '', 'latin', 1], ['Inconsolata', '', 'latin', 1], ['JetBrains Mono', '', 'latin', 1],
    ['Zilla Slab', '', 'latin', 1], ['Arvo', '', 'latin', 1], ['Old Standard TT', '', 'latin', 1], ['Cinzel', '', 'latin', 1], ['Spectral', '', 'latin', 1],
    ['Alegreya', '', 'latin', 1], ['Alegreya Sans', '', 'latin', 1], ['Vollkorn', '', 'latin', 1], ['Cardo', '', 'latin', 1], ['Domine', '', 'latin', 1],
    ['Noticia Text', '', 'latin', 1], ['Sora', '', 'latin', 1], ['Outfit', '', 'latin', 1], ['Lexend', '', 'latin', 1], ['Plus Jakarta Sans', '', 'latin', 1],
    ['Figtree', '', 'latin', 1], ['Public Sans', '', 'latin', 1], ['Red Hat Display', '', 'latin', 1], ['Red Hat Text', '', 'latin', 1], ['Overpass', '', 'latin', 1],
    ['Assistant', '', 'latin', 1], ['Hind', '', 'latin', 1], ['Mukta', '', 'latin', 1], ['Exo 2', '', 'latin', 1], ['Prompt', '', 'latin', 1],
    ['Signika', '', 'latin', 1], ['Asap', '', 'latin', 1], ['Varela Round', '', 'latin', 0], ['Comfortaa', '', 'latin', 1], ['Righteous', '', 'latin', 0],
    ['Fredoka', '', 'latin', 1], ['Baloo 2', '', 'latin', 1], ['Questrial', '', 'latin', 0], ['Maven Pro', '', 'latin', 1], ['Encode Sans', '', 'latin', 1],
    ['Chivo', '', 'latin', 1], ['Saira', '', 'latin', 1], ['Rajdhani', '', 'latin', 1], ['Teko', '', 'latin', 1], ['Orbitron', '', 'latin', 1],
    ['Alfa Slab One', '', 'latin', 0], ['Russo One', '', 'latin', 0], ['Special Elite', '', 'latin', 0], ['Arimo', '', 'latin', 1], ['Tinos', '', 'latin', 1],
    ['Cousine', '', 'latin', 1], ['Carlito', '', 'latin', 1], ['Caladea', '', 'latin', 1], ['Gelasio', '', 'latin', 1], ['Libre Caslon Text', '', 'latin', 1],
    ['Frank Ruhl Libre', '', 'latin', 1], ['Prata', '', 'latin', 0], ['Noto Sans Mono', '', 'latin', 1], ['Ubuntu Mono', '', 'latin', 1], ['Libre Bodoni', '', 'latin', 1],
    ['Bodoni Moda', '', 'latin', 1], ['Instrument Serif', '', 'latin', 0], ['Newsreader', '', 'latin', 1], ['Fraunces', '', 'latin', 1], ['Literata', '', 'latin', 1],
  ];
  // google-fonts-list:end
  const GOOGLE = GOOGLE_LIST.map(([family, zh, script, bold]) => ({family, zh, script, bold:!!bold}));
  // the characters asked of Google: each once, in code point order (not the order of the text)
  const requestChars = glyphs => [...new Set(glyphs.map(g => g.ch))].sort((a, b) => a.codePointAt(0) - b.codePointAt(0)).join('');
  const specimenUrl = family => 'https://fonts.google.com/specimen/' + String(family).replace(/ /g, '+');
  const familyParam = e => 'family=' + encodeURIComponent(e.family).replace(/%20/g, '+') + (e.bold ? ':wght@400;700' : '');
  const gfCache = new Map();   // 'family|chars' → its candidate, for the rest of this run
  let gfAlias = 0;
  const withTimeout = (p, ms) => new Promise((res, rej) => { const t = setTimeout(() => rej(new Error('timeout')), ms); p.then(v => { clearTimeout(t); res(v); }, e => { clearTimeout(t); rej(e); }); });
  // the @font-face rules of a CSS2 answer: [{family, weight, src}]
  function parseFaces(css){
    const out = [];
    for (const m of String(css).matchAll(/@font-face\s*\{([^}]*)\}/g)) {
      const fam = /font-family:\s*['"]?([^;'"]+)['"]?\s*;/.exec(m[1]), w = /font-weight:\s*(\d+)/.exec(m[1]), src = /src:\s*url\(\s*['"]?([^)'"]+)['"]?\s*\)/.exec(m[1]);
      if (fam && src) out.push({family:fam[1].trim(), weight:w ? +w[1] : 400, src:src[1]});
    }
    return out;
  }
  // load these Google families for these characters: candidates for identify(). offline = no request reached Google
  async function loadGoogle(entries, chars, {fetchCss = url => fetch(url), timeout = 8000, stop = null} = {}){
    const cands = [], failed = [], todo = []; let answered = 0;
    for (const e of entries) { const c = gfCache.get(e.family + '|' + chars); if (c) cands.push(c); else todo.push(e); }
    if (!todo.length) return {cands, failed, offline:false};
    const byFamily = new Map(todo.map(e => [e.family, e]));
    // one request for a batch of families; a batch Google refuses (a bad name) is asked again one family at a time
    const ask = async batch => {
      if (stop && stop()) return;
      const url = 'https://fonts.googleapis.com/css2?' + batch.map(familyParam).join('&') + '&text=' + encodeURIComponent(chars);
      let res; try { res = await withTimeout(Promise.resolve(fetchCss(url)), timeout); } catch (_) { batch.forEach(e => failed.push(e.family)); return; }
      if (!res || res.status >= 500) { batch.forEach(e => failed.push(e.family)); return; }
      answered++;
      if (!res.ok) { if (batch.length > 1) { for (const e of batch) await ask([e]); } else failed.push(batch[0].family); return; }
      let css = ''; try { css = await withTimeout(Promise.resolve(res.text()), timeout); } catch (_) { batch.forEach(e => failed.push(e.family)); return; }
      const faces = parseFaces(css), got = new Set();
      for (const e of batch) {
        const mine = faces.filter(f => f.family === e.family); if (!mine.length) { failed.push(e.family); continue; }
        const alias = 'PDFE GF ' + (++gfAlias); let ok = 0;
        for (const f of mine) {
          try { const ff = new FontFace(alias, `url(${f.src})`, {weight:String(f.weight)}); await withTimeout(ff.load(), timeout); document.fonts.add(ff); ok++; } catch (_) {}
        }
        if (!ok) { failed.push(e.family); continue; }
        const c = {key:'google:' + e.family, css:`"${alias}"`, label:e.zh ? `${e.zh}（${e.family}）` : e.family, source:'google', entry:byFamily.get(e.family)};
        gfCache.set(e.family + '|' + chars, c); got.add(e.family); cands.push(c);
      }
    };
    const batches = []; for (let k = 0; k < todo.length; k += 10) batches.push(todo.slice(k, k + 10));
    let next = 0;
    await Promise.all(Array.from({length:Math.min(6, batches.length)}, async () => { while (next < batches.length) await ask(batches[next++]); }));
    // keep the list's order
    const pos = new Map(entries.map((e, k) => [e.family, k]));
    cands.sort((a, b) => pos.get(a.entry.family) - pos.get(b.entry.family));
    return {cands, failed, offline:!answered};
  }

  window.FontId = {ready, fontString, hasGlyph, N, glyphsFromImage, identify, mergeResults, GOOGLE, requestChars, specimenUrl, loadGoogle};
})();
