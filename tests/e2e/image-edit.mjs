// 擷取圖片：刪除或更換. The extract tool's red boxes frame what can be seen of each picture; a picture clicked there can
// be deleted from the file or replaced by another one (this place or every place the same picture is drawn).
import { launchPath, TMP } from './_env.mjs';
import { PDFDocument, PDFName, StandardFonts, degrees } from 'pdf-lib';
import fs from 'fs';
import path from 'path';

let failed = 0;
const check = (name, ok, detail = '') => { console.log(`${ok ? '✔' : '✘'} ${name}${detail !== '' ? '  ' + (typeof detail === 'string' ? detail : JSON.stringify(detail)) : ''}`); if (!ok) { failed++; process.exitCode = 1; } };

// ---- the test PDF: pictures written as raw pixels, each of its own size so it can be recognised -----------------------
const doc = await PDFDocument.create(), ctx = doc.context, N = n => PDFName.of(n);
const pixels = (w, h, f) => { const b = Buffer.alloc(w * h * 3); for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) b.set(f(x, y, w, h), (y * w + x) * 3); return b; };
const halves = (x, y, w) => x < w / 2 ? [255, 0, 0] : [0, 0, 255];   // left red, right blue
const image = (w, h, f = halves) => ctx.register(ctx.flateStream(pixels(w, h, f), {Type:'XObject', Subtype:'Image', Width:w, Height:h, ColorSpace:'DeviceRGB', BitsPerComponent:8}));
const content = (...parts) => ctx.register(ctx.flateStream(Buffer.concat(parts.map(p => typeof p === 'string' ? Buffer.from(p, 'latin1') : p))));
const page = (contents, resources) => { const p = doc.addPage([595, 842]); p.node.set(N('Contents'), contents); p.node.set(N('Resources'), resources); return p; };
const A = image(40, 20), B = image(42, 20), L1 = image(44, 20), L2 = image(46, 20), D = image(48, 20), S = image(30, 40, () => [200, 220, 240]);
const E = image(50, 20, () => [40, 160, 60]), E2 = image(50, 20, () => [40, 160, 60]), R = image(52, 20), T = image(54, 20);
// pages 1 and 2 share one resources dictionary
const res12 = ctx.register(ctx.obj({XObject:{ImA:A, ImB:B, ImL1:L1, ImL2:L2}}));
page(content('q 200 0 0 100 100 650 cm /ImA Do Q\n',
  'q 100 400 100 100 re W n 200 0 0 100 100 400 cm /ImB Do Q\n',
  'q 60 0 0 60 420 420 cm BI /W 8 /H 8 /CS /G /BPC 8 ID ', Buffer.alloc(64, 0x80), '\nEI Q\n',
  'q 150 0 0 100 380 650 cm /ImL1 Do Q\n', 'q 150 0 0 100 380 650 cm /ImL2 Do Q\n'), res12);
page(ctx.obj([content('0.9 g 10 10 20 20 re f\n'), content('q 200 0 0 100 100 650 cm /ImA Do Q\n')]), res12);
// pages 3 and 4 draw one shared form with a picture in it
const F1 = ctx.register(ctx.flateStream(Buffer.from('q 100 0 0 100 100 600 cm /ImD Do Q\n'), {Type:'XObject', Subtype:'Form', BBox:[0, 0, 595, 842], Resources:{XObject:{ImD:D}}}));
page(content('q /F1 Do Q\n'), ctx.obj({XObject:{F1}}));
page(content('q /F1 Do Q\n'), ctx.obj({XObject:{F1}}));
// page 5: two separately stored copies of the same picture
page(content('q 100 0 0 50 100 600 cm /ImE Do Q\nq 100 0 0 50 300 600 cm /ImE2 Do Q\n'), ctx.obj({XObject:{ImE:E, ImE2:E2}}));
// page 6: a scanned page: one picture over the whole page, invisible recognised text on it, and visible text
const helv = await doc.embedFont(StandardFonts.Helvetica);
const p6 = page(content('q 595 0 0 842 0 0 cm /ImS Do Q\nBT /F1 24 Tf 3 Tr 100 500 Td (HIDDENOCR) Tj ET\nBT /F1 24 Tf 0 Tr 100 300 Td (VISIBLE) Tj ET\n'), ctx.obj({XObject:{ImS:S}, Font:{F1:helv.ref}}));
p6.node.set(N('Thumb'), image(6, 8, () => [128, 128, 128])); p6.node.set(N('PieceInfo'), ctx.obj({Illustrator:{LastModified:'D:20200101'}}));
// page 7: turned a quarter by /Rotate, its picture drawn turned
const p7 = page(content('q 0 100 -200 0 300 300 cm /ImR Do Q\n'), ctx.obj({XObject:{ImR:R}})); p7.setRotation(degrees(90));
// page 8: a picture set at 20° on purpose (200 × 100, centred at 300 400)
const a = 20 * Math.PI / 180, co = Math.cos(a), si = Math.sin(a), tm = [200 * co, 200 * si, -100 * si, 100 * co, 300 - 100 * co + 50 * si, 400 - 100 * si - 50 * co].map(v => v.toFixed(4)).join(' ');
page(content(`q ${tm} cm /ImT Do Q\n`), ctx.obj({XObject:{ImT:T}}));
const PDF = path.join(TMP, 'imgedit.pdf'); fs.writeFileSync(PDF, await doc.save());

const { app } = await launchPath(PDF);
const win = await app.firstWindow(); win.on('pageerror', e => console.log('PAGEERR', e.message)); win.on('console', m => { if (m.type() === 'error') console.log('C', m.text().slice(0, 300)); });
await win.waitForTimeout(3000);
await win.waitForFunction(() => !!(window.__pdfapp && window.__pdfapp.S.pages.length), null, {timeout:30000});
const Ev = win.evaluate.bind(win);
const near = (a, b, d = 1.5) => Math.abs(a - b) <= d;
const same = (p, q, d = 1.5) => !!p && !!q && ['x', 'y', 'w', 'h'].every(k => near(p[k], q[k], d));
const boxes = i => Ev(i => window.__pdfapp.imageBoxes(i), i);
const draws = i => Ev(i => window.__pdfapp.imageDraws(i), i);

// ---- part 1: what is a picture -------------------------------------------------------------------------------------
const b0 = await boxes(0), d0 = await draws(0);
const bB = b0 && b0.find(b => near(b.full.w, 200) && near(b.full.y, 842 - 500));
check('the red boxes: A, the cropped B, the inline picture, the stacked pair as one — 4', !!b0 && b0.length === 4, b0);
check('a cropped picture: its red box is the part that can be seen (half), full is the whole picture', !!bB && near(bB.w, 100) && near(bB.full.w, 200), bB);
check('the drawing commands: 5 (A, B, inline, the stacked two), one of them inline', !!d0 && d0.length === 5 && d0.filter(d => d.inline).length === 1, d0);
check('every drawing command lines up with a red box (full)', !!d0 && !!b0 && d0.every(d => b0.some(b => same(b.full, d.full))), d0 && d0.map(d => d.full));
const d2 = await draws(2);
check('a picture inside a form is found too', !!d2 && d2.length === 1 && near(d2[0].full.w, 100) && d2[0].px.w === 48, d2);
const d4 = await draws(4), dA = d0 && d0.find(d => d.px.w === 40);
check('two separately stored copies of one picture: the same key; another picture: another key', !!d4 && d4.length === 2 && d4[0].key === d4[1].key && !!dA && dA.key !== d4[0].key, {d4, dA});

console.log(failed ? `\n${failed} check(s) failed` : '\nall checks passed');
await app.evaluate(({app}) => app.exit(0)).catch(() => {});
