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
// page 2: a green square D and, in the page itself, a black outline (an area for the fill tool);
// page 3 (as some programs write it): note windows apart from their notes — [P3, N1, N2, N3, P1, P2, S]
const doc = await PDFDocument.create(), ctx = doc.context, N = n => PDFName.of(n);
const p1 = doc.addPage([595, 842]), p2 = doc.addPage([595, 842]), p3 = doc.addPage([595, 842]);
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
const notes = [300, 350, 400].map(() => ctx.nextRef()), wins = notes.map((n, k) => ctx.register(ctx.obj({Type:'Annot', Subtype:'Popup', Rect:[300, 500 - k * 60, 450, 550 - k * 60], Parent:n, Open:false})));
notes.forEach((n, k) => ctx.assign(n, ctx.obj({Type:'Annot', Subtype:'Text', Rect:[300 + k * 50, 700, 324 + k * 50, 724], Contents:PDFString.of('n' + (k + 1)), T:PDFString.of('someone'), Popup:wins[k], F:4, Name:'Comment'})));
p3.node.set(N('Annots'), ctx.obj([wins[2], ...notes, wins[0], wins[1], sq([100, 600, 200, 700], '1 0.5 0', [1, .5, 0])]));
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

// ---- part 2: the layers panel lists each page's objects front to back, marks the selection and reorders them ------------
const LAYERABLE = new Set(['Square', 'Circle', 'Text', 'Ink', 'FreeText', 'Stamp', 'Line', 'Polygon', 'PolyLine', 'Highlight']);
const front = async (i = 0) => (await order(i)).filter(o => LAYERABLE.has(o.sub)).map(o => o.id).reverse();
// the panel as [{layer, pages:[{h, ids}]}]: every layer row with the page headings and object rows under it
const panel = () => Ev(() => [...document.querySelectorAll('#p-layers .ly-row:not(.base)')].map(r => {
  const box = r.nextElementSibling && r.nextElementSibling.classList.contains('ly-objs') ? r.nextElementSibling : null, pages = [];
  if (box) [...box.children].forEach(c => { if (c.classList.contains('ly-pgh')) pages.push({h:c.textContent.trim(), ids:[]}); else if (c.classList.contains('ly-obj') && pages.length) pages[pages.length - 1].ids.push(c.dataset.oid); });
  return {layer:r.dataset.id, pages};
}));
const marked = () => Ev(() => [...document.querySelectorAll('#p-layers .ly-obj.sel')].map(r => r.dataset.oid));
const row = id => win.locator(`#p-layers .ly-obj[data-oid="${id}"]`);
await win.click('[data-act="layers"]'); await win.waitForTimeout(900);
let pn = await panel();
check('the panel lists the objects without opening anything: 第 1 頁, 第 2 頁, 第 3 頁; on page 1 the topmost first',
  pn.length === 1 && pn[0].pages.map(p => p.h).join() === '第 1 頁,第 2 頁,第 3 頁' && JSON.stringify(pn[0].pages[0].ids) === JSON.stringify(await front(0)), {pn, front:await front(0)});
await see(0, 200, 200);
await tool('select');
await win.mouse.click(...await P(0, 300, 300)); await win.waitForTimeout(900);
const mk1 = await marked();
await win.keyboard.down('Shift'); await win.mouse.click(...await P(0, 130, 120)); await win.keyboard.up('Shift'); await win.waitForTimeout(700);
const mk2 = await marked();
await win.keyboard.press('Escape'); await win.waitForTimeout(400);
check('the selected object is marked in the panel (both of a group); Esc: none', JSON.stringify(mk1) === JSON.stringify([B]) && mk2.length === 2 && mk2.includes(A) && mk2.includes(B) && !(await marked()).length, {mk1, mk2});
await row(A).click({button:'right'}); await win.waitForTimeout(300);
const menu = await Ev(() => ['z-front', 'z-up', 'z-down', 'z-back'].every(k => !!document.querySelector(`#ctx button[data-m="${k}"]`)));
await win.click('#ctx button[data-m="z-back"]'); await win.waitForTimeout(1800);
pn = await panel();
check('right-click a row → 移到最下層: A is the last row of page 1', menu && pn[0].pages[0].ids.at(-1) === A && JSON.stringify(pn[0].pages[0].ids) === JSON.stringify(await front(0)), {menu, pn:pn[0].pages[0].ids});
const top0 = pn[0].pages[0].ids[0];
await row(A).dragTo(row(top0), {targetPosition:{x:30, y:3}}); await win.waitForTimeout(1800);
pn = await panel();
check('a row dragged onto the upper half of the top row: it is on top now', pn[0].pages[0].ids[0] === A && (await front(0))[0] === A, pn[0].pages[0].ids);
u0 = await undos();
const D = pn[0].pages[1].ids[0];
await row(B).dragTo(row(D), {targetPosition:{x:30, y:3}}); await win.waitForTimeout(1500);
check('a row dragged onto another page\'s row: nothing changes', (await undos()) === u0 && JSON.stringify((await panel())[0].pages[0].ids) === JSON.stringify(pn[0].pages[0].ids));
await win.click('#p-layers .ly-row[data-id="__v"] .ly-car'); await win.waitForTimeout(500);
const shut1 = await Ev(() => document.querySelectorAll('#p-layers .ly-obj').length);
await key('Control+BracketRight');   // nothing selected: nothing happens, but make a change to rebuild the panel
await Ev(() => window.__pdfapp.actions.zoomIn()); await win.waitForTimeout(600);
const shut2 = await Ev(() => document.querySelectorAll('#p-layers .ly-obj').length);
await win.click('#p-layers .ly-row[data-id="__v"] .ly-car'); await win.waitForTimeout(500);
check('▸ folds the list away and it stays folded; ▸ again opens it', shut1 === 0 && shut2 === 0 && (await Ev(() => document.querySelectorAll('#p-layers .ly-obj').length)) > 0, {shut1, shut2});

// with layers: an object moves inside its own layer; dropped on a row of another layer it moves into that layer
await win.click('#p-layers [data-ly="add"]'); await win.waitForTimeout(2500);
const lys = await Ev(() => [...document.querySelectorAll('#p-layers .ly-row:not(.base):not(.loose)')].map(r => r.dataset.id));   // [圖層 2, 圖層 1]
await see(0, 140, 130);
const had = new Set(await ids());
await tool('rect');
await drag(await P(0, 110, 100), await P(0, 170, 160));
const E = (await ids()).find(id => !had.has(id));
await tool('select');
await win.mouse.click(...await P(0, 240, 110)); await win.waitForTimeout(900);   // A (in 圖層 1), outside E and B
u0 = await undos();
await key('Control+Shift+BracketRight');
const ord1 = await order(), at1 = id => ord1.findIndex(o => o.id === id), tt = await toastText();
check('A, already the top of 圖層 1: 移到最上層 says so and leaves it under 圖層 2\'s square (E)', at1(A) < at1(E) && (await undos()) === u0 && tt.includes('已經是「圖層 1」最上面的物件'), {ord1, tt});
await row(A).dragTo(row(E), {targetPosition:{x:30, y:3}}); await win.waitForTimeout(1800);
const ord2 = await order(), at2 = id => ord2.findIndex(o => o.id === id), oc = id => (ord2.find(o => o.id === id) || {}).oc;
check('A dropped on the upper half of E\'s row: in 圖層 2, above E', oc(A) === lys[0] && at2(A) === at2(E) + 1, {ord2, lys});
await undo();
const ord3 = await order();
check('復原 once: A back in 圖層 1, under E', (ord3.find(o => o.id === A) || {}).oc === lys[1] && ord3.findIndex(o => o.id === A) < ord3.findIndex(o => o.id === E), ord3);
await win.click(`#p-layers .ly-row[data-id="${lys[1]}"] .ly-lock`); await win.waitForTimeout(2000);
const before = await ids();
await row(B).dragTo(row(A), {targetPosition:{x:30, y:3}}); await win.waitForTimeout(1500);
check('a locked layer: its rows cannot be dragged (order unchanged, a message)', JSON.stringify(await ids()) === JSON.stringify(before) && (await toastText()).includes('已鎖定'), await toastText());
await win.click(`#p-layers .ly-row[data-id="${lys[1]}"] .ly-lock`); await win.waitForTimeout(2000);

// a fill done again keeps its layer and its place (under a square drawn after it), whatever layer is current
await win.click(`#p-layers .ly-row[data-id="${lys[1]}"] .ly-name`); await win.waitForTimeout(300);   // 圖層 1 current
await see(1, 400, 560);
await tool('fill');
await win.mouse.click(...await P(1, 400, 520)); await win.waitForTimeout(2500);
const F = (await order(1)).filter(o => o.sub === 'Stamp').map(o => o.id)[0];
await tool('rect');
await drag(await P(1, 420, 560), await P(1, 480, 620));
const G = (await order(1)).filter(o => o.sub === 'Square').map(o => o.id).at(-1);
await win.click(`#p-layers .ly-row[data-id="${lys[0]}"] .ly-name`); await win.waitForTimeout(300);   // 圖層 2 current
await tool('fill');
await win.mouse.click(...await P(1, 330, 520)); await win.waitForTimeout(2500);
const o4 = await order(1), F2 = o4.filter(o => o.sub === 'Stamp').map(o => o.id), i4 = id => o4.findIndex(o => o.id === id);
check('a fill done again: a new one in its place (圖層 1, under the square drawn after it)', !!F && F2.length === 1 && F2[0] !== F && (o4.find(o => o.id === F2[0]) || {}).oc === lys[1] && i4(F2[0]) < i4(G), {F, F2, o4});

// ---- part 3 (final review): a neighbour whose note window lies apart is one step; a key held or pressed twice is one change -
const stackOrder = async i => (await order(i)).filter(o => o.sub !== 'Popup').map(o => o.id);
const [N1, N2, N3, S3] = await stackOrder(2);
await Ev(([n]) => window.__pdfapp.stackObj(2, n, 'forward'), [N1]); await win.waitForTimeout(1800);
const s1 = await stackOrder(2);
await Ev(([n]) => window.__pdfapp.stackObj(2, n, 'backward'), [S3]); await win.waitForTimeout(1800);
const s2 = await stackOrder(2), o2 = await order(2);
check('a note one step up past a note whose window lies at the end: one step, not past the next one too', JSON.stringify(s1) === JSON.stringify([N2, N1, N3, S3]), {s1, want:[N2, N1, N3, S3]});
check('one step down past a note whose window lies at the start: one step, not to the bottom; each window still there once',
  JSON.stringify(s2) === JSON.stringify([N2, N1, S3, N3]) && o2.filter(o => o.sub === 'Popup').length === 3, {s2, o2});
await see(2, 150, 190);
await tool('select');
await win.mouse.click(...await P(2, 150, 190)); await win.waitForTimeout(900);
u0 = await undos();
await Ev(() => { const k = {key:'[', code:'BracketLeft', ctrlKey:true, bubbles:true}; window.dispatchEvent(new KeyboardEvent('keydown', k)); window.dispatchEvent(new KeyboardEvent('keydown', k)); });
await win.waitForTimeout(2500);
const s3 = await stackOrder(2);
check('Ctrl+[ twice at once (a key held down): one change, one undo step', (await selId()) === S3 && JSON.stringify(s3) === JSON.stringify([N2, S3, N1, N3]) && (await undos()) === u0 + 1, {s3, undos:(await undos()) - u0});

// ---- part 4 (v1.0.50): locked layers, an unlayered object, a signed document, folded lists per document, the page's selection --
const d4 = await PDFDocument.create(), c4 = d4.context, q4 = d4.addPage([595, 842]);
const ap4 = rgb => c4.register(c4.stream(`${rgb} rg 0 0 100 100 re f`, {Type:'XObject', Subtype:'Form', BBox:[0, 0, 100, 100]}));
const L1 = c4.register(c4.obj({Type:'OCG', Name:PDFString.of('LayerA')})), L2 = c4.register(c4.obj({Type:'OCG', Name:PDFString.of('LayerB'), PDFE_Lock:true}));   // (locked as this program locks a layer)
d4.catalog.set(N('OCProperties'), c4.obj({OCGs:[L1, L2], D:{Order:[L2, L1], ON:[L1, L2], Locked:[L2]}}));
const sq4 = (rect, rgb, oc) => c4.register(c4.obj({Type:'Annot', Subtype:'Square', Rect:rect, F:4, AP:{N:ap4(rgb)}, ...(oc ? {OC:oc} : {})}));
const U4 = sq4([50, 650, 150, 750], '0 1 0', null), Z4 = sq4([200, 650, 300, 750], '0 0 1', L1), X4 = sq4([350, 650, 450, 750], '1 0 0', L1), Y4 = sq4([50, 450, 150, 550], '1 1 0', L2);
q4.node.set(N('Annots'), c4.obj([U4, Z4, X4, Y4]));   // the unlayered square at the very bottom
const PDF4 = path.join(TMP, 'stack4.pdf'); fs.writeFileSync(PDF4, await d4.save());
await app.evaluate(({BrowserWindow}, p) => BrowserWindow.getAllWindows()[0].webContents.send('open-path', p), PDF4);
await win.waitForFunction(() => /stack4/.test(window.__pdfapp.S.name), null, {timeout:30000}); await win.waitForTimeout(2500);
await tool('select');
const [iU, iZ, iX, iY] = await ids();
const lyRow = name => win.locator('#p-layers .ly-row', {hasText:name}).first();
// an object row dropped on a locked layer's row: refused, and said so
await row(iX).dragTo(lyRow('LayerB'), {targetPosition:{x:40, y:8}}); await win.waitForTimeout(1500);
const tLock = await toastText(), ocX = ((await order()).find(o => o.id === iX) || {}).oc;
check('an object dropped on a locked layer: refused, and the person is told the layer is locked', /已鎖定/.test(tLock) && ocX !== undefined && ocX !== null && (await order()).find(o => o.id === iY).oc !== ocX, {tLock, ocX});
// 移到圖層 does not offer a locked layer, and an object on a locked layer offers no move
const menuOf = async id => { await row(id).click({button:'right'}); await win.waitForTimeout(400);
  const m = await Ev(() => [...document.querySelectorAll('#ctx button[data-m="to"]')].map(b => b.textContent)); await win.keyboard.press('Escape'); await win.waitForTimeout(300); return m; };
const mX = await menuOf(iX), mY = await menuOf(iY);
check('移到圖層: a locked layer is not offered; an object on a locked layer offers no move', !mX.some(t => /LayerB/.test(t)) && mY.length === 0, {mX, mY});
// an unlayered object at the top of the unlayered ones, under layered objects: the message says which ones it tops
await see(0, 100, 142); await win.mouse.click(...await P(0, 100, 142)); await win.waitForTimeout(600);
const selU = await selId();
await key('Control+Shift+BracketRight');
const tTop = await toastText();
check('an unlayered object already the top of the unlayered ones (layered objects above it): says so, not 「已經在最上層」', selU === iU && !/已經在最上層/.test(tTop) && /不屬於任何圖層|不分層/.test(tTop), {selU, tTop});
await win.keyboard.press('Escape'); await win.waitForTimeout(300);
// a signed document: a row dropped where it already is asks nothing and changes nothing
await Ev(() => { window.__pdfapp.S.signed = true; });
const u4 = await undos();
await row(iX).dragTo(row(iZ), {targetPosition:{x:30, y:3}}); await win.waitForTimeout(1200);
const asked = await Ev(() => document.querySelector('#mask').classList.contains('show') ? document.querySelector('#modal .mh').textContent : '');
if (asked) { await win.keyboard.press('Escape'); await win.waitForTimeout(500); }
await Ev(() => { window.__pdfapp.S.signed = false; });
check('a signed document: a row dropped where it already is asks nothing and changes nothing', !asked && (await undos()) === u4, {asked, undos:await undos(), u4});
// the page's selection stays when the panel moves another object
await see(0, 400, 142); await win.mouse.click(...await P(0, 400, 142)); await win.waitForTimeout(600);
const selX = await selId();
await row(iZ).click({button:'right'}); await win.waitForTimeout(400); await win.click('#ctx button[data-m="z-front"]'); await win.waitForTimeout(1800);
const selAfter = await selId();
check('the panel moving another object leaves the page\'s selection alone', selX === iX && selAfter === iX, {selX, selAfter});
await win.keyboard.press('Escape'); await win.waitForTimeout(300);
// (final review) 移到圖層 on another object from the panel's menu: done, and the page's selection stays
await see(0, 400, 142); await win.mouse.click(...await P(0, 400, 142)); await win.waitForTimeout(600);   // X
const selX5 = await selId();
await row(iZ).click({button:'right'}); await win.waitForTimeout(400); await win.click('#ctx button[data-m="to"][data-v="__loose"]'); await win.waitForTimeout(1800);
const selX6 = await selId(), zLoose = !((await order()).find(o => o.id === iZ) || {}).oc;
check('移到圖層 on another object from the panel\'s menu: done, and the page\'s selection stays', selX5 === iX && zLoose && selX6 === iX, {selX5, selX6, zLoose});
await win.keyboard.press('Escape'); await win.waitForTimeout(300);
// (final review) a group selected on the page stays when the panel moves another object
await win.mouse.click(...await P(0, 100, 142)); await win.waitForTimeout(500);   // U
await win.keyboard.down('Shift'); await win.mouse.click(...await P(0, 400, 142)); await win.keyboard.up('Shift'); await win.waitForTimeout(600);   // and X
const g0 = await Ev(() => window.__pdfapp.multi());
await row(iZ).click({button:'right'}); await win.waitForTimeout(400); await win.click('#ctx button[data-m="z-back"]'); await win.waitForTimeout(1800);
const g1 = await Ev(() => window.__pdfapp.multi());
check('a group selected on the page stays when the panel moves another object', g0?.ids.length === 2 && g1?.ids.length === 2 && g1.ids.includes(iU) && g1.ids.includes(iX), {g0, g1});
await win.keyboard.press('Escape'); await win.waitForTimeout(300);
// (final review) an object dropped on its own layer's row while already the top of it: nothing changes; a signed document
// is not asked
const ord5 = await order(), ocA = (ord5.find(o => o.id === iX) || {}).oc, topA = ord5.filter(o => o.oc && o.oc === ocA).pop();
const u5 = await undos();
await row(topA.id).dragTo(lyRow('LayerA'), {targetPosition:{x:40, y:8}}); await win.waitForTimeout(1500);
const u5b = await undos();
await Ev(() => { window.__pdfapp.S.signed = true; });
await row(topA.id).dragTo(lyRow('LayerA'), {targetPosition:{x:40, y:8}}); await win.waitForTimeout(1500);
const asked5 = await Ev(() => document.querySelector('#mask').classList.contains('show') ? document.querySelector('#modal .mh').textContent : '');
if (asked5) { await win.keyboard.press('Escape'); await win.waitForTimeout(500); }
await Ev(() => { window.__pdfapp.S.signed = false; });
check('an object dropped on its own layer\'s row, already the top of it: no undo step; a signed document is not asked', !!topA && u5b === u5 && !asked5 && (await undos()) === u5, {topA, u5, u5b, asked5});
// (final review) an unsigned document: a drop that moves an object reads the file as often as the same move made from the
// menu (no trial run first: that is for a signed document only)
await Ev(() => { const L = PDFLib.PDFDocument; if (!L.__orig) { L.__orig = L.load; L.load = function(...a){ window.__loads = (window.__loads || 0) + 1; return L.__orig.apply(this, a); }; } });
const loadsOf = async act => { await win.waitForTimeout(1200); await Ev(() => { window.__loads = 0; }); await act(); await win.waitForTimeout(2200); return Ev(() => window.__loads); };
const ordM = await order();   // the two unlayered ones at the bottom: ordM[0] under ordM[1]
const nMenu = await loadsOf(async () => { await row(ordM[0].id).click({button:'right'}); await win.waitForTimeout(400); await win.click('#ctx button[data-m="z-front"]'); });
const ordM2 = await order();
const nDrop = await loadsOf(async () => { const bb = await row(ordM2[0].id).boundingBox(); await row(ordM2[1].id).dragTo(row(ordM2[0].id), {targetPosition:{x:30, y:bb.height - 3}}); });
const ordM3 = await order();
await Ev(() => { const L = PDFLib.PDFDocument; if (L.__orig) { L.load = L.__orig; delete L.__orig; } });
check('an unsigned document: a drop that moves an object reads the file as often as the same move from the menu (no trial run)', !ordM[0].oc && !ordM[1].oc && ordM2[1].id === ordM[0].id && ordM3[0].id === ordM[0].id && nDrop === nMenu, {nMenu, nDrop, ordM:ordM.map(o => o.id), ordM2:ordM2.map(o => o.id), ordM3:ordM3.map(o => o.id)});
// folded lists belong to their document: folding one tab's list does not fold another tab's
const one = async name => { const d = await PDFDocument.create(), p = d.addPage([300, 300]);
  p.node.set(N('Annots'), d.context.obj([d.context.register(d.context.obj({Type:'Annot', Subtype:'Square', Rect:[20, 20, 120, 120], F:4, AP:{N:d.context.register(d.context.stream('0 0 1 rg 0 0 100 100 re f', {Type:'XObject', Subtype:'Form', BBox:[0, 0, 100, 100]}))}}))]));
  const f = path.join(TMP, name); fs.writeFileSync(f, await d.save()); return f; };
for (const n of ['fold a.pdf', 'fold b.pdf']) { await app.evaluate(({BrowserWindow}, p) => BrowserWindow.getAllWindows()[0].webContents.send('open-path', p), await one(n)); await win.waitForFunction(n => window.__pdfapp.S.name === n, n, {timeout:30000}); await win.waitForTimeout(1500); }
await Ev(() => { const c = document.querySelector('#p-layers .ly-row .ly-car'); if (c) c.click(); }); await win.waitForTimeout(800);   // fold 「fold b」's list
const foldedB = await Ev(() => document.querySelectorAll('#p-layers .ly-obj').length);
await win.locator('.dtab', {hasText:'fold a'}).first().click(); await win.waitForTimeout(1800);
const openA = await Ev(() => document.querySelectorAll('#p-layers .ly-obj').length);
check('a folded list belongs to its own document: another tab\'s list stays open', foldedB === 0 && openA > 0, {foldedB, openA});

console.log(failed ? `\n${failed} check(s) failed` : '\nall checks passed');
await app.evaluate(({app}) => app.exit(0)).catch(() => {});
