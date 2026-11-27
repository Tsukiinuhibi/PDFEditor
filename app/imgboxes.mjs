// 圖片的位置: the pictures an operator list paints, as boxes in the page view — shared by the window (index.html) and
// the render worker (render-worker.mjs), which works them out from the operator list it draws a page with (so a picture
// is not decoded a second time to find where it is).
// ops: a pdf.js operator list; vt: the page's view transform at scale 1; W × H its size; pdfjs: the pdf.js module (OPS,
// Util). skipAnnotations: leave out what annotations draw (an operator list made with annotations, as for drawing).
// → [{x, y, w, h: the part that shows (clipped), nw × nh: its pixels, full: the whole picture}]
export const boxMeet = (a, b) => { if (!a) return b; if (!b) return a; const r = [Math.max(a[0], b[0]), Math.max(a[1], b[1]), Math.min(a[2], b[2]), Math.min(a[3], b[3])]; return r[0] <= r[2] && r[1] <= r[3] ? r : null; };
export const sameBox = (p, q, d = 1.5) => !!p && !!q && ['x', 'y', 'w', 'h'].every(k => Math.abs(p[k] - q[k]) <= d);
export function imageBoxesOf(ops, vt, W, H, pdfjs, {skipAnnotations = false} = {}){
  {
    const O = pdfjs.OPS, U = pdfjs.Util;
    let inAnn = 0;   // (inside what an annotation draws)
    // the clip (page view, [x0, y0, x1, y1]) follows the clipping paths: a path's box (its control points included: pdf.js
    // leaves curves out of its own minMax) takes effect at the end of the path, like in the renderer
    let ctm = [1, 0, 0, 1, 0, 0], clip = null, path = null, pending = false; const stack = [], out = [];
    const view = (r, m) => { const q = [[r[0], r[1]], [r[2], r[1]], [r[0], r[3]], [r[2], r[3]]].map(p => U.applyTransform(U.applyTransform(p, m), vt)), xs = q.map(p => p[0]), ys = q.map(p => p[1]); return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)]; };
    const PATH_ARGS = {[O.moveTo]:2, [O.lineTo]:2, [O.curveTo]:6, [O.curveTo2]:4, [O.curveTo3]:4, [O.closePath]:0, [O.rectangle]:4};
    const pathBox = (fns, args) => {
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity, j = 0;
      const pt = (x, y) => { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); };
      for (const f of fns) {
        const n = PATH_ARGS[f] ?? 0;
        if (f === O.rectangle) { pt(args[j], args[j + 1]); pt(args[j] + args[j + 2], args[j + 1] + args[j + 3]); }
        else for (let k = 0; k + 1 < n; k += 2) pt(args[j + k], args[j + k + 1]);
        j += n;
      }
      return x0 <= x1 && y0 <= y1 ? [x0, y0, x1, y1] : null;
    };
    const add = (nw, nh) => {
      const f = view([0, 0, 1, 1], ctm), m = clip ? boxMeet(f, clip) : f, v = m && boxMeet(m, [0, 0, W, H]);   // (clipped away entirely: no red box)
      if (!v || v[2] - v[0] < 4 || v[3] - v[1] < 4) return;
      const full = {x:f[0], y:f[1], w:f[2] - f[0], h:f[3] - f[1]};
      if (!out.some(o => sameBox(o.full, full, 1))) out.push({x:v[0], y:v[1], w:v[2] - v[0], h:v[3] - v[1], nw:nw | 0, nh:nh | 0, full});
    };
    for (let k = 0; k < ops.fnArray.length; k++) {
      const fn = ops.fnArray[k], a = ops.argsArray[k];
      if (skipAnnotations) {
        if (fn === O.beginAnnotation) { inAnn++; continue; }
        if (fn === O.endAnnotation) { inAnn = Math.max(0, inAnn - 1); continue; }
        if (inAnn) continue;
      }
      switch (fn) {
        case O.save: stack.push({ctm:ctm.slice(), clip}); break;
        case O.restore: if (stack.length) ({ctm, clip} = stack.pop()); path = null; pending = false; break;
        case O.transform: ctm = U.transform(ctm, a); break;
        case O.constructPath: { const b = a && pathBox(a[0], a[1]); if (b) { const v = view(b, ctm); path = path ? [Math.min(path[0], v[0]), Math.min(path[1], v[1]), Math.max(path[2], v[2]), Math.max(path[3], v[3])] : v; } break; }
        case O.clip: case O.eoClip: pending = true; break;
        case O.endPath: case O.fill: case O.eoFill: case O.stroke: case O.closeStroke: case O.fillStroke: case O.eoFillStroke: case O.closeFillStroke: case O.closeEOFillStroke:
          if (pending && path) clip = boxMeet(clip, path) || [0, 0, 0, 0];
          path = null; pending = false; break;
        case O.paintFormXObjectBegin:
          stack.push({ctm:ctm.slice(), clip});
          if (a && a[0] && a[0].length === 6) ctm = U.transform(ctm, a[0]);
          if (a && a[1] && a[1].length === 4) clip = boxMeet(clip, view(a[1], ctm)) || [0, 0, 0, 0];
          break;
        case O.paintFormXObjectEnd: if (stack.length) ({ctm, clip} = stack.pop()); break;
        case O.paintImageXObject: add(a[1], a[2]); break;
        case O.paintInlineImageXObject: add(a[0] && a[0].width, a[0] && a[0].height); break;
        case O.paintImageMaskXObject: add(a[0] && a[0].width, a[0] && a[0].height); break;
      }
    }
    return out;
  }
}
