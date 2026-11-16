// 物件的複製、剪下、貼上: an object (or a group) made here is copied with Ctrl+C and pasted with Ctrl+V on another page of
// the same PDF, or on a page of another open PDF, at the mouse; the copies stay editable (a rectangle's style, a text box's
// text). Ctrl+X cuts; 復原 takes a paste back.
import { launch, TMP, ROOT } from './_env.mjs';
import fs from 'fs';
import path from 'path';

let failed = 0;
const check = (name, ok, detail = '') => { console.log(`${ok ? '✔' : '✘'} ${name}${detail !== '' ? '  ' + (typeof detail === 'string' ? detail : JSON.stringify(detail)) : ''}`); if (!ok) { failed++; process.exitCode = 1; } };

const { app } = await launch('objcopy-a.pdf');
const win = await app.firstWindow();
win.on('pageerror', e => console.log('PAGEERR', e.message));
win.on('console', m => { if (m.type() === 'error') console.log('C', m.text().slice(0, 300)); });
await win.waitForFunction(() => !!(window.__pdfapp && window.__pdfapp.S.pages.length), null, {timeout:30000});
await win.waitForTimeout(1500);
const A = win.evaluate.bind(win);
await win.click('[data-view="single"]'); await win.waitForTimeout(500);

// screen point of a page-view point on page i (the page shown first)
const show = async i => { await A(i => window.__pdfapp.scrollToPage(i), i); await win.waitForTimeout(900); };
const at = (i, x, y) => A(([i, x, y]) => { const app = window.__pdfapp, e = app.S.els[i].getBoundingClientRect(); return {x:e.left + x * app.S.scale, y:e.top + y * app.S.scale}; }, [i, x, y]);
const anns = (i, sub) => A(async ([i, sub]) => (await window.__pdfapp.getAnns(i)).filter(a => !sub || a.subtype === sub).map(a => ({id:a.id, sub:a.subtype, x:a.x, y:a.y, w:a.w, h:a.h, color:a.color, contents:a.contents})), [i, sub]);
const rts = i => A(i => window.__pdfapp.tbRT(i).then(l => l.map(x => x.rt.lines.flat().map(r => r.text).join(''))), i);
const sel = () => A(() => { const s = window.__pdfapp.sel(), m = window.__pdfapp.multi && window.__pdfapp.multi(); return {one:s && s.id, multi:m ? m.length || m.n || true : null}; });

// ---- make a rectangle and a text box on page 1 -------------------------------------------------------------------------
await show(0);
await A(() => window.__pdfapp.setTool('rect')); await win.waitForTimeout(200);
{ const p = await at(0, 100, 150), q = await at(0, 220, 220); await win.mouse.move(p.x, p.y); await win.mouse.down(); await win.mouse.move(q.x, q.y, {steps:6}); await win.mouse.up(); await win.waitForTimeout(1500); }
await A(() => window.__pdfapp.setTool('textbox')); await win.waitForTimeout(200);
{ const p = await at(0, 260, 170); await win.mouse.click(p.x, p.y); await win.waitForTimeout(500); }
await win.keyboard.type('Copy me 複製'); await win.keyboard.press('Escape'); await win.waitForTimeout(2500);
await A(() => window.__pdfapp.setTool('select')); await win.waitForTimeout(300);
const rect0 = (await anns(0, 'Square'))[0], tb0 = (await anns(0, 'FreeText'))[0];
check('(a rectangle and a text box on page 1)', !!rect0 && !!tb0, {rect0, tb0});

// ---- one object: page 1 → page 3, at the mouse; still editable --------------------------------------------------------
{ const p = await at(0, rect0.x + 5, rect0.y + rect0.h / 2); await win.mouse.click(p.x, p.y); await win.waitForTimeout(600); }
await win.keyboard.press('Control+c'); await win.waitForTimeout(800);
const clip1 = await A(() => window.__pdfapp.objClip());
check('Ctrl+C with a rectangle selected: the object is copied (not the page)', !!clip1 && clip1.n === 1 && clip1.subs[0] === 'Square', clip1);
await show(2);
{ const p = await at(2, 300, 200); await win.mouse.move(p.x, p.y); await win.waitForTimeout(200); }
await win.keyboard.press('Control+v'); await win.waitForTimeout(2000);
const r3 = await anns(2, 'Square');
check('Ctrl+V over page 3: the rectangle there, centred on the mouse, the same size', r3.length === 1 && Math.abs(r3[0].x + r3[0].w / 2 - 300) < 2 && Math.abs(r3[0].y + r3[0].h / 2 - 200) < 2 && Math.abs(r3[0].w - rect0.w) < .5, {r3, rect0});
check('the pasted rectangle is selected', (await sel()).one === (r3[0] || {}).id, await sel());
// still editable: its line width changed through the bar of the selected object
const cp = await A(() => !!document.querySelector('#hint.objbar select[data-s="width"]'));
if (cp) { await win.selectOption('#hint.objbar select[data-s="width"]', '3'); await win.waitForTimeout(1800); }
const w3 = await A(async id => (await window.__pdfapp.annStyle(2, id)) || null, (await anns(2, 'Square'))[0].id);
check('the pasted rectangle keeps its style bar and can be restyled (width 3)', cp && !!w3 && Math.abs(w3.width - 3) < .01, {cp, w3});
await win.keyboard.press('Escape'); await win.waitForTimeout(300);

// pasting again on the same page with the mouse elsewhere: a step further, not on top
await show(0);
{ const p = await at(0, rect0.x + 5, rect0.y + rect0.h / 2); await win.mouse.click(p.x, p.y); await win.waitForTimeout(600); }
await win.keyboard.press('Control+c'); await win.waitForTimeout(600);
await win.mouse.move(5, 300);   // (not over a page)
await win.keyboard.press('Control+v'); await win.waitForTimeout(1800);
const r1 = await anns(0, 'Square');
check('the mouse not over a page: pasted on the current page, a step from where it was', r1.length === 2 && r1.some(r => Math.abs(r.x - rect0.x - 12) < 1 && Math.abs(r.y - rect0.y - 12) < 1), r1);
await win.click('#bUndo'); await win.waitForTimeout(1800);
check('復原: that paste taken back', (await anns(0, 'Square')).length === 1);

// ---- a group: the rectangle and the text box → page 2, the text box's text editable ------------------------------------
{ const p = await at(0, rect0.x + 5, rect0.y + rect0.h / 2); await win.mouse.click(p.x, p.y); await win.waitForTimeout(500); }
{ const p = await at(0, tb0.x + tb0.w / 2, tb0.y + tb0.h / 2); await win.keyboard.down('Shift'); await win.mouse.click(p.x, p.y); await win.keyboard.up('Shift'); await win.waitForTimeout(600); }
await win.keyboard.press('Control+c'); await win.waitForTimeout(800);
const clip2 = await A(() => window.__pdfapp.objClip());
check('Ctrl+C with two selected: both copied', !!clip2 && clip2.n === 2 && clip2.subs.sort().join() === 'FreeText,Square', clip2);
await show(1);
{ const p = await at(1, 300, 300); await win.mouse.move(p.x, p.y); }
await win.keyboard.press('Control+v'); await win.waitForTimeout(2500);
const p2 = await anns(1), t2 = await rts(1);
check('pasted on page 2: a rectangle and a text box, the text box\'s text kept for editing', p2.some(a => a.sub === 'Square') && p2.some(a => a.sub === 'FreeText') && t2.includes('Copy me 複製'), {p2, t2});
const tbp = p2.find(a => a.sub === 'FreeText');
await win.keyboard.press('Escape'); await win.waitForTimeout(300);
{ const p = await at(1, tbp.x + tbp.w / 2, tbp.y + tbp.h / 2); await win.mouse.click(p.x, p.y); await win.waitForTimeout(700); await win.click('.abar [data-x="edit"]'); await win.waitForTimeout(900); }
const ed = await A(() => (window.__pdfapp.TBE() || {}).html || '');
check('the pasted text box opens for writing with its text', ed.includes('Copy me'), ed.slice(0, 160));
await win.keyboard.press('End'); await win.keyboard.type(' 2'); await win.keyboard.press('Escape'); await win.waitForTimeout(2500);
await A(() => window.__pdfapp.setTool('select')); await win.waitForTimeout(300);
check('…and is written again with the change', (await rts(1)).includes('Copy me 複製 2'), await rts(1));

// ---- another PDF: the group pasted on its page 1, editable there ----------------------------------------------------------
const B = path.join(TMP, 'objcopy-b.pdf'); fs.copyFileSync(path.join(ROOT, 'tests', 'e2e', 'fixtures', 'sample.pdf'), B);
const nTabs = await A(() => document.querySelectorAll('.dtab').length);
await app.evaluate(({BrowserWindow}, p) => BrowserWindow.getAllWindows()[0].webContents.send('open-path', p), B);
await win.waitForFunction(n => document.querySelectorAll('.dtab').length > n, nTabs, {timeout:15000}).catch(() => {});
await win.waitForTimeout(2000);
check('(file B open in its own tab)', await A(() => window.__pdfapp.S.name) === 'objcopy-b.pdf', await A(() => window.__pdfapp.S.name));
await win.click('[data-view="single"]'); await win.waitForTimeout(500);
await show(0);
{ const p = await at(0, 250, 500); await win.mouse.move(p.x, p.y); }
await win.keyboard.press('Control+v'); await win.waitForTimeout(2500);
const pb = await anns(0), tb = await rts(0);
check('in file B: the rectangle and the text box pasted, the text box editable (its text kept)', pb.some(a => a.sub === 'Square') && pb.some(a => a.sub === 'FreeText') && tb.includes('Copy me 複製'), {pb, tb});
check('file B: one undo step for the paste', await A(() => window.__pdfapp.S.undo.length) === 1);
// cut in file B, paste back
const sqb = pb.find(a => a.sub === 'Square');
await win.keyboard.press('Escape'); await win.waitForTimeout(300);
{ const p = await at(0, sqb.x + 5, sqb.y + sqb.h / 2); await win.mouse.click(p.x, p.y); await win.waitForTimeout(600); }
await win.keyboard.press('Control+x'); await win.waitForTimeout(1800);
check('Ctrl+X: the rectangle is gone from the page', !(await anns(0, 'Square')).length);
{ const p = await at(0, 150, 650); await win.mouse.move(p.x, p.y); }
await win.keyboard.press('Control+v'); await win.waitForTimeout(1800);
check('…and Ctrl+V puts it back at the mouse', (await anns(0, 'Square')).length === 1);
// the pasted objects are in this file's layers (selectable, not hidden by a layer of the other file)
const sv = await A(async () => { const app = window.__pdfapp, P = PDFLib, d = await P.PDFDocument.load(app.S.bytes, {ignoreEncryption:true}), an = d.getPage(0).node.Annots();
  const oc = an ? an.asArray().map(r => d.context.lookup(r)).filter(o => o.get(P.PDFName.of('OC'))).map(o => o.get(P.PDFName.of('OC'))) : [];
  const props = d.catalog.lookupMaybe(P.PDFName.of('OCProperties'), P.PDFDict), ocgs = props ? props.lookup(P.PDFName.of('OCGs'), P.PDFArray).asArray() : [];
  return {oc:oc.length, foreign:oc.filter(r => !ocgs.some(g => g === r)).length}; });
check('no pasted object points at a layer of the other file', sv.foreign === 0, sv);

console.log(failed ? `\n${failed} check(s) failed` : '\nall checks passed');
await app.evaluate(({app}) => app.exit(0)).catch(() => {});
