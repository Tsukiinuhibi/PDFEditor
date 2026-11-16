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

console.log(failed ? `\n${failed} check(s) failed` : '\nall checks passed');
await app.evaluate(({app}) => app.exit(0)).catch(() => {});
