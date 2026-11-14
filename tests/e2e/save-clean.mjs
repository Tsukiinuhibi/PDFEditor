// 另存時清掉用不到的資料: every save writes only what the document still uses (deleted notes, replaced or deleted
// pictures, leftovers already in the original file are gone); a digitally signed document is saved byte for byte.
import { launchPath, TMP } from './_env.mjs';
import { PDFDocument, PDFName, PDFString, PDFHexString, PDFDict, PDFArray, PDFRef } from 'pdf-lib';
import fs from 'fs';
import path from 'path';

let failed = 0;
const check = (name, ok, detail = '') => { console.log(`${ok ? '✔' : '✘'} ${name}${detail !== '' ? '  ' + (typeof detail === 'string' ? detail : JSON.stringify(detail)) : ''}`); if (!ok) { failed++; process.exitCode = 1; } };

// two pages, a bookmark, a form field, a layer, a sticky note with a marker, a picture, and an object nothing uses
const doc = await PDFDocument.create(), ctx = doc.context, N = n => PDFName.of(n);
const p1 = doc.addPage([595, 842]), p2 = doc.addPage([595, 842]);
const ocg = ctx.register(ctx.obj({Type:'OCG', Name:PDFString.of('Layer A')}));
doc.catalog.set(N('OCProperties'), ctx.obj({OCGs:[ocg], D:{Order:[ocg], ON:[ocg]}}));
p1.node.set(N('Resources'), ctx.obj({Properties:{L1:ocg}}));
p1.node.set(N('Contents'), ctx.register(ctx.flateStream('/OC /L1 BDC 0 0 1 rg 100 100 50 50 re f EMC\n')));
const outlines = ctx.nextRef(), item = ctx.register(ctx.obj({Title:PDFString.of('Chapter 1'), Parent:outlines, Dest:[p1.ref, 'Fit']}));
ctx.assign(outlines, ctx.obj({Type:'Outlines', First:item, Last:item, Count:1}));
doc.catalog.set(N('Outlines'), outlines);
doc.getForm().createTextField('name').addToPage(p2, {x:100, y:600, width:200, height:24});
const note = ctx.register(ctx.obj({Type:'Annot', Subtype:'Text', Rect:[100, 700, 124, 724], Contents:PDFString.of('SECRET-NOTE-123'), T:PDFString.of('someone'), F:4}));
p1.node.set(N('Annots'), ctx.obj([note]));
const px = Buffer.alloc(40 * 20 * 3, 120), img = ctx.register(ctx.flateStream(px, {Type:'XObject', Subtype:'Image', Width:40, Height:20, ColorSpace:'DeviceRGB', BitsPerComponent:8}));
let r2 = p2.node.Resources(); if (!r2) { r2 = ctx.obj({}); p2.node.set(N('Resources'), r2); } r2.set(N('XObject'), ctx.obj({ImA:img}));
const c2 = p2.node.get(N('Contents'));
p2.node.set(N('Contents'), ctx.obj([...(c2 ? (ctx.lookup(c2) instanceof PDFArray ? ctx.lookup(c2).asArray() : [c2]) : []), ctx.register(ctx.flateStream('q 200 0 0 100 100 300 cm /ImA Do Q\n'))]));
ctx.register(ctx.obj({Marker:PDFString.of('ORPHAN-MARK-456')}));   // nothing points to it
const PDF = path.join(TMP, 'clean.pdf'); fs.writeFileSync(PDF, await doc.save({useObjectStreams:false}));
check('(the test file really holds the leftover)', fs.readFileSync(PDF).includes('ORPHAN-MARK-456'));

const { app } = await launchPath(PDF);
const win = await app.firstWindow(); win.on('pageerror', e => console.log('PAGEERR', e.message)); win.on('console', m => { if (m.type() === 'error') console.log('C', m.text().slice(0, 300)); });
await win.waitForTimeout(3000);
await win.waitForFunction(() => !!(window.__pdfapp && window.__pdfapp.S.pages.length), null, {timeout:30000});
const Ev = win.evaluate.bind(win);
let n = 0;
await app.evaluate(({dialog}, TMP) => { let k = 0; dialog.showSaveDialog = async () => ({canceled:false, filePath:`${TMP}/out${++k}.pdf`}); dialog.showMessageBox = async () => ({response:0}); }, TMP);
const save = async () => { await win.keyboard.press('Control+s'); await win.waitForTimeout(3000); return fs.readFileSync(path.join(TMP, `out${++n}.pdf`)); };
// does any object of a saved file hold the text? (strings may sit inside compressed object streams, so the file is read)
const holds = async (bytes, text) => {
  const d = await PDFDocument.load(bytes, {updateMetadata:false}); let hit = false;
  const visit = (o, depth = 0) => {
    if (!o || hit || depth > 30) return;
    if (o instanceof PDFString || o instanceof PDFHexString) { if (o.decodeText().includes(text)) hit = true; return; }
    if (o instanceof PDFDict) o.values().forEach(v => visit(v, depth + 1));
    else if (o instanceof PDFArray) o.asArray().forEach(v => visit(v, depth + 1));
    else if (o.dict instanceof PDFDict) o.dict.values().forEach(v => visit(v, depth + 1));
  };
  d.context.enumerateIndirectObjects().forEach(([, o]) => visit(o));
  return hit;
};
const shape = async bytes => {
  const d = await PDFDocument.load(bytes, {updateMetadata:false}), cat = d.catalog;
  const ol = cat.lookupMaybe(N('Outlines'), PDFDict), af = cat.lookupMaybe(N('AcroForm'), PDFDict), oc = cat.lookupMaybe(N('OCProperties'), PDFDict);
  const annots = d.getPage(0).node.lookupMaybe(N('Annots'), PDFArray);
  const images = d.context.enumerateIndirectObjects().filter(([, o]) => o && o.dict && String(o.dict.get(N('Subtype'))) === '/Image').map(([, o]) => [o.dict.get(N('Width')).asNumber(), o.dict.get(N('Height')).asNumber()]);
  return {pages:d.getPageCount(), outline:!!(ol && ol.get(N('First'))), fields:af ? af.lookup(N('Fields'), PDFArray).size() : 0, layers:oc ? oc.lookup(N('OCGs'), PDFArray).size() : 0,
    notes:annots ? annots.asArray().filter(r => String(d.context.lookup(r).get(N('Subtype'))) === '/Text').length : 0, images};
};

// 1. saved without a change: complete, the leftover gone
const f1 = await save(), s1 = await shape(f1);
check('saved with no change: pages, bookmark, form field, layer, note and picture all there', s1.pages === 2 && s1.outline && s1.fields === 1 && s1.layers === 1 && s1.notes === 1 && s1.images.some(([w, h]) => w === 40 && h === 20), s1);
check('saved with no change: the leftover nothing used is gone; the note still holds its text', !(await holds(f1, 'ORPHAN-MARK-456')) && await holds(f1, 'SECRET-NOTE-123'));
// 2. the note deleted: its text is nowhere in the saved file
await Ev(() => window.__pdfapp.setTool('select')); await win.waitForTimeout(300);
await Ev(() => { const S = window.__pdfapp.S, vw = document.querySelector('#viewer'), r0 = S.els[0].getBoundingClientRect(), vr = vw.getBoundingClientRect(); vw.scrollTop += r0.top + 130 * S.scale - (vr.top + vr.height / 2); });
await win.waitForTimeout(400);
const xy = await Ev(() => { const S = window.__pdfapp.S, r = S.els[0].getBoundingClientRect(); return [r.left + 112 * S.scale, r.top + 130 * S.scale]; });
await win.mouse.click(...xy, {button:'right'}); await win.waitForTimeout(600);
const menu = await Ev(() => !!document.querySelector('#ctx [data-c="del"]') && document.querySelector('#ctx').style.display === 'block');
if (menu) { await win.click('#ctx [data-c="del"]'); await win.waitForTimeout(2000); }
const f2 = await save(), s2 = await shape(f2);
check('a deleted note: its text is nowhere in the saved file', menu && s2.notes === 0 && !(await holds(f2, 'SECRET-NOTE-123')), {menu, s2});
// 3. a picture deleted everywhere: its data is not in the saved file
await Ev(() => window.__pdfapp.setTool('extract')); await win.waitForTimeout(400);
await Ev(() => { const S = window.__pdfapp.S, vw = document.querySelector('#viewer'), r = S.els[1].getBoundingClientRect(), vr = vw.getBoundingClientRect(); vw.scrollTop += r.top + 492 * S.scale - (vr.top + vr.height / 2); });
await win.waitForTimeout(500);
const ixy = await Ev(() => { const S = window.__pdfapp.S, r = S.els[1].getBoundingClientRect(); return [r.left + 200 * S.scale, r.top + 492 * S.scale]; });
await win.mouse.click(...ixy); await win.waitForTimeout(600);
await win.click('.xbar [data-x="del"]'); await win.waitForTimeout(2500);
const f3 = await save(), s3 = await shape(f3);
check('a deleted picture: not in the saved file; the rest still there', !s3.images.some(([w, h]) => w === 40 && h === 20) && s3.pages === 2 && s3.outline && s3.fields === 1 && s3.layers === 1, s3);
// 4. a signed document: saved byte for byte
await Ev(() => { window.__pdfapp.S.signed = true; });
const want = Buffer.from(await Ev(() => { const b = window.__pdfapp.S.bytes; let s = ''; for (let k = 0; k < b.length; k += 0x8000) s += String.fromCharCode(...b.subarray(k, k + 0x8000)); return btoa(s); }), 'base64');
const f4 = await save();
check('a signed document: saved exactly as it is', Buffer.compare(f4, want) === 0, {got:f4.length, want:want.length});

// 5. (final review) files that must not be rewritten: encrypted, signed (not only in this session), partly unreadable
const prune = async bytes => Buffer.from(await Ev(async b64 => { const b = Uint8Array.from(atob(b64), c => c.charCodeAt(0)), out = await window.__pdfapp.pruneUnused(b);
  let s = ''; for (let k = 0; k < out.length; k += 0x8000) s += String.fromCharCode(...out.subarray(k, k + 0x8000)); return btoa(s); }, Buffer.from(bytes).toString('base64')), 'base64');
const withLeftover = async extra => { const d = await PDFDocument.create(); d.addPage([200, 200]); d.context.register(d.context.obj({Marker:PDFString.of('LEFTOVER')})); await extra(d); return Buffer.from(await d.save({useObjectStreams:false})); };
const enc = await withLeftover(async d => { d.context.trailerInfo.Encrypt = d.context.register(d.context.obj({Filter:'Standard', V:2, R:3, Length:128, P:-44, O:PDFHexString.of('00'.repeat(32)), U:PDFHexString.of('00'.repeat(32))})); });
check('an encrypted file: not rewritten when saved', Buffer.compare(await prune(enc), enc) === 0);
const signed = await withLeftover(async d => { const c = d.context, v = c.register(c.obj({Type:'Sig', Filter:'Adobe.PPKLite', SubFilter:'adbe.pkcs7.detached', ByteRange:[0, 10, 20, 10], Contents:PDFHexString.of('00')}));
  const f = c.register(c.obj({FT:'Sig', T:PDFString.of('Signature1'), V:v, Type:'Annot', Subtype:'Widget', Rect:[0, 0, 0, 0], P:d.getPage(0).ref})); d.catalog.set(N('AcroForm'), c.obj({Fields:[f], SigFlags:3})); });
check('a file signed elsewhere (a signature field with a value): not rewritten when saved', Buffer.compare(await prune(signed), signed) === 0);
let bad = await withLeftover(async d => { const c = d.context, keep = c.register(c.obj({Kept:PDFString.of('KEEPME')})); d.catalog.set(N('PDFE_Test'), c.register(c.obj({Marker:PDFString.of('XXXX'), Keep:keep}))); });
bad = Buffer.from(bad.toString('latin1').replace('(XXXX)', ')XXXX('), 'latin1');
check('a file with an object pdf-lib cannot read: not rewritten (what it points to would be lost)', Buffer.compare(await prune(bad), bad) === 0);

// v1.0.50: a trailer whose /ID is an object of its own: kept (the trailer would point to nothing)
const dId = await PDFDocument.create(); dId.addPage([200, 200]);
dId.context.trailerInfo.ID = dId.context.register(dId.context.obj([PDFHexString.of('0011223344556677'), PDFHexString.of('8899aabbccddeeff')]));
dId.context.register(dId.context.obj({Marker:PDFString.of('ORPHAN-ID-TEST')}));   // (something to drop, so the file is rewritten)
const withId = Buffer.from(await dId.save({useObjectStreams:false})), outId = await prune(withId);
const reId = await PDFDocument.load(outId, {updateMetadata:false}), idv = reId.context.trailerInfo.ID, idObj = idv instanceof PDFRef ? reId.context.lookup(idv) : idv;
check('a trailer /ID stored as an object of its own: still there after the clean-up', Buffer.compare(outId, withId) !== 0 && idv instanceof PDFRef && idObj instanceof PDFArray && idObj.size() === 2, {ref:String(idv), obj:String(idObj)});

console.log(failed ? `\n${failed} check(s) failed` : '\nall checks passed');
await app.evaluate(({app}) => app.exit(0)).catch(() => {});
