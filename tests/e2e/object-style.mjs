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

console.log(failed ? `\n${failed} check(s) failed` : '\nall checks passed');
await app.evaluate(({app}) => app.exit(0)).catch(() => {});
