// 選到物件時工具列換成它的編輯功能: with the select tool, an object this program drew shows its own style in the
// bar above the pages (the drawing tool's settings with the object's values); a change there restyles that object.
import { launch, launchPath, TMP } from './_env.mjs';
import { PDFDocument, PDFName } from 'pdf-lib';
import fs from 'fs';
import path from 'path';

let failed = 0;
const check = (name, ok, detail = '') => { console.log(`${ok ? '✔' : '✘'} ${name}${detail !== '' ? '  ' + (typeof detail === 'string' ? detail : JSON.stringify(detail)) : ''}`); if (!ok) { failed++; process.exitCode = 1; } };
let app, win, A;
const start = async l => { ({ app } = await l); win = await app.firstWindow(); win.on('pageerror', e => console.log('PAGEERR', e.message)); win.on('console', m => { if (m.type() === 'error') console.log('C', m.text().slice(0, 300)); }); await win.waitForTimeout(3000); A = win.evaluate.bind(win); };
const P = (i, x, y) => A(([i, x, y]) => { const r = window.__pdfapp.S.els[i].getBoundingClientRect(), s = window.__pdfapp.S.scale; return [r.left + x * s, r.top + y * s]; }, [i, x, y]);
const see = async (i, x, y) => {
  await A(([i, x, y]) => { const S = window.__pdfapp.S, vw = document.querySelector('#viewer'), vr = vw.getBoundingClientRect(), r = S.els[i].getBoundingClientRect();
    vw.scrollTop += r.top + y * S.scale - (vr.top + vr.height / 2); vw.scrollLeft += r.left + x * S.scale - (vr.left + vr.width / 2); }, [i, x, y]);
  await win.waitForTimeout(350); return P(i, x, y);
};
const tool = async t => { await A(t => window.__pdfapp.setTool(t), t); await win.waitForTimeout(250); };
const click = async xy => { await win.mouse.click(...xy); await win.waitForTimeout(600); };
const drag = async (a, b) => { await win.mouse.move(...a); await win.mouse.down(); await win.mouse.move(...b, {steps:6}); await win.mouse.up(); await win.waitForTimeout(1200); };
const anns = (i, sub) => A(async ([i, sub]) => (await window.__pdfapp.getAnns(i)).filter(a => !sub || a.subtype === sub).map(a => ({id:a.id, sub:a.subtype, x:a.x, y:a.y, w:a.w, h:a.h})), [i, sub]);
const sel = () => A(() => window.__pdfapp.sel());
const style = (i, id) => A(([i, id]) => window.__pdfapp.annStyle(i, id), [i, id]);
const bar = () => A(() => { const h = document.querySelector('#hint'); if (!h.classList.contains('show') || !h.classList.contains('objbar')) return null;
  const cp = h.querySelector('.cpick[data-cp="color"]'), w = h.querySelector('select[data-s="width"]');
  return {title:(h.querySelector('.sb-t') || {}).textContent || '', color:cp ? cp.style.getPropertyValue('--c').trim() : null, width:w ? +w.value : null}; });
const pick = async a => { await tool('select'); await click(await see(0, a.x + 3, a.y + a.h / 2)); };

// ---- part 0: another program's square (no PDFE mark) shows no style bar ---------------------------------------------
const other = await PDFDocument.create(), pg = other.addPage([595, 842]);
pg.node.set(PDFName.of('Annots'), other.context.obj([other.context.obj({Type:'Annot', Subtype:'Square', Rect:[100, 500, 250, 600], C:[1, 0, 0], BS:{W:2}, F:4})]));
const OTHER = path.join(TMP, 'os-other.pdf'); fs.writeFileSync(OTHER, await other.save());
await start(launchPath(OTHER));
await tool('select'); await click(await see(0, 102, 292));
const o0 = await sel();
check('another program\'s square: selected, no style bar', !!o0 && o0.sub === 'Square' && (await bar()) === null, {o0, bar:await bar()});
await app.evaluate(({app}) => app.exit(0)).catch(() => {}); await new Promise(r => setTimeout(r, 1500));

// ---- part 1: the selected object's style in the bar ------------------------------------------------------------------
await start(launch('os1.pdf'));
await tool('rect'); await drag(await see(0, 200, 300), await P(0, 320, 380));
const rect = (await anns(0, 'Square'))[0];
await pick(rect);
let b = await bar(), st = rect && await style(0, rect.id);
check('a rectangle selected: the bar says 已選取：矩形 and shows its colour and width', !!b && b.title.includes('已選取：矩形') && !!st && b.color === st.color && b.width === st.width, {b, st});
await win.keyboard.press('Escape'); await win.waitForTimeout(300);
check('nothing selected: the bar is gone', (await bar()) === null);
await tool('pen');
check('a drawing tool: its own bar, not the object\'s', (await A(() => document.querySelector('#hint').classList.contains('show') && !document.querySelector('#hint').classList.contains('objbar'))));
await tool('textbox'); await click(await see(0, 100, 640)); await win.keyboard.type('abc'); await win.keyboard.press('Escape'); await win.waitForTimeout(1200);
const ft = (await anns(0, 'FreeText'))[0];
if (ft) await pick(ft);
check('a text box selected: no style bar (next version)', !!ft && (await sel())?.sub === 'FreeText' && (await bar()) === null, {ft, sel:await sel(), bar:await bar()});


// ---- part 2: a change in the bar restyles the selected object ---------------------------------------------------------
const cpk = async (key, v) => { await win.click(`#hint.objbar .cpick[data-cp="${key}"]`); await win.waitForTimeout(300); await win.click(`#cpMenu [data-v="${v}"]`); await win.waitForTimeout(1500); };
const setSel = async (key, v) => { await win.selectOption(`#hint.objbar select[data-s="${key}"]`, String(v)); await win.waitForTimeout(1500); };
const boxOf = async id => { const a = (await anns(0)).find(x => x.id === id); return a && {x:a.x, y:a.y, w:a.w, h:a.h}; };
const STY0 = await A(() => localStorage.getItem('pdfeditor.styles.v1'));
await pick(rect);
await setSel('width', 4);
check('粗細 4: the rectangle is 4 pt, still selected', (await style(0, rect.id))?.width === 4 && (await sel())?.id === rect.id, {st:await style(0, rect.id), sel:await sel()});
await cpk('color', '#1c64d9');
check('框線顏色: the rectangle\'s colour, the bar shows it', (await style(0, rect.id))?.color === '#1c64d9' && (await bar())?.color === '#1c64d9', {st:await style(0, rect.id), bar:await bar()});
await cpk('fill', '#ffd43b');
check('填色: filled', (await style(0, rect.id))?.fill === '#ffd43b', await style(0, rect.id));
await cpk('fill', '');
check('填色 無: no fill', (await style(0, rect.id))?.fill === '', await style(0, rect.id));
await win.click('#hint.objbar input[data-s="dash"]'); await win.waitForTimeout(1500);
check('虛線', (await style(0, rect.id))?.dash === true, await style(0, rect.id));
await setSel('opacity', 0.5); const op1 = (await style(0, rect.id))?.opacity;
await setSel('opacity', 1);
check('透明度 50% then 100%', op1 === 0.5 && (await style(0, rect.id))?.opacity === 1, {op1, now:await style(0, rect.id)});
await win.keyboard.press('Control+z'); await win.waitForTimeout(1500);
check('one undo: back to 50%', (await style(0, rect.id))?.opacity === 0.5, await style(0, rect.id));
check('the tool\'s own defaults are unchanged', (await A(() => localStorage.getItem('pdfeditor.styles.v1'))) === STY0);
await pick(rect);
const ctr = b => b && [b.x + b.w / 2, b.y + b.h / 2];
const bx0 = await boxOf(rect.id); await setSel('width', 14); const bx1 = await boxOf(rect.id); await setSel('width', 4); const bx2 = await boxOf(rect.id);
check('粗細 14 then 4: the shape stays centred where it was, its frame comes back', !!bx0 && !!bx1 && !!bx2 && ctr(bx1).every((v, k) => Math.abs(v - ctr(bx0)[k]) < 0.6) && ['x', 'y', 'w', 'h'].every(k => Math.abs(bx2[k] - bx0[k]) < 0.6), {bx0, bx1, bx2});
await win.selectOption('#hint.objbar select[data-s="width"]', '3'); await win.waitForTimeout(120);
await win.selectOption('#hint.objbar select[data-s="width"]', '6'); await win.waitForTimeout(2500);
check('two quick changes: both applied, 6 stays, still selected', (await style(0, rect.id))?.width === 6 && (await sel())?.id === rect.id, {st:await style(0, rect.id), sel:await sel()});
await win.keyboard.press('Delete'); await win.waitForTimeout(1500);
check('Delete after a change: this rectangle is deleted', !(await anns(0, 'Square')).some(a => a.id === rect.id));
await win.keyboard.press('Control+z'); await win.waitForTimeout(1500);
// the other kinds
await tool('arrow'); await drag(await see(0, 100, 120), await P(0, 180, 170));
const arrow = (await anns(0, 'Line'))[0]; await pick(arrow);
await setSel('head', 'closed');
check('箭頭: a closed head', (await style(0, arrow.id))?.head === 'closed' && (await bar())?.title.includes('箭頭'), {st:await style(0, arrow.id), bar:await bar()});
await tool('line'); await drag(await see(0, 100, 220), await P(0, 200, 222));
const line = (await anns(0, 'Line')).find(a => a.id !== arrow.id); await pick(line);
await setSel('width', 6);
check('線條: 6 pt', (await style(0, line.id))?.width === 6, await style(0, line.id));
await tool('polygon'); for (const [x, y] of [[380, 120], [460, 120], [420, 180]]) await click(await see(0, x, y));
await win.keyboard.press('Enter'); await win.waitForTimeout(1500);
const poly = (await anns(0, 'Polygon'))[0]; await pick(poly);
await cpk('color', '#2b8a3e');
check('多邊形: its colour', (await style(0, poly.id))?.color === '#2b8a3e', await style(0, poly.id));
await tool('pen'); await drag(await see(0, 400, 300), await P(0, 460, 340)); await tool('select'); await win.waitForTimeout(1500);
const ink = (await anns(0, 'Ink'))[0]; await pick(ink);
await cpk('color', '#7048e8');
check('畫筆: its colour', (await style(0, ink.id))?.color === '#7048e8', await style(0, ink.id));
await tool('fill'); await win.click('#hint [data-s="mode"][data-v="nodes"]'); await win.waitForTimeout(300);
const polys0 = (await anns(0, 'Polygon')).map(a => a.id);
for (const [x, y] of [[380, 450], [460, 450], [420, 520]]) await click(await see(0, x, y));
await win.keyboard.press('Enter'); await win.waitForTimeout(1500);
const fillp = (await anns(0, 'Polygon')).find(a => !polys0.includes(a.id)); await pick(fillp);
const fb = await bar();
await cpk('color', '#f76707');
const fs1 = await style(0, fillp.id);
check('填色 (nodes): only colour and opacity in its bar; its colour and fill change together', !!fb && fb.title.includes('填色') && fb.width === null && fs1?.color === '#f76707' && fs1?.fill === '#f76707', {fb, fs1});
await pick(rect);
const preset = await A(() => window.__pdfapp.presets('box')[1]);
await win.click('#hint.objbar [data-p="1"]'); await win.waitForTimeout(1500);
const ps = await style(0, rect.id);
check('預設樣式: the rectangle takes the preset', !!preset && ps?.color === preset.color && ps?.width === (+preset.width || ps?.width), {preset, ps});
await tool('rect'); await drag(await see(0, 440, 600), await P(0, 560, 680));   // right of the sample's signature field
const r2 = (await anns(0, 'Square')).find(a => a.id !== rect.id); await pick(r2);
const rh = await win.locator('.asel .rh').boundingBox({timeout:8000}), sb = await win.locator('.asel').boundingBox();
const c0 = {x:sb.x + sb.width / 2, y:sb.y + sb.height / 2}, h0 = {x:rh.x + rh.width / 2, y:rh.y + rh.height / 2}, R = Math.hypot(h0.x - c0.x, h0.y - c0.y), a0 = Math.atan2(h0.y - c0.y, h0.x - c0.x);
await win.mouse.move(h0.x, h0.y); await win.mouse.down();
for (let k = 1; k <= 10; k++) { const ang = a0 + 30 * Math.PI / 180 * k / 10; await win.mouse.move(c0.x + R * Math.cos(ang), c0.y + R * Math.sin(ang)); }
await win.mouse.up(); await win.waitForTimeout(2200);
const d0 = (await style(0, r2.id))?.deg;
if ((await sel())?.id !== r2.id) { const a2 = (await anns(0, 'Square')).find(a => a.id === r2.id); await pick(a2); }
await cpk('color', '#c92a2a');
const t2 = await style(0, r2.id);
check('a turned rectangle: a new colour keeps its angle', Math.abs((d0 || 0) - 30) < 3 && t2?.color === '#c92a2a' && Math.abs(t2.deg - d0) < 0.5, {d0, t2});


// ---- part 3: text markup and area highlights -------------------------------------------------------------------------
const chars = await A(() => window.__pdfapp.pageChars(0));
const lineOf = k => chars.filter(c => c.item === k), mid = c => [(c.x0 + c.x1) / 2, (c.y0 + c.y1) / 2];
const L0 = lineOf(chars[0].item), L1 = lineOf(chars.find(c => c.item !== chars[0].item).item);
await tool('hlText'); await drag(await see(0, ...mid(L0[0])), await P(0, ...mid(L0[L0.length - 1])));
const hl = (await anns(0, 'Highlight'))[0];
if (hl) await pick(hl);
const hb = await bar();
if (hb) await cpk('color', '#8ce99a');
check('高亮文字: its bar, then its colour', !!hb && hb.title.includes('高亮文字') && (await style(0, hl.id))?.color === '#8ce99a', {hb, st:hl && await style(0, hl.id)});
await tool('underline'); await drag(await see(0, ...mid(L1[0])), await P(0, ...mid(L1[Math.min(8, L1.length - 1)])));
const ul = (await anns(0, 'Underline'))[0];
if (ul) await pick(ul);
if (await bar()) await setSel('opacity', 0.5);
check('底線文字: 50%', !!ul && (await style(0, ul.id))?.opacity === 0.5, ul && await style(0, ul.id));
const hl0 = (await anns(0, 'Highlight')).map(a => a.id);
await tool('highlight'); await drag(await see(0, 100, 770), await P(0, 220, 810));
const area = (await anns(0, 'Highlight')).find(a => !hl0.includes(a.id));
if (area) await pick(area);
const ab = await bar();
if (ab) await cpk('color', '#74c0fc');
check('區域螢光筆 (newly drawn): its bar, then its colour', !!ab && ab.title.includes('區域螢光筆') && (await style(0, area.id))?.color === '#74c0fc', {ab, st:area && await style(0, area.id)});


// ---- part 4 (final review): the appearance really redrawn; small shapes; rect-mode fills; the bar goes with the selection
const ap = id => A(id => window.__pdfapp.apText(0, id), id);
await tool('rect'); await drag(await see(0, 60, 400), await P(0, 160, 470));
const sq1 = (await anns(0, 'Square')).map(a => a.id);
const r3 = (await anns(0, 'Square')).sort((p, q) => parseInt(q.id) - parseInt(p.id))[0];
await pick(r3);
await cpk('color', '#1c64d9');
check('a new colour is in the drawing itself', ((await ap(r3.id)) || '').includes('0.110 0.392 0.851 RG'), (await ap(r3.id) || '').slice(0, 160));
await setSel('opacity', 0.5); const ap50 = await ap(r3.id);
await setSel('opacity', 1); const ap100 = await ap(r3.id);
check('50%: the drawing is see-through; 100%: not any more', (ap50 || '').includes('/GS0 gs') && !(ap100 || '').includes('/GS0 gs'), {ap50:(ap50 || '').slice(0, 60), ap100:(ap100 || '').slice(0, 60)});
await setSel('width', 14);
check('14 pt in the drawing itself', ((await ap(r3.id)) || '').includes('14.00 w'), (await ap(r3.id) || '').slice(0, 120));
check('a turned rectangle: the new colour in its upright drawing', ((await ap(r2.id)) || '').includes('0.788 0.165 0.165 RG'), (await ap(r2.id) || '').slice(0, 120));
await tool('cloud'); await drag(await see(0, 240, 560), await P(0, 360, 620));
const cl = (await anns(0, 'Square')).find(a => !sq1.includes(a.id));
await pick(cl);
const cw0 = (await style(0, cl.id))?.width, cb0 = await boxOf(cl.id); await setSel('width', 8); await setSel('width', cw0); const cb2 = await boxOf(cl.id);
check('a cloud set to 8 pt and back to its width: its frame comes back', !!cb0 && !!cb2 && ['x', 'y', 'w', 'h'].every(k => Math.abs(cb2[k] - cb0[k]) < 0.6), {cw0, cb0, cb2});
await tool('fill'); await win.click('#hint [data-s="mode"][data-v="rect"]'); await win.waitForTimeout(300);
const sq2 = (await anns(0, 'Square')).map(a => a.id);
await drag(await see(0, 470, 760), await P(0, 560, 810));
const fr = (await anns(0, 'Square')).find(a => !sq2.includes(a.id));
if (fr) await pick(fr);
const frb = await bar();
if (frb && frb.title.includes('填色')) await cpk('color', '#e03131');
const frs = fr && await style(0, fr.id);
check('填色 in 矩形 mode: a fill bar; colour and fill change together', !!frb && frb.title.includes('填色') && frb.width === null && frs?.color === '#e03131' && frs?.fill === '#e03131', {frb, frs});
await pick(r3); await setSel('width', 3);
await win.keyboard.press('Control+z'); await win.waitForTimeout(1500);
check('undo with an object selected: no bar left behind', (await bar()) === null && (await sel()) === null, {bar:await bar(), sel:await sel()});
const w3 = (await style(0, r3.id))?.width;
await tool('rect');
await win.selectOption('#hint select[data-s="width"]', '8'); await win.waitForTimeout(1500);
const toolW = await A(() => (JSON.parse(localStorage.getItem('pdfeditor.styles.v1') || '{}').rect || {}).width);
check('then a drawing tool: its width is the tool\'s, the last selected object unchanged', (await style(0, r3.id))?.width === w3 && +toolW === 8, {w3, now:(await style(0, r3.id))?.width, toolW});
await pick(r3); await A(() => window.__pdfapp.makeSample()); await win.waitForTimeout(2500);
check('another document opened: no bar left behind', (await bar()) === null, await bar());

console.log(failed ? `\n${failed} check(s) failed` : '\nall checks passed');
await app.evaluate(({app}) => app.exit(0)).catch(() => {});
