import { launch, TMP } from './_env.mjs';
const { app, pdf: PDF } = await launch('A.pdf');
const win = await app.firstWindow(); await win.waitForTimeout(3500);
const logs=[]; win.on('pageerror', e => logs.push('PAGEERR '+e.message));
const st = () => win.evaluate(() => [Math.round(viewer.scrollTop), document.body.classList.contains('autoscrolling'), window.__pdfapp.S.current, window.__pdfapp.S.tool]);
// 1) click mode: press+release without moving, then move down 150px
await win.mouse.move(800, 400); await win.mouse.down({button:'middle'}); await win.mouse.up({button:'middle'});
console.log('after click', JSON.stringify(await st()));
await win.mouse.move(800, 550, {steps:5}); await win.waitForTimeout(800); const a = await st();
await win.waitForTimeout(800); const b = await st();
console.log('scrolling down', JSON.stringify(a), '->', JSON.stringify(b));
await win.mouse.move(800, 280, {steps:5}); await win.waitForTimeout(600); console.log('scrolling up', JSON.stringify(await st()));
// left click on a ribbon button ends it without pressing the button
const bb = await win.locator('[data-tool="hand"]').boundingBox();
await win.mouse.move(bb.x + 10, bb.y + 10); await win.mouse.down(); await win.mouse.up(); await win.waitForTimeout(400);
console.log('stopped by click (tool must stay select)', JSON.stringify(await st()));
// 2) hold mode: press, move while held, release -> stops
await win.mouse.move(800, 400); await win.mouse.down({button:'middle'}); await win.mouse.move(800, 600, {steps:6}); await win.waitForTimeout(700);
const c = await st(); await win.mouse.up({button:'middle'}); await win.waitForTimeout(200);
console.log('hold mode active', JSON.stringify(c), '| after release', JSON.stringify(await st()));
// 3) Esc ends click mode
await win.mouse.move(800, 400); await win.mouse.down({button:'middle'}); await win.mouse.up({button:'middle'}); await win.keyboard.press('Escape'); await win.waitForTimeout(200);
console.log('esc', JSON.stringify(await st()));
// 4) single-page view continues to the next page at the edge
await win.click('[data-view="single"]'); await win.waitForTimeout(500);
await win.mouse.move(800, 400); await win.mouse.down({button:'middle'}); await win.mouse.up({button:'middle'}); await win.mouse.move(800, 700, {steps:4});
await win.waitForTimeout(3500); console.log('single-page', JSON.stringify(await st()));
await win.keyboard.press('Escape');
console.log(logs.join('\n'));
await app.evaluate(({app}) => app.exit(0)).catch(() => {});
