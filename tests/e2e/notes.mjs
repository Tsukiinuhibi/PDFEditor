import { launch, TMP } from './_env.mjs';
const { app, pdf: PDF } = await launch('A.pdf');
const win = await app.firstWindow(); await win.waitForTimeout(3000);
const logs=[]; win.on('pageerror', e => logs.push('PAGEERR '+e.message));
await win.click('[data-zoom="actual"]'); await win.waitForTimeout(500);
const P = async (xmm, ymm) => win.evaluate(([x, y]) => { const r = document.querySelectorAll('.page')[0].getBoundingClientRect(), s = window.__pdfapp.S.scale; return [r.left + x * 72/25.4 * s, r.top + y * 72/25.4 * s]; }, [xmm, ymm]);
await win.click('[data-tool="note"]'); await win.waitForTimeout(300);
await win.mouse.click(...(await P(30, 60))); await win.waitForTimeout(400);
await win.keyboard.type('mhpt2 測試：請確認這裡的電話號碼');
// drag popup header a bit, then close with ×
const hd = await win.locator('.nhd').boundingBox();
await win.mouse.move(hd.x + 60, hd.y + 10); await win.mouse.down(); await win.mouse.move(hd.x + 100, hd.y + 30, {steps:5}); await win.mouse.up();
await win.waitForTimeout(200);
const pr0 = await win.evaluate(() => document.querySelectorAll('.page')[0].getBoundingClientRect().toJSON()); const box = await win.locator('.npop').boundingBox(); box.x -= pr0.x; box.y -= pr0.y;
await win.screenshot({ path: (TMP + '/n4.png'), clip:{x:0,y:0,width:100,height:100} });
await win.click('.npop .nx'); await win.waitForTimeout(2300);
// reopen: position must be remembered (from the PDF Popup annotation)
await win.click('[data-tool="select"]'); await win.click('.annhit.txt'); await win.waitForTimeout(800);
const pr1 = await win.evaluate(() => document.querySelectorAll('.page')[0].getBoundingClientRect().toJSON()); const box2 = await win.locator('.npop').boundingBox(); box2.x -= pr1.x; box2.y -= pr1.y;
console.log('popup moved & remembered:', Math.round(box.x), Math.round(box.y), '->', Math.round(box2.x), Math.round(box2.y));
await win.keyboard.press('Escape'); await win.waitForTimeout(500);
// empty new note is discarded
await win.click('[data-tool="note"]'); await win.mouse.click(...(await P(100, 100))); await win.waitForTimeout(300); await win.keyboard.press('Escape'); await win.waitForTimeout(1500);
console.log('Text annots:', await win.evaluate(async () => (await window.__pdfapp.S.pages[0].page.getAnnotations()).filter(a => a.subtype === 'Text').length));
console.log(logs.join('\n'));
await app.evaluate(({app}) => app.exit(0)).catch(() => {});
