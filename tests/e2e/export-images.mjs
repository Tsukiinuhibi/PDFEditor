import { launch, TMP } from './_env.mjs';
import fs from 'fs';
const { app, pdf: PDF } = await launch('ex2.pdf');
const win = await app.firstWindow(); win.on('pageerror', e => console.log('PAGEERR', e.message)); win.on('console', m => { if (m.type() === 'error') console.log('CERR', m.text().slice(0, 200)); });
await win.waitForTimeout(3500);
await win.click('[data-view="single"]'); await win.waitForTimeout(600);
await win.evaluate(() => window.__pdfapp.setTool('rect')); await win.waitForTimeout(300);
let b = await win.locator('.page').first().boundingBox();
await win.mouse.move(b.x + 80, b.y + 600); await win.mouse.down(); await win.mouse.move(b.x + 400, b.y + 700, {steps:6}); await win.mouse.up(); await win.waitForTimeout(1800);
// a text box still being typed when the export starts
await win.evaluate(() => window.__pdfapp.setTool('textbox')); await win.waitForTimeout(300);
b = await win.locator('.page').first().boundingBox(); await win.mouse.click(b.x + 500, b.y + 640, {button:'right'}); await win.waitForTimeout(400); await win.keyboard.type('EXPORT ME');
// region render now includes objects: the rectangle's red edge should be in the picture
const px = await win.evaluate(async () => { const pg = window.__pdfapp.S.pages[0]; const c = await window.__pdfapp.renderRegion(0, {x:0, y:0, w:pg.w, h:pg.h}, 1); const g = c.getContext('2d'); let red = 0; const d = g.getImageData(0, 0, c.width, c.height).data; for (let k = 0; k < d.length; k += 4) if (d[k] > 200 && d[k + 1] < 80 && d[k + 2] < 80) red++; return red; });
console.log('red pixels in region render:', px);
await win.click('[data-act="exportImages"], [data-act="exportImg"], [title*="轉存圖片"]').catch(e => console.log('no btn', e.message.slice(0, 80)));
await win.waitForTimeout(1500);
console.log('dialog', await win.locator('#exOk').count(), 'TBE after open', JSON.stringify(await win.evaluate(() => window.__pdfapp.TBE())));
const before = new Set(fs.readdirSync(TMP));
await win.click('#exOk'); await win.waitForTimeout(5000);
const out = fs.readdirSync(TMP).filter(f => !before.has(f));
console.log('written', out);
await app.evaluate(({app}) => app.exit(0)).catch(() => {});
