// Text that is turned (90° / 180° / 270°, also because the page is rotated) or written vertically (直書, and
// "fake" vertical text stacked one character per line) can be edited in place: the editor turns / writes vertically
// like the text, and the new text is written back in the same direction, where it was.
import { launchPath, TMP, ROOT } from './_env.mjs';
import { buildRotatedFixture } from './_rotated_fixture.mjs';
import { execFileSync } from 'child_process';
import fs from 'fs';
const file = TMP + '/rot.pdf'; await buildRotatedFixture(ROOT, file);
const { app } = await launchPath(file);
const win = await app.firstWindow(); win.on('pageerror', e => console.log('PAGEERR', e.message)); win.on('console', m => { if (m.type() === 'error') console.log('C', m.text().slice(0, 300)); });
await win.waitForTimeout(3500);
await win.click('[data-view="single"]'); await win.waitForTimeout(500);
await win.click('[data-tool="textbox"]'); await win.waitForTimeout(500);
const A = win.evaluate.bind(win);
// the text items of page i: [text, direction of its x axis (signs), vertical?]
const items = i => A(async i => { const pg = window.__pdfapp.S.pages[i], tc = await pg.page.getTextContent();
  return tc.items.filter(t => t.str.trim()).map(t => ({s:t.str, d:t.transform.slice(0, 2).map(v => Math.sign(Math.round(v))).join(','), v:t.dir === 'ttb', x:Math.round(t.transform[4]), y:Math.round(t.transform[5])})); }, i);
const extract = async (i, name) => { const b = await A(() => Array.from(window.__pdfapp.S.bytes)); const f = TMP + '/' + name; fs.writeFileSync(f, Buffer.from(b));
  return execFileSync('pdftotext', ['-f', String(i + 1), '-l', String(i + 1), f, '-']).toString().split('\n').filter(Boolean).join(' / '); };
// screen point on the text containing `str` (at its first character)
const at = (i, str) => A(async ({i, str}) => { const app = window.__pdfapp, pg = app.S.pages[i], tc = await pg.page.getTextContent(), it = tc.items.find(t => t.str.includes(str)); if (!it) return null;
  const [a, b, c, d, e, f] = it.transform, fs = Math.hypot(c, d), ux = [a / fs, b / fs], uy = [c / fs, d / fs], k = it.dir === 'ttb' ? [-uy[0] * fs * .5, -uy[1] * fs * .5] : [ux[0] * fs * .5 + uy[0] * fs * .3, ux[1] * fs * .5 + uy[1] * fs * .3];
  const [x, y] = pg.vp1.convertToViewportPoint(e + k[0], f + k[1]), vw = document.querySelector('#viewer'), vr = vw.getBoundingClientRect();
  let r = app.S.els[i].getBoundingClientRect(); vw.scrollTop += r.top + y * app.S.scale - (vr.top + vr.height / 2);   // bring it to the middle of the view
  r = app.S.els[i].getBoundingClientRect();
  return {x:r.left + x * app.S.scale, y:r.top + y * app.S.scale}; }, {i, str});
const editor = () => A(() => { const e = document.querySelector('.tbed'); return e && {t:e.style.transform, wm:getComputedStyle(e).writingMode, text:e.textContent}; });
// where the first character sits on screen (pt) in the editor, and later on the page
const edCharPt = () => A(() => { const e = document.querySelector('.tbed'), r = document.createRange(), tn = document.createTreeWalker(e, NodeFilter.SHOW_TEXT).nextNode(); r.setStart(tn, 0); r.setEnd(tn, 1);
  const b = r.getBoundingClientRect(), p = window.__pdfapp.S.els[window.__pdfapp.TBE().i].getBoundingClientRect(), s = window.__pdfapp.S.scale; return [(b.left + b.width / 2 - p.left) / s, (b.top + b.height / 2 - p.top) / s]; });
const pageCharPt = (i, str) => A(async ({i, str}) => { const pg = window.__pdfapp.S.pages[i], tc = await pg.page.getTextContent(), it = tc.items.find(t => t.str.includes(str)); if (!it) return null;
  const [a, b, c, d, e, f] = it.transform, fs = Math.hypot(c, d), ux = [a / fs, b / fs], uy = [c / fs, d / fs];
  const w1 = it.dir === 'ttb' ? fs : (it.width / [...it.str].length);   // first character: half its advance in, half an em up/down from the baseline
  const q = it.dir === 'ttb' ? [e - uy[0] * fs * .5, f - uy[1] * fs * .5] : [e + ux[0] * w1 / 2 + uy[0] * fs * .38, f + ux[1] * w1 / 2 + uy[1] * fs * .38];
  return pg.vp1.convertToViewportPoint(q[0], q[1]); }, {i, str});
const r1 = p => p && p.map(v => Math.round(v * 10) / 10);
async function edit(i, str, add, label){
  if (i) { await A(i => window.__pdfapp.scrollToPage(i), i); await win.waitForTimeout(900); }
  const p = await at(i, str); if (!p) { console.log(label.padEnd(18), 'NOT FOUND'); return; }
  await win.waitForTimeout(400);
  await win.mouse.click(p.x, p.y); await win.waitForTimeout(900);
  const ed = await editor(), c0 = await edCharPt().catch(() => null);
  await win.keyboard.press('End'); await win.keyboard.type(add); await win.waitForTimeout(150);
  await win.keyboard.press('Escape'); await win.waitForTimeout(3000);
  const now = (await items(i)).filter(t => t.s.includes(add.trim()));
  const c1 = await pageCharPt(i, add.trim());
  console.log(label.padEnd(18), 'editor', ed && `${ed.t.replace(/scale\([^)]*\)\s*/, '') || 'upright'} ${ed.wm}`, '|', JSON.stringify(now.map(t => [t.s, t.d, t.v ? 'V' : 'H'])));
  return {c0};
}

const before = await items(0);
console.log('page 1 before   ', JSON.stringify(before.map(t => [t.s, t.d, t.v ? 'V' : 'H'])));
await edit(0, '轉九十度', '加', 'turned 90°');
await edit(0, '倒過來', '！', 'turned 180°');
const vBefore = before.find(t => t.s.startsWith('直書'));
await edit(0, '直書測試', '改', 'vertical');
const vAfter = (await items(0)).find(t => t.s.includes('改'));
console.log('vertical column  ', 'before at', vBefore.x, vBefore.y, '| after at', vAfter && vAfter.x, vAfter && vAfter.y);
await edit(0, '假', '字', 'fake vertical');
console.log('page 1 text      ', await extract(0, 'p1.pdf'));
// edit the vertical block again: it comes back vertical, with its text
let p = await at(0, '改'); await win.mouse.click(p.x, p.y); await win.waitForTimeout(900);
console.log('re-edit vertical ', JSON.stringify(await editor()));
await win.keyboard.press('Escape'); await win.waitForTimeout(800);
// page 2: rotated page
console.log('page 2 before   ', JSON.stringify((await items(1)).map(t => [t.s, t.d])));
await edit(1, '正立文字', '。', 'rotated page');
await edit(1, '畫面上是直的', '喔', 'sideways on page');
console.log('page 2 text      ', await extract(1, 'p2.pdf'));
// what you see while editing is what is written: compare where a character sits in the editor and on the page
await A(() => window.__pdfapp.scrollToPage(0)); await win.waitForTimeout(900);
for (const [str, add] of [['轉九十度', '乙'], ['直書測試', '丙']]) {
  p = await at(0, str); await win.mouse.click(p.x, p.y); await win.waitForTimeout(900);
  const e0 = await edCharPt(); await win.keyboard.press('Escape'); await win.waitForTimeout(500);
  // same text, so nothing was written: now force a change and compare the first character's place
  p = await at(0, str); await win.mouse.click(p.x, p.y); await win.waitForTimeout(900);
  await win.keyboard.press('End'); await win.keyboard.type(add); await win.keyboard.press('Escape'); await win.waitForTimeout(3000);
  const pc = await pageCharPt(0, str);
  console.log(('place ' + str).padEnd(18), 'editor', JSON.stringify(r1(e0)), 'page', JSON.stringify(r1(pc)));
}
await win.screenshot({path:TMP + '/rot_p1.png'});
await app.evaluate(({app}) => app.exit(0)).catch(() => {});
