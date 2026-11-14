// 「限制編輯」 PDFs (encrypted, no password needed to open them): they open decrypted, with a notice saying so, and can be
// changed, undone and saved as a new file without the encryption (the original file untouched). A signed one is left
// as it is; a change to it says plainly why it cannot be made and leaves no undo step behind. A file that needs a
// password says so. The attachments tab opens a PDF attachment in a new tab; a PDF portfolio says where its files are.
import { launch, TMP, ROOT } from './_env.mjs';
import { PDFDocument, PDFName, StandardFonts } from 'pdf-lib';
import fs from 'fs';
import path from 'path';

let failed = 0;
const check = (name, ok, detail = '') => { console.log(`${ok ? '✔' : '✘'} ${name}${detail !== '' ? '  ' + (typeof detail === 'string' ? detail : JSON.stringify(detail)) : ''}`); if (!ok) { failed++; process.exitCode = 1; } };
const FIX = path.join(ROOT, 'tests', 'e2e', 'fixtures', 'encrypted');
const copy = (f, as = f) => { const p = path.join(TMP, as); fs.copyFileSync(path.join(FIX, f), p); return p; };

// a PDF portfolio: a blank Letter cover page; A.pdf (2 pages), B.pdf (3 pages) and notes.txt inside
const inner = async (label, n) => {
  const d = await PDFDocument.create(), f = await d.embedFont(StandardFonts.Helvetica);
  for (let i = 1; i <= n; i++) d.addPage([595, 842]).drawText(`${label}${i}`, {x:60, y:600, size:96, font:f});
  return d.save();
};
const PORT = path.join(TMP, 'portfolio.pdf');
{
  const d = await PDFDocument.create(); d.addPage([612, 792]);
  await d.attach(await inner('A', 2), 'A.pdf', {mimeType:'application/pdf'});
  await d.attach(await inner('B', 3), 'B.pdf', {mimeType:'application/pdf'});
  await d.attach(new TextEncoder().encode('hello'), 'notes.txt', {mimeType:'text/plain'});
  d.catalog.set(PDFName.of('Collection'), d.context.obj({Type:'Collection', View:'D'}));
  fs.writeFileSync(PORT, await d.save());
}

const { app } = await launch('host.pdf');
const win = await app.firstWindow();
win.on('pageerror', e => console.log('PAGEERR', e.message));
let expectErrors = false;   // (while a change to an encrypted file is meant to fail, its error in the console is expected)
win.on('console', m => { if (m.type() === 'error' && !expectErrors && !/PasswordException|No password given|Incorrect Password/.test(m.text())) console.log('C', m.text().slice(0, 300)); });
await win.waitForFunction(() => !!(window.__pdfapp && window.__pdfapp.S.pages.length), null, {timeout:30000});
await win.waitForTimeout(1200);
const Ev = win.evaluate.bind(win);
await app.evaluate(({dialog}, TMP) => { let n = 0; dialog.showSaveDialog = async () => ({canceled:false, filePath: TMP + '/out-' + (++n) + '.pdf'}); dialog.showMessageBox = async () => ({response:0}); }, TMP);
await Ev(() => { window.__toasts = []; new MutationObserver(ms => ms.forEach(m => m.addedNodes.forEach(n => n.classList && n.classList.contains('toast') && window.__toasts.push(n.textContent))))
  .observe(document.querySelector('#toasts'), {childList:true}); });
const toasts = () => Ev(() => window.__toasts.splice(0));
const tabs = () => Ev(() => document.querySelectorAll('.dtab').length);
const S = () => Ev(() => { const S = window.__pdfapp.S; return {name:S.name, pages:S.pages.length, undo:S.undo.length, dirty:S.dirty,
  encrypted:new TextDecoder('latin1').decode(S.bytes).includes('/Encrypt')}; });
const open = async (p, tab = true) => {
  const n = await tabs();
  await app.evaluate(({BrowserWindow}, p) => BrowserWindow.getAllWindows()[0].webContents.send('open-path', p), p);
  if (tab) await win.waitForFunction(n => document.querySelectorAll('.dtab').length > n, n, {timeout:15000}).catch(() => {});
  await win.waitForTimeout(tab ? 1800 : 3000);
};
const anns = () => Ev(async () => (await window.__pdfapp.getAnns(window.__pdfapp.S.current)).map(a => a.subtype));
const drawRect = async () => {
  await win.click('[data-view="single"]'); await win.waitForTimeout(400);
  await Ev(() => window.__pdfapp.setTool('rect')); await win.waitForTimeout(300);
  const box = await win.locator('.page').first().boundingBox();
  await win.mouse.move(box.x + 120, box.y + 120); await win.mouse.down(); await win.mouse.move(box.x + 260, box.y + 220, {steps:5}); await win.mouse.up();
  await win.waitForTimeout(2200);
};
// page 1 of the file on disk (pdf.js reads the encryption itself) against page 1 of what the tab holds
const sameAsFile = p => Ev(async p => {
  const raw = await window.desktop.readFile(p);
  const render = async bytes => { const d = await window.pdfjsLib.getDocument({data:bytes, isEvalSupported:false}).promise, pg = await d.getPage(1), vp = pg.getViewport({scale:1});
    const c = document.createElement('canvas'); c.width = vp.width; c.height = vp.height; await pg.render({canvasContext:c.getContext('2d'), viewport:vp}).promise;
    const px = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; d.destroy(); return px; };
  const a = await render(new Uint8Array(raw.data)), b = await render(window.__pdfapp.S.bytes.slice());
  let n = 0, ink = 0; for (let i = 0; i < a.length; i += 4) { if (Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]) > 30) n++; if (a[i] < 128) ink++; }
  return {diff:n / (a.length / 4), ink};
}, p);

// ---- an AES-128 file (object streams): open, change, undo, save as ------------------------------------------------------
const A = copy('r4-aes128.pdf'), before = fs.readFileSync(A);
await toasts();
await open(A);
let t = await toasts(), s = await S();
check('「限制編輯」 file opened: a notice says the protection was taken off and new copies will not have it; the tab holds it decrypted',
  t.some(x => x.includes('限制編輯') && x.includes('另存的新檔')) && s.name === 'r4-aes128.pdf' && s.pages === 2 && !s.encrypted && !s.dirty, {t, s});
const sm = await sameAsFile(A);
check('its pages look exactly as the file does', sm.diff < 0.01 && sm.ink > 500, sm);
await drawRect();
t = await toasts(); s = await S();
check('a rectangle drawn on it: made, one undo step', t.some(x => x.includes('已加入矩形')) && s.undo === 1 && s.dirty && (await anns()).includes('Square'), {t, s});
await win.keyboard.press('Control+z'); await win.waitForTimeout(1800);
s = await S();
check('undone', s.undo === 0 && !(await anns()).includes('Square'), s);
await drawRect();
await win.keyboard.press('Control+s'); await win.waitForTimeout(2500);
const out = path.join(TMP, 'out-1.pdf');
let saved = null;
if (fs.existsSync(out)) try { const d = await PDFDocument.load(fs.readFileSync(out), {updateMetadata:false}); const p1 = d.getPages()[0];
  saved = {encrypt:fs.readFileSync(out).includes('/Encrypt'), pages:d.getPageCount(), square:(p1.node.Annots() ? p1.node.Annots().asArray() : []).some(r => d.context.lookup(r).get(PDFName.of('Subtype')) === PDFName.of('Square'))}; }
  catch (e) { saved = {error:String(e.message || e).slice(0, 120)}; }
check('saved as a new file: no encryption, the rectangle in it; the original file not touched', !!saved && !saved.encrypt && saved.pages === 2 && saved.square && Buffer.compare(before, fs.readFileSync(A)) === 0, saved);

// ---- RC4 40-bit and AES-256 ------------------------------------------------------------------------------------------
for (const f of ['r2-rc4-40.pdf', 'r6-aes256.pdf']) {
  await open(copy(f)); await toasts();
  await drawRect();
  t = await toasts(); s = await S();
  check(`${f}: opened decrypted, a rectangle made`, s.name === f && !s.encrypted && s.undo === 1 && t.some(x => x.includes('已加入矩形')), {t, s});
}

// ---- signed: left encrypted; a change says why it cannot be made and leaves nothing behind ------------------------------
await open(copy('signed-aes128.pdf'));
t = await toasts(); s = await S();
check('a signed 「限制編輯」 file: opened as it is (not decrypted, so the signature is not touched), no notice', s.name === 'signed-aes128.pdf' && s.pages === 2 && s.encrypted && !t.some(x => x.includes('限制編輯')), {t, s});
expectErrors = true;
await drawRect();
expectErrors = false;
t = await toasts(); s = await S();
check('a change to it: 「這份 PDF 有加密保護，PDF 工作台無法修改它」; no undo step, the tab not marked changed, nothing added',
  t.some(x => x.includes('有加密保護') && x.includes('無法修改')) && !t.some(x => x.includes('No password')) && s.undo === 0 && !s.dirty && !(await anns()).includes('Square'), {t, s});

// ---- needs a password: as before ---------------------------------------------------------------------------------------
let n0 = await tabs();
await open(copy('r6-userpw.pdf'), false);
t = await toasts();
check('a file that needs a password to open: 「此 PDF 受密碼保護」 as before, no tab', t.some(x => x.includes('受密碼保護')) && (await tabs()) === n0, t);

// ---- not decrypted (test hook): a change fails plainly and leaves nothing behind -----------------------------------------
await Ev(() => window.__pdfapp.setNoDecrypt && window.__pdfapp.setNoDecrypt(true));
await open(copy('r4-aes128.pdf', 'kept.pdf'));
await toasts();
expectErrors = true;
await drawRect();
expectErrors = false;
t = await toasts(); s = await S();
check('an encrypted file kept as it is: a change says why it cannot be made; no undo step, not marked changed', s.name === 'kept.pdf' && s.encrypted
  && t.some(x => x.includes('有加密保護')) && s.undo === 0 && !s.dirty, {t, s});
await Ev(() => window.__pdfapp.setNoDecrypt && window.__pdfapp.setNoDecrypt(false));

// ---- a PDF portfolio: a notice; its PDF attachments open in a new tab ---------------------------------------------------
await open(PORT);
t = await toasts();
check('a PDF portfolio opened: 「這是 PDF 包」 says its files are in the 附件 tab', t.some(x => x.includes('這是 PDF 包') && x.includes('附件')), t);
await win.click('[data-tab="atts"]'); await win.waitForTimeout(1200);
const rows = await Ev(() => [...document.querySelectorAll('#p-atts .att')].map(r => ({name:r.querySelector('.nm').textContent, open:!!r.querySelector('[data-x=open]')})));
check('附件: A.pdf and B.pdf have 〔開啟〕, notes.txt has not', rows.length === 3 && rows.filter(r => r.open).map(r => r.name).sort().join() === 'A.pdf,B.pdf' && rows.some(r => r.name === 'notes.txt' && !r.open), rows);
n0 = await tabs();
await win.click('#p-atts .att:has(.nm:text-is("A.pdf")) [data-x=open]'); await win.waitForTimeout(2200);
s = await S();
check('〔開啟〕 on A.pdf: a new tab with its 2 pages', (await tabs()) === n0 + 1 && s.name === 'A.pdf' && s.pages === 2, s);

await app.evaluate(({app}) => app.exit(0)).catch(() => {});
console.log(failed ? `${failed} check(s) failed` : 'all checks passed');
