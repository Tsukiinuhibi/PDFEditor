// Adding, pasting, cutting and undoing pages must not blank the pages on screen:
// every page in view keeps a picture in every animation frame, and each picture belongs to its page.
import { launch } from './_env.mjs';
const { app } = await launch('pf.pdf');
const win = await app.firstWindow(); win.on('pageerror', e => console.log('PAGEERR', e.message));
await win.waitForTimeout(3500);
await win.evaluate(() => {
  window.__fl = {frames:0, blank:0, blankPages:new Set(), veil:0};
  const tick = () => {
    const v = document.querySelector('#viewer').getBoundingClientRect(); window.__fl.frames++;
    let blank = false;
    document.querySelectorAll('.page').forEach(el => {
      const r = el.getBoundingClientRect();
      if (r.bottom < v.top || r.top > v.bottom) return;   // not in view
      if (!el.querySelector('canvas.pc')) { blank = true; window.__fl.blankPages.add(el.dataset.i); }
    });
    if (blank) window.__fl.blank++;
    const b = document.querySelector('#busy'); if (b.classList.contains('show') && !b.classList.contains('quiet')) window.__fl.veil++;
    requestAnimationFrame(tick);
  }; requestAnimationFrame(tick);
});
const A = win.evaluate.bind(win);
// compare the picture on screen with a fresh rendering of the page it sits on
const compare = () => A(async () => {
  const app = window.__pdfapp, out = [];
  for (const el of document.querySelectorAll('.page')) {
    const c = el.querySelector('canvas.pc'); if (!c) continue;
    const i = +el.dataset.i, pg = app.S.pages[i], vp = pg.page.getViewport({scale:app.S.scale * (window.devicePixelRatio || 1)});
    const f = document.createElement('canvas'); f.width = c.width; f.height = c.height;
    await pg.page.render({canvasContext:f.getContext('2d'), viewport:vp, annotationMode:pdfjsLib.AnnotationMode.ENABLE}).promise;
    const a = c.getContext('2d').getImageData(0, 0, c.width, c.height).data, b = f.getContext('2d').getImageData(0, 0, f.width, f.height).data;
    let diff = 0; for (let k = 0; k < a.length; k += 16) if (Math.abs(a[k] - b[k]) > 40) diff++;
    out.push([i + 1, diff]);
  }
  return out;
});
const report = async label => {
  const r = await A(() => { const f = window.__fl, o = {frames:f.frames, blank:f.blank, pages:[...f.blankPages], veil:f.veil, count:window.__pdfapp.S.pages.length};
    f.frames = 0; f.blank = 0; f.blankPages.clear(); f.veil = 0; return o; });
  console.log(label.padEnd(20), JSON.stringify(r), 'mismatch', JSON.stringify((await compare()).filter(x => x[1] > 0)));
};
await A(() => window.__pdfapp.scrollToPage(1)); await win.waitForTimeout(1200); await report('settle');
await A(() => { window.__pdfapp.S.thumbSel = new Set([0]); return window.__pdfapp.actions.copyPages(); }); await win.waitForTimeout(800); await report('copy page 1');
await A(() => window.__pdfapp.actions.pastePages()); await win.waitForTimeout(2000); await report('paste after current');
await A(() => window.__pdfapp.actions.undo()); await win.waitForTimeout(2000); await report('undo paste');
await A(() => window.__pdfapp.actions.redo()); await win.waitForTimeout(2000); await report('redo paste');
await A(() => { const s = window.__pdfapp.S; s.thumbSel = new Set([s.current]); return window.__pdfapp.actions.cutPages(); }); await win.waitForTimeout(2000); await report('cut current page');
await A(() => window.__pdfapp.actions.undo()); await win.waitForTimeout(2000); await report('undo cut');
await A(() => { const s = window.__pdfapp.S; s.thumbSel = new Set([s.current]); return window.__pdfapp.actions.rotR(); }); await win.waitForTimeout(2000); await report('rotate current page');
await A(() => window.__pdfapp.actions.undo()); await win.waitForTimeout(2000); await report('undo rotate');
// thumbnails: one per page, each showing its own page
console.log('thumbs', await A(() => document.querySelectorAll('#p-thumbs .thumb').length), 'pages', await A(() => window.__pdfapp.S.pages.length));
await app.evaluate(({app}) => app.exit(0)).catch(() => {});
