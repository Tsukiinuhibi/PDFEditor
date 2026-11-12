import { launch, TMP } from './_env.mjs';
const { app, pdf: PDF } = await launch('fl.pdf');
const win = await app.firstWindow(); win.on('pageerror', e => console.log('PAGEERR', e.message));
await win.waitForTimeout(3500);
await win.click('[data-view="single"]'); await win.waitForTimeout(800);
// watch every animation frame: is the current page without its picture, or is the busy veil visible?
await win.evaluate(() => {
  window.__fl = {blank:0, veil:0, frames:0, holdsLeft:0};
  const tick = () => {
    const el = document.querySelector('.page'); window.__fl.frames++;
    if (el && !el.querySelector('canvas.pc')) window.__fl.blank++;
    const b = document.querySelector('#busy'); if (b.classList.contains('show') && !b.classList.contains('quiet')) window.__fl.veil++;
    requestAnimationFrame(tick);
  }; requestAnimationFrame(tick);
});
const box = await win.locator('.page').first().boundingBox();
const P = (x, y) => [box.x + x, box.y + y];
await win.evaluate(() => window.__pdfapp.setTool('rect')); await win.waitForTimeout(300);
const b2 = await win.locator('.page').first().boundingBox();
await win.mouse.move(b2.x + 300, b2.y + 300); await win.mouse.down(); await win.mouse.move(b2.x + 450, b2.y + 400, {steps:5}); await win.mouse.up(); await win.waitForTimeout(2000);
await win.evaluate(() => window.__pdfapp.setTool('select')); await win.waitForTimeout(500);
const b3 = await win.locator('.page').first().boundingBox();
const hit = await win.evaluate(() => { const e = [...document.querySelectorAll('.page .annhit')].find(x => x.offsetWidth > 100 && x.offsetWidth < 300); const r = e.getBoundingClientRect(); return {x:r.x + r.width / 2, y:r.y + r.height / 2}; });
await win.mouse.move(hit.x, hit.y); await win.mouse.down(); await win.mouse.move(hit.x + 80, hit.y + 40, {steps:6}); await win.mouse.up(); await win.waitForTimeout(2000);
await win.keyboard.press('Control+z'); await win.waitForTimeout(1500);
await win.evaluate(() => window.__pdfapp.setTool('textbox')); await win.waitForTimeout(400);
const b4 = await win.locator('.page').first().boundingBox();
await win.mouse.click(b4.x + 200, b4.y + 120); await win.waitForTimeout(500); await win.keyboard.press('End'); await win.keyboard.type('!!'); await win.keyboard.press('Escape'); await win.waitForTimeout(2500);
console.log(JSON.stringify(await win.evaluate(() => ({...window.__fl, holdsLeft:document.querySelectorAll('.hold').length, anns:null}))));
console.log(JSON.stringify(await win.evaluate(async () => (await window.__pdfapp.getAnns(0)).map(a => [a.subtype, a.contents]))));
await app.evaluate(({app}) => app.exit(0)).catch(() => {});
