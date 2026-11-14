// pdfcrypt.js on its own (no window): files encrypted without an open password (a permissions password only, 「限制編輯」)
// come back decrypted with everything in them intact; a file that needs a password, a plain file and an unknown
// encryption say so. The test files are made by fixtures/encrypted/make.py (pikepdf / qpdf).
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const { decryptPdf } = require(path.join(ROOT, 'pdfcrypt.js'));
const loaded = Object.keys(require.cache).filter(f => f.startsWith(path.join(ROOT, 'node_modules') + path.sep)).map(f => path.relative(ROOT, f).split(path.sep).join('/'));
const { PDFDocument, PDFName, PDFDict, PDFArray, PDFRawStream, decodePDFRawStream } = require('pdf-lib');
const FIX = path.join(ROOT, 'tests', 'e2e', 'fixtures', 'encrypted');

let failed = 0;
const check = (name, ok, detail = '') => { console.log(`${ok ? '✔' : '✘'} ${name}${detail !== '' ? '  ' + (typeof detail === 'string' ? detail : JSON.stringify(detail)) : ''}`); if (!ok) { failed++; process.exitCode = 1; } };

// the installer leaves out parts of node_modules (package.json build.files): what pdfcrypt.js loads must be packed
{
  const files = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')).build.files;
  const re = g => new RegExp('^' + g.replace(/[.+^$()|[\]\\]/g, '\\$&').replace(/\{([^}]*)\}/g, (_, a) => '(' + a.split(',').join('|') + ')')
    .replace(/\*\*/g, '\u0000').replace(/\*/g, '[^/]*').replace(/\u0000/g, '.*') + '$');
  const left = files.filter(g => g.startsWith('!')).map(g => re(g.slice(1)));
  const out = loaded.filter(f => left.some(r => r.test(f)));
  check('pdfcrypt.js loads only files the installer packs', loaded.length > 0 && out.length === 0 && files.includes('pdfcrypt.js'), {left_out:out.slice(0, 3), listed:files.includes('pdfcrypt.js')});
}
const N = n => PDFName.of(n);
const text = s => new TextDecoder('latin1').decode(decodePDFRawStream(s).decode());

// what a decrypted copy of the test document holds
async function contents(bytes){
  const doc = await PDFDocument.load(bytes, {updateMetadata:false});   // (throws if it is still encrypted)
  const pages = doc.getPages(), out = {pages:pages.length, encryptKey:!!doc.context.trailerInfo.Encrypt, title:doc.getTitle()};
  out.text = pages.slice(0, 2).map(p => { const c = p.node.Contents(); return c instanceof PDFArray ? c.asArray().map(r => text(doc.context.lookup(r))).join('') : text(c); });
  const annots = pages[0].node.Annots() ? pages[0].node.Annots().asArray().map(r => doc.context.lookup(r, PDFDict)) : [];
  const note = annots.find(a => a.get(N('Subtype')) === N('Text')), field = annots.find(a => a.get(N('FT')) === N('Tx')), sig = annots.find(a => a.get(N('FT')) === N('Sig'));
  out.note = note && note.lookup(N('Contents')).decodeText();
  out.field = field && field.lookup(N('V')).decodeText();
  if (sig) out.sig = [...sig.lookup(N('V'), PDFDict).lookup(N('Contents')).asBytes()];
  const ef = doc.catalog.lookup(N('Names'), PDFDict).lookup(N('EmbeddedFiles'), PDFDict).lookup(N('Names'), PDFArray);
  const spec = doc.context.lookup(ef.get(1), PDFDict), file = spec.lookup(N('EF'), PDFDict).lookup(N('F'), PDFRawStream);
  out.attachment = [ef.lookup(0).decodeText(), text(file)];
  out.metadata = text(doc.catalog.lookup(N('Metadata'), PDFRawStream)).includes('XMP title');
  return out;
}
const same = (o, pages = 2) => o.pages === pages && !o.encryptKey && o.title === '測試文件' && o.text[0].includes('(Secret page 1)') && o.text[1].includes('(Secret page 2)')
  && o.note === '祕密便利貼 secret note' && o.field === '欄位內容' && o.attachment[0] === 'hello.txt' && o.attachment[1] === 'hello attached world' && o.metadata;
const read = f => new Uint8Array(fs.readFileSync(path.join(FIX, f)));

for (const f of ['r2-rc4-40', 'r3-rc4-128', 'r4-rc4-128', 'r4-aes128', 'r4-aes128-nometa', 'r6-aes256', 'lin-aes128', 'lin-aes256']) {
  const r = await decryptPdf(read(f + '.pdf'));
  let o = null, err = '';
  if (r.state === 'decrypted') try { o = await contents(r.bytes); } catch (e) { err = String(e.message || e); }
  check(`${f}: decrypted — no encryption left; the pages' text, the Chinese title, the note, the field's value, the attached file and the metadata as they were`,
    r.state === 'decrypted' && !!o && same(o) && !Buffer.from(r.bytes).includes('/Encrypt') && r.signed === false, o || err || r);
}

{
  const r = await decryptPdf(read('signed-aes128.pdf'));
  let o = null; if (r.state === 'decrypted') o = await contents(r.bytes);
  const want = [...Array(64).keys()].map(k => 48 + k);
  check('a signed file: decrypted, said to be signed; the signature\'s /Contents left as it was (it is never encrypted)',
    r.state === 'decrypted' && r.signed === true && !!o && same(o) && JSON.stringify(o.sig) === JSON.stringify(want), o ? {sig:o.sig && o.sig.slice(0, 8), signed:r.signed} : r);
}
{
  const r = await decryptPdf(read('signed-aes128-objstm.pdf'));
  check('a signed file whose signature field and signature sit in an object stream: still said to be signed', r.state === 'decrypted' && r.signed === true, {state:r.state, signed:r.signed});
}
{
  const r = await decryptPdf(read('ur3-aes128.pdf'));
  let ur = null;
  if (r.state === 'decrypted') { const d = await PDFDocument.load(r.bytes, {updateMetadata:false}); ur = [...d.catalog.lookup(N('Perms'), PDFDict).lookup(N('UR3'), PDFDict).lookup(N('Contents')).asBytes()]; }
  check('usage rights only (/Perms /UR3: a Reader-extended form, no signature field): not said to be signed; its /Contents left as it was',
    r.state === 'decrypted' && r.signed === false && JSON.stringify(ur) === JSON.stringify([...Array(64).keys()].map(k => 48 + k)), {state:r.state, signed:r.signed, ur:ur && ur.slice(0, 4)});
}
{
  const t0 = Date.now(), r = await decryptPdf(read('big-aes128.pdf')), ms = Date.now() - t0;
  let o = null; if (r.state === 'decrypted') o = await contents(r.bytes);
  check('100 pages (AES-128, object streams): decrypted in under 5 s', r.state === 'decrypted' && !!o && same(o, 100) && ms < 5000, {ms, pages:o && o.pages});
}
// stream lengths kept as separate objects ("/Length 10 0 R"), some encrypted data ending in a carriage return: every
// page's drawing comes back whole (taking the CR before "endstream" for a line end loses the last AES block / RC4 byte)
for (const f of ['len-aes128', 'len-rc4-128']) {
  const r = await decryptPdf(read(f + '.pdf'));
  let o = null, bad = [];
  if (r.state === 'decrypted') {
    o = await contents(r.bytes);
    const doc = await PDFDocument.load(r.bytes, {updateMetadata:false});
    doc.getPages().forEach((p, k) => { let t = ''; try { t = text(p.node.Contents()); } catch (e) { t = 'ERR ' + e.message; } if (t !== `BT /F1 36 Tf 72 700 Td (Secret page ${k + 1}) Tj ET`) bad.push([k + 1, t.slice(-30)]); });
  }
  check(`${f}: lengths as separate objects — all 300 pages' drawings exactly as they were, the rest of the document too`, r.state === 'decrypted' && !!o && same(o, 300) && bad.length === 0, {state:r.state, bad:bad.slice(0, 4)});
}
// about 18 000 objects: the reading gives way to other work now and then, so the program never stalls for long
{
  const b = read('many-aes128.pdf');
  let last = performance.now(), worst = 0;
  const iv = setInterval(() => { const t = performance.now(); worst = Math.max(worst, t - last); last = t; }, 5);
  const t0 = performance.now(), r = await decryptPdf(b), ms = Math.round(performance.now() - t0);
  await new Promise(res => setTimeout(res, 20)); clearInterval(iv); worst = Math.round(Math.max(worst, performance.now() - last));
  let pages = 0; if (r.state === 'decrypted') pages = (await PDFDocument.load(r.bytes, {updateMetadata:false})).getPageCount();
  check('3000 pages and 18 000 objects: decrypted; the longest stall of everything else is under 120 ms', r.state === 'decrypted' && pages === 3000 && worst < 120, {ms, worst, pages});
}
{
  const r = await decryptPdf(read('r6-userpw.pdf'));
  check('a file that needs a password to open: "password", nothing else', r.state === 'password' && !r.bytes, r);
}
{
  const r = await decryptPdf(new Uint8Array(fs.readFileSync(path.join(ROOT, 'tests', 'e2e', 'fixtures', 'sample.pdf'))));
  check('a file that is not encrypted: "plain"', r.state === 'plain' && !r.bytes, r);
}
{
  const b = Buffer.from(read('r4-aes128.pdf')), k = b.indexOf('/Standard');
  b.write('/Standarx', k, 'latin1');
  const r = await decryptPdf(new Uint8Array(b));
  check('another encryption handler (not /Standard): "unsupported", with a reason', r.state === 'unsupported' && typeof r.reason === 'string' && r.reason.length > 0, r);
}
{
  const r = await decryptPdf(new TextEncoder().encode('not a pdf at all /Encrypt 1 0 R'));
  check('bytes that are not a PDF: an answer, not a crash', ['unsupported', 'plain'].includes(r.state), r);
}
console.log(failed ? `${failed} check(s) failed` : 'all checks passed');
