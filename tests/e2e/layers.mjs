import { launch, TMP } from './_env.mjs';
const { app, pdf: PDF } = await launch('ly.pdf');
const win = await app.firstWindow(); win.on('pageerror', e => console.log('PAGEERR', e.message)); win.on('console', m => { if (m.type() === 'error') console.log('CERR', m.text().slice(0, 300)); });
await win.waitForTimeout(3500);
await win.click('[data-view="single"]'); await win.waitForTimeout(500);
const box = await win.locator('.page').first().boundingBox();
const P = (x, y) => [box.x + x, box.y + y];
const rectAt = async (x, y, w, h) => { await win.mouse.move(...P(x, y)); await win.mouse.down(); await win.mouse.move(...P(x + w, y + h), {steps:5}); await win.mouse.up(); await win.waitForTimeout(2200); };
const anns = async () => JSON.stringify(await win.evaluate(async () => (await window.__pdfapp.getAnns(0)).map(a => [a.id, a.subtype])));
const rows = async () => JSON.stringify(await win.evaluate(() => [...document.querySelectorAll('#p-layers .ly-row')].map(r => [r.dataset.id, r.querySelector('.ly-name')?.textContent, r.querySelector('.ly-n')?.textContent, r.className.replace('ly-row', '').trim()])));
await win.click('[data-tool="fill"]'); await win.waitForTimeout(300);
await win.click('#hint [data-s="mode"][data-v="rect"]'); await win.waitForTimeout(200);
await win.click('#hint .pchip[title="黃色"]').catch(() => {});
await rectAt(80, 80, 150, 80);
console.log('A', await anns());
await win.click('[data-act="layers"]'); await win.waitForTimeout(800);
console.log('rows0', await rows());
await win.click('#p-layers [data-ly="add"]'); await win.waitForTimeout(2500);
console.log('rows1', await rows());
await win.click('#hint .pchip[title="淺藍"]').catch(() => {});
await rectAt(150, 120, 150, 80);   // goes to 圖層 2, overlapping
console.log('rows2', await rows());
const px = async (x, y) => win.evaluate(({x, y}) => { const c = document.querySelector('.page canvas'); const r = c.getBoundingClientRect(); const g = c.getContext('2d'); const k = c.width / r.width; return [...g.getImageData(Math.round((x - r.left) * k), Math.round((y - r.top) * k), 1, 1).data].slice(0, 3).join(','); }, {x, y});
console.log('overlap pixel (should be blue)', await px(...P(200, 140)));
// move 圖層 2 below 圖層 1 → yellow on top
const ids = await win.evaluate(() => [...document.querySelectorAll('#p-layers .ly-row')].map(r => r.dataset.id));
await win.click('#p-layers [data-ly="down"]'); await win.waitForTimeout(2500);
console.log('rows3', await rows(), 'overlap pixel (should be yellow)', await px(...P(200, 140)));
// hide 圖層 1 (now top), yellow gone
await win.click(`#p-layers .ly-row[data-id="${ids[1]}"] .ly-eye`); await win.waitForTimeout(2500);
console.log('rows4', await rows(), 'pixel hidden', await px(...P(100, 100)), 'anns', await anns());
await win.click(`#p-layers .ly-row[data-id="${ids[1]}"] .ly-eye`); await win.waitForTimeout(2500);
// lock 圖層 2
await win.click(`#p-layers .ly-row[data-id="${ids[0]}"] .ly-lock`); await win.waitForTimeout(2500);
console.log('rows5', await rows(), 'anns', await anns());
await win.click(`#p-layers .ly-row[data-id="${ids[0]}"] .ly-lock`); await win.waitForTimeout(2500);
// rename
await win.dblclick(`#p-layers .ly-row[data-id="${ids[0]}"] .ly-name`); await win.waitForTimeout(200);
await win.keyboard.press('Control+A'); await win.keyboard.type('背景色塊'); await win.keyboard.press('Enter'); await win.waitForTimeout(2500);
// expand & move object via context menu
await win.click(`#p-layers .ly-row[data-id="${ids[1]}"] .ly-car`); await win.waitForTimeout(400);
await win.click('#p-layers .ly-obj', {button:'right'}); await win.waitForTimeout(300);
await win.click('#ctx button[data-m="to"]'); await win.waitForTimeout(2500);
console.log('rows6', await rows());
await win.screenshot({path:TMP + '/ly_a.png'});
// select object on canvas → layer picker in bar
await win.click('[data-tool="select"]'); await win.waitForTimeout(300);
await win.mouse.click(...P(250, 180)); await win.waitForTimeout(800);
console.log('picker', await win.evaluate(() => [...document.querySelectorAll('.abar .ly-pick option')].map(o => o.textContent + (o.selected ? '*' : ''))));
await win.screenshot({path:TMP + '/ly_b.png'});
// delete layer with objects, keep them
await win.click(`#p-layers .ly-row[data-id="${ids[0]}"] .ly-name`); await win.waitForTimeout(200);
await win.click('#p-layers [data-ly="del"]'); await win.waitForTimeout(400);
console.log('modal', await win.evaluate(() => [...document.querySelectorAll('#modal .mf button')].map(b => b.textContent)));
await win.click('#modal .mf button:nth-child(2)'); await win.waitForTimeout(2500);
console.log('rows7', await rows());
await app.evaluate(({app}) => app.exit(0)).catch(() => {});
