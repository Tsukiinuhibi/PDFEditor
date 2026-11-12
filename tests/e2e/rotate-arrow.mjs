import { launch, TMP } from './_env.mjs';
const { app, pdf: PDF } = await launch('rot.pdf');
const win = await app.firstWindow(); win.on('pageerror', e => console.log('PAGEERR', e.message)); win.on('console', m => { if (m.type() === 'error' || /DBG/.test(m.text())) console.log('C', m.text().slice(0, 400)); });
await win.waitForTimeout(3500);
await win.click('[data-view="single"]'); await win.waitForTimeout(500);
await win.evaluate(() => window.__pdfapp.setTool('arrow')); await win.waitForTimeout(400);
const box = await win.locator('.page').first().boundingBox();
const P = (x, y) => [box.x + x, box.y + y];
await win.mouse.move(...P(500, 300)); await win.mouse.down(); await win.mouse.move(...P(750, 300), {steps:6}); await win.mouse.up(); await win.waitForTimeout(2500);
const L = async () => JSON.stringify(await win.evaluate(async () => { const a = (await window.__pdfapp.getAnns(0)).find(a => a.subtype === 'Line'); return a && [Math.round(a.x), Math.round(a.y), Math.round(a.w), Math.round(a.h)]; }));
console.log('line', await L());
await win.evaluate(() => window.__pdfapp.setTool('select')); await win.waitForTimeout(500);
const hit = await win.evaluate(() => { const e = [...document.querySelectorAll('.page .annhit')].find(x => x.offsetWidth > 50 && x.offsetHeight < 60); const r = e.getBoundingClientRect(); return {x:r.x + r.width / 2, y:r.y + r.height / 2}; });
await win.mouse.click(hit.x, hit.y); await win.waitForTimeout(800);
console.log('handles', await win.locator('.asel .eh').count(), await win.locator('.asel .rh').count(), await win.locator('.asel .h').count());
await win.screenshot({path:TMP + '/rot_sel.png', clip:{x:box.x + 300, y:box.y + 150, width:700, height:350}});
// rotate 45° with shift... drag the rotate handle around the centre
const rh = await win.locator('.asel .rh').boundingBox();
const c = {x:hit.x, y:hit.y};
await win.mouse.move(rh.x + 10, rh.y + 10); await win.mouse.down();
const R = Math.hypot(rh.x + 10 - c.x, rh.y + 10 - c.y);
for (let k = 1; k <= 8; k++) { const a = -Math.PI / 2 + (Math.PI / 4) * k / 8; await win.mouse.move(c.x + R * Math.cos(a), c.y + R * Math.sin(a)); }
console.log('scroll', await win.evaluate(() => document.querySelector('#viewer').scrollTop));
await win.screenshot({path:TMP + '/rot_drag.png', clip:{x:box.x + 300, y:box.y + 150, width:700, height:350}});
console.log('scroll2', await win.evaluate(() => document.querySelector('#viewer').scrollTop));
await win.mouse.up(); await win.waitForTimeout(2500);
console.log('after rot', await L(), JSON.stringify(await win.evaluate(() => window.__pdfapp.sel())));
await win.screenshot({path:TMP + '/rot_after.png', clip:{x:box.x + 300, y:box.y + 150, width:700, height:350}});

await win.waitForTimeout(800); console.log('handles2', await win.locator('.asel .eh').count(), await win.locator('.asel .rh').count());
// drag end point 1 somewhere
const eh = await win.locator('.asel .eh').nth(1).boundingBox({timeout:3000});
await win.mouse.move(eh.x + 6, eh.y + 6); await win.mouse.down(); await win.mouse.move(eh.x + 6 - 150, eh.y + 6 + 60, {steps:6}); await win.mouse.up(); await win.waitForTimeout(2500);
console.log('after end', await L());
await win.screenshot({path:TMP + '/rot_end.png', clip:{x:box.x + 300, y:box.y + 150, width:700, height:350}});
await app.evaluate(({app}) => app.exit(0)).catch(() => {});
