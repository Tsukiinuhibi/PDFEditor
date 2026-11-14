// 尋找與取代: Ctrl+F finds text on every page (options: 區分大小寫, 全字相符, 全形＝半形), marks every match and moves
// between them; the 搜尋 tab lists them; scanned pages can be read by OCR (found, not replaced); 取代 / 全部取代 rewrite
// the lines as 修改原文 does, one undo step.
import { launch, launchPath, TMP, ROOT } from './_env.mjs';
import { createRequire } from 'module';
import path from 'path';
import fs from 'fs';
const require = createRequire(import.meta.url);
const { PDFDocument, PDFName, PDFHexString, StandardFonts, degrees } = require('pdf-lib');
const fontkit = require('@pdf-lib/fontkit');

let failed = 0;
const check = (name, ok, detail = '') => { console.log(`${ok ? '✔' : '✘'} ${name}${detail !== '' ? '  ' + (typeof detail === 'string' ? detail : JSON.stringify(detail)) : ''}`); if (!ok) { failed++; process.exitCode = 1; } };

// a scanned page: a picture of text, drawn in the app's own window with the bundled font
let { app } = await launch('find0.pdf');
let win = await app.firstWindow(); await win.waitForTimeout(3000);
const scan = await win.evaluate(async () => {
  await document.fonts.load('400 40px "PDFE Sans"', '掃描頁測試');
  const c = document.createElement('canvas'); c.width = 1240; c.height = 1754; const g = c.getContext('2d');
  g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.fillStyle = '#1a1a1a'; g.font = '64px "PDFE Sans"';
  g.fillText('掃描頁 Hello 測試', 120, 260);
  return c.toDataURL('image/png').split(',')[1];
});
await app.evaluate(({app}) => app.exit(0)).catch(() => {});

// page 1 and 2: real text in 思源黑體 (Chinese, full-width letters); page 3: the scan (no text at all)
const doc = await PDFDocument.create(); doc.registerFontkit(fontkit);
const font = await doc.embedFont(fs.readFileSync(path.join(ROOT, 'app', 'fonts', 'NotoSansTC-Regular.ttf')), {subset:true});
const page = lines => { const p = doc.addPage([595, 842]); lines.forEach(([t, y]) => p.drawText(t, {x:60, y, size:18, font})); };
page([['Hello World 你好世界', 780], ['hello world worldwide', 740], ['ＨＥＬＬＯ 全形字', 700], ['合約金額：100 元', 660]]);
page([['another Hello here', 780], ['World peace', 740], ['a-b a-b end', 700]]);
const p3 = doc.addPage([595, 842]); p3.drawImage(await doc.embedPng(Buffer.from(scan, 'base64')), {x:0, y:0, width:595, height:842});
// page 4 (final review): a blue bold line; one of our own text blocks (bold, red) with two identical lines; an invisible
// text layer (Tr 3) like the one OCR programs put over scans
const bold = await doc.embedFont(fs.readFileSync(path.join(ROOT, 'app', 'fonts', 'NotoSansTC-Bold.ttf')), {subset:true}), Hb = t => bold.encodeText(t).toString();
const p4 = doc.addPage([595, 842]), ctx = doc.context, RUN = {text:'cat sat', size:18, color:'#c92a2a', bg:'', bold:true, italic:false, underline:false};
const ops4 = ['BT 0 0 0.8 rg /F1 18 Tf 60 780 Td', Hb('blue cat'), 'Tj ET',
  '/PDFE_Text /B0 BDC BT 0.788 0.165 0.165 rg /F1 18 Tf 60 700 Td', Hb('cat sat'), 'Tj 0 -26 Td', Hb('cat sat'), 'Tj ET EMC',
  'BT 3 Tr /F1 18 Tf 60 500 Td', Hb('zebra stripes'), 'Tj ET'];
await bold.embed();
p4.node.set(PDFName.of('Resources'), ctx.obj({Font:{F1:bold.ref}, Properties:{B0:{PDFE_RT:PDFHexString.fromText(JSON.stringify({lines:[[RUN], [RUN]], box:{boxBg:'', border:false}})), PDFE_M:[1, 0, 0, 1, 60, 718], PDFE_Size:[120, 52]}}}));
p4.node.set(PDFName.of('Contents'), ctx.register(ctx.flateStream(ops4.join(' '))));
const PDF = path.join(TMP, 'find.pdf'); fs.writeFileSync(PDF, await doc.save());

({ app } = await launchPath(PDF));
win = await app.firstWindow(); win.on('pageerror', e => console.log('PAGEERR', e.message)); win.on('console', m => { if (m.type() === 'error') console.log('C', m.text().slice(0, 300)); });
await win.waitForTimeout(3000);
await win.waitForFunction(() => !!(window.__pdfapp && window.__pdfapp.S.pages.length), null, {timeout:30000});
const Ev = win.evaluate.bind(win);
const st = () => Ev(() => window.__pdfapp.find());
const label = () => Ev(() => (document.querySelector('#findN') || {}).textContent || '');
const marks = () => Ev(() => ({all:document.querySelectorAll('.fhit').length, cur:[...document.querySelectorAll('.fhit.cur')].map(d => +d.closest('.page').dataset.i)}));
const type = async t => { await Ev(() => { const q = document.querySelector('#findQ'); q.select(); }); await win.keyboard.type(t); await win.waitForTimeout(900); };
const opt = async k => { await win.click(`#findBar [data-fo="${k}"]`); await win.waitForTimeout(700); };
const key = async k => { await win.keyboard.press(k); await win.waitForTimeout(500); };

// ---- part 0 (final review): a line on a page not drawn yet keeps its colour and bold when replaced ----------------------
const blocks = i => Ev(i => window.__pdfapp.blockRTs(i), i);
const far = await Ev(() => !window.__pdfapp.S.els[3].querySelector('canvas.pc'));
await win.keyboard.press('Control+f'); await win.waitForTimeout(400);
await Ev(() => { const q = document.querySelector('#findQ'); q.value = 'blue'; q.dispatchEvent(new Event('input', {bubbles:true})); }); await win.waitForTimeout(900);
await win.click('#findBar [data-fa="rep"]'); await Ev(() => { document.querySelector('#findR').value = 'navy'; });
// the search scrolled to page 4 and drew it: take its picture away again, as for a page far from the screen
await Ev(() => { const S = window.__pdfapp.S, c = S.els[3].querySelector('canvas.pc'); if (c) c.remove(); S.st[3].rendered = 0; });
await win.click('#findBar [data-fa="all"]'); await win.waitForTimeout(4500);
const navy = (await blocks(3)).find(b => b && b.lines.some(l => l.map(r => r.text).join('').includes('navy')));
const run0 = navy && navy.lines[0][0], rgb = run0 ? [1, 3, 5].map(k => parseInt(run0.color.slice(k, k + 2), 16)) : [];
check('(final review) page 4, not drawn yet: blue bold 「blue cat」 → 「navy cat」 stays blue and bold', far && !!run0 && rgb[2] > 140 && rgb[0] < 90 && rgb[1] < 90 && run0.bold === true, {far, run0});
await win.click('#findBar [data-fa="rep"]'); await win.waitForTimeout(200);
await win.keyboard.press('Escape'); await win.waitForTimeout(300);

// ---- part 1: the find bar, the options, the marks ----------------------------------------------------------------------
await key('Control+f');
check('Ctrl+F: the find bar, with the focus in its box', await Ev(() => { const b = document.querySelector('#findBar'); return !!b && b.offsetParent !== null && document.activeElement === document.querySelector('#findQ'); }));
await type('hello');
let s = await st(), m = await marks();
check('hello: 「第 1／4 筆」; the matches marked, the current one on page 1', s.n === 4 && (await label()).includes('第 1／4 筆') && m.all >= 3 && JSON.stringify(m.cur) === '[0]', {s, m, label:await label()});
await key('Enter'); await key('Enter'); await key('Enter');
s = await st();
const l4 = await label(), seen = await Ev(() => { const c = document.querySelector('.fhit.cur'), v = document.querySelector('#viewer').getBoundingClientRect(); if (!c) return false; const r = c.getBoundingClientRect(); return r.top >= v.top && r.bottom <= v.bottom; });
check('Enter three times: 第 4／4 筆, on page 2, scrolled into view', s.cur === 3 && s.hits[3].i === 1 && l4.includes('第 4／4 筆') && seen, {cur:s.cur, l4, seen});
await key('Enter');
const l1 = await label();
await key('Shift+Enter');
check('Enter again: back to the first; Shift+Enter: the last', l1.includes('第 1／4 筆') && (await label()).includes('第 4／4 筆'), {l1, l2:await label()});
await opt('case'); await type('Hello');
const nCase = (await st()).n;
await opt('case'); await opt('width'); await type('hello');
const nWidth = (await st()).n;
await opt('width'); await opt('word'); await type('world');
const nWord = (await st()).n;
await opt('word');
const nPart = (await st()).n;
check('區分大小寫: Hello 2; 全形＝半形 off: hello 3; 全字相符: world 3 (not worldwide), off: 4', nCase === 2 && nWidth === 3 && nWord === 3 && nPart === 4, {nCase, nWidth, nWord, nPart});
await type('hello');
await Ev(() => window.__pdfapp.actions.sample()); await win.waitForTimeout(3500);
const other = await st();
await Ev(() => window.__pdfapp.switchTab(0)); await win.waitForTimeout(2500);
const back = await st();
check('another tab: searched again in that document; back: the 4 matches again', other.open && other.n !== 4 && other.hits.every(h => h.i < 99) && back.n === 4, {other:other.n, back:back.n});
await key('Escape');
check('Esc: the bar closes, no marks left', !(await st()).open && (await marks()).all === 0);

// ---- part 2: the 搜尋 tab, scanned pages -------------------------------------------------------------------------------
await key('Control+f'); await type('hello');
await win.click('#side .tab[data-tab="find"]'); await win.waitForTimeout(700);
const rows = () => Ev(() => [...document.querySelectorAll('#p-find .fd-hit')].map(r => ({k:+r.dataset.k, t:r.textContent, cur:r.classList.contains('cur'), ocr:!!r.querySelector('.fd-ocr')})));
let rs = await rows();
const pgs = await Ev(() => [...document.querySelectorAll('#p-find .fd-pg')].map(d => d.textContent));
check('the 搜尋 tab: the 4 matches page by page, each with its line; the current one marked', rs.length === 4 && pgs.join() === '第 1 頁,第 2 頁' && rs[0].t.includes('Hello World') && rs[0].cur, {rs, pgs});
await win.click('#p-find .fd-hit[data-k="3"]'); await win.waitForTimeout(800);
check('a row clicked: that match is the current one', (await st()).cur === 3 && (await label()).includes('第 4／4 筆') && (await rows())[3].cur);
await opt('scans');
await win.waitForFunction(() => window.__pdfapp.find().n >= 5, null, {timeout:120000}).catch(() => {});
s = await st(); rs = await rows();
check('也搜尋掃描頁: page 3 read by OCR, its Hello found and marked 辨識 (also in the tab)', s.n === 5 && s.hits[4].i === 2 && s.hits[4].ocr && rs.length === 5 && rs[4].ocr, {s, rs});
await opt('scans');
const off = (await st()).n;
const t0 = Date.now(); await opt('scans');
await win.waitForFunction(() => window.__pdfapp.find().n >= 5, null, {timeout:30000}).catch(() => {});
check('off: 4; on again: the page read before is used (at once)', off === 4 && (await st()).n === 5 && Date.now() - t0 < 6000, {off, ms:Date.now() - t0});
await opt('scans');
await key('Escape');

// ---- part 3: replace, replace all ---------------------------------------------------------------------------------------
const lines = i => Ev(i => window.__pdfapp.lineTexts(i), i);
const undos = () => Ev(() => window.__pdfapp.S.undo.length);
const toasts = () => Ev(() => [...document.querySelectorAll('.toast')].map(t => t.textContent).join('|'));
const setRepl = t => Ev(t => { document.querySelector('#findR').value = t; }, t);
const press = async (sel, ms = 4500) => { await win.click(sel); await win.waitForTimeout(ms); };
// a message that says text (it shows for 2.4 s): seen within ms of the click
const pressSee = async (sel, texts, ms = 9000) => { await win.click(sel); const seen = await Promise.all(texts.map(t => win.waitForFunction(t => [...document.querySelectorAll('.toast')].some(x => x.textContent.includes(t)), t, {timeout:ms}).then(() => true, () => false))); await win.waitForTimeout(1500); return seen; };
const toFirst = async () => { for (let n = 0; n < 6 && (await st()).cur !== 0; n++) await key('Enter'); };   // the search starts from the current page
await key('Control+f');
await win.click('#findBar [data-fa="rep"]'); await win.waitForTimeout(300);
check('取代 ▸ opens the replace row', await Ev(() => !document.querySelector('#findRepRow').hidden));
await Ev(() => { const b = document.querySelector('#findBar [data-fo="word"]'); if (!b.classList.contains('on')) b.click(); }); await win.waitForTimeout(300);
await type('world'); await setRepl('earth'); await toFirst();
let u0 = await undos();
await press('#findBar [data-fa="one"]');
let p1 = await lines(0);
check('〔取代〕: the first World on page 1 is earth; the other lines as they were; one undo step; the next match is current',
  p1.includes('Hello earth 你好世界') && p1.includes('hello world worldwide') && (await undos()) === u0 + 1 && (await label()).includes('第 1／2 筆'), {p1, label:await label()});
await win.keyboard.press('Control+z'); await win.waitForTimeout(2500);
check('復原 once: back as it was', (await lines(0)).includes('Hello World 你好世界'), await lines(0));
await type('world');
u0 = await undos();
const [said3] = await pressSee('#findBar [data-fa="all"]', ['已取代 3 處']);
p1 = await lines(0); let p2 = await lines(1);
check('〔全部取代〕 world → earth (whole words): 3 places, 「已取代 3 處」, one undo step; worldwide untouched',
  p1.includes('Hello earth 你好世界') && p1.includes('hello earth worldwide') && p2.includes('earth peace') && said3 && (await undos()) === u0 + 1, {p1, p2, said3, undos:(await undos()) - u0});
await type('earth'); await setRepl('planet');
await press('#findBar [data-fa="all"]');
p1 = await lines(0);
check('again on lines written by the program (now its own text blocks): planet, and each line still once', p1.includes('Hello planet 你好世界') && p1.includes('hello planet worldwide') && p1.length === 4, p1);
await type('a-b'); await setRepl('x');
await press('#findBar [data-fa="all"]');
p2 = await lines(1);
check('two matches on one line: both replaced (a-b a-b end → x x end)', p2.includes('x x end'), p2);
await type('end'); await setRepl('');
await press('#findBar [data-fa="all"]');
p2 = await lines(1);
check('replaced with nothing: the words go', p2.some(t => t.trim() === 'x x') && !p2.some(t => t.includes('end')), p2);
await Ev(() => { const b = document.querySelector('#findBar [data-fo="word"]'); if (b.classList.contains('on')) b.click(); }); await win.waitForTimeout(300);
await opt('scans'); await type('hello');
await win.waitForFunction(() => window.__pdfapp.find().n >= 5, null, {timeout:60000}).catch(() => {});
const before = await st();
await setRepl('Hi');
const [said4, saidScan] = await pressSee('#findBar [data-fa="all"]', ['已取代 4 處', '掃描頁的 1 處沒有取代']);
await win.waitForTimeout(1500);
const after = await st();
check('全部取代 with 掃描頁 on: the 4 in text replaced, 「掃描頁的 1 處沒有取代」; the scan\'s Hello still found', before.n === 5 && said4 && saidScan && after.n === 1 && after.hits[0].ocr, {before:before.n, said4, saidScan, after});
const [saidNo] = await pressSee('#findBar [data-fa="one"]', ['掃描頁的文字不能取代'], 3000);
check('〔取代〕 on the scan\'s match: 「掃描頁的文字不能取代」', saidNo);
await opt('scans');
await key('Escape');

// ---- part 4 (final review) --------------------------------------------------------------------------------------------
await key('Control+f');
await Ev(() => { const r = document.querySelector('#findRepRow'); if (r.hidden) document.querySelector('#findBar [data-fa="rep"]').click(); });
await type('cat'); await setRepl('tiger');
await press('#findBar [data-fa="all"]');
const p4t = await lines(3), b4 = (await blocks(3)).filter(Boolean), twin = b4.find(b => b.lines.length === 2);
check('our own block with two lines alike: both 「tiger sat」 (not 「tigerer」), still bold red', p4t.filter(t => t === 'tiger sat').length === 2 && !p4t.some(t => t.includes('tigerer')) && !!twin && twin.lines.every(l => l[0].text === 'tiger sat' && l[0].bold && l[0].color === '#c92a2a'), {p4t, twin});
await type('tiger'); await setRepl('tigers'); await toFirst();
const n4 = (await st()).n;
await press('#findBar [data-fa="one"]');
const c1 = await st();
await press('#findBar [data-fa="one"]');
const p4b = await lines(3);
check('〔取代〕 when the replacement holds the query (tiger → tigers): it moves on to the next one each time', n4 === 3 && c1.cur === 1 && p4b.filter(t => t.includes('tigers')).length === 2 && !p4b.some(t => t.includes('tigerss')), {n4, cur:c1.cur, p4b});
await type('zebra');
const z = await st();
await setRepl('horse');
const [saidZ] = await pressSee('#findBar [data-fa="all"]', ['掃描頁的文字不能取代'], 6000);   // every match is a scan's
check('an invisible text layer (a searchable scan): found, marked 辨識, not replaced', z.n === 1 && z.hits[0].ocr && saidZ && (await lines(3)).includes('zebra stripes'), {z, saidZ, p4:await lines(3)});
await type('sat');
const had = (await st()).n;
// the first frame after the new document is up, before its own search could run
const right = await Ev(() => new Promise(res => { const t0 = performance.now(), A = window.__pdfapp;
  const tick = () => { if (A.S.name === '範例文件.pdf' && A.S.pages.length && A.S.els.length === A.S.pages.length) res({n:A.find().n, marks:document.querySelectorAll('.fhit').length}); else if (performance.now() - t0 > 20000) res({timeout:true}); else requestAnimationFrame(tick); };
  A.actions.sample(); tick(); }));
check('another document opened: the old matches are gone at once (none to replace, no marks)', had >= 2 && right.n === 0 && right.marks === 0, {had, right});
await win.waitForTimeout(3000);
await key('Escape');
await Ev(() => window.__pdfapp.setTool('textbox')); await win.waitForTimeout(300);
const bx = await Ev(() => { const r = window.__pdfapp.S.els[window.__pdfapp.S.current].getBoundingClientRect(); return [r.left + 200, r.top + 300]; });
await win.mouse.click(...bx); await win.waitForTimeout(600); await win.keyboard.type('typing');
await win.keyboard.press('Control+f'); await win.waitForTimeout(500);
check('Ctrl+F while typing in a text box: left to the text box', !(await st()).open && !!(await Ev(() => window.__pdfapp.TBE())), await st());
await win.keyboard.press('Escape'); await win.waitForTimeout(500);

// ---- part 5 (v1.0.49): what replace really did, keys in the find boxes, full-width whole words, the 搜尋 tab, one message,
// scans (blank, turned, stopped), a long file -------------------------------------------------------------------------------
const d5 = await PDFDocument.create(); d5.registerFontkit(fontkit);
const f5 = await d5.embedFont(fs.readFileSync(path.join(ROOT, 'app', 'fonts', 'NotoSansTC-Regular.ttf')), {subset:true}), h5 = await d5.embedFont(StandardFonts.Helvetica);
const q1 = d5.addPage([595, 842]);
q1.drawText('Alpha beta gamma', {x:72, y:700, size:16, font:h5});
q1.drawText('ＡＢＣ and AB here', {x:72, y:500, size:16, font:f5});
{ const src = await PDFDocument.create(), sh = await src.embedFont(StandardFonts.Helvetica), sp = src.addPage([300, 40]); sp.drawText('beta', {x:4, y:14, size:16, font:sh});
  q1.drawPage(await d5.embedPage(sp), {x:72, y:600}); }   // text inside a form object: it cannot be taken out of the page
d5.addPage([595, 842]);   // a blank page
const scanImg = await d5.embedPng(Buffer.from(scan, 'base64'));
for (let k = 0; k < 3; k++) d5.addPage([595, 842]).drawImage(scanImg, {x:0, y:0, width:595, height:842});
const PDF5 = path.join(TMP, 'find5.pdf'); fs.writeFileSync(PDF5, await d5.save());
await app.evaluate(({BrowserWindow}, p) => BrowserWindow.getAllWindows()[0].webContents.send('open-path', p), PDF5);
await win.waitForFunction(() => window.__pdfapp.S.pages.length === 5 && /find5/.test(window.__pdfapp.S.name), null, {timeout:30000}); await win.waitForTimeout(1500);
await Ev(() => window.__pdfapp.setTool('select')); await Ev(() => window.__pdfapp.scrollToPage(0)); await win.waitForTimeout(500);
const setOpt = (k, on) => Ev(([k, on]) => { const b = document.querySelector(`#findBar [data-fo="${k}"]`); if (b.classList.contains('on') !== on) b.click(); }, [k, on]);
const lastLabel = () => Ev(() => { const u = window.__pdfapp.S.undo; return u.length ? u[u.length - 1].label : ''; });
await key('Control+f'); for (const [k, on] of [['case', false], ['word', false], ['width', false], ['scans', false]]) await setOpt(k, on);
if (await Ev(() => document.querySelector('#findRepRow').hidden)) { await win.click('#findBar [data-fa="rep"]'); await win.waitForTimeout(300); }
// replace all with nothing: one 「beta」 sits inside a form object and cannot be taken out
await type('beta'); await setRepl(''); u0 = await undos();
await press('#findBar [data-fa="all"]', 5000);
const t5a = await toasts(), lab5 = await lastLabel(), u5 = await undos(), l5 = await lines(0);
check('replace all where one place cannot be done (inside a form object): counted as done only where done, and the page of the other is named',
  u5 === u0 + 1 && lab5 === '已取代 1 處' && /第 1 頁.*1 處無法取代|1 處無法取代.*第 1 頁/.test(t5a) && !l5.some(t => /Alpha beta gamma/.test(t)), {u5, u0, lab5, t5a, l5});
await type('beta'); await setRepl(''); u0 = await undos();   // (only the one in the form object is left)
await press('#findBar [data-fa="all"]', 2500);
const t5b = await toasts();
check('replace all where nothing can be done: no undo step, and it says so', (await undos()) === u0 && /無法取代/.test(t5b), {undos:await undos(), u0, t5b});
// full-width letters with 全形＝半形 and 全字相符: AB is not a word inside ＡＢＣ
await setOpt('width', true); await setOpt('word', true); await type('AB');
const n5 = (await st()).n;
await setOpt('width', false); await setOpt('word', false);
check('全形＝半形 with 全字相符: 「AB」 is found on its own, not inside 「ＡＢＣ」', n5 === 1, n5);
// keys in the find boxes: Ctrl+P is the program's; F3 and Ctrl+F work in the replace box; Ctrl+F works in another box
await type('Alpha'); await Ev(() => document.querySelector('#findQ').focus());
await win.keyboard.press('Control+p'); await win.waitForTimeout(1500);
const prT = await Ev(() => document.querySelector('#mask').classList.contains('show') ? document.querySelector('#modal .mh').textContent : '');
if (prT) { await win.keyboard.press('Escape'); await win.waitForTimeout(600); }
const afterPrint = await st(); await Ev(() => document.querySelector('#findQ').focus()); await type('a'); await Ev(() => document.querySelector('#findR').focus());
await win.keyboard.press('Control+f'); await win.waitForTimeout(300);
const focusQ = await Ev(() => document.activeElement && document.activeElement.id);
await Ev(() => document.querySelector('#findR').focus()); const cur5 = (await st()).cur;
await win.keyboard.press('F3'); await win.waitForTimeout(400);
const f3moved = (await st()).cur, n5b = (await st()).n;
await key('Escape');
await Ev(() => { const z = document.querySelector('#zIn'); z.focus(); z.select(); }); await win.keyboard.press('Control+f'); await win.waitForTimeout(500);
const openedFromZoom = (await st()).open;
check('in the find boxes Ctrl+P prints (not swallowed); in the replace box Ctrl+F goes to the find box and F3 steps; Ctrl+F from another box opens the bar',
  /列印/.test(prT) && focusQ === 'findQ' && (n5b < 2 || f3moved !== cur5) && openedFromZoom, {prT, focusQ, cur5, f3moved, n5b, openedFromZoom, afterPrint:{open:afterPrint.open, q:afterPrint.q}});
// the 搜尋 tab: with the bar closed it shows how to search, not an old list
await type('Alpha'); await win.click('#side .tab[data-tab="find"]'); await win.waitForTimeout(600);
const tabOpen = await Ev(() => document.querySelectorAll('#p-find .fd-hit').length);
await key('Escape'); await win.waitForTimeout(400);
const tabClosed = await Ev(() => ({hits:document.querySelectorAll('#p-find .fd-hit').length, note:(document.querySelector('#p-find .empty-note') || {}).textContent || ''}));
check('the 搜尋 tab: the list while the bar is open; with the bar closed, how to search (no old list)', tabOpen >= 1 && tabClosed.hits === 0 && /Ctrl\+F/.test(tabClosed.note), {tabOpen, tabClosed});
// the same message twice at once: shown once
const same = await Ev(() => { window.__pdfapp.toast('同一個訊息只要一次', 'err'); window.__pdfapp.toast('同一個訊息只要一次', 'err'); return [...document.querySelectorAll('.toast')].filter(t => t.textContent === '同一個訊息只要一次').length; });
check('the same message twice at once (e.g. a font notice for every line of a replace all): shown once', same === 1, same);
// scans: a blank page is not sent to OCR; while the scans are read, stepping keeps the progress, and 〔停止〕 stops it
await key('Control+f'); await setOpt('scans', true);
const runs0 = await Ev(() => window.__pdfapp.ocrRuns());
await type('Hello');
await win.waitForFunction(() => /辨識掃描頁/.test((document.querySelector('#findN') || {}).textContent || ''), null, {timeout:20000, polling:50}).catch(() => {});
await win.waitForFunction(() => window.__pdfapp.find().n > 0, null, {timeout:60000, polling:100}).catch(() => {});
await win.keyboard.press('F3'); await win.waitForTimeout(150);
const keepLabel = await label();
const stopBtn = await Ev(() => { const b = document.querySelector('#findBar [data-fa="stopocr"]'); return !!b && !b.hidden; });
if (stopBtn) await win.click('#findBar [data-fa="stopocr"]');
await win.waitForTimeout(4000);
const afterStop = {label:await label(), runs:(await Ev(() => window.__pdfapp.ocrRuns())) - runs0};
check('scans being read: stepping keeps 「辨識掃描頁…」; 〔停止〕 stops it before every scan is read', /辨識掃描頁/.test(keepLabel) && stopBtn && !/辨識掃描頁/.test(afterStop.label) && afterStop.runs < 3, {keepLabel, stopBtn, afterStop});
await setOpt('scans', false); await setOpt('scans', true); await type('Helloo'); await type('Hello');
await win.waitForFunction(() => !/辨識掃描頁/.test((document.querySelector('#findN') || {}).textContent || ''), null, {timeout:90000, polling:200}).catch(() => {});
const runsAll = (await Ev(() => window.__pdfapp.ocrRuns())) - runs0;
check('every scan read once, the blank page never sent to OCR (3 scans → 3 runs)', runsAll === 3, runsAll);
// a scan turned by 90°: read again (its old reading has the wrong places)
const rBefore = await Ev(() => window.__pdfapp.ocrRuns());
await key('Escape');
await Ev(() => window.__pdfapp.mutate('已旋轉', doc => { const p = doc.getPage(2); p.setRotation(PDFLib.degrees((p.getRotation().angle + 90) % 360)); })); await win.waitForTimeout(1500);
await key('Control+f'); await type('Hellp'); await type('Hello');
await win.waitForFunction(() => !/辨識掃描頁/.test((document.querySelector('#findN') || {}).textContent || ''), null, {timeout:90000, polling:200}).catch(() => {});
const rAfter = await Ev(() => window.__pdfapp.ocrRuns());
check('a scan turned by 90°: read again by OCR', rAfter > rBefore, {rBefore, rAfter});
await setOpt('scans', false); await key('Escape');
// a long file (410 pages): a second search reads no page again (the line cache keeps them all)
const d6 = await PDFDocument.create(), h6 = await d6.embedFont(StandardFonts.Helvetica);
for (let k = 0; k < 410; k++) d6.addPage([300, 200]).drawText(`Long file page ${k + 1}`, {x:20, y:100, size:12, font:h6});
const PDF6 = path.join(TMP, 'find6.pdf'); fs.writeFileSync(PDF6, await d6.save());
await app.evaluate(({BrowserWindow}, p) => BrowserWindow.getAllWindows()[0].webContents.send('open-path', p), PDF6);
await win.waitForFunction(() => window.__pdfapp.S.pages.length === 410, null, {timeout:60000}); await win.waitForTimeout(1500);
await key('Control+f'); await type('page 405');
await win.waitForFunction(() => { const f = window.__pdfapp.find(); return f.n === 1 && /405/.test(f.hits[0].text); }, null, {timeout:60000}).catch(() => {});
const reads1 = await Ev(() => window.__pdfapp.findReads());
await type('page 406'); await win.waitForFunction(() => { const f = window.__pdfapp.find(); return f.n === 1 && /406/.test(f.hits[0].text); }, null, {timeout:60000}).catch(() => {});
const reads2 = await Ev(() => window.__pdfapp.findReads());
check('a 410-page file: a second search reads no page again', reads2 === reads1, {reads1, reads2});
await key('Escape');

console.log(failed ? `\n${failed} check(s) failed` : '\nall checks passed');
await app.evaluate(({app}) => app.exit(0)).catch(() => {});
