import { launch, TMP } from './_env.mjs';
const { app, pdf: PDF } = await launch('f3.pdf');
const win = await app.firstWindow(); win.on('pageerror', e => console.log('PAGEERR', e.message));
await win.waitForTimeout(3500);
await win.click('[data-view="single"]'); await win.waitForTimeout(500);
const box = await win.locator('.page').first().boundingBox();
const anns = async () => JSON.stringify(await win.evaluate(async () => (await window.__pdfapp.getAnns(0)).map(a => [a.subtype, Math.round(a.x), Math.round(a.y), Math.round(a.w), Math.round(a.h)])));
await win.click('[data-tool="fill"]'); await win.waitForTimeout(300);
await win.click('#hint [data-s="mode"][data-v="nodes"]'); await win.waitForTimeout(200);
const P = (x, y) => [box.x + x, box.y + y];
for (const [x, y] of [[600, 80], [800, 90], [850, 200], [700, 260], [620, 180]]) { await win.mouse.click(...P(x, y)); await win.waitForTimeout(80); }
// drag node 3 outward
await win.mouse.move(...P(850, 200)); await win.mouse.down(); await win.mouse.move(...P(900, 220), {steps:5}); await win.mouse.up();
await win.mouse.move(...P(605, 82)); await win.waitForTimeout(150);
await win.screenshot({path:TMP + '/f_nodes.png'});
console.log('before close', await anns());
await win.mouse.click(...P(602, 81)); await win.waitForTimeout(2500);   // close on first node
console.log('after close', await anns());
// second shape finished with Enter, Backspace removes a point
for (const [x, y] of [[100, 450], [300, 450], [250, 560], [120, 550]]) { await win.mouse.click(...P(x, y)); await win.waitForTimeout(80); }
console.log('circles', await win.evaluate(() => [...document.querySelectorAll('svg.dsvg g')].map(g => g.querySelectorAll('circle').length + ':' + g.isConnected)), await win.evaluate(() => document.activeElement && document.activeElement.tagName + '.' + document.activeElement.className));
await win.keyboard.press('Backspace'); await win.keyboard.press('Enter'); await win.waitForTimeout(2500);
console.log('after enter', await anns());
// Esc cancels
await win.mouse.click(...P(400, 450)); await win.mouse.click(...P(500, 450)); await win.keyboard.press('Escape'); await win.waitForTimeout(300);
console.log('tool', await win.evaluate(() => window.__pdfapp.S.tool), await win.locator('svg.dsvg g').count());
await win.click('[data-tool="select"]'); await win.waitForTimeout(500);
await win.screenshot({path:TMP + '/f_nodes2.png'});
await app.evaluate(({app}) => app.exit(0)).catch(() => {});
