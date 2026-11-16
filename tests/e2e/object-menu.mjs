// 右鍵編輯物件: right-clicking an object made here selects it and opens a menu of what can be changed about it (the same
// as its bar above the pages: colours, line width, opacity, the text, the picture, the order, copy, delete); a choice in
// it changes the object at once. A group gets the group's menu (align, distribute, copy, delete).
import { launch } from './_env.mjs';

let failed = 0;
const check = (name, ok, detail = '') => { console.log(`${ok ? '✔' : '✘'} ${name}${detail !== '' ? '  ' + (typeof detail === 'string' ? detail : JSON.stringify(detail)) : ''}`); if (!ok) { failed++; process.exitCode = 1; } };

const { app } = await launch('objmenu.pdf');
const win = await app.firstWindow();
win.on('pageerror', e => console.log('PAGEERR', e.message));
await win.waitForFunction(() => !!(window.__pdfapp && window.__pdfapp.S.pages.length), null, {timeout:30000});
await win.waitForTimeout(1500);
const A = win.evaluate.bind(win);
await win.click('[data-view="single"]'); await win.waitForTimeout(500);
const at = (x, y) => A(({x, y}) => { const app = window.__pdfapp, e = app.S.els[0].getBoundingClientRect(); return {x:e.left + x * app.S.scale, y:e.top + y * app.S.scale}; }, {x, y});
const anns = sub => A(async sub => (await window.__pdfapp.getAnns(0)).filter(a => !sub || a.subtype === sub).map(a => ({id:a.id, sub:a.subtype, x:a.x, y:a.y, w:a.w, h:a.h})), sub);
const menu = () => A(() => { const c = document.querySelector('#ctx'); return c.style.display === 'block' ? {hd:(c.querySelector('.hd') || {}).textContent || '', items:[...c.querySelectorAll('button')].map(b => b.textContent.trim())} : null; });
const pick = async label => { const ok = await A(l => { const b = [...document.querySelectorAll('#ctx button')].find(b => b.textContent.trim().startsWith(l)); if (b) b.click(); return !!b; }, label); await win.waitForTimeout(1500); return ok; };
const rclick = async (x, y) => { const p = await at(x, y); await win.mouse.click(p.x, p.y, {button:'right'}); await win.waitForTimeout(900); };

// a rectangle and a text box
await A(() => window.__pdfapp.setTool('rect')); await win.waitForTimeout(200);
{ const p = await at(100, 150), q = await at(220, 220); await win.mouse.move(p.x, p.y); await win.mouse.down(); await win.mouse.move(q.x, q.y, {steps:6}); await win.mouse.up(); await win.waitForTimeout(1500); }
await A(() => window.__pdfapp.setTool('textbox')); await win.waitForTimeout(200);
{ const p = await at(300, 170); await win.mouse.click(p.x, p.y); await win.waitForTimeout(500); }
await win.keyboard.type('Menu text'); await win.keyboard.press('Escape'); await win.waitForTimeout(2500);
await A(() => window.__pdfapp.setTool('select')); await win.waitForTimeout(300);
const rect = (await anns('Square'))[0], tb = (await anns('FreeText'))[0];

// ---- a rectangle ---------------------------------------------------------------------------------------------------------
await rclick(rect.x + 3, rect.y + rect.h / 2);
let m = await menu();
check('right-click on a rectangle: it is selected and a menu for it opens', !!m && /矩形/.test(m.hd) && await A(() => !!window.__pdfapp.sel()), m);
check('…with its colours, line width, opacity, order, copy and delete', !!m && ['框線顏色', '填色', '粗細', '透明度', '移到最上層', '複製', '刪除'].every(l => m.items.some(t => t.startsWith(l))), m && m.items);
if (m) await pick('粗細');
m = await menu();
check('〔粗細〕: the widths to choose from', !!m && m.items.some(t => t.startsWith('3 pt')), m && m.items);
if (m) await pick('3 pt');
const st = await A(async id => window.__pdfapp.annStyle(0, id), (await anns('Square'))[0].id);
check('…a width picked: the rectangle redrawn with it', !!st && Math.abs(st.width - 3) < .01, st);
const r2 = (await anns('Square'))[0];
await rclick(r2.x + 3, r2.y + r2.h / 2);
if (await menu()) await pick('框線顏色');
check('〔框線顏色〕: the colour picker opens', await A(() => { const c = document.querySelector('#cpMenu'); return !!c && getComputedStyle(c).display !== 'none'; }));
await win.keyboard.press('Escape'); await win.waitForTimeout(400);

// ---- a text box -----------------------------------------------------------------------------------------------------------
await win.keyboard.press('Escape'); await win.waitForTimeout(300);
await rclick(tb.x + tb.w / 2, tb.y + tb.h / 2);
m = await menu();
check('right-click on a text box: its menu, with 編輯文字 and its text settings', !!m && /文字方塊/.test(m.hd) && ['編輯文字', '字型', '字級', '文字顏色', '粗體'].every(l => m.items.some(t => t.startsWith(l))), m);
if (m) await pick('編輯文字');
check('〔編輯文字〕: the text box opens for writing', ((await A(() => (window.__pdfapp.TBE() || {}).html || ''))).includes('Menu text'));
await win.keyboard.press('Escape'); await win.waitForTimeout(2500);
await A(() => window.__pdfapp.setTool('select')); await win.waitForTimeout(300);

// ---- a group --------------------------------------------------------------------------------------------------------------
const r3 = (await anns('Square'))[0], t3 = (await anns('FreeText'))[0];
{ const p = await at(r3.x + 3, r3.y + r3.h / 2); await win.mouse.click(p.x, p.y); await win.waitForTimeout(400); }
{ const p = await at(t3.x + t3.w / 2, t3.y + t3.h / 2); await win.keyboard.down('Shift'); await win.mouse.click(p.x, p.y); await win.keyboard.up('Shift'); await win.waitForTimeout(500); }
await rclick(t3.x + t3.w / 2, t3.y + t3.h / 2);
m = await menu();
check('right-click on one of a group: the group\'s menu (align, copy, delete), the group kept', !!m && /2 個物件/.test(m.hd) && ['靠左', '靠上', '複製', '刪除'].every(l => m.items.some(t => t.startsWith(l))) && await A(() => !!window.__pdfapp.multi()), m);
if (m) await pick('靠上');
{ const a = await anns(); const y = a.filter(x => x.sub === 'Square' || x.sub === 'FreeText').map(x => x.y); check('〔靠上〕: lined up at the top', y.length === 2 && Math.abs(y[0] - y[1]) < .6, y); }
await win.keyboard.press('Escape'); await win.waitForTimeout(400);

// ---- delete from the menu --------------------------------------------------------------------------------------------------
const r4 = (await anns('Square'))[0];
await rclick(r4.x + 3, r4.y + r4.h / 2);
if (await menu()) await pick('刪除');
check('〔刪除〕: the rectangle is gone', !(await anns('Square')).length);

// ---- a highlight, a picture ------------------------------------------------------------------------------------------------
await A(() => window.__pdfapp.mutate('test', doc => { const p = doc.getPage(0), H = p.getHeight();
  p.node.addAnnot(doc.context.register(doc.context.obj({Type:'Annot', Subtype:'Highlight', Rect:[100, H - 420, 250, H - 400], QuadPoints:[100, H - 400, 250, H - 400, 100, H - 420, 250, H - 420], C:[1, 1, 0]}))); }));
await win.waitForTimeout(1500);
await rclick(170, 410);
m = await menu();
check('right-click on a highlight: a menu with copy and delete', !!m && ['複製', '刪除'].every(l => m.items.some(t => t.startsWith(l))), m);
await win.keyboard.press('Escape'); await win.waitForTimeout(300);

console.log(failed ? `\n${failed} check(s) failed` : '\nall checks passed');
await app.evaluate(({app}) => app.exit(0)).catch(() => {});
