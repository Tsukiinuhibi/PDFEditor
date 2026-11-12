// 文字方塊選字型: the system fonts are listed (Chinese names read from the font files, cached), a text box run can
// carry a font, and the font menu in the format bar picks one.
import { launch, TMP } from './_env.mjs';

let failed = 0;
const check = (name, ok, detail = '') => { console.log(`${ok ? '✔' : '✘'} ${name}${detail !== '' ? '  ' + (typeof detail === 'string' ? detail : JSON.stringify(detail)) : ''}`); if (!ok) { failed++; process.exitCode = 1; } };
const open = async name => {
  const { app } = await launch(name);
  const win = await app.firstWindow(); win.on('pageerror', e => console.log('PAGEERR', e.message)); win.on('console', m => { if (m.type() === 'error') console.log('C', m.text().slice(0, 300)); });
  await win.waitForTimeout(3000);
  return { app, win, A:win.evaluate.bind(win) };
};

// ---- part 1: the font catalogue -------------------------------------------------------------
let { app, win, A } = await open('font1.pdf');
await A(() => window.__pdfapp.fontReady());
const cat = await A(() => window.__pdfapp.fontCat());
const wqy = cat.fams.find(f => f.family === 'WenQuanYi Zen Hei'), dv = cat.fams.find(f => f.family === 'DejaVu Serif');
check('catalog ok', cat.ok === true && cat.fams.length >= 10, cat.fams.length);
check('zh name from .ttc', !!wqy && wqy.name === '文泉驛正黑' && wqy.cjk === true, wqy);
check('latin font', !!dv && dv.name === 'DejaVu Serif' && dv.cjk === false, dv);
check('cache written', await A(() => Object.keys(JSON.parse(localStorage.getItem('pdfeditor.fontcat.v1') || '{}')).length) >= cat.fams.length);
await app.close();

// the same profile again: the names come from the cache straight away
({ app, win, A } = await open('font2.pdf'));
const cat2 = await A(async () => { await window.__pdfapp.fontLoad(); return window.__pdfapp.fontCat(); });
const wqy2 = cat2.fams.find(f => f.family === 'WenQuanYi Zen Hei');
check('cache used on 2nd launch', !!wqy2 && wqy2.name === '文泉驛正黑' && wqy2.cjk === true, wqy2);

// ---- part 2: a text box run carries a font ----------------------------------------------------
await win.click('[data-view="single"]'); await win.waitForTimeout(500);
await win.click('[data-tool="textbox"]'); await win.waitForTimeout(400);
// screen point of a page-view point (pt, from the page's top-left), scrolled into view first
const pt = (x, y) => A(({x, y}) => { const app = window.__pdfapp, vw = document.querySelector('#viewer'), vr = vw.getBoundingClientRect(); let e = app.S.els[0].getBoundingClientRect();
  vw.scrollTop += e.top + y * app.S.scale - (vr.top + vr.height / 2); e = app.S.els[0].getBoundingClientRect(); return {x:e.left + x * app.S.scale, y:e.top + y * app.S.scale}; }, {x, y});
const clickAt = async (x, y) => { const p = await pt(x, y); await win.waitForTimeout(250); await win.mouse.click(p.x, p.y); await win.waitForTimeout(500); };
const commit = async () => { await win.keyboard.press('Escape'); await win.waitForTimeout(2500); };
const rts = () => A(() => window.__pdfapp.tbRT(0));
const rtOf = async txt => { const r = (await rts()).find(x => x.rt.lines.flat().map(r => r.text).join('').includes(txt)); return r && r.rt; };
const runs = rt => rt ? rt.lines.flat().map(r => [r.text, r.font || '']) : null;
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const fmt = (k, v) => A(([k, v]) => window.__pdfapp.applyTextFormat(k, v), [k, v]);

// only the highlighted text changes
await clickAt(60, 585); await win.keyboard.type('你好世界 Hello');
for (let k = 0; k < 5; k++) await win.keyboard.press('Shift+ArrowLeft');
await fmt('font', 'DejaVu Serif'); await commit();
const r1 = runs(await rtOf('Hello'));
check('only the selection', same(r1, [['你好世界 ', ''], ['Hello', 'DejaVu Serif']]), r1);
// the appearance is drawn with the font: the same text all in the default font looks different
await clickAt(330, 585); await win.keyboard.type('你好世界 Hello'); await commit();
const diff = await A(async () => {
  const app = window.__pdfapp, ff = (await app.getAnns(0)).filter(a => a.subtype === 'FreeText' && /Hello/.test(a.contents));
  if (ff.length < 2) return 'need two boxes, got ' + ff.length;
  const px = async a => { const c = await app.renderRegion(0, {x:a.x, y:a.y, w:a.w, h:a.h}, 2); return {w:c.width, h:c.height, d:c.getContext('2d').getImageData(0, 0, c.width, c.height).data}; };
  const [a, b] = await Promise.all(ff.slice(0, 2).map(px)), w = Math.min(a.w, b.w), h = Math.min(a.h, b.h);
  let n = 0; for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const i = (y * a.w + x) * 4, j = (y * b.w + x) * 4; if (Math.abs(a.d[i] - b.d[j]) + Math.abs(a.d[i + 1] - b.d[j + 1]) + Math.abs(a.d[i + 2] - b.d[j + 2]) > 60) n++; }
  return {sizes:[a.w, a.h, b.w, b.h], differing:n};
});
check('appearance uses the font', typeof diff === 'object' && diff.differing > 50, diff);
// editing it again keeps the font; the caret inside "Hello" reports it
await clickAt(70, 592);
const html = await A(() => (window.__pdfapp.TBE() || {}).html || '');
check('re-edit keeps the font', /font-family/.test(html) && /DejaVu Serif/.test(html), html.slice(0, 160));
await win.keyboard.press('End'); await win.keyboard.press('ArrowLeft'); await win.keyboard.press('ArrowLeft'); await win.waitForTimeout(200);
check('caret reports the font', await A(() => window.__pdfapp.tbStyle().font) === 'DejaVu Serif', await A(() => window.__pdfapp.tbStyle().font));
await commit();
// a family name with quotes, a comma and a backslash comes back exactly
const ODD = 'Font "X", Y\\Z';
await clickAt(60, 770); await win.keyboard.type('Odd name');
await win.keyboard.press('Shift+Home'); await fmt('font', ODD); await commit();
const r3 = runs(await rtOf('Odd name'));
check('odd family name round-trips', same(r3, [['Odd name', ODD]]), r3);
// caret in the middle, nothing highlighted: what is typed next takes the font
await clickAt(440, 660); await win.keyboard.type('你好世界');
await win.keyboard.press('Home'); await win.keyboard.press('ArrowRight'); await win.keyboard.press('ArrowRight');
await fmt('font', 'DejaVu Serif'); await win.keyboard.type('AB'); await commit();
const r4 = runs(await rtOf('AB'));
check('caret only: new text takes the font', same(r4, [['你好', ''], ['AB', 'DejaVu Serif'], ['世界', '']]), r4);
// nothing highlighted in an empty box: the whole box, and the default for new boxes
await clickAt(440, 785); await fmt('font', 'DejaVu Serif'); await win.keyboard.type('Def'); await commit();
check('empty box takes the font', same(runs(await rtOf('Def')), [['Def', 'DejaVu Serif']]), runs(await rtOf('Def')));
check('saved as the default', await A(() => JSON.parse(localStorage.getItem('pdfeditor.textbox.v1')).font) === 'DejaVu Serif');
await clickAt(60, 700); await win.keyboard.type('New'); await commit();
check('new box uses the default', same(runs(await rtOf('New')), [['New', 'DejaVu Serif']]), runs(await rtOf('New')));
// editing the PDF's own text never records a system font, even with one as the default
const at = str => A(async str => { const app = window.__pdfapp, pg = app.S.pages[0], tc = await pg.page.getTextContent(), it = tc.items.find(i => i.str.includes(str)); if (!it) return null;
  const vw = document.querySelector('#viewer'), vr = vw.getBoundingClientRect();
  const [x, y] = pg.vp1.convertToViewportPoint(it.transform[4] + Math.min(it.width / 2, 40), it.transform[5] + Math.abs(it.transform[3]) * .3);
  let r = app.S.els[0].getBoundingClientRect(); vw.scrollTop += r.top + y * app.S.scale - (vr.top + vr.height / 2); r = app.S.els[0].getBoundingClientRect();
  return {x:r.left + x * app.S.scale, y:r.top + y * app.S.scale}; }, str);
let p = await at('Sample Report'); await win.waitForTimeout(250); await win.mouse.click(p.x, p.y); await win.waitForTimeout(800);
check('editing page text', await A(() => !!document.querySelector('.tbed.real')));
await win.keyboard.press('End'); await win.keyboard.type('X'); await commit();
const realRuns = await A(async () => {
  const d = await PDFLib.PDFDocument.load(window.__pdfapp.S.bytes, {ignoreEncryption:true}), P = d.getPage(0).node.Resources().lookup(PDFLib.PDFName.of('Properties'));
  const out = []; if (P) P.keys().forEach(k => { const rt = P.lookup(k).lookupMaybe(PDFLib.PDFName.of('PDFE_RT'), PDFLib.PDFHexString, PDFLib.PDFString); if (rt) out.push(...JSON.parse(rt.decodeText()).lines.flat().map(r => [r.text, r.font || ''])); });
  return out;
});
check('page text has no font', realRuns.length > 0 && realRuns.every(r => r[1] === ''), realRuns);
await fmt('font', '');
check('default restored', await A(() => JSON.parse(localStorage.getItem('pdfeditor.textbox.v1')).font) === '');

// ---- end --------------------------------------------------------------------------------------
console.log(failed ? `${failed} check(s) failed` : 'all checks passed');
await app.evaluate(({app}) => app.exit(0)).catch(() => {});
