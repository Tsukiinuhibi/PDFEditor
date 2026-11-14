'use strict';
/*
 * PDFs encrypted without an open password (only a permissions password: 「限制編輯」, no printing, …). pdf.js shows them,
 * but pdf-lib cannot read their encrypted strings and streams: pages copied from them came out blank, and every change
 * failed (pdf-lib's re-save no longer matched the encryption, so pdf.js would not open the result). decryptPdf() gives
 * back the same document without the encryption, read with the empty open password exactly as pdf.js reads it
 * (pdf.js 4.10 CipherTransformFactory): the Standard security handler, V1/V2/V4/V5, R2–R6 (RC4 40–128 bit, AES-128,
 * AES-256), crypt filters (StmF/StrF/EFF, Identity), EncryptMetadata false and object streams. A signature's /Contents
 * is never encrypted, so it is left as it is.
 *   decryptPdf(bytes) → {state:'plain'} | {state:'decrypted', bytes, signed} | {state:'password'} | {state:'unsupported', reason}
 * Runs in the main process (Node's crypto); the window asks for it through IPC 'pdf:decrypt'.
 */
const crypto = require('crypto');
const PDFLib = require('pdf-lib/dist/pdf-lib.min.js');   // the build the window uses too: the installer leaves pdf-lib/cjs out
const kw = t => [...t].map(c => c.charCodeAt(0));
const ENDOBJ = kw('endobj'), STREAM = kw('stream'), ENDSTREAM = kw('endstream');
const STREAM_EOL = [kw('stream \r\n'), kw('stream\r\n'), kw('stream\r'), kw('stream\n')];
const isSpace = b => b === 0x20 || b === 0x0A || b === 0x0D || b === 0x09 || b === 0x0C || b === 0x00;
const tick = () => new Promise(res => setImmediate(res));   // let the rest of the program run (a big file takes a while)
const { PDFParser, PDFObjectStreamParser, PDFXRefStreamParser, PDFDocument, PDFRawStream, PDFDict, PDFArray, PDFName, PDFRef,
  PDFString, PDFHexString, PDFNumber, PDFBool } = PDFLib;

const N = n => PDFName.of(n);
const PAD = Buffer.from('28BF4E5E4E758A4164004E56FFFA01082E2E00B6D0683E802F0CA9FE6453697A', 'hex');
const ZERO16 = Buffer.alloc(16);

const md5 = (...parts) => { const h = crypto.createHash('md5'); parts.forEach(p => h.update(p)); return h.digest(); };
const sha = (bits, data) => crypto.createHash('sha' + bits).update(data).digest();
function rc4(key, data){
  const s = new Uint8Array(256);
  for (let i = 0; i < 256; i++) s[i] = i;
  for (let i = 0, j = 0; i < 256; i++) { j = (j + s[i] + key[i % key.length]) & 255; const t = s[i]; s[i] = s[j]; s[j] = t; }
  const out = Buffer.alloc(data.length);
  for (let k = 0, i = 0, j = 0; k < data.length; k++) {
    i = (i + 1) & 255; j = (j + s[i]) & 255; const t = s[i]; s[i] = s[j]; s[j] = t;
    out[k] = data[k] ^ s[(s[i] + s[j]) & 255];
  }
  return out;
}
const aesName = key => key.length === 32 ? 'aes-256-cbc' : 'aes-128-cbc';
// data = 16-byte IV + whole blocks; padding is taken off only when it is valid (as pdf.js does), a broken tail is dropped
function aesDecrypt(key, data){
  if (data.length < 32) return Buffer.alloc(0);
  const body = data.subarray(16, 16 + Math.floor((data.length - 16) / 16) * 16);
  const d = crypto.createDecipheriv(aesName(key), key, data.subarray(0, 16)); d.setAutoPadding(false);
  const out = Buffer.concat([d.update(body), d.final()]);
  let ps = out[out.length - 1];
  if (ps > 16) return out;
  for (let i = out.length - 1; i >= out.length - ps; i--) if (out[i] !== ps) { ps = 0; break; }
  return out.subarray(0, out.length - ps);
}
const aesRaw = (key, iv, data, encrypt) => { const c = (encrypt ? crypto.createCipheriv : crypto.createDecipheriv)(aesName(key), key, iv); c.setAutoPadding(false); return Buffer.concat([c.update(data), c.final()]); };
const bytesOf = o => (o instanceof PDFString || o instanceof PDFHexString) ? Buffer.from(o.asBytes()) : Buffer.alloc(0);

// R6 (PDF 2.0, Algorithm 2.B) and R5 (Adobe's extension level 3) password hashes
function hash20(rev, password, input, udata){
  if (rev === 5) return sha(256, input);
  let k = sha(256, input), e = Buffer.alloc(0);
  for (let i = 0; i < 64 || e[e.length - 1] > i - 32; i++) {
    const one = Buffer.concat([password, k, udata]), k1 = Buffer.alloc(one.length * 64);
    for (let j = 0; j < 64; j++) one.copy(k1, j * one.length);
    e = aesRaw(k.subarray(0, 16), k.subarray(16, 32), k1, true);
    let sum = 0; for (let j = 0; j < 16; j++) sum += e[j];
    k = sha([256, 384, 512][sum % 3], e);
  }
  return k.subarray(0, 32);
}

// the file key for the empty open password, or null when that is not the password
function fileKey(enc, id0){
  const V = enc.lookup(N('V')), R = enc.lookup(N('R')), num = o => o instanceof PDFNumber ? o.asNumber() : undefined;
  const v = num(V), r = num(R);
  const O = bytesOf(enc.lookup(N('O'))), U = bytesOf(enc.lookup(N('U'))), pw = Buffer.alloc(0);
  if (v === 5) {
    if (r !== 5 && r !== 6) throw new Error('unsupported revision ' + r);
    if (!hash20(r, pw, Buffer.concat([pw, U.subarray(32, 40)]), Buffer.alloc(0)).equals(U.subarray(0, 32))) return null;
    const ik = hash20(r, pw, Buffer.concat([pw, U.subarray(40, 48)]), Buffer.alloc(0));
    return aesRaw(ik, ZERO16, bytesOf(enc.lookup(N('UE'))).subarray(0, 32), false);
  }
  let bits = num(enc.lookup(N('Length')));
  if (!bits) {
    if (v <= 3) bits = 40;
    else {
      const cf = enc.lookup(N('CF')), stmf = enc.lookup(N('StmF')), h = cf instanceof PDFDict && stmf instanceof PDFName ? cf.lookup(stmf) : null;
      bits = (h instanceof PDFDict && num(h.lookup(N('Length')))) || 128;
      if (bits < 40) bits <<= 3;
    }
  }
  if (!(bits >= 40 && bits % 8 === 0)) throw new Error('invalid key length');
  const n = bits >> 3, P = num(enc.lookup(N('P'))) | 0;
  const meta = enc.lookup(N('EncryptMetadata'));
  const parts = [PAD, O.subarray(0, 32), Buffer.from([P & 255, (P >> 8) & 255, (P >> 16) & 255, (P >>> 24) & 255]), id0];
  if (r >= 4 && v >= 4 && meta instanceof PDFBool && meta.asBoolean() === false) parts.push(Buffer.from([255, 255, 255, 255]));
  let key = md5(...parts);
  if (r >= 3) for (let j = 0; j < 50; j++) key = md5(key.subarray(0, n));
  key = key.subarray(0, n);
  if (r >= 3) {
    let x = rc4(key, md5(PAD, id0));
    for (let j = 1; j <= 19; j++) x = rc4(Buffer.from(key.map(b => b ^ j)), x);
    return x.equals(U.subarray(0, 16)) ? key : null;
  }
  return rc4(key, PAD).equals(U.subarray(0, 32)) ? key : null;
}

// signed: some signature field has a value (a signature). Usage rights (/Perms /UR3, Reader extensions) are not a
// signature of the document's content and do not count; every object is looked at, those in object streams too
function hasSignedField(ctx){
  for (const [, o] of ctx.enumerateIndirectObjects()) if (o instanceof PDFDict && o.get(N('FT')) === N('Sig') && o.get(N('V'))) return true;
  return false;
}

async function decryptPdf(input){
  // (views on the bytes that came in, not copies: a big file is held only once)
  const u8 = input instanceof Uint8Array ? input : new Uint8Array(input), bytes = Buffer.from(u8.buffer, u8.byteOffset, u8.byteLength);
  if (bytes.indexOf('/Encrypt') < 0) return {state:'plain'};
  try {
    // read every object as it is in the file, in file order; object streams are kept for later (they are encrypted
    // as a whole, so their objects can only be read once the stream is decrypted). Every 1000 objects the reading
    // gives way to the rest of the program (this runs in the main process).
    const parser = PDFParser.forBytesWithOptions(u8, 1000, false, false), events = [], loose = [];
    parser.maybeRecoverRoot = () => {};
    // a stream whose /Length is not a number in its dictionary (e.g. "/Length 12 0 R"): pdf-lib finds the end by looking
    // for "endstream" and takes a CR or CR LF before it for the line end, which may be the last byte of the encrypted
    // data. As pdf.js does, everything up to "endstream" is kept; the real length is applied once all objects are read
    // (AES ignores a part block at the end anyway, as pdf.js's does)
    parser.parseDictOrStream = function(){
      const startPos = this.bytes.position(), dict = this.parseDict();
      this.skipWhitespaceAndComments();
      if (!STREAM_EOL.some(k => this.matchKeyword(k)) && !this.matchKeyword(STREAM)) return dict;
      const start = this.bytes.offset(), L = dict.get(N('Length'));
      if (L instanceof PDFNumber) {
        const end = start + L.asNumber();
        this.bytes.moveTo(Math.min(end, u8.length)); this.skipWhitespaceAndComments();
        if (end <= u8.length && this.matchKeyword(ENDSTREAM)) return PDFRawStream.of(dict, u8.slice(start, end));
        this.bytes.moveTo(start);
      }
      let raw = this.findEndOfStreamFallback(startPos);   // (where the line end before "endstream" starts; moves past it)
      while (raw < u8.length && (u8[raw] === 0x0D || u8[raw] === 0x0A)) raw++;
      const s = PDFRawStream.of(dict, u8.slice(start, raw));
      loose.push({s, start, raw, ref:L instanceof PDFRef ? L : null});
      return s;
    };
    parser.parseIndirectObject = async function(){
      const ref = this.parseIndirectObjectHeader();
      this.skipWhitespaceAndComments();
      const obj = this.parseObject();
      this.skipWhitespaceAndComments();
      this.matchKeyword(ENDOBJ);
      const type = obj instanceof PDFRawStream ? obj.dict.lookup(N('Type')) : null;
      if (type === N('ObjStm')) events.push({ref, stm:obj});
      else if (type === N('XRef')) {   // (a linearized file's last xref stream has only /Size: keep /Root /Encrypt /Info /ID)
        const was = this.context.trailerInfo;
        PDFXRefStreamParser.forStream(obj).parseIntoContext();
        const t = this.context.trailerInfo;
        for (const k of ['Root', 'Encrypt', 'Info', 'ID']) if (!t[k]) t[k] = was[k];
      }
      else { this.context.assign(ref, obj); events.push({ref, obj}); }
      return ref;
    };
    const ctx = await parser.parseDocument(), ti = ctx.trailerInfo;
    if (!ti.Encrypt) return {state:'plain'};
    // the real length of a stream whose length is a separate object (numbers are never encrypted); one inside an object
    // stream is applied after decryption, below
    const fit = l => {
      const n = l.ref && ctx.lookup(l.ref);
      if (!(n instanceof PDFNumber)) return -1;
      const e = l.start + n.asNumber();
      return n.asNumber() >= 0 && e <= l.raw && u8.subarray(e, l.raw).every(isSpace) ? n.asNumber() : -1;
    };
    for (const l of loose) { const n = fit(l); if (n >= 0) { l.s.contents = u8.slice(l.start, l.start + n); l.done = true; } }
    const enc = ctx.lookup(ti.Encrypt), encRef = ti.Encrypt instanceof PDFRef ? ti.Encrypt : null;
    if (!(enc instanceof PDFDict)) return {state:'unsupported', reason:'the encryption dictionary is missing'};
    if (enc.lookup(N('Filter')) !== N('Standard')) return {state:'unsupported', reason:'encryption handler ' + String(enc.lookup(N('Filter')))};
    const V = enc.lookup(N('V')), v = V instanceof PDFNumber ? V.asNumber() : 0;
    if (![1, 2, 4, 5].includes(v)) return {state:'unsupported', reason:'encryption version ' + v};
    const ids = ti.ID instanceof PDFArray ? ti.ID : ctx.lookup(ti.ID);
    const id0 = ids instanceof PDFArray && ids.size() ? bytesOf(ids.lookup(0)) : Buffer.alloc(0);
    const key = fileKey(enc, id0);
    if (!key) return {state:'password'};

    // how strings, streams and embedded files are encrypted: 'rc4' | 'aes' (object key) | 'aes256' (file key) | null
    const meta = enc.lookup(N('EncryptMetadata')), plainMeta = v >= 4 && meta instanceof PDFBool && meta.asBoolean() === false;
    const method = name => {
      if (v < 4) return 'rc4';
      if (!(name instanceof PDFName) || name === N('Identity')) return null;
      const cf = enc.lookup(N('CF')), f = cf instanceof PDFDict ? cf.lookup(name) : null, cfm = f instanceof PDFDict ? f.lookup(N('CFM')) : null;
      if (!cfm || cfm === N('None')) return null;
      if (cfm === N('V2')) return 'rc4';
      if (cfm === N('AESV2')) return 'aes';
      if (cfm === N('AESV3')) return 'aes256';
      throw new Error('unknown crypt filter method ' + String(cfm));
    };
    const strM = method(enc.lookup(N('StrF'))), stmM = method(enc.lookup(N('StmF')));
    const effM = v >= 4 && enc.lookup(N('EFF')) ? method(enc.lookup(N('EFF'))) : stmM;
    const run = (m, ref, data) => {
      if (!m) return data;
      if (m === 'aes256') return aesDecrypt(key, data);
      const g = ref.generationNumber, o = ref.objectNumber;
      const k = md5(key, Buffer.from([o & 255, (o >> 8) & 255, (o >> 16) & 255, g & 255, (g >> 8) & 255]), m === 'aes' ? Buffer.from('sAlT') : Buffer.alloc(0)).subarray(0, Math.min(key.length + 5, 16));
      return m === 'aes' ? aesDecrypt(k, data) : rc4(k, data);
    };

    const walk = (o, ref) => {
      if (o instanceof PDFString || o instanceof PDFHexString) return strM ? PDFHexString.of(run(strM, ref, bytesOf(o)).toString('hex').toUpperCase()) : o;
      if (o instanceof PDFArray) { for (let i = 0; i < o.size(); i++) { const x = o.get(i), y = walk(x, ref); if (y !== x) o.set(i, y); } return o; }
      if (o instanceof PDFDict) {
        const t = o.get(N('Type')), isSig = o.has(N('ByteRange')) || t === N('Sig') || t === N('DocTimeStamp');
        for (const [k, x] of o.entries()) { if (isSig && k === N('Contents')) continue; const y = walk(x, ref); if (y !== x) o.set(k, y); }
        return o;
      }
      return o;
    };
    const done = new Map();   // stream as read → {d: the decrypted stream, m: how it was encrypted}
    const stream = (s, ref) => {
      walk(s.dict, ref);
      const type = s.dict.get(N('Type'));
      let m = type === N('EmbeddedFile') ? effM : stmM;
      if (type === N('Metadata') && plainMeta) m = null;
      // a /Crypt filter names its own crypt filter (Identity when it has none); it is taken off the filter list
      const f = s.dict.lookup(N('Filter')), list = f instanceof PDFArray ? f.asArray() : f ? [f] : [];
      const at = list.indexOf(N('Crypt'));
      if (at >= 0) {
        const dp = s.dict.lookup(N('DecodeParms')), dps = dp instanceof PDFArray ? dp.asArray() : [dp];
        const p = dps[at] instanceof PDFDict ? dps[at] : dps[at] instanceof PDFRef ? ctx.lookup(dps[at]) : null;
        m = method(p instanceof PDFDict ? (p.lookup(N('Name')) || N('Identity')) : N('Identity'));
        list.splice(at, 1);
        if (dp instanceof PDFArray) { const rest = dps.slice(); rest.splice(at, 1); rest.length ? s.dict.set(N('DecodeParms'), ctx.obj(rest)) : s.dict.delete(N('DecodeParms')); }
        else s.dict.delete(N('DecodeParms'));
        list.length ? s.dict.set(N('Filter'), list.length === 1 ? list[0] : ctx.obj(list)) : s.dict.delete(N('Filter'));
      }
      const d = PDFRawStream.of(s.dict, new Uint8Array(run(m, ref, Buffer.from(s.contents))));
      done.set(s, {d, m});
      return d;
    };

    // decrypt in file order, so a later revision of an object still wins over an earlier one
    let k = 0;
    for (const e of events) {
      const nObj = e.stm ? e.stm.dict.lookup(N('N')) : null;   // (an object stream counts as the objects in it)
      if ((k += nObj instanceof PDFNumber ? nObj.asNumber() : 1) >= 300) { k = 0; await tick(); }
      if (encRef && e.ref === encRef) continue;
      if (e.stm) await PDFObjectStreamParser.forStream(stream(e.stm, e.ref), () => false).parseIntoContext();
      else ctx.assign(e.ref, e.obj instanceof PDFRawStream ? stream(e.obj, e.ref) : walk(e.obj, e.ref));
    }
    // a length kept in an object stream can be read only now: RC4 (and no encryption) keeps the length, so the bytes
    // read past it (the line end before "endstream") are cut off; AES already dropped them with the part block
    for (const l of loose) {
      const n = l.done ? -1 : fit(l), x = done.get(l.s);
      if (n >= 0 && x && x.m !== 'aes' && x.m !== 'aes256') x.d.contents = x.d.contents.subarray(0, Math.min(n, x.d.contents.length));
    }
    if (encRef) ctx.delete(encRef);
    ti.Encrypt = undefined;
    PDFParser.prototype.maybeRecoverRoot.call(parser);
    const doc = new PDFDocument(ctx, false, false);
    // (no object streams: pdf-lib then gives way every 1000 objects while writing; with them it counts in steps of a
    // whole stream and may never land on a multiple of 1000. The next change saves with object streams again.)
    const out = await doc.save({updateFieldAppearances:false, addDefaultPage:false, useObjectStreams:false, objectsPerTick:1000});
    return {state:'decrypted', bytes:out, signed:hasSignedField(ctx)};
  } catch (e) {
    return {state:'unsupported', reason:String((e && e.message) || e)};
  }
}

module.exports = { decryptPdf };
