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
if (await A(() => !!document.querySelector('#modal [data-sf="export"]'))) { await win.click('#modal [data-sf="export"]'); await win.waitForTimeout(800); }
check('匯出 cancelled: no message, the file not written again', !!j && !(await toasts()).some(t => t.includes('已匯出設定')) && fs.statSync(FILE).mtimeMs === mtime, await toasts());

console.log(failed ? `\n${failed} check(s) failed` : '\nall checks passed');
await app.evaluate(({app}) => app.exit(0)).catch(() => {});
