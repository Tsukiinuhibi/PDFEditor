// The view bar (page, zoom, view mode, aids, layers) never squashes its buttons into each other: as the window gets
// narrower it drops the small labels, then shows icons only, group by group; if it still does not fit, the
// mouse wheel scrolls it sideways.
import { launch, TMP } from './_env.mjs';
let failed = 0;
const check = (name, ok, detail = '') => { console.log(`${ok ? '✔' : '✘'} ${name}${detail !== '' ? '  ' + (typeof detail === 'string' ? detail : JSON.stringify(detail)) : ''}`); if (!ok) { failed++; process.exitCode = 1; } };
const { app } = await launch('vb.pdf');
const win = await app.firstWindow(); win.on('pageerror', e => console.log('PAGEERR', e.message)); win.on('console', m => { if (m.type() === 'error') console.log('C', m.text().slice(0, 300)); });
await win.waitForTimeout(3000);
const A = win.evaluate.bind(win);
const size = (w, h = 800) => app.evaluate(({BrowserWindow}, [w, h]) => BrowserWindow.getAllWindows()[0].setContentSize(w, h), [w, h]);
// what the bar looks like: items narrower than their content, items overlapping their neighbour, which labels show
const bar = () => A(() => {
  const v = document.querySelector('#viewbar'), kids = [...v.children].filter(c => c.offsetParent && getComputedStyle(c).display !== 'none');
  const squashed = kids.filter(c => c.scrollWidth > c.clientWidth + 1).map(c => (c.textContent.trim() || c.title).slice(0, 6));
  const overlap = []; for (let k = 1; k < kids.length; k++) { const a = kids[k - 1].getBoundingClientRect(), b = kids[k].getBoundingClientRect(); if (b.left < a.right - .5) overlap.push((kids[k - 1].textContent.trim() || kids[k - 1].title).slice(0, 4) + '/' + (kids[k].textContent.trim() || kids[k].title).slice(0, 4)); }
  const shown = s => { const e = v.querySelector(s); return !!e && e.offsetParent !== null && e.getBoundingClientRect().width > 0 && getComputedStyle(e).display !== 'none'; };
  const labelShown = s => { const b = v.querySelector(s); return !!b && /[一-鿿]/.test(b.innerText); };
  return {w:v.clientWidth, need:v.scrollWidth, squashed, overlap, lbl:shown('.lbl'), fitText:labelShown('[data-zoom="fit-width"]'), viewText:labelShown('[data-view="single"]'), layersText:labelShown('[data-act="layers"]')};
});
for (const w of [1500, 1100, 900]) {
  await size(w); await win.waitForTimeout(800);
  const b = await bar();
  console.log(`   ${w}px`, JSON.stringify(b));
  check(`${w}: no squashed buttons`, b.squashed.length === 0, b.squashed);
  check(`${w}: nothing overlaps`, b.overlap.length === 0, b.overlap);
  await win.screenshot({path:`${TMP}/viewbar_${w}.png`, clip:{x:0, y:0, width:w, height:200}});
}
await size(1500); await win.waitForTimeout(800);
const wide = await bar();
check('wide: every label shows', wide.lbl && wide.fitText && wide.viewText && wide.layersText, wide);
await size(900); await win.waitForTimeout(800);
const narrow = await bar();
check('narrow: labels dropped, icons only', !narrow.lbl && !narrow.fitText && !narrow.viewText, narrow);
check('900 (the narrowest window): fits without a scrollbar', narrow.need <= narrow.w + 1, [narrow.w, narrow.need]);
// still usable: the icon-only 符合寬度 works
await win.click('#viewbar [data-zoom="fit-width"]'); await win.waitForTimeout(800);
check('icon button still works', await A(() => document.querySelector('#viewbar [data-zoom="fit-width"]').classList.contains('on')));
// too narrow even for icons: the wheel scrolls the bar sideways
await A(() => { document.querySelector('#viewbar').style.maxWidth = '420px'; }); await win.waitForTimeout(500);
const vb = await win.locator('#viewbar').boundingBox();
await win.mouse.move(vb.x + 200, vb.y + vb.height / 2);
const before = await A(() => document.querySelector('#viewbar').scrollLeft);
await win.mouse.wheel(0, 240); await win.waitForTimeout(300);
const after = await A(() => document.querySelector('#viewbar').scrollLeft);
check('wheel scrolls the bar', after > before, [before, after]);
const tight = await bar();
check('420px: still no squashing', tight.squashed.length === 0 && tight.overlap.length === 0, tight);
await A(() => { document.querySelector('#viewbar').style.maxWidth = ''; });
console.log(failed ? `${failed} check(s) failed` : 'all checks passed');
await app.evaluate(({app}) => app.exit(0)).catch(() => {});
