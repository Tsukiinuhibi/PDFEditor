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

console.log(failed ? `\n${failed} check(s) failed` : '\nall checks passed');
await app.evaluate(({app}) => app.exit(0)).catch(() => {});
