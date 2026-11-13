// 轉存 Word: the document as it is now (our annotations flattened onto the pages) becomes an editable .docx — by
// Microsoft Word when it is installed, otherwise by the built-in converter (text → paragraphs, sizes, bold, italic,
// pictures, scanned pages). The save dialog is answered by the test; the .docx is unzipped and read.
import { launchPath, TMP } from './_env.mjs';
import { PDFDocument, StandardFonts } from 'pdf-lib';
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
const waitFile = async (f, ms = 60000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (fs.existsSync(f) && fs.statSync(f).size > 0) { await win.waitForTimeout(300); return true; } await win.waitForTimeout(250); } return false; };
const dlg = () => Ev(() => { const g = document.querySelector('#wdGo'); if (!g || !document.querySelector('#mask').classList.contains('show')) return null;
  const how = document.querySelector('#wdHow');
  return {title:document.querySelector('#modal .mh').textContent, how:how.value, wordOff:how.querySelector('option[value="word"]').disabled, note:(document.querySelector('#wdNote') || {}).textContent || '', go:g.disabled}; });

// ---- part 1: the built-in converter, text ---------------------------------------------------------------------------------
// a text box on the turned page 3
await Ev(() => window.__pdfapp.scrollToPage(2)); await win.waitForTimeout(800);
await win.click('[data-tool="textbox"]'); await win.waitForTimeout(300);
const pb = await win.locator('.page').nth(2).boundingBox();
await win.mouse.click(pb.x + 120, pb.y + 140); await win.waitForTimeout(300);
await win.keyboard.type('旋轉頁的方塊'); await win.waitForTimeout(200);
await win.keyboard.press('Escape'); await win.waitForTimeout(2500);
const before = await Ev(() => ({undo:window.__pdfapp.S.undo.length, dirty:window.__pdfapp.S.dirty}));
const OUT = path.join(TMP, 'out.docx');
await answerSave(OUT);
await win.click('[data-amenu="output"] .sp-arr'); await win.waitForTimeout(300);
await win.click('#toolMenu button:has-text("Word 檔")'); await win.waitForTimeout(600);
const d = await dlg();
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
check('the paragraphs, in order: the title, two English ones (lines joined with a space), the Chinese one (no space), Page two, the text box',
  JSON.stringify(texts) === JSON.stringify(['Quarterly Report', 'The first paragraph has two lines of text that continue on the second line.', 'Second paragraph: A&B <x> are kept, and it ends here.', '第一行的中文字寫到這裡第二行接在後面。', 'Page two', '旋轉頁的方塊']), texts);
check('the title is bold, 24 pt and centred; & < > are escaped in the XML', !!at('Quarterly') && /<w:b\/>/.test(at('Quarterly').x) && /<w:sz w:val="48"\/>/.test(at('Quarterly').x) && /<w:jc w:val="center"\/>/.test(at('Quarterly').x) && xml.includes('A&amp;B &lt;x&gt;'), at('Quarterly') && at('Quarterly').x.slice(0, 400));
const sects = xml.match(/<w:sectPr>[\s\S]*?<\/w:sectPr>/g) || [];
check('one section per page, the second one landscape (842 × 595 pt)', sects.length === 3 && /w:w="16840" w:h="11900" w:orient="landscape"/.test(sects[1]) && !/landscape/.test(sects[0]), sects.map(s => s.slice(0, 160)));
const after = await Ev(() => ({undo:window.__pdfapp.S.undo.length, dirty:window.__pdfapp.S.dirty}));
check('the document itself is unchanged (no undo step, same unsaved state)', JSON.stringify(before) === JSON.stringify(after), {before, after});

console.log(failed ? `\n${failed} check(s) failed` : '\nall checks passed');
await app.evaluate(({app}) => app.exit(0)).catch(() => {});
