// 轉存 Word: the document as it is now (our annotations flattened onto the pages) becomes an editable .docx — by
// Microsoft Word when it is installed, otherwise by the built-in converter (text → paragraphs, sizes, bold, italic,
// pictures, scanned pages). The save dialog is answered by the test; the .docx is unzipped and read.
import { launchPath, TMP } from './_env.mjs';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import zlib from 'zlib';
import fs from 'fs';
import path from 'path';

let failed = 0;
const check = (name, ok, detail = '') => { console.log(`${ok ? '✔' : '✘'} ${name}${detail !== '' ? '  ' + (typeof detail === 'string' ? detail : JSON.stringify(detail)) : ''}`); if (!ok) { failed++; process.exitCode = 1; } };

// a .docx's files: name → Buffer (central directory, stored or deflated)
function unzip(buf){
  const out = {}; let e = buf.length - 22; while (e >= 0 && buf.readUInt32LE(e) !== 0x06054b50) e--;
  if (e < 0) return null;
  let p = buf.readUInt32LE(e + 16);
  for (let k = buf.readUInt16LE(e + 10); k > 0; k--) {
    const method = buf.readUInt16LE(p + 10), size = buf.readUInt32LE(p + 20), nl = buf.readUInt16LE(p + 28), xl = buf.readUInt16LE(p + 30), cl = buf.readUInt16LE(p + 32), off = buf.readUInt32LE(p + 42);
    const name = buf.subarray(p + 46, p + 46 + nl).toString('utf8'), lnl = buf.readUInt16LE(off + 26), lxl = buf.readUInt16LE(off + 28), data = buf.subarray(off + 30 + lnl + lxl, off + 30 + lnl + lxl + size);
    out[name] = method === 8 ? zlib.inflateRawSync(data) : Buffer.from(data);
    p += 46 + nl + xl + cl;
  }
  return out;
}
const xmlText = s => s.replace(/<[^>]+>/g, '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&amp;/g, '&');
// the paragraphs of document.xml: their text and their raw XML
const paras = xml => (xml.match(/<w:p>[\s\S]*?<\/w:p>|<w:p [\s\S]*?<\/w:p>/g) || []).map(x => ({x, text:xmlText((x.match(/<w:t[^>]*>[\s\S]*?<\/w:t>/g) || []).join(''))})).filter(p => p.text || /<w:drawing>/.test(p.x));

// page 1: a title, two English paragraphs, a Chinese one; page 2 landscape; page 3 turned by /Rotate 90 (a text box goes there)
const doc = await PDFDocument.create(); doc.registerFontkit(fontkit);
const H = await doc.embedFont(StandardFonts.Helvetica), HB = await doc.embedFont(StandardFonts.HelveticaBold);
const TC = await doc.embedFont(fs.readFileSync(path.join(path.dirname(new URL(import.meta.url).pathname), '..', '..', 'app', 'fonts', 'NotoSansTC-Regular.ttf')), {subset:true});
// a small PNG: 40×20 px, red to blue
const smallPng = (() => { const W = 40, Hh = 20, raw = Buffer.alloc((W * 3 + 1) * Hh);
  for (let y = 0; y < Hh; y++) for (let x = 0; x < W; x++) { const o = y * (W * 3 + 1) + 1 + x * 3; raw[o] = 255 - x * 6; raw[o + 1] = 40; raw[o + 2] = x * 6; }
  const chunk = (t, d) => { const b = Buffer.alloc(12 + d.length); b.writeUInt32BE(d.length, 0); b.write(t, 4); d.copy(b, 8); b.writeUInt32BE(zlib.crc32(Buffer.concat([Buffer.from(t), d])), 8 + d.length); return b; };
  const ih = Buffer.alloc(13); ih.writeUInt32BE(W, 0); ih.writeUInt32BE(Hh, 4); ih[8] = 8; ih[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ih), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]); })();
const p1 = doc.addPage([595, 842]), title = 'Quarterly Report';
p1.drawText(title, {x:(595 - HB.widthOfTextAtSize(title, 24)) / 2, y:770, size:24, font:HB});
p1.drawText('The first paragraph has two lines of text that', {x:72, y:720, size:12, font:H});
p1.drawText('continue on the second line.', {x:72, y:705, size:12, font:H});
p1.drawText('Second paragraph: A&B <x> are kept, and', {x:72, y:675, size:12, font:H});
p1.drawText('it ends here.', {x:72, y:660, size:12, font:H});
p1.drawText('第一行的中文字寫到這裡', {x:72, y:630, size:12, font:TC});
p1.drawText('第二行接在後面。', {x:72, y:614, size:12, font:TC});
doc.addPage([842, 595]).drawText('Page two', {x:72, y:520, size:12, font:H});
doc.addPage([595, 842]).setRotation({type:'degrees', angle:90});
const PDF = path.join(TMP, 'word.pdf'); fs.writeFileSync(PDF, await doc.save());

const { app } = await launchPath(PDF);
const win = await app.firstWindow(); win.on('pageerror', e => console.log('PAGEERR', e.message)); win.on('console', m => { if (m.type() === 'error') console.log('C', m.text().slice(0, 300)); });
await win.waitForTimeout(3000);
await win.waitForFunction(() => !!(window.__pdfapp && window.__pdfapp.S.pages.length), null, {timeout:30000});
const Ev = win.evaluate.bind(win);
// the save dialog: answered with a file in TMP
const answerSave = out => app.evaluate(({ipcMain}, out) => { ipcMain.removeHandler('file:choose-save'); ipcMain.handle('file:choose-save', () => out); }, out);
const waitFile = async (f, ms = 120000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (fs.existsSync(f) && fs.statSync(f).size > 0) { await win.waitForTimeout(300); return true; } await win.waitForTimeout(250); } return false; };
const dlg = () => Ev(() => { const g = document.querySelector('#wdGo'); if (!g || !document.querySelector('#mask').classList.contains('show')) return null;
  const how = document.querySelector('#wdHow');
  return {title:document.querySelector('#modal .mh').textContent, how:how.value, wordOff:how.querySelector('option[value="word"]').disabled, note:(document.querySelector('#wdNote') || {}).textContent || '', go:g.disabled}; });

// ---- part 1: the built-in converter, text ---------------------------------------------------------------------------------
// a picture put on page 1 (dropped like an image file: an image annotation), below the Chinese paragraph
await Ev(() => window.__pdfapp.scrollToPage(0)); await win.waitForTimeout(800);
await Ev(async () => {
  const c = document.createElement('canvas'); c.width = 400; c.height = 200; const g = c.getContext('2d');
  g.fillStyle = '#1c64d9'; g.fillRect(0, 0, 400, 200); g.fillStyle = '#fff'; g.font = '60px sans-serif'; g.fillText('IMG', 120, 120);
  const b = await new Promise(r => c.toBlob(r, 'image/png')), dt = new DataTransfer(); dt.items.add(new File([b], 'logo.png', {type:'image/png'}));
  const S = window.__pdfapp.S, el = S.els[0], r = el.getBoundingClientRect();
  el.dispatchEvent(new DragEvent('drop', {bubbles:true, cancelable:true, clientX:r.left + 300 * S.scale, clientY:r.top + 330 * S.scale, dataTransfer:dt}));
});
await win.waitForTimeout(3000);
// a text box on the turned page 3
await Ev(() => window.__pdfapp.scrollToPage(2)); await win.waitForTimeout(800);
await win.click('[data-tool="textbox"]'); await win.waitForTimeout(300);
const pb = await win.locator('.page').nth(2).boundingBox();
await win.mouse.click(pb.x + 120, pb.y + 140); await win.waitForTimeout(300);
await win.keyboard.type('旋轉頁的方塊'); await win.waitForTimeout(200);
await win.keyboard.press('Escape'); await win.waitForTimeout(2500);
const before = await Ev(() => ({undo:window.__pdfapp.S.undo.length, dirty:window.__pdfapp.S.dirty}));
const nAnn = await Ev(async () => (await window.__pdfapp.getAnns(0)).filter(a => a.subtype === 'Stamp').length);
const OUT = path.join(TMP, 'out.docx');
await answerSave(OUT);
await win.click('[data-amenu="output"] .sp-arr'); await win.waitForTimeout(300);
await win.click('#toolMenu button:has-text("Word 檔")'); await win.waitForTimeout(600);
const d = await dlg();
check('(setup) the dropped picture is an image annotation on page 1', nAnn === 1, nAnn);
check('輸出 ▾ 轉存 Word: 「轉存成 Word」; no Word on this computer: its choice is off and the built-in converter is chosen', !!d && d.title.includes('轉存成 Word') && d.wordOff && d.how === 'builtin' && d.note.includes('沒有 Word') && !d.go, d);
await win.click('#wdGo');
const made = await waitFile(OUT);
await win.waitForTimeout(1500);
const toastText = await Ev(() => [...document.querySelectorAll('.toast')].map(t => t.textContent).join(' | '));
const stNow = await Ev(() => ({st:(document.querySelector('#wdSt') || {}).textContent || '', err:(document.querySelector('#wdErr') || {}).textContent || ''}));
const z = made ? unzip(fs.readFileSync(OUT)) : null;
check('〔轉存〕: a .docx with all its parts; 「已轉存成 Word」', !!z && ['[Content_Types].xml', '_rels/.rels', 'word/document.xml', 'word/styles.xml', 'word/_rels/document.xml.rels'].every(n => z[n]) && toastText.includes('已轉存成 Word'), {made, files:z && Object.keys(z), toastText, stNow});
const xml = z ? z['word/document.xml'].toString('utf8') : '', P = paras(xml), texts = P.map(p => p.text);
const at = t => P.find(p => p.text.includes(t));
check('the paragraphs, in order: the title, two English ones (lines joined with a space), the Chinese one (no space), the dropped picture, Page two, the text box',
  JSON.stringify(texts) === JSON.stringify(['Quarterly Report', 'The first paragraph has two lines of text that continue on the second line.', 'Second paragraph: A&B <x> are kept, and it ends here.', '第一行的中文字寫到這裡第二行接在後面。', '', 'Page two', '旋轉頁的方塊'])
  && /<w:drawing>/.test(P[4].x) && Object.keys(z || {}).filter(n => n.startsWith('word/media/')).length === 1, texts);
check('the title is bold, 24 pt and centred; & < > are escaped in the XML', !!at('Quarterly') && /<w:b\/>/.test(at('Quarterly').x) && /<w:sz w:val="48"\/>/.test(at('Quarterly').x) && /<w:jc w:val="center"\/>/.test(at('Quarterly').x) && xml.includes('A&amp;B &lt;x&gt;'), at('Quarterly') && at('Quarterly').x.slice(0, 400));
const sects = xml.match(/<w:sectPr>[\s\S]*?<\/w:sectPr>/g) || [];
check('one section per page, the second one landscape (842 × 595 pt)', sects.length === 3 && /w:w="16840" w:h="11900" w:orient="landscape"/.test(sects[1]) && !/landscape/.test(sects[0]), sects.map(s => s.slice(0, 160)));
const after = await Ev(() => ({undo:window.__pdfapp.S.undo.length, dirty:window.__pdfapp.S.dirty}));
check('the document itself is unchanged (no undo step, same unsaved state)', JSON.stringify(before) === JSON.stringify(after), {before, after});

// ---- part 2: pictures, scanned pages, fonts, 取消 ------------------------------------------------------------------------
await win.click('#wdCancel'); await win.waitForTimeout(400);   // (the window had become 〔開啟〕〔關閉〕)
// a page of printed text as a picture (drawn in the app's window): the "scan"
const scanPng = Buffer.from((await Ev(() => { const c = document.createElement('canvas'); c.width = 1240; c.height = 1754; const g = c.getContext('2d');
  g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.fillStyle = '#000'; g.font = 'bold 90px sans-serif'; g.fillText('SCAN TEST 12345', 120, 320); return c.toDataURL('image/png'); })).split(',')[1], 'base64');
const d2 = await PDFDocument.create(), H2 = await d2.embedFont(StandardFonts.Helvetica), pic = await d2.embedPng(smallPng), scan = await d2.embedPng(scanPng);
const q1 = d2.addPage([595, 842]);
q1.drawText('Before the picture.', {x:72, y:760, size:12, font:H2});
q1.drawImage(pic, {x:72, y:620, width:160, height:80});
q1.drawText('After the picture.', {x:72, y:590, size:12, font:H2});
d2.addPage([595, 842]).drawImage(scan, {x:0, y:0, width:595, height:842});   // a scanned page
const q3 = d2.addPage([595, 842]); q3.drawImage(scan, {x:0, y:0, width:595, height:842});   // a scanned page that already has its text
q3.drawText('HIDDEN LAYER TEXT', {x:72, y:700, size:24, font:H2, color:rgb(1, 1, 1)});
const PDF2 = path.join(TMP, 'word2.pdf'); fs.writeFileSync(PDF2, await d2.save());
await app.evaluate(({BrowserWindow}, p) => BrowserWindow.getAllWindows()[0].webContents.send('open-path', p), PDF2);
await win.waitForFunction(() => window.__pdfapp.S.pages.length === 3 && /word2/.test(window.__pdfapp.S.name), null, {timeout:30000}); await win.waitForTimeout(1500);
const exportTo = async (out, {ocr = true} = {}) => {
  await answerSave(out);
  await win.click('[data-amenu="output"] .sp-arr'); await win.waitForTimeout(300);
  await win.click('#toolMenu button:has-text("Word 檔")'); await win.waitForTimeout(600);
  if (!ocr) await win.click('#wdOcr');
  await win.click('#wdGo');
  const ok = await waitFile(out); await win.waitForTimeout(500);
  if (await Ev(() => !!document.querySelector('#wdCancel'))) await win.click('#wdCancel'); await win.waitForTimeout(300);
  return ok ? unzip(fs.readFileSync(out)) : null;
};
const z2 = await exportTo(path.join(TMP, 'pics.docx')), x2 = z2 ? z2['word/document.xml'].toString('utf8') : '', P2 = paras(x2);
const media2 = z2 ? Object.keys(z2).filter(n => n.startsWith('word/media/')) : [];
const iPic = P2.findIndex(p => /<w:drawing>/.test(p.x));
check('a picture: in word/media as a PNG, placed between the paragraphs above and below it',
  media2.length === 1 && z2[media2[0]].subarray(1, 4).toString() === 'PNG' && iPic > 0 && P2[iPic - 1].text === 'Before the picture.' && P2[iPic + 1].text === 'After the picture.', {media2, texts:P2.map(p => p.text || '[picture]')});
check('a scanned page, 文字辨識 on: its text is read (no picture of it); a scanned page that has its text already: that text, not the picture',
  /SCAN/.test(x2) && /12345/.test(x2) && P2.some(p => p.text === 'HIDDEN LAYER TEXT') && media2.length === 1, P2.map(p => p.text || '[picture]'));
const z3 = await exportTo(path.join(TMP, 'scan.docx'), {ocr:false}), x3 = z3 ? z3['word/document.xml'].toString('utf8') : '';
const media3 = z3 ? Object.keys(z3).filter(n => n.startsWith('word/media/')) : [];
check('文字辨識 off: the scanned page is one picture of the whole page, and no text is made up', media3.length === 2 && !/SCAN/.test(x3) && /HIDDEN LAYER TEXT/.test(x3), {media3, texts:paras(x3).map(p => p.text || '[picture]')});
const fonts = await Ev(() => ['ABCDEF+MingLiU', 'DFKaiShu-SB-Estd-BF', 'MicrosoftJhengHei-Bold', 'TimesNewRomanPSMT', 'Helvetica-Bold', 'SomethingElse'].map(n => window.__pdfapp.wordFonts(n)));
check('font names → Windows fonts: 細明體, 標楷體, 正黑體, Times New Roman, Arial; others left to Word', JSON.stringify(fonts) === JSON.stringify([[null, '新細明體'], [null, '標楷體'], [null, '微軟正黑體'], ['Times New Roman', null], ['Arial', null], [null, null]]), fonts);
// 取消 during a long conversion
const d3 = await PDFDocument.create(), H3 = await d3.embedFont(StandardFonts.Helvetica);
for (let k = 0; k < 200; k++) { const pg = d3.addPage([595, 842]); for (let r = 0; r < 40; r++) pg.drawText(`Page ${k + 1}, line ${r + 1}: some words to read on this page.`, {x:72, y:780 - r * 17, size:11, font:H3}); }
const PDF3 = path.join(TMP, 'word3.pdf'); fs.writeFileSync(PDF3, await d3.save());
await app.evaluate(({BrowserWindow}, p) => BrowserWindow.getAllWindows()[0].webContents.send('open-path', p), PDF3);
await win.waitForFunction(() => window.__pdfapp.S.pages.length === 200, null, {timeout:60000}); await win.waitForTimeout(1500);
const OUT4 = path.join(TMP, 'long.docx'); await answerSave(OUT4);
await win.click('[data-amenu="output"] .sp-arr'); await win.waitForTimeout(300);
await win.click('#toolMenu button:has-text("Word 檔")'); await win.waitForTimeout(600);
await win.click('#wdGo');
await win.waitForFunction(() => /轉換中：第 \d+／\d+ 頁/.test(document.querySelector('#wdSt').textContent), null, {timeout:60000, polling:20});
const mid = await Ev(() => document.querySelector('#wdSt').textContent);
await win.click('#wdCancel'); await win.waitForTimeout(2500);
const stopped = await Ev(() => ({open:document.querySelector('#mask').classList.contains('show'), st:(document.querySelector('#wdSt') || {}).textContent || '', go:(document.querySelector('#wdGo') || {}).textContent || ''}));
check('取消 during a long conversion (「轉換中：第 N／200 頁」): it stops, nothing is written, the window stays (「已取消」) to try again',
  /轉換中：第 \d+／200 頁/.test(mid) && stopped.open && stopped.st === '已取消' && stopped.go === '轉存' && !fs.existsSync(OUT4), {mid, stopped, file:fs.existsSync(OUT4)});

console.log(failed ? `\n${failed} check(s) failed` : '\nall checks passed');
await app.evaluate(({app}) => app.exit(0)).catch(() => {});
