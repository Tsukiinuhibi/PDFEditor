// 連結工具: drag a box with the link tool to make a link (a web address, a page of this document, an e-mail address);
// with the tool on, every link shows and can be changed or deleted; Ctrl+click follows a link with any tool.
import { launchPath, TMP } from './_env.mjs';
import { PDFDocument, PDFName, PDFString, PDFArray, PDFDict, PDFRef, PDFNumber } from 'pdf-lib';
import fs from 'fs';
import path from 'path';

let failed = 0;
const check = (name, ok, detail = '') => { console.log(`${ok ? '✔' : '✘'} ${name}${detail !== '' ? '  ' + (typeof detail === 'string' ? detail : JSON.stringify(detail)) : ''}`); if (!ok) { failed++; process.exitCode = 1; } };

// three pages; page 2 turned by /Rotate 90; page 3 holds a link another program made (a named destination: page 1) lying
// over a red rectangle
const doc = await PDFDocument.create(), ctx = doc.context, N = n => PDFName.of(n);
const p1 = doc.addPage([595, 842]), p2 = doc.addPage([595, 842]), p3 = doc.addPage([595, 842]);
p2.node.set(N('Rotate'), ctx.obj(90));
const dests = ctx.obj({}); dests.set(N('first'), ctx.obj([p1.ref, N('Fit')]));
doc.catalog.set(N('Dests'), ctx.register(dests));
p3.node.set(N('Annots'), ctx.obj([ctx.register(ctx.obj({Type:'Annot', Subtype:'Square', Rect:[90, 690, 310, 740], C:[1, 0, 0], Border:[0, 0, 2], F:4})),
  ctx.register(ctx.obj({Type:'Annot', Subtype:'Link', Rect:[100, 700, 300, 730], Border:[0, 0, 0], Dest:N('first')}))]));
const PDF = path.join(TMP, 'links.pdf'); fs.writeFileSync(PDF, await doc.save());

const { app } = await launchPath(PDF);
const win = await app.firstWindow(); win.on('pageerror', e => console.log('PAGEERR', e.message)); win.on('console', m => { if (m.type() === 'error') console.log('C', m.text().slice(0, 300)); });
await win.waitForTimeout(3000);
await win.waitForFunction(() => !!(window.__pdfapp && window.__pdfapp.S.pages.length), null, {timeout:30000});
const Ev = win.evaluate.bind(win);
const P = (i, x, y) => Ev(([i, x, y]) => { const r = window.__pdfapp.S.els[i].getBoundingClientRect(), s = window.__pdfapp.S.scale; return [r.left + x * s, r.top + y * s]; }, [i, x, y]);
const see = async (i, x, y) => {
  await Ev(([i, x, y]) => { const S = window.__pdfapp.S, vw = document.querySelector('#viewer'), vr = vw.getBoundingClientRect(), r = S.els[i].getBoundingClientRect();
    vw.scrollTop += r.top + y * S.scale - (vr.top + vr.height / 2); vw.scrollLeft += r.left + x * S.scale - (vr.left + vr.width / 2); }, [i, x, y]);
  await win.waitForTimeout(400);
};
const drag = async (a, b) => { await win.mouse.move(...a); await win.mouse.down(); await win.mouse.move(...b, {steps:6}); await win.mouse.up(); await win.waitForTimeout(700); };
const links = i => Ev(i => window.__pdfapp.links(i), i);
// the bluest pixel of the page's picture along a short line across (x0..x1, y)
const bluest = (i, x0, x1, y) => Ev(([i, x0, x1, y]) => { const S = window.__pdfapp.S, c = S.els[i].querySelector('canvas.pc'), k = c.width / S.pages[i].w, g = c.getContext('2d');
  let best = null; for (let x = x0; x <= x1; x += 0.25) { const d = g.getImageData(Math.round(x * k), Math.round(y * k), 1, 1).data, s = d[2] - (d[0] + d[1]) / 2; if (!best || s > best.s) best = {s, rgb:[d[0], d[1], d[2]]}; } return best; }, [i, x0, x1, y]);
const undos = () => Ev(() => window.__pdfapp.S.undo.length);
const dlg = () => Ev(() => { const m = document.querySelector('#mask').classList.contains('show') && document.querySelector('#lkKind'); if (!m) return null;
  return {title:document.querySelector('#modal .mh').textContent, kind:document.querySelector('#lkKind').value, url:document.querySelector('#lkUrl').value, page:document.querySelector('#lkPage').value,
    mail:document.querySelector('#lkMail').value, err:(document.querySelector('#lkErr') || {}).textContent || '', go:document.querySelector('#lkGo').disabled, del:!!document.querySelector('#lkDel')}; });
const setF = async (sel, v) => { await Ev(([sel, v]) => { const el = document.querySelector(sel); el.value = v; el.dispatchEvent(new Event(el.tagName === 'SELECT' ? 'change' : 'input', {bubbles:true})); }, [sel, v]); await win.waitForTimeout(200); };
const make = async (i, a, b, fill) => { await see(i, (a[0] + b[0]) / 2, (a[1] + b[1]) / 2); await drag(await P(i, ...a), await P(i, ...b)); await fill(); await win.click('#lkGo'); await win.waitForTimeout(2200); };

// ---- part 1: making links ------------------------------------------------------------------------------------------------
await win.click('[data-amenu="insert"] .sp-arr'); await win.waitForTimeout(300);
await win.click('#toolMenu button:has-text("連結")'); await win.waitForTimeout(300);
check('插入 ▾ 連結: the link tool', (await Ev(() => window.__pdfapp.S.tool)) === 'link');
let u0 = await undos();
await see(0, 200, 150);
await drag(await P(0, 100, 120), await P(0, 300, 160));
let d = await dlg();
check('a box dragged: 「建立連結」, to a web address by default, 〔建立〕 off while empty', !!d && d.title.includes('建立連結') && d.kind === 'url' && d.go, d);
await setF('#lkUrl', 'example.com');
await win.click('#lkGo'); await win.waitForTimeout(2200);
let L = await links(0);
check('example.com: a link to https://example.com with no frame, where the box was; one undo step',
  L.length === 1 && L[0].url === 'https://example.com' && L[0].border === 0 && Math.abs(L[0].box.x - 100) < 2 && Math.abs(L[0].box.y - 120) < 2 && Math.abs(L[0].box.w - 200) < 2 && (await undos()) === u0 + 1, L);
await see(0, 200, 300);
await drag(await P(0, 100, 260), await P(0, 300, 300));
await setF('#lkKind', 'page'); await setF('#lkPage', '9');
const bad = await dlg();
check('page 9 of 3: a red line, 〔建立〕 off', bad.err.includes('1～3') && bad.go, bad);
await setF('#lkPage', '2'); await setF('#lkLook', 'blue');
await win.click('#lkGo'); await win.waitForTimeout(2200);
L = await links(0);
const toPage = L.find(l => l.page != null);
check('to page 2, with a thin blue frame: /Dest [page 2 /Fit], /Border 1, /C blue, drawn (/AP), not printed', !!toPage && toPage.page === 1 && toPage.fit && toPage.border === 1 && toPage.blue && toPage.ap && !toPage.printed, L);
const edge = await bluest(0, 98, 102, 280), inside = await bluest(0, 180, 184, 280);
check('the blue frame shows on the page; inside it the page is unchanged', edge.s > 100 && inside.s < 30, {edge, inside});
await make(0, [100, 400], [300, 430], async () => { await setF('#lkKind', 'mail'); await setF('#lkMail', 'someone@example.com'); });
L = await links(0);
check('to an e-mail address: mailto:someone@example.com', L.some(l => l.url === 'mailto:someone@example.com'), L);
await make(1, [150, 200], [350, 260], async () => { await setF('#lkUrl', 'https://example.net/p'); });
L = await links(1);
check('on a page turned by /Rotate 90: the link is where the box was dragged (as pdf.js reads it back)', L.length === 1 && Math.abs(L[0].box.x - 150) < 2 && Math.abs(L[0].box.y - 200) < 2 && Math.abs(L[0].box.w - 200) < 2 && Math.abs(L[0].box.h - 60) < 2, L);

// ---- part 2: seeing, changing and deleting links; Ctrl+click follows one ----------------------------------------------
const boxes = i => Ev(i => [...window.__pdfapp.S.els[i].querySelectorAll('.lnk')].map(d => ({title:d.title, shown:getComputedStyle(d).display !== 'none'})), i);
const ctrlClick = async xy => { await win.keyboard.down('Control'); await win.mouse.click(...xy); await win.keyboard.up('Control'); await win.waitForTimeout(1000); };
await see(0, 200, 140);
let B = await boxes(0);
check('with the link tool: a box for each link, its target as the tip', B.length === 3 && B.every(b => b.shown) && ['開啟網址：https://example.com', '跳到第 2 頁', '寄信給：someone@example.com'].every(t => B.some(b => b.title === t)), B);
await win.mouse.click(...(await P(0, 200, 140))); await win.waitForTimeout(500);
d = await dlg();
check('a click on a link: 「修改連結」 with https://example.com filled in, and 〔刪除連結〕', !!d && d.title.includes('修改連結') && d.kind === 'url' && d.url === 'https://example.com' && d.del, d);
u0 = await undos();
await setF('#lkUrl', 'example.org'); await setF('#lkLook', 'blue');
await win.click('#lkGo'); await win.waitForTimeout(2200);
L = await links(0);
const ex = L.find(l => (l.url || '').startsWith('https://example.'));
check('〔儲存〕: now https://example.org with a blue frame, in the same place; one undo step', L.length === 3 && !!ex && ex.url === 'https://example.org' && ex.border === 1 && ex.ap && Math.abs(ex.box.x - 100) < 2 && Math.abs(ex.box.y - 120) < 2 && (await undos()) === u0 + 1, L);
await see(0, 200, 140);
await win.mouse.click(...(await P(0, 200, 140))); await win.waitForTimeout(500);
await win.click('#lkDel'); await win.waitForTimeout(2200);
await see(0, 200, 140);
const gone = !(await links(0)).some(l => (l.url || '').startsWith('https://example.')), nb = (await boxes(0)).length;
await Ev(() => window.__pdfapp.actions.undo()); await win.waitForTimeout(2200);
await see(0, 200, 140);
L = await links(0);
check('〔刪除連結〕: the link and its box are gone; undo: both back', gone && nb === 2 && L.some(l => l.url === 'https://example.org') && (await boxes(0)).length === 3, {gone, nb, L, boxes:await boxes(0)});
await see(2, 200, 127);
await win.mouse.click(...(await P(2, 200, 127))); await win.waitForTimeout(500);
d = await dlg();
check("another program's link (a named destination): 「本文件的頁面」, page 1", !!d && d.kind === 'page' && d.page === '1', d);
await setF('#lkPage', '2'); await win.click('#lkGo'); await win.waitForTimeout(2200);
L = await links(2);
check('changed to page 2: written as /Dest [page 2 /Fit]; its look left as it was (no frame, no /AP)', L.length === 1 && L[0].page === 1 && L[0].fit && L[0].border === 0 && !L[0].ap, L);
await see(0, 200, 280);
await ctrlClick(await P(0, 200, 280));
check('link tool, Ctrl+click on the page link: goes to page 2, no window', (await Ev(() => window.__pdfapp.S.current)) === 1 && !(await dlg()), await Ev(() => window.__pdfapp.S.current));
await Ev(() => window.__pdfapp.setTool('select')); await win.waitForTimeout(300);
await app.evaluate(({shell}) => { global.__opened = []; shell.openExternal = u => { global.__opened.push(u); return Promise.resolve(); }; });
await see(0, 200, 140);
await ctrlClick(await P(0, 200, 140));
const opened = await app.evaluate(() => global.__opened), s1 = await Ev(() => window.__pdfapp.sel());
await see(0, 200, 280);
await ctrlClick(await P(0, 200, 280));
const cur = await Ev(() => window.__pdfapp.S.current);
check('selection tool, Ctrl+click: the web link opens https://example.org in the browser (nothing selected); the page link goes to page 2', opened.length === 1 && opened[0].replace(/\/$/, '') === 'https://example.org' && !s1 && cur === 1, {opened, s1, cur});
await see(2, 200, 127);
await win.mouse.click(...(await P(2, 200, 127))); await win.waitForTimeout(600);
const s3 = await Ev(() => window.__pdfapp.sel());
check('selection tool, a plain click where a link lies over a rectangle: the rectangle is selected', !!s3 && s3.sub === 'Square', s3);

console.log(failed ? `\n${failed} check(s) failed` : '\nall checks passed');
await app.evaluate(({app}) => app.exit(0)).catch(() => {});
