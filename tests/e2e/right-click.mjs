// 右鍵回到選取: a right-click on the document no longer opens the page menu; on an empty spot it goes back to the
// select tool from any tool (finishing what was being drawn); on an object it selects it; notes keep their menu.
import { launch } from './_env.mjs';

let failed = 0;
const check = (name, ok, detail = '') => { console.log(`${ok ? '✔' : '✘'} ${name}${detail !== '' ? '  ' + (typeof detail === 'string' ? detail : JSON.stringify(detail)) : ''}`); if (!ok) { failed++; process.exitCode = 1; } };
const { app } = await launch('rc1.pdf');
const win = await app.firstWindow(); win.on('pageerror', e => console.log('PAGEERR', e.message)); win.on('console', m => { if (m.type() === 'error') console.log('C', m.text().slice(0, 300)); });
await win.waitForTimeout(3000);
const A = win.evaluate.bind(win);
const P = (i, x, y) => A(([i, x, y]) => { const r = window.__pdfapp.S.els[i].getBoundingClientRect(), s = window.__pdfapp.S.scale; return [r.left + x * s, r.top + y * s]; }, [i, x, y]);
// a point of page i scrolled into the middle of the viewer first, then its window coordinates
const see = async (i, x, y) => {
  await A(([i, x, y]) => { const S = window.__pdfapp.S, vw = document.querySelector('#viewer'), vr = vw.getBoundingClientRect(), r = S.els[i].getBoundingClientRect();
    vw.scrollTop += r.top + y * S.scale - (vr.top + vr.height / 2); vw.scrollLeft += r.left + x * S.scale - (vr.left + vr.width / 2); }, [i, x, y]);
  await win.waitForTimeout(350); return P(i, x, y);
};
const anns = (i, sub) => A(async ([i, sub]) => (await window.__pdfapp.getAnns(i)).filter(a => !sub || a.subtype === sub).map(a => ({id:a.id, sub:a.subtype, contents:a.contents, x:a.x, y:a.y, w:a.w, h:a.h})), [i, sub]);
const tool = async t => { await A(t => window.__pdfapp.setTool(t), t); await win.waitForTimeout(250); if (await A(() => document.querySelector('#mask').classList.contains('show'))) { await win.keyboard.press('Escape'); await win.waitForTimeout(250); } };
const curTool = () => A(() => window.__pdfapp.S.tool);
const menu = () => A(() => { const c = document.querySelector('#ctx'); return c.style.display === 'block' ? [...c.querySelectorAll('button[data-c]')].map(b => b.dataset.c) : null; });
const rclick = async xy => { await win.mouse.click(...xy, {button:'right'}); await win.waitForTimeout(700); };
const click = async xy => { await win.mouse.click(...xy); await win.waitForTimeout(300); };
const drag = async (a, b) => { await win.mouse.move(...a); await win.mouse.down(); await win.mouse.move(...b, {steps:6}); await win.mouse.up(); await win.waitForTimeout(700); };
const blank = () => see(0, 60, 780);   // an empty spot of page 1 (no annotation there)

// ---- part 1: an empty spot goes back to the select tool -------------------------------------------------------------
await tool('rect'); await drag(await see(0, 200, 300), await P(0, 300, 360));
const rect = (await anns(0, 'Square'))[0];
await tool('select'); await click(await see(0, rect.x + 4, rect.y + rect.h / 2));
const sel0 = await A(() => window.__pdfapp.sel());
await rclick(await blank());
check('選取: a right-click on an empty spot opens no menu and drops the selection', !!sel0 && (await menu()) === null && (await curTool()) === 'select' && (await A(() => window.__pdfapp.sel())) === null, {sel0, menu:await menu(), tool:await curTool()});
const back = [];
for (const t of ['textbox', 'note', 'rect', 'pen', 'eraser', 'highlight', 'extract', 'ocr', 'stamp', 'hand', 'fill']) {
  await tool(t); const was = await curTool();
  await rclick(await blank());
  back.push({t, was, now:await curTool(), menu:await menu()});
  if (await menu()) { await win.keyboard.press('Escape'); await win.waitForTimeout(200); }
}
check('every tool: a right-click on an empty spot goes back to 選取, no menu', back.every(r => r.was === r.t && r.now === 'select' && r.menu === null), back.filter(r => !(r.was === r.t && r.now === 'select' && r.menu === null)));
let ft0 = (await anns(0, 'FreeText')).length;
await tool('textbox'); await rclick(await blank());
check('文字方塊: a right-click no longer starts a text box', (await anns(0, 'FreeText')).length === ft0 && (await A(() => window.__pdfapp.TBE())) === null);
// what was being made is kept
await tool('textbox'); await click(await see(0, 100, 620)); await win.keyboard.type('右鍵前的字'); await win.waitForTimeout(200);
await rclick(await blank()); await win.waitForTimeout(800);
const fts = await anns(0, 'FreeText');
check('文字方塊 being typed in, then a right-click: the text is kept, back to 選取', fts.length === ft0 + 1 && fts.some(a => (a.contents || '').includes('右鍵前的字')) && (await curTool()) === 'select', {fts, tool:await curTool()});
await tool('note'); await click(await see(0, 420, 560)); await win.keyboard.type('右鍵前的便利貼'); await win.waitForTimeout(200);
await rclick(await blank()); await win.waitForTimeout(800);
check('a new 便利貼 being typed in, then a right-click: the note is kept, back to 選取', (await anns(0, 'Text')).some(a => a.contents === '右鍵前的便利貼') && (await curTool()) === 'select', {notes:await anns(0, 'Text'), tool:await curTool()});
const ink0 = (await anns(0, 'Ink')).length;
await tool('pen'); await drag(await see(0, 100, 100), await P(0, 160, 140));
await rclick(await blank()); await win.waitForTimeout(800);
check('畫筆: the stroke is kept', (await anns(0, 'Ink')).length === ink0 + 1 && (await curTool()) === 'select', (await anns(0, 'Ink')).length);
const pg0 = (await anns(0, 'Polygon')).length;
await tool('polygon'); for (const [x, y] of [[100, 200], [170, 200], [135, 260]]) await click(await see(0, x, y));
await rclick(await blank()); await win.waitForTimeout(800);
check('多邊形 with 3 points, then a right-click: drawn, back to 選取', (await anns(0, 'Polygon')).length === pg0 + 1 && (await curTool()) === 'select', (await anns(0, 'Polygon')).length);
await tool('polygon'); await click(await see(0, 300, 500));
await rclick(await blank()); await win.waitForTimeout(500);
check('多邊形 with 1 point, then a right-click: nothing drawn, no error message', (await anns(0, 'Polygon')).length === pg0 + 1 && !(await A(() => !!document.querySelector('#toasts .toast.err'))) && (await curTool()) === 'select');
const all0 = (await anns(0)).length;
await tool('fill'); await win.click('#hint [data-s="mode"][data-v="nodes"]'); await win.waitForTimeout(300);
for (const [x, y] of [[400, 100], [480, 100], [440, 160]]) await click(await see(0, x, y));
await rclick(await blank()); await win.waitForTimeout(1000);
check('填色 by nodes with 3 nodes, then a right-click: filled, back to 選取', (await anns(0)).length === all0 + 1 && (await curTool()) === 'select', {before:all0, after:(await anns(0)).length});
await tool('ocr'); await drag(await see(0, 60, 60), await P(0, 420, 130)); await win.waitForTimeout(1500);
const ocrOpen = await A(() => !!document.querySelector('#ocrPanel'));
await rclick(await blank());
check('文字辨識 with its results open, then a right-click: the results close, back to 選取', ocrOpen && !(await A(() => !!document.querySelector('#ocrPanel'))) && (await curTool()) === 'select', {ocrOpen, tool:await curTool()});
// between the pages, the thumbnails, a note
const gap = await A(() => { const S = window.__pdfapp.S, a = S.els[0].getBoundingClientRect(), b = S.els[1].getBoundingClientRect(); return [a.left + a.width / 2, (a.bottom + b.top) / 2]; });
await A(() => { const vw = document.querySelector('#viewer'), S = window.__pdfapp.S, a = S.els[0].getBoundingClientRect(), vr = vw.getBoundingClientRect(); vw.scrollTop += a.bottom - (vr.top + vr.height / 2); });
await win.waitForTimeout(300);
const gap2 = await A(() => { const S = window.__pdfapp.S, a = S.els[0].getBoundingClientRect(), b = S.els[1].getBoundingClientRect(); return [a.left + a.width / 2, (a.bottom + b.top) / 2]; });
const onGap = await A(([x, y]) => { const e = document.elementFromPoint(x, y); return !!e && !e.closest('.page') && !!e.closest('#viewer'); }, gap2);
await tool('pen'); await rclick(gap2);
check('between two pages: a right-click goes back to 選取', onGap && (await curTool()) === 'select', {onGap, gap, gap2, tool:await curTool()});
await win.click('.thumb[data-i="0"]', {button:'right'}); await win.waitForTimeout(400);
check('the thumbnails keep the page menu', ((await menu()) || []).includes('del'), await menu());
await win.keyboard.press('Escape'); await win.waitForTimeout(200);
const note = (await anns(0, 'Text')).find(a => a.contents === '右鍵前的便利貼');
await tool('pen'); await rclick(await see(0, note.x + note.w / 2, note.y + note.h / 2));
check('a note keeps its own menu', ((await menu()) || []).includes('edit'), await menu());
await win.keyboard.press('Escape'); await win.waitForTimeout(200);


// ---- part 2: a right-click on an object selects it -----------------------------------------------------------------------
const sq = (await anns(0, 'Square'))[0], onSq = () => see(0, sq.x + 4, sq.y + sq.h / 2);
await tool('pen'); await rclick(await onSq());
const s1 = await A(() => window.__pdfapp.sel());
check('畫筆: a right-click on a rectangle goes back to 選取 and selects it', (await curTool()) === 'select' && s1?.id === sq.id && (await menu()) === null, {tool:await curTool(), s1});
const poly = (await anns(0, 'Polygon'))[0];
await click(await see(0, poly.x + poly.w / 2, poly.y + poly.h * 0.6));
const s2a = await A(() => window.__pdfapp.sel());
await rclick(await onSq());
const s2 = await A(() => window.__pdfapp.sel());
check('選取 with another object selected: a right-click on the rectangle selects it', s2a?.id === poly.id && s2?.id === sq.id, {s2a, s2});
const barXY = await A(() => { const b = document.querySelector('.abar'); if (!b) return null; const r = b.getBoundingClientRect(); return [r.left + 6, r.top + r.height / 2]; });
if (barXY) await rclick(barXY);
check('a right-click on the bar beside the selection: still selected, no menu', !!barXY && (await A(() => window.__pdfapp.sel()))?.id === sq.id && (await menu()) === null, {barXY, sel:await A(() => window.__pdfapp.sel())});

console.log(failed ? `\n${failed} check(s) failed` : '\nall checks passed');
await app.evaluate(({app}) => app.exit(0)).catch(() => {});   // unsaved changes: no asking
