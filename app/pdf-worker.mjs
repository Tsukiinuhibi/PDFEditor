// pdf.js's worker (it reads the PDF and decodes its pictures), with the browser's own JPEG decoder made usable: pdf.js
// leaves it off in Chromium because that decoder turns a picture by its Exif orientation, which a PDF reader must not
// do (the PDF says how a picture is placed). Here the Exif segments are taken out of the JPEG first, and colours are not
// converted (as pdf.js's own decoder does), so the picture comes out as pdf.js would draw it — about five times faster
// for a large photo. Used as pdf.js's workerSrc (index.html, with isImageDecoderSupported) and inside the render worker.
import '../node_modules/pdfjs-dist/build/pdf.worker.min.mjs';

// a JPEG without its Exif segments (APP1 starting "Exif\0"); the same bytes when it has none
export function stripExif(d){
  if (!(d instanceof Uint8Array) || d.length < 4 || d[0] !== 0xff || d[1] !== 0xd8) return d;
  const keep = [[0, 2]]; let i = 2, cut = false;
  while (i + 4 <= d.length) {
    if (d[i] !== 0xff) break;
    let m = d[i + 1];
    if (m === 0xff) { i++; continue; }   // (fill bytes)
    if (m === 0xd8 || m === 0x01 || (m >= 0xd0 && m <= 0xd7)) { keep.push([i, i + 2]); i += 2; continue; }
    if (m === 0xda || m === 0xd9) break;   // (the picture's data from here on: kept as it is)
    const len = (d[i + 2] << 8) | d[i + 3];
    if (len < 2 || i + 2 + len > d.length) break;
    const isExif = m === 0xe1 && len >= 7 && d[i + 4] === 0x45 && d[i + 5] === 0x78 && d[i + 6] === 0x69 && d[i + 7] === 0x66 && d[i + 8] === 0;   // ("Exif\0", whatever follows)
    if (isExif) cut = true; else keep.push([i, i + 2 + len]);
    i += 2 + len;
  }
  if (!cut) return d;
  keep.push([i, d.length]);
  const out = new Uint8Array(keep.reduce((t, [a, b]) => t + b - a, 0)); let o = 0;
  for (const [a, b] of keep) { out.set(d.subarray(a, b), o); o += b - a; }
  return out;
}
const Native = globalThis.ImageDecoder;
globalThis.__pdfeNativeJpeg = 0;   // (how many pictures went to the browser's decoder: the render worker reports it)
if (typeof Native === 'function') {
  globalThis.ImageDecoder = class extends Native {
    constructor(init){
      if (init && init.type === 'image/jpeg' && init.data) {
        const data = init.data instanceof Uint8Array ? init.data : ArrayBuffer.isView(init.data) ? new Uint8Array(init.data.buffer, init.data.byteOffset, init.data.byteLength) : init.data instanceof ArrayBuffer ? new Uint8Array(init.data) : init.data;
        init = {...init, data:stripExif(data), colorSpaceConversion:'none'};
        globalThis.__pdfeNativeJpeg++;
      }
      super(init);
    }
    static isTypeSupported(t){ return Native.isTypeSupported(t); }
  };
}
