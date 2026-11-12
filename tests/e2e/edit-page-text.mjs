import { launch, TMP } from './_env.mjs';
const { app, pdf: PDF } = await launch('pt.pdf');
const win = await app.firstWindow(); win.on('pageerror', e => console.log('PAGEERR', e.message)); win.on('console', m => { if (m.type() === 'error' || /DBG/.test(m.text())) console.log('C', m.text().slice(0, 300)); });
await win.waitForTimeout(3500);
await win.click('[data-view="single"]'); await win.waitForTimeout(500);
await win.click('[data-tool="textbox"]'); await win.waitForTimeout(500);
const box = await win.locator('.page').first().boundingBox();
const text = async () => win.evaluate(async () => { const pg = window.__pdfapp.S.pages[0]; const tc = await pg.page.getTextContent(); return tc.items.map(i => i.str).join('|'); });
console.log('before', (await text()).slice(0, 120));
// hover subtitle
const sub = {x:box.x + 200, y:box.y + 120};
await win.mouse.move(sub.x, sub.y); await win.waitForTimeout(300);
console.log('hover marks', await win.locator('.txhov').count());
await win.screenshot({path:TMP + '/pt_hover.png', clip:{x:box.x, y:box.y, width:800, height:260}});
await win.mouse.click(sub.x, sub.y); await win.waitForTimeout(600);
console.log('editor', JSON.stringify(await win.evaluate(() => window.__pdfapp.TBE())));
await win.screenshot({path:TMP + '/pt_edit.png', clip:{x:box.x, y:box.y, width:800, height:260}});
await win.keyboard.press('End'); await win.keyboard.type('（已修改）');
await win.keyboard.press('Escape'); await win.waitForTimeout(3000);
console.log('after', (await text()).slice(0, 160));
console.log('anns', JSON.stringify(await win.evaluate(async () => (await window.__pdfapp.getAnns(0)).map(a => [a.subtype, a.contents]))));
await win.screenshot({path:TMP + '/pt_after.png', clip:{x:box.x, y:box.y, width:800, height:260}});
// drag-select the title and delete it
await win.mouse.move(box.x + 80, box.y + 160); await win.mouse.down(); await win.mouse.move(box.x + 560, box.y + 186, {steps:6}); await win.mouse.up(); await win.waitForTimeout(600);
console.log('editor2', JSON.stringify(await win.evaluate(() => window.__pdfapp.TBE())));
await win.keyboard.press('Delete'); await win.keyboard.press('Escape'); await win.waitForTimeout(3000);
console.log('after2', (await text()).slice(0, 160));
console.log('ft', JSON.stringify(await win.evaluate(async () => (await window.__pdfapp.getAnns(0)).map(a => [a.subtype, Math.round(a.x), Math.round(a.y), Math.round(a.w), Math.round(a.h)]))), await win.evaluate(() => window.__pdfapp.S.tool));
const box3 = await win.locator('.page').first().boundingBox(); console.log('box', box.y, box3.y, await win.evaluate(() => window.__pdfapp.S.scale));
console.log('at', await win.evaluate(({x,y}) => { const e = document.elementFromPoint(x,y); return e.className + ' < ' + e.parentElement.className; }, sub));
// re-edit the modified text box
await win.mouse.click(sub.x, sub.y); await win.waitForTimeout(2500);
console.log('reedit', JSON.stringify(await win.evaluate(() => window.__pdfapp.TBE())));
await win.keyboard.press('Escape'); await win.waitForTimeout(800);
await win.click('[data-tool="select"]'); await win.waitForTimeout(500);
await win.screenshot({path:TMP + '/pt_final.png', clip:{x:box.x, y:box.y, width:800, height:260}});
await app.evaluate(({app}) => app.exit(0)).catch(() => {});
