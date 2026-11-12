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

  window.FontId = {ready, fontString, hasGlyph, N, glyphsFromImage};
})();
