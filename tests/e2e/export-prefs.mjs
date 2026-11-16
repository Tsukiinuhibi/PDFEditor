// 轉存成圖片的設定被改壞（設定檔手動編輯、舊版本）：不合理的值不採用，視窗照常開啟，檔名預覽不會出現 NaN
import { launch } from './_env.mjs';

let failed = 0;
const check = (name, ok, detail = '') => { console.log(`${ok ? '✔' : '✘'} ${name}${detail !== '' ? '  ' + (typeof detail === 'string' ? detail : JSON.stringify(detail)) : ''}`); if (!ok) { failed++; process.exitCode = 1; } };

const { app } = await launch('expprefs.pdf');
const win = await app.firstWindow();
win.on('pageerror', e => console.log('PAGEERR', e.message));
await win.waitForFunction(() => !!(window.__pdfapp && window.__pdfapp.S.pages.length), null, {timeout:30000});
await win.waitForTimeout(1200);
await win.evaluate(() => localStorage.setItem('pdfeditor.export.v1', JSON.stringify({fmt:'png', dpi:150, pad:'abc', macOn:'yes', keepDir:true, lastDir:5, nameMode:'macro'})));
await win.click('[data-amenu="output"] .sp-arr'); await win.waitForTimeout(300); await win.click('#toolMenu button:has-text("轉存成圖片")'); await win.waitForTimeout(1500);
const r = await win.evaluate(() => { const m = document.querySelector('#modal'); return {open:!!document.querySelector('#exOk'), pad:(document.querySelector('#exPad') || {}).value, nan:/NaN|undefined/.test(m ? m.textContent : '')}; });
check('bad export settings: the window opens, 數字補零 is 自動, no NaN in the names', r.open && r.pad === 'auto' && !r.nan, r);
const ok = await win.evaluate(() => window.__pdfapp.settingShapeOk ? window.__pdfapp.settingShapeOk('pdfeditor.export.v1', JSON.stringify({pad:'abc'})) : 'no hook');
check('…and a settings file with such a value is not taken in', ok === false, ok);

console.log(failed ? `\n${failed} check(s) failed` : '\nall checks passed');
await app.evaluate(({app}) => app.exit(0)).catch(() => {});
