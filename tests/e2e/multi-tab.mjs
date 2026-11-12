import { launch, TMP } from './_env.mjs';
const { app, pdf: PDF } = await launch('multi.pdf');
const win = await app.firstWindow();
const logs=[]; win.on('pageerror', e => logs.push('PAGEERR '+e.message));
await win.waitForTimeout(3000);
// multi-select 2-3 then delete via picker (preselected)
await win.click('.thumb[data-i="1"]'); await win.click('.thumb[data-i="2"]', {modifiers:['Shift']});
await win.click('[data-act="delPage"]'); await win.waitForTimeout(800);
console.log('del picker preselect:', await win.innerText('#ppCnt'), await win.inputValue('#ppRange'));
await win.click('#ppOk'); await win.waitForTimeout(2000);
console.log('after del n=', await win.evaluate(() => window.__pdfapp.S.pages.length));
// rotate selection of 2 pages
await win.click('.thumb[data-i="0"]'); await win.click('.thumb[data-i="1"]', {modifiers:['Control']});
await win.click('[data-amenu="rotate"] .sp-arr'); await win.waitForTimeout(300); await win.click('#toolMenu button:has-text("向右轉")'); await win.waitForTimeout(2000);   // 旋轉 ▾ → 向右轉
console.log('rot', await win.evaluate(() => window.__pdfapp.S.pages.map(p => p.rot).join(',')));
// sample in new tab, close all tabs -> welcome
await win.evaluate(() => window.__pdfapp.makeSample()); await win.waitForTimeout(2500);
console.log('tabs', await win.evaluate(() => document.querySelectorAll('.dtab').length));
await win.keyboard.press('Control+w'); await win.waitForTimeout(600);
await win.keyboard.press('Control+w'); await win.waitForTimeout(600);
console.log('welcome visible', await win.evaluate(() => getComputedStyle(document.querySelector('#welcome')).display !== 'none'), 'tabbar hidden', await win.evaluate(() => document.querySelector('#tabbar').classList.contains('hide')));
await win.screenshot({ path: (TMP + '/m3.png') });
console.log(logs.join('\n'));
await app.evaluate(({app}) => app.exit(0)).catch(() => {});
