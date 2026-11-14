// 列印: the print window (printers, pages, paper, scaling, duplex, colour, what is printed) with a preview of each side of
// paper; the main process's printer list and printing are replaced (global.__pdfePrinters / __pdfePrintHook): a print job
// is printed to PDF with the same page setup, so its pages and paper size can be checked.
import { launchPath, TMP } from './_env.mjs';
import { PDFDocument, PDFName, PDFString, degrees } from 'pdf-lib';
import fs from 'fs';
import path from 'path';

let failed = 0;
const check = (name, ok, detail = '') => { console.log(`${ok ? '✔' : '✘'} ${name}${detail !== '' ? '  ' + (typeof detail === 'string' ? detail : JSON.stringify(detail)) : ''}`); if (!ok) { failed++; process.exitCode = 1; } };

// five pages, each one colour (red, green, blue, yellow, magenta); page 5 is an upright page turned by /Rotate 90 (so it
// lies), with a black square in the corner that then shows at the top left. Page 2 holds two black squares:
// one that may be printed (F 4) and one that may not (F 0); page 3 holds one on a hidden layer
const COLORS = [[1, 0, 0], [0, .6, 0], [0, 0, 1], [1, .85, 0], [.85, 0, .85]];
const doc = await PDFDocument.create(), ctx = doc.context, N = n => PDFName.of(n);
COLORS.forEach((c, k) => {
  const p = doc.addPage([595, 842]);
  p.node.set(N('Contents'), ctx.register(ctx.stream(`${c.join(' ')} rg 0 0 595 842 re f\n${k === 4 ? '0 0 0 rg 0 0 100 100 re f\n' : ''}`)));
  if (k === 4) p.setRotation(degrees(90));
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
const pr10 = t => Ev(t => { const r = window.__pdfapp.parseRange(t, 10); return r ? [...r] : null; }, t);
check('(final review) ranges with spaces round the dash; 8-, -3, 1、3; a dash alone is wrong',
  JSON.stringify(await pr10('1 - 3')) === '[0,1,2]' && JSON.stringify(await pr10('5 -7')) === '[4,5,6]' && JSON.stringify(await pr10('8 -')) === '[7,8,9]' && JSON.stringify(await pr10('- 3')) === '[0,1,2]' && JSON.stringify(await pr10('1、3')) === '[0,2]' && (await pr10('-')) === null && (await pr10(' - ')) === null,
  {a:await pr10('1 - 3'), b:await pr10('5 -7'), c:await pr10('-')});
check('the shared range reader takes full-width digits and commas; a reversed range; letters are wrong',
  JSON.stringify(await Ev(() => [...window.__pdfapp.parseRange('２－３，５', 5)])) === '[1,2,4]' && JSON.stringify(await Ev(() => [...window.__pdfapp.parseRange('5-3', 5)])) === '[2,3,4]' && (await Ev(() => window.__pdfapp.parseRange('a', 5))) === null);
await set('range', 'custom'); await set('custom', '2-3');
const s23 = await pst();
await set('custom', '9');
const bad = await Ev(() => ({err:(document.querySelector('#prDlg .pr-err') || {}).textContent || '', go:document.querySelector('#prGo').disabled}));
check('自訂「2-3」: 2 sides; 「9」 (past the end): a red message (v1.0.49: 「頁碼要在 1～N 之間」) and 〔列印〕 off', s23.sides === 2 && /頁碼要在 1～\d+ 之間/.test(bad.err) && bad.go, {s23, bad});
await set('range', 'all'); await set('subset', 'odd');
const sOdd = await pst();
await set('subset', 'all'); await set('reverse', true);
const sRev = await pst(), pxRev = await prevAt(.5, .5);
check('只印奇數頁: 3 sides; 反向列印: the last page first (page 5, magenta)', sOdd.sides === 3 && sRev.sides === 5 && near(pxRev, RGB[4]), {sOdd:sOdd.sides, pxRev});
check('page 5 (landscape) on upright paper: turned a quarter, the paper stays upright', sRev.paper.w < sRev.paper.h && sRev.items[0].rot % 180 === 90, sRev);
const rc1 = await prevAt(50 / 842, 50 / 595), rc2 = await prevAt(1 - 50 / 842, 1 - 50 / 595);
check('(final review) a page turned by /Rotate: its top-left corner (black) where it belongs, the far corner magenta', near(rc1, [0, 0, 0]) && near(rc2, RGB[4]), {rc1, rc2});
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
await set('layout', 'nup'); await set('printer', '');
const keep = await val('layout');
await set('printer', 'OfficeMFP');
check('(final review) a printer never used keeps what is on screen; one used before brings back its own settings', keep === 'nup' && (await val('layout')) === 'normal' && (await val('duplex')) === 'longEdge', {keep, back:[await val('layout'), await val('duplex')]});
await set('printer', 'OfficeMFP'); await set('quality', '300');
const n0 = (await printed()).length;
await Ev(() => { document.querySelector('#prGo').click(); document.querySelector('#prCancel').click(); }); await win.waitForTimeout(3000);
check('〔取消〕 while the job is being prepared: nothing printed, nothing left behind, the window still open', (await printed()).length === n0 && (await Ev(() => document.querySelector('#printRoot').children.length)) === 0 && (await pst()).open);
await send('#prSys');
const sys = (await printed()).at(-1);
check('〔印表機內容…〕: the same job through the system print window', (await printed()).length === n0 + 1 && sys.opts.silent === false && sys.opts.deviceName === 'OfficeMFP', sys && sys.opts);

// ---- part 2: several pages on a side (多頁合一) ----------------------------------------------------------------------
await open();
await set('layout', 'nup'); await set('nup', '4'); await set('order', 'h');
s = await pst();
const quad = async () => ({tl:await prevAt(.27, .27, 99), tr:await prevAt(.73, .27, 99), bl:await prevAt(.27, .73, 99), br:await prevAt(.73, .73, 99)});
let qq = await quad();
check('多頁合一 4: 2 sides; red and green on top, blue and yellow below', s.sides === 2 && s.paper.w < s.paper.h && near(qq.tl, RGB[0]) && near(qq.tr, RGB[1]) && near(qq.bl, RGB[2]) && near(qq.br, RGB[3]), {sides:s.sides, qq});
await set('order', 'hr'); qq = await quad();
check('橫向（右到左）: red top right, green top left', near(qq.tr, RGB[0]) && near(qq.tl, RGB[1]), qq);
await set('order', 'v'); qq = await quad();
check('直向（上到下，左起）: red top left, green under it', near(qq.tl, RGB[0]) && near(qq.bl, RGB[1]), qq);
await set('order', 'h'); await set('nup', '2');
s = await pst();
const two = {l:await prevAt(.27, .5, 99), r:await prevAt(.73, .5, 99)};
check('2 a side, 方向 自動: the paper lies, red left, green right; 3 sides', s.paper.w > s.paper.h && s.sides === 3 && near(two.l, RGB[0]) && near(two.r, RGB[1]), {paper:s.paper, sides:s.sides, two});
await set('borders', true);
const edge = await Ev(() => { const s = window.__pdfapp.printState(), c = document.querySelector('#prPrev canvas'), r = c.width / s.paper.w, it = s.items[0], g = c.getContext('2d');
  const y = Math.round((it.y + it.h / 2) * r), x = Math.round(it.x * r);
  return [-1, 0, 1].map(d => [...g.getImageData(x + d, y, 1, 1).data].slice(0, 3)).sort((a, b) => a[0] + a[1] + a[2] - b[0] - b[1] - b[2])[0]; });
check('頁面框線: a dark line round each page', edge.every(v => v < 90), edge);
await set('borders', false); await set('layout', 'normal');
await close();

// ---- part 3: booklets (手冊) -------------------------------------------------------------------------------------------
await open();
await set('layout', 'booklet'); await set('bind', 'left'); await set('bsides', 'both');
s = await pst();
const halves = async () => ({l:await prevAt(.27, .5, 99), r:await prevAt(.73, .5, 99)});
const WHITE = [255, 255, 255];
const b1 = await halves();
check('手冊, 5 pages: made 8, 4 sides on 2 sheets, both sides (short edge); side 1: blank left (page 8), red right (page 1)',
  s.sides === 4 && s.sheets === 2 && s.duplex === 'shortEdge' && s.paper.w > s.paper.h && near(b1.l, WHITE, 8) && near(b1.r, RGB[0]), {s, b1});
check('the 雙面 list shows what a booklet does (雙面（短邊翻頁）), greyed out', (await val('duplex')) === 'shortEdge' && await Ev(() => document.querySelector('#prDlg [data-p="duplex"]').disabled), await val('duplex'));
await Ev(() => document.querySelector('#prFwd').click()); await win.waitForTimeout(800);
const b2 = await halves();
check('side 2 (its back): green left (page 2), blank right (page 7)', near(b2.l, RGB[1]) && near(b2.r, WHITE, 8), b2);
await Ev(() => document.querySelector('#prBack').click()); await win.waitForTimeout(300);
await set('bind', 'right');
const b3 = await halves();
check('右翻: side 1 red left, blank right', near(b3.l, RGB[0]) && near(b3.r, WHITE, 8), b3);
await set('bind', 'left'); await set('bsides', 'front');
const sf = await pst();
await set('bsides', 'back');
const sb = await pst();
check('只印正面 / 只印背面: 2 sides each, printed on one side', sf.sides === 2 && sb.sides === 2 && sf.duplex === 'simplex' && sb.duplex === 'simplex', {sf:[sf.sides, sf.duplex], sb:[sb.sides, sb.duplex]});
await set('bsides', 'both');
await send('#prGo');
const bj = (await printed()).at(-1);
let bp = null;
if (bj && bj.pdf) { const d = await PDFDocument.load(Buffer.from(bj.pdf, 'base64')); bp = d.getPages().map(p => p.getSize()).map(z => [Math.round(z.width), Math.round(z.height)]); }
check('printed: both sides flipping on the short edge, lying paper; 4 pages of 842×595', !!bj && bj.opts.duplexMode === 'shortEdge' && bj.opts.landscape === true && !!bp && bp.length === 4 && bp.every(([w, h]) => Math.abs(w - 842) <= 1 && Math.abs(h - 595) <= 1), {opts:bj && bj.opts, bp});

// ---- part 4: posters (海報) --------------------------------------------------------------------------------------------
await open();
await set('range', 'custom'); await set('custom', '1'); await set('layout', 'poster'); await set('orient', 'auto');
await set('ppct', '200'); await set('overlap', '0'); await set('margin', '0');
s = await pst();
check('海報 200%, no margin, no overlap: 4 sides (2×2) on upright A4, red all over', s.sides === 4 && s.paper.w < s.paper.h && near(await prevAt(.5, .5, 99), RGB[0]) && near(await prevAt(.05, .05, 99), RGB[0]), s);
await set('margin', '5'); await set('overlap', '10');
s = await pst();
const plan = await Ev(() => window.__pdfapp.printPlanNow());
const [t0, t1] = plan.sides.map(x => x.items[0]), OV = 10 * 72 / 25.4;
const seamA = t0.clip.x + t0.clip.w - t0.x, seamB = t1.clip.x + OV - t1.x;
check('5 mm margins and 10 mm overlap: upright needs 3×3, lying 2×4, so the paper lies; 8 sides', s.sides === 8 && s.paper.w > s.paper.h, {sides:s.sides, paper:s.paper});
check('the next tile starts 10 mm before this one ends (the same part of the page on both)', Math.abs(seamA - seamB) < .01 && t1.clip.w === t0.clip.w, {seamA, seamB});
check('a label for each tile: 第 1 頁 · 第 1 列第 1 欄（共 4 列 2 欄）', plan.sides[0].label === '第 1 頁 · 第 1 列第 1 欄（共 4 列 2 欄）', plan.sides[0].label);
const mark = await Ev(() => { const s = window.__pdfapp.printState(), c = document.querySelector('#prPrev canvas'), r = c.width / s.paper.w, it = s.items[0], g = c.getContext('2d');
  const x = Math.round((it.clip.x - 2.5 * 72 / 25.4) * r), y = Math.round(it.clip.y * r);
  return [-1, 0, 1].map(d => [...g.getImageData(x, y + d, 1, 1).data].slice(0, 3)).sort((a, b) => a[0] + a[1] + a[2] - b[0] - b[1] - b[2])[0]; });
check('裁切記號: a dark mark in the margin at each corner of the printed part', mark.every(v => v < 130), mark);
await set('ppct', '100'); await set('margin', '0');
check('100%: one side', (await pst()).sides === 1);
await close();

// ---- part 5 (final review): a printer that fails, no printers, a very large job ------------------------------------------
await app.evaluate(() => { global.__pdfePrintSave = global.__pdfePrintHook; global.__pdfePrintHook = (wc, opts, cb) => cb(false, 'paper jam'); });
await open();
await set('layout', 'normal'); await set('range', 'custom'); await set('custom', '1');
await win.click('#prGo'); await win.waitForTimeout(4000);
const failMsg = await Ev(() => [...document.querySelectorAll('.toast')].map(t => t.textContent).join('|'));
check('a printer that fails: 「列印失敗：…」, the window stays open, nothing left in the print view', failMsg.includes('列印失敗：paper jam') && (await pst()).open && (await Ev(() => document.querySelector('#printRoot').children.length)) === 0, failMsg);
await close();
await app.evaluate(() => { global.__pdfePrintHook = global.__pdfePrintSave; global.__pdfePrintersSave = global.__pdfePrinters; global.__pdfePrinters = async () => []; });
await open();
const none = await Ev(() => ({note:(document.querySelector('#prDlg .pr-warn') || {}).textContent || '', go:document.querySelector('#prGo').disabled, sys:document.querySelector('#prSys').disabled}));
await close();
await app.evaluate(() => { global.__pdfePrinters = async () => { throw new Error('spooler down'); }; });
await open();
const thrown = await Ev(() => ({note:(document.querySelector('#prDlg .pr-warn') || {}).textContent || '', go:document.querySelector('#prGo').disabled}));
await close();
check('no printers (or the list cannot be read): a note, 〔列印〕 off, 〔印表機內容…〕 still there', none.note.includes('找不到印表機') && none.go && !none.sys && thrown.note.includes('找不到印表機') && thrown.go, {none, thrown});
await app.evaluate(() => { global.__pdfePrinters = global.__pdfePrintersSave; });
await open();
await set('range', 'custom'); await set('custom', '1'); await set('layout', 'poster'); await set('ppct', '1000'); await set('margin', '5'); await set('overlap', '10'); await set('duplex', 'simplex');
const big = await pst(), n1 = (await printed()).length;
await win.click('#prGo'); await win.waitForTimeout(800);
const ask = await Ev(() => ({go:document.querySelector('#prGo').textContent, sum:document.querySelector('#prSum').textContent, root:document.querySelector('#printRoot').children.length}));
check('more than 100 sheets: the first 〔列印〕 only asks again (「確定印 N 張」), nothing prepared', big.sheets > 100 && (await printed()).length === n1 && ask.go.includes(`確定印 ${big.sheets} 張`) && ask.root === 0, {sheets:big.sheets, ask});
await set('ppct', '999');
check('a change after that: the button is 〔列印〕 again', (await Ev(() => document.querySelector('#prGo').textContent)) === '列印');
await close();

// ---- part 6 (v1.0.49): page numbers, the number boxes, whole pixels, stored settings, two-sided labels, one window, a printer
// that never answers, a file opened meanwhile ----------------------------------------------------------------------------------
const nP = await Ev(() => window.__pdfapp.S.pages.length);
await open();
await set('range', 'custom');
const justCustom = (await pst()).error;
await set('custom', String(nP + 4));
const tooFar = (await pst()).error;
check('自訂 with nothing typed yet: no red line; a page past the last: 「頁碼要在 1～N 之間」', !justCustom && tooFar === `頁碼要在 1～${nP} 之間`, {justCustom, tooFar});
await set('range', 'all'); await set('layout', 'normal'); await set('scale', 'custom');
const commit = (k, v) => Ev(([k, v]) => { const el = document.querySelector(`#prDlg [data-p="${k}"]`); el.value = v; el.dispatchEvent(new Event('input', {bubbles:true})); el.dispatchEvent(new Event('change', {bubbles:true})); }, [k, v]);
await commit('pct', ''); await commit('copies', '5000'); await win.waitForTimeout(500);
const boxes6 = {pct:await val('pct'), copies:await val('copies'), st:await Ev(() => { const s = window.__pdfapp.printSt(); return {pct:s.pct, copies:s.copies}; })};
check('the number boxes: emptied → its usual value; 5000 copies → 999; the box shows what is used', boxes6.pct === '100' && boxes6.copies === '999' && boxes6.st.pct === 100 && +boxes6.st.copies === 999, boxes6);
await commit('copies', '1'); await set('scale', 'fit'); await set('margin', '5');
const frac = await Ev(async () => {
  const P = CanvasRenderingContext2D.prototype, orig = P.drawImage, seen = [];
  P.drawImage = function(img, x, y, ...rest){ if (!rest.length) seen.push([x, y]); return orig.call(this, img, x, y, ...rest); };
  try { await window.__pdfapp.printDraw(0); } finally { P.drawImage = orig; }
  return seen.filter(([x, y]) => x % 1 || y % 1);
});
check('a page placed on the paper is drawn at whole pixels (no resampling, sharp at 300 dpi)', frac.length === 0, frac);
await set('duplex', 'longEdge');
const lab6 = (await pst()).label;
await set('duplex', 'simplex');
check('two-sided printing (not only booklets): each side says 「第 K 張正面／背面」', /第 1 張正面/.test(lab6), lab6);
await close();
// stored settings out of range (a hand-edited settings file): brought back into range
await Ev(() => { const k = 'pdfeditor.print.v1'; let p = {}; try { p = JSON.parse(localStorage.getItem(k)) || {}; } catch (_) {}
  p.by = p.by || {}; const who = p.last || ''; p.by[who] = {...(p.by[who] || {}), quality:100000, pct:-5, ppct:99999, overlap:-3, margin:999, nup:7, duplex:'zzz', layout:'zzz'}; localStorage.setItem(k, JSON.stringify(p)); });
await open();
const stored = await Ev(() => window.__pdfapp.printSt());
await close();
check('stored print settings out of range (numbers, and choices the window does not offer): brought back to allowed values', [150, 300].includes(stored.quality) && stored.pct >= 1 && stored.ppct <= 1000 && stored.overlap >= 0 && [0, 5, 10].includes(stored.margin) && [2, 4, 6, 9, 16].includes(stored.nup) && stored.duplex === 'simplex' && stored.layout === 'normal',
  {quality:stored.quality, pct:stored.pct, ppct:stored.ppct, overlap:stored.overlap, margin:stored.margin, nup:stored.nup, duplex:stored.duplex, layout:stored.layout});
// Ctrl+P twice while the printers are being found: one window, with the busy sign meanwhile
await app.evaluate(() => { global.__savedPrinters = global.__pdfePrinters; global.__pdfePrinters = async () => { await new Promise(r => setTimeout(r, 1500)); return global.__savedPrinters(); }; });
await win.keyboard.press('Control+p'); await win.waitForTimeout(200);
const busyLoading = await Ev(() => document.querySelector('#busy').classList.contains('show'));
await win.keyboard.press('Control+p'); await win.waitForTimeout(3500);
if (await Ev(() => !!document.querySelector('#prCancel') && document.querySelector('#mask').classList.contains('show'))) { await win.click('#prCancel'); await win.waitForTimeout(800); }
const leftOver = await Ev(() => document.querySelector('#mask').classList.contains('show'));
if (leftOver) { await win.keyboard.press('Escape'); await win.waitForTimeout(600); }
await win.keyboard.press('Control+p'); await win.waitForTimeout(3500);
const againOpen = (await pst()).open;
await app.evaluate(() => { global.__pdfePrinters = global.__savedPrinters; });
if (againOpen) await close();
check('Ctrl+P twice while the printers are being found: one window (busy sign meanwhile); after closing it, Ctrl+P opens it again', busyLoading && !leftOver && againOpen, {busyLoading, leftOver, againOpen});
// a printer that never answers: 〔取消〕 (and Esc) stop the waiting
await app.evaluate(() => { global.__savedHook = global.__pdfePrintHook; global.__pdfePrintHook = () => {}; });
const waitSend = () => win.waitForFunction(() => /正在送到印表機/.test((document.querySelector('#prSum') || {}).textContent || ''), null, {timeout:30000}).catch(() => {});
const afterStop = () => Ev(() => ({open:window.__pdfapp.printState().open, sum:(document.querySelector('#prSum') || {}).textContent || '', go:(document.querySelector('#prGo') || {}).disabled}));
await open(); await win.click('#prGo'); await waitSend();
const seenToasts = () => Ev(() => (window.__seenToasts || []).slice());
await Ev(() => { window.__seenToasts = []; new MutationObserver(ms => ms.forEach(m => m.addedNodes.forEach(n => n.textContent && window.__seenToasts.push(n.textContent)))).observe(document.querySelector('#toasts'), {childList:true}); });
await win.click('#prCancel'); await win.waitForTimeout(1200);
const byBtn = await afterStop(), stopSaid = await seenToasts();
await win.click('#prGo'); await waitSend();
await win.keyboard.press('Escape'); await win.waitForTimeout(1200);
const byEsc = await afterStop();
await app.evaluate(() => { global.__pdfePrintHook = global.__savedHook; });
if (byEsc.open) await close();
check('a printer that never answers: 〔取消〕 and Esc stop waiting, the window can be used again, and it says the printer may still print', byBtn.open && !/正在送到/.test(byBtn.sum) && byBtn.go === false && byEsc.open && !/正在送到/.test(byEsc.sum) && stopSaid.some(t => /停止等待/.test(t)), {byBtn, byEsc, stopSaid});
// a PDF opened from Explorer while the print window is open: it opens when the window closes (the print keeps its document)
const od = await PDFDocument.create(); od.addPage([300, 300]); const OTHER = path.join(TMP, 'other while printing.pdf'); fs.writeFileSync(OTHER, await od.save());
await open();
const tabs0 = await Ev(() => document.querySelectorAll('.dtab').length);
await app.evaluate(({BrowserWindow}, p) => BrowserWindow.getAllWindows()[0].webContents.send('open-path', p), OTHER);
await win.waitForTimeout(2500);
const tabsDuring = await Ev(() => document.querySelectorAll('.dtab').length), stillOpen = (await pst()).open, waitSaid = await seenToasts();
await close(); await win.waitForTimeout(3000);
const tabsAfter = await Ev(() => document.querySelectorAll('.dtab').length);
check('a PDF opened from Explorer while the print window is open: opened after the window closes, and the person is told so', stillOpen && tabsDuring === tabs0 && tabsAfter === tabs0 + 1 && waitSaid.some(t => /列印視窗/.test(t) && /other while printing/.test(t)), {tabs0, tabsDuring, stillOpen, tabsAfter, waitSaid});
// (fix pass, last: the printer list never comes) the window opens anyway after a while, and the program stays usable
await app.evaluate(() => { global.__pdfePrinters = () => new Promise(() => {}); });
await win.keyboard.press('Control+p'); await win.waitForTimeout(11000);
const hung = await Ev(() => ({open:window.__pdfapp.printState().open, busy:document.querySelector('#busy').classList.contains('show'), note:(document.querySelector('#prDlg .pr-warn') || {}).textContent || ''}));
if (hung.open) await close();
check('the printer list never comes: after a while the window opens anyway (no printers, the system dialog offered), nothing left blocked', hung.open && !hung.busy && /找不到印表機|讀取印表機/.test(hung.note) && !(await Ev(() => document.querySelector('#busy').classList.contains('show'))), hung);

console.log(failed ? `\n${failed} check(s) failed` : '\nall checks passed');
await app.evaluate(({app}) => app.exit(0)).catch(() => {});
