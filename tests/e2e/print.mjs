// 列印: the print window (printers, pages, paper, scaling, duplex, colour, what is printed) with a preview of each side of
// paper; the main process's printer list and printing are replaced (global.__pdfePrinters / __pdfePrintHook): a print job
// is printed to PDF with the same page setup, so its pages and paper size can be checked.
import { launchPath, TMP } from './_env.mjs';
import { PDFDocument, PDFName, PDFString } from 'pdf-lib';
import fs from 'fs';
import path from 'path';

let failed = 0;
const check = (name, ok, detail = '') => { console.log(`${ok ? '✔' : '✘'} ${name}${detail !== '' ? '  ' + (typeof detail === 'string' ? detail : JSON.stringify(detail)) : ''}`); if (!ok) { failed++; process.exitCode = 1; } };

// five pages, each one colour (red, green, blue, yellow, magenta); page 5 lies landscape. Page 2 holds two black squares:
// one that may be printed (F 4) and one that may not (F 0); page 3 holds one on a hidden layer
const COLORS = [[1, 0, 0], [0, .6, 0], [0, 0, 1], [1, .85, 0], [.85, 0, .85]];
const doc = await PDFDocument.create(), ctx = doc.context, N = n => PDFName.of(n);
COLORS.forEach((c, k) => {
  const [w, h] = k === 4 ? [842, 595] : [595, 842], p = doc.addPage([w, h]);
  p.node.set(N('Contents'), ctx.register(ctx.stream(`${c.join(' ')} rg 0 0 ${w} ${h} re f\n`)));
});
const ap = () => ctx.register(ctx.stream('0 0 0 rg 0 0 100 100 re f', {Type:'XObject', Subtype:'Form', BBox:[0, 0, 100, 100]}));
doc.getPage(1).node.set(N('Annots'), ctx.obj([
  ctx.register(ctx.obj({Type:'Annot', Subtype:'Square', Rect:[100, 700, 200, 800], C:[0, 0, 0], F:0, AP:{N:ap()}})),
  ctx.register(ctx.obj({Type:'Annot', Subtype:'Square', Rect:[300, 700, 400, 800], C:[0, 0, 0], F:4, AP:{N:ap()}})),
]));
const ocg = ctx.register(ctx.obj({Type:'OCG', Name:PDFString.of('Hidden')}));
doc.catalog.set(N('OCProperties'), ctx.obj({OCGs:[ocg], D:{Order:[ocg], ON:[], OFF:[ocg]}}));
doc.getPage(2).node.set(N('Annots'), ctx.obj([ctx.register(ctx.obj({Type:'Annot', Subtype:'Square', Rect:[100, 700, 200, 800], C:[0, 0, 0], F:4, OC:ocg, AP:{N:ap()}}))]));
const PDF = path.join(TMP, 'print.pdf'); fs.writeFileSync(PDF, await doc.save());

const { app } = await launchPath(PDF);
const win = await app.firstWindow(); win.on('pageerror', e => console.log('PAGEERR', e.message)); win.on('console', m => { if (m.type() === 'error') console.log('C', m.text().slice(0, 300)); });
await win.waitForTimeout(3000);
await win.waitForFunction(() => !!(window.__pdfapp && window.__pdfapp.S.pages.length), null, {timeout:30000});
await app.evaluate(() => {
  global.__pdfePrinters = async () => [{name:'OfficeMFP', displayName:'辦公室事務機', description:'', options:{}}, {name:'Microsoft Print to PDF', displayName:'Microsoft Print to PDF', description:'', options:{}}];
  global.__pdfePrinted = [];
  global.__pdfePrintHook = (wc, opts, cb) => {
    if (!opts.silent) { global.__pdfePrinted.push({opts, pdf:null}); cb(true, ''); return; }
    wc.printToPDF({preferCSSPageSize:true, printBackground:true}).then(b => { global.__pdfePrinted.push({opts, pdf:b.toString('base64')}); cb(true, ''); }, e => cb(false, String(e)));
  };
});
const Ev = win.evaluate.bind(win);
const printed = () => app.evaluate(() => global.__pdfePrinted.map(p => ({opts:p.opts, pdf:p.pdf})));
const pst = () => Ev(() => window.__pdfapp.printState());
const set = async (k, v) => { await Ev(([k, v]) => { const el = document.querySelector(`#prDlg [data-p="${k}"]`); if (el.type === 'checkbox') el.checked = v; else el.value = v;
  el.dispatchEvent(new Event(el.tagName === 'SELECT' || el.type === 'checkbox' ? 'change' : 'input', {bubbles:true})); }, [k, v]); await win.waitForTimeout(700); };
const val = k => Ev(k => { const el = document.querySelector(`#prDlg [data-p="${k}"]`); return el ? (el.type === 'checkbox' ? el.checked : el.value) : null; }, k);
// the colour of the preview at a point of the side's item `k` (fractions of the page there), or of the paper
const prevAt = (fx, fy, k = 0) => Ev(([fx, fy, k]) => {
  const s = window.__pdfapp.printState(), c = document.querySelector('#prPrev canvas'), r = c.width / s.paper.w, it = s.items[k];
  const x = it ? (it.rot % 180 ? it.x + (it.rot === 90 ? 1 - fy : fy) * it.w : it.x + fx * it.w) : fx * s.paper.w;
  const y = it ? (it.rot % 180 ? it.y + (it.rot === 90 ? fx : 1 - fx) * it.h : it.y + fy * it.h) : fy * s.paper.h;
  return [...c.getContext('2d').getImageData(Math.round(x * r), Math.round(y * r), 1, 1).data].slice(0, 3);
}, [fx, fy, k]);
const near = (c, want, d = 40) => c.every((v, k) => Math.abs(v - want[k]) <= d);
const RGB = COLORS.map(c => c.map(v => Math.round(v * 255)));
const open = async () => { await win.keyboard.press('Control+p'); await win.waitForTimeout(1500); };
// 〔列印〕 or 〔印表機內容…〕, then wait until the window has closed (the job sent) or 30 s
const send = async sel => { await win.click(sel); await win.waitForFunction(() => !window.__pdfapp.printState().open, null, {timeout:30000}).catch(() => {}); await win.waitForTimeout(200); };
const close = async () => { await win.click('#prCancel'); await win.waitForTimeout(500); };

// ---- part 1: the window, the pages, the paper, sending a job ---------------------------------------------------------
await open();
let s = await pst();
const printers = await Ev(() => [...document.querySelectorAll('#prDlg [data-p="printer"] option')].map(o => o.textContent));
check('Ctrl+P opens 列印: the system default printer first, then the printers', !!s && s.open && JSON.stringify(printers) === JSON.stringify(['系統預設印表機', '辦公室事務機', 'Microsoft Print to PDF']), {s, printers});
check('5 pages: 5 sides, 「第 1／5 面」, the first one red', s.sides === 5 && (await Ev(() => document.querySelector('#prPos').textContent)).includes('第 1／5 面') && near(await prevAt(.5, .5), RGB[0]), {s, px:await prevAt(.5, .5)});
check('the shared range reader takes full-width digits and commas; a reversed range; letters are wrong',
  JSON.stringify(await Ev(() => [...window.__pdfapp.parseRange('２－３，５', 5)])) === '[1,2,4]' && JSON.stringify(await Ev(() => [...window.__pdfapp.parseRange('5-3', 5)])) === '[2,3,4]' && (await Ev(() => window.__pdfapp.parseRange('a', 5))) === null);
await set('range', 'custom'); await set('custom', '2-3');
const s23 = await pst();
await set('custom', '9');
const bad = await Ev(() => ({err:(document.querySelector('#prDlg .pr-err') || {}).textContent || '', go:document.querySelector('#prGo').disabled}));
check('自訂「2-3」: 2 sides; 「9」 (past the end): a red message and 〔列印〕 off', s23.sides === 2 && bad.err.includes('頁面範圍') && bad.go, {s23, bad});
await set('range', 'all'); await set('subset', 'odd');
const sOdd = await pst();
await set('subset', 'all'); await set('reverse', true);
const sRev = await pst(), pxRev = await prevAt(.5, .5);
check('只印奇數頁: 3 sides; 反向列印: the last page first (page 5, magenta)', sOdd.sides === 3 && sRev.sides === 5 && near(pxRev, RGB[4]), {sOdd:sOdd.sides, pxRev});
check('page 5 (landscape) on upright paper: turned a quarter, the paper stays upright', sRev.paper.w < sRev.paper.h && sRev.items[0].rot % 180 === 90, sRev);
await set('reverse', false);
await Ev(() => document.querySelector('#prFwd').click()); await win.waitForTimeout(800);
const okPx = await prevAt(350 / 595, 92 / 842), noPx = await prevAt(150 / 595, 92 / 842);
await set('annots', 'none');
const docPx = await prevAt(350 / 595, 92 / 842);
check('page 2: a square that may be printed shows, one marked not to print does not; 只有文件: neither', near(okPx, [0, 0, 0]) && near(noPx, RGB[1]) && near(docPx, RGB[1]), {okPx, noPx, docPx});
await set('annots', 'all');
await Ev(() => document.querySelector('#prFwd').click()); await win.waitForTimeout(800);
const hidPx = await prevAt(150 / 595, 92 / 842);
check('page 3: a square on a hidden layer is not printed', near(hidPx, RGB[2]), hidPx);
await set('color', 'gray');
const gray = await prevAt(.5, .5);
check('黑白: the preview is gray', Math.max(...gray) - Math.min(...gray) <= 3 && gray[0] < 200, gray);
await set('color', 'color');
await set('printer', 'OfficeMFP'); await set('copies', '2'); await set('collate', true); await set('duplex', 'longEdge');
await send('#prGo');
const toasts = await Ev(() => [...document.querySelectorAll('.toast')].map(t => t.textContent).join('|'));
const jobs = await printed(), job = jobs.at(-1);
let pdfPages = null;
if (job && job.pdf) { const d = await PDFDocument.load(Buffer.from(job.pdf, 'base64')); pdfPages = d.getPages().map(p => p.getSize()).map(z => [Math.round(z.width), Math.round(z.height)]); }
check('〔列印〕: to 辦公室事務機, 2 copies collated, both sides (long edge), in colour, A4 upright', !!job && job.opts.silent === true && job.opts.deviceName === 'OfficeMFP' && job.opts.copies === 2 && job.opts.collate === true && job.opts.duplexMode === 'longEdge' && job.opts.color === true && job.opts.landscape === false && job.opts.pageSize && job.opts.pageSize.width === 210000 && job.opts.pageSize.height === 297000, job && job.opts);
check('what was printed: 5 sheets of A4', !!pdfPages && pdfPages.length === 5 && pdfPages.every(([w, h]) => Math.abs(w - 595) <= 1 && Math.abs(h - 842) <= 1), pdfPages);
check('after printing: the window closed, a message, nothing left to print', !(await pst()).open && (await Ev(() => document.querySelector('#printRoot').children.length)) === 0 && toasts.includes('已送到「辦公室事務機」'), toasts);
await open();
check('opened again: 辦公室事務機 and both sides come back; the pages and copies do not', (await val('printer')) === 'OfficeMFP' && (await val('duplex')) === 'longEdge' && (await val('range')) === 'all' && (await val('copies')) === '1', {printer:await val('printer'), duplex:await val('duplex'), range:await val('range'), copies:await val('copies')});
await set('printer', '');
check('another printer: its own settings (none yet: one side)', (await val('duplex')) === 'simplex', await val('duplex'));
await set('printer', 'OfficeMFP'); await set('quality', '300');
const n0 = (await printed()).length;
await win.click('#prGo'); await win.waitForTimeout(120); await close(); await win.waitForTimeout(3000);
check('〔取消〕 while the job is being prepared: nothing printed, nothing left behind, the window still open', (await printed()).length === n0 && (await Ev(() => document.querySelector('#printRoot').children.length)) === 0 && (await pst()).open);
await send('#prSys');
const sys = (await printed()).at(-1);
check('〔印表機內容…〕: the same job through the system print window', (await printed()).length === n0 + 1 && sys.opts.silent === false && sys.opts.deviceName === 'OfficeMFP', sys && sys.opts);

console.log(failed ? `\n${failed} check(s) failed` : '\nall checks passed');
await app.evaluate(({app}) => app.exit(0)).catch(() => {});
