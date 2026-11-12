// Builds a PDF with text in every direction the editor has to handle (used by rotated-text.mjs):
// page 1: horizontal, turned 90° (reads upwards), turned 180°, true vertical writing (Identity-V),
//         and "fake" vertical text (one character per line, stacked);
// page 2: /Rotate 90 with text drawn so it stands upright on screen, plus text that shows sideways.
import { createRequire } from 'module';
import path from 'path';
import fs from 'fs';
const require = createRequire(import.meta.url);
const { PDFDocument, PDFName, PDFDict } = require('pdf-lib');
const fontkit = require('@pdf-lib/fontkit');

export async function buildRotatedFixture(ROOT, file){
  const doc = await PDFDocument.create(); doc.registerFontkit(fontkit);
  const font = await doc.embedFont(fs.readFileSync(path.join(ROOT, 'app', 'fonts', 'NotoSansTC-Regular.ttf')), {subset:true});
  const vfont = await doc.embedFont(fs.readFileSync(path.join(ROOT, 'app', 'fonts', 'NotoSansTC-Regular.ttf')), {subset:true, features:{vert:true}});
  const H = s => font.encodeText(s).toString(), V = s => vfont.encodeText(s).toString();
  const p1 = doc.addPage([595, 842]), p2 = doc.addPage([595, 842]);
  p2.node.set(PDFName.of('Rotate'), doc.context.obj(90));
  const ops1 = [
    'BT /F1 18 Tf 1 0 0 1 60 780 Tm', H('橫書正常文字 Horizontal'), 'Tj ET',
    'BT /F1 16 Tf 0 1 -1 0 80 300 Tm', H('轉九十度的文字 Up'), 'Tj ET',
    'BT /F1 16 Tf -1 0 0 -1 500 120 Tm', H('倒過來的文字'), 'Tj ET',
    'BT /F2 20 Tf 1 0 0 1 420 700 Tm', V('直書測試文字，第一行'), 'Tj ET',
    'BT /F2 20 Tf 1 0 0 1 390 700 Tm', V('第二行「引號」'), 'Tj ET',
    ...[...'假直書'].flatMap((ch, k) => ['BT /F1 18 Tf 1 0 0 1 250', 700 - k * 22, 'Tm', H(ch), 'Tj ET']),
  ];
  const ops2 = [
    'BT /F1 18 Tf 0 1 -1 0 100 80 Tm', H('旋轉頁面上的正立文字'), 'Tj ET',
    'BT /F1 14 Tf 0 1 -1 0 130 80 Tm', H('第二行也是正的 Line 2'), 'Tj ET',
    'BT /F1 14 Tf 1 0 0 1 300 400 Tm', H('畫面上是直的'), 'Tj ET',
  ];
  await font.embed(); await vfont.embed();
  // the vertical font: the same CID font, written top to bottom
  const ctx = doc.context, hv = ctx.lookup(vfont.ref, PDFDict);
  hv.set(PDFName.of('Encoding'), PDFName.of('Identity-V'));
  [p1, p2].forEach((p, k) => {
    p.node.set(PDFName.of('Resources'), ctx.obj({Font:{F1:font.ref, F2:vfont.ref}}));
    p.node.set(PDFName.of('Contents'), ctx.register(ctx.flateStream([ops1, ops2][k].join(' '))));
  });
  fs.writeFileSync(file, await doc.save());
}
