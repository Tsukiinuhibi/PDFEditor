// 選取物件時頁面不跳動: the bar above the pages appears when an object is selected (and goes when it is let go); the pages stay
// where they are on the screen, so a double-click on a text box of a group lands where it was aimed
import { launch } from './_env.mjs';

let failed = 0;
const check = (name, ok, detail = '') => { console.log(`${ok ? '✔' : '✘'} ${name}${detail !== '' ? '  ' + (typeof detail === 'string' ? detail : JSON.stringify(detail)) : ''}`); if (!ok) { failed++; process.exitCode = 1; } };

const { app } = await launch('barsteady.pdf');
const win = await app.firstWindow();
win.on('pageerror', e => console.log('PAGEERR', e.message));
await win.waitForFunction(() => !!(window.__pdfapp && window.__pdfapp.S.pages.length), null, {timeout:30000});
await win.waitForTimeout(1500);
const A = win.evaluate.bind(win);
await win.click('[data-view="continuous"]'); await win.waitForTimeout(500);
await A(() => { document.querySelector('#viewer').scrollTop = 300; }); await win.waitForTimeout(500);
const at = (x, y) => A(({x, y}) => { const app = window.__pdfapp, e = app.S.els[0].getBoundingClientRect(); return {x:e.left + x * app.S.scale, y:e.top + y * app.S.scale}; }, {x, y});
const top0 = () => A(() => window.__pdfapp.S.els[0].getBoundingClientRect().top);

await A(() => window.__pdfapp.setTool('rect')); await win.waitForTimeout(200);
{ const p = await at(100, 400), q = await at(220, 470); await win.mouse.move(p.x, p.y); await win.mouse.down(); await win.mouse.move(q.x, q.y, {steps:5}); await win.mouse.up(); await win.waitForTimeout(1500); }
await A(() => window.__pdfapp.setTool('select')); await win.waitForTimeout(500);
const t0 = await top0();
{ const p = await at(101, 435); await win.mouse.click(p.x, p.y); await win.waitForTimeout(800); }
const t1 = await top0(), bar = await A(() => document.querySelector('#hint').classList.contains('show'));
check('an object selected: its bar shows, and the pages stay where they were on the screen', bar && Math.abs(t1 - t0) < 1.5, {t0, t1, bar});
await win.keyboard.press('Escape'); await win.waitForTimeout(800);
const t2 = await top0();
check('…let go: the bar goes, the pages still in place', Math.abs(t2 - t0) < 1.5, {t0, t2});

// ---- a selected object moved (dragged, and nudged): the bar above the pages stays as it is in every frame (no blink) ---------------
{ const r = (await A(async () => (await window.__pdfapp.getAnns(0)).filter(a => a.subtype === 'Square').map(a => ({x:a.x, y:a.y, w:a.w, h:a.h}))))[0];
  { const p = await at(r.x + 1, r.y + r.h / 2); await win.mouse.click(p.x, p.y); await win.waitForTimeout(800); }
  const rec = on => A(on => { if (on) { window.__hb = []; window.__rec = true; const f = () => { const h = document.querySelector('#hint'); window.__hb.push(h.classList.contains('show') ? h.offsetHeight : 0); if (window.__rec) requestAnimationFrame(f); }; f(); } else { window.__rec = false; return window.__hb; } }, on);
  await rec(true);
  { const p = await at(r.x + 1, r.y + r.h / 2), q = await at(r.x + 41, r.y + r.h / 2 + 20); await win.mouse.move(p.x, p.y); await win.mouse.down(); await win.mouse.move(q.x, q.y, {steps:8}); await win.mouse.up(); await win.waitForTimeout(2500); }
  let hb = await rec(false);
  check('an object dragged: the bar above the pages never goes or changes, frame by frame', hb.length > 10 && hb.every(h => h === hb[0] && h > 0), {n:hb.length, seen:[...new Set(hb)]});
  await rec(true);
  for (let k = 0; k < 3; k++) await win.keyboard.press('ArrowRight');
  await win.waitForTimeout(2500);
  hb = await rec(false);
  check('…nudged with the arrow keys: the bar stays too', hb.length > 10 && hb.every(h => h === hb[0] && h > 0), {n:hb.length, seen:[...new Set(hb)]}); }

// a group dragged: the same
{ await win.keyboard.press('Escape'); await win.waitForTimeout(400);
  await A(() => window.__pdfapp.setTool('rect')); await win.waitForTimeout(200);
  { const p = await at(300, 400), q = await at(380, 460); await win.mouse.move(p.x, p.y); await win.mouse.down(); await win.mouse.move(q.x, q.y, {steps:5}); await win.mouse.up(); await win.waitForTimeout(1500); }
  await A(() => window.__pdfapp.setTool('select')); await win.waitForTimeout(400);
  const l = await A(async () => (await window.__pdfapp.getAnns(0)).filter(a => a.subtype === 'Square').map(a => ({x:a.x, y:a.y, w:a.w, h:a.h})));
  { const p = await at(l[0].x + 1, l[0].y + l[0].h / 2); await win.mouse.click(p.x, p.y); await win.waitForTimeout(500); }
  { const p = await at(l[1].x + 1, l[1].y + l[1].h / 2); await win.keyboard.down('Shift'); await win.mouse.click(p.x, p.y); await win.keyboard.up('Shift'); await win.waitForTimeout(800); }
  const rec = on => A(on => { if (on) { window.__hb = []; window.__rec = true; const f = () => { const h = document.querySelector('#hint'); window.__hb.push(h.classList.contains('show') ? h.offsetHeight : 0); if (window.__rec) requestAnimationFrame(f); }; f(); } else { window.__rec = false; return window.__hb; } }, on);
  await rec(true);
  { const p = await at(l[1].x + 1, l[1].y + l[1].h / 2), q = await at(l[1].x + 31, l[1].y + l[1].h / 2 + 15); await win.mouse.move(p.x, p.y); await win.mouse.down(); await win.mouse.move(q.x, q.y, {steps:8}); await win.mouse.up(); await win.waitForTimeout(2500); }
  const hb = await rec(false);
  check('a group dragged: the bar stays, frame by frame', hb.length > 10 && hb.every(h => h === hb[0] && h > 0), {n:hb.length, seen:[...new Set(hb)]}); }

console.log(failed ? `\n${failed} check(s) failed` : '\nall checks passed');
await app.evaluate(({app}) => app.exit(0)).catch(() => {});
