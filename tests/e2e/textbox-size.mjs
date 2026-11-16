// 文字方塊的大小與字級: the size box takes a typed number (decimals too) and has a list of sizes; a text box made here is
// made bigger or smaller by dragging one of its four corners (the text scales with it, the opposite corner stays put)
import { launch } from './_env.mjs';

let failed = 0;
const check = (name, ok, detail = '') => { console.log(`${ok ? '✔' : '✘'} ${name}${detail !== '' ? '  ' + (typeof detail === 'string' ? detail : JSON.stringify(detail)) : ''}`); if (!ok) { failed++; process.exitCode = 1; } };
const near = (a, b, t) => Math.abs(a - b) <= t;

const { app } = await launch('tbsize.pdf');
const win = await app.firstWindow();
win.on('pageerror', e => console.log('PAGEERR', e.message));
win.on('console', m => { if (m.type() === 'error') console.log('C', m.text().slice(0, 300)); });
await win.waitForFunction(() => !!(window.__pdfapp && window.__pdfapp.S.pages.length), null, {timeout:30000});
await win.waitForTimeout(1500);
const A = win.evaluate.bind(win);
await win.click('[data-view="single"]'); await win.waitForTimeout(500);

// screen point of a page-view point (pt from the page's top-left), scrolled into view first
const pt = (x, y) => A(({x, y}) => { const app = window.__pdfapp, vw = document.querySelector('#viewer'), vr = vw.getBoundingClientRect(); let e = app.S.els[0].getBoundingClientRect();
  vw.scrollTop += e.top + y * app.S.scale - (vr.top + vr.height / 2); e = app.S.els[0].getBoundingClientRect(); return {x:e.left + x * app.S.scale, y:e.top + y * app.S.scale}; }, {x, y});
const at = (x, y) => A(({x, y}) => { const app = window.__pdfapp, e = app.S.els[0].getBoundingClientRect(); return {x:e.left + x * app.S.scale, y:e.top + y * app.S.scale}; }, {x, y});
const box = async () => { const l = await A(async () => (await window.__pdfapp.getAnns(0)).filter(a => a.subtype === 'FreeText').map(a => ({id:a.id, x:a.x, y:a.y, w:a.w, h:a.h}))); return l[0] || null; };
const sizes = async () => { const l = await A(() => window.__pdfapp.tbRT(0)); return l.length ? l[0].rt.lines.flat().map(r => r.size) : null; };
const sizeBox = () => A(() => { const el = document.querySelector('#hint [data-tb="size"]'); return el ? {tag:el.tagName, value:el.value} : null; });
const setSize = async v => { await win.click('#hint input[data-tb="size"]', {clickCount:3}); await win.keyboard.type(String(v)); await win.keyboard.press('Enter'); await win.waitForTimeout(400); };

// ---- part 1: the size box -----------------------------------------------------------------------------------------------
await win.click('[data-tool="textbox"]'); await win.waitForTimeout(400);
{ const p = await pt(100, 420); await win.mouse.click(p.x, p.y); await win.waitForTimeout(600); }
await win.keyboard.type('Size test 字級'); await win.keyboard.press('Control+a');
const sb0 = await sizeBox();
check('the size box is a box to type in', !!sb0 && sb0.tag === 'INPUT', sb0);
if (sb0 && sb0.tag === 'INPUT') {
  await win.click('#hint input[data-tb="size"]'); await win.waitForTimeout(200);
  check('the size box focused: the highlighted text is still marked', await A(() => !!(window.CSS && CSS.highlights && CSS.highlights.has('tb-sel'))));
  await setSize('13.5');
  const ed = await A(() => (window.__pdfapp.TBE() || {}).html || '');
  check('a typed size with a decimal: the highlighted text takes 13.5', /font-size:\s*13\.5px/.test(ed), ed.slice(0, 200));
  check('the box shows 13.5', (await sizeBox()).value === '13.5', await sizeBox());
  await setSize('abc');
  check('a size that is not a number: nothing changes, the box shows the size again', (await sizeBox()).value === '13.5' && /font-size:\s*13\.5px/.test(await A(() => (window.__pdfapp.TBE() || {}).html || '')), await sizeBox());
  await setSize('1000');
  check('a size out of range (4–400): not taken', (await sizeBox()).value === '13.5', await sizeBox());
  // the list of sizes next to it
  await win.click('#hint [data-szm]'); await win.waitForTimeout(300);
  const menu = await A(() => { const c = document.querySelector('#ctx'); return c.style.display === 'block' ? [...c.querySelectorAll('[data-sz]')].map(b => b.dataset.sz) : null; });
  check('〔▾〕 lists the usual sizes', !!menu && menu.includes('12') && menu.includes('24') && menu.includes('72'), menu);
  if (menu) { await win.click('#ctx [data-sz="24"]'); await win.waitForTimeout(400); }
  // (minors) a second click on 〔▾〕 closes the list; Esc closes it too
  await win.click('#hint [data-szm]'); await win.waitForTimeout(300);
  await win.click('#hint [data-szm]'); await win.waitForTimeout(300);
  const shut = await A(() => document.querySelector('#ctx').style.display !== 'block');
  await win.click('#hint [data-szm]'); await win.waitForTimeout(300); await win.keyboard.press('Escape'); await win.waitForTimeout(300);
  const shut2 = await A(() => document.querySelector('#ctx').style.display !== 'block');
  check('〔▾〕 clicked again: the list closes; Esc closes it too', shut && shut2, {shut, shut2});
  check('a size picked from the list: 24', /font-size:\s*24px/.test(await A(() => (window.__pdfapp.TBE() || {}).html || '')) && (await sizeBox()).value === '24', await sizeBox());
  await setSize('13.5');
  // (final review) mixed sizes highlighted, the size shown typed again and Enter: all of it takes that size; the
  // writing goes on in the text box afterwards
  await win.keyboard.press('End'); for (let k = 0; k < 2; k++) await win.keyboard.press('Shift+ArrowLeft');
  await setSize('20'); await win.keyboard.press('Control+a'); await win.waitForTimeout(200);
  const shown = (await sizeBox()).value;
  await setSize(shown);
  await win.keyboard.press('End'); await win.keyboard.type('!'); await win.waitForTimeout(200);
  const mixed = await A(() => (window.__pdfapp.TBE() || {}).html || '');
  check('mixed sizes highlighted, the shown size typed again + Enter: all of it takes it; typing goes on in the text', !/font-size:\s*20px/.test(mixed) && /font-size:\s*13\.5px/.test(mixed) && /!/.test(mixed), {shown, mixed:mixed.slice(0, 240)});
  await win.keyboard.press('Backspace'); await win.keyboard.press('Control+a');
  // Esc in the size box: the size typed is dropped, the writing goes on
  await win.click('#hint input[data-tb="size"]', {clickCount:3}); await win.keyboard.type('30'); await win.keyboard.press('Escape'); await win.waitForTimeout(300);
  check('Esc in the size box: nothing applied, the box shows the size, the text box still open', (await sizeBox()).value === '13.5' && !/font-size:\s*30px/.test(await A(() => (window.__pdfapp.TBE() || {}).html || '')) && !!(await A(() => window.__pdfapp.TBE())), await sizeBox());
  // full-width digits (a Chinese input method), a trailing point, "pt"
  await setSize('１４'); const fw = (await sizeBox()).value; await setSize('13.'); const tp = (await sizeBox()).value; await setSize('12pt'); const pt2 = (await sizeBox()).value;
  check('sizes typed as １４, 13. and 12pt are read as 14, 13 and 12', fw === '14' && tp === '13' && pt2 === '12', {fw, tp, pt2});
  await setSize('13.5');
}
await win.keyboard.press('Escape'); await win.waitForTimeout(2500);
check('saved with the size 13.5', JSON.stringify(await sizes()) === '[13.5]', await sizes());

// ---- part 2: four corners -----------------------------------------------------------------------------------------------
await A(() => window.__pdfapp.setTool('select')); await win.waitForTimeout(300);
const b0 = await box();
{ const p = await at(b0.x + b0.w / 2, b0.y + b0.h / 2); await win.mouse.click(p.x, p.y); await win.waitForTimeout(700); }
const hs = await A(() => [...document.querySelectorAll('.asel .h')].map(h => h.dataset.d).sort());
check('a selected text box has four corner handles', JSON.stringify(hs) === JSON.stringify(['ne', 'nw', 'se', 'sw']), hs);
const drag = async (from, to) => { await win.mouse.move(from.x, from.y); await win.mouse.down(); await win.mouse.move(to.x, to.y, {steps:8}); await win.mouse.up(); await win.waitForTimeout(2500); };
if (hs.length === 4) {
  // the bottom-right corner pulled out to 1.5 times: the text 1.5 times bigger, the top-left corner where it was
  await drag(await at(b0.x + b0.w, b0.y + b0.h), await at(b0.x + b0.w * 1.5, b0.y + b0.h * 1.5));
  const b1 = await box(), s1 = await sizes();
  check('the bottom-right corner pulled out: the text about 1.5 times bigger (13.5 → ~20.3), its top-left corner kept', !!s1 && s1.length === 1 && s1[0] >= 19.6 && s1[0] <= 21 && near(b1.x, b0.x, .6) && near(b1.y, b0.y, .6) && near(b1.w / b0.w, 1.5, .08), {s1, b0, b1});
  check('it stays selected', await A(() => !!window.__pdfapp.sel()));
  // the top-left corner pulled in: smaller again, the bottom-right corner where it was
  await drag(await at(b1.x, b1.y), await at(b1.x + b1.w / 3, b1.y + b1.h / 3));
  const b2 = await box(), s2 = await sizes();
  check('the top-left corner pulled in: smaller (~20.3 → ~13.5), its bottom-right corner kept', !!s2 && s2.length === 1 && s2[0] >= 12.8 && s2[0] <= 14.2 && near(b2.x + b2.w, b1.x + b1.w, .8) && near(b2.y + b2.h, b1.y + b1.h, .8), {s2, b1, b2});
  // undo goes back one step at a time
  await win.click('#bUndo'); await win.waitForTimeout(2000);
  check('復原: the size before the last drag', JSON.stringify(await sizes()) === JSON.stringify(s1), [await sizes(), s1]);
  // the size box of the selected box shows its size and takes a typed one
  { const b3 = await box(); const p = await at(b3.x + b3.w / 2, b3.y + b3.h / 2); await win.mouse.click(p.x, p.y); await win.waitForTimeout(900); }
  check('the bar of the selected box: its size in the box', (await sizeBox() || {}).value === String(s1[0]), [await sizeBox(), s1]);
  if ((await sizeBox() || {}).tag === 'INPUT') { await setSize('10.5'); await win.waitForTimeout(2000); }
  check('a size typed for the whole box: 10.5', JSON.stringify(await sizes()) === '[10.5]', await sizes());
  // (leftovers) a box already at the smallest size pulled in further: nothing changes, no undo step
  if ((await sizeBox() || {}).tag === 'INPUT') { await setSize('4'); await win.waitForTimeout(2000); }
  await win.keyboard.press('Escape'); await win.waitForTimeout(300);
  { const b4 = await box(); const p = await at(b4.x + b4.w / 2, b4.y + b4.h / 2); await win.mouse.click(p.x, p.y); await win.waitForTimeout(800);
    const u0 = await A(() => window.__pdfapp.S.undo.length);
    await drag(await at(b4.x + b4.w, b4.y + b4.h), await at(b4.x + b4.w * .6, b4.y + b4.h * .6));
    check('a box at 4 pt pulled smaller: nothing changes, no undo step, still selected', JSON.stringify(await sizes()) === '[4]' && await A(() => window.__pdfapp.S.undo.length) === u0 && await A(() => !!window.__pdfapp.sel()), {sizes:await sizes(), u0, u1:await A(() => window.__pdfapp.S.undo.length)}); }
}

// ---- part 3: a text box another program made: no corner handles (it cannot be redrawn here) ---------------------------------
await A(() => window.__pdfapp.mutate('test', doc => { const P = PDFLib, p = doc.getPage(0);
  p.node.addAnnot(doc.context.register(doc.context.obj({Type:'Annot', Subtype:'FreeText', Rect:[300, 200, 440, 230], Contents:P.PDFString.of('foreign box'), DA:P.PDFString.of('0 g /Helv 12 Tf')}))); }));
await win.waitForTimeout(1500);
const fb = (await A(async () => (await window.__pdfapp.getAnns(0)).filter(a => a.subtype === 'FreeText' && a.contents === 'foreign box').map(a => ({x:a.x, y:a.y, w:a.w, h:a.h}))))[0];
if (fb) { const p = await pt(fb.x + fb.w / 2, fb.y + fb.h / 2); await win.mouse.click(p.x, p.y); await win.waitForTimeout(1200); }   // (scrolled into view first)
const fh = await A(() => ({h:document.querySelectorAll('.asel .h').length, hint:(document.querySelector('.abar .hintk') || {}).textContent || ''}));
check('a text box another program made: no corner handles, only 拖曳移動', !!fb && fh.h === 0 && fh.hint === '拖曳移動', {fb, fh});

console.log(failed ? `\n${failed} check(s) failed` : '\nall checks passed');
await app.evaluate(({app}) => app.exit(0)).catch(() => {});
