// 物件群組: objects chosen together are made a group (〔組成群組〕 / Ctrl+G); a click on any of them then selects the whole
// group, which moves, is copied and deleted as one; a second click on one of a selected group selects only it (to change it);
// 〔取消群組〕 / Ctrl+Shift+G takes the group apart. The group is kept in the file.
import { launch } from './_env.mjs';

let failed = 0;
const check = (name, ok, detail = '') => { console.log(`${ok ? '✔' : '✘'} ${name}${detail !== '' ? '  ' + (typeof detail === 'string' ? detail : JSON.stringify(detail)) : ''}`); if (!ok) { failed++; process.exitCode = 1; } };

const { app } = await launch('objgroup.pdf');
const win = await app.firstWindow();
win.on('pageerror', e => console.log('PAGEERR', e.message));
await win.waitForFunction(() => !!(window.__pdfapp && window.__pdfapp.S.pages.length), null, {timeout:30000});
await win.waitForTimeout(1500);
const A = win.evaluate.bind(win);
await win.click('[data-view="single"]'); await win.waitForTimeout(500);
const at = (x, y) => A(({x, y}) => { const app = window.__pdfapp, e = app.S.els[0].getBoundingClientRect(); return {x:e.left + x * app.S.scale, y:e.top + y * app.S.scale}; }, {x, y});
const sq = () => A(async () => (await window.__pdfapp.getAnns(0)).filter(a => a.subtype === 'Square').map(a => ({id:a.id, x:a.x, y:a.y, w:a.w, h:a.h})).sort((p, q) => p.x - q.x));
const selState = () => A(() => { const s = window.__pdfapp.sel(), m = window.__pdfapp.multi(); return {one:s ? s.id : null, multi:m ? m.ids.length : 0}; });
const click = async (b, opt = {}) => { const p = await at(b.x + 3, b.y + b.h / 2); await win.mouse.click(p.x, p.y, opt); await win.waitForTimeout(700); };
const grpOf = () => A(async () => { const P = PDFLib, d = await P.PDFDocument.load(window.__pdfapp.S.bytes, {ignoreEncryption:true}), an = d.getPage(0).node.Annots();
  return an ? an.asArray().map(r => d.context.lookup(r)).filter(o => String(o.get(P.PDFName.of('Subtype'))) === '/Square').map(o => { const g = o.lookupMaybe(P.PDFName.of('PDFE_Grp'), P.PDFString, P.PDFHexString); return g ? g.decodeText() : null; }) : []; });

// three rectangles
await A(() => window.__pdfapp.setTool('rect')); await win.waitForTimeout(200);
for (const x of [80, 220, 360]) { const p = await at(x, 150), q = await at(x + 90, 210); await win.mouse.move(p.x, p.y); await win.mouse.down(); await win.mouse.move(q.x, q.y, {steps:5}); await win.mouse.up(); await win.waitForTimeout(1200); }
await A(() => window.__pdfapp.setTool('select')); await win.waitForTimeout(300);
let [r1, r2, r3] = await sq();
check('(three rectangles)', !!r3, await sq());

// group the first two
await click(r1); await win.keyboard.down('Shift'); await click(r2); await win.keyboard.up('Shift');
const hasBtn = await A(() => !!document.querySelector('#hint.objbar [data-ma="group"]'));
check('two selected: the bar has 〔組成群組〕', hasBtn);
await win.keyboard.press('Control+g'); await win.waitForTimeout(1800);
const g1 = await grpOf();
check('Ctrl+G: the two are one group in the file, the third not', !!g1[0] && g1[0] === g1[1] && !g1[2], g1);
check('…the bar now has 〔取消群組〕', await A(() => !!document.querySelector('#hint.objbar [data-ma="ungroup"]')));
await win.keyboard.press('Escape'); await win.waitForTimeout(400);

// one click selects the whole group; a drag moves both
await click(r1);
check('a click on one of the group: the whole group selected', (await selState()).multi === 2, await selState());
{ const p = await at(r1.x + 3, r1.y + r1.h / 2), q = await at(r1.x + 3 + 40, r1.y + r1.h / 2 + 30); await win.mouse.move(p.x, p.y); await win.mouse.down(); await win.mouse.move(q.x, q.y, {steps:8}); await win.mouse.up(); await win.waitForTimeout(2000); }
{ const [a, b, c] = await sq(); check('dragged: both moved by the same amount, the third stayed', Math.abs(a.x - r1.x - 40) < 1 && Math.abs(b.x - r2.x - 40) < 1 && Math.abs(a.y - r1.y - 30) < 1 && Math.abs(c.x - r3.x) < .5, {a, b, c, r1, r2}); [r1, r2, r3] = [a, b, c]; }
check('…still the group selected', (await selState()).multi === 2, await selState());
// a second click on one of the selected group: only that one
await click(r2);
check('a click on one of the selected group: only that one selected (to change it)', (await selState()).one === r2.id && !(await selState()).multi, await selState());
await win.keyboard.press('Escape'); await win.waitForTimeout(400);

// a box dragged over one of them takes the whole group
{ const p = await at(r1.x - 10, r1.y - 10), q = await at(r1.x + r1.w + 5, r1.y + r1.h + 5); await win.mouse.move(p.x, p.y); await win.mouse.down(); await win.mouse.move(q.x, q.y, {steps:6}); await win.mouse.up(); await win.waitForTimeout(800); }
check('a selection box round one of the group: the whole group selected', (await selState()).multi === 2, await selState());
await win.keyboard.press('Escape'); await win.waitForTimeout(400);

// right-click: the group's menu with 取消群組
{ const p = await at(r1.x + 3, r1.y + r1.h / 2); await win.mouse.click(p.x, p.y, {button:'right'}); await win.waitForTimeout(1000); }
const m = await A(() => { const c = document.querySelector('#ctx'); return c.style.display === 'block' ? [...c.querySelectorAll('button')].map(b => b.textContent.trim()) : null; });
check('right-click on one of the group: the group\'s menu, with 取消群組', !!m && m.some(t => t.startsWith('取消群組')) && (await selState()).multi === 2, m);

// copy and paste the group: the copies are a group of their own
await win.keyboard.press('Escape'); await win.waitForTimeout(300); await win.keyboard.press('Escape'); await win.waitForTimeout(300);   // (the menu, then the selection)
await click(r1); await win.keyboard.press('Control+c'); await win.waitForTimeout(800);
{ const p = await at(300, 450); await win.mouse.move(p.x, p.y); }
await win.keyboard.press('Control+v'); await win.waitForTimeout(2200);
const g2 = await grpOf();
check('the group copied and pasted: the two copies are a group, not the same as the first', g2.length === 5 && g2.filter(Boolean).length === 4 && new Set(g2.filter(Boolean)).size === 2, g2);
await win.click('#bUndo'); await win.waitForTimeout(1800);

// ungroup with Ctrl+Shift+G
await win.keyboard.press('Escape'); await win.waitForTimeout(300);
await click(r1);
await win.keyboard.press('Control+Shift+G'); await win.waitForTimeout(1800);
check('Ctrl+Shift+G: the group taken apart', (await grpOf()).every(g => !g), await grpOf());
await win.keyboard.press('Escape'); await win.waitForTimeout(400);
await click(r1);
check('…a click now selects only that one', (await selState()).one === r1.id && !(await selState()).multi, await selState());
// undo brings the group back
await win.click('#bUndo'); await win.waitForTimeout(1800);
{ const g = await grpOf(); check('復原: the group again', !!g[0] && g[0] === g[1], g); }

console.log(failed ? `\n${failed} check(s) failed` : '\nall checks passed');
await app.evaluate(({app}) => app.exit(0)).catch(() => {});
