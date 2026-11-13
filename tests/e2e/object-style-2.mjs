// 選到物件時工具列（v1.0.34）: text boxes, stamps, pictures and area fills selected with the select tool show their own
// settings in the bar above the pages; a change there is applied to that object (one undo step, still selected).
import { launchPath, TMP } from './_env.mjs';
import { PDFDocument, PDFName, PDFHexString, rgb } from 'pdf-lib';
import fs from 'fs';
import path from 'path';

let failed = 0;
const check = (name, ok, detail = '') => { console.log(`${ok ? '✔' : '✘'} ${name}${detail !== '' ? '  ' + (typeof detail === 'string' ? detail : JSON.stringify(detail)) : ''}`); if (!ok) { failed++; process.exitCode = 1; } };

// a page with a closed frame (for the area fill) and a stamp an older version made (no PDFE, no stored settings)
const doc = await PDFDocument.create(), pg = doc.addPage([595, 842]);
pg.drawRectangle({x:330, y:60, width:200, height:140, borderColor:rgb(0, 0, 0), borderWidth:2});
const oldAP = doc.context.register(doc.context.stream('q 0.8 0.1 0.1 RG 3 w 2 2 96 36 re S Q', {Type:'XObject', Subtype:'Form', BBox:[0, 0, 100, 40]}));
pg.node.set(PDFName.of('Annots'), doc.context.obj([doc.context.obj({Type:'Annot', Subtype:'Stamp', Rect:[60, 60, 160, 100], Name:'Approved', Contents:PDFHexString.fromText('核准'),
  Subj:PDFHexString.fromText('戳記'), T:PDFHexString.fromText('old'), F:4, AP:{N:oldAP}})]));
const PDF = path.join(TMP, 'os2.pdf'); fs.writeFileSync(PDF, await doc.save());

const { app } = await launchPath(PDF);
const win = await app.firstWindow(); win.on('pageerror', e => console.log('PAGEERR', e.message)); win.on('console', m => { if (m.type() === 'error') console.log('C', m.text().slice(0, 300)); });
await win.waitForTimeout(3000);
const A = win.evaluate.bind(win);
const P = (i, x, y) => A(([i, x, y]) => { const r = window.__pdfapp.S.els[i].getBoundingClientRect(), s = window.__pdfapp.S.scale; return [r.left + x * s, r.top + y * s]; }, [i, x, y]);
const see = async (i, x, y) => {
  await A(([i, x, y]) => { const S = window.__pdfapp.S, vw = document.querySelector('#viewer'), vr = vw.getBoundingClientRect(), r = S.els[i].getBoundingClientRect();
    vw.scrollTop += r.top + y * S.scale - (vr.top + vr.height / 2); vw.scrollLeft += r.left + x * S.scale - (vr.left + vr.width / 2); }, [i, x, y]);
  await win.waitForTimeout(350); return P(i, x, y);
};
const tool = async t => { await A(t => window.__pdfapp.setTool(t), t); await win.waitForTimeout(250); };
const click = async xy => { await win.mouse.click(...xy); await win.waitForTimeout(600); };
const anns = (i, sub) => A(async ([i, sub]) => (await window.__pdfapp.getAnns(i)).filter(a => !sub || a.subtype === sub).map(a => ({id:a.id, sub:a.subtype, x:a.x, y:a.y, w:a.w, h:a.h, contents:a.contents})), [i, sub]);
const sel = () => A(() => window.__pdfapp.sel());
const style = id => A(id => window.__pdfapp.annStyle(0, id), id);
const pick = async a => { await tool('select'); await click(await see(0, a.x + Math.min(6, a.w / 2), a.y + a.h / 2)); };
const settle = () => win.waitForTimeout(1800);
const near = (a, b, d = .6) => Math.abs(a - b) <= d;
const title = () => A(() => { const h = document.querySelector('#hint'); return h.classList.contains('show') && h.classList.contains('objbar') ? (h.querySelector('.sb-t') || {}).textContent || '' : null; });

// ---- part 1: text boxes ----------------------------------------------------------------------------------------------
await A(() => window.__pdfapp.fontReady());
const TB0 = await A(() => localStorage.getItem('pdfeditor.textbox.v1'));
await tool('textbox'); await click(await see(0, 100, 120)); await win.keyboard.type('Hello 世界'); await win.keyboard.press('Escape'); await settle();
let tb = (await anns(0, 'FreeText'))[0];
await pick(tb);
const runs = s => (s && s.rt ? s.rt.lines.flat() : []);
let st = tb && await style(tb.id);
const tbar = () => A(() => { const h = document.querySelector('#hint.objbar'); if (!h) return null; const sz = h.querySelector('select[data-tb="size"]'), b = h.querySelector('.tfmt[data-tb="bold"]');
  return {size:sz ? +sz.value : null, bold:b ? b.classList.contains('on') : null, font:(h.querySelector('[data-tbfont]') || {}).textContent || null}; });
let tb0 = await tbar();
check('a text box selected: 已選取：文字方塊, its size in the bar', !!tb && (await title() || '').includes('已選取：文字方塊') && !!tb0 && tb0.size === runs(st)[0]?.size && tb0.bold === false, {title:await title(), tb0, runs:runs(st)});
const box0 = {x:tb.x, y:tb.y, w:tb.w, h:tb.h};
await win.selectOption('#hint.objbar select[data-tb="size"]', '24'); await settle();
st = await style(tb.id); tb = (await anns(0, 'FreeText')).find(a => a.id === tb.id);
check('字級 24: every run 24, the box grows from its top-left corner, the text the same, still selected',
  runs(st).length > 0 && runs(st).every(r => r.size === 24) && tb.h > box0.h + 4 && near(tb.x, box0.x) && near(tb.y, box0.y) && tb.contents === 'Hello 世界' && (await sel())?.id === tb.id, {runs:runs(st), tb, box0, sel:await sel()});
const tbc = async (key, v) => { await win.click(`#hint.objbar .cpick[data-tbc="${key}"]`); await win.waitForTimeout(300); await win.click(`#cpMenu [data-v="${v}"]`); await win.waitForTimeout(200); if (await A(() => document.querySelector('#cpMenu').style.display === 'block')) await win.click('#cpMenu [data-cpx="ok"]'); await settle(); };
await tbc('color', '#e03131');
st = await style(tb.id);
check('顏色: every run red', runs(st).every(r => r.color === '#e03131'), runs(st));
await win.click('#hint.objbar .tfmt[data-tb="bold"]'); await settle();
st = await style(tb.id);
const boldOn = runs(st).every(r => r.bold), barBold = (await tbar())?.bold;
await win.click('#hint.objbar .tfmt[data-tb="bold"]'); await settle();
st = await style(tb.id);
check('粗體: on for every run, then off again', boldOn && barBold === true && runs(st).every(r => !r.bold), {boldOn, barBold, runs:runs(st)});
await win.click('#hint.objbar .tfmt[data-tb="bold"]'); await win.click('#hint.objbar .tfmt[data-tb="bold"]'); await win.waitForTimeout(3000);
st = await style(tb.id);
check('粗體 pressed twice quickly: not bold', runs(st).every(r => !r.bold), runs(st));
await tbc('boxBg', '#fff3bf');
await win.click('#hint.objbar input[data-tb="border"]'); await settle();
st = await style(tb.id);
check('方塊背景 and 框線: on the box', st?.rt?.box?.boxBg === '#fff3bf' && st?.rt?.box?.border === true, st?.rt?.box);
await win.click('#hint.objbar [data-tbfont]'); await win.waitForTimeout(500);
await win.click('#fontMenu .fm-it[data-f="DejaVu Serif"]'); await settle();
st = await style(tb.id);
check('字型: every run in the chosen font, the button says so', runs(st).every(r => r.font === 'DejaVu Serif') && ((await tbar())?.font || '').includes('DejaVu Serif'), {runs:runs(st), bar:await tbar()});
await win.keyboard.press('Control+z'); await settle();
st = await style(tb.id);
check('復原 once: the font change undone, the rest kept', runs(st).every(r => !r.font && r.color === '#e03131' && r.size === 24) && st?.rt?.box?.border === true, runs(st));
check('the text box tool\'s own defaults unchanged', (await A(() => localStorage.getItem('pdfeditor.textbox.v1'))) === TB0);
// two runs of different sizes: a new colour keeps them different
await win.keyboard.press('Escape'); await tool('textbox'); await click(await see(0, 100, 260)); await win.keyboard.type('AB');
await win.keyboard.down('Shift'); await win.keyboard.press('ArrowLeft'); await win.keyboard.up('Shift');
await win.selectOption('#hint select[data-tb="size"]', '20'); await win.waitForTimeout(300);
await win.keyboard.press('Escape'); await settle();
const tb2 = (await anns(0, 'FreeText')).find(a => a.id !== tb.id);
await pick(tb2);
const s20 = runs(await style(tb2.id)).map(r => r.size);
await tbc('color', '#1c64d9');
const st2 = await style(tb2.id);
check('runs of different sizes: a new colour keeps their sizes', s20.length === 2 && s20[0] !== s20[1] && JSON.stringify(runs(st2).map(r => r.size)) === JSON.stringify(s20) && runs(st2).every(r => r.color === '#1c64d9'), {s20, runs:runs(st2)});

console.log(failed ? `\n${failed} check(s) failed` : '\nall checks passed');
await app.evaluate(({app}) => app.exit(0)).catch(() => {});
