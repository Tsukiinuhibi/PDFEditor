// 匯出／匯入設定檔: 設定 → 設定檔 saves the program's settings (the localStorage keys starting with pdfeditor.) to a
// .json file and reads one back, then the program reloads.
import { launch, ROOT, TMP } from './_env.mjs';
import fs from 'fs';
import path from 'path';

let failed = 0;
const check = (name, ok, detail = '') => { console.log(`${ok ? '✔' : '✘'} ${name}${detail !== '' ? '  ' + (typeof detail === 'string' ? detail : JSON.stringify(detail)) : ''}`); if (!ok) { failed++; process.exitCode = 1; } };
const PKG = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
const { app } = await launch('sf1.pdf');
const win = await app.firstWindow(); win.on('pageerror', e => console.log('PAGEERR', e.message)); win.on('console', m => { if (m.type() === 'error') console.log('C', m.text().slice(0, 300)); });
await win.waitForTimeout(3000);
const A = win.evaluate.bind(win);
const toasts = () => A(() => [...document.querySelectorAll('#toasts .toast')].map(t => t.textContent));
const LS = k => A(k => localStorage.getItem(k), k);
// the save dialog, answered by the test in the main process (null: cancelled)
const answerSave = p => app.evaluate(({dialog}, p) => { global.__saved = []; dialog.showSaveDialog = async (w, o) => { global.__saved.push(o.defaultPath); return p ? {canceled:false, filePath:p} : {canceled:true}; }; }, p);
const asked = () => app.evaluate(() => global.__saved);
const openFileTab = async () => { await win.click('#bSettings'); await win.waitForTimeout(400); await win.click('#modal [data-st="file"]'); await win.waitForTimeout(300); };

// ---- part 1: export ---------------------------------------------------------------------------------------------------
const PEOPLE = JSON.stringify({names:['root', '王小明'], def:'王小明'});
await A(P => { localStorage.setItem('pdfeditor.theme', 'dark'); localStorage.setItem('pdfeditor.people.v1', P); localStorage.setItem('pdfeditor.fontcat.v2', '{"x":1}'); }, PEOPLE);
const FILE = path.join(TMP, 'settings.json');
await answerSave(FILE);
await openFileTab();
await win.click('#modal [data-sf="export"]'); await win.waitForTimeout(800);
const j = fs.existsSync(FILE) ? JSON.parse(fs.readFileSync(FILE, 'utf8')) : null;
check('匯出: a PDF 工作台 settings file of this version', !!j && j.app === 'PDF 工作台' && j.kind === 'settings' && j.version === PKG.version && !isNaN(Date.parse(j.exported)), j && {app:j.app, kind:j.kind, version:j.version, exported:j.exported});
check('匯出: the settings as they are stored', !!j && j.settings['pdfeditor.theme'] === 'dark' && j.settings['pdfeditor.people.v1'] === PEOPLE, j && Object.keys(j.settings));
check('匯出: not the font list cache, not the version record', !!j && !('pdfeditor.fontcat.v2' in j.settings) && !('pdfeditor.seenversion.v1' in j.settings) && !!(await LS('pdfeditor.seenversion.v1')), j && Object.keys(j.settings));
const sv = await asked();
check('匯出: the file name offered, then the message', !!sv && sv.length === 1 && /^PDF工作台-設定-\d{8}\.json$/.test(path.basename(sv[0])) && (await toasts()).some(t => t.includes('已匯出設定')), {sv, t:await toasts()});
const mtime = fs.existsSync(FILE) ? fs.statSync(FILE).mtimeMs : 0;
await A(() => document.querySelectorAll('#toasts .toast').forEach(t => t.remove()));
await answerSave(null);
if (!(await A(() => !!document.querySelector('#modal [data-sf="export"]')))) await openFileTab();
await win.click('#modal [data-sf="export"]'); await win.waitForTimeout(800);
check('匯出 cancelled: the save dialog was shown; no message, the file not written again', !!j && ((await asked()) || []).length === 1 && !(await toasts()).some(t => t.includes('已匯出設定')) && fs.statSync(FILE).mtimeMs === mtime, {asked:await asked(), t:await toasts()});
// the opened PDF picked in the save dialog: refused (never overwrite the user's file), asked again
const PDF = path.join(TMP, 'sf1.pdf'), pdf0 = fs.readFileSync(PDF);
const FILE2 = path.join(TMP, 'settings2.json');
await app.evaluate(({dialog}, [pdf, f2]) => { global.__saved = []; global.__boxes = 0; let n = 0;
  dialog.showSaveDialog = async (w, o) => { global.__saved.push(o.defaultPath); n++; return {canceled:false, filePath:n === 1 ? pdf : f2}; };
  dialog.showMessageBox = async () => { global.__boxes++; return {response:0}; }; }, [PDF, FILE2]);
await win.click('#modal [data-sf="export"]'); await win.waitForTimeout(1200);
check('匯出 to the opened PDF: refused, the PDF untouched, asked again', fs.readFileSync(PDF).equals(pdf0) && ((await asked()) || []).length === 2 && (await app.evaluate(() => global.__boxes)) === 1 && fs.existsSync(FILE2), {asked:await asked(), boxes:await app.evaluate(() => global.__boxes), pdfStart:fs.readFileSync(PDF).slice(0, 5).toString()});


// ---- part 2: import ---------------------------------------------------------------------------------------------------
const title = () => A(() => document.querySelector('#mask').classList.contains('show') ? document.querySelector('#modal .mh').textContent : null);
const bodyText = () => A(() => (document.querySelector('#modal .mb') || {}).textContent || '');
const pick = async f => {
  if ((await title()) !== '設定') await openFileTab(); else { await win.click('#modal [data-st="file"]'); await win.waitForTimeout(200); }
  const [fc] = await Promise.all([win.waitForEvent('filechooser', {timeout:5000}), win.click('#modal [data-sf="import"]')]);
  await fc.setFiles(f); await win.waitForTimeout(900);
};
const seen0 = await LS('pdfeditor.seenversion.v1');
await A(() => { localStorage.setItem('pdfeditor.theme', 'light'); localStorage.setItem('pdfeditor.people.v1', JSON.stringify({names:['root'], def:'root'})); localStorage.setItem('pdfeditor.extra.test', 'keep'); window.__marker = 1; });
const bad = [['a.json', '{"a":1}'], ['b.json', 'x{'], ['c.json', JSON.stringify({app:'PDF 工作台', kind:'settings', settings:{}})]];
const badOut = [];
for (const [n, t] of bad) {
  const f = path.join(TMP, n); fs.writeFileSync(f, t);
  await A(() => document.querySelectorAll('#toasts .toast').forEach(e => e.remove()));
  await pick(f);
  badOut.push({n, toast:(await toasts()).some(x => x.includes('這不是 PDF 工作台的設定檔')), title:await title(), theme:await LS('pdfeditor.theme'), marker:await A(() => window.__marker)});
}
check('not a settings file (other JSON, broken, nothing usable): says so, changes nothing', badOut.every(r => r.toast && r.title !== '匯入設定' && r.theme === 'light' && r.marker === 1), badOut);
const parsed = await A(() => window.__pdfapp.parseSettingsFile(JSON.stringify({app:'PDF 工作台', kind:'settings', settings:{'pdfeditor.theme':'light', evil:'x', 'pdfeditor.people.v1':5, 'pdfeditor.seenversion.v1':'0.0.1', 'pdfeditor.fontcat.v2':'{}'}})));
check('only usable settings are taken (pdfeditor. keys, text values, not the font cache or the version record)', parsed && parsed.ok && JSON.stringify(parsed.entries) === JSON.stringify([['pdfeditor.theme', 'light']]), parsed);
await pick(FILE);
const t1 = await title(), b1 = await bodyText();
check('a settings file: asked first, with its name and how many settings', t1 === '匯入設定' && b1.includes('settings.json') && b1.includes('2 項'), {t1, b1});
await win.click('#modal .mf button:has-text("取消")'); await win.waitForTimeout(600);
check('取消: nothing changed, no reload', (await LS('pdfeditor.theme')) === 'light' && (await A(() => window.__marker)) === 1);
await pick(FILE);
await win.click('#modal .mf button:has-text("匯入並重新載入")'); await win.waitForTimeout(4500);
const after = await A(() => ({marker:window.__marker ?? null, theme:localStorage.getItem('pdfeditor.theme'), shown:document.documentElement.dataset.theme, people:window.__pdfapp.people(), extra:localStorage.getItem('pdfeditor.extra.test'), seen:localStorage.getItem('pdfeditor.seenversion.v1')}));
check('匯入並重新載入: reloaded, the settings back and in use (dark, 王小明 the default author)', after.marker === null && after.theme === 'dark' && after.shown === 'dark' && after.people.def === '王小明' && after.people.author === '王小明' && after.people.names.includes('王小明'), after);
check('匯入: a setting not in the file is kept; the version record untouched', after.extra === 'keep' && after.seen === seen0, after);

// a document with unsaved changes: the import is refused before anything is written (save it first)
await A(() => window.__pdfapp.makeSample()); await win.waitForTimeout(2500);
await A(() => window.__pdfapp.setTool('rect'));
const r0 = await A(() => { const r = window.__pdfapp.S.els[0].getBoundingClientRect(), s = window.__pdfapp.S.scale; return [r.left + 120 * s, r.top + 160 * s, r.left + 200 * s, r.top + 220 * s]; });
await win.mouse.move(r0[0], r0[1]); await win.mouse.down(); await win.mouse.move(r0[2], r0[3], {steps:5}); await win.mouse.up(); await win.waitForTimeout(1200);
await A(() => { window.__pdfapp.setTool('select'); localStorage.setItem('pdfeditor.theme', 'light'); window.__marker2 = 1; document.querySelectorAll('#toasts .toast').forEach(t => t.remove()); });
const dirty0 = await A(() => window.__pdfapp.S.dirty);
await pick(FILE);
const dz = {dirty0, title:await title(), toast:(await toasts()).some(t => t.includes('另存')), theme:await LS('pdfeditor.theme'), marker:await A(() => window.__marker2 ?? null)};
if (dz.title === '匯入設定') { await win.click('#modal .mf button:has-text("取消")'); await win.waitForTimeout(400); }
check('a document with unsaved changes: refused first (save it), nothing written, no reload', dz.dirty0 === true && dz.title !== '匯入設定' && dz.toast && dz.theme === 'light' && dz.marker === 1, dz);

console.log(failed ? `\n${failed} check(s) failed` : '\nall checks passed');
await app.evaluate(({app}) => app.exit(0)).catch(() => {});
