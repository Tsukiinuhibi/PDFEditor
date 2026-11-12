// A PDF whose layers are nested (a parent layer with children, and a named group) keeps that structure:
// the panel shows it as a tree, groups hide/show together, layers can be dragged into and out of groups,
// and every edit writes the nesting back into /OCProperties /D /Order.
import { launchPath, TMP } from './_env.mjs';
import { createRequire } from 'module';
import path from 'path';
import fs from 'fs';
const require = createRequire(import.meta.url);
const { PDFDocument, PDFName, PDFHexString } = require('pdf-lib');

// --- build the test file: A [A1 A2] ("背景組" B C) D, one coloured square per layer ---
const doc = await PDFDocument.create(), page = doc.addPage([595, 842]), ctx = doc.context;
const names = ['A', 'A1', 'A2', 'B', 'C', 'D'], cols = [[1, 0, 0], [0, .6, 0], [0, 0, 1], [1, .8, 0], [.5, 0, .5], [.4, .4, .4]], ocg = {};
names.forEach((n, k) => {
  ocg[n] = ctx.register(ctx.obj({Type:'OCG', Name:PDFHexString.fromText(n)}));
  const x = 60 + (k % 3) * 170, y = 600 - Math.floor(k / 3) * 170, ap = ctx.register(ctx.stream(`${cols[k].join(' ')} rg 0 0 120 120 re f`, {Type:'XObject', Subtype:'Form', BBox:[0, 0, 120, 120]}));
  const a = ctx.register(ctx.obj({Type:'Annot', Subtype:'Square', Rect:[x, y, x + 120, y + 120], C:cols[k], IC:cols[k], F:4, OC:ocg[n], AP:{N:ap}, Contents:PDFHexString.fromText(n)}));
  let annots = page.node.lookupMaybe(PDFName.of('Annots'), require('pdf-lib').PDFArray); if (!annots) { annots = ctx.obj([]); page.node.set(PDFName.of('Annots'), annots); }
  annots.push(a);
});
doc.catalog.set(PDFName.of('OCProperties'), ctx.obj({OCGs:names.map(n => ocg[n]), D:{Order:[ocg.A, [ocg.A1, ocg.A2], [PDFHexString.fromText('背景組'), ocg.B, ocg.C], ocg.D], ON:names.map(n => ocg[n]), OFF:[]}}));
const file = path.join(TMP, 'nested.pdf'); fs.writeFileSync(file, await doc.save());

const { app } = await launchPath(file);
const win = await app.firstWindow(); win.on('pageerror', e => console.log('PAGEERR', e.message)); win.on('console', m => { if (m.type() === 'error') console.log('CERR', m.text().slice(0, 300)); });
await win.waitForTimeout(3500);
await win.click('[data-view="single"]'); await win.waitForTimeout(500);
await win.click('[data-act="layers"]'); await win.waitForTimeout(1000);
const A = win.evaluate.bind(win);
// the panel as text: indentation by depth, (name) for a group, ~ hidden, # locked, * current
const rows = () => A(() => [...document.querySelectorAll('#p-layers .ly-row:not(.base):not(.loose)')].map(r => '  '.repeat(+(r.style.getPropertyValue('--d') || 0)) +
  (r.classList.contains('ly-grp') ? '(' : '') + r.querySelector('.ly-name').textContent + (r.classList.contains('ly-grp') ? ')' : '') +
  (r.classList.contains('off') ? '~' : '') + (r.classList.contains('lk') ? '#' : '') + (r.classList.contains('act') ? '*' : '')).join(' | '));
// /D /Order as written in the file
const order = () => A(async () => {
  const d = await PDFLib.PDFDocument.load(window.__pdfapp.S.bytes, {ignoreEncryption:true}), c = d.context;
  const ocp = d.catalog.lookup(PDFLib.PDFName.of('OCProperties')), D = ocp.lookup(PDFLib.PDFName.of('D'));
  const nm = r => c.lookup(r).lookup(PDFLib.PDFName.of('Name')).decodeText();
  const str = a => a.asArray().map(v => { v = v instanceof PDFLib.PDFRef && c.lookup(v) instanceof PDFLib.PDFArray ? c.lookup(v) : v;
    if (v instanceof PDFLib.PDFArray) return '[' + str(v) + ']'; if (v instanceof PDFLib.PDFRef) return nm(v); return '"' + v.decodeText() + '"'; }).join(' ');
  return str(D.lookup(PDFLib.PDFName.of('Order')));
});
// which squares are drawn (pixel at each square's centre is not white)
const shown = () => A(names => { const c = document.querySelector('.page canvas.pc'), app = window.__pdfapp, k = c.width / app.S.pages[0].w, g = c.getContext('2d');
  return names.filter((n, j) => { const x = 60 + (j % 3) * 170 + 60, y = 842 - (600 - Math.floor(j / 3) * 170 + 60);
    const d = g.getImageData(Math.round(x * k), Math.round(y * k), 1, 1).data; return d[0] + d[1] + d[2] < 700; }).join(' '); }, names);
const row = name => win.locator('#p-layers .ly-row', {has:win.locator(`.ly-name:text-is("${name}")`)}).first();
const log = async label => console.log(label.padEnd(26), await rows(), ' || order:', await order(), ' || drawn:', await shown());

await log('opened');
await row('背景組').locator('.ly-eye').click(); await win.waitForTimeout(2200); await log('group hidden');
await row('背景組').locator('.ly-eye').click(); await win.waitForTimeout(2200); await log('group shown');
await row('A').locator('.ly-eye').click(); await win.waitForTimeout(2200); await log('parent A hidden');
await row('A').locator('.ly-eye').click(); await win.waitForTimeout(2200); await log('parent A shown');
// drag D into the group (middle of the group row)
let tb = await row('背景組').boundingBox();
await row('D').dragTo(row('背景組'), {targetPosition:{x:40, y:tb.height / 2}}); await win.waitForTimeout(2500); await log('D dragged into group');
// drag B to just above A (top edge of A's row): out of the group
tb = await row('A').boundingBox();
await row('B').dragTo(row('A'), {targetPosition:{x:40, y:3}}); await win.waitForTimeout(2500); await log('B dragged above A');
// make C current and press ▲ twice: first above D inside the group, then out of the group
await row('C').locator('.ly-name').click(); await win.waitForTimeout(300);
await win.click('#p-layers [data-ly="up"]'); await win.waitForTimeout(2500); await log('C up');
await win.click('#p-layers [data-ly="up"]'); await win.waitForTimeout(2500); await log('C up again (leaves group)');
// a new layer goes above the current one, inside the same group
await row('D').locator('.ly-name').click(); await win.waitForTimeout(300);
await win.click('#p-layers [data-ly="add"]'); await win.waitForTimeout(2500); await log('new layer above D');
// rename the group
await row('背景組').locator('.ly-name').dblclick(); await win.waitForTimeout(300);
await win.keyboard.press('Control+a'); await win.keyboard.type('新群組'); await win.keyboard.press('Enter'); await win.waitForTimeout(2500); await log('group renamed');
// delete the parent layer A together with its square: its children take its place
await row('A').locator('.ly-name').click(); await win.waitForTimeout(300);
await win.click('#p-layers [data-ly="del"]'); await win.waitForTimeout(600);
await win.locator('.modal button', {hasText:'連同物件一起刪除'}).click(); await win.waitForTimeout(2500); await log('A deleted');
await win.keyboard.press('Control+z'); await win.waitForTimeout(2500); await log('undo');
// ungroup from the context menu
await row('新群組').click({button:'right'}); await win.waitForTimeout(300);
await win.locator('#ctx button[data-m="ungroup"]').click(); await win.waitForTimeout(2500); await log('ungrouped');
await app.evaluate(({app}) => app.exit(0)).catch(() => {});
