// 對齊: the select tool picks several objects (Shift+click, or a box dragged over empty space); with 2 or more the bar
// above the pages aligns or distributes them, and they move or are deleted together. One undo step each.
import { launchPath, TMP } from './_env.mjs';
import { PDFDocument, PDFName } from 'pdf-lib';
import fs from 'fs';
import path from 'path';

let failed = 0;
const check = (name, ok, detail = '') => { console.log(`${ok ? '✔' : '✘'} ${name}${detail !== '' ? '  ' + (typeof detail === 'string' ? detail : JSON.stringify(detail)) : ''}`); if (!ok) { failed++; process.exitCode = 1; } };

// two blank pages; page 1 also holds a hidden square (flag 2: it cannot be clicked, so it must not be picked up either)
const doc = await PDFDocument.create(), ctx = doc.context;
const p1 = doc.addPage([595, 842]); doc.addPage([595, 842]);
p1.node.set(PDFName.of('Annots'), ctx.obj([ctx.register(ctx.obj({Type:'Annot', Subtype:'Square', Rect:[250, 522, 300, 562], C:[0, 0, 1], F:2}))]));
const PDF = path.join(TMP, 'align.pdf'); fs.writeFileSync(PDF, await doc.save());

const { app } = await launchPath(PDF);
const win = await app.firstWindow(); win.on('pageerror', e => console.log('PAGEERR', e.message)); win.on('console', m => { if (m.type() === 'error') console.log('C', m.text().slice(0, 300)); });
await win.waitForTimeout(3000);
await win.waitForFunction(() => !!(window.__pdfapp && window.__pdfapp.S.pages.length), null, {timeout:30000});
const A = win.evaluate.bind(win);
const P = (i, x, y) => A(([i, x, y]) => { const r = window.__pdfapp.S.els[i].getBoundingClientRect(), s = window.__pdfapp.S.scale; return [r.left + x * s, r.top + y * s]; }, [i, x, y]);
const see = async (i, x, y) => {
  await A(([i, x, y]) => { const S = window.__pdfapp.S, vw = document.querySelector('#viewer'), vr = vw.getBoundingClientRect(), r = S.els[i].getBoundingClientRect();
    vw.scrollTop += r.top + y * S.scale - (vr.top + vr.height / 2); vw.scrollLeft += r.left + x * S.scale - (vr.left + vr.width / 2); }, [i, x, y]);
  await win.waitForTimeout(400); return P(i, x, y);
};
const tool = async t => { await A(t => window.__pdfapp.setTool(t), t); await win.waitForTimeout(300); };
const drag = async (a, b, opts = {}) => { await win.mouse.move(...a); await win.mouse.down(); await win.mouse.move(...b, {steps:8}); await win.mouse.up(); await win.waitForTimeout(opts.wait ?? 1500); };
const anns = (i = 0) => A(async i => (await window.__pdfapp.getAnns(i)).map(a => ({id:a.id, sub:a.subtype, x:a.x, y:a.y, w:a.w, h:a.h})), i);
const multi = () => A(() => window.__pdfapp.multi());
const barTitle = () => A(() => { const h = document.querySelector('#hint'); return h.classList.contains('show') && h.classList.contains('multi') ? (h.querySelector('.sb-t') || {}).textContent || '' : null; });
const shiftClick = async xy => { await win.keyboard.down('Shift'); await win.mouse.click(...xy); await win.keyboard.up('Shift'); await win.waitForTimeout(500); };
const near = (a, b, d = 1) => Math.abs(a - b) <= d;
const undo = async () => { await win.keyboard.press('Control+z'); await win.waitForTimeout(1800); };

// ---- part 1: several objects selected, moved and deleted together --------------------------------------------------------
await see(0, 200, 220);
await tool('rect');
for (const [a, b] of [[[100, 100], [160, 140]], [[220, 180], [300, 230]], [[140, 280], [200, 330]]]) await drag(await P(0, ...a), await P(0, ...b));
const rects = (await anns()).filter(a => a.sub === 'Square');
const box = id => anns().then(l => l.find(a => a.id === id));
await tool('select');
const marquee = async () => { await drag(await P(0, 80, 80), await P(0, 330, 350), {wait:900}); };
await marquee();
let m = await multi();
check('a box dragged over empty space: the 3 squares selected (not the hidden one); 已選取 3 個物件', rects.length === 3 && !!m && m.ids.length === 3 && rects.every(r => m.ids.includes(r.id)) && (await barTitle() || '').includes('已選取 3 個物件'), {rects, m, title:await barTitle()});
const r2 = rects.find(r => near(r.x, 220, 6));
await shiftClick(await P(0, r2.x + 3, r2.y + r2.h / 2));
const m2 = await multi();
await shiftClick(await P(0, r2.x + 3, r2.y + r2.h / 2));
const m3 = await multi();
check('Shift+click: out of the selection, then back in', m2?.ids.length === 2 && !m2.ids.includes(r2.id) && m3?.ids.length === 3, {m2, m3});
await win.keyboard.press('Escape'); await win.waitForTimeout(400);
check('Esc: nothing selected, the bar gone', (await multi()) === null && (await barTitle()) === null && !(await A(() => document.querySelectorAll('.asel.multi').length)));
await marquee();
const b0 = await Promise.all(rects.map(r => box(r.id)));
const r1 = rects.find(r => near(r.x, 100, 6));
await drag(await P(0, r1.x + 6, r1.y + r1.h / 2), await P(0, r1.x + 46, r1.y + r1.h / 2 + 30), {wait:2000});
const b1 = await Promise.all(rects.map(r => box(r.id)));
check('dragging one of them: all three move the same way; still selected', b0.every((b, k) => near(b1[k].x, b.x + 40, 1.5) && near(b1[k].y, b.y + 30, 1.5)) && (await multi())?.ids.length === 3, {b0, b1});
await undo();
const b2 = await Promise.all(rects.map(r => box(r.id)));
check('復原 once: all three back', b0.every((b, k) => near(b2[k].x, b.x) && near(b2[k].y, b.y)), b2);
await marquee();
await win.keyboard.press('Delete'); await win.waitForTimeout(1800);
const gone = (await anns()).filter(a => a.sub === 'Square').length;
await undo();
const back = (await anns()).filter(a => a.sub === 'Square').length;
check('Delete: all three gone; 復原 once: all back', gone === 0 && back === 3, {gone, back});
await marquee();
await tool('pen');
check('another tool: the outlines and the bar go', !(await A(() => document.querySelectorAll('.asel.multi').length)) && (await barTitle()) === null && (await multi()) === null);
await tool('select');

// Shift on a selected object's handles keeps its old meaning (turn in 15° steps, resize): it does not change the selection
const one = rects[0];
await win.mouse.click(...await P(0, one.x + 4, one.y + one.h / 2)); await win.waitForTimeout(900);
const rh1 = await win.locator('.asel .rh').boundingBox({timeout:8000}), sb1 = await win.locator('.asel').boundingBox();
const cc = {x:sb1.x + sb1.width / 2, y:sb1.y + sb1.height / 2}, hh = {x:rh1.x + rh1.width / 2, y:rh1.y + rh1.height / 2}, RR = Math.hypot(hh.x - cc.x, hh.y - cc.y), aa = Math.atan2(hh.y - cc.y, hh.x - cc.x);
await win.keyboard.down('Shift'); await win.mouse.move(hh.x, hh.y); await win.mouse.down();
for (let k = 1; k <= 10; k++) { const ang = aa + 44 * Math.PI / 180 * k / 10; await win.mouse.move(cc.x + RR * Math.cos(ang), cc.y + RR * Math.sin(ang)); }
await win.mouse.up(); await win.keyboard.up('Shift'); await win.waitForTimeout(2200);
const degShift = await A(id => window.__pdfapp.annRot(0, id).then(r => r && r.deg), one.id);
check('Shift on the turn handle still turns the object in 15° steps (not a selection change)', near(Math.abs(degShift || 0), 45, .6) && (await multi()) === null, {degShift, m:await multi()});
await undo();

// ---- part 2: align and distribute (page 2) --------------------------------------------------------------------------------
await see(1, 255, 225);   // the middle of the box dragged over the three (40..470 × 80..370)
await tool('rect');
for (const [a, b] of [[[60, 100], [100, 140]], [[150, 200], [210, 240]], [[400, 300], [440, 350]]]) await drag(await P(1, ...a), await P(1, ...b));
await tool('select');
const three = (await anns(1)).filter(a => a.sub === 'Square');
const boxes1 = () => anns(1).then(l => three.map(t => l.find(a => a.id === t.id)));
const marq1 = async () => { await drag(await P(1, 40, 80), await P(1, 470, 370), {wait:900}); };
const al = async k => { await win.click(`#hint.multi [data-al="${k}"]`); await win.waitForTimeout(1800); };
const o = await boxes1(), minX = Math.min(...o.map(b => b.x)), maxR = Math.max(...o.map(b => b.x + b.w)), maxB = Math.max(...o.map(b => b.y + b.h));
await marq1(); await al('left');
let nb = await boxes1();
check('靠左: all three start at the leftmost one\'s x; that one did not move; still selected', nb.every(b => near(b.x, minX, .6)) && near(nb[0].x, o[0].x, .6) && (await multi())?.ids.length === 3, nb);
await undo();
nb = await boxes1();
check('復原 once: back where they were', nb.every((b, k) => near(b.x, o[k].x, .6) && near(b.y, o[k].y, .6)), nb);
await marq1(); await al('hcenter');
nb = await boxes1();
check('水平置中: their centres on the middle of the three together', nb.every(b => near(b.x + b.w / 2, (minX + maxR) / 2, .6)), nb);
await undo();
await marq1(); await al('bottom');
nb = await boxes1();
check('靠下: all end at the lowest bottom', nb.every(b => near(b.y + b.h, maxB, .6)), nb);
await undo();
await marq1();
await win.selectOption('#hint.multi select[data-alto]', 'page'); await win.waitForTimeout(300);
await al('hcenter');
nb = await boxes1();
check('對齊到頁面, 水平置中: each centred on the page', nb.every(b => near(b.x + b.w / 2, 595 / 2, .6)), nb);
await undo();
await marq1();
await win.selectOption('#hint.multi select[data-alto]', 'sel'); await win.waitForTimeout(300);
await win.click('#hint.multi [data-dist="h"]'); await win.waitForTimeout(1800);
nb = (await boxes1()).sort((a, b) => a.x - b.x);
const g1 = nb[1].x - (nb[0].x + nb[0].w), g2 = nb[2].x - (nb[1].x + nb[1].w);
check('水平平均分配: the gaps either side of the middle one are equal; the first and last stay', near(g1, g2, .6) && near(nb[0].x, minX, .6) && near(nb[2].x + nb[2].w, maxR, .6), {g1, g2});
await undo();
// a stamp turned 30° and a rectangle: aligned by what can be seen of each (the turned frame); the angle stays
await A(() => localStorage.setItem('pdfeditor.stamp.v1', JSON.stringify({t:'核准', c:'green', kind:'box'})));
await see(1, 250, 520);
await tool('stamp'); await win.mouse.click(...await P(1, 160, 520)); await win.waitForTimeout(1800);
await tool('rect'); await drag(await P(1, 320, 480), await P(1, 380, 540));
await tool('select');
const st = (await anns(1)).find(a => a.sub === 'Stamp');
await win.mouse.click(...await P(1, st.x + 6, st.y + st.h / 2)); await win.waitForTimeout(900);
const rh = await win.locator('.asel .rh').boundingBox({timeout:8000}), sb = await win.locator('.asel').boundingBox();
const c0 = {x:sb.x + sb.width / 2, y:sb.y + sb.height / 2}, h0 = {x:rh.x + rh.width / 2, y:rh.y + rh.height / 2}, R = Math.hypot(h0.x - c0.x, h0.y - c0.y), a0 = Math.atan2(h0.y - c0.y, h0.x - c0.x);
await win.mouse.move(h0.x, h0.y); await win.mouse.down();
for (let k = 1; k <= 10; k++) { const ang = a0 + 30 * Math.PI / 180 * k / 10; await win.mouse.move(c0.x + R * Math.cos(ang), c0.y + R * Math.sin(ang)); }
await win.mouse.up(); await win.waitForTimeout(2200);
await win.keyboard.press('Escape'); await win.waitForTimeout(300);
const dRot = id => A(id => window.__pdfapp.annRot(1, id).then(r => r && r.deg), id);
const d0 = await dRot(st.id);
await drag(await P(1, 90, 430), await P(1, 420, 610), {wait:900});
const two = await multi();
await al('left');
const sNow = (await anns(1)).find(a => a.id === st.id), rNow = (await anns(1)).find(a => a.sub === 'Square' && near(a.y, 478, 8));
check('a turned stamp and a rectangle, 靠左: their outer frames line up; the stamp keeps its angle', two?.ids.length === 2 && near(Math.abs(d0 || 0), 30, 3) && !!sNow && !!rNow && near(sNow.x, rNow.x, .8) && near(await dRot(st.id), d0, .5), {two, d0, sNow, rNow});
// a line, a text box and a rectangle: 靠上 lines up their tops; the line moves whole
await see(1, 280, 700);
await tool('line'); await drag(await P(1, 80, 690), await P(1, 180, 740));
await tool('textbox'); await win.mouse.click(...await P(1, 250, 700)); await win.waitForTimeout(400); await win.keyboard.type('Hi'); await win.keyboard.press('Escape'); await win.waitForTimeout(1800);
await tool('rect'); await drag(await P(1, 400, 720), await P(1, 460, 760));
await tool('select');
const before = (await anns(1)).filter(a => a.y > 660);
await drag(await P(1, 60, 655), await P(1, 500, 790), {wait:900});
const n3 = (await multi())?.ids.length;
await al('top');
const after = (await anns(1)).filter(a => before.some(b => b.id === a.id));
const top = Math.min(...before.map(b => b.y));
check('a line, a text box and a rectangle, 靠上: their tops line up; each keeps its size', n3 === 3 && after.length === 3 && after.every(a => near(a.y, top, .8)) && after.every(a => { const b = before.find(x => x.id === a.id); return near(a.w, b.w, .8) && near(a.h, b.h, .8); }), {n3, before, after});

// ---- part 3 (final review): the multi-selection never outlives what it was made for -----------------------------------------
await see(0, 250, 220);
await tool('rect'); await drag(await P(0, 400, 100), await P(0, 460, 140));
await tool('select');
const fourth = (await anns(0)).find(a => a.sub === 'Square' && near(a.x, 398, 6));
await marquee();
await win.mouse.click(...await P(0, fourth.x + 4, fourth.y + fourth.h / 2)); await win.waitForTimeout(700);
const afterClick = {multi:await multi(), sel:(await A(() => window.__pdfapp.sel()))?.id, outlines:await A(() => document.querySelectorAll('.asel.multi').length)};
await win.keyboard.press('Delete'); await win.waitForTimeout(1800);
const leftSq = (await anns(0)).filter(a => a.sub === 'Square').map(a => a.id);
check('a plain click on another object: the group is let go; Delete removes only that object', afterClick.multi === null && afterClick.sel === fourth.id && !afterClick.outlines && leftSq.length === 3 && !leftSq.includes(fourth.id), {afterClick, leftSq});
await undo();
await marquee();
await win.mouse.click(...await P(0, 520, 300), {button:'right'}); await win.waitForTimeout(700);   // empty space, on screen
check('a right-click on empty space lets the group go', (await multi()) === null && !(await A(() => document.querySelectorAll('.asel.multi').length)));
await marquee();
await A(() => window.__pdfapp.setTool('select')); await win.waitForTimeout(400);
check('choosing 選取 again while several are selected: the bar stays', (await multi())?.ids.length === 3 && (await barTitle() || '').includes('已選取 3 個物件'), {m:await multi(), t:await barTitle()});
const before3 = (await anns(0)).filter(a => a.sub === 'Square' && rects.some(r => r.id === a.id));
const lm = before3.reduce((p, q) => (p.x < q.x ? p : q));
await drag(await P(0, lm.x + 4, lm.y + lm.h / 2), await P(0, lm.x + 700, lm.y + lm.h / 2), {wait:2000});
const after3 = (await anns(0)).filter(a => before3.some(b => b.id === a.id));
check('a group dragged far off the page: each object keeps at least half on the page', after3.length === 3 && after3.every(a => a.x + a.w / 2 <= 595 + .5 && a.x + a.w / 2 >= -.5), after3);
await undo();
await win.click('[data-view="single"]'); await win.waitForTimeout(900);
await see(0, 250, 220); await marquee();
const mSingle = await multi();
await win.keyboard.press('PageDown'); await win.waitForTimeout(1200);
check('one page at a time: turning the page lets the group go', mSingle?.ids.length === 3 && (await multi()) === null && (await barTitle()) === null, {mSingle, m:await multi()});
await win.keyboard.press('PageUp'); await win.waitForTimeout(1200);
await see(0, 250, 220); await marquee();
await win.click('.thumb[data-i="1"]'); await win.waitForTimeout(800);
check('clicking a thumbnail lets the group go (Delete is about pages then)', (await multi()) === null);
await win.click('[data-view="continuous"]'); await win.waitForTimeout(900);

// ---- part 4 (v1.0.50): vertical distribute, one-object box, Shift+box, Esc, the page's edge, Shift+click inside an outline,
// a nudge not yet written, a declined delete, the 對齊到 list, the last tab ------------------------------------------------
const undos = () => A(() => window.__pdfapp.S.undo.length);
const sel = () => A(() => window.__pdfapp.sel()).then(s => s && s.id);
await A(() => document.activeElement && document.activeElement.blur && document.activeElement.blur());
await see(1, 255, 225); await marq1();
await win.click('#hint.multi [data-dist="v"]'); await win.waitForTimeout(1800);
nb = (await boxes1()).sort((a, b) => a.y - b.y);
const oy = [...o].sort((a, b) => a.y - b.y), v1 = nb[1].y - (nb[0].y + nb[0].h), v2 = nb[2].y - (nb[1].y + nb[1].h);
check('垂直平均分配: the gaps above and below the middle one are equal; the top and bottom ones stay', near(v1, v2, .6) && near(nb[0].y, oy[0].y, .6) && near(nb[2].y + nb[2].h, oy[2].y + oy[2].h, .6), {v1, v2, nb});
await undo();
await win.keyboard.press('Escape'); await win.waitForTimeout(300);
await see(0, 300, 600);
await tool('rect');
for (const [a, b] of [[[60, 450], [120, 490]], [[200, 450], [260, 490]], [[340, 450], [400, 490]]]) await drag(await P(0, ...a), await P(0, ...b));
await tool('select');
const row4 = (await anns(0)).filter(a => a.sub === 'Square' && a.y > 430 && a.y < 470).sort((p, q) => p.x - q.x);
const box4 = () => anns(0).then(l => row4.map(t => l.find(a => a.id === t.id)));
const marq4 = async () => { await see(0, 235, 472); await drag(await P(0, 40, 430), await P(0, 430, 515), {wait:900}); };
// with an object selected (its bar above the pages), a box dragged from empty space starts where it was pressed on the page
// (the bar goes as the box starts, and the pages move up by its height)
await see(0, 235, 472);
await win.mouse.click(...await P(0, row4[1].x + 6, row4[1].y + row4[1].h / 2)); await win.waitForTimeout(900);
const barUp = await A(() => document.querySelector('#hint').classList.contains('objbar'));
await drag(await P(0, row4[0].x - 15, row4[0].y - 12), await P(0, row4[0].x + row4[0].w + 15, row4[0].y + row4[0].h + 12), {wait:900});
const pick0 = {m:await multi(), s:await sel()};
check('with an object selected (its bar above the pages), a box dragged from empty space starts where it was pressed', barUp && pick0.m === null && pick0.s === row4[0].id, {barUp, pick0});
await win.keyboard.press('Escape'); await win.waitForTimeout(300);
// Esc during a group drag: back where they were, still selected, nothing written
await marq4();
const e0 = await box4(), u0 = await undos();
await win.mouse.move(...await P(0, e0[0].x + 6, e0[0].y + e0[0].h / 2)); await win.mouse.down();
await win.mouse.move(...await P(0, e0[0].x + 66, e0[0].y + e0[0].h / 2 + 40), {steps:8}); await win.waitForTimeout(200);
await win.keyboard.press('Escape'); await win.waitForTimeout(200);
await win.mouse.up(); await win.waitForTimeout(1800);
const e1 = await box4(), tf = await A(() => [...document.querySelectorAll('.asel.multi')].map(el => el.style.transform || ''));
check('Esc during a group drag: they stay where they were, still selected; no undo step', row4.length === 3 && e0.every((b, k) => near(e1[k].x, b.x) && near(e1[k].y, b.y)) && (await multi())?.ids.length === 3 && tf.length === 3 && tf.every(t => !t) && (await undos()) === u0, {e0, e1, tf, m:await multi(), u:[u0, await undos()]});
if ((await undos()) !== u0) await undo();   // (the checks below start from where they were)
// a box over one object: that one, by itself; Shift+box adds
let cb = await box4();
await drag(await P(0, cb[1].x - 20, cb[1].y - 15), await P(0, cb[1].x + cb[1].w + 20, cb[1].y + cb[1].h + 15), {wait:900});
const one1 = {m:await multi(), s:await sel()};
check('a box over one object: that one selected by itself (its own bar), not a group of one', one1.m === null && one1.s === row4[1].id, one1);
await win.keyboard.down('Shift'); await drag(await P(0, cb[2].x + cb[2].w + 30, cb[2].y - 15), await P(0, cb[2].x - 20, cb[2].y + cb[2].h + 15), {wait:900}); await win.keyboard.up('Shift');
const sb2 = await multi();
check('Shift+box: what it catches is added to what was selected', sb2?.ids.length === 2 && sb2.ids.includes(row4[1].id) && sb2.ids.includes(row4[2].id), sb2);
await win.keyboard.press('Escape'); await win.waitForTimeout(300);
// an object partly off the page: the box judges it by the part on the page
cb = await box4();
await win.mouse.click(...await P(0, cb[0].x + 6, cb[0].y + cb[0].h / 2)); await win.waitForTimeout(600);
await drag(await P(0, cb[0].x + cb[0].w - 6, cb[0].y + cb[0].h / 2), await P(0, cb[0].x - 194, cb[0].y + cb[0].h / 2), {wait:2000});   // (held near its right end: half of it goes off)
const Lout = (await anns(0)).find(a => a.id === row4[0].id);
await win.keyboard.press('Escape'); await win.waitForTimeout(300);
await drag(await P(0, Lout.x + Lout.w + 15, Lout.y - 15), await P(0, -20, Lout.y + Lout.h + 15), {wait:900});
const caught = {m:await multi(), s:await sel()};
check('an object partly off the page: the box catches it by the part on the page', !!Lout && Lout.x < -20 && caught.s === row4[0].id, {Lout, caught});
await win.keyboard.press('Escape'); await win.waitForTimeout(300);
await undo();
// Shift+click on an object lying inside a selected one's outline: that object (what a plain click there picks)
await see(0, 400, 650);
await tool('rect'); await drag(await P(0, 300, 560), await P(0, 520, 760)); await drag(await P(0, 380, 620), await P(0, 430, 670));
await tool('select');
const big = (await anns(0)).find(a => a.sub === 'Square' && near(a.x, 300, 6) && near(a.y, 560, 6)), small = (await anns(0)).find(a => a.sub === 'Square' && near(a.x, 380, 6) && near(a.y, 620, 6));
cb = await box4();
await win.mouse.click(...await P(0, big.x + 8, big.y + big.h - 10)); await win.waitForTimeout(600);
await shiftClick(await P(0, cb[2].x + 6, cb[2].y + cb[2].h / 2));
await shiftClick(await P(0, small.x + small.w / 2, small.y + small.h / 2));
const mu = await multi();
check('Shift+click on an object inside a selected one\'s outline: it is added (the outer one stays)', !!big && !!small && mu?.ids.length === 3 && mu.ids.includes(small.id) && mu.ids.includes(big.id), mu);
await win.keyboard.press('Escape'); await win.waitForTimeout(300);
await win.mouse.click(...await P(0, big.x + 8, big.y + big.h - 10)); await win.waitForTimeout(600);
await shiftClick(await P(0, small.x + small.w / 2, small.y + small.h / 2));
const mu2 = await multi();
check('…with one object selected: Shift+click on the one inside it makes a group of the two', mu2?.ids.length === 2 && mu2.ids.includes(small.id) && mu2.ids.includes(big.id), mu2);
await win.keyboard.press('Escape'); await win.waitForTimeout(300);
// an arrow-key nudge not yet written, then Shift+click: the nudge is written first
await see(0, 300, 600);
const n0 = (await anns(0)).find(a => a.id === row4[0].id);
await win.mouse.click(...await P(0, n0.x + 6, n0.y + n0.h / 2)); await win.waitForTimeout(600);
for (let k = 0; k < 3; k++) await win.keyboard.press('ArrowRight');
await shiftClick(await P(0, row4[1].x + 6, row4[1].y + row4[1].h / 2));   // (within the half second the nudge waits)
await win.waitForTimeout(1800);
const n1 = (await anns(0)).find(a => a.id === row4[0].id), mn = await multi();
check('an arrow-key nudge not yet written, then Shift+click: the nudge is kept; both selected', near(n1.x, n0.x + 3, .3) && mn?.ids.length === 2 && mn.ids.includes(row4[0].id) && mn.ids.includes(row4[1].id), {n0:n0.x, n1:n1.x, mn});
await win.keyboard.press('Escape'); await win.waitForTimeout(300);
// Delete declined (a signed document, 取消): nothing deleted, the group still selected
await marq4();
await A(() => { window.__pdfapp.S.signed = true; });
await win.keyboard.press('Delete'); await win.waitForTimeout(800);
const askedDel = await A(() => document.querySelector('#mask').classList.contains('show'));
if (askedDel) { await win.click('#modal button:has-text("取消")'); await win.waitForTimeout(800); }
await A(() => { window.__pdfapp.S.signed = false; });
const md = await multi(), leftRow = (await anns(0)).filter(a => row4.some(r => r.id === a.id)).length;
check('Delete declined (a signed document, 取消): nothing deleted, the group still selected', askedDel && leftRow === 3 && md?.ids.length === 3, {askedDel, leftRow, md});
// the 對齊到 list opened and closed without a change keeps the focus: Esc and Delete are still the group's
await marq4();
await A(() => { const s = document.querySelector('#hint.multi select[data-alto]'); if (s) s.focus(); });
const focused = await A(() => !!document.activeElement && document.activeElement.matches('select[data-alto]'));
await win.keyboard.press('Escape'); await win.waitForTimeout(400);
check('the 對齊到 list has the focus: Esc still lets the group go', focused && (await multi()) === null, {focused, m:await multi()});
await marq4();
await A(() => { const s = document.querySelector('#hint.multi select[data-alto]'); if (s) s.focus(); });
await win.keyboard.press('Delete'); await win.waitForTimeout(1800);
const leftDel = (await anns(0)).filter(a => row4.some(r => r.id === a.id)).length;
check('…and Delete deletes the group', leftDel === 0, {leftDel});
await undo();
// closing the last tab with a group selected: the group is let go, the bar loses its object look
await marq4();
const hadBar = await barTitle(), hadMulti = await multi();
await win.keyboard.press('Control+w'); await win.waitForTimeout(900);
if (await A(() => document.querySelector('#mask').classList.contains('show'))) { await win.click('#modal button:has-text("不儲存並關閉")'); await win.waitForTimeout(1500); }
const hintCls = await A(() => document.querySelector('#hint').className), mClosed = await multi(), nPages = await A(() => window.__pdfapp.S.pages.length);
check('closing the last tab with a group selected: the group is let go; the bar is no longer an object bar', !!hadBar && nPages === 0 && !/\b(multi|objbar)\b/.test(hintCls) && mClosed === null, {hadBar, hadMulti, nPages, hintCls, mClosed});

console.log(failed ? `\n${failed} check(s) failed` : '\nall checks passed');
await app.evaluate(({app}) => app.exit(0)).catch(() => {});
