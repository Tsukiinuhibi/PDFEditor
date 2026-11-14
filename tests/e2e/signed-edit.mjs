// A PDF someone else signed: the first change in its tab says that it breaks the signature (the original file is not
// touched; 復原 brings it back); later changes in the tab do not say it again. Usage rights alone (/Perms /UR3, a
// Reader-extended form) say nothing; a signed file still encrypted says only that it cannot be changed. While the
// program is busy, Ctrl+W and Ctrl+Tab neither close nor switch tabs.
import { launchPath, TMP, ROOT } from './_env.mjs';
import { PDFDocument, PDFName, PDFString, PDFHexString } from 'pdf-lib';
import fs from 'fs';
import path from 'path';

let failed = 0;
const check = (name, ok, detail = '') => { console.log(`${ok ? '✔' : '✘'} ${name}${detail !== '' ? '  ' + (typeof detail === 'string' ? detail : JSON.stringify(detail)) : ''}`); if (!ok) { failed++; process.exitCode = 1; } };

// a signature field whose value is a signature dictionary (with /ByteRange); or usage rights only (/Perms /UR3)
const make = async (name, {field = true, ur3 = false} = {}) => {
  const d = await PDFDocument.create(), ctx = d.context, N = n => PDFName.of(n), p = d.addPage([595, 842]);
  const sig = () => ctx.register(ctx.obj({Type:'Sig', Filter:'Adobe.PPKLite', SubFilter:'adbe.pkcs7.detached', ByteRange:[0, 10, 20, 30], Contents:PDFHexString.of('3082000A')}));
  if (field) {
    const f = ctx.register(ctx.obj({Type:'Annot', Subtype:'Widget', FT:'Sig', T:PDFString.of('sig1'), V:sig(), Rect:[0, 0, 0, 0], P:p.ref, F:132}));
    p.node.set(N('Annots'), ctx.obj([f]));
    d.catalog.set(N('AcroForm'), ctx.obj({Fields:[f], SigFlags:3}));
  }
  if (ur3) d.catalog.set(N('Perms'), ctx.obj({UR3:sig()}));
  const out = path.join(TMP, name); fs.writeFileSync(out, await d.save()); return out;
};
const SIGNED = await make('signed.pdf'), UR3 = await make('extended.pdf', {field:false, ur3:true});
const ENC = path.join(TMP, 'signed-aes128.pdf'); fs.copyFileSync(path.join(ROOT, 'tests', 'e2e', 'fixtures', 'encrypted', 'signed-aes128.pdf'), ENC);

const { app } = await launchPath(SIGNED);
const win = await app.firstWindow();
let expectErrors = false;
win.on('pageerror', e => console.log('PAGEERR', e.message));
win.on('console', m => { if (m.type() === 'error' && !expectErrors) console.log('C', m.text().slice(0, 300)); });
await win.waitForFunction(() => !!(window.__pdfapp && window.__pdfapp.S.pages.length), null, {timeout:30000});
await win.waitForTimeout(1500);
const Ev = win.evaluate.bind(win);
await Ev(() => { window.__toasts = []; new MutationObserver(ms => ms.forEach(m => m.addedNodes.forEach(n => n.classList && n.classList.contains('toast') && window.__toasts.push(n.textContent))))
  .observe(document.querySelector('#toasts'), {childList:true}); });
const toasts = () => Ev(() => window.__toasts.splice(0));
const tabs = () => Ev(() => document.querySelectorAll('.dtab').length);
const S = () => Ev(() => { const S = window.__pdfapp.S; return {name:S.name, undo:S.undo.length, dirty:S.dirty}; });
const squares = () => Ev(async () => (await window.__pdfapp.getAnns(window.__pdfapp.S.current)).filter(a => a.subtype === 'Square').length);
const dialog = () => Ev(() => document.querySelector('#mask').classList.contains('show') ? (document.querySelector('#modal .mh') || {}).textContent || '' : null);
const open = async p => {
  const n = await tabs();
  await app.evaluate(({BrowserWindow}, p) => BrowserWindow.getAllWindows()[0].webContents.send('open-path', p), p);
  await win.waitForFunction(n => document.querySelectorAll('.dtab').length > n, n, {timeout:15000}).catch(() => {});
  await win.waitForTimeout(1800);
};
const drawRect = async () => {
  await win.click('[data-view="single"]'); await win.waitForTimeout(400);
  await Ev(() => window.__pdfapp.setTool('rect')); await win.waitForTimeout(300);
  const box = await win.locator('.page').first().boundingBox();
  await win.mouse.move(box.x + 120, box.y + 120); await win.mouse.down(); await win.mouse.move(box.x + 260, box.y + 220, {steps:5}); await win.mouse.up();
  await win.waitForTimeout(2200);
};

// ---- signed by someone else: the first change says it breaks the signature; later ones do not --------------------------
await toasts();
await drawRect();
let d = await dialog(), t = await toasts(), s = await S();
check('a signed PDF: the first change is made and a notice says it breaks the signature (the original untouched, 復原 brings it back)',
  d === null && (await squares()) === 1 && s.undo === 1 && t.some(x => x.includes('數位簽章') && x.includes('失效') && x.includes('復原')), {d, t, s});
await drawRect();
t = await toasts();
check('the next change in the same tab: made, no notice again', (await squares()) === 2 && !t.some(x => x.includes('數位簽章')), t);
await win.keyboard.press('Control+z'); await win.waitForTimeout(1800);
await drawRect();
t = await toasts();
check('after 復原 and another change: still no notice in this tab', (await squares()) === 2 && !t.some(x => x.includes('數位簽章')), t);

// ---- usage rights only (Reader-extended form): no question -------------------------------------------------------------
await open(UR3); await toasts();
await drawRect();
t = await toasts();
check('usage rights only (/Perms /UR3): the rectangle made, no notice about a signature', (await squares()) === 1 && (await S()).name === 'extended.pdf' && !t.some(x => x.includes('數位簽章')), t);

// ---- busy: Ctrl+W and Ctrl+Tab do nothing (on a tab with no changes, which Ctrl+W would close at once) ---------------
const PLAIN = path.join(TMP, 'plain.pdf'); fs.copyFileSync(path.join(ROOT, 'tests', 'e2e', 'fixtures', 'sample.pdf'), PLAIN);
await open(PLAIN);
const n0 = await tabs(), on0 = await Ev(() => window.__pdfapp.S.name);
await Ev(() => { window.__pdfapp.mutate('slow', async () => { await new Promise(r => setTimeout(r, 1800)); }); });
await win.waitForTimeout(300);
await win.keyboard.press('Control+w'); await win.waitForTimeout(150);
await win.keyboard.press('Control+Tab'); await win.waitForTimeout(2600);
check('while a change is being made, Ctrl+W and Ctrl+Tab neither close nor switch the tab (and open no window)', (await tabs()) === n0 && (await Ev(() => window.__pdfapp.S.name)) === on0 && (await dialog()) === null,
  {tabs:await tabs(), was:n0, on:await Ev(() => window.__pdfapp.S.name), dialog:await dialog()});

// ---- a signed file that is still encrypted: says so, without asking about the signature ----------------------------------
await open(ENC); await toasts();
expectErrors = true;
await drawRect();
expectErrors = false;
d = await dialog(); t = await toasts();
check('a signed 「限制編輯」 file (kept encrypted): 「有加密保護」, no notice about the signature, nothing changed', d === null && t.some(x => x.includes('有加密保護')) && !t.some(x => x.includes('數位簽章')) && (await S()).undo === 0, {d, t});

await app.evaluate(({app}) => app.exit(0)).catch(() => {});
console.log(failed ? `${failed} check(s) failed` : 'all checks passed');
