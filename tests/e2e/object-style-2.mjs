// 選到物件時工具列（v1.0.34）: text boxes, stamps, pictures and area fills selected with the select tool show their own
// settings in the bar above the pages; a change there is applied to that object (one undo step, still selected).
import { launchPath, TMP } from './_env.mjs';
import { PDFDocument, PDFName, PDFHexString, rgb } from 'pdf-lib';
import fs from 'fs';
import path from 'path';

let failed = 0;
const check = (name, ok, detail = '') => { console.log(`${ok ? '✔' : '✘'} ${name}${detail !== '' ? '  ' + (typeof detail === 'string' ? detail : JSON.stringify(detail)) : ''}`); if (!ok) { failed++; process.exitCode = 1; } };

// a page with a closed frame (for the area fill) and a stamp an older version made (no PDFE, no stored settings)
const doc = await PDFDocument.create(), pg = doc.addPage([595, 842]);
pg.drawRectangle({x:330, y:60, width:200, height:140, borderColor:rgb(0, 0, 0), borderWidth:2});
const oldAP = doc.context.register(doc.context.stream('q 0.8 0.1 0.1 RG 3 w 2 2 96 36 re S Q', {Type:'XObject', Subtype:'Form', BBox:[0, 0, 100, 40]}));
pg.node.set(PDFName.of('Annots'), doc.context.obj([doc.context.register(doc.context.obj({Type:'Annot', Subtype:'Stamp', Rect:[60, 60, 160, 100], Name:'Approved', Contents:PDFHexString.fromText('核准'),
  Subj:PDFHexString.fromText('戳記'), T:PDFHexString.fromText('old'), F:4, AP:{N:oldAP}}))]));
const PDF = path.join(TMP, 'os2.pdf'); fs.writeFileSync(PDF, await doc.save());

const { app } = await launchPath(PDF);
const win = await app.firstWindow(); win.on('pageerror', e => console.log('PAGEERR', e.message)); win.on('console', m => { if (m.type() === 'error') console.log('C', m.text().slice(0, 300)); });
await win.waitForTimeout(3000);
const A = win.evaluate.bind(win);
const P = (i, x, y) => A(([i, x, y]) => { const r = window.__pdfapp.S.els[i].getBoundingClientRect(), s = window.__pdfapp.S.scale; return [r.left + x * s, r.top + y * s]; }, [i, x, y]);
const see = async (i, x, y) => {
  await A(([i, x, y]) => { const S = window.__pdfapp.S, vw = document.querySelector('#viewer'), vr = vw.getBoundingClientRect(), r = S.els[i].getBoundingClientRect();
    vw.scrollTop += r.top + y * S.scale - (vr.top + vr.height / 2); vw.scrollLeft += r.left + x * S.scale - (vr.left + vr.width / 2); }, [i, x, y]);
  await win.waitForTimeout(350); return P(i, x, y);
};
const tool = async t => { await A(t => window.__pdfapp.setTool(t), t); await win.waitForTimeout(250); };
const click = async xy => { await win.mouse.click(...xy); await win.waitForTimeout(600); };
const anns = (i, sub) => A(async ([i, sub]) => (await window.__pdfapp.getAnns(i)).filter(a => !sub || a.subtype === sub).map(a => ({id:a.id, sub:a.subtype, x:a.x, y:a.y, w:a.w, h:a.h, contents:a.contents})), [i, sub]);
const sel = () => A(() => window.__pdfapp.sel());
const style = id => A(id => window.__pdfapp.annStyle(0, id), id);
const pick = async a => { await tool('select'); await click(await see(0, a.x + Math.min(6, a.w / 2), a.y + a.h / 2)); };
const settle = () => win.waitForTimeout(1800);
const near = (a, b, d = .6) => Math.abs(a - b) <= d;
const title = () => A(() => { const h = document.querySelector('#hint'); return h.classList.contains('show') && h.classList.contains('objbar') ? (h.querySelector('.sb-t') || {}).textContent || '' : null; });

// ---- part 1: text boxes ----------------------------------------------------------------------------------------------
await A(() => window.__pdfapp.fontReady());
const TB0 = await A(() => localStorage.getItem('pdfeditor.textbox.v1'));
await tool('textbox'); await click(await see(0, 100, 120)); await win.keyboard.type('Hello 世界'); await win.keyboard.press('Escape'); await settle();
let tb = (await anns(0, 'FreeText'))[0];
await pick(tb);
const runs = s => (s && s.rt ? s.rt.lines.flat() : []);
let st = tb && await style(tb.id);
const tbar = () => A(() => { const h = document.querySelector('#hint.objbar'); if (!h) return null; const sz = h.querySelector('select[data-tb="size"]'), b = h.querySelector('.tfmt[data-tb="bold"]');
  return {size:sz ? +sz.value : null, bold:b ? b.classList.contains('on') : null, font:(h.querySelector('[data-tbfont]') || {}).textContent || null}; });
let tb0 = await tbar();
check('a text box selected: 已選取：文字方塊, its size in the bar', !!tb && (await title() || '').includes('已選取：文字方塊') && !!tb0 && tb0.size === runs(st)[0]?.size && tb0.bold === false, {title:await title(), tb0, runs:runs(st)});
const box0 = {x:tb.x, y:tb.y, w:tb.w, h:tb.h};
await win.selectOption('#hint.objbar select[data-tb="size"]', '24'); await settle();
st = await style(tb.id); tb = (await anns(0, 'FreeText')).find(a => a.id === tb.id);
check('字級 24: every run 24, the box grows from its top-left corner, the text the same, still selected',
  runs(st).length > 0 && runs(st).every(r => r.size === 24) && tb.h > box0.h + 4 && near(tb.x, box0.x) && near(tb.y, box0.y) && tb.contents === 'Hello 世界' && (await sel())?.id === tb.id, {runs:runs(st), tb, box0, sel:await sel()});
const tbc = async (key, v) => { await win.click(`#hint.objbar .cpick[data-tbc="${key}"]`); await win.waitForTimeout(300); await win.click(`#cpMenu [data-v="${v}"]`); await win.waitForTimeout(200); if (await A(() => document.querySelector('#cpMenu').style.display === 'block')) await win.click('#cpMenu [data-cpx="ok"]'); await settle(); };
await tbc('color', '#e03131');
st = await style(tb.id);
check('顏色: every run red', runs(st).every(r => r.color === '#e03131'), runs(st));
await win.click('#hint.objbar .tfmt[data-tb="bold"]'); await settle();
st = await style(tb.id);
const boldOn = runs(st).every(r => r.bold), barBold = (await tbar())?.bold;
await win.click('#hint.objbar .tfmt[data-tb="bold"]'); await settle();
st = await style(tb.id);
check('粗體: on for every run, then off again', boldOn && barBold === true && runs(st).every(r => !r.bold), {boldOn, barBold, runs:runs(st)});
await win.click('#hint.objbar .tfmt[data-tb="bold"]'); await win.click('#hint.objbar .tfmt[data-tb="bold"]'); await win.waitForTimeout(3000);
st = await style(tb.id);
check('粗體 pressed twice quickly: not bold', runs(st).every(r => !r.bold), runs(st));
await tbc('boxBg', '#fff3bf');
await win.click('#hint.objbar input[data-tb="border"]'); await settle();
st = await style(tb.id);
check('方塊背景 and 框線: on the box', st?.rt?.box?.boxBg === '#fff3bf' && st?.rt?.box?.border === true, st?.rt?.box);
await win.click('#hint.objbar [data-tbfont]'); await win.waitForTimeout(500);
await win.click('#fontMenu .fm-it[data-f="DejaVu Serif"]'); await settle();
st = await style(tb.id);
check('字型: every run in the chosen font, the button says so', runs(st).every(r => r.font === 'DejaVu Serif') && ((await tbar())?.font || '').includes('DejaVu Serif'), {runs:runs(st), bar:await tbar()});
await win.keyboard.press('Control+z'); await settle();
st = await style(tb.id);
check('復原 once: the font change undone, the rest kept', runs(st).every(r => !r.font && r.color === '#e03131' && r.size === 24) && st?.rt?.box?.border === true, runs(st));
check('the text box tool\'s own defaults unchanged', (await A(() => localStorage.getItem('pdfeditor.textbox.v1'))) === TB0);
// two runs of different sizes: a new colour keeps them different
await win.keyboard.press('Escape'); await tool('textbox'); await click(await see(0, 100, 260)); await win.keyboard.type('AB');
await win.keyboard.down('Shift'); await win.keyboard.press('ArrowLeft'); await win.keyboard.up('Shift');
await win.selectOption('#hint select[data-tb="size"]', '20'); await win.waitForTimeout(300);
await win.keyboard.press('Escape'); await settle();
const tb2 = (await anns(0, 'FreeText')).find(a => a.id !== tb.id);
await pick(tb2);
const s20 = runs(await style(tb2.id)).map(r => r.size);
await tbc('color', '#1c64d9');
const st2 = await style(tb2.id);
check('runs of different sizes: a new colour keeps their sizes', s20.length === 2 && s20[0] !== s20[1] && JSON.stringify(runs(st2).map(r => r.size)) === JSON.stringify(s20) && runs(st2).every(r => r.color === '#1c64d9'), {s20, runs:runs(st2)});

// ---- part 2: stamps and pictures -------------------------------------------------------------------------------------
const cpk = async (key, v) => { await win.click(`#hint.objbar .cpick[data-cp="${key}"]`); await win.waitForTimeout(300); await win.click(`#cpMenu [data-v="${v}"]`); await win.waitForTimeout(200); if (await A(() => document.querySelector('#cpMenu').style.display === 'block')) await win.click('#cpMenu [data-cpx="ok"]'); await settle(); };
const setSel = async (key, v) => { await win.selectOption(`#hint.objbar select[data-s="${key}"]`, String(v)); await settle(); };
const has = q => A(q => !!document.querySelector(q), q);
const chain = id => A(id => window.__pdfapp.apChain(0, id), id);
const boxOf = async id => { const a = (await anns(0)).find(x => x.id === id); return a && {x:a.x, y:a.y, w:a.w, h:a.h, cx:a.x + a.w / 2, cy:a.y + a.h / 2, contents:a.contents}; };
const turn30 = async () => {
  const rh = await win.locator('.asel .rh').boundingBox({timeout:8000}), sb = await win.locator('.asel').boundingBox();
  const c0 = {x:sb.x + sb.width / 2, y:sb.y + sb.height / 2}, h0 = {x:rh.x + rh.width / 2, y:rh.y + rh.height / 2}, R = Math.hypot(h0.x - c0.x, h0.y - c0.y), a0 = Math.atan2(h0.y - c0.y, h0.x - c0.x);
  await win.mouse.move(h0.x, h0.y); await win.mouse.down();
  for (let k = 1; k <= 10; k++) { const ang = a0 + 30 * Math.PI / 180 * k / 10; await win.mouse.move(c0.x + R * Math.cos(ang), c0.y + R * Math.sin(ang)); }
  await win.mouse.up(); await win.waitForTimeout(2200);
};
await win.keyboard.press('Escape');
const STAMP0 = JSON.stringify({t:'核准', c:'green', kind:'box'});
await A(v => localStorage.setItem('pdfeditor.stamp.v1', v), STAMP0);
const stamps0 = (await anns(0, 'Stamp')).map(a => a.id);
await tool('stamp'); await click(await see(0, 200, 420)); await settle();
let sp = (await anns(0, 'Stamp')).find(a => !stamps0.includes(a.id));
await pick(sp);
let ss = sp && await style(sp.id);
check('a stamp selected: 已選取：戳記 with 更換戳記, colour, opacity; its settings stored', (await title() || '').includes('已選取：戳記') && await has('#hint.objbar [data-o="stamp"]') && await has('#hint.objbar .cpick[data-cp="color"]') && await has('#hint.objbar select[data-s="opacity"]')
  && ss?.spec?.t === '核准' && !isNaN(Date.parse(ss?.spec?.when)), {title:await title(), ss});
const sb0 = await boxOf(sp.id), when0 = ss?.spec?.when;
await cpk('color', '#1c64d9');
ss = await style(sp.id); let sb1 = await boxOf(sp.id);
check('戳記 顏色: drawn again in the new colour, same size and time, still selected', ss?.spec?.c === '#1c64d9' && ss?.spec?.when === when0 && near(sb1.w, sb0.w) && near(sb1.h, sb0.h) && near(sb1.x, sb0.x) && (await sel())?.id === sp.id, {spec:ss?.spec, sb0, sb1});
await setSel('opacity', .5);
ss = await style(sp.id); let ch = await chain(sp.id);
check('透明度 50%: on the stamp, one layer over its drawing', ss?.opacity === .5 && ch?.length === 2 && ch[0].includes('/GS0 gs') && ch[1].includes('/Im0 Do'), {op:ss?.opacity, ch});
await setSel('opacity', .7);
ss = await style(sp.id); ch = await chain(sp.id);
check('透明度 70%: still one layer (the old one replaced)', ss?.opacity === .7 && ch?.length === 2 && ch[1].includes('/Im0 Do'), {op:ss?.opacity, ch});
await setSel('opacity', 1);
ss = await style(sp.id); ch = await chain(sp.id);
check('透明度 100%: the layer gone, no CA', ss?.opacity === 1 && ch?.length === 1 && ch[0].includes('/Im0 Do') && !(await A(id => window.__pdfapp.annHas(0, id, 'CA'), sp.id)), {op:ss?.opacity, ch});
await win.click('#hint.objbar [data-o="stamp"]'); await win.waitForTimeout(800);
const mt = await A(() => document.querySelector('#mask').classList.contains('show') ? document.querySelector('#modal .mh').textContent : null);
await win.click('#stGrid .st-item:nth-child(2)'); await win.waitForTimeout(200);
await win.click('#modal .mf button:has-text("使用此戳記")'); await settle();
ss = await style(sp.id); sb1 = await boxOf(sp.id);
check('更換戳記: the picker, then 不核准 in its place (same centre and height), the tool\'s stamp unchanged', mt === '選擇戳記' && ss?.spec?.t === '不核准' && near(sb1.cx, sb0.cx, 1) && near(sb1.cy, sb0.cy, 1) && near(sb1.h, sb0.h)
  && (await A(() => localStorage.getItem('pdfeditor.stamp.v1'))) === STAMP0 && (await sel())?.id === sp.id, {mt, spec:ss?.spec, sb0, sb1});
await turn30();
const d0 = (await style(sp.id))?.deg;
if ((await sel())?.id !== sp.id) await pick(await boxOf(sp.id));
await cpk('color', '#2b8a3e');
const ds1 = await style(sp.id);
await win.click('#hint.objbar [data-o="stamp"]'); await win.waitForTimeout(800);
await win.click('#stGrid .st-item:nth-child(3)'); await win.waitForTimeout(200);
await win.click('#modal .mf button:has-text("使用此戳記")'); await settle();
const ds2 = await style(sp.id);
check('a turned stamp: a new colour and a new stamp keep its angle', Math.abs((d0 || 0) - 30) < 3 && ds1?.spec?.c === '#2b8a3e' && Math.abs(ds1.deg - d0) < .5 && ds2?.spec?.t === '已審閱' && Math.abs(ds2.deg - d0) < .5, {d0, d1:ds1?.deg, d2:ds2?.deg, t:ds2?.spec?.t});
await win.keyboard.press('Escape');
const old = (await anns(0, 'Stamp')).find(a => a.contents === '核准' && a.y > 700);
await pick(old);
check('a stamp from an older version: 更換戳記 and opacity, no colour (with a note why)', (await title() || '').includes('已選取：戳記') && await has('#hint.objbar [data-o="stamp"]') && !(await has('#hint.objbar .cpick[data-cp="color"]'))
  && (await A(() => document.querySelector('#hint.objbar').textContent)).includes('舊版蓋的戳記無法改顏色'), {old, title:await title()});
// pictures: a wide one inserted, then replaced by a tall one
const png = (w, h, c) => A(([w, h, c]) => { const cv = document.createElement('canvas'); cv.width = w; cv.height = h; const g = cv.getContext('2d'); g.fillStyle = c; g.fillRect(0, 0, w, h); return cv.toDataURL('image/png').split(',')[1]; }, [w, h, c]);
const WIDE = path.join(TMP, 'wide.png'), TALL = path.join(TMP, 'tall.png');
fs.writeFileSync(WIDE, Buffer.from(await png(200, 100, '#e03131'), 'base64')); fs.writeFileSync(TALL, Buffer.from(await png(100, 200, '#1c64d9'), 'base64'));
await win.keyboard.press('Escape');
const [fc1] = await Promise.all([win.waitForEvent('filechooser', {timeout:8000}), A(() => window.__pdfapp.setTool('image'))]);
await fc1.setFiles(WIDE); await win.waitForTimeout(800);
await click(await see(0, 150, 560)); await settle();
let im = (await anns(0, 'Stamp')).find(a => a.contents === 'wide.png');
if ((await sel())?.id !== im?.id && im) await pick(im);
check('a picture selected: 已選取：圖片 with 更換圖片 and opacity', !!im && (await title() || '').includes('已選取：圖片') && await has('#hint.objbar [data-o="image"]') && await has('#hint.objbar select[data-s="opacity"]'), {im, title:await title()});
await setSel('opacity', .5);
const ib0 = await boxOf(im.id);
const [fc2] = await Promise.all([win.waitForEvent('filechooser', {timeout:8000}), win.click('#hint.objbar [data-o="image"]')]);
await fc2.setFiles(TALL); await win.waitForTimeout(600); await settle();
const ib1 = await boxOf(im.id), is1 = await style(im.id); ch = await chain(im.id);
check('更換圖片: the new picture in the old frame, centred, not stretched; still 50%', ib1?.contents === 'tall.png' && ib1.x >= ib0.x - .5 && ib1.y >= ib0.y - .5 && ib1.x + ib1.w <= ib0.x + ib0.w + .5 && ib1.y + ib1.h <= ib0.y + ib0.h + .5
  && near(ib1.cx, ib0.cx, 1) && near(ib1.cy, ib0.cy, 1) && Math.abs(ib1.w / ib1.h - .5) < .02 && is1?.opacity === .5 && ch?.length === 2 && (await sel())?.id === im.id, {ib0, ib1, op:is1?.opacity, ch});

// ---- part 3: an area fill (點選區塊) -----------------------------------------------------------------------------------
await win.keyboard.press('Escape');
const px = async (x, y) => { await see(0, x, y); await win.waitForTimeout(600); return A(([x, y]) => { const S = window.__pdfapp.S, c = S.els[0].querySelector('canvas.pc'), k = c.width / S.pages[0].w;
  const d = c.getContext('2d').getImageData(Math.round(x * k), Math.round(y * k), 1, 1).data; return [d[0], d[1], d[2]]; }, [x, y]); };
const close = (c, hex, d = 24) => !!c && [1, 3, 5].every((o, k) => Math.abs(c[k] - parseInt(hex.slice(o, o + 2), 16)) <= d);
await tool('fill'); await click(await see(0, 430, 712)); await win.waitForTimeout(2500);
const fl = (await anns(0, 'Stamp')).find(a => a.contents === '填色區塊');
if (fl) await pick(fl);
const fb = await A(() => { const h = document.querySelector('#hint.objbar'); return h && {title:h.querySelector('.sb-t').textContent, color:!!h.querySelector('.cpick[data-cp="color"]'), width:!!h.querySelector('select[data-s="width"]'), op:!!h.querySelector('select[data-s="opacity"]')}; });
check('an area fill selected: 已選取：填色 with colour and opacity', !!fl && !!fb && fb.title.includes('已選取：填色') && fb.color && fb.op && !fb.width, {fl, fb});
const pc0 = await px(430, 712);
await cpk('color', '#8ce99a');
const fs1 = fl && await style(fl.id), pc1 = await px(430, 712);
check('填色 顏色: the same area in the new colour', fs1?.color === '#8ce99a' && close(pc1, '#8ce99a') && !close(pc0, '#8ce99a') && (await sel())?.id === fl?.id, {fs1:fs1 && {color:fs1.color, op:fs1.opacity}, pc0, pc1});
await setSel('opacity', .5);
const fs2 = fl && await style(fl.id), pc2 = await px(430, 712);
check('填色 透明度 50%: on the fill, paler on the page', fs2?.opacity === .5 && close(pc2, '#c6f4cd', 14), {op:fs2?.opacity, pc2});
await cpk('color', '#1c64d9');
const fs3 = fl && await style(fl.id), pc3 = await px(430, 712);
check('填色: a new colour keeps 50%', fs3?.opacity === .5 && close(pc3, '#8eb2ec', 14), {op:fs3?.opacity, pc3});

console.log(failed ? `\n${failed} check(s) failed` : '\nall checks passed');
await app.evaluate(({app}) => app.exit(0)).catch(() => {});
