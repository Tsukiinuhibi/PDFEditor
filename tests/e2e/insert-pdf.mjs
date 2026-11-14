// 從其他 PDF 插入頁面 with the kinds of files that used to show one white page or insert blank pages:
// a PDF portfolio (its PDFs are listed, one group each, under a heading); a PDF with attached PDFs; an XFA form (a
// warning, nothing ticked); files encrypted with only a permissions password, on their own or inside a portfolio
// (their pages come in with their text); an attachment that is not a PDF or cannot be read (named, not offered).
import { launch, TMP, ROOT } from './_env.mjs';
import { PDFDocument, PDFName, StandardFonts } from 'pdf-lib';
import fs from 'fs';
import path from 'path';

let failed = 0;
const check = (name, ok, detail = '') => { console.log(`${ok ? '✔' : '✘'} ${name}${detail !== '' ? '  ' + (typeof detail === 'string' ? detail : JSON.stringify(detail)) : ''}`); if (!ok) { failed++; process.exitCode = 1; } };
const FIX = path.join(ROOT, 'tests', 'e2e', 'fixtures');
const inner = async (label, n) => {
  const d = await PDFDocument.create(), f = await d.embedFont(StandardFonts.Helvetica);
  for (let i = 1; i <= n; i++) d.addPage([595, 842]).drawText(`${label}${i}`, {x:60, y:600, size:96, font:f});
  return d.save();
};
const make = async (name, {cover = true, collection = true, files = [], base = null} = {}) => {
  const d = base ? await PDFDocument.load(base) : await PDFDocument.create();
  if (cover) d.addPage([612, 792]);
  for (const [fn, bytes, mime] of files) await d.attach(bytes, fn, {mimeType:mime || 'application/pdf'});
  if (collection) d.catalog.set(PDFName.of('Collection'), d.context.obj({Type:'Collection', View:'D'}));
  const p = path.join(TMP, name); fs.writeFileSync(p, await d.save()); return p;
};
const A = await inner('A', 2), B = await inner('B', 3);
const PORT = await make('portfolio.pdf', {files:[['B.pdf', B], ['A.pdf', A], ['notes.txt', new TextEncoder().encode('hello'), 'text/plain']]});
const ATT = await make('with-attachment.pdf', {cover:false, collection:false, base:fs.readFileSync(path.join(FIX, 'sample.pdf')), files:[['A.pdf', A]]});
const PORT2 = await make('portfolio2.pdf', {files:[['C.pdf', fs.readFileSync(path.join(FIX, 'encrypted', 'r4-aes128.pdf'))], ['broken.pdf', new TextEncoder().encode('%PDF-1.7\nnot really a pdf')],
  ['locked.pdf', fs.readFileSync(path.join(FIX, 'encrypted', 'r6-userpw.pdf'))]]});
const XFA = path.join(TMP, 'xfa.pdf');
{
  const d = await PDFDocument.create(); d.addPage([612, 792]);
  const ref = d.context.register(d.context.stream('<xdp:xdp xmlns:xdp="http://ns.adobe.com/xdp/"><template xmlns="http://www.xfa.org/schema/xfa-template/3.3/"><subform name="form1"/></template></xdp:xdp>'));
  d.catalog.set(PDFName.of('AcroForm'), d.context.obj({Fields:[], XFA:ref}));
  d.catalog.set(PDFName.of('NeedsRendering'), d.context.obj(true));
  fs.writeFileSync(XFA, await d.save());
}
const ENC = f => { const p = path.join(TMP, f); fs.copyFileSync(path.join(FIX, 'encrypted', f), p); return p; };

const { app } = await launch('host.pdf');
const win = await app.firstWindow();
win.on('pageerror', e => console.log('PAGEERR', e.message));
win.on('console', m => { if (m.type() === 'error' && !/broken\.pdf|Invalid PDF|InvalidPDFException/.test(m.text())) console.log('C', m.text().slice(0, 300)); });
await win.waitForFunction(() => !!(window.__pdfapp && window.__pdfapp.S.pages.length), null, {timeout:30000});
await win.waitForTimeout(1200);
const Ev = win.evaluate.bind(win);
const pages = () => Ev(() => window.__pdfapp.S.pages.length);
// the picker as it stands; ink = dark pixels in each thumbnail drawn so far
const dialog = async (file, opens = true) => {
  await win.setInputFiles('#fInsert', file);
  if (opens) await win.waitForSelector('#ppGrid .pp-card', {timeout:20000}).catch(() => {});
  await win.waitForTimeout(opens ? 2500 : 3000);
  return Ev(() => {
    const ink = c => { const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let k = 0; for (let i = 0; i < d.length; i += 4) if (d[i] < 128) k++; return k; };
    return {open:document.querySelector('#mask').classList.contains('show'), foot:(document.querySelector('.pp-foot') || {}).textContent || '', cnt:(document.querySelector('#ppCnt') || {}).textContent || '',
      groups:[...document.querySelectorAll('#ppGrid .pp-group')].map(g => g.textContent), notes:[...document.querySelectorAll('#modal .note')].map(n => n.textContent),
      warn:[...document.querySelectorAll('#modal .note.warn')].map(n => n.textContent), ok:!document.querySelector('#ppOk').disabled,
      cards:[...document.querySelectorAll('#ppGrid .pp-card')].map(c => ({on:c.classList.contains('on'), ink:c.querySelector('canvas') ? ink(c.querySelector('canvas')) : -1}))};
  });
};
const cancel = async () => { await win.click('#modal button:has-text("取消")').catch(() => {}); await win.waitForTimeout(700); };
const pick = async range => { await win.fill('#ppRange', range); await win.press('#ppRange', 'Enter'); await win.waitForTimeout(300); };
// inserts after the current page (the picker's default); → where the inserted pages start
const insert = async () => { const at = await Ev(() => window.__pdfapp.S.current + 1);
  if (await win.click('#ppOk', {timeout:3000}).then(() => true, () => false)) await win.waitForTimeout(3500); else await cancel(); return at; };
// the text on pages from..from+n-1 of what the tab holds now
const texts = (from, n) => Ev(async ([from, n]) => {
  const d = await window.pdfjsLib.getDocument({data:window.__pdfapp.S.bytes.slice(), isEvalSupported:false}).promise, out = [];
  for (let i = from; i < from + n; i++) { const tc = await (await d.getPage(i + 1)).getTextContent(); out.push(tc.items.map(t => t.str).join('').trim()); }
  d.destroy(); return out;
}, [from, n]);
const undo = async () => { await win.keyboard.press('Control+z'); await win.waitForTimeout(1800); };
const n0 = await pages();

// ---- a plain PDF: as before ------------------------------------------------------------------------------------------
let d = await dialog(path.join(FIX, 'sample.pdf'));
check('a plain PDF: 共 4 頁, all ticked, no group headings', d.foot.includes('共 4 頁') && d.cards.length === 4 && d.cards.every(c => c.on) && d.groups.length === 0, d);
let at = await insert();
let tx = await texts(at, 1), src0 = await Ev(async () => { const d = await window.pdfjsLib.getDocument({data:window.__pdfapp.S.bytes.slice(), isEvalSupported:false}).promise; const t = (await (await d.getPage(1)).getTextContent()).items.map(i => i.str).join('').trim(); d.destroy(); return t; });
check('inserted after page 1: 4 more pages; the first inserted page is the sample\'s first page', (await pages()) === n0 + 4 && tx[0] === src0 && tx[0].length > 0, {tx, src0});
await undo();

// ---- a PDF portfolio -------------------------------------------------------------------------------------------------
await Ev(() => { const W = window.Worker; window.__workers = 0; window.Worker = function(...a){ window.__workers++; return new W(...a); }; window.Worker.prototype = W.prototype; });
d = await dialog(PORT);
const workers = await Ev(() => window.__workers);
check('the portfolio\'s three files are read with one pdf.js worker between them (not one each)', workers === 1, {workers});
check('a PDF portfolio: its PDFs listed after the cover — 共 6 頁 in 3 groups headed by the file names (A before B)',
  d.foot.includes('PDF 包') && d.foot.includes('共 6 頁') && d.cards.length === 6 && d.groups.length === 3 && d.groups[0].includes('封面') && d.groups[1].includes('A.pdf') && d.groups[2].includes('B.pdf'), d);
check('the PDFs\' 5 pages ticked, the cover not; notes.txt named as not insertable; A\'s pages drawn (not white)',
  d.cards.map(c => c.on).join() === 'false,true,true,true,true,true' && d.cnt.includes('5') && d.notes.some(n => n.includes('notes.txt')) && d.cards[1].ink > 200, {cards:d.cards, notes:d.notes});
await pick('5, 3');
at = await insert();
tx = await texts(at, 2);
check('「5, 3」 inserted in page order: A\'s page 2, then B\'s page 2', (await pages()) === n0 + 2 && tx[0] === 'A2' && tx[1] === 'B2', tx);
await undo();

// ---- a PDF with an attached PDF ---------------------------------------------------------------------------------------
d = await dialog(ATT);
check('a PDF with an attached PDF: its own 4 pages ticked; the attachment\'s 2 pages listed after them, not ticked',
  d.cards.length === 6 && d.groups.length === 2 && d.groups[1].includes('A.pdf') && d.cards.map(c => c.on).join() === 'true,true,true,true,false,false', d);
await cancel();

// ---- an XFA form ---------------------------------------------------------------------------------------------------------
d = await dialog(XFA);
check('a dynamic XFA form: a warning says why only a placeholder page is there and how to make a normal PDF; nothing ticked',
  d.warn.some(w => w.includes('XFA') && w.includes('Microsoft Print to PDF')) && d.cards.length === 1 && !d.cards[0].on && !d.ok, d);
await cancel();

// ---- encrypted sources -----------------------------------------------------------------------------------------------
for (const f of ['r4-aes128.pdf', 'r2-rc4-40.pdf', 'r6-aes256.pdf']) {
  d = await dialog(ENC(f));
  at = await insert();
  tx = await texts(at, 2);
  check(`${f} (「限制編輯」): its pages come in with their text`, (await pages()) === n0 + 2 && tx[0] === 'Secret page 1' && tx[1] === 'Secret page 2', {cards:d.cards, tx});
  await undo();
}
d = await dialog(ENC('r6-userpw.pdf'), false);
let t = await Ev(() => [...document.querySelectorAll('#toasts .toast')].map(x => x.textContent));
check('a file that needs a password: 「此 PDF 受密碼保護，無法匯入」 as before, no picker', t.some(x => x.includes('受密碼保護')) && !d.open, t);

// ---- a portfolio holding an encrypted PDF and a broken one --------------------------------------------------------------
d = await dialog(PORT2);
check('a portfolio with a 「限制編輯」 PDF, a broken one and one that needs a password: the first listed (2 pages); broken.pdf named as unreadable, locked.pdf as needing a password',
  d.cards.length === 3 && d.groups.length === 2 && d.groups[1].includes('C.pdf') && d.notes.some(n => n.includes('broken.pdf') && n.includes('locked.pdf（需要密碼）')), d);
at = await insert();
tx = await texts(at, 2);
check('its encrypted PDF\'s pages come in with their text', (await pages()) === n0 + 2 && tx[0] === 'Secret page 1' && tx[1] === 'Secret page 2', tx);

await app.evaluate(({app}) => app.exit(0)).catch(() => {});
console.log(failed ? `${failed} check(s) failed` : 'all checks passed');
