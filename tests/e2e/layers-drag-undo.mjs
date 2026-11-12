import { launch, TMP } from './_env.mjs';
const { app, pdf: PDF } = await launch('ly3.pdf');
const win = await app.firstWindow(); win.on('pageerror', e => console.log('PAGEERR', e.message)); win.on('console', m => { if (m.type() === 'error') console.log('CERR', m.text().slice(0, 300)); });
await win.waitForTimeout(3500);
await win.click('[data-view="single"]'); await win.waitForTimeout(500);
await win.click('[data-act="layers"]'); await win.waitForTimeout(600);
const rows = async () => JSON.stringify(await win.evaluate(() => [...document.querySelectorAll('#p-layers .ly-row')].map(r => [r.dataset.id, r.querySelector('.ly-name')?.textContent, r.querySelector('.ly-n')?.textContent, r.className.replace('ly-row', '').trim()])));
// hide the virtual layer → materialises
await win.click('#p-layers .ly-row[data-id="__v"] .ly-eye'); await win.waitForTimeout(2500);
console.log('r0', await rows());
await win.click('#p-layers .ly-row:not(.base) .ly-eye'); await win.waitForTimeout(2500);
await win.click('#p-layers [data-ly="add"]'); await win.waitForTimeout(2500);
await win.click('#p-layers [data-ly="add"]'); await win.waitForTimeout(2500);
console.log('r1', await rows());
// draw with textbox into active layer (top, 圖層 3)
const box = await win.locator('.page').first().boundingBox();
await win.click('[data-tool="textbox"]'); await win.waitForTimeout(400);
const box2 = await win.locator('.page').first().boundingBox();
await win.mouse.click(box2.x + 300, box2.y + 300); await win.waitForTimeout(300); await win.keyboard.type('層'); await win.keyboard.press('Escape'); await win.waitForTimeout(2500);
console.log('r2', await rows());
// drag 圖層 3 (top) below 圖層 1 (bottom)
const ids = await win.evaluate(() => [...document.querySelectorAll('#p-layers .ly-row:not(.base)')].map(r => r.dataset.id));
const tgt = win.locator(`#p-layers .ly-row[data-id="${ids[2]}"]`), tb = await tgt.boundingBox();
await win.locator(`#p-layers .ly-row[data-id="${ids[0]}"]`).dragTo(tgt, {targetPosition:{x:20, y:tb.height - 4}}); await win.waitForTimeout(2500);
console.log('r3', await rows());
// drag object (textbox) onto 圖層 2
const r3ids = await win.evaluate(() => [...document.querySelectorAll('#p-layers .ly-row:not(.base)')].map(r => r.dataset.id));
await win.click(`#p-layers .ly-row[data-id="${ids[0]}"] .ly-car`); await win.waitForTimeout(400);
await win.locator('#p-layers .ly-obj').first().dragTo(win.locator(`#p-layers .ly-row[data-id="${ids[1]}"]`)); await win.waitForTimeout(2500);
console.log('r4', await rows());
await win.keyboard.press('Control+z'); await win.waitForTimeout(2500);
console.log('undo', await rows());
await win.screenshot({path:TMP + '/ly_d.png'});
await app.evaluate(({app}) => app.exit(0)).catch(() => {});
