// 文字方塊選字型: the system fonts are listed (Chinese names read from the font files, cached), a text box run can
// carry a font, and the font menu in the format bar picks one.
import { launch, TMP, ROOT } from './_env.mjs';
import fs from 'fs';
import path from 'path';

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
// the saved rich text of the box holding `txt` (waits for the save to land)
const rtOf = async txt => { const t0 = Date.now(); for (;;) { const r = (await rts()).find(x => x.rt.lines.flat().map(r => r.text).join('').includes(txt));
  if (r) { if (Date.now() - t0 > 300) console.log(`   (box "${txt}" saved after ${Date.now() - t0} ms more)`); return r.rt; } if (Date.now() - t0 > 10000) return null; await win.waitForTimeout(250); } };
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

// ---- part 3: the font menu ---------------------------------------------------------------------
await app.evaluate(({app}) => app.exit(0)).catch(() => {});
({ app, win, A } = await open('font3.pdf'));
await win.click('[data-view="single"]'); await win.waitForTimeout(500);
await win.click('[data-tool="textbox"]'); await win.waitForTimeout(400);
await A(() => window.__pdfapp.fontReady());
// what the open menu shows: section titles in order, and for each family button its section, label and whether it is visible
const menu = () => A(() => {
  const m = document.querySelector('#fontMenu'); if (!m || getComputedStyle(m).display === 'none') return null;   // (a fixed element has no offsetParent)
  let sec = ''; const items = [], secs = [];
  for (const el of m.querySelectorAll('.fm-sec, .fm-it')) {
    if (el.classList.contains('fm-sec')) { if (!el.hidden) secs.push(el.textContent.trim()); sec = el.textContent.trim(); continue; }
    items.push({f:el.dataset.f, label:el.textContent.trim(), sec, shown:!el.hidden && el.offsetParent !== null});
  }
  return {secs, items, none:(m.querySelector('.fm-none') || {}).textContent || ''};
});
const fontBtn = () => A(() => { const b = document.querySelector('#hint [data-tbfont]'); return b ? b.textContent.trim() : null; });
await clickAt(60, 585); await win.keyboard.type('中文 Latin');
for (let k = 0; k < 5; k++) await win.keyboard.press('Shift+ArrowLeft');
await win.click('#hint [data-tbfont]'); await win.waitForTimeout(300);
let m = await menu();
check('menu opens', !!m, m && m.secs);
check('sections in order', !!m && JSON.stringify(m.secs) === JSON.stringify(['預設', '中文字型', '其他字型']), m && m.secs);
const wq = m && m.items.find(x => x.f === 'WenQuanYi Zen Hei');
check('Chinese name, Chinese section', !!wq && wq.label === '文泉驛正黑' && wq.sec === '中文字型', wq);
check('default item', !!m && m.items[0].f === '' && m.items[0].label === '思源黑體', m && m.items[0]);
await win.screenshot({path:TMP + '/font_menu.png'});
await win.fill('#fontMenu .fm-q', '文泉'); await win.waitForTimeout(200);
m = await menu(); let shown = m.items.filter(x => x.shown);
check('search by Chinese name', shown.length >= 1 && shown.every(x => /^WenQuanYi/.test(x.f)), shown.map(x => x.label));
await win.fill('#fontMenu .fm-q', 'dejavu serif'); await win.waitForTimeout(200);
m = await menu(); shown = m.items.filter(x => x.shown);
check('search by English name', shown.some(x => x.f === 'DejaVu Serif'), shown.map(x => x.label));
await win.click('#fontMenu .fm-it[data-f="DejaVu Serif"]'); await win.waitForTimeout(300);
check('picking closes the menu, editor stays', !(await menu()) && !!(await A(() => window.__pdfapp.TBE())));
check('button shows the font', /DejaVu Serif/.test(await fontBtn() || ''), await fontBtn());
await commit();
const r5 = runs(await rtOf('Latin'));
check('UI: only the highlighted text', same(r5, [['中文 ', ''], ['Latin', 'DejaVu Serif']]), r5);
// 最近用過 lists only fonts this computer has
await A(() => localStorage.setItem('pdfeditor.fonts.recent.v1', JSON.stringify(['No Such Font 123', 'DejaVu Serif'])));
await clickAt(330, 585); await win.click('#hint [data-tbfont]'); await win.waitForTimeout(300);
m = await menu();
check('recent: installed fonts only', !!m && JSON.stringify(m.items.filter(x => x.sec === '最近用過').map(x => x.f)) === JSON.stringify(['DejaVu Serif']), m && m.items.filter(x => x.sec === '最近用過'));
await win.keyboard.press('Escape'); await win.waitForTimeout(200);
check('Esc closes the menu only', !(await menu()) && !!(await A(() => window.__pdfapp.TBE())));
await win.keyboard.type('R'); await commit();
// a font this computer does not have: named as missing, kept when saved again
await clickAt(60, 770); await win.keyboard.type('Missing'); await win.keyboard.press('Shift+Home'); await fmt('font', 'No Such Font 123'); await commit();
await clickAt(66, 777); await win.keyboard.press('End'); await win.keyboard.press('ArrowLeft'); await win.waitForTimeout(250);
check('missing font named', await fontBtn() === 'No Such Font 123（這台電腦沒有）', await fontBtn());
await commit();
check('missing font kept', same(runs(await rtOf('Missing')), [['Missing', 'No Such Font 123']]), runs(await rtOf('Missing')));
// right-click menu
await clickAt(440, 660); await win.keyboard.type('ctx'); await win.waitForTimeout(150);
const tb = await win.locator('.tbed').boundingBox();
await win.mouse.click(tb.x + tb.width / 2, tb.y + tb.height / 2, {button:'right'}); await win.waitForTimeout(250);
check('right-click menu has 字型…', await A(() => [...document.querySelectorAll('#ctx button')].some(b => b.textContent.trim().endsWith('字型…'))));
await win.click('#ctx button[data-font]'); await win.waitForTimeout(300);
check('字型… opens the font menu', !!(await menu()));
await win.keyboard.press('Escape'); await win.waitForTimeout(150); await commit();
// the PDF's own text: no font control
p = await at('A test document'); await win.waitForTimeout(250); await win.mouse.click(p.x, p.y); await win.waitForTimeout(800);
check('page text: no font button', await A(() => !!document.querySelector('.tbed.real')) && await fontBtn() === null);
const tr = await win.locator('.tbed').boundingBox();
await win.mouse.click(tr.x + 10, tr.y + tr.height / 2, {button:'right'}); await win.waitForTimeout(250);
check('page text: no 字型… in the right-click menu', await A(() => document.querySelectorAll('#ctx button').length > 3 && ![...document.querySelectorAll('#ctx button')].some(b => b.textContent.trim().endsWith('字型…'))));
await win.keyboard.press('Escape'); await win.waitForTimeout(150); await win.keyboard.press('Escape'); await win.waitForTimeout(2000);
// 600 families: opening and searching stay quick
await A(() => window.__pdfapp.fontCatFake(600));
const t = await A(async () => {
  const t0 = performance.now(); document.querySelector('#hint [data-tbfont]').click(); const m = document.querySelector('#fontMenu'); m.offsetHeight; const open = performance.now() - t0;
  const q = m.querySelector('.fm-q'), t1 = performance.now(); q.value = 'Fake Font 5'; q.dispatchEvent(new Event('input')); m.offsetHeight; const search = performance.now() - t1;
  return {open:Math.round(open), search:Math.round(search), items:m.querySelectorAll('.fm-it').length, shown:[...m.querySelectorAll('.fm-it')].filter(b => !b.hidden).length};
});
check('600 fonts: open < 300 ms, search < 300 ms', t.open < 300 && t.search < 300 && t.items >= 600 && t.shown >= 100, t);
await win.keyboard.press('Escape'); await win.waitForTimeout(150);
// no system fonts at all
await A(() => window.__pdfapp.fontCatFake(0, false));
await win.click('#hint [data-tbfont]'); await win.waitForTimeout(250);
m = await menu();
check('no fonts: default only, with a note', !!m && m.items.length === 1 && m.items[0].f === '' && m.none === '讀不到這台電腦的字型', m);
await win.keyboard.press('Escape'); await win.waitForTimeout(150);
await A(() => window.__pdfapp.fontCatReload());
// dark theme look
await A(() => window.__pdfapp.setTheme('dark')); await clickAt(330, 640); await win.click('#hint [data-tbfont]'); await win.waitForTimeout(400);
await win.screenshot({path:TMP + '/font_menu_dark.png'});
await win.keyboard.press('Escape'); await win.keyboard.press('Escape'); await A(() => window.__pdfapp.setTheme('system'));
console.log('   screenshots in', TMP);

// ---- part 4: what the branch review found --------------------------------------------------------
// reading the font files: single .ttf files (not only collections), a collection whose PostScript name does not
// match, the Chinese name before an English-only typographic name, and an unreadable file (no result, so not cached)
const an = (family, ps, file) => A(a => window.__pdfapp.fontAnalyse(a), {family, ps, b64:fs.readFileSync(file).toString('base64')});
let fr = await an('Noto Sans TC', 'NotoSansTC-Regular', path.join(ROOT, 'app/fonts/NotoSansTC-Regular.ttf'));
check('single .ttf: a Chinese font is read', !!fr && fr.cjk === true && fr.name === 'Noto Sans TC', fr);
fr = await an('DejaVu Serif', 'DejaVuSerif', '/usr/share/fonts/truetype/dejavu/DejaVuSerif.ttf');
check('single .ttf: a Latin font is read', !!fr && fr.cjk === false && fr.name === 'DejaVu Serif', fr);
fr = await an('WenQuanYi Zen Hei Mono', 'NoSuchPostScriptName', '/usr/share/fonts/truetype/wqy/wqy-zenhei.ttc');
check('collection: the face is found by its family', !!fr && fr.name === '文泉驛等寬正黑' && fr.cjk === true, fr);
fr = await an('PDFE Name Test', 'PDFENameTest-Regular', path.join(ROOT, 'tests/e2e/fixtures/name-order.ttf'));
check('the Chinese family name wins over an English-only typographic name', !!fr && fr.name === '名稱測試黑體' && fr.cjk === true, fr);
fr = await A(() => window.__pdfapp.fontAnalyse({family:'Broken', ps:'Broken', b64:btoa('this is not a font file')}));
check('an unreadable file gives no result', fr === null, fr);
// a default font must not rewrite an old box that is merely opened again
await clickAt(60, 700); await win.keyboard.type('Old box'); await commit();
await fmt('font', 'DejaVu Serif');
await clickAt(66, 707); await win.waitForTimeout(300);
check('(the old box is open)', /Old box/.test(await A(() => (window.__pdfapp.TBE() || {}).html || '')));
await commit();
check('re-opening an old box keeps its font', same(runs(await rtOf('Old box')), [['Old box', '']]), runs(await rtOf('Old box')));
await fmt('font', '');
// the same for bold: a bold default must not make an old box bold
await clickAt(440, 612); await win.keyboard.type('Plain box'); await commit();
await fmt('bold', true);
await clickAt(446, 619); await win.waitForTimeout(300);
check('(the plain box is open)', /Plain box/.test(await A(() => (window.__pdfapp.TBE() || {}).html || '')));
await commit();
const pb = await rtOf('Plain box');
check('re-opening an old box keeps it not bold', !!pb && pb.lines.flat().every(r => !r.bold), pb && pb.lines);
await fmt('bold', false);
// while the fonts are still being read the open menu stays still and clicks land
await A(() => window.__pdfapp.fontCatBusySim(5000));
await win.click('#hint [data-tbfont]'); await win.waitForTimeout(300);
const ib = await win.locator('#fontMenu .fm-it[data-f="DejaVu Serif"]').first().boundingBox();
const steady = await A(({x, y}) => { const a = document.elementFromPoint(x, y); return new Promise(r => setTimeout(() => r(!!a && a === document.elementFromPoint(x, y)), 400)); }, {x:ib.x + ib.width / 2, y:ib.y + ib.height / 2});
check('menu items stay put while fonts are read', steady);
check('progress shown', /正在讀取字型/.test(await A(() => (document.querySelector('#fontMenu .fm-busy') || {}).textContent || '')));
await win.mouse.move(ib.x + ib.width / 2, ib.y + ib.height / 2); await win.mouse.down(); await win.waitForTimeout(150); await win.mouse.up(); await win.waitForTimeout(300);
check('a click during reading picks the font', !(await menu()) && await A(() => JSON.parse(localStorage.getItem('pdfeditor.textbox.v1')).font) === 'DejaVu Serif');
await fmt('font', ''); await win.waitForTimeout(5000);
// a failed font listing is tried again the next time
const retry = await A(async () => {
  const app = window.__pdfapp, orig = window.queryLocalFonts;
  window.queryLocalFonts = () => Promise.reject(new Error('blocked'));
  await app.fontCatReload(); const first = app.fontCat().ok;
  window.queryLocalFonts = orig; await app.fontLoad(); const second = app.fontCat().ok;
  return {first, second};
});
check('a failed font listing is tried again', retry.first === false && retry.second === true, retry);

// ---- end --------------------------------------------------------------------------------------
console.log(failed ? `${failed} check(s) failed` : 'all checks passed');
await app.evaluate(({app}) => app.exit(0)).catch(() => {});
