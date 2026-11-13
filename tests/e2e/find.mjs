// 尋找與取代: Ctrl+F finds text on every page (options: 區分大小寫, 全字相符, 全形＝半形), marks every match and moves
// between them; the 搜尋 tab lists them; scanned pages can be read by OCR (found, not replaced); 取代 / 全部取代 rewrite
// the lines as 修改原文 does, one undo step.
import { launch, launchPath, TMP, ROOT } from './_env.mjs';
import { createRequire } from 'module';
import path from 'path';
import fs from 'fs';
const require = createRequire(import.meta.url);
const { PDFDocument } = require('pdf-lib');
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

console.log(failed ? `\n${failed} check(s) failed` : '\nall checks passed');
await app.evaluate(({app}) => app.exit(0)).catch(() => {});
