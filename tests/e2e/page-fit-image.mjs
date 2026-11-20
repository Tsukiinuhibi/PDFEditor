// 頁面符合圖片: the page of a selected picture becomes the size of the picture (its media and crop boxes are the
// picture's box; what was on the page stays where it was on the paper). From the picture's bar, its right-click menu,
// and the 擷取圖片 tool's bar for a picture in the page itself. One undo step.
import { launchPath, TMP } from './_env.mjs';
import { PDFDocument, PDFName, degrees } from 'pdf-lib';
import fs from 'fs';
import path from 'path';

let failed = 0;
const check = (name, ok, detail = '') => { console.log(`${ok ? '✔' : '✘'} ${name}${detail !== '' ? '  ' + (typeof detail === 'string' ? detail : JSON.stringify(detail)) : ''}`); if (!ok) { failed++; process.exitCode = 1; } };
const near = (a, b, t = .6) => Math.abs(a - b) <= t;

// ---- the test PDF ----------------------------------------------------------------------------------------------------
const doc = await PDFDocument.create(), ctx = doc.context, N = n => PDFName.of(n);
const p0 = doc.addPage([595, 842]); p0.node.set(N('TrimBox'), ctx.obj([10, 10, 585, 832]));   // page 1: a trim box too
const p1 = doc.addPage([595, 842]); p1.setRotation(degrees(90));                             // page 2: turned a quarter
const p2 = doc.addPage([595, 842]); p2.setCropBox(50, 50, 495, 742);                         // page 3: cropped, offset
const px = Buffer.alloc(40 * 20 * 3, 0x60);
const im = ctx.register(ctx.flateStream(px, {Type:'XObject', Subtype:'Image', Width:40, Height:20, ColorSpace:'DeviceRGB', BitsPerComponent:8}));
const p3 = doc.addPage([595, 842]);                                                           // page 4: a picture in the page
p3.node.set(N('Contents'), ctx.register(ctx.flateStream(Buffer.from('q 200 0 0 100 100 600 cm /Im0 Do Q\n'))));
p3.node.set(N('Resources'), ctx.obj({XObject:{Im0:im}}));
doc.addPage([595, 842]);                                                                      // page 5: left alone
doc.addPage([595, 842]); doc.addPage([595, 842]);                                             // pages 6 and 7: nudged pictures
const file = path.join(TMP, 'pagefit.pdf'); fs.writeFileSync(file, await doc.save());

const { app } = await launchPath(file);
const win = await app.firstWindow(); win.on('pageerror', e => console.log('PAGEERR', e.message)); win.on('console', m => { if (m.type() === 'error') console.log('C', m.text().slice(0, 300)); });
await win.waitForFunction(() => !!(window.__pdfapp && window.__pdfapp.S.pages.length), null, {timeout:30000});
await win.waitForTimeout(1500);
const Ev = win.evaluate.bind(win);

const P = (i, x, y) => Ev(([i, x, y]) => { const r = window.__pdfapp.S.els[i].getBoundingClientRect(), s = window.__pdfapp.S.scale; return [r.left + x * s, r.top + y * s]; }, [i, x, y]);
const see = async (i, x, y) => {
  await Ev(([i, x, y]) => { const S = window.__pdfapp.S, vw = document.querySelector('#viewer'), vr = vw.getBoundingClientRect(), r = S.els[i].getBoundingClientRect();
    vw.scrollTop += r.top + y * S.scale - (vr.top + vr.height / 2); vw.scrollLeft += r.left + x * S.scale - (vr.left + vr.width / 2); }, [i, x, y]);
  await win.waitForTimeout(500); return P(i, x, y);
};
const tool = async t => { await Ev(t => window.__pdfapp.setTool(t), t); await win.waitForTimeout(300); };
const size = i => Ev(i => ({w:window.__pdfapp.S.pages[i].w, h:window.__pdfapp.S.pages[i].h}), i);
const pics = i => Ev(async i => (await window.__pdfapp.getAnns(i)).filter(a => a.subtype === 'Stamp').map(a => ({id:a.id, x:a.x, y:a.y, w:a.w, h:a.h})), i);
const boxes = i => Ev(async i => { const d = await PDFLib.PDFDocument.load(window.__pdfapp.S.bytes, {ignoreEncryption:true}), n = d.getPage(i).node, g = k => { const a = n.lookup(PDFLib.PDFName.of(k)); return a ? a.asArray().map(v => +v.asNumber().toFixed(2)) : null; };
  return {media:g('MediaBox'), crop:g('CropBox'), trim:g('TrimBox'), n:d.getPageCount()}; }, i);
const undoN = () => Ev(() => window.__pdfapp.S.undo.length);
// a picture (120 × 60 px) put on page i around (x, y), then selected
const putPicture = async (i, x, y) => {
  await Ev(async () => { const c = document.createElement('canvas'); c.width = 120; c.height = 60; const g = c.getContext('2d'); g.fillStyle = '#3070c0'; g.fillRect(0, 0, 120, 60);
    const blob = await new Promise(r => c.toBlob(r, 'image/png')); await window.__pdfapp.pendImage(new File([blob], 'g.png', {type:'image/png'})); });
  await win.waitForTimeout(600);
  const xy = await see(i, x, y); await win.mouse.click(...xy); await win.waitForTimeout(2000);
  await tool('select');
  const p = (await pics(i))[0];
  const c = await see(i, p.x + p.w / 2, p.y + p.h / 2); await win.mouse.click(...c); await win.waitForTimeout(1200);
  return p;
};

// ---- page 1: from the picture's bar ----------------------------------------------------------------------------------
const s4 = await size(4), b4 = await boxes(4);
const a0 = await putPicture(0, 250, 300);
check('(a picture put on page 1)', !!a0, a0);
const hasBtn = await Ev(() => !!document.querySelector('#hint.objbar [data-o="fitpage"]'));
check('the bar of a selected picture has 〔頁面符合圖片〕', hasBtn);
const u0 = await undoN();
if (hasBtn) await win.click('#hint.objbar [data-o="fitpage"]');
await win.waitForTimeout(2500);
const z0 = await size(0), q0 = (await pics(0))[0], k0 = await boxes(0);
check('page 1 is now the size of the picture', near(z0.w, a0.w) && near(z0.h, a0.h), {z0, a0});
check('the picture fills the page (at its top left corner)', !!q0 && near(q0.x, 0) && near(q0.y, 0) && near(q0.w, a0.w) && near(q0.h, a0.h), q0);
check('the media box and the crop box are the picture\'s box; the trim box goes', !!k0.media && JSON.stringify(k0.media) === JSON.stringify(k0.crop) && near(k0.media[2] - k0.media[0], a0.w) && near(k0.media[3] - k0.media[1], a0.h) && !k0.trim, k0);
check('one undo step', await undoN() === u0 + 1, {u0, now:await undoN()});
check('the other pages stay as they were', JSON.stringify(await size(4)) === JSON.stringify(s4) && JSON.stringify(await boxes(4)) === JSON.stringify(b4) && k0.n === 7);
await win.keyboard.press('Control+z'); await win.waitForTimeout(2500);
const z0u = await size(0);
check('undo: page 1 is A4 again', near(z0u.w, 595) && near(z0u.h, 842), z0u);

// ---- the right-click menu ----------------------------------------------------------------------------------------------
await tool('select');
{ const p = (await pics(0))[0], c = await see(0, p.x + p.w / 2, p.y + p.h / 2); await win.mouse.click(...c); await win.waitForTimeout(1200); await win.mouse.click(...c, {button:'right'}); await win.waitForTimeout(800); }
const row = await Ev(() => { const b = [...document.querySelectorAll('#ctx button')].find(b => b.textContent.includes('頁面符合圖片')); if (b) b.click(); return !!b; });
check('the picture\'s right-click menu has 頁面符合圖片', row);
await win.waitForTimeout(2500);
{ const z = await size(0); check('chosen from the menu: page 1 is the size of the picture', near(z.w, a0.w) && near(z.h, a0.h), z); }
// pressed again: the page is that size already — nothing changes
{ await tool('select'); const p = (await pics(0))[0], c = await see(0, p.x + p.w / 2, p.y + p.h / 2); await win.mouse.click(...c); await win.waitForTimeout(1200);
  const u = await undoN(); await win.click('#hint.objbar [data-o="fitpage"]'); await win.waitForTimeout(1500);
  check('already the size of the picture: no change, no undo step', await undoN() === u, {u, now:await undoN()}); }

// ---- page 2: turned a quarter ------------------------------------------------------------------------------------------
const a1 = await putPicture(1, 300, 200);
await win.click('#hint.objbar [data-o="fitpage"]'); await win.waitForTimeout(2500);
{ const z = await size(1), q = (await pics(1))[0];
  check('a turned page: the size of the picture as seen', near(z.w, a1.w) && near(z.h, a1.h), {z, a1});
  check('a turned page: the picture fills it', !!q && near(q.x, 0) && near(q.y, 0), q); }

// ---- page 3: cropped, offset -------------------------------------------------------------------------------------------
const a2 = await putPicture(2, 200, 250);
await win.click('#hint.objbar [data-o="fitpage"]'); await win.waitForTimeout(2500);
{ const z = await size(2), q = (await pics(2))[0];
  check('a cropped page: the size of the picture', near(z.w, a2.w) && near(z.h, a2.h), {z, a2});
  check('a cropped page: the picture fills it', !!q && near(q.x, 0) && near(q.y, 0), q); }

// ---- page 4: a picture in the page, picked with 擷取圖片 ----------------------------------------------------------------
await tool('extract');
{ const xy = await see(3, 200, 842 - 650); await win.waitForTimeout(400); await win.mouse.click(...xy); await win.waitForTimeout(800); }
const xb = await Ev(() => [...document.querySelectorAll('.xbar:not(.abar) button')].map(b => b.dataset.x));
check('擷取圖片 on a picture in the page: its bar has 〔頁面符合圖片〕', xb.includes('fit'), xb);
if (xb.includes('fit')) await Ev(() => document.querySelector('.xbar [data-x="fit"]').click());
await win.waitForTimeout(2500);
{ const z = await size(3), k = await boxes(3);
  check('a picture in the page: the page becomes its size (200 × 100)', near(z.w, 200) && near(z.h, 100), z);
  check('…its box on the paper (100 600 300 700)', JSON.stringify(k.media) === '[100,600,300,700]', k); }

// ---- (review) page 6: nudged with the arrow keys, then fitted at once (before the nudge is written) -------------------------
{ const a = await putPicture(5, 300, 300);
  for (let k = 0; k < 3; k++) await win.keyboard.press('Shift+ArrowRight');
  await win.click('#hint.objbar [data-o="fitpage"]'); await win.waitForTimeout(3000);
  const z = await size(5), q = (await pics(5))[0];
  check('nudged, then fitted at once: the page is where the picture went (it fills the page)', !!q && near(q.x, 0) && near(q.y, 0) && near(z.w, a.w) && near(z.h, a.h), {z, q, a}); }

// ---- (review) page 7: a picture partly off the page: the page becomes the part of it on the page, never larger ----------
{ const a = await putPicture(6, 60, 300);
  for (let k = 0; k < 4; k++) await win.keyboard.press('Shift+ArrowLeft');
  await win.waitForTimeout(2500);
  const m = (await pics(6))[0];
  check('(the picture hangs over the left edge)', !!m && m.x < -5, m);
  { const c = await see(6, Math.max(2, m.x + m.w / 2), m.y + m.h / 2); await win.mouse.click(...c); await win.waitForTimeout(1200); }
  await win.click('#hint.objbar [data-o="fitpage"]'); await win.waitForTimeout(2500);
  const z = await size(6), k = await boxes(6);
  check('partly off the page: the page is the part on the page (no wider than the picture\'s part)', near(z.w, m.x + m.w) && near(z.h, m.h), {z, m});
  check('partly off the page: the new box stays inside the old page (0 … 595)', !!k.media && k.media[0] >= -0.01 && k.media[2] <= 595.01, k); }

await app.close();
console.log(failed ? `\n${failed} failed` : '\nall passed');
