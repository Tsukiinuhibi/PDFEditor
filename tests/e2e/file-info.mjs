// 檔案資訊 (開啟 ▾ → 檔案資訊): why a file is slow to open, without sending it anywhere — how long each step of opening
// took (reading, reading the PDF, the pages, the first page drawn), whether pages are drawn in the background, and every
// picture on the pages: its kind (JPEG, JPEG 2000, …), pixels, bytes and how long its page took to draw. 〔複製文字〕
// copies it all as text. A file whose first page took long says so once and points here.
import { launch, TMP } from './_env.mjs';
import { PDFDocument, PDFName } from 'pdf-lib';
import fs from 'fs';
import path from 'path';
import zlib from 'zlib';

let failed = 0;
const check = (name, ok, detail = '') => { console.log(`${ok ? '✔' : '✘'} ${name}${detail !== '' ? '  ' + (typeof detail === 'string' ? detail : JSON.stringify(detail)) : ''}`); if (!ok) { failed++; process.exitCode = 1; } };

const { app } = await launch('first.pdf');
const win = await app.firstWindow(); win.on('pageerror', e => console.log('PAGEERR', e.message)); win.on('console', m => { if (m.type() === 'error') console.log('C', m.text().slice(0, 300)); });
await win.waitForFunction(() => !!(window.__pdfapp && window.__pdfapp.S.pages.length), null, {timeout:30000});
await win.waitForTimeout(1200);
const Ev = win.evaluate.bind(win);

// a JPEG (made by the window's canvas) on page 1, a Flate picture inside a form on page 2, a page without pictures
const jpg = Buffer.from(await Ev(async () => { const c = document.createElement('canvas'); c.width = 1200; c.height = 800; const g = c.getContext('2d'); g.fillStyle = '#3a7'; g.fillRect(0, 0, 1200, 800);
  const b = await new Promise(r => c.toBlob(r, 'image/jpeg', .9)); return [...new Uint8Array(await b.arrayBuffer())]; }));
const doc = await PDFDocument.create(), ctx = doc.context, N = n => PDFName.of(n);
const content = s => ctx.register(ctx.flateStream(Buffer.from(s)));
{ const im = ctx.register(ctx.stream(jpg, {Type:'XObject', Subtype:'Image', Width:1200, Height:800, ColorSpace:'DeviceRGB', BitsPerComponent:8, Filter:'DCTDecode'}));
  const p = doc.addPage([600, 400]); p.node.set(N('Resources'), ctx.obj({XObject:{Im0:im}})); p.node.set(N('Contents'), content('q 600 0 0 400 0 0 cm /Im0 Do Q\n')); }
{ const raw = Buffer.alloc(300 * 200 * 3, 0x80), im = ctx.register(ctx.stream(zlib.deflateSync(raw), {Type:'XObject', Subtype:'Image', Width:300, Height:200, ColorSpace:'DeviceRGB', BitsPerComponent:8, Filter:'FlateDecode'}));
  const fm = ctx.register(ctx.flateStream(Buffer.from('q 300 0 0 200 0 0 cm /Im1 Do Q\n'), {Type:'XObject', Subtype:'Form', BBox:[0, 0, 600, 400], Resources:{XObject:{Im1:im}}}));
  const p = doc.addPage([600, 400]); p.node.set(N('Resources'), ctx.obj({XObject:{Fm0:fm}})); p.node.set(N('Contents'), content('q /Fm0 Do Q\n')); }
doc.addPage([600, 400]);
const file = path.join(TMP, '資訊測試.pdf'); fs.writeFileSync(file, await doc.save());

await app.evaluate(({BrowserWindow}, p) => BrowserWindow.getAllWindows()[0].webContents.send('open-path', p), file);
await win.waitForFunction(() => window.__pdfapp.S.name === '資訊測試.pdf' && !!document.querySelector('.page[data-i="0"] canvas.pc'), null, {timeout:30000});
await win.waitForTimeout(2000);

// (v4.14.1) a file from the disk is read straight into the window (a stream), not copied through the main process's
// messages (600 MB took 10 s that way); a file that is not there says so
check('(v4.14.1) the file was read as a stream', await Ev(() => window.__pdfapp.readWay()) === 'stream', await Ev(() => window.__pdfapp.readWay()));
await app.evaluate(({BrowserWindow}, p) => BrowserWindow.getAllWindows()[0].webContents.send('open-path', p), path.join(TMP, '沒有這個檔案.pdf'));
await win.waitForTimeout(2000);
{ const toasts = await Ev(() => [...document.querySelectorAll('.toast')].map(x => x.textContent)), tabs = await Ev(() => document.querySelectorAll('.dtab').length);
  check('(v4.14.1) a file that is not there: said so, nothing opened', toasts.some(x => /無法開啟/.test(x)) && tabs === 2, {toasts, tabs}); }

// 開啟 ▾ lists 檔案資訊
await Ev(() => document.querySelector('[data-amenu="openm"] .sp-arr').click()); await win.waitForTimeout(300);
const item = await Ev(() => { const b = [...document.querySelectorAll('#toolMenu *')].find(x => /檔案資訊/.test(x.textContent) && x.children.length <= 3 && x.closest('[data-a],[data-act],[data-i],button,div')); return b ? b.textContent.trim() : null; });
check('開啟 ▾ has 檔案資訊', !!item, item);
await Ev(() => { const m = document.querySelector('#toolMenu'); if (m) m.style.display = 'none'; });
await Ev(() => { window.__pdfapp.actions.fileInfo(); }); await win.waitForTimeout(2500);
const body = await Ev(() => document.querySelector('#mask').classList.contains('show') ? {title:document.querySelector('#modal .mh').textContent, text:document.querySelector('#modal .mb').innerText} : null);
check('the window 檔案資訊 opens', !!body && body.title === '檔案資訊', body && body.title);
const t = body ? body.text : '';
check('it names the file, its size and its pages', /資訊測試\.pdf/.test(t) && /3 頁/.test(t) && /MB|KB/.test(t), t.slice(0, 300));
check('how long opening took, step by step (reading the file, the PDF\'s structure, the first page shown), in seconds', /從磁碟讀取檔案/.test(t) && /解析 PDF 結構/.test(t) && /顯示出第一個頁面/.test(t) && /\d+(\.\d+)? 秒/.test(t), t.slice(0, 500));
check('where pages are drawn (in the background)', /背景/.test(t), t);
check('(review) the first page: its own drawing time and the background\'s reading of the PDF, apart', /第 1 頁本身畫了 \d/.test(t) && /背景讀取 PDF \d/.test(t), t);
check('page 1\'s picture: JPEG, 1200 × 800', /第 1 頁[\s\S]{0,40}JPEG[\s\S]{0,60}1200 × 800/.test(t), t);
check('page 2\'s picture inside a form: Flate (無失真壓縮), 300 × 200', /第 2 頁[\s\S]{0,40}無失真壓縮[\s\S]{0,60}300 × 200/.test(t), t);
check('a JPEG 2000 explanation only when there is one (none here)', !/JPEG 2000/.test(t), t);
await Ev(() => [...document.querySelectorAll('#modal .mf button')].find(b => /複製/.test(b.textContent)).click()); await win.waitForTimeout(500);
const clip = await app.evaluate(({clipboard}) => clipboard.readText());
check('〔複製文字〕: the report as text in the clipboard', /檔案資訊/.test(clip) && /資訊測試\.pdf/.test(clip) && /1200 × 800/.test(clip), clip.slice(0, 200));
await win.keyboard.press('Escape'); await win.waitForTimeout(300);

// a first page that took long: said once, pointing here (the limit lowered for the test)
await Ev(() => window.__pdfapp.slowOpenAfter(0));
fs.copyFileSync(file, file.replace('資訊測試', '資訊測試2'));
await app.evaluate(({BrowserWindow}, p) => BrowserWindow.getAllWindows()[0].webContents.send('open-path', p), file.replace('資訊測試', '資訊測試2'));
await win.waitForTimeout(3500);
{ const toasts = await Ev(() => [...document.querySelectorAll('.toast')].map(x => x.textContent));
  check('a first page that took long: a note says so and points to 開啟 ▾ → 檔案資訊', toasts.some(x => /檔案資訊/.test(x) && /秒/.test(x)), toasts); }

// (review) a file already open, opened again (only its tab shown), then another file a while later: its times are its own
await Ev(() => window.__pdfapp.slowOpenAfter(4000));
await app.evaluate(({BrowserWindow}, p) => BrowserWindow.getAllWindows()[0].webContents.send('open-path', p), file);
await win.waitForTimeout(5000);
await Ev(() => { window.__pdfapp.actions.sample(); }); await win.waitForTimeout(3500);
{ const toasts = await Ev(() => [...document.querySelectorAll('.toast')].map(x => x.textContent));
  await Ev(() => { window.__pdfapp.actions.fileInfo(); }); await win.waitForTimeout(2000);
  const tx = await Ev(() => document.querySelector('#modal .mb').innerText), m = /從磁碟讀取檔案\s*([\d.]+) 秒/.exec(tx);
  check('(review) a file already open opened again, then another file 5 s later: no 「slow」 note, its reading time its own (< 2 s)', !toasts.some(x => /檔案資訊/.test(x)) && !!m && +m[1] < 2, {toasts, read:m && m[1]});
  await win.keyboard.press('Escape'); await win.waitForTimeout(300); }
// (review) the pictures cannot be read (a file pdf-lib cannot parse): the window still shows the times
await Ev(() => window.__pdfapp.breakGeo());
await Ev(() => { window.__pdfapp.actions.fileInfo(); }); await win.waitForTimeout(2000);
{ const tx = await Ev(() => document.querySelector('#mask').classList.contains('show') ? document.querySelector('#modal .mb').innerText : null);
  check('(review) pictures that cannot be read: the window still opens, with the times and a line saying so', !!tx && /顯示出第一個頁面/.test(tx) && /無法讀取/.test(tx), tx); }

console.log(failed ? `\n${failed} check(s) failed` : '\nall checks passed');
await app.evaluate(({app}) => app.exit(0)).catch(() => {});
