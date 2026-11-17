// Shift 拉把手＝等比例縮放：任何能調整大小的物件（圖形、圖片、戳記…），按著 Shift 拉角落或邊上的把手，長寬比例不變
import { launch } from './_env.mjs';

let failed = 0;
const check = (name, ok, detail = '') => { console.log(`${ok ? '✔' : '✘'} ${name}${detail !== '' ? '  ' + (typeof detail === 'string' ? detail : JSON.stringify(detail)) : ''}`); if (!ok) { failed++; process.exitCode = 1; } };

const { app } = await launch('resizeshift.pdf');
const win = await app.firstWindow();
win.on('pageerror', e => console.log('PAGEERR', e.message));
await win.waitForFunction(() => !!(window.__pdfapp && window.__pdfapp.S.pages.length), null, {timeout:30000});
await win.waitForTimeout(1500);
const A = win.evaluate.bind(win);
await win.click('[data-view="single"]'); await win.waitForTimeout(500);
const at = (x, y) => A(({x, y}) => { const app = window.__pdfapp, e = app.S.els[0].getBoundingClientRect(); return {x:e.left + x * app.S.scale, y:e.top + y * app.S.scale}; }, {x, y});
const one = sub => A(async sub => (await window.__pdfapp.getAnns(0)).filter(a => a.subtype === sub).map(a => ({x:a.x, y:a.y, w:a.w, h:a.h}))[0], sub);
const handle = d => A(d => { const h = document.querySelector(`.asel .h[data-d="${d}"]`); if (!h) return null; const r = h.getBoundingClientRect(); return {x:r.left + r.width / 2, y:r.top + r.height / 2}; }, d);
const dragShift = async (from, dx, dy) => { await win.mouse.move(from.x, from.y); await win.keyboard.down('Shift'); await win.mouse.down(); await win.mouse.move(from.x + dx, from.y + dy, {steps:8}); await win.mouse.up(); await win.keyboard.up('Shift'); await win.waitForTimeout(2200); };
const ratio = b => b.w / b.h;

// a rectangle: the right edge pulled with Shift: the height follows
await A(() => window.__pdfapp.setTool('rect')); await win.waitForTimeout(200);
{ const p = await at(100, 150), q = await at(220, 210); await win.mouse.move(p.x, p.y); await win.mouse.down(); await win.mouse.move(q.x, q.y, {steps:5}); await win.mouse.up(); await win.waitForTimeout(1500); }
await A(() => window.__pdfapp.setTool('select')); await win.waitForTimeout(300);
let r0 = await one('Square');
{ const p = await at(r0.x + 2, r0.y + r0.h / 2); await win.mouse.click(p.x, p.y); await win.waitForTimeout(800); }
{ const h = await handle('e'); if (h) await dragShift(h, 60, 0); }
let r1 = await one('Square');
check('a rectangle, its side pulled with Shift: wider and taller, the same proportions', r1.w > r0.w + 20 && Math.abs(ratio(r1) - ratio(r0)) < .06, {r0, r1});
// the corner with Shift: the same proportions
{ const p = await at(r1.x + 2, r1.y + r1.h / 2); await win.mouse.click(p.x, p.y); await win.waitForTimeout(800); }
{ const h = await handle('se'); if (h) await dragShift(h, 40, 5); }
const r2 = await one('Square');
check('…its corner pulled with Shift: the same proportions', Math.abs(ratio(r2) - ratio(r0)) < .06, {r0, r2});

// a picture (a stamp kind): the corner pulled with Shift keeps its proportions too
await A(async () => { const c = document.createElement('canvas'); c.width = 120; c.height = 40; const g = c.getContext('2d'); g.fillStyle = '#2b8a3e'; g.fillRect(0, 0, 120, 40);
  const blob = await new Promise(r => c.toBlob(r, 'image/png')); await window.__pdfapp.pendImage(new File([blob], 'g.png', {type:'image/png'})); });
await win.waitForTimeout(600);
{ const p = await at(350, 280); await win.mouse.click(p.x, p.y); await win.waitForTimeout(2000); }   // (high enough: its handles not under the status bar)
await A(() => window.__pdfapp.setTool('select')); await win.waitForTimeout(300);
const s0 = await one('Stamp');
{ const p = await at(s0.x + s0.w / 2, s0.y + s0.h / 2); await win.mouse.click(p.x, p.y); await win.waitForTimeout(800); }
{ const h = await handle('se'); if (h) await dragShift(h, 70, 40); }
const s1 = await one('Stamp');
check('a picture, its corner pulled with Shift: the same proportions', s1.w > s0.w + 20 && Math.abs(ratio(s1) - ratio(s0)) < .08, {s0, s1});

console.log(failed ? `\n${failed} check(s) failed` : '\nall checks passed');
await app.evaluate(({app}) => app.exit(0)).catch(() => {});
