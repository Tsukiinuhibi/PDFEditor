// 上下層級: every object on a page lies above or below the others (the order of the page's /Annots: later on top). The bar
// beside a selected object, Ctrl+[ / Ctrl+] and the layers panel move it among the objects of its own layer on its page; a
// sticky note's window goes with it; links and form fields stay where they are. One undo step each.
import { launchPath, TMP } from './_env.mjs';
import { PDFDocument, PDFName, PDFString } from 'pdf-lib';
import fs from 'fs';
import path from 'path';

let failed = 0;
const check = (name, ok, detail = '') => { console.log(`${ok ? '✔' : '✘'} ${name}${detail !== '' ? '  ' + (typeof detail === 'string' ? detail : JSON.stringify(detail)) : ''}`); if (!ok) { failed++; process.exitCode = 1; } };

// page 1: a red square A, a link, a blue square B over part of A, then a sticky note C whose window sits before it;
// page 2: a green square D and, in the page itself, a black outline (an area for the fill tool)
const doc = await PDFDocument.create(), ctx = doc.context, N = n => PDFName.of(n);
const p1 = doc.addPage([595, 842]), p2 = doc.addPage([595, 842]);
const ap = rgb => ctx.register(ctx.stream(`${rgb} rg 0 0 150 150 re f`, {Type:'XObject', Subtype:'Form', BBox:[0, 0, 150, 150]}));
const sq = (rect, rgb, c) => ctx.register(ctx.obj({Type:'Annot', Subtype:'Square', Rect:rect, C:c, IC:c, F:4, AP:{N:ap(rgb)}}));
const rA = sq([100, 600, 250, 750], '1 0 0', [1, 0, 0]);
const rL = ctx.register(ctx.obj({Type:'Annot', Subtype:'Link', Rect:[400, 400, 500, 420], Border:[0, 0, 0], A:{S:'URI', URI:PDFString.of('https://example.com/')}}));
const rB = sq([180, 520, 330, 670], '0 0 1', [0, 0, 1]);
const rC = ctx.nextRef(), rPc = ctx.register(ctx.obj({Type:'Annot', Subtype:'Popup', Rect:[430, 600, 580, 700], Parent:rC, Open:false}));
ctx.assign(rC, ctx.obj({Type:'Annot', Subtype:'Text', Rect:[400, 700, 424, 724], Contents:PDFString.of('note C'), T:PDFString.of('someone'), Popup:rPc, F:4, Name:'Comment'}));
p1.node.set(N('Annots'), ctx.obj([rA, rL, rB, rPc, rC]));
p2.node.set(N('Annots'), ctx.obj([sq([100, 600, 250, 750], '0 0.6 0', [0, .6, 0])]));
p2.node.set(N('Contents'), ctx.register(ctx.stream('0 0 0 RG 3 w 300 200 200 150 re S\n')));
const PDF = path.join(TMP, 'stack.pdf'); fs.writeFileSync(PDF, await doc.save());

const { app } = await launchPath(PDF);
const win = await app.firstWindow(); win.on('pageerror', e => console.log('PAGEERR', e.message)); win.on('console', m => { if (m.type() === 'error') console.log('C', m.text().slice(0, 300)); });
await win.waitForTimeout(3000);
await win.waitForFunction(() => !!(window.__pdfapp && window.__pdfapp.S.pages.length), null, {timeout:30000});
const Ev = win.evaluate.bind(win);
const P = (i, x, y) => Ev(([i, x, y]) => { const r = window.__pdfapp.S.els[i].getBoundingClientRect(), s = window.__pdfapp.S.scale; return [r.left + x * s, r.top + y * s]; }, [i, x, y]);
const see = async (i, x, y) => {
  await Ev(([i, x, y]) => { const S = window.__pdfapp.S, vw = document.querySelector('#viewer'), vr = vw.getBoundingClientRect(), r = S.els[i].getBoundingClientRect();
    vw.scrollTop += r.top + y * S.scale - (vr.top + vr.height / 2); vw.scrollLeft += r.left + x * S.scale - (vr.left + vr.width / 2); }, [i, x, y]);
  await win.waitForTimeout(400); return P(i, x, y);
};
const tool = async t => { await Ev(t => window.__pdfapp.setTool(t), t); await win.waitForTimeout(300); };
const drag = async (a, b, opts = {}) => { await win.mouse.move(...a); await win.mouse.down(); await win.mouse.move(...b, {steps:8}); await win.mouse.up(); await win.waitForTimeout(opts.wait ?? 1500); };
const order = (i = 0) => Ev(i => window.__pdfapp.annotsOrder(i), i);
const ids = async (i = 0) => (await order(i)).map(o => o.id);
const undos = () => Ev(() => window.__pdfapp.S.undo.length);
const undo = async () => { await win.keyboard.press('Control+z'); await win.waitForTimeout(1800); };
const px = (i, x, y) => Ev(([i, x, y]) => { const S = window.__pdfapp.S, c = S.els[i].querySelector('canvas.pc'), r = c.getBoundingClientRect(), k = c.width / r.width;
  return [...c.getContext('2d').getImageData(Math.round(x * S.scale * k), Math.round(y * S.scale * k), 1, 1).data].slice(0, 3); }, [i, x, y]);
const red = c => c[0] > 200 && c[1] < 90 && c[2] < 90, blue = c => c[2] > 200 && c[0] < 90 && c[1] < 90;
const toastText = () => Ev(() => [...document.querySelectorAll('.toast')].map(t => t.textContent).join(' | '));
const key = async k => { await win.keyboard.press(k); await win.waitForTimeout(1800); };
const selId = () => Ev(() => { const s = window.__pdfapp.sel(); return s ? s.id : null; });

const [A, L, B, Pc, C] = await ids();
const OV = [215, 207];   // where A and B overlap (page points from the top left)
await see(0, ...OV);
check('(fixture) the overlap shows the square drawn later (blue)', blue(await px(0, ...OV)), await px(0, ...OV));

// ---- part 1: the bar beside a selection, the keys, a note's window, links stay ----------------------------------------
await tool('select');
await win.mouse.click(...await P(0, 300, 300)); await win.waitForTimeout(900);   // B, where it does not cover A
check('the bar beside a selected object has 移到最上層／上移一層／下移一層／移到最下層', await Ev(() => ['z-front', 'z-up', 'z-down', 'z-back'].every(k => !!document.querySelector(`.abar [data-x="${k}"]`))));
let u0 = await undos();
await win.click('.abar [data-x="z-back"]'); await win.waitForTimeout(1800);
check('〔移到最下層〕: B under A (the overlap turns red); the link keeps its place after A; one undo step; B still selected',
  JSON.stringify(await ids()) === JSON.stringify([B, A, L, Pc, C]) && red(await px(0, ...OV)) && (await undos()) === u0 + 1 && (await selId()) === B, {ids:await ids(), px:await px(0, ...OV), sel:await selId()});
await undo();
check('復原 once: back as it was (blue on top)', JSON.stringify(await ids()) === JSON.stringify([A, L, B, Pc, C]) && blue(await px(0, ...OV)));

await win.mouse.click(...await P(0, 130, 120)); await win.waitForTimeout(900);   // A, where B does not cover it
await key('Control+BracketRight');
const k1 = await ids();
await key('Control+BracketRight');
const k2 = await ids();
u0 = await undos();
await key('Control+BracketRight');
const t3 = await toastText(), k3 = await ids();
check('Ctrl+]: one step up each time (above B, then above the note); at the top a message and no undo step',
  JSON.stringify(k1) === JSON.stringify([L, B, A, Pc, C]) && JSON.stringify(k2) === JSON.stringify([L, B, Pc, C, A]) && JSON.stringify(k3) === JSON.stringify(k2) && t3.includes('已經在最上層') && (await undos()) === u0, {k1, k2, k3, t3});
await key('Control+Shift+BracketLeft');
const k4 = await ids();
await key('Control+Shift+BracketRight');
const k5 = await ids();
await key('Control+BracketLeft');
const k6 = await ids();
check('Ctrl+Shift+[ to the bottom, Ctrl+Shift+] to the top, Ctrl+[ one step down (under the note and its window)',
  JSON.stringify(k4) === JSON.stringify([L, A, B, Pc, C]) && JSON.stringify(k5) === JSON.stringify([L, B, Pc, C, A]) && JSON.stringify(k6) === JSON.stringify([L, B, A, Pc, C]) && (await selId()) === A, {k4, k5, k6});
// typing somewhere (the page number box): the keys are left alone
await win.click('#pgIn'); await win.keyboard.press('Control+BracketRight'); await win.waitForTimeout(1200);
check('typing in a box: Ctrl+] does not change the order', JSON.stringify(await ids()) === JSON.stringify(k6), await ids());
await win.keyboard.press('Escape'); await win.waitForTimeout(300);
// the note to the bottom: its window comes along, right after it
await Ev(([C]) => window.__pdfapp.stackObj(0, C, 'back'), [C]); await win.waitForTimeout(1800);
const k7 = await order();
check('a sticky note to the bottom: its window right after it, the rest in the same order', JSON.stringify(k7.map(o => o.id)) === JSON.stringify([L, C, Pc, B, A]) && k7[2].parent === C, k7);

// ---- the eraser: what is left of a stroke stays where the stroke was (under a square drawn later) ----------------------
await see(0, 200, 470);
await tool('pen');
await drag(await P(0, 60, 470), await P(0, 360, 470), {wait:600});
await tool('select'); await win.waitForTimeout(1500);
const ink0 = (await order()).filter(o => o.sub === 'Ink').map(o => o.id);
await tool('rect');
await drag(await P(0, 150, 440), await P(0, 250, 500));
const sqR = (await order()).filter(o => o.sub === 'Square').map(o => o.id).find(id => ![A, B].includes(id));
await tool('eraser');
await drag(await P(0, 100, 445), await P(0, 100, 495), {wait:2000});
const k8 = await order(), inks = k8.filter(o => o.sub === 'Ink'), at = id => k8.findIndex(o => o.id === id);
const strokes = await Ev(async () => (await window.__pdfapp.getAnns(0)).filter(a => a.subtype === 'Ink').map(a => a.ink.length));
check('the eraser cuts the stroke in two; what is left stays under the square drawn after it', ink0.length === 1 && inks.length === 1 && inks[0].id !== ink0[0] && strokes[0] === 2 && at(inks[0].id) < at(sqR), {ink0, k8, strokes});

console.log(failed ? `\n${failed} check(s) failed` : '\nall checks passed');
await app.evaluate(({app}) => app.exit(0)).catch(() => {});
