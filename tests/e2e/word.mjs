// 轉存 Word: the document as it is now (our annotations flattened onto the pages) becomes an editable .docx — by
// Microsoft Word when it is installed, otherwise by the built-in converter (text → paragraphs, sizes, bold, italic,
// pictures, scanned pages). The save dialog is answered by the test; the .docx is unzipped and read.
import { launchPath, TMP, ROOT } from './_env.mjs';
import { PDFDocument, PDFName, PDFString, PDFOperator, StandardFonts, rgb, pushGraphicsState, popGraphicsState, beginText, endText, setFontAndSize, setTextRenderingMode, TextRenderingMode, moveText, showText } from 'pdf-lib';
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

// children of w:pPr / w:rPr out of the schema's order (ECMA-376 CT_PPr / CT_RPr), as "parent: tag after tag"
const P_ORDER = ['w:pStyle', 'w:keepNext', 'w:keepLines', 'w:pageBreakBefore', 'w:widowControl', 'w:numPr', 'w:pBdr', 'w:shd', 'w:tabs', 'w:spacing', 'w:ind', 'w:jc', 'w:rPr', 'w:sectPr'];
const R_ORDER = ['w:rStyle', 'w:rFonts', 'w:b', 'w:bCs', 'w:i', 'w:iCs', 'w:caps', 'w:strike', 'w:vanish', 'w:color', 'w:spacing', 'w:w', 'w:kern', 'w:position', 'w:sz', 'w:szCs', 'w:highlight', 'w:u', 'w:effect', 'w:shd', 'w:vertAlign', 'w:lang'];
const orderFaults = xml => {
  const out = [];
  for (const [tag, order] of [['w:pPr', P_ORDER], ['w:rPr', R_ORDER]]) {
    for (const m of xml.matchAll(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, 'g'))) {
      let inner = m[1]; if (tag === 'w:pPr') inner = inner.replace(/<w:sectPr>[\s\S]*?<\/w:sectPr>/g, '<w:sectPr/>').replace(/<w:rPr>[\s\S]*?<\/w:rPr>/g, '<w:rPr/>');
      const kids = [...inner.matchAll(/<(w:[A-Za-z]+)[\s/>]/g)].map(k => k[1]);
      for (let k = 1; k < kids.length; k++) if (order.indexOf(kids[k]) < order.indexOf(kids[k - 1])) out.push(`${tag}: ${kids[k]} after ${kids[k - 1]}`);
    }
  }
  return [...new Set(out)];
};

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
// paragraphs set as a program sets them: lines run to the right margin (451 pt wide), the last one shorter
const wrap = (text, font, w, cjk = false) => { const parts = cjk ? [...text] : text.split(' '), out = []; let line = '';
  for (const p of parts) { const t = line ? line + (cjk ? '' : ' ') + p : p; if (font.widthOfTextAtSize(t, 12) > w) { out.push(line); line = p; } else line = t; } out.push(line); return out; };
const PARA1 = 'The first paragraph has enough words in it to run from the left margin all the way across to the right margin, and then it continues on the second line.';
const PARA2 = 'Second paragraph: A&B <x> are kept, and this line too runs on across the whole width of the page before it ends here.';
const PARA3 = '第一行的中文字從左邊一直寫到右邊的邊界才換行，第二行接在後面，中間不應該多出空白，這樣才是一個完整的段落。';
let yy = 720;
for (const [text, font, cjk] of [[PARA1, H, false], [PARA2, H, false], [PARA3, TC, true]]) { wrap(text, font, 451, cjk).forEach(l => { p1.drawText(l, {x:72, y:yy, size:12, font}); yy -= 15; }); yy -= 15; }
doc.addPage([842, 595]).drawText('Page two', {x:72, y:520, size:12, font:H});
doc.addPage([595, 842]).setRotation({type:'degrees', angle:90});
const PDF = path.join(TMP, 'word.pdf'); fs.writeFileSync(PDF, await doc.save());

const { app } = await launchPath(PDF);
const win = await app.firstWindow(); win.on('pageerror', e => console.log('PAGEERR', e.message)); win.on('console', m => { if (m.type() === 'error') console.log('C', m.text().slice(0, 300)); });
await win.waitForTimeout(3000);
await win.waitForFunction(() => !!(window.__pdfapp && window.__pdfapp.S.pages.length), null, {timeout:30000});
const Ev = win.evaluate.bind(win);
const openOther = await Ev(p => window.desktop.openPath(p), path.join(TMP, 'other.exe'));
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
await win.keyboard.press('Control+A'); await win.waitForTimeout(150);
await win.click('#hint [data-tb="underline"]'); await win.waitForTimeout(200);
await win.click('#hint [data-tbc="color"]'); await win.waitForTimeout(200);
await win.click('#cpMenu .cp-sw[data-v="#e03131"]'); await win.waitForTimeout(200);
await win.keyboard.press('Escape'); await win.waitForTimeout(2500);
const before = await Ev(() => ({undo:window.__pdfapp.S.undo.length, dirty:window.__pdfapp.S.dirty}));
const nAnn = await Ev(async () => (await window.__pdfapp.getAnns(0)).filter(a => a.subtype === 'Stamp').length);
const OUT = path.join(TMP, 'out.docx');
await answerSave(OUT);
await win.click('[data-amenu="output"] .sp-arr'); await win.waitForTimeout(300);
await win.click('#toolMenu button:has-text("Word 檔")'); await win.waitForTimeout(600);
const d = await dlg();
check('(setup) the dropped picture is an image annotation on page 1', nAnn === 1, nAnn);
check('the bridge opens only a .docx this program saved, nothing else in an open folder', openOther === 'not allowed', openOther);
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
  JSON.stringify(texts) === JSON.stringify(['Quarterly Report', PARA1, PARA2, PARA3, '', 'Page two', '旋轉頁的方塊'])
  && /<w:drawing>/.test(P[4].x) && Object.keys(z || {}).filter(n => n.startsWith('word/media/')).length === 1, texts);
check('the title is bold, 24 pt and centred; & < > are escaped in the XML', !!at('Quarterly') && /<w:b\/>/.test(at('Quarterly').x) && /<w:sz w:val="48"\/>/.test(at('Quarterly').x) && /<w:jc w:val="center"\/>/.test(at('Quarterly').x) && xml.includes('A&amp;B &lt;x&gt;'), at('Quarterly') && at('Quarterly').x.slice(0, 400));
const sects = xml.match(/<w:sectPr>[\s\S]*?<\/w:sectPr>/g) || [];
check('one section per page, the second one landscape (842 × 595 pt)', sects.length === 3 && /w:w="16840" w:h="11900" w:orient="landscape"/.test(sects[1]) && !/landscape/.test(sects[0]), sects.map(s => s.slice(0, 160)));
const tbRun = (at('旋轉頁的方塊') || {x:''}).x;
check('a styled run (the red, underlined text box): its colour and underline written; pPr and rPr children in the schema\'s order',
  /<w:color w:val="E03131"\/>/.test(tbRun) && /<w:u w:val="single"\/>/.test(tbRun) && orderFaults(xml).length === 0, {faults:orderFaults(xml), run:tbRun.slice(0, 300)});
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
const q3 = d2.addPage([595, 842]); q3.drawImage(scan, {x:0, y:0, width:595, height:842});   // a scanned page that already has its text (invisible, mode 3)
q3.drawText(' ', {x:0, y:0, size:1, font:H2});   // (puts the font into the page's resources)
const fk = q3.node.newFontDictionary(H2.name, H2.ref);
q3.pushOperators(pushGraphicsState(), beginText(), setFontAndSize(fk, 24), setTextRenderingMode(TextRenderingMode.Invisible), moveText(72, 700), showText(H2.encodeText('HIDDEN LAYER TEXT')), endText(), popGraphicsState());
const q4 = d2.addPage([595, 842]); q4.drawImage(scan, {x:0, y:0, width:595, height:842});   // a scan with a page number on it (real text)
q4.drawText('Page 7', {x:280, y:30, size:10, font:H2});
const photo = await d2.embedPng(Buffer.from((await Ev(() => { const c = document.createElement('canvas'); c.width = 600; c.height = 850; const g = c.getContext('2d'), gr = g.createLinearGradient(0, 0, 600, 850);
  gr.addColorStop(0, '#2a6fdb'); gr.addColorStop(1, '#f2c14e'); g.fillStyle = gr; g.fillRect(0, 0, 600, 850); return c.toDataURL('image/png'); })).split(',')[1], 'base64'));
d2.addPage([595, 842]).drawImage(photo, {x:0, y:0, width:595, height:842});   // a full-page photo: no text in it
const PDF2 = path.join(TMP, 'word2.pdf'); fs.writeFileSync(PDF2, await d2.save());
await app.evaluate(({BrowserWindow}, p) => BrowserWindow.getAllWindows()[0].webContents.send('open-path', p), PDF2);
await win.waitForFunction(() => window.__pdfapp.S.pages.length === 5 && /word2/.test(window.__pdfapp.S.name), null, {timeout:30000}); await win.waitForTimeout(1500);
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
  media2.length === 2 && z2[media2[0]].subarray(1, 4).toString() === 'PNG' && iPic > 0 && P2[iPic - 1].text === 'Before the picture.' && P2[iPic + 1].text === 'After the picture.', {media2, texts:P2.map(p => p.text || '[picture]')});
check('a scanned page, 文字辨識 on: its text is read (no picture of it); a scanned page that has its text already: that text, not the picture',
  /SCAN/.test(x2) && /12345/.test(x2) && P2.some(p => p.text === 'HIDDEN LAYER TEXT'), P2.map(p => p.text || '[picture]'));
check('a scan with only a page number on it is still read as a scan; a photo with no text in it stays a picture (nothing is lost)',
  (x2.match(/SCAN TEST/g) || []).length === 2 && media2.length === 2 && /<w:drawing>/.test(P2[P2.length - 1].x), P2.map(p => p.text || '[picture]'));
const ocrKept = await Ev(() => window.__pdfapp.findWorker());
check('(v1.0.47) after a conversion that used 文字辨識, with 尋找 closed: the OCR worker is let go', ocrKept === false, ocrKept);
const z3 = await exportTo(path.join(TMP, 'scan.docx'), {ocr:false}), x3 = z3 ? z3['word/document.xml'].toString('utf8') : '';
const media3 = z3 ? Object.keys(z3).filter(n => n.startsWith('word/media/')) : [];
check('文字辨識 off: each scanned page is one picture of the whole page (its page number in it), and no text is made up',
  media3.length === 4 && !/SCAN/.test(x3) && !/Page 7/.test(x3) && /HIDDEN LAYER TEXT/.test(x3), {media3, texts:paras(x3).map(p => p.text || '[picture]')});
// reading order: two columns 12 pt apart on one grid (with a footnote mark), a list, a one-line paragraph and an indented one;
// page 2 holds text on a hidden layer
const d4 = await PDFDocument.create(), H4 = await d4.embedFont(StandardFonts.Helvetica), c4 = d4.context;
const r1 = d4.addPage([595, 842]), fill = (words, w) => { const out = []; let line = ''; for (const wd of words) { const t = line ? line + ' ' + wd : wd; if (H4.widthOfTextAtSize(t, 10) > w) { out.push(line); line = wd; } else line = t; } out.push(line); return out; };
const tTitle = 'Two Column Study'; r1.drawText(tTitle, {x:(595 - H4.widthOfTextAtSize(tTitle, 18)) / 2, y:780, size:18, font:H4});
const words = n => Array.from({length:n}, (_, k) => ['alpha', 'beta', 'gamma', 'delta', 'epsilon', 'zeta', 'eta', 'theta'][k % 8] + (k + 1));
const L4 = fill(['Left'].concat(words(30)), 216), R4 = fill(['Right'].concat(words(30)), 216);
L4.forEach((t, k) => r1.drawText(t, {x:72, y:740 - k * 12, size:10, font:H4}));
R4.forEach((t, k) => r1.drawText(t, {x:300, y:740 - k * 12, size:10, font:H4}));
r1.drawText('1', {x:72 + H4.widthOfTextAtSize(L4[1], 10), y:728 + 3.5, size:6, font:H4});   // a footnote mark after the second left line
['1. Apples', '2. Oranges', '3. Pears'].forEach((t, k) => r1.drawText(t, {x:72, y:640 - k * 12, size:10, font:H4}));
r1.drawText('A short note.', {x:72, y:590, size:10, font:H4});
const ind = fill(['Indented'].concat(words(20)), 432);
r1.drawText(ind[0], {x:90, y:578, size:10, font:H4}); ind.slice(1).forEach((t, k) => r1.drawText(t, {x:72, y:566 - k * 12, size:10, font:H4}));
const r2 = d4.addPage([595, 842]);
r2.drawText('Visible text.', {x:72, y:760, size:12, font:H4});
const ocg = c4.register(c4.obj({Type:'OCG', Name:PDFString.of('Secret')}));
d4.catalog.set(PDFName.of('OCProperties'), c4.obj({OCGs:[ocg], D:{Order:[ocg], OFF:[ocg]}}));
r2.node.Resources().set(PDFName.of('Properties'), c4.obj({oc1:ocg}));
r2.pushOperators(PDFOperator.of('BDC', [PDFName.of('OC'), PDFName.of('oc1')]));
r2.drawText('SECRET LAYER TEXT', {x:72, y:700, size:12, font:H4});
r2.pushOperators(PDFOperator.of('EMC', []));
const PDF4 = path.join(TMP, 'word4.pdf'); fs.writeFileSync(PDF4, await d4.save());
await app.evaluate(({BrowserWindow}, p) => BrowserWindow.getAllWindows()[0].webContents.send('open-path', p), PDF4);
await win.waitForFunction(() => window.__pdfapp.S.pages.length === 2 && /word4/.test(window.__pdfapp.S.name), null, {timeout:30000}); await win.waitForTimeout(1500);
const z4 = await exportTo(path.join(TMP, 'order.docx')), x4 = z4 ? z4['word/document.xml'].toString('utf8') : '', T4 = paras(x4).map(p => p.text);
const leftText = L4.join(' ').replace(L4[1], L4[1] + '1'), rightText = R4.join(' ');
check('two columns 12 pt apart on one grid: the left column (with its footnote mark in place), then the right one', T4[0] === tTitle && T4[1] === leftText && T4[2] === rightText, T4.slice(0, 3));
check('a list of short lines stays three paragraphs; a one-line paragraph keeps to itself, the indented paragraph after it stays whole',
  JSON.stringify(T4.slice(3, 8)) === JSON.stringify(['1. Apples', '2. Oranges', '3. Pears', 'A short note.', ind.join(' ')]), T4.slice(3, 8));
check('text on a hidden layer is not converted', /Visible text\./.test(x4) && !/SECRET/.test(x4), T4.slice(-2));
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

await win.click('#wdCancel'); await win.waitForTimeout(400);   // (the window stayed open after 取消)
// ---- part 3: Microsoft Word (replaced in the main process here: Linux has no Word) ----------------------------------------
const pdfjs = await import('../../node_modules/pdfjs-dist/legacy/build/pdf.mjs');
const pageTexts = async bytes => { const dd = await pdfjs.getDocument({data:new Uint8Array(bytes), verbosity:0}).promise, out = [];
  for (let k = 1; k <= dd.numPages; k++) out.push((await (await dd.getPage(k)).getTextContent()).items.map(it => it.str).join(' ')); return out; };
await app.evaluate(({ipcMain}) => {
  global.__word = {sent:null, out:null, opened:null, fail:false};
  ipcMain.removeHandler('word:detect'); ipcMain.handle('word:detect', () => ({ok:true, version:16}));
  ipcMain.removeHandler('word:convert'); ipcMain.handle('word:convert', async (_e, id, pdf, out) => {
    if (global.__word.fail) return {ok:false, why:'word', msg:'測試用的錯誤'};
    global.__word.sent = Buffer.from(pdf).toString('base64'); global.__word.out = out; return {ok:true};
  });
  ipcMain.removeHandler('app:open-path'); ipcMain.handle('app:open-path', (_e, p) => { global.__word.opened = p; return ''; });
});
await win.locator('.dtab').first().click(); await win.waitForTimeout(1200);
await Ev(() => window.__pdfapp.scrollToPage(0)); await win.waitForTimeout(800);
await win.click('[data-tool="textbox"]'); await win.waitForTimeout(300);
const pb1 = await win.locator('.page').nth(0).boundingBox(), sc1 = await Ev(() => window.__pdfapp.S.scale);
await win.mouse.click(pb1.x + 300 * sc1, pb1.y + 470 * sc1); await win.waitForTimeout(300);
await win.keyboard.type('第一頁的方塊'); await win.waitForTimeout(200);
await win.keyboard.press('Escape'); await win.waitForTimeout(2500);
await Ev(() => window.__pdfapp.setTool('select')); await win.waitForTimeout(300);
await win.keyboard.press('Control+F'); await win.waitForTimeout(600);
await Ev(() => { const q = document.querySelector('#findQ'); q.value = 'Quarterly'; q.dispatchEvent(new Event('input', {bubbles:true})); }); await win.waitForTimeout(900);
await win.click('#findBar [data-fa="rep"]'); await Ev(() => { document.querySelector('#findR').value = 'Annual'; });
await win.click('#findBar [data-fa="all"]'); await win.waitForTimeout(4500);
await win.keyboard.press('Escape'); await win.waitForTimeout(500);
const OUT5 = path.join(TMP, 'byword.docx'); await answerSave(OUT5);
await win.click('[data-amenu="output"] .sp-arr'); await win.waitForTimeout(300);
await win.click('#toolMenu button:has-text("Word 檔")'); await win.waitForTimeout(800);
const dw = await Ev(() => ({name:window.__pdfapp.S.name, how:document.querySelector('#wdHow').value, wordOn:!document.querySelector('#wdHow option[value="word"]').disabled, ocrOff:document.querySelector('#wdOcr').disabled}));
check('Word on this computer: 「用 Microsoft Word 轉換」 is chosen; 掃描頁文字辨識 is off (Word reads scans itself)', dw.name === 'word.pdf' && dw.how === 'word' && dw.wordOn && dw.ocrOff, dw);
await Ev(() => { const s = document.querySelector('#wdScope'); s.value = 'range'; s.dispatchEvent(new Event('change', {bubbles:true})); const r = document.querySelector('#wdRange'); r.value = '1, 3'; r.dispatchEvent(new Event('input', {bubbles:true})); });
await win.waitForTimeout(200);
await win.click('#wdGo');
await win.waitForFunction(() => (document.querySelector('#wdGo') || {}).textContent === '開啟', null, {timeout:60000});
const sentB64 = await app.evaluate(() => global.__word.sent), sentOut = await app.evaluate(() => global.__word.out);
const sent = sentB64 ? Buffer.from(sentB64, 'base64') : null, sentDoc = sent ? await PDFDocument.load(sent) : null;
const sentTexts = sent ? await pageTexts(sent) : [];
check('Word gets the chosen pages (1 and 3) flattened: no annotations left, both text boxes (one beside a picture) written as real text, the replaced word only in its new form',
  !!sentDoc && sentDoc.getPageCount() === 2 && sentDoc.getPages().every(pg => { const an = pg.node.Annots(); return !an || an.size() === 0; })
  && /Annual Report/.test(sentTexts[0] || '') && !/Quarterly/.test(sentTexts[0] || '') && /第一頁的方塊/.test((sentTexts[0] || '').replace(/\s/g, '')) && /旋轉頁的方塊/.test((sentTexts[1] || '').replace(/\s/g, '')) && sentOut === OUT5,
  {pages:sentDoc && sentDoc.getPageCount(), sentTexts, sentOut});
await win.click('#wdGo'); await win.waitForTimeout(600);
const opened = await app.evaluate(() => global.__word.opened), closed = !(await Ev(() => document.querySelector('#mask').classList.contains('show')));
check('〔開啟〕 opens the .docx with the computer\'s program, and the window closes', opened === OUT5 && closed, {opened, closed});
await app.evaluate(() => { global.__word.fail = true; });
const OUT6 = path.join(TMP, 'fallback.docx'); await answerSave(OUT6);
await win.click('[data-amenu="output"] .sp-arr'); await win.waitForTimeout(300);
await win.click('#toolMenu button:has-text("Word 檔")'); await win.waitForTimeout(800);
await win.click('#wdGo');
await win.waitForFunction(() => /Word 轉換失敗/.test((document.querySelector('#wdErr') || {}).textContent || ''), null, {timeout:60000});
const failed1 = await Ev(() => ({err:document.querySelector('#wdErr').textContent, how:document.querySelector('#wdHow').value, go:document.querySelector('#wdGo').textContent}));
await win.click('#wdGo');
const fb = await waitFile(OUT6), zf = fb ? unzip(fs.readFileSync(OUT6)) : null;
check('Word fails: 「Word 轉換失敗：…」 and the built-in converter is chosen; 〔轉存〕 again makes the .docx that way',
  failed1.err.includes('測試用的錯誤') && failed1.how === 'builtin' && failed1.go === '轉存' && !!zf && /Annual Report/.test(zf['word/document.xml'].toString('utf8')) && !/Quarterly/.test(zf['word/document.xml'].toString('utf8')), {failed1, fb});
await win.click('#wdCancel'); await win.waitForTimeout(300);
const mainSrc = fs.readFileSync(path.join(ROOT, 'word.js'), 'utf8'), ps = (mainSrc.match(/const WORD_PS = `([\s\S]*?)`;/) || [])[1] || '';
check('the script Word runs: paths from the environment, opened read-only without asking, saved as .docx, Word always closed',
  ps.includes('$env:PDFE_IN') && ps.includes('$env:PDFE_OUT') && ps.includes('Documents.Open($in, $false, $true, $false)') && /SaveAs2\(\$out, 16\)/.test(ps) && /finally[\s\S]*Quit\(/.test(ps), ps.slice(0, 200));

// ---- part 4 (v1.0.47): a conversion under way (Esc, 取消, 取消 too late), a locked .docx, annotations with nothing to draw,
// one page of a large file. main's word:* stay replaced; the conversion now takes a while and can finish after 取消
await app.evaluate(({ipcMain}) => {
  Object.assign(global.__word, {fail:false, delay:0, lateOk:false, locked:false, cancelled:null});
  ipcMain.removeHandler('word:convert'); ipcMain.handle('word:convert', async (_e, id, pdf, out) => {
    const w = global.__word; await new Promise(res => setTimeout(res, w.delay));
    if (w.locked) return {ok:false, why:'locked', msg:'這個檔案正被其他程式（例如 Word）開著，或不能寫入：locked.docx。請先關閉它，或換一個檔名。'};
    if (w.cancelled === id && !w.lateOk) return {ok:false, why:'cancel'};
    w.out = out; return {ok:true};
  });
  ipcMain.removeHandler('word:cancel'); ipcMain.handle('word:cancel', (_e, id) => { global.__word.cancelled = id; });
});
const wdState = () => Ev(() => ({open:document.querySelector('#mask').classList.contains('show'), st:(document.querySelector('#wdSt') || {}).textContent || '',
  err:(document.querySelector('#wdErr') || {}).textContent || '', how:(document.querySelector('#wdHow') || {}).value, go:(document.querySelector('#wdGo') || {}).textContent}));
const openWord = async out => { await answerSave(out); await win.click('[data-amenu="output"] .sp-arr'); await win.waitForTimeout(300); await win.click('#toolMenu button:has-text("Word 檔")'); await win.waitForTimeout(800); };
const wdShown = () => Ev(() => document.querySelector('#mask').classList.contains('show') && !!document.querySelector('#wdCancel'));
const closeWord = async () => { if (await wdShown()) { await win.click('#wdCancel'); await win.waitForTimeout(400); } };
const waitSt = (re, ms = 20000) => win.waitForFunction(re => { const t = (document.querySelector('#wdSt') || {}).textContent || '', e = (document.querySelector('#wdErr') || {}).textContent || '';
  return new RegExp(re).test(t + '|' + e); }, re.source, {timeout:ms, polling:50}).catch(() => {});
await app.evaluate(() => { global.__word.delay = 5000; });
const OUT7 = path.join(TMP, 'esc.docx'); await openWord(OUT7);
await win.click('#wdGo'); await waitSt(/Word 轉換中/);
await win.keyboard.press('Escape'); await win.waitForTimeout(300);
if ((await wdState()).open) { const mb = await win.locator('#mask').boundingBox(); await win.mouse.click(mb.x + 6, mb.y + 6); await win.waitForTimeout(300); }
const esc = await wdState(), escCancel = await app.evaluate(() => global.__word.cancelled);
check('Esc or a click outside during a conversion: the window stays and the conversion goes on', esc.open && /Word 轉換中/.test(esc.st) && !escCancel, {esc, escCancel});
if (await wdShown()) await win.click('#wdCancel');
await win.waitForTimeout(120); const cancelling = await wdState();
await waitSt(/已取消/); const cancelled = await wdState();
check('〔取消〕: 「取消中…」 at once; then 「已取消」, the window stays to try again', /取消中/.test(cancelling.st) && cancelled.open && cancelled.st === '已取消' && cancelled.go === '轉存', {cancelling, cancelled});
// 取消 that comes too late: Word had finished
await app.evaluate(() => { Object.assign(global.__word, {delay:2500, lateOk:true, cancelled:null}); });
const OUT8 = path.join(TMP, 'late.docx');
await win.waitForFunction(() => !window.__pdfapp.wordJob(), null, {timeout:15000}).catch(() => {});
if ((await wdState()).open) await answerSave(OUT8); else await openWord(OUT8);
await win.click('#wdGo'); await waitSt(/Word 轉換中/);
if (await wdShown()) await win.click('#wdCancel');
await waitSt(/轉好了|已轉存|已取消/);
const late = await wdState();
check('取消 that comes after Word has finished: it says the .docx was made anyway, and 〔開啟〕 opens it', /按取消時 Word 已經轉好了/.test(late.st) && late.go === '開啟', late);
await closeWord();
// the .docx is open in Word: the message says so, and Word stays chosen (the built-in converter would fail the same way)
await app.evaluate(() => { Object.assign(global.__word, {delay:0, lateOk:false, locked:true}); });
await openWord(path.join(TMP, 'locked.docx')); await win.click('#wdGo'); await waitSt(/開著|失敗/);
const lk = await wdState();
check('a .docx that is open in Word: the message says so, and Word stays chosen', /正被其他程式/.test(lk.err) && !/Word 轉換失敗/.test(lk.err) && lk.how === 'word', lk);
await closeWord(); await app.evaluate(() => { global.__word.locked = false; });
// the built-in converter cannot write it (open elsewhere, or not a file — a folder of that name here)
const DIRT = path.join(TMP, 'a folder.docx'); fs.mkdirSync(DIRT);
await openWord(DIRT);
await Ev(() => { const h = document.querySelector('#wdHow'); h.value = 'builtin'; h.dispatchEvent(new Event('change', {bubbles:true})); });
await win.click('#wdGo'); await waitSt(/開著|不能寫入|失敗/, 60000);
const wf = await wdState(), tmpLeft = fs.readdirSync(TMP).filter(n => n.includes('pdfeditor-tmp'));
check('the built-in converter cannot write the .docx: it says so plainly; no temporary file is left beside it',
  /正被其他程式.*開著，或不能寫入/.test(wf.err) && !/EISDIR|invoking/.test(wf.err) && !tmpLeft.length, {wf, tmpLeft});
await closeWord();
// annotations with nothing to draw, and a big picture on the page not chosen (an outline points at that page)
const d5 = await PDFDocument.create(), H5 = await d5.embedFont(StandardFonts.Helvetica), c5 = d5.context;
const p51 = d5.addPage([595, 842]), p52 = d5.addPage([595, 842]);
p51.drawText('Annotations without an appearance', {x:72, y:770, size:14, font:H5});
p52.drawText('A page with a big picture', {x:72, y:770, size:14, font:H5});
const BW = 640, big = Buffer.alloc(BW * BW * 3); for (let k = 0; k < big.length; k++) big[k] = (Math.random() * 256) | 0;   // (does not compress)
const imName = p52.node.newXObject('Im', c5.register(c5.stream(big, {Type:'XObject', Subtype:'Image', Width:BW, Height:BW, ColorSpace:'DeviceRGB', BitsPerComponent:8})));
p52.pushOperators(pushGraphicsState(), PDFOperator.of('cm', [300, 0, 0, 300, 100, 300].map(v => c5.obj(v))), PDFOperator.of('Do', [imName]), popGraphicsState());
const olRef = c5.register(c5.obj({Type:'Outlines', Count:1})), itRef = c5.register(c5.obj({Title:PDFString.of('Page 2'), Parent:olRef, Dest:[p52.ref, PDFName.of('Fit')]}));
c5.lookup(olRef).set(PDFName.of('First'), itRef); c5.lookup(olRef).set(PDFName.of('Last'), itRef); d5.catalog.set(PDFName.of('Outlines'), olRef);
const sqAP = c5.register(c5.stream('0 0 1 rg 0 0 50 50 re f', {Type:'XObject', Subtype:'Form', BBox:[0, 0, 50, 50]}));
const field = c5.register(c5.obj({Type:'Annot', Subtype:'Widget', FT:'Tx', T:PDFString.of('name'), V:PDFString.of('Hello'), Rect:[72, 600, 272, 620], F:4, P:p51.ref}));
const anns5 = [
  c5.register(c5.obj({Type:'Annot', Subtype:'Highlight', Rect:[70, 762, 330, 790], QuadPoints:[70, 790, 330, 790, 70, 762, 330, 762], C:[1, 1, 0], F:4})),   // another program's highlight, no /AP
  field,   // a form field waiting for NeedAppearances
  c5.register(c5.obj({Type:'Annot', Subtype:'Square', Rect:[100, 400, 150, 450], F:4, AP:{N:sqAP}})),   // drawn: not counted
  c5.register(c5.obj({Type:'Annot', Subtype:'Text', Rect:[400, 700, 420, 720], Contents:PDFString.of('a note')})),   // a sticky note: never converted
  c5.register(c5.obj({Type:'Annot', Subtype:'Highlight', Rect:[70, 500, 330, 520], QuadPoints:[70, 520, 330, 520, 70, 500, 330, 500], F:2})),   // hidden: not counted
];
p51.node.set(PDFName.of('Annots'), c5.obj(anns5));
d5.catalog.set(PDFName.of('AcroForm'), c5.obj({Fields:[field], NeedAppearances:true}));
const PDF5 = path.join(TMP, 'word5.pdf'); fs.writeFileSync(PDF5, await d5.save());
await app.evaluate(({BrowserWindow}, p) => BrowserWindow.getAllWindows()[0].webContents.send('open-path', p), PDF5);
await win.waitForFunction(() => window.__pdfapp.S.pages.length === 2 && /word5/.test(window.__pdfapp.S.name), null, {timeout:30000}); await win.waitForTimeout(1500);
const fl1 = await Ev(async () => { const r = await window.__pdfapp.flatten([0]); return {size:r.bytes.length, skipped:r.skipped}; });
const flAll = await Ev(async () => { const r = await window.__pdfapp.flatten([0, 1]); return {size:r.bytes.length, skipped:r.skipped}; });
check('annotations with nothing to draw (another program\'s highlight, a field waiting for its appearance) are counted as left out', fl1.skipped === 2 && flAll.skipped === 2, {fl1, flAll});
check('one page of a file whose other page holds a big picture: the copy leaves that picture out', fl1.size < 150000 && flAll.size > 1000000, {fl1, flAll});
const OUT10 = path.join(TMP, 'skipped.docx'); await openWord(OUT10);
await Ev(() => { const h = document.querySelector('#wdHow'); h.value = 'builtin'; h.dispatchEvent(new Event('change', {bubbles:true}));
  const s = document.querySelector('#wdScope'); s.value = 'range'; s.dispatchEvent(new Event('change', {bubbles:true})); const r = document.querySelector('#wdRange'); r.value = '1'; r.dispatchEvent(new Event('input', {bubbles:true})); });
await win.click('#wdGo'); const okSk = await waitFile(OUT10, 60000); await waitSt(/已轉存/);
const sk = await wdState(), zsk = okSk ? unzip(fs.readFileSync(OUT10)) : null;
check('the finished message says how many annotations were left out', /2 個註解/.test(sk.st) && !!zsk && /Annotations without an appearance/.test(zsk['word/document.xml'].toString('utf8')), sk);
await closeWord();

console.log(failed ? `\n${failed} check(s) failed` : '\nall checks passed');
await app.evaluate(({app}) => app.exit(0)).catch(() => {});
