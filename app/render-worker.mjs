// 頁面在背景畫: pdf.js runs here, in a worker, and draws each page on an OffscreenCanvas, so a page that takes long to
// draw (a large photo, a drawing with hundreds of thousands of lines) never holds up the window. The window sends a
// document's bytes once per version (S.version: unique across tabs) and asks for pages; each answer is an ImageBitmap
// (transferred, not copied) and the boxes of the pictures on the page, worked out from the operator list the page was
// drawn with (擷取圖片 needs them; the picture is not decoded again to find them).
// pdf.js reads the PDF in this same thread (pdf-worker.mjs, imported: its JPEG decoding is the browser's, Exif ignored).
import { stripExif } from './pdf-worker.mjs';   // (imported for its side effects: pdf.js's worker in this thread)
import * as pdfjs from '../node_modules/pdfjs-dist/build/pdf.min.mjs';
import { imageBoxesOf } from './imgboxes.mjs';
void stripExif;

// no DOM in a worker: canvases are OffscreenCanvas, fonts go to the worker's own font set, and the SVG filters pdf.js
// uses for transfer functions and high contrast are left out (drawn without them)
class OffCanvasFactory {
  constructor(){}
  create(w, h){ const canvas = new OffscreenCanvas(Math.max(1, w), Math.max(1, h)); return {canvas, context:canvas.getContext('2d')}; }
  reset(cc, w, h){ cc.canvas.width = Math.max(1, w); cc.canvas.height = Math.max(1, h); }
  destroy(cc){ if (cc.canvas) { cc.canvas.width = 0; cc.canvas.height = 0; } cc.canvas = null; cc.context = null; }
}
class NoFilterFactory {
  constructor(){}
  addFilter(){ return 'none'; } addHCMFilter(){ return 'none'; } addAlphaFilter(){ return 'none'; } addLuminosityFilter(){ return 'none'; }
  addHighlightHCMFilter(){ return 'none'; } destroy(){}
}
const ownerDocument = {fonts:self.fonts, createElement:n => { if (n === 'canvas') return new OffscreenCanvas(1, 1); throw new Error('no DOM in the render worker: ' + n); }};

let opts = null;
const docs = new Map();      // version → Promise<PDFDocumentProxy> (the last three kept)
const boxes = new Map();     // 'version:page' → boxes of the pictures
const tasks = new Map();     // request id → render task
const cancelled = new Set(); // ids cancelled before their drawing began
function loadDoc(ver, bytes){
  const p = pdfjs.getDocument({...opts, data:bytes, useWorkerFetch:true, ownerDocument, CanvasFactory:OffCanvasFactory, FilterFactory:NoFilterFactory, isOffscreenCanvasSupported:true}).promise;
  p.catch(() => {});
  docs.set(ver, p);
  while (docs.size > 3) { const [old, op] = docs.entries().next().value; docs.delete(old); op.then(d => d.destroy(), () => {}); for (const k of [...boxes.keys()]) if (k.startsWith(old + ':')) boxes.delete(k); }
  return p;
}
async function pageOf(ver, i){
  const d = docs.get(ver); if (!d) throw new Error('no document ' + ver);
  return (await d).getPage(i + 1);
}
function boxesOf(page, ops, skipAnnotations){
  const vp = page.getViewport({scale:1});
  return imageBoxesOf(ops, vp.transform, vp.width, vp.height, pdfjs, {skipAnnotations});
}
const reply = (m, transfer) => self.postMessage({...m, native:globalThis.__pdfeNativeJpeg || 0}, transfer || []);

self.addEventListener('message', async e => {
  const m = e.data; if (!m || !m.type) return;   // (pdf.js's own messages to this thread are not for here)
  if (m.type === 'init') { opts = m.opts; return; }
  if (m.type === 'doc') { loadDoc(m.ver, m.bytes); return; }
  if (m.type === 'drop') { const p = docs.get(m.ver); docs.delete(m.ver); if (p) p.then(d => d.destroy(), () => {}); return; }
  if (m.type === 'cancel') { const t = tasks.get(m.id); if (t) t.cancel(); else cancelled.add(m.id); return; }
  if (m.type === 'render') {
    try {
      if (cancelled.delete(m.id)) throw Object.assign(new Error('cancelled'), {name:'RenderingCancelledException'});
      const page = await pageOf(m.ver, m.i), vp = page.getViewport({scale:m.scale});
      if (cancelled.delete(m.id)) throw Object.assign(new Error('cancelled'), {name:'RenderingCancelledException'});
      const canvas = new OffscreenCanvas(Math.max(1, Math.floor(vp.width)), Math.max(1, Math.floor(vp.height)));
      const task = page.render({canvasContext:canvas.getContext('2d'), viewport:vp, annotationMode:m.annotationMode});
      tasks.set(m.id, task);
      try { await task.promise; } finally { tasks.delete(m.id); }
      let bx = boxes.get(m.ver + ':' + m.i);
      if (!bx) { try { const ops = task._internalRenderTask && task._internalRenderTask.operatorList; if (ops && ops.fnArray) boxes.set(m.ver + ':' + m.i, bx = boxesOf(page, ops, true)); } catch (_) {} }
      const bmp = canvas.transferToImageBitmap();
      reply({type:'page', id:m.id, ok:true, bmp, boxes:bx || null}, [bmp]);
    } catch (err) {
      reply({type:'page', id:m.id, ok:false, cancelled:!!(err && err.name === 'RenderingCancelledException'), err:String(err && err.message || err)});
    }
    return;
  }
  if (m.type === 'boxes') {   // the pictures of a page not drawn here yet: from its operator list without annotations
    try {
      let bx = boxes.get(m.ver + ':' + m.i);
      if (!bx) { const page = await pageOf(m.ver, m.i); bx = boxesOf(page, await page.getOperatorList({annotationMode:pdfjs.AnnotationMode.DISABLE}), false); boxes.set(m.ver + ':' + m.i, bx); }
      reply({type:'boxes', id:m.id, ok:true, boxes:bx});
    } catch (err) { reply({type:'boxes', id:m.id, ok:false, err:String(err && err.message || err)}); }
  }
});
self.postMessage({type:'ready'});
