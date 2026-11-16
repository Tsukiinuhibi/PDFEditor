// 物件移動時畫面不閃: while an object is moved (dragged alone, dragged in a group, nudged with the arrow keys) and the page is
// drawn again, the screen never shows it gone from its new place or back at its old one. The screen is captured again and
// again from the moment the mouse is let go until the page is drawn again.
import { launch } from './_env.mjs';

let failed = 0;
const check = (name, ok, detail = '') => { console.log(`${ok ? '✔' : '✘'} ${name}${detail !== '' ? '  ' + (typeof detail === 'string' ? detail : JSON.stringify(detail)) : ''}`); if (!ok) { failed++; process.exitCode = 1; } };

const { app } = await launch('flicker.pdf');
const win = await app.firstWindow();
win.on('pageerror', e => console.log('PAGEERR', e.message));
await win.waitForFunction(() => !!(window.__pdfapp && window.__pdfapp.S.pages.length), null, {timeout:30000});
await win.waitForTimeout(1500);
const A = win.evaluate.bind(win);
await win.click('[data-view="single"]'); await win.waitForTimeout(500);
const at = (x, y) => A(({x, y}) => { const app = window.__pdfapp, e = app.S.els[0].getBoundingClientRect(); return {x:e.left + x * app.S.scale, y:e.top + y * app.S.scale}; }, {x, y});

// two solid red squares on page 1 (drawn by the program, filled)
await A(() => window.__pdfapp.mutate('test', doc => { const ctx = doc.context, p = doc.getPage(0), H = p.getHeight();
  for (const [x, y] of [[100, 150], [100, 300]]) {
    const ap = ctx.register(ctx.stream('1 0 0 rg 0 0 60 60 re f', {Type:'XObject', Subtype:'Form', BBox:[0, 0, 60, 60]}));
    p.node.addAnnot(ctx.register(ctx.obj({Type:'Annot', Subtype:'Square', Rect:[x, H - y - 60, x + 60, H - y], C:[1, 0, 0], IC:[1, 0, 0], AP:{N:ap}})));
  } }));
await win.waitForTimeout(2000);
await A(() => window.__pdfapp.setTool('select')); await win.waitForTimeout(300);

// the screen captured for `ms` after `act` starts; for each picture, is the point red?
const red = async (pts, act, ms = 2500) => {
  const dpr = await A(() => window.devicePixelRatio || 1);
  const done = act();
  const shots = [], t0 = Date.now();
  while (Date.now() - t0 < ms) {
    const png = await app.evaluate(async ({BrowserWindow}, pts) => { const wc = BrowserWindow.getAllWindows()[0].webContents, img = await wc.capturePage(), bm = img.toBitmap(), w = img.getSize().width, sf = img.getSize().width / wc.getOwnerBrowserWindow().getContentBounds().width;
      return pts.map(p => { const o = (Math.round(p.y * sf) * w + Math.round(p.x * sf)) * 4; return bm[o + 2] > 200 && bm[o + 1] < 80 && bm[o] < 80; }); }, pts);   // (BGRA)
    shots.push(png);
  }
  await done;
  return shots;
};
const center = async k => { const b = (await A(async () => (await window.__pdfapp.getAnns(0)).filter(a => a.subtype === 'Square').map(a => ({x:a.x, y:a.y, w:a.w, h:a.h}))))[k]; return {x:b.x + b.w / 2, y:b.y + b.h / 2}; };

// ---- one object dragged ----------------------------------------------------------------------------------------------------
{
  const c0 = await center(0), p0 = await at(c0.x, c0.y), p1 = await at(c0.x + 200, c0.y);
  await win.mouse.move(p0.x, p0.y); await win.mouse.down(); await win.mouse.move(p1.x, p1.y, {steps:8}); await win.waitForTimeout(300);
  const shots = await red([p1, p0], () => win.mouse.up());
  check('one object dragged: shown at its new place in every picture until the page is drawn again', shots.every(s => s[0]), shots.map(s => +s[0]).join(''));
  check('…and never back at its old place', shots.every(s => !s[1]), shots.map(s => +s[1]).join(''));
  await win.keyboard.press('Escape'); await win.waitForTimeout(500);
}
// ---- a group dragged ---------------------------------------------------------------------------------------------------------
{
  const c0 = await center(0), c1 = await center(1);
  const q0 = await at(c0.x, c0.y), q1 = await at(c1.x, c1.y);
  await win.mouse.click(q0.x, q0.y); await win.waitForTimeout(400);
  await win.keyboard.down('Shift'); await win.mouse.click(q1.x, q1.y); await win.keyboard.up('Shift'); await win.waitForTimeout(500);
  const n1 = await at(c1.x + 150, c1.y + 20), n0 = await at(c0.x + 150, c0.y + 20);
  await win.mouse.move(q1.x, q1.y); await win.mouse.down(); await win.mouse.move(n1.x, n1.y, {steps:8}); await win.waitForTimeout(300);
  const shots = await red([n0, n1, q0, q1], () => win.mouse.up());
  check('a group dragged: both shown at their new places in every picture', shots.every(s => s[0] && s[1]), shots.map(s => +(s[0] && s[1])).join(''));
  check('…and never back at their old places', shots.every(s => !s[2] && !s[3]), shots.map(s => +(s[2] || s[3])).join(''));
  await win.keyboard.press('Escape'); await win.waitForTimeout(500);
}
// ---- nudged with the arrow keys ----------------------------------------------------------------------------------------------
{
  const c0 = await center(0), q0 = await at(c0.x, c0.y);
  await win.mouse.click(q0.x, q0.y); await win.waitForTimeout(400);
  const n = await at(c0.x + 40, c0.y), o = await at(c0.x - 26, c0.y);
  for (let k = 0; k < 4; k++) await win.keyboard.press('Shift+ArrowRight');
  const shots = await red([n, o], async () => {});
  check('nudged with the arrow keys: shown at its new place at once and until the page is drawn again', shots.every(s => s[0]), shots.map(s => +s[0]).join(''));
  check('…and not back at its old place', shots.every(s => !s[1]), shots.map(s => +s[1]).join(''));
}

console.log(failed ? `\n${failed} check(s) failed` : '\nall checks passed');
await app.evaluate(({app}) => app.exit(0)).catch(() => {});
