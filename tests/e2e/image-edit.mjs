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
// page 9: a scan whose invisible text is in a font without widths (its advance cannot be worked out)
const S2 = image(31, 41, () => [210, 230, 250]), noW = ctx.register(ctx.obj({Type:'Font', Subtype:'Type1', BaseFont:'NoWidthsOCR'}));
page(content('q 595 0 0 842 0 0 cm /ImS2 Do Q\nBT /F2 24 Tf 3 Tr 100 500 Td (HIDDENTWO) Tj ET\n'), ctx.obj({XObject:{ImS2:S2}, Font:{F2:noW}}));
// page 10: a form without resources of its own (it uses the page's) drawing two pictures
const F1a = image(56, 20), F2a = image(58, 20), Fm2 = ctx.register(ctx.flateStream(Buffer.from('q 100 0 0 50 100 600 cm /ImF1 Do Q\nq 100 0 0 50 300 600 cm /ImF2 Do Q\n'), {Type:'XObject', Subtype:'Form', BBox:[0, 0, 595, 842]}));
page(content('q /Fm2 Do Q\n'), ctx.obj({XObject:{ImF1:F1a, ImF2:F2a, Fm2}}));
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

// ---- part 2: delete ----------------------------------------------------------------------------------------------------
const P = (i, x, y) => Ev(([i, x, y]) => { const r = window.__pdfapp.S.els[i].getBoundingClientRect(), s = window.__pdfapp.S.scale; return [r.left + x * s, r.top + y * s]; }, [i, x, y]);
const see = async (i, x, y) => {
  await Ev(([i, x, y]) => { const S = window.__pdfapp.S, vw = document.querySelector('#viewer'), vr = vw.getBoundingClientRect(), r = S.els[i].getBoundingClientRect();
    vw.scrollTop += r.top + y * S.scale - (vr.top + vr.height / 2); vw.scrollLeft += r.left + x * S.scale - (vr.left + vr.width / 2); }, [i, x, y]);
  await win.waitForTimeout(500); return P(i, x, y);
};
const tool = async t => { await Ev(t => window.__pdfapp.setTool(t), t); await win.waitForTimeout(300); };
const settle = () => win.waitForTimeout(2200);
const pick = async (i, b) => { await tool('extract'); const xy = await see(i, b.x + b.w / 2, b.y + b.h / 2); await win.waitForTimeout(400); await win.mouse.click(...xy); await win.waitForTimeout(600); };
const bar = () => Ev(() => [...document.querySelectorAll('.xbar:not(.abar) button')].map(b => b.dataset.x));
const modal = () => Ev(() => document.querySelector('#mask').classList.contains('show') ? {title:document.querySelector('#modal .mh').textContent, body:document.querySelector('#modal .mb').textContent, buttons:[...document.querySelectorAll('#modal .mf button')].map(b => b.textContent.trim())} : null);
const press = async label => { await win.click(`#modal .mf button:has-text("${label}")`); await settle(); };
const del = async () => { await win.click('.xbar [data-x="del"]'); await win.waitForTimeout(900); };
const cancelSel = async () => { if ((await bar()).length) await win.click('.xbar [data-x="cancel"]'); await win.waitForTimeout(300); };
const pixel = (i, x, y) => Ev(([i, x, y]) => { const S = window.__pdfapp.S, c = S.els[i].querySelector('canvas.pc'), k = c.width / S.pages[i].w; const d = c.getContext('2d').getImageData(Math.round(x * k), Math.round(y * k), 1, 1).data; return [d[0], d[1], d[2]]; }, [i, x, y]);
const textOf = i => Ev(async i => (await window.__pdfapp.S.pages[i].page.getTextContent()).items.map(t => t.str).join(' '), i);
const objects = () => Ev(() => window.__pdfapp.imageObjects());
const keysOf = i => Ev(i => window.__pdfapp.pageKeys(i), i);
const undo = async () => { await win.keyboard.press('Control+z'); await settle(); };
const fullA = {x:100, y:92, w:200, h:100}, hasA = async i => (await boxes(i)).some(b => same(b.full, fullA));
await pick(0, fullA);
const b1 = await bar();
await cancelSel();
await tool('extract'); await win.mouse.move(...await see(0, 250, 520)); await win.mouse.down(); await win.mouse.move(...await P(0, 330, 580), {steps:6}); await win.mouse.up(); await win.waitForTimeout(500);
const b2 = await bar();
await cancelSel();
check('a picture clicked: 刪除圖片 and 更換圖片…; an area dragged out: neither', b1.includes('del') && b1.includes('rep') && b2.length > 0 && !b2.includes('del') && !b2.includes('rep'), {b1, b2});
await pick(0, fullA); await del();
const m1 = await modal();
check('a picture drawn in 2 places: asked first (only this one / all 2)', !!m1 && m1.body.includes('這張圖片在文件裡出現 2 次') && m1.buttons.join('|') === '取消|只刪這一張|全部 2 處都刪', m1);
if (m1) await press('只刪這一張');
const w1 = await pixel(0, 150, 142), r2 = await pixel(1, 150, 142);
check('只刪這一張: gone from page 1 (white there); page 2 (shared resources, two content parts) still shows it', !(await hasA(0)) && w1.every(v => v > 235) && await hasA(1) && r2[0] > 200 && r2[2] < 80, {w1, r2});
await undo();
check('復原: back on page 1', await hasA(0));
await pick(0, fullA); await del(); await press('全部 2 處都刪');
const objs = await objects();
check('全部 2 處都刪: gone from both pages, and its data gone from the file', !(await hasA(0)) && !(await hasA(1)) && !(await draws(0)).some(d => d.px.w === 40) && !objs.some(o => o.w === 40 && o.h === 20), objs);
await pick(0, {x:380, y:92, w:150, h:100}); await del();
const m2 = await modal(); if (m2) await press('取消');
check('two pictures stacked in one red box: both deleted, nothing asked', !m2 && !(await draws(0)).some(d => d.px.w === 44 || d.px.w === 46) && !(await objects()).some(o => o.w === 44 || o.w === 46), m2);
await pick(2, {x:100, y:142, w:100, h:100}); await del();
const m3 = await modal();
if (m3) await press('只刪這一張');
check('a picture inside a form drawn on 2 pages: 只刪這一張 leaves the other page alone', !!m3 && m3.body.includes('出現 2 次') && !(await draws(2)).length && (await draws(3)).length === 1, {m3, d2:await draws(2), d3:await draws(3)});
await pick(4, {x:100, y:192, w:100, h:50}); await del();
const m4 = await modal(); if (m4) await press('取消');
check('a separately stored copy of the same picture counts: asked about 2 places', !!m4 && m4.body.includes('出現 2 次'), m4);
await pick(5, {x:0, y:0, w:595, h:842}); await del();
const m5 = await modal();
if (m5) await press('刪除');
const t5 = await textOf(5), k5 = await keysOf(5);
check('a picture over the whole page: confirmed first; its invisible text goes, the visible stays; thumbnail and private data go', !!m5 && m5.body.includes('幾乎佔滿整頁') && !t5.includes('HIDDENOCR') && t5.includes('VISIBLE') && !k5.includes('Thumb') && !k5.includes('PieceInfo'), {m5, t5, k5});
await undo();
const t5b = await textOf(5), k5b = await keysOf(5);
check('復原: the picture, its invisible text and the thumbnail back in one step', t5b.includes('HIDDENOCR') && k5b.includes('Thumb') && (await draws(5)).length === 1, {t5b, k5b});
await pick(0, {x:420, y:362, w:60, h:60}); await del();
const m6 = await modal(); if (m6) await press('取消');
check('an inline picture: deleted, nothing asked', !m6 && !(await draws(0)).some(d => d.inline), m6);

// ---- part 3: replace ---------------------------------------------------------------------------------------------------
const pngOf = (w, h) => Ev(([w, h]) => { const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d');
  g.fillStyle = '#ff0000'; g.fillRect(0, 0, w / 2, h); g.fillStyle = '#0000ff'; g.fillRect(w / 2, 0, w - w / 2, h); return c.toDataURL('image/png').split(',')[1]; }, [w, h]);
const WIDE = path.join(TMP, 'wide.png'), TALL = path.join(TMP, 'tall.png');
fs.writeFileSync(WIDE, Buffer.from(await pngOf(80, 40), 'base64')); fs.writeFileSync(TALL, Buffer.from(await pngOf(40, 80), 'base64'));
const rep = async (i, b, file) => {
  await pick(i, b);
  const [fc] = await Promise.all([win.waitForEvent('filechooser', {timeout:8000}), win.click('.xbar [data-x="rep"]')]);
  await fc.setFiles(file); await win.waitForTimeout(900);
};
const scopeRow = () => Ev(() => !!document.querySelector('#modal [name="rscope"]'));
await undo();   // the inline picture back (the last thing part 2 deleted)
const bI = {x:420, y:362, w:60, h:60};
await rep(0, bI, WIDE);
const m7 = await modal(), sr7 = await scopeRow();
if (m7) await press('更換');
const nI = (await draws(0)).find(d => d.px.w === 80 && d.px.h === 40 && near(d.box.x + d.box.w / 2, 450, 1.5));
check('更換圖片: the dialog (no scope row for one place); the inline picture becomes the new one, kept in proportion, centred', !!m7 && m7.title === '更換圖片' && !sr7 && !!nI && !nI.inline && same(nI.box, {x:420, y:377, w:60, h:30}), {m7, sr7, nI});
const r0 = (await draws(6))[0];
await rep(6, r0.box, WIDE); await press('更換');
const r1 = (await draws(6))[0], rl = r1 && await pixel(6, r1.box.x + r1.box.w * .25, r1.box.y + r1.box.h / 2), rr = r1 && await pixel(6, r1.box.x + r1.box.w * .75, r1.box.y + r1.box.h / 2);
check('a page turned by /Rotate whose picture was stored turned: the new picture is upright on screen (red left, blue right)', !!r1 && r1.px.w === 80 && rl[0] > 200 && rl[2] < 80 && rr[2] > 200 && rr[0] < 80, {r0, r1, rl, rr});
const t0 = (await draws(7))[0];
await rep(7, t0.box, WIDE); await press('更換');
const t1 = (await draws(7))[0];
check('a picture set at 20°: the new one at the same angle', !!t0 && !!t1 && t1.px.w === 80 && Math.abs(Math.abs(t0.deg) - 20) < 1 && Math.abs(t1.deg - t0.deg) < 1, {t0:t0 && t0.deg, t1:t1 && t1.deg});
await rep(4, {x:100, y:192, w:100, h:50}, TALL);
const sr5 = await scopeRow();
await win.click('#modal [name="rfit"][value="fill"]'); await win.click('#modal [name="rscope"][value="all"]'); await press('更換');
const d5 = await draws(4);
check('填滿, 全部 2 處: both places take the new picture over their whole area; the old data gone', sr5 && d5.length === 2 && d5.every(d => d.px.w === 40 && d.px.h === 80) && d5.some(d => same(d.box, {x:100, y:192, w:100, h:50})) && d5.some(d => same(d.box, {x:300, y:192, w:100, h:50})) && !(await objects()).some(o => o.w === 50 && o.h === 20), {sr5, d5});
await rep(3, {x:100, y:142, w:100, h:100}, WIDE);
await win.click('#modal [data-turn="90"]'); await win.waitForTimeout(200); await press('更換');
const d3 = (await draws(3))[0];
check('a picture inside a form, turned once with ↻: drawn a quarter turn round, fitted (50 × 100)', !!d3 && d3.px.w === 80 && near(d3.box.w, 50) && near(d3.box.h, 100) && near(Math.abs(d3.deg), 90, 1), d3);
await rep(0, {x:100, y:342, w:100, h:100}, WIDE); await press('更換');
const nB = (await draws(0)).find(d => d.px.w === 80 && near(d.box.y, 367, 1.5));
check('a cropped picture: the new one fitted into the part that could be seen, centred', !!nB && same(nB.box, {x:100, y:367, w:100, h:50}), {nB, all:await draws(0)});

// ---- part 4 (final review) --------------------------------------------------------------------------------------------
await pick(8, {x:0, y:0, w:595, h:842}); await del();
if (await modal()) await press('刪除');
const t8 = await textOf(8);
check('invisible text in a font without widths: removed with the picture, not just hidden', (await draws(8)).length === 0 && !t8.includes('HIDDENTWO'), {t8});
await rep(9, {x:100, y:192, w:100, h:50}, WIDE); if (await modal()) await press('更換');
const d9 = await draws(9);
check('a form without resources of its own: after one picture is replaced, the other still shows', d9.some(d => d.px.w === 80) && d9.some(d => d.px.w === 58), d9);

console.log(failed ? `\n${failed} check(s) failed` : '\nall checks passed');
await app.evaluate(({app}) => app.exit(0)).catch(() => {});
