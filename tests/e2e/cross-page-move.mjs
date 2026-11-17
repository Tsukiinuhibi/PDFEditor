// 物件跨頁移動: an object (or a group) dragged from one page and let go over another page moves to that page, where it was let
// go; one undo step; it stays editable (a text box's text) and selected there
import { launch } from './_env.mjs';

let failed = 0;
const check = (name, ok, detail = '') => { console.log(`${ok ? '✔' : '✘'} ${name}${detail !== '' ? '  ' + (typeof detail === 'string' ? detail : JSON.stringify(detail)) : ''}`); if (!ok) { failed++; process.exitCode = 1; } };

const { app } = await launch('crosspage.pdf');
const win = await app.firstWindow();
win.on('pageerror', e => console.log('PAGEERR', e.message));
await win.waitForFunction(() => !!(window.__pdfapp && window.__pdfapp.S.pages.length), null, {timeout:30000});
await win.waitForTimeout(1500);
const A = win.evaluate.bind(win);
await win.click('[data-view="continuous"]'); await win.waitForTimeout(500);
await A(() => window.__pdfapp.zoomTo ? 0 : 0);
const at = (i, x, y) => A(([i, x, y]) => { const app = window.__pdfapp, e = app.S.els[i].getBoundingClientRect(); return {x:e.left + x * app.S.scale, y:e.top + y * app.S.scale}; }, [i, x, y]);
const anns = (i, sub) => A(async ([i, sub]) => (await window.__pdfapp.getAnns(i)).filter(a => !sub || a.subtype === sub).map(a => ({id:a.id, sub:a.subtype, x:a.x, y:a.y, w:a.w, h:a.h})), [i, sub]);
// page 1's bottom and page 2's top both on screen
await A(() => { const app = window.__pdfapp, v = document.querySelector('#viewer'), e = app.S.els[1].getBoundingClientRect(), vr = v.getBoundingClientRect(); v.scrollTop += e.top - vr.top - vr.height / 2; }); await win.waitForTimeout(800);
const H0 = await A(() => window.__pdfapp.S.pages[0].h);

// a rectangle near the bottom of page 1
await A(() => window.__pdfapp.setTool('rect')); await win.waitForTimeout(200);
{ const p = await at(0, 100, H0 - 120), q = await at(0, 200, H0 - 60); await win.mouse.move(p.x, p.y); await win.mouse.down(); await win.mouse.move(q.x, q.y, {steps:5}); await win.mouse.up(); await win.waitForTimeout(1500); }
await A(() => window.__pdfapp.setTool('select')); await win.waitForTimeout(300);
const r0 = (await anns(0, 'Square'))[0];
check('(a rectangle at the bottom of page 1)', !!r0, r0);
const u0 = await A(() => window.__pdfapp.S.undo.length);
{ const p = await at(0, r0.x + 2, r0.y + r0.h / 2), q = await at(1, r0.x + 2, 150); await win.mouse.move(p.x, p.y); await win.mouse.down(); await win.mouse.move(q.x, q.y, {steps:14}); await win.waitForTimeout(400);
  const fl = await A(() => !!document.querySelector('.xghost'));
  await win.mouse.up(); await win.waitForTimeout(2500);
  check('while over page 2: a picture of it follows the mouse', fl); }
const p1 = await anns(0, 'Square'), p2 = await anns(1, 'Square');
check('let go over page 2: the rectangle is on page 2 where it was let go, not on page 1', !p1.length && p2.length === 1 && Math.abs(p2[0].x - r0.x) < 2 && Math.abs(p2[0].y + p2[0].h / 2 - 150) < 3, {p1, p2});
check('…one undo step, and it is selected there', await A(() => window.__pdfapp.S.undo.length) === u0 + 1 && (await A(() => (window.__pdfapp.sel() || {}).id)) === (p2[0] || {}).id);
await win.click('#bUndo'); await win.waitForTimeout(1800);
check('復原: back on page 1', (await anns(0, 'Square')).length === 1 && !(await anns(1, 'Square')).length);

// a text box: moved, its text still editable
await A(() => window.__pdfapp.setTool('textbox')); await win.waitForTimeout(200);
{ const p = await at(0, 300, H0 - 90); await win.mouse.click(p.x, p.y); await win.waitForTimeout(500); }
await win.keyboard.type('Across'); await win.keyboard.press('Escape'); await win.waitForTimeout(2500);
await A(() => window.__pdfapp.setTool('select')); await win.waitForTimeout(300);
const t0 = (await anns(0, 'FreeText'))[0];
{ const p = await at(0, t0.x + t0.w / 2, t0.y + t0.h / 2), q = await at(1, t0.x + t0.w / 2, 220); await win.mouse.move(p.x, p.y); await win.mouse.down(); await win.mouse.move(q.x, q.y, {steps:14}); await win.mouse.up(); await win.waitForTimeout(2500); }
const t2 = await A(() => window.__pdfapp.tbRT(1).then(l => l.map(x => x.rt.lines.flat().map(r => r.text).join(''))));
check('a text box dragged to page 2: there, its text kept for editing', t2.includes('Across') && !(await anns(0, 'FreeText')).length, t2);

// a group: both move
await win.keyboard.press('Escape'); await win.waitForTimeout(300);
const ra = (await anns(0, 'Square'))[0];
await A(() => window.__pdfapp.setTool('rect')); await win.waitForTimeout(200);
{ const p = await at(0, 250, H0 - 120), q = await at(0, 320, H0 - 70); await win.mouse.move(p.x, p.y); await win.mouse.down(); await win.mouse.move(q.x, q.y, {steps:5}); await win.mouse.up(); await win.waitForTimeout(1500); }
await A(() => window.__pdfapp.setTool('select')); await win.waitForTimeout(300);
const two = await anns(0, 'Square');
{ const p = await at(0, two[0].x + 2, two[0].y + two[0].h / 2); await win.mouse.click(p.x, p.y); await win.waitForTimeout(400); }
{ const p = await at(0, two[1].x + 2, two[1].y + two[1].h / 2); await win.keyboard.down('Shift'); await win.mouse.click(p.x, p.y); await win.keyboard.up('Shift'); await win.waitForTimeout(600); }
{ const p = await at(0, two[0].x + 2, two[0].y + two[0].h / 2), q = await at(1, two[0].x + 2, 300); await win.mouse.move(p.x, p.y); await win.mouse.down(); await win.mouse.move(q.x, q.y, {steps:14}); await win.mouse.up(); await win.waitForTimeout(2500); }
const g2 = await anns(1, 'Square');
check('a group dragged to page 2: both there, as they were to each other', !(await anns(0, 'Square')).length && g2.length >= 2 && (() => { const [a, b] = two, f = id => g2.find(x => Math.abs(x.w - id.w) < 1 && Math.abs(x.h - id.h) < 1); const A2 = f(a), B2 = f(b); return A2 && B2 && Math.abs((B2.x - A2.x) - (b.x - a.x)) < 1.5 && Math.abs((B2.y - A2.y) - (b.y - a.y)) < 1.5; })(), {two, g2});

console.log(failed ? `\n${failed} check(s) failed` : '\nall checks passed');
await app.evaluate(({app}) => app.exit(0)).catch(() => {});
