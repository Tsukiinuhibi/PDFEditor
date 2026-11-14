// 連結工具: drag a box with the link tool to make a link (a web address, a page of this document, an e-mail address);
// with the tool on, every link shows and can be changed or deleted; Ctrl+click follows a link with any tool.
import { launchPath, TMP } from './_env.mjs';
import { PDFDocument, PDFName, PDFString, PDFArray, PDFDict, PDFRef, PDFNumber } from 'pdf-lib';
import fs from 'fs';
import path from 'path';

let failed = 0;
const check = (name, ok, detail = '') => { console.log(`${ok ? '✔' : '✘'} ${name}${detail !== '' ? '  ' + (typeof detail === 'string' ? detail : JSON.stringify(detail)) : ''}`); if (!ok) { failed++; process.exitCode = 1; } };

// three pages; page 2 turned by /Rotate 90; page 3 holds links other programs made: a named destination (page 1) lying
// over a red rectangle, one with a red 2 pt frame drawn from /BS (as Acrobat writes it), one to another file (GoToR)
const doc = await PDFDocument.create(), ctx = doc.context, N = n => PDFName.of(n);
const p1 = doc.addPage([595, 842]), p2 = doc.addPage([595, 842]), p3 = doc.addPage([595, 842]);
p2.node.set(N('Rotate'), ctx.obj(90));
const dests = ctx.obj({}); dests.set(N('first'), ctx.obj([p1.ref, N('Fit')]));
doc.catalog.set(N('Dests'), ctx.register(dests));
p3.node.set(N('Annots'), ctx.obj([ctx.register(ctx.obj({Type:'Annot', Subtype:'Square', Rect:[90, 690, 310, 740], C:[1, 0, 0], Border:[0, 0, 2], F:4})),
  ctx.register(ctx.obj({Type:'Annot', Subtype:'Link', Rect:[100, 700, 300, 730], Border:[0, 0, 0], Dest:N('first')})),
  ctx.register(ctx.obj({Type:'Annot', Subtype:'Link', Rect:[100, 400, 300, 430], BS:{W:2, S:'S'}, C:[1, 0, 0], A:{S:'URI', URI:PDFString.of('https://red.example.com')}})),
  ctx.register(ctx.obj({Type:'Annot', Subtype:'Link', Rect:[100, 300, 300, 330], Border:[0, 0, 0], A:{S:'GoToR', F:PDFString.of('other.pdf'), D:PDFString.of('intro')}}))]));
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
    mail:document.querySelector('#lkMail').value, look:document.querySelector('#lkLook').value, err:(document.querySelector('#lkErr') || {}).textContent || '', go:document.querySelector('#lkGo').disabled, del:!!document.querySelector('#lkDel')}; });
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
const askOpen = async () => { const a = await Ev(() => ({shown:document.querySelector('#mask').classList.contains('show') && !!document.querySelector('#lnkOpen'), text:(document.querySelector('#modal') || {}).textContent || ''}));
  if (a.shown) { await win.click('#lnkOpen'); await win.waitForTimeout(700); } return a; };   // (v1.0.48: a web address is asked about first)
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
const nd = L.find(l => l.page != null);
check('changed to page 2: written as /Dest [page 2 /Fit]; its look left as it was (no frame, no /AP)', !!nd && nd.page === 1 && nd.fit && nd.border === 0 && !nd.ap, L);
await see(0, 200, 280);
await ctrlClick(await P(0, 200, 280));
check('link tool, Ctrl+click on the page link: goes to page 2, no window', (await Ev(() => window.__pdfapp.S.current)) === 1 && !(await dlg()), await Ev(() => window.__pdfapp.S.current));
await Ev(() => window.__pdfapp.setTool('select')); await win.waitForTimeout(300);
await app.evaluate(({shell}) => { global.__opened = []; shell.openExternal = u => { global.__opened.push(u); return Promise.resolve(); }; });
await see(0, 200, 140);
await ctrlClick(await P(0, 200, 140));
const s1 = await Ev(() => window.__pdfapp.sel()), asked = await askOpen(), opened = await app.evaluate(() => global.__opened);
await see(0, 200, 280);
await ctrlClick(await P(0, 200, 280));
const cur = await Ev(() => window.__pdfapp.S.current);
check('selection tool, Ctrl+click: the web link opens https://example.org in the browser after asking (nothing selected); the page link goes to page 2', asked.shown && /example\.org/.test(asked.text) && opened.length === 1 && opened[0].replace(/\/$/, '') === 'https://example.org' && !s1 && cur === 1, {opened, s1, cur});
await see(2, 200, 127);
await win.mouse.click(...(await P(2, 200, 127))); await win.waitForTimeout(600);
const s3 = await Ev(() => window.__pdfapp.sel());
check('selection tool, a plain click where a link lies over a rectangle: the rectangle is selected', !!s3 && s3.sub === 'Square', s3);

// ---- part 3 (final review): ( ) \ and Chinese in addresses; frames from /BS; links of other kinds; a long document --------
await Ev(() => window.__pdfapp.setTool('link')); await win.waitForTimeout(300);
await make(0, [100, 500], [300, 530], async () => { await setF('#lkUrl', 'https://example.com/foo)'); });
await make(0, [100, 600], [300, 630], async () => { await setF('#lkKind', 'mail'); await setF('#lkMail', '王小明@example.com'); });
L = await links(0);
const dec = s => { try { return decodeURIComponent(s); } catch (_) { return s; } };
await see(0, 200, 615);
await win.mouse.click(...(await P(0, 200, 615))); await win.waitForTimeout(500);
const dm = await dlg(); await win.keyboard.press('Escape'); await win.waitForTimeout(300);
check('an address with an unpaired ")" is kept whole; an e-mail address in Chinese too, and shown as typed when opened again',
  L.length === 5 && L.some(l => l.url === 'https://example.com/foo)') && L.some(l => dec(l.url || '') === 'mailto:王小明@example.com') && !!dm && dm.mail === '王小明@example.com', {urls:L.map(l => l.url), dm});
await see(2, 200, 427);
await win.mouse.click(...(await P(2, 200, 427))); await win.waitForTimeout(500);
const dr = await dlg();
await setF('#lkUrl', 'https://red.example.org'); await win.click('#lkGo'); await win.waitForTimeout(2200);
let red = (await links(2)).find(l => /red\.example/.test(l.url || ''));
const kept = !!red && red.url === 'https://red.example.org' && red.look === 'other' && JSON.stringify(red.c) === '[1,0,0]';
await see(2, 200, 427);
await win.mouse.click(...(await P(2, 200, 427))); await win.waitForTimeout(500);
await setF('#lkLook', 'none'); await win.click('#lkGo'); await win.waitForTimeout(2200);
red = (await links(2)).find(l => /red\.example/.test(l.url || ''));
check("another program's frame drawn from /BS (red, 2 pt): shown as 維持原樣 (not 細藍框), a new target keeps it; 不顯示框 takes it away", !!dr && dr.look === 'other' && kept && !!red && red.look === 'none', {dr, kept, red});
await see(2, 200, 527);
const tipG = await Ev(() => [...window.__pdfapp.S.els[2].querySelectorAll('.lnk')].map(x => x.title).find(t => /other\.pdf/.test(t)) || '');
await win.mouse.click(...(await P(2, 200, 527))); await win.waitForTimeout(500);
const dg = await dlg();
await win.keyboard.press('Enter'); await win.waitForTimeout(800);
const still = await dlg();
await setF('#lkLook', 'blue'); await win.click('#lkGo'); await win.waitForTimeout(2200);
const gr = (await links(2)).find(l => /other\.pdf/.test(l.url || ''));
check('a link to another file (GoToR): 「其他連結」, kept as it is (〔儲存〕 off, Enter does nothing); a new look keeps where it goes',
  tipG.startsWith('其他連結：other.pdf') && !!dg && dg.kind === 'other' && dg.go && !!still && still.kind === 'other' && !!gr && gr.act === 'GoToR' && gr.ap, {tipG, dg, still, gr});
const longDoc = await PDFDocument.create();
for (let k = 0; k < 210; k++) { const pg = longDoc.addPage([200, 100]); pg.node.set(N('Annots'), longDoc.context.obj([longDoc.context.register(longDoc.context.obj({Type:'Annot', Subtype:'Link', Rect:[10, 10, 190, 90], Border:[0, 0, 0], A:{S:'URI', URI:PDFString.of('https://example.org/p' + k)}}))])); }
const LONG = path.join(TMP, 'long.pdf'); fs.writeFileSync(LONG, await longDoc.save());
await app.evaluate(({BrowserWindow}, p) => BrowserWindow.getAllWindows()[0].webContents.send('open-path', p), LONG);
await win.waitForFunction(() => window.__pdfapp.S.pages.length === 210, null, {timeout:30000}); await win.waitForTimeout(1000);
await Ev(() => window.__pdfapp.setTool('select'));
for (let k = 0; k < 8; k++) await Ev(() => window.__pdfapp.actions.zoomOut());
await win.waitForTimeout(1000);
await Ev(async () => { const vw = document.querySelector('#viewer'); for (let y = 0; y <= vw.scrollHeight; y += vw.clientHeight * 0.7) { vw.scrollTop = y; await new Promise(r => setTimeout(r, 250)); } });
await win.waitForTimeout(1500);
const shown = await Ev(() => window.__pdfapp.S.st.filter(st => st.ovlVer === window.__pdfapp.S.version).length);
await Ev(() => window.__pdfapp.scrollToPage(0)); await win.waitForTimeout(1000);
await app.evaluate(() => { global.__opened = []; });
await ctrlClick(await P(0, 100, 50)); await askOpen();
const op = await app.evaluate(() => global.__opened);
check("a 210-page document with every page shown once: Ctrl+click on page 1's link still opens it", shown > 200 && op.length === 1 && op[0].startsWith('https://example.org/p0'), {shown, op});

// ---- part 4 (v1.0.48): links other programs wrote in other ways; Ctrl+click after a change, after a drag; drawing over a link --
const d4 = await PDFDocument.create(), c4 = d4.context, q1 = d4.addPage([595, 842]), q2 = d4.addPage([595, 842]);
q1.node.set(N('Annots'), c4.obj([
  c4.obj({Type:'Annot', Subtype:'Link', Rect:[100, 700, 300, 730], Border:[0, 0, 0], A:{S:'URI', URI:PDFString.of('https://direct.example.com')}}),   // a direct dictionary (no object number)
  c4.register(c4.obj({Type:'Annot', Subtype:'Link', Rect:[100, 600, 300, 630], Border:[0, 0, 1], A:{S:'URI', URI:PDFString.of('https://framed.example.com')}})),   // a frame, no /AP, no colour
  c4.register(c4.obj({Type:'Annot', Subtype:'Link', Rect:[100, 500, 300, 530], Border:[0, 0, 0], A:{S:'JavaScript', JS:PDFString.of('app.alert(1)')}})),
  c4.register(c4.obj({Type:'Annot', Subtype:'Link', Rect:[100, 400, 300, 430], Border:[0, 0, 0], Dest:[q2.ref, N('Fit')]})),
  c4.register(c4.obj({Type:'Annot', Subtype:'Link', Rect:[100, 300, 300, 330], Border:[0, 0, 0], A:{S:'URI', URI:PDFString.of('https://old.example.com')}, PA:{S:'URI', URI:PDFString.of('https://old.example.com')}})),
]));
const PDF4 = path.join(TMP, 'links4.pdf'); fs.writeFileSync(PDF4, await d4.save());
await app.evaluate(({BrowserWindow}, p) => BrowserWindow.getAllWindows()[0].webContents.send('open-path', p), PDF4);
await win.waitForFunction(() => window.__pdfapp.S.pages.length === 2 && /links4/.test(window.__pdfapp.S.name), null, {timeout:30000}); await win.waitForTimeout(1500);
const rawLinks = async () => { const b = Buffer.from(await Ev(() => Array.from(window.__pdfapp.S.bytes))), dd = await PDFDocument.load(b), an = dd.getPage(0).node.lookupMaybe(N('Annots'), PDFArray);
  const out = []; for (let k = 0; an && k < an.size(); k++) { const x = an.lookup(k, PDFDict), a = x.lookupMaybe(N('A'), PDFDict), u = a && a.lookupMaybe(N('URI'), PDFString);
    out.push({url:u ? u.decodeText() : null, pa:!!x.get(N('PA')), direct:!(an.get(k) instanceof PDFRef)}); } return out; };
await Ev(() => window.__pdfapp.setTool('link')); await win.waitForTimeout(400);
// a link written straight into /Annots: it can be changed and deleted
await see(0, 200, 127); await win.mouse.click(...(await P(0, 200, 127))); await win.waitForTimeout(500);
const dd1 = await dlg(); if (dd1) { await setF('#lkUrl', 'https://direct2.example.com'); await win.click('#lkGo'); await win.waitForTimeout(2200); }
const afterSave = (await rawLinks()).map(l => l.url);
await see(0, 200, 127); await win.mouse.click(...(await P(0, 200, 127))); await win.waitForTimeout(500);
if (await dlg()) { await win.click('#lkDel'); await win.waitForTimeout(2200); }
const afterDel = (await rawLinks()).map(l => l.url);
check('a link written straight into /Annots (no object of its own): 〔儲存〕 changes it, 〔刪除連結〕 deletes it',
  !!dd1 && afterSave.includes('https://direct2.example.com') && !afterSave.includes('https://direct.example.com') && !afterDel.some(u => /direct/.test(u || '')), {dd1:!!dd1, afterSave, afterDel});
// a frame another program drew (/Border 1, no appearance): 維持原樣, not 細藍框
await see(0, 200, 227); await win.mouse.click(...(await P(0, 200, 227))); await win.waitForTimeout(500);
const dFr = await dlg(); await win.keyboard.press('Escape'); await win.waitForTimeout(400);
check("another program's frame without an appearance: 「維持原樣」, not 「細藍框」", !!dFr && dFr.look === 'other', dFr);
// a new target drops /PA (the address the link had before)
await see(0, 200, 527); await win.mouse.click(...(await P(0, 200, 527))); await win.waitForTimeout(500);
if (await dlg()) { await setF('#lkUrl', 'https://new.example.com'); await win.click('#lkGo'); await win.waitForTimeout(2200); }
const pa = (await rawLinks()).find(l => l.url === 'https://new.example.com');
check('a new target: /PA (the old address) goes too', !!pa && !pa.pa, await rawLinks());
// with the link tool, a box dragged from inside a link makes a new link (a plain click still opens that link)
await see(0, 200, 527);
await drag(await P(0, 150, 520), await P(0, 420, 600));
const dNew = await dlg(); if (dNew) { await win.keyboard.press('Escape'); await win.waitForTimeout(400); }
check('link tool: a box dragged from inside a link: 「建立連結」 for a new one', !!dNew && dNew.title.includes('建立連結'), dNew);
await Ev(() => window.__pdfapp.setTool('select')); await win.waitForTimeout(300);
// a JavaScript link: nothing runs or opens; it says so
await app.evaluate(() => { global.__opened = []; });
await see(0, 200, 327); await ctrlClick(await P(0, 200, 327));
const tJs = await Ev(() => [...document.querySelectorAll('#toasts .toast')].map(t => t.textContent)), oJs = await app.evaluate(() => global.__opened);
check('Ctrl+click on a JavaScript link: nothing opens, and it says the link is not supported', !oJs.length && tJs.some(x => /不支援/.test(x)) && !(await Ev(() => document.querySelector('#mask').classList.contains('show'))), {tJs, oJs});
// a web address: asked first; 〔取消〕 opens nothing
await see(0, 200, 527); await ctrlClick(await P(0, 200, 527));
const ask2 = await Ev(() => document.querySelector('#mask').classList.contains('show') && !!document.querySelector('#lnkOpen'));
if (ask2) { await win.keyboard.press('Escape'); await win.waitForTimeout(500); }
check('Ctrl+click on a web address: asked first; 〔取消〕 (Esc) opens nothing', ask2 && !(await app.evaluate(() => global.__opened)).length, {ask2, opened:await app.evaluate(() => global.__opened)});
// Ctrl+press on a link that ends in a drag: the next real click is not swallowed
await Ev(() => window.__pdfapp.scrollToPage(0)); await win.waitForTimeout(800);
await see(0, 200, 427); await Ev(() => window.__pdfapp.setTool('link')); await win.waitForTimeout(300);
{ const a = await P(0, 200, 427); await win.keyboard.down('Control'); await win.mouse.move(...a); await win.mouse.down(); await win.mouse.move(a[0] + 150, a[1] + 150, {steps:5}); await win.mouse.up(); await win.keyboard.up('Control'); }
await win.waitForTimeout(150); await win.click('[data-tool="select"]'); await win.waitForTimeout(300);
const toolNow = await Ev(() => window.__pdfapp.S.tool);
await Ev(() => window.__pdfapp.setTool('select'));
check('Ctrl+press on a link that ends in a drag: the next click (a tool button) still works', toolNow === 'select', toolNow);
// Ctrl+click right after a change, before the page's links are read again: the link is still followed
await Ev(() => window.__pdfapp.scrollToPage(0)); await win.waitForTimeout(600); await see(0, 200, 427);   // (the link mid-window, not under the status bar)
const cur0 = await Ev(() => window.__pdfapp.S.current);
await Ev(async () => {
  const A = window.__pdfapp, S = A.S;
  await A.mutate('已加入矩形', doc => { doc.getPage(0).drawRectangle({x:400, y:100, width:60, height:30}); });
  const r = S.els[0].getBoundingClientRect(), x = r.left + 200 * S.scale, y = r.top + 427 * S.scale, t = document.elementFromPoint(x, y);
  t.dispatchEvent(new PointerEvent('pointerdown', {bubbles:true, cancelable:true, ctrlKey:true, button:0, clientX:x, clientY:y, pointerId:1, isPrimary:true}));
  t.dispatchEvent(new PointerEvent('pointerup', {bubbles:true, cancelable:true, ctrlKey:true, button:0, clientX:x, clientY:y, pointerId:1, isPrimary:true}));
  t.dispatchEvent(new MouseEvent('click', {bubbles:true, cancelable:true, ctrlKey:true, button:0, clientX:x, clientY:y}));
});
await win.waitForTimeout(1500);
const cur1 = await Ev(() => window.__pdfapp.S.current);
check('Ctrl+click right after a change (the page\'s links not read again yet): the page link is still followed', cur0 === 0 && cur1 === 1, {cur0, cur1});

console.log(failed ? `\n${failed} check(s) failed` : '\nall checks passed');
await app.evaluate(({app}) => app.exit(0)).catch(() => {});
