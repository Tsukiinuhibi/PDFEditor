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
const menu = () => A(() => { const c = document.querySelector('#ctx'); return c.style.display === 'block' ? {hd:(c.querySelector('.hd') || {}).textContent || '', rows:[...c.querySelectorAll('.r .l')].map(l => l.textContent.trim()).filter(Boolean), items:[...c.querySelectorAll(':scope > button')].map(b => b.textContent.trim())} : null; });
const pick = async label => { const ok = await A(l => { const b = [...document.querySelectorAll('#ctx button')].find(b => b.textContent.trim().startsWith(l)); if (b) b.click(); return !!b; }, label); await win.waitForTimeout(1500); return ok; };
const typeIn = async (row, v) => { const ok = await A(row => { const r = [...document.querySelectorAll('#ctx .r')].find(r => (r.querySelector('.l') || {}).textContent === row), inp = r && r.querySelector('input'); if (inp) { inp.focus(); inp.select(); } return !!inp; }, row); if (ok) { await win.keyboard.type(String(v)); await win.keyboard.press('Enter'); await win.waitForTimeout(2000); } return ok; };
const wheelOpens = async () => { await A(() => { const w = document.querySelector('#ctx .wheel'); if (w) w.click(); }); await win.waitForTimeout(500); return A(() => { const c = document.querySelector('#cpMenu'); return !!c && getComputedStyle(c).display !== 'none' && c.offsetWidth > 0; }); };
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
check('right-click on a rectangle: it is selected and its menu opens', !!m && /矩形/.test(m.hd) && await A(() => !!window.__pdfapp.sel()), m);
check('…with its outline colour, fill, line width, line, opacity, order, copy, cut and delete', !!m && ['框線顏色', '填色', '粗細', '線條', '透明度', '上下層級'].every(l => m.rows.includes(l)) && ['複製', '剪下', '刪除'].every(l => m.items.some(t => t.startsWith(l))), m);
const typed = m && await typeIn('粗細', '3');
const st = await A(async id => window.__pdfapp.annStyle(0, id), (await anns('Square'))[0].id);
check('a line width typed in the menu + Enter: the rectangle redrawn with it', typed && !!st && Math.abs(st.width - 3) < .01, st);
{ const r2 = (await anns('Square'))[0]; await rclick(r2.x + 3, r2.y + r2.h / 2); }
await A(() => { const b = [...document.querySelectorAll('#ctx .sw')].find(b => b.title === '#1c64d9'); if (b) b.click(); }); await win.waitForTimeout(1800);
const st2 = await A(async id => window.__pdfapp.annStyle(0, id), (await anns('Square'))[0].id);
check('a colour clicked in the menu: the outline takes it at once', !!st2 && st2.color === '#1c64d9', st2);
{ const r2 = (await anns('Square'))[0]; await rclick(r2.x + 3, r2.y + r2.h / 2); }
check('〔色環…〕: the colour wheel opens', await wheelOpens());
await win.keyboard.press('Escape'); await win.waitForTimeout(400);

// ---- a text box -----------------------------------------------------------------------------------------------------------
await win.keyboard.press('Escape'); await win.waitForTimeout(300);
await rclick(tb.x + tb.w / 2, tb.y + tb.h / 2);
m = await menu();
check('right-click on a text box: 編輯文字 and the text box\'s settings (as its bar)', !!m && /文字方塊/.test(m.hd) && m.items.some(t => t.startsWith('編輯文字')) && ['字型', '字級', '文字顏色', '文字底色', '樣式', '方塊背景', '上下層級'].every(l => m.rows.includes(l)), m);
if (m) await typeIn('字級', '13.5');
check('a size typed for the whole box (13.5) + Enter: taken', JSON.stringify(await A(() => window.__pdfapp.tbRT(0).then(l => l[0].rt.lines.flat().map(r => r.size)))) === '[13.5]', await A(() => window.__pdfapp.tbRT(0).then(l => l[0].rt.lines.flat().map(r => r.size))));
{ const t2 = (await anns('FreeText'))[0]; await rclick(t2.x + t2.w / 2, t2.y + t2.h / 2); }
if (await menu()) await pick('編輯文字');
check('〔編輯文字〕: the text box opens for writing', ((await A(() => (window.__pdfapp.TBE() || {}).html || ''))).includes('Menu text'));
// ---- in the text editor: right-click on highlighted text ------------------------------------------------------------------
await win.keyboard.press('Control+a'); await win.waitForTimeout(200);
{ const e = await A(() => { const r = document.querySelector('.tbed').getBoundingClientRect(); return {x:r.left + r.width / 2, y:r.top + r.height / 2}; }); await win.mouse.click(e.x, e.y, {button:'right'}); await win.waitForTimeout(600); }
m = await menu();
check('right-click in the text being written: the full text settings (font, typed size, colours with the wheel, B I U, the box)', !!m && /文字格式/.test(m.hd) && ['字型', '字級', '文字顏色', '文字底色', '樣式', '方塊背景'].every(l => m.rows.includes(l)) && ['剪下', '複製', '貼上', '完成編輯'].every(l => m.items.some(t => t.startsWith(l))), m);
const sws = await A(() => [...document.querySelectorAll('#ctx .sw')].map(b => { const r = b.getBoundingClientRect(); return [Math.round(r.width), Math.round(r.height)]; }));
check('the colours are squares side by side, each its full size (not squeezed)', sws.length >= 10 && sws.every(([w, h]) => w >= 20 && Math.abs(w - h) <= 1), sws);
if (m) await typeIn('字級', '20.5');
check('…a size typed there (20.5) + Enter: the highlighted text takes it', /font-size:\s*20\.5px/.test(await A(() => (window.__pdfapp.TBE() || {}).html || '')), (await A(() => (window.__pdfapp.TBE() || {}).html || '')).slice(0, 200));
{ const e = await A(() => { const r = document.querySelector('.tbed').getBoundingClientRect(); return {x:r.left + r.width / 2, y:r.top + r.height / 2}; }); await win.mouse.click(e.x, e.y, {button:'right'}); await win.waitForTimeout(600); }
await A(() => { const b = document.querySelector('#ctx .tg[title="粗體"]'); if (b) b.click(); }); await win.waitForTimeout(400);
check('…〔B〕: the highlighted text bold', /font-weight:\s*(bold|700)|<b>/.test(await A(() => (window.__pdfapp.TBE() || {}).html || '')), (await A(() => (window.__pdfapp.TBE() || {}).html || '')).slice(0, 200));
{ const e = await A(() => { const r = document.querySelector('.tbed').getBoundingClientRect(); return {x:r.left + r.width / 2, y:r.top + r.height / 2}; }); await win.mouse.click(e.x, e.y, {button:'right'}); await win.waitForTimeout(600); }
check('…〔色環…〕 there: the colour wheel opens', await wheelOpens());
await win.keyboard.press('Escape'); await win.waitForTimeout(300);
// 〔貼上〕 in the menu: the clipboard's text goes into the text being written (as Ctrl+V)
await app.evaluate(({clipboard}) => clipboard.writeText('PASTED42'));
await win.keyboard.press('End'); await win.waitForTimeout(200);
{ const e = await A(() => { const r = document.querySelector('.tbed').getBoundingClientRect(); return {x:r.left + r.width / 2, y:r.top + r.height / 2}; }); await win.mouse.click(e.x, e.y, {button:'right'}); await win.waitForTimeout(600); }
if (await menu()) await pick('貼上');
await win.waitForTimeout(600);
check('〔貼上〕 in the menu of the text being written: the clipboard text pasted', (await A(() => (window.__pdfapp.TBE() || {}).html || '')).includes('PASTED42'), (await A(() => (window.__pdfapp.TBE() || {}).html || '')).slice(0, 200));
await win.keyboard.press('Escape'); await win.waitForTimeout(300);
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

// a picture inserted here (from a file)
await A(async () => { const c = document.createElement('canvas'); c.width = 80; c.height = 60; const g = c.getContext('2d'); g.fillStyle = '#2b8a3e'; g.fillRect(0, 0, 80, 60);
  const blob = await new Promise(r => c.toBlob(r, 'image/png')); await window.__pdfapp.pendImage(new File([blob], 'g.png', {type:'image/png'})); });
await win.waitForTimeout(600);
{ const p = await at(420, 300); await win.mouse.click(p.x, p.y); await win.waitForTimeout(2000); }
await A(() => window.__pdfapp.setTool('select')); await win.waitForTimeout(300);
const pic = (await anns('Stamp'))[0];
if (pic) await rclick(pic.x + pic.w / 2, pic.y + pic.h / 2);
m = await menu();
check('right-click on a picture: 更換圖片, 辨識文字, opacity, order, copy, delete', !!pic && !!m && ['更換圖片', '辨識整張', '框選範圍', '複製', '刪除'].every(l => m.items.some(t => t.startsWith(l))) && ['透明度', '上下層級'].every(l => m.rows.includes(l)), {pic, m});
await win.keyboard.press('Escape'); await win.waitForTimeout(300);

// ---- (review) keys while the menu is open: Esc closes it (the object stays); Delete does not leave the menu up -----------
{ const t5 = (await anns('FreeText'))[0]; await rclick(t5.x + t5.w / 2, t5.y + t5.h / 2); }
await win.keyboard.press('Escape'); await win.waitForTimeout(400);
check('Esc with the menu open: the menu closes, the object stays selected', (await menu()) === null && await A(() => !!window.__pdfapp.sel()), {menu:await menu()});
{ const t5 = (await anns('FreeText'))[0]; await rclick(t5.x + t5.w / 2, t5.y + t5.h / 2); }
await win.keyboard.press('Control+v'); await win.waitForTimeout(1500);
check('another key with the menu open (Ctrl+V): the menu closes', (await menu()) === null, await menu());
await win.keyboard.press('Escape'); await win.waitForTimeout(300);

// ---- (review) a colour read from the file is not HTML ------------------------------------------------------------------------
await A(() => window.__pdfapp.mutate('test', doc => { const P = PDFLib, N = k => P.PDFName.of(k), an = doc.getPage(0).node.Annots().asArray().map(r => doc.context.lookup(r));
  const d = an.find(x => x.get(N('PDFE_RT'))), rt = JSON.parse(d.lookupMaybe(N('PDFE_RT'), P.PDFHexString, P.PDFString).decodeText());
  rt.lines.flat().forEach(r => { r.color = '"><img src=x onerror="window.__inj=1">'; });
  d.set(N('PDFE_RT'), P.PDFHexString.fromText(JSON.stringify(rt))); }));
await win.waitForTimeout(1500);
{ const t6 = (await anns('FreeText'))[0]; await rclick(t6.x + t6.w / 2, t6.y + t6.h / 2); await win.waitForTimeout(800); }
check('a text box whose colour in the file is HTML: shown as nothing, not run', await A(() => !window.__inj && !document.querySelector('#ctx img, #hint img[src="x"]')), await A(() => ({inj:window.__inj || 0, img:!!document.querySelector('#ctx img')})));
await win.keyboard.press('Escape'); await win.waitForTimeout(300);

console.log(failed ? `\n${failed} check(s) failed` : '\nall checks passed');
await app.evaluate(({app}) => app.exit(0)).catch(() => {});
