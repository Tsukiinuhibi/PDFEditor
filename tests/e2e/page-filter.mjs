// 只顯示單數頁／雙數頁: the 頁面 list in the view bar shows only the odd or the even pages (in every view mode); moving page
// by page goes over the pages shown; going to a page left out shows all pages again; the document is not changed.
import { launch, TMP, ROOT } from './_env.mjs';
import fs from 'fs';
import path from 'path';

let failed = 0;
const check = (name, ok, detail = '') => { console.log(`${ok ? '✔' : '✘'} ${name}${detail !== '' ? '  ' + (typeof detail === 'string' ? detail : JSON.stringify(detail)) : ''}`); if (!ok) { failed++; process.exitCode = 1; } };

const { app } = await launch('pagefilter.pdf');
const win = await app.firstWindow();
win.on('pageerror', e => console.log('PAGEERR', e.message));
await win.waitForFunction(() => !!(window.__pdfapp && window.__pdfapp.S.pages.length), null, {timeout:30000});
await win.waitForTimeout(1500);
const A = win.evaluate.bind(win);
const laidOut = () => A(() => window.__pdfapp.S.els.map((e, i) => e.parentNode ? i : -1).filter(i => i >= 0));
const n = await A(() => window.__pdfapp.S.pages.length);
const bytes0 = await A(() => window.__pdfapp.S.bytes.length);
check('(a document of 4 pages or more)', n >= 4, n);

await win.click('[data-view="continuous"]'); await win.waitForTimeout(600);
await win.selectOption('#pageFilter', 'odd'); await win.waitForTimeout(900);
check('單數頁, continuous: only pages 1, 3, … laid out', JSON.stringify(await laidOut()) === JSON.stringify([...Array(n).keys()].filter(i => i % 2 === 0)), await laidOut());
await win.selectOption('#pageFilter', 'even'); await win.waitForTimeout(900);
check('雙數頁: only pages 2, 4, …', JSON.stringify(await laidOut()) === JSON.stringify([...Array(n).keys()].filter(i => i % 2 === 1)), await laidOut());
check('…the thumbnails of the pages left out are dimmed', await A(() => [...document.querySelectorAll('.thumb[data-i]')].every(t => t.classList.contains('pf-off') === (+t.dataset.i % 2 === 0))));

// single page view: next page goes 2 → 4
await win.click('[data-view="single"]'); await win.waitForTimeout(600);
await A(() => window.__pdfapp.scrollToPage(1)); await win.waitForTimeout(400);
await win.keyboard.press('PageDown'); await win.waitForTimeout(500);
check('單頁, 雙數頁: the next page after 2 is 4', await A(() => window.__pdfapp.S.current) === 3, await A(() => window.__pdfapp.S.current));
// two pages side by side: 2 and 4 together
await win.click('[data-view="two"]'); await win.waitForTimeout(600);
const rows = await A(() => window.__pdfapp.S.rows);
check('對開, 雙數頁: the pages shown side by side are 2 and 4, …', JSON.stringify(rows[0]) === JSON.stringify([1, 3]), rows);
// going to a page left out (page 1): all pages again
await win.click('[data-view="continuous"]'); await win.waitForTimeout(600);
await A(() => window.__pdfapp.scrollToPage(0)); await win.waitForTimeout(900);
check('going to a page left out (1): all pages shown again', (await laidOut()).length === n && await A(() => document.querySelector('#pageFilter').value) === 'all', await laidOut());
check('the document itself not changed', await A(() => window.__pdfapp.S.bytes.length) === bytes0 && await A(() => window.__pdfapp.S.undo.length) === 0);

// ---- (review) the choice stays through edits and undo, and belongs to its tab ------------------------------------------------
await win.selectOption('#pageFilter', 'odd'); await win.waitForTimeout(900);
await A(() => window.__pdfapp.mutate('test', doc => { const p = doc.getPage(0); p.node.addAnnot(doc.context.register(doc.context.obj({Type:'Annot', Subtype:'Square', Rect:[50, 50, 90, 90], C:[1, 0, 0]}))); }));
await win.waitForTimeout(1500);
check('an edit with 單數頁 chosen: still only the odd pages', JSON.stringify(await laidOut()) === JSON.stringify([...Array(n).keys()].filter(i => i % 2 === 0)) && await A(() => document.querySelector('#pageFilter').value) === 'odd', await laidOut());
await win.click('#bUndo'); await win.waitForTimeout(1500);
check('…and after 復原', JSON.stringify(await laidOut()) === JSON.stringify([...Array(n).keys()].filter(i => i % 2 === 0)), await laidOut());
const B = path.join(TMP, 'pagefilter-b.pdf'); fs.copyFileSync(path.join(ROOT, 'tests', 'e2e', 'fixtures', 'sample.pdf'), B);
const nTabs = await A(() => document.querySelectorAll('.dtab').length);
await app.evaluate(({BrowserWindow}, p) => BrowserWindow.getAllWindows()[0].webContents.send('open-path', p), B);
await win.waitForFunction(k => document.querySelectorAll('.dtab').length > k, nTabs, {timeout:15000}).catch(() => {});
await win.waitForTimeout(2000);
check('another file opened in its own tab: all its pages, 全部', (await laidOut()).length === n && await A(() => document.querySelector('#pageFilter').value) === 'all', await laidOut());
await A(() => document.querySelectorAll('.dtab')[0].click()); await win.waitForTimeout(1500);
check('back to the first tab: still 單數頁 there', await A(() => document.querySelector('#pageFilter').value) === 'odd' && JSON.stringify(await laidOut()) === JSON.stringify([...Array(n).keys()].filter(i => i % 2 === 0)), await laidOut());

// ---- (minors) a document of one page: 雙數頁 cannot be chosen ------------------------------------------------------------------
await A(() => window.__pdfapp.mutate('test', doc => { while (doc.getPageCount() > 1) doc.removePage(doc.getPageCount() - 1); }));
await win.waitForTimeout(1500);
check('one page: 雙數頁 cannot be chosen (there is none)', await A(() => { const o = document.querySelector('#pageFilter option[value="even"]'); return !!o && o.disabled; }));

console.log(failed ? `\n${failed} check(s) failed` : '\nall checks passed');
await app.evaluate(({app}) => app.exit(0)).catch(() => {});
