// 排列頁面: right-click a thumbnail → 展開所有頁面 shows every page in a grid; drag pages to a new place (labels show
// the new number and the old one), reset, cancel, or apply; the pages (and their annotations) move; undo restores.
import { launchPath, TMP } from './_env.mjs';
import { createRequire } from 'module';
import path from 'path';
import fs from 'fs';
const require = createRequire(import.meta.url);
const { PDFDocument, StandardFonts, PDFName, PDFString } = require('pdf-lib');

let failed = 0;
const check = (name, ok, detail = '') => { console.log(`${ok ? '✔' : '✘'} ${name}${detail !== '' ? '  ' + (typeof detail === 'string' ? detail : JSON.stringify(detail)) : ''}`); if (!ok) { failed++; process.exitCode = 1; } };

// 24 pages, each says which it is; page 1 carries a note annotation
const N = 24, doc = await PDFDocument.create(), font = await doc.embedFont(StandardFonts.Helvetica);
for (let k = 1; k <= N; k++) { const p = doc.addPage([400, 560]); p.drawText('P' + k, {x:40, y:480, size:60, font}); }
const pg1 = doc.getPage(0), note = doc.context.register(doc.context.obj({Type:'Annot', Subtype:'Square', Rect:[40, 40, 140, 140], Contents:PDFString.of('mark-P1'), C:[1, 0, 0], F:4}));
pg1.node.set(PDFName.of('Annots'), doc.context.obj([note]));
const file = path.join(TMP, 'arrange.pdf'); fs.writeFileSync(file, await doc.save());

const { app } = await launchPath(file);
const win = await app.firstWindow(); win.on('pageerror', e => console.log('PAGEERR', e.message)); win.on('console', m => { if (m.type() === 'error') console.log('C', m.text().slice(0, 300)); });
await win.waitForTimeout(3500);
const A = win.evaluate.bind(win);
const order = () => A(async () => { const out = []; for (const pg of window.__pdfapp.S.pages) { const tc = await pg.page.getTextContent(); out.push(tc.items.map(i => i.str).join('').trim()); } return out; });
const annsOf = i => A(async i => (await window.__pdfapp.getAnns(i)).map(a => a.contents), i);
const labels = () => A(() => [...document.querySelectorAll('#arGrid .ar-pg')].map(c => c.querySelector('.lb').textContent + (c.classList.contains('moved') ? '*' : '')));
const openArrange = async () => {
  await win.click('#p-thumbs .thumb[data-i="0"]', {button:'right'}); await win.waitForTimeout(300);
  await win.click('#ctx button[data-c="arrange"]'); await win.waitForTimeout(800);
};
// drag the card showing original page `from` (1-based) so it lands just after the card showing original page `after`
const dragAfter = async (from, after) => {
  const a = await win.locator(`#arGrid .ar-pg[data-i="${from - 1}"]`).boundingBox();
  const t = await win.locator(`#arGrid .ar-pg[data-i="${after - 1}"]`); await t.scrollIntoViewIfNeeded(); const b = await t.boundingBox();
  const a2 = await win.locator(`#arGrid .ar-pg[data-i="${from - 1}"]`).boundingBox();
  await win.mouse.move(a2.x + a2.width / 2, a2.y + a2.height / 2); await win.mouse.down();
  await win.mouse.move(b.x + b.width * .8, b.y + b.height / 2, {steps:12}); await win.waitForTimeout(150);
  await win.mouse.up(); await win.waitForTimeout(300);
};
const before = await order();
check('fixture', before.length === N && before[0] === 'P1' && before[23] === 'P24', before.slice(0, 4));

// open: every page, in a grid of several rows, numbered
await openArrange();
let lb = await labels();
check('menu opens the grid with every page', lb.length === N && lb[0] === '第 1 頁' && lb[23] === '第 24 頁', lb.slice(0, 3));
const rows = await A(() => new Set([...document.querySelectorAll('#arGrid .ar-pg')].map(c => Math.round(c.getBoundingClientRect().top))).size);
check('pages wrap onto several rows', rows >= 2, rows);
await win.screenshot({path:TMP + '/arrange_open.png'});

// drag page 1 after page 3: 2, 3, 1, 4 …
await dragAfter(1, 3);
lb = await labels();
check('labels after a drag', JSON.stringify(lb.slice(0, 4)) === JSON.stringify(['第 1 頁（原 2）*', '第 2 頁（原 3）*', '第 3 頁（原 1）*', '第 4 頁']), lb.slice(0, 4));
check('summary counts the moved pages', /已調整\s*3\s*頁/.test(await A(() => document.querySelector('#arSum').textContent)), await A(() => document.querySelector('#arSum').textContent));
// across rows: page 24 to the very front (after nothing → before page 2's new spot is not needed; drop it after page 20 instead)
await dragAfter(24, 20);
lb = await labels();
check('drag to another row', lb[20] === '第 21 頁（原 24）*' && lb[21] === '第 22 頁（原 21）*', lb.slice(19, 24));
await win.screenshot({path:TMP + '/arrange_moved.png'});
// 還原原本順序
await win.click('#arReset'); await win.waitForTimeout(300);
lb = await labels();
check('reset restores the order', lb.every((t, k) => t === `第 ${k + 1} 頁`), lb.slice(0, 4));
// cancel changes nothing
await dragAfter(1, 3); await win.click('.modal button:has-text("取消")'); await win.waitForTimeout(800);
check('cancel leaves the document alone', JSON.stringify(await order()) === JSON.stringify(before));

// apply: the pages move, the annotation goes with page 1
await openArrange(); await dragAfter(1, 3); await dragAfter(24, 20);
await win.click('#arOk'); await win.waitForTimeout(3000);
const after = await order();
const want = ['P2', 'P3', 'P1', ...Array.from({length:17}, (_, k) => 'P' + (k + 4)), 'P24', 'P21', 'P22', 'P23'];
check('applied order', JSON.stringify(after) === JSON.stringify(want), after.join(','));
check('the annotation moved with its page', JSON.stringify(await annsOf(2)) === JSON.stringify(['mark-P1']) && (await annsOf(0)).length === 0, [await annsOf(0), await annsOf(2)]);
check('thumbnails renumbered', await A(() => [...document.querySelectorAll('#p-thumbs .thumb .tn')].slice(0, 3).map(t => t.textContent).join(',')) === '1,2,3');
// undo restores the old order
await win.click('#bUndo'); await win.waitForTimeout(3000);
check('undo restores', JSON.stringify(await order()) === JSON.stringify(before));

console.log(failed ? `${failed} check(s) failed` : 'all checks passed');
await app.evaluate(({app}) => app.exit(0)).catch(() => {});
