// Rectangles and images can be turned with the ↻ handle, then resized and moved along their own axes.
import { launch, TMP } from './_env.mjs';
const { app } = await launch('rb.pdf');
const win = await app.firstWindow(); win.on('pageerror', e => console.log('PAGEERR', e.message)); win.on('console', m => { if (m.type() === 'error') console.log('C', m.text().slice(0, 300)); });
await win.waitForTimeout(3500);
await win.click('[data-view="single"]'); await win.waitForTimeout(600);
const A = win.evaluate.bind(win);
const pageBox = () => win.locator('.page').first().boundingBox();
const r1 = v => Math.round(v * 10) / 10;
const info = async id => A(async id => { const r = await window.__pdfapp.annRot(0, id); return r && {deg:r.deg, box:r.box, rot:!!r.rotated}; }, id);
// darkness of the page picture around a page point (pt): 0 = white, 765 = black
const ink = (x, y) => A(({x, y}) => { const app = window.__pdfapp, c = document.querySelector('.page canvas.pc'), k = c.width / app.S.pages[0].w;
  const d = c.getContext('2d').getImageData(Math.round(x * k) - 3, Math.round(y * k) - 3, 7, 7).data; let m = 0;
  for (let o = 0; o < d.length; o += 4) m = Math.max(m, 765 - d[o] - d[o + 1] - d[o + 2]); return m; }, {x, y});
const color = (x, y) => A(({x, y}) => { const app = window.__pdfapp, c = document.querySelector('.page canvas.pc'), k = c.width / app.S.pages[0].w;
  return [...c.getContext('2d').getImageData(Math.round(x * k), Math.round(y * k), 1, 1).data].slice(0, 3); }, {x, y});
const turnPt = (p, c, deg) => { const r = deg * Math.PI / 180; return {x:c.x + (p.x - c.x) * Math.cos(r) - (p.y - c.y) * Math.sin(r), y:c.y + (p.x - c.x) * Math.sin(r) + (p.y - c.y) * Math.cos(r)}; };
// drag the ↻ handle around the selection centre by `deg` (clockwise on screen)
async function turn(deg, shift = false){
  const rh = await win.locator('.asel .rh').boundingBox(), s = await win.locator('.asel').boundingBox();
  const c = {x:s.x + s.width / 2, y:s.y + s.height / 2}, p0 = {x:rh.x + rh.width / 2, y:rh.y + rh.height / 2};
  const R = Math.hypot(p0.x - c.x, p0.y - c.y), a0 = Math.atan2(p0.y - c.y, p0.x - c.x);
  if (shift) await win.keyboard.down('Shift');
  await win.mouse.move(p0.x, p0.y); await win.mouse.down();
  for (let k = 1; k <= 10; k++) { const a = a0 + deg * Math.PI / 180 * k / 10; await win.mouse.move(c.x + R * Math.cos(a), c.y + R * Math.sin(a)); }
  await win.mouse.up(); if (shift) await win.keyboard.up('Shift');
  await win.waitForTimeout(2200);
}

// --- a rectangle ---
await A(() => window.__pdfapp.setTool('rect')); await win.waitForTimeout(300);
let pb = await pageBox();
await win.mouse.move(pb.x + 300, pb.y + 300); await win.mouse.down(); await win.mouse.move(pb.x + 520, pb.y + 420, {steps:6}); await win.mouse.up(); await win.waitForTimeout(2200);
await A(() => window.__pdfapp.setTool('select')); await win.waitForTimeout(400);
const sq = await A(async () => (await window.__pdfapp.getAnns(0)).find(a => a.subtype === 'Square'));
pb = await pageBox();
const sc = await A(() => window.__pdfapp.S.scale);
await win.mouse.click(pb.x + (sq.x + 6) * sc, pb.y + (sq.y + sq.h / 2) * sc); await win.waitForTimeout(800);
console.log('selected', JSON.stringify(await A(() => window.__pdfapp.sel())), 'rotate handles', await win.locator('.asel .rh').count(), 'resize handles', await win.locator('.asel .h').count());
const before = await info(sq.id);
console.log('before', JSON.stringify(before));
await turn(30);
let now = await info(sq.id);
console.log('after turn 30°', r1(now.deg), 'base', JSON.stringify(Object.values(now.box).map(r1)), 'same size as before', Math.abs(now.box.w - before.box.w) < .5 && Math.abs(now.box.h - before.box.h) < .5);
console.log('selection frame', await win.evaluate(() => document.querySelector('.asel').style.transform));
const b = now.box, c0 = {x:b.x + b.w / 2, y:b.y + b.h / 2}, padIn = 3;   // the outline sits ~width+1 inside the box
const cornerOld = {x:b.x + padIn, y:b.y + padIn}, cornerNew = turnPt(cornerOld, c0, 30);
const redNear = (x, y) => A(({x, y}) => { const app = window.__pdfapp, c = document.querySelector('.page canvas.pc'), k = c.width / app.S.pages[0].w;
  const d = c.getContext('2d').getImageData(Math.round(x * k) - 5, Math.round(y * k) - 5, 11, 11).data; let n = 0;
  for (let o = 0; o < d.length; o += 4) if (d[o] > 180 && d[o + 1] < 90 && d[o + 2] < 90) n++; return n; }, {x, y});
const topMid = {x:c0.x, y:b.y + 2};
console.log('red outline pixels: at turned top edge', await redNear(...Object.values(turnPt(topMid, c0, 30))), '| at old top edge (should be 0)', await redNear(topMid.x, topMid.y));
await win.screenshot({path:TMP + '/rb_turned.png'});

// resize from the right-hand handle, outwards along the turned x axis
const wMid0 = turnPt({x:b.x, y:c0.y}, c0, 30);
const eh = await win.locator('.asel .h[data-d="e"]').boundingBox();
const ex = eh.x + eh.width / 2, ey = eh.y + eh.height / 2, push = 60;
await win.mouse.move(ex, ey); await win.mouse.down(); await win.mouse.move(ex + push * Math.cos(Math.PI / 6), ey + push * Math.sin(Math.PI / 6), {steps:6}); await win.mouse.up(); await win.waitForTimeout(2200);
now = await info(sq.id);
const sc2 = await A(() => window.__pdfapp.S.scale), b2 = now.box, c2 = {x:b2.x + b2.w / 2, y:b2.y + b2.h / 2}, wMid1 = turnPt({x:b2.x, y:c2.y}, c2, now.deg);
console.log('after resize', r1(now.deg), 'w grew by', r1(b2.w - b.w), '(expected', r1(push / sc2) + ')', 'h change', r1(b2.h - b.h), 'left edge moved by', r1(Math.hypot(wMid1.x - wMid0.x, wMid1.y - wMid0.y)));

// move by dragging the body
pb = await pageBox();
const cs = {x:pb.x + c2.x * sc2, y:pb.y + c2.y * sc2};
await win.mouse.move(cs.x, cs.y); await win.mouse.down(); await win.mouse.move(cs.x + 80, cs.y + 40, {steps:6}); await win.mouse.up(); await win.waitForTimeout(2200);
now = await info(sq.id);
const b3 = now.box;
console.log('after move', r1(now.deg), 'centre moved', r1(b3.x + b3.w / 2 - c2.x), r1(b3.y + b3.h / 2 - c2.y), '(expected', r1(80 / sc2), r1(40 / sc2) + ')', 'size kept', r1(b3.w - b2.w), r1(b3.h - b2.h));

// recolour the turned rectangle with the fill tool: it must stay turned
await A(async id => { const a = (await window.__pdfapp.getAnns(0)).find(x => x.id === id); return window.__pdfapp.recolorShape(0, a, '#2b8a3e'); }, sq.id); await win.waitForTimeout(2000);
now = await info(sq.id);
console.log('after recolour', r1(now.deg), 'size kept', r1(now.box.w - b3.w), r1(now.box.h - b3.h));

// undo everything back to the upright rectangle
for (let k = 0; k < 4; k++) { await win.keyboard.press('Control+z'); await win.waitForTimeout(1300); }
now = await info(sq.id);
console.log('after 4× undo', r1(now.deg), 'turned flag', now.rot, 'base equals original', JSON.stringify(Object.values(now.box).map(r1)) === JSON.stringify(Object.values(before.box).map(r1)));
await win.keyboard.press('Escape');

// --- an image: left half red, right half blue; turn it 90° with Shift ---
pb = await pageBox();
await A(async ({x, y}) => {
  const c = document.createElement('canvas'); c.width = 400; c.height = 200; const g = c.getContext('2d');
  g.fillStyle = '#e03131'; g.fillRect(0, 0, 200, 200); g.fillStyle = '#1c64d9'; g.fillRect(200, 0, 200, 200);
  const blob = await new Promise(r => c.toBlob(r, 'image/png'));
  const dt = new DataTransfer(); dt.items.add(new File([blob], 'halves.png', {type:'image/png'}));
  document.elementFromPoint(x, y).dispatchEvent(new DragEvent('drop', {bubbles:true, cancelable:true, clientX:x, clientY:y, dataTransfer:dt}));
}, {x:pb.x + 800, y:pb.y + 560});
await win.waitForTimeout(3000);
const img = await A(() => window.__pdfapp.sel());
console.log('image selected', img && img.sub, 'rotate handles', await win.locator('.asel .rh').count());
await turn(88, true);
now = await info(img.id);
const ib = now.box, ic = {x:ib.x + ib.w / 2, y:ib.y + ib.h / 2};
console.log('image turned', r1(now.deg), '| above centre', JSON.stringify(await color(ic.x, ic.y - ib.w / 4)), '(red)', '| below centre', JSON.stringify(await color(ic.x, ic.y + ib.w / 4)), '(blue)');
const aabb = await A(async id => { const a = (await window.__pdfapp.getAnns(0)).find(x => x.id === id); return [a.w, a.h]; }, img.id);
console.log('image frame on the page (w,h)', aabb.map(r1), 'from upright', [ib.w, ib.h].map(r1));
await win.screenshot({path:TMP + '/rb_image.png'});
// page turned afterwards: the image stays turned with the page
await A(() => { const s = window.__pdfapp.S; s.thumbSel = new Set([0]); return window.__pdfapp.actions.rotR(); }); await win.waitForTimeout(2500);
now = await info(img.id);
console.log('after page rotation', r1(now.deg), 'upright box', JSON.stringify([now.box.w, now.box.h].map(r1)));
await app.evaluate(({app}) => app.exit(0)).catch(() => {});
