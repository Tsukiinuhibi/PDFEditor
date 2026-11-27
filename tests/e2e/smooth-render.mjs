// 開啟大型檔案不卡頓: pages and thumbnails are drawn in a worker (render-worker.mjs, OffscreenCanvas), so a page that
// takes long to draw never holds up the window; JPEG pictures are decoded by the browser's own decoder (fast), with
// their Exif orientation ignored as a PDF reader must; the boxes of the pictures (擷取圖片) come from the drawing itself
// (the picture is not decoded a second time). Should the worker fail, pages are drawn as before.
import { launch, TMP } from './_env.mjs';
import { PDFDocument, PDFName, PDFString } from 'pdf-lib';
const PDFLibString = t => PDFString.of(t);
import fs from 'fs';
import path from 'path';

let failed = 0;
const check = (name, ok, detail = '') => { console.log(`${ok ? '✔' : '✘'} ${name}${detail !== '' ? '  ' + (typeof detail === 'string' ? detail : JSON.stringify(detail)) : ''}`); if (!ok) { failed++; process.exitCode = 1; } };

const { app } = await launch('first.pdf');
const win = await app.firstWindow(); win.on('pageerror', e => console.log('PAGEERR', e.message)); win.on('console', m => { if (m.type() === 'error') console.log('C', m.text().slice(0, 300)); });
await win.waitForFunction(() => !!(window.__pdfapp && window.__pdfapp.S.pages.length), null, {timeout:30000});
await win.waitForTimeout(1200);
const Ev = win.evaluate.bind(win);

// ---- the test PDF -----------------------------------------------------------------------------------------------------
// JPEGs made by the window's canvas: one left red / right blue (given Exif orientation 6: turn 90°), one large
const jpegs = await Ev(async () => {
  const mk = async (w, h, draw, q) => { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h); const b = await new Promise(r => c.toBlob(r, 'image/jpeg', q)); return [...new Uint8Array(await b.arrayBuffer())]; };
  const halves = await mk(400, 200, (g, w, h) => { g.fillStyle = '#ff0000'; g.fillRect(0, 0, w / 2, h); g.fillStyle = '#0000ff'; g.fillRect(w / 2, 0, w / 2, h); }, .95);
  const big = await mk(3000, 2000, (g, w, h) => { const gr = g.createLinearGradient(0, 0, w, h); gr.addColorStop(0, '#20a040'); gr.addColorStop(1, '#e0c020'); g.fillStyle = gr; g.fillRect(0, 0, w, h); }, .9);
  return {halves, big};
});
// Exif with orientation 6 put in after the start of the JPEG (APP1: "Exif\0\0", a big-endian TIFF header, one entry)
const exif = Buffer.from([0x45, 0x78, 0x69, 0x66, 0, 0, 0x4d, 0x4d, 0, 0x2a, 0, 0, 0, 8, 0, 1, 0x01, 0x12, 0, 3, 0, 0, 0, 1, 0, 6, 0, 0, 0, 0, 0, 0]);
const app1 = Buffer.concat([Buffer.from([0xff, 0xe1, (exif.length + 2) >> 8, (exif.length + 2) & 255]), exif]);
const halves = Buffer.from(jpegs.halves), halvesExif = Buffer.concat([halves.subarray(0, 2), app1, halves.subarray(2)]);
const doc = await PDFDocument.create(), ctx = doc.context, N = n => PDFName.of(n);
const jpgObj = (bytes, w, h) => ctx.register(ctx.stream(bytes, {Type:'XObject', Subtype:'Image', Width:w, Height:h, ColorSpace:'DeviceRGB', BitsPerComponent:8, Filter:'DCTDecode'}));
const content = s => ctx.register(ctx.flateStream(Buffer.from(s)));
{ const p = doc.addPage([600, 300]); p.node.set(N('Resources'), ctx.obj({XObject:{Im0:jpgObj(halvesExif, 400, 200)}})); p.node.set(N('Contents'), content('q 600 0 0 300 0 0 cm /Im0 Do Q\n')); }
{ let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647; const parts = ['0.3 w\n'];
  for (let k = 0; k < 120000; k++) { const x = rnd() * 1600, y = rnd() * 1100; parts.push(`${x.toFixed(1)} ${y.toFixed(1)} m ${(x + rnd() * 40 - 20).toFixed(1)} ${(y + rnd() * 40 - 20).toFixed(1)} l S\n`); }
  doc.addPage([1600, 1100]).node.set(N('Contents'), content(parts.join(''))); }
{ const p = doc.addPage([595, 842]); p.node.set(N('Resources'), ctx.obj({XObject:{Im1:jpgObj(Buffer.from(jpegs.big), 3000, 2000)}})); p.node.set(N('Contents'), content('q 300 0 0 200 100 542 cm /Im1 Do Q\n')); }
// (review) page 4: a soft mask (Luminosity): left half masked away, right half red — the worker cannot draw it (no SVG
// filters there): drawn in the window
{ const mask = ctx.register(ctx.flateStream(Buffer.from('0 g 0 0 300 300 re f 1 g 300 0 300 300 re f\n'), {Type:'XObject', Subtype:'Form', BBox:[0, 0, 600, 300], Group:{S:'Transparency', CS:'DeviceRGB'}}));
  const p = doc.addPage([600, 300]); p.node.set(N('Resources'), ctx.obj({ExtGState:{GS1:{Type:'ExtGState', SMask:{Type:'Mask', S:'Luminosity', G:mask}}}}));
  p.node.set(N('Contents'), content('q /GS1 gs 1 0 0 rg 0 0 600 300 re f Q\n')); }
// (review) page 5: Chinese in a font that is not embedded (MSung-Light, a predefined CMap): drawn in the worker too
{ const desc = ctx.obj({Type:'FontDescriptor', FontName:'MSung-Light', Flags:6, FontBBox:[0, -200, 1000, 900], ItalicAngle:0, Ascent:880, Descent:-120, CapHeight:880, StemV:93});
  const cid = ctx.obj({Type:'Font', Subtype:'CIDFontType0', BaseFont:'MSung-Light', CIDSystemInfo:{Registry:PDFLibString('Adobe'), Ordering:PDFLibString('CNS1'), Supplement:0}, FontDescriptor:desc, DW:1000});
  const f = ctx.register(ctx.obj({Type:'Font', Subtype:'Type0', BaseFont:'MSung-Light', Encoding:'UniCNS-UCS2-H', DescendantFonts:[cid]}));
  const p = doc.addPage([600, 200]); p.node.set(N('Resources'), ctx.obj({Font:{F1:f}}));
  p.node.set(N('Contents'), content('BT /F1 60 Tf 30 70 Td <4E2D65876E2C8A6665875B57> Tj ET\n')); }
const file = path.join(TMP, 'smooth.pdf'); fs.writeFileSync(file, await doc.save());

await app.evaluate(({BrowserWindow}, p) => BrowserWindow.getAllWindows()[0].webContents.send('open-path', p), file);
await win.waitForFunction(() => window.__pdfapp.S.name === 'smooth.pdf' && !!document.querySelector('.page[data-i="0"] canvas.pc'), null, {timeout:60000});
await win.waitForTimeout(1500);
const stats = () => Ev(() => window.__pdfapp.rw && window.__pdfapp.rw.stats());
const px = (i, fx, fy) => Ev(([i, fx, fy]) => { const c = document.querySelector(`.page[data-i="${i}"] canvas.pc`); if (!c) return null; const d = c.getContext('2d').getImageData(Math.floor(c.width * fx), Math.floor(c.height * fy), 1, 1).data; return [d[0], d[1], d[2]]; }, [i, fx, fy]);
const red = c => !!c && c[0] > 200 && c[1] < 60 && c[2] < 60, blue = c => !!c && c[2] > 200 && c[0] < 60 && c[1] < 60;

// ---- drawn in the worker ----------------------------------------------------------------------------------------------
{ const s = await stats(); check('pages are drawn in the background (the worker), none on the window\'s own thread', !!s && s.worker && s.pages >= 1 && s.main === 0, s); }
{ const l = await px(0, .3, .5), r = await px(0, .7, .5);
  check('a JPEG with Exif orientation 6: drawn as it is stored (left red, right blue), not turned', red(l) && blue(r), {l, r}); }
{ const s = await stats(); check('JPEGs are decoded by the browser\'s own decoder', !!s && s.native >= 1, s); }
await win.waitForFunction(() => { const c = document.querySelector('.thumb[data-i="0"] canvas.tc'); return !!c && c.width > 0; }, null, {timeout:20000}).catch(() => {});
await win.waitForTimeout(800);
{ const t = await Ev(() => { const c = document.querySelector('.thumb[data-i="0"] canvas.tc'); if (!c || !c.width) return null; const d = c.getContext('2d').getImageData(Math.floor(c.width * .3), Math.floor(c.height * .5), 1, 1).data; return [d[0], d[1], d[2]]; }), s = await stats();
  check('the thumbnails are drawn in the background too (page 1\'s: left red)', red(t) && s.thumbs >= 1 && s.main === 0, {t, s}); }

// ---- a page that takes long to draw: the window keeps answering ---------------------------------------------------------
await Ev(() => { window.__gaps = []; let last = performance.now(); window.__hb = setInterval(() => { const t = performance.now(); if (t - last > 120) window.__gaps.push(Math.round(t - last)); last = t; }, 20); });
await Ev(() => window.__pdfapp.scrollToPage(1));
await win.waitForFunction(() => { const c = document.querySelector('.page[data-i="1"] canvas.pc'); return !!c; }, null, {timeout:90000}).catch(() => {});
await win.waitForTimeout(500);
{ const g = await Ev(() => { clearInterval(window.__hb); return window.__gaps; }), drawn = await Ev(() => !!document.querySelector('.page[data-i="1"] canvas.pc'));
  const total = g.reduce((t, x) => t + x, 0), longest = Math.max(0, ...g);
  check('120 000 lines on one page: drawn, and meanwhile the window is never held up long (longest < 400 ms, all < 1.5 s)', drawn && longest < 400 && total < 1500, {drawn, longest, total, g}); }

// ---- the boxes of the pictures (擷取圖片) ----------------------------------------------------------------------------------
await Ev(() => window.__pdfapp.scrollToPage(2)); await win.waitForTimeout(2500);
{ const b = await Ev(() => window.__pdfapp.detectImages(2)), s = await stats();
  check('the picture\'s box on page 3: 300 × 200 at (100, 100), 3000 × 2000 pixels — from the worker', Array.isArray(b) && b.length === 1 && Math.abs(b[0].x - 100) < 1 && Math.abs(b[0].y - 100) < 1 && Math.abs(b[0].w - 300) < 1 && Math.abs(b[0].h - 200) < 1 && b[0].nw === 3000 && b[0].nh === 2000 && s.boxes >= 1, {b, s}); }

 { const s = await stats(); check('(review) the boxes come from the drawing itself (the picture not decoded again to find them)', s.renderBoxes >= 1, s); }

// ---- (review) a soft mask: drawn in the window, as it should look -----------------------------------------------------------
await Ev(() => window.__pdfapp.scrollToPage(3)); await win.waitForTimeout(3000);
{ const l = await px(3, .25, .5), r = await px(3, .75, .5), s = await stats();
  check('(review) a soft mask (Luminosity): drawn in the window (the worker has no filters): left masked away (white), right red', !!l && l[0] > 230 && l[1] > 230 && l[2] > 230 && red(r) && s.here >= 1, {l, r, s}); }
// ---- (review) Chinese in a font that is not embedded: drawn in the worker as in the window -------------------------------------
await Ev(() => window.__pdfapp.scrollToPage(4)); await win.waitForTimeout(3000);
{ const r = await Ev(async () => { const c = document.querySelector('.page[data-i="4"] canvas.pc'); if (!c) return null;
    const dark = cv => { const d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data; let n = 0; for (let k = 0; k < d.length; k += 4) if (d[k] < 128 && d[k + 3] > 0) n++; return n; };
    const pg = window.__pdfapp.S.pages[4], vp = pg.page.getViewport({scale:c.width / pg.w}), m = document.createElement('canvas'); m.width = c.width; m.height = c.height;
    await pg.page.render({canvasContext:m.getContext('2d'), viewport:vp}).promise;
    return {worker:dark(c), window:dark(m)}; });
  check('(review) Chinese in a font that is not embedded: the worker draws the text as the window does', !!r && r.window > 500 && r.worker > r.window * .6 && r.worker < r.window * 1.6, r); }
// ---- (review) 取消 stops a page that takes long to draw at once ----------------------------------------------------------------
{ const r = await Ev(() => window.__pdfapp.rw.probe(1, 2.5, 60));
  check('(review) a long drawing (120 000 lines) cancelled after 60 ms: it stops at once (not drawn to the end first)', !!r && r.cancelled && r.ms < 900, r); }

// ---- an edit: the page drawn again (in the worker) -----------------------------------------------------------------------
await Ev(() => window.__pdfapp.scrollToPage(0)); await win.waitForTimeout(1200);
const putGreen = async () => {
  await Ev(async () => { const c = document.createElement('canvas'); c.width = 60; c.height = 60; const g = c.getContext('2d'); g.fillStyle = '#00c000'; g.fillRect(0, 0, 60, 60);
    const blob = await new Promise(r => c.toBlob(r, 'image/png')); await window.__pdfapp.pendImage(new File([blob], 'g.png', {type:'image/png'})); });
  await win.waitForTimeout(500);
  const p = await Ev(() => { const r = document.querySelector('.page[data-i="0"]').getBoundingClientRect(); return {x:r.left + r.width * .5, y:r.top + r.height * .5}; });
  await win.mouse.click(p.x, p.y); await win.waitForTimeout(3000);
  await Ev(() => window.__pdfapp.setTool('select')); await win.waitForTimeout(300); await win.keyboard.press('Escape'); await win.waitForTimeout(1500);
};
const p0 = (await stats()).pages;
await putGreen();
{ const c = await px(0, .5, .5), s = await stats(); check('an edit (a green picture in the middle): drawn again in the background', !!c && c[1] > 150 && c[0] < 80 && c[2] < 80 && s.pages > p0 && s.main === 0, {c, s}); }

// ---- the worker fails: pages are drawn as before -----------------------------------------------------------------------
await Ev(() => window.__pdfapp.rw.fail('test')); await win.waitForTimeout(300);
await Ev(() => window.__pdfapp.actions.undo()); await win.waitForTimeout(3000);
{ const l = await px(0, .3, .5), m = await px(0, .5, .5), s = await stats();
  check('the worker gone: the page is drawn on the window\'s own thread (the edit undone: the halves again)', red(l) && !(m && m[1] > 150 && m[0] < 80) && s.main >= 1 && !s.worker, {l, m, s}); }

console.log(failed ? `\n${failed} check(s) failed` : '\nall checks passed');
await app.evaluate(({app}) => app.exit(0)).catch(() => {});
