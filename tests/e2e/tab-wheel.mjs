// 檔案多開時分頁列可用滑鼠滾輪左右捲動: with more tabs than fit, the mouse wheel over the tab bar scrolls it sideways
import { launch, TMP, ROOT } from './_env.mjs';
import fs from 'fs';
import path from 'path';

let failed = 0;
const check = (name, ok, detail = '') => { console.log(`${ok ? '✔' : '✘'} ${name}${detail !== '' ? '  ' + (typeof detail === 'string' ? detail : JSON.stringify(detail)) : ''}`); if (!ok) { failed++; process.exitCode = 1; } };

const { app } = await launch('tabwheel-0-a-rather-long-file-name.pdf');
const win = await app.firstWindow();
win.on('pageerror', e => console.log('PAGEERR', e.message));
await win.waitForFunction(() => !!(window.__pdfapp && window.__pdfapp.S.pages.length), null, {timeout:30000});
await win.waitForTimeout(1200);
await app.evaluate(({BrowserWindow}) => BrowserWindow.getAllWindows()[0].setContentSize(900, 700)); await win.waitForTimeout(500);
for (let k = 1; k <= 9; k++) {
  const p = path.join(TMP, `tabwheel-${k}-a-rather-long-file-name.pdf`); fs.copyFileSync(path.join(ROOT, 'tests', 'e2e', 'fixtures', 'sample.pdf'), p);
  const n = await win.evaluate(() => document.querySelectorAll('.dtab').length);
  await app.evaluate(({BrowserWindow}, p) => BrowserWindow.getAllWindows()[0].webContents.send('open-path', p), p);
  await win.waitForFunction(n => document.querySelectorAll('.dtab').length > n, n, {timeout:15000}).catch(() => {});
  await win.waitForTimeout(700);
}
const st = await win.evaluate(() => { const t = document.querySelector('#tabbar'); return {sw:t.scrollWidth, cw:t.clientWidth, sl:t.scrollLeft}; });
check('(ten tabs: more than fit in the bar)', st.sw > st.cw + 50, st);
await win.evaluate(() => { document.querySelector('#tabbar').scrollLeft = 0; });
const b = await win.locator('#tabbar').boundingBox();
await win.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
for (let k = 0; k < 4; k++) { await win.mouse.wheel(0, 120); await win.waitForTimeout(100); }
const sl = await win.evaluate(() => document.querySelector('#tabbar').scrollLeft);
check('the wheel turned over the tab bar: it scrolls sideways', sl > 100, sl);
for (let k = 0; k < 4; k++) { await win.mouse.wheel(0, -120); await win.waitForTimeout(100); }
const sl2 = await win.evaluate(() => document.querySelector('#tabbar').scrollLeft);
check('…and back the other way', sl2 < sl, {sl, sl2});

console.log(failed ? `\n${failed} check(s) failed` : '\nall checks passed');
await app.evaluate(({app}) => app.exit(0)).catch(() => {});
