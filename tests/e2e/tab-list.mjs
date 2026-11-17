// 分頁多開：分頁顯示完整檔名；分頁列右邊〔▾〕列出所有分頁，勾選後一次關閉
import { launch, TMP, ROOT } from './_env.mjs';
import fs from 'fs';
import path from 'path';

let failed = 0;
const check = (name, ok, detail = '') => { console.log(`${ok ? '✔' : '✘'} ${name}${detail !== '' ? '  ' + (typeof detail === 'string' ? detail : JSON.stringify(detail)) : ''}`); if (!ok) { failed++; process.exitCode = 1; } };

const names = ['樓群-每日施工日誌-第一期工程完整版-2026年11月.pdf', 'tablist-b.pdf', 'tablist-c.pdf', 'tablist-d.pdf'];
const { app } = await launch(names[0]);
const win = await app.firstWindow();
win.on('pageerror', e => console.log('PAGEERR', e.message));
await win.waitForFunction(() => !!(window.__pdfapp && window.__pdfapp.S.pages.length), null, {timeout:30000});
await win.waitForTimeout(1200);
for (const n of names.slice(1)) {
  const p = path.join(TMP, n); fs.copyFileSync(path.join(ROOT, 'tests', 'e2e', 'fixtures', 'sample.pdf'), p);
  const k = await win.evaluate(() => document.querySelectorAll('.dtab').length);
  await app.evaluate(({BrowserWindow}, p) => BrowserWindow.getAllWindows()[0].webContents.send('open-path', p), p);
  await win.waitForFunction(k => document.querySelectorAll('.dtab').length > k, k, {timeout:15000}).catch(() => {});
  await win.waitForTimeout(700);
}
const tabs = () => win.evaluate(() => [...document.querySelectorAll('.dtab .nm')].map(n => ({t:n.textContent, cut:n.scrollWidth > n.clientWidth + 1})));
const t0 = await tabs();
check('(four tabs open)', t0.length === 4, t0);
check('each tab shows its whole name (nothing cut off)', t0.every(x => !x.cut) && t0[0].t === names[0], t0);

const btn = await win.evaluate(() => !!document.querySelector('#tabbar [data-tablist]'));
check('the tab bar has 〔▾〕 listing the tabs', btn);
if (btn) await win.click('#tabbar [data-tablist]');
await win.waitForTimeout(400);
const rows = await win.evaluate(() => [...document.querySelectorAll('#ctx .tl-row')].map(r => ({nm:r.querySelector('.tl-nm').textContent, ck:!!r.querySelector('input[type=checkbox]')})));
check('…all four files, with their whole names and a box to tick', rows.length === 4 && rows.every(r => r.ck) && rows[0].nm === names[0], rows);
// tick b and d, close them
await win.evaluate(() => { const r = [...document.querySelectorAll('#ctx .tl-row')]; [1, 3].forEach(k => r[k].querySelector('input').click()); });
await win.waitForTimeout(200);
const label = await win.evaluate(() => (document.querySelector('#ctx [data-tlclose]') || {}).textContent || '');
check('the close button counts the ticked tabs (2)', /2/.test(label), label);
await win.click('#ctx [data-tlclose]'); await win.waitForTimeout(1500);
const t1 = await tabs();
check('the ticked tabs closed, the others left', t1.length === 2 && t1.map(x => x.t).join() === [names[0], names[2]].join(), t1);
// 全選 then close: all closed
await win.click('#tabbar [data-tablist]'); await win.waitForTimeout(400);
await win.click('#ctx [data-tlall]'); await win.waitForTimeout(200);
const all = await win.evaluate(() => [...document.querySelectorAll('#ctx .tl-row input')].every(x => x.checked));
check('〔全選〕 ticks them all', all);
await win.keyboard.press('Escape'); await win.waitForTimeout(300);
check('Esc: the list closes, nothing closed', (await tabs()).length === 2 && await win.evaluate(() => document.querySelector('#ctx').style.display !== 'block'));

// (review) a box ticked (it has the focus), then Esc: the list closes
await win.click('#tabbar [data-tablist]'); await win.waitForTimeout(400);
await win.click('#ctx .tl-row input'); await win.waitForTimeout(200);
await win.keyboard.press('Escape'); await win.waitForTimeout(300);
check('a box ticked, then Esc: the list closes, nothing closed', await win.evaluate(() => document.querySelector('#ctx').style.display !== 'block') && (await tabs()).length === 2);

console.log(failed ? `\n${failed} check(s) failed` : '\nall checks passed');
await app.evaluate(({app}) => app.exit(0)).catch(() => {});
