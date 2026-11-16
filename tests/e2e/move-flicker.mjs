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

// (review) a second nudge right when the first is written (before the page is drawn again): when all is drawn, the object
// is shown plainly at its place (no veil or empty picture left over it)
{
  await A(async () => { const a = (await window.__pdfapp.getAnns(0)).filter(x => x.subtype === 'Square')[0]; window.__pdfapp.selectById ? 0 : 0; });
  for (let k = 0; k < 3; k++) { await win.keyboard.press('ArrowDown'); await win.waitForTimeout(650); await win.keyboard.press('ArrowDown'); await win.waitForTimeout(30); }
  await win.waitForTimeout(3000);
  const c = await center(0), p = await at(c.x, c.y);
  const shot = await red([p], async () => {}, 300);
  check('nudged again just as the first nudge is written: in the end shown plainly, no veil left', shot.every(s => s[0]) && await A(() => !document.querySelector('.aveil')), {shot:shot.map(s => +s[0]).join(''), veil:await A(() => document.querySelectorAll('.aveil').length)});
}

// ---- while dragging: the old place shows what is under the object (no pale patch), and what moves is the object alone ----------
{
  await win.keyboard.press('Escape'); await win.waitForTimeout(300);
  // a blue square over the picture in the page (orange): left of it the page as it is
  await A(() => window.__pdfapp.mutate('test', doc => { const ctx = doc.context, p = doc.getPage(0), H = p.getHeight();
    const ap = ctx.register(ctx.stream('0 0 1 rg 0 0 50 50 re f', {Type:'XObject', Subtype:'Form', BBox:[0, 0, 50, 50]}));
    p.node.addAnnot(ctx.register(ctx.obj({Type:'Annot', Subtype:'Square', Rect:[300, H - 300, 350, H - 250], C:[0, 0, 1], IC:[0, 0, 1], AP:{N:ap}}))); }));
  await win.waitForTimeout(2000);
  const px = async pts => app.evaluate(async ({BrowserWindow}, pts) => { const wc = BrowserWindow.getAllWindows()[0].webContents, img = await wc.capturePage(), bm = img.toBitmap(), w = img.getSize().width, sf = img.getSize().width / wc.getOwnerBrowserWindow().getContentBounds().width;
    return pts.map(p => { const o = (Math.round(p.y * sf) * w + Math.round(p.x * sf)) * 4; return [bm[o + 2], bm[o + 1], bm[o]]; }); }, pts);
  const old = await at(325, 275), side = await at(290, 275), to = await at(430, 275);
  const before = await px([old, side]);
  await win.mouse.move(old.x, old.y); await win.waitForTimeout(400); await win.mouse.down();
  await win.mouse.move(to.x, to.y, {steps:10}); await win.waitForTimeout(900);
  const during = await px([old, side, to]);
  await win.mouse.up(); await win.waitForTimeout(2500);
  const near = (a, b) => Math.max(...a.map((v, k) => Math.abs(v - b[k]))) <= 30;
  check('(the square sits on the picture: blue there, orange beside it)', before[0][2] > 200 && before[0][0] < 80 && before[1][0] > 180, before);
  check('while dragging: its old place looks like the page around it (no pale patch, no blue)', near(during[0], during[1]), during);
  check('…and what moves with the mouse is the square itself', during[2][2] > 200 && during[2][0] < 80, during[2]);
}

// ---- (leftovers) a turned object dragged: its old place shows what is under it, it moves alone ---------------------------------------
{
  await win.keyboard.press('Escape'); await win.waitForTimeout(300);
  const blue = () => A(async () => { const app = window.__pdfapp, l = (await app.getAnns(0)).filter(a => a.subtype === 'Square');
    for (const a of l) { const st = await app.annStyle(0, a.id); if (st && st.color === '#0000ff') return {id:a.id, x:a.x, y:a.y, w:a.w, h:a.h}; } return null; });   // (the blue one)
  let bq = await blue();
  { const p = await at(bq.x + bq.w / 2, bq.y + bq.h / 2); await win.mouse.click(p.x, p.y); await win.waitForTimeout(800); }
  await A(() => window.__pdfapp.turnSel(30)); await win.waitForTimeout(2000);
  await win.keyboard.press('Escape'); await win.waitForTimeout(500);
  bq = await blue();
  const c = {x:bq.x + bq.w / 2, y:bq.y + bq.h / 2}, old = await at(c.x, c.y), side = await at(bq.x - 12, c.y);
  const px = async pts => app.evaluate(async ({BrowserWindow}, pts) => { const wc = BrowserWindow.getAllWindows()[0].webContents, img = await wc.capturePage(), bm = img.toBitmap(), w = img.getSize().width, sf = img.getSize().width / wc.getOwnerBrowserWindow().getContentBounds().width;
    return pts.map(p => { const o = (Math.round(p.y * sf) * w + Math.round(p.x * sf)) * 4; return [bm[o + 2], bm[o + 1], bm[o]]; }); }, pts);
  let to = null; for (const [dx, dy] of [[110, 0], [0, 90], [-110, 0], [110, 90], [0, -90]]) { const t = await at(c.x + dx, c.y + dy), [col] = await px([t]); if (!(col[0] > 200 && col[1] < 80) && !(col[2] > 200 && col[0] < 80)) { to = t; break; } }   // (a spot with nothing red or blue on it)
  await win.mouse.move(old.x, old.y); await win.waitForTimeout(500); await win.mouse.down();
  await win.mouse.move(to.x, to.y, {steps:10}); await win.waitForTimeout(900);
  const during = await px([old, side, to]);
  await win.mouse.up(); await win.waitForTimeout(2500);
  const near = (a, b) => Math.max(...a.map((v, k) => Math.abs(v - b[k]))) <= 30;
  check('a turned object dragged: its old place looks like the page around it (no pale patch)', near(during[0], during[1]), during);
  check('…and what moves is the object (blue)', during[2][2] > 200 && during[2][0] < 80, during[2]);
}

console.log(failed ? `\n${failed} check(s) failed` : '\nall checks passed');
await app.evaluate(({app}) => app.exit(0)).catch(() => {});
