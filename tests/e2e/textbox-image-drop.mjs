import { launch, TMP } from './_env.mjs';
const { app, pdf: PDF } = await launch('tb2.pdf');
const win = await app.firstWindow(); win.on('pageerror', e => console.log('PAGEERR', e.message)); win.on('console', m => console.log('C', m.type(), m.text().slice(0,300)));
await win.waitForTimeout(3500);
await win.evaluate(() => localStorage.removeItem('pdfeditor.textbox.v1'));
await win.click('[data-view="single"]'); await win.waitForTimeout(500);
const box = await win.locator('.page').first().boundingBox();
// image drop
await win.evaluate(async ({x, y}) => {
  const c = document.createElement('canvas'); c.width = 400; c.height = 200; const g = c.getContext('2d');
  g.fillStyle = '#1c64d9'; g.fillRect(0, 0, 400, 200); g.fillStyle = '#fff'; g.font = '60px sans-serif'; g.fillText('IMG', 120, 120);
  const b = await new Promise(r => c.toBlob(r, 'image/png'));
  const f = new File([b], 'logo.png', {type:'image/png'}); const dt = new DataTransfer(); dt.items.add(f);
  const el = document.elementFromPoint(x, y);
  el.dispatchEvent(new DragEvent('drop', {bubbles:true, cancelable:true, clientX:x, clientY:y, dataTransfer:dt}));
}, {x:box.x + 500, y:box.y + 450});
await win.waitForTimeout(3000);
console.log('anns0', JSON.stringify(await win.evaluate(async () => (await window.__pdfapp.getAnns(0)).map(a => [a.id, a.subtype, a.contents]))));
console.log('sel after drop', JSON.stringify(await win.evaluate(() => window.__pdfapp.sel())), await win.evaluate(() => window.__pdfapp.S.tool));
const sb = await win.locator('.asel').boundingBox(); console.log('asel', sb);
await win.mouse.move(sb.x + sb.width / 2, sb.y + sb.height / 2); await win.mouse.down(); await win.mouse.move(sb.x + sb.width / 2 - 200, sb.y + sb.height / 2 - 150, {steps:8}); await win.mouse.up();
await win.waitForTimeout(2500);
let anns = await win.evaluate(async () => (await window.__pdfapp.getAnns(0)).map(a => [a.subtype, a.contents, Math.round(a.x), Math.round(a.y), Math.round(a.w), Math.round(a.h)]));
console.log('anns', JSON.stringify(anns));
// textbox: multi-line, caret size change, in-editor context menu
await win.click('[data-tool="textbox"]'); await win.waitForTimeout(300);
await win.mouse.click(box.x + 600, box.y + 200); await win.waitForTimeout(300);
await win.keyboard.type('第一行'); await win.keyboard.press('Enter');
await win.selectOption('#hint select[data-tb="size"]', '28'); await win.waitForTimeout(150);
await win.keyboard.type('第二行大字'); await win.waitForTimeout(150);
await win.keyboard.press('Shift+Home');
const eb = await win.locator('.tbed').boundingBox();
await win.mouse.click(eb.x + 30, eb.y + eb.height - 15, {button:'right'}); await win.waitForTimeout(300);
console.log('ctx shown', await win.evaluate(() => getComputedStyle(document.querySelector('#ctx')).display), await win.evaluate(() => document.querySelector('#ctx .hd')?.textContent));
await win.screenshot({path:TMP + '/tb_d.png'});
await win.keyboard.press('Escape'); await win.waitForTimeout(200);
console.log('TBE', JSON.stringify(await win.evaluate(() => window.__pdfapp.TBE())));
await win.mouse.click(box.x + 50, box.y + 600); await win.waitForTimeout(2500);
anns = await win.evaluate(async () => (await window.__pdfapp.getAnns(0)).map(a => [a.subtype, a.contents, Math.round(a.w), Math.round(a.h)]));
console.log('anns', JSON.stringify(anns));
// empty box discarded
await win.mouse.click(box.x + 300, box.y + 560); await win.waitForTimeout(300); await win.keyboard.press('Escape'); await win.waitForTimeout(1200);
anns = await win.evaluate(async () => (await window.__pdfapp.getAnns(0)).length); console.log('count', anns);
await win.click('[data-tool="select"]'); await win.waitForTimeout(400);
await win.screenshot({path:TMP + '/tb_e.png'});
await app.evaluate(({app}) => app.exit(0)).catch(() => {});
