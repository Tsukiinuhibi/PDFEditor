// Edited page text is written into the page itself with an embedded font (Noto Sans TC), so other software
// can find, select and copy it; it can be edited again with its formatting; characters the font lacks fall back.
import { launch, TMP } from './_env.mjs';
import { execFileSync } from 'child_process';
import fs from 'fs';
const { app } = await launch('real.pdf');
const win = await app.firstWindow(); win.on('pageerror', e => console.log('PAGEERR', e.message)); win.on('console', m => { if (m.type() === 'error') console.log('C', m.text().slice(0, 300)); });
await win.waitForTimeout(3500);
await win.click('[data-view="single"]'); await win.waitForTimeout(500);
await win.click('[data-tool="textbox"]'); await win.waitForTimeout(500);
const A = win.evaluate.bind(win);
const box = await win.locator('.page').first().boundingBox();
const text = () => A(async () => { const tc = await window.__pdfapp.S.pages[0].page.getTextContent(); return tc.items.map(i => i.str).join('|'); });
const anns = () => A(async () => (await window.__pdfapp.getAnns(0)).map(a => a.subtype + ':' + a.contents).join(' | '));
const size0 = await A(() => window.__pdfapp.S.bytes.length);
// what another program (poppler's pdftotext) reads from the current file
const extract = async name => { const b = await A(() => Array.from(window.__pdfapp.S.bytes)); const f = TMP + '/' + name; fs.writeFileSync(f, Buffer.from(b));
  return execFileSync('pdftotext', ['-f', '1', '-l', '1', f, '-']).toString().split('\n').filter(Boolean).slice(0, 4).join(' / '); };
const fonts = () => A(async () => {
  const d = await PDFLib.PDFDocument.load(window.__pdfapp.S.bytes, {ignoreEncryption:true}), pg = d.getPage(0), F = pg.node.Resources().lookup(PDFLib.PDFName.of('Font'));
  return F.keys().map(k => { const f = F.lookup(k); return String(f.get(PDFLib.PDFName.of('Subtype'))) + ' ' + String(f.get(PDFLib.PDFName.of('BaseFont'))); }).filter(s => /Noto/.test(s)).join(', ');
});
const blocks = () => A(() => window.__pdfapp.pdfeBlocks(0));
// every glyph in every embedded subset must still have its outline (spaces aside)
const glyphCheck = () => A(async () => {
  const d = await PDFLib.PDFDocument.load(window.__pdfapp.S.bytes), out = [];
  d.context.enumerateIndirectObjects().forEach(([, o]) => {
    if (!(o instanceof PDFLib.PDFDict) || String(o.get(PDFLib.PDFName.of('Type'))) !== '/FontDescriptor') return;
    const ff = o.lookup(PDFLib.PDFName.of('FontFile2')); if (!ff) return;
    const f = fontkit.create(PDFLib.decodePDFRawStream(ff).decode()); let bad = 0, empty = 0;
    for (let g = 1; g < f.numGlyphs; g++) { try { const n = f.getGlyph(g).path.commands.length; if (!n) empty++; } catch (_) { bad++; } }
    out.push(`${f.numGlyphs - 1} glyphs: ${bad} broken, ${empty} empty`);
  });
  return out.join('; ');
});
// screen point on the first piece of text containing `str`
const at = str => A(async str => { const app = window.__pdfapp, pg = app.S.pages[0], tc = await pg.page.getTextContent(), it = tc.items.find(i => i.str.includes(str)); if (!it) return null;
  const [x, y] = pg.vp1.convertToViewportPoint(it.transform[4] + Math.min(it.width / 2, 40), it.transform[5] + Math.abs(it.transform[3]) * .3), r = document.querySelector('.page').getBoundingClientRect();
  return {x:r.left + x * app.S.scale, y:r.top + y * app.S.scale}; }, str);
const all = () => text().then(t => t.slice(0, 200));

console.log('before         ', (await text()).slice(0, 80));
console.log('pdftotext      ', await extract('r0.pdf'));
// 1. edit the bold title: add text at the end
let p = await at('Sample Report');
await win.mouse.click(p.x, p.y); await win.waitForTimeout(700);
const ed = await A(() => { const e = document.querySelector('.tbed'); return {font:getComputedStyle(e).fontFamily, w:e.getBoundingClientRect().width}; });
console.log('editor font    ', ed.font);
await win.keyboard.press('End'); await win.keyboard.type('（已修改）');
const edW = await A(() => { const r = document.createRange(), e = document.querySelector('.tbed'); r.selectNodeContents(e.firstChild); return r.getBoundingClientRect().width / window.__pdfapp.S.scale; });
await win.keyboard.press('Escape'); await win.waitForTimeout(3000);
console.log('after edit     ', await all());
console.log('annotations    ', await anns(), '(no 修改的文字 text box expected)');
console.log('pdftotext      ', await extract('r1.pdf'));
console.log('fonts          ', await fonts());
console.log('blocks         ', JSON.stringify(await blocks()));
const itemW = await A(async () => { const tc = await window.__pdfapp.S.pages[0].page.getTextContent(); const it = tc.items.find(i => /已修改/.test(i.str)); return it && it.width; });
console.log('width on page vs in editor (pt)', Math.round(itemW), Math.round(edW));
console.log('file grew by   ', Math.round((await A(() => window.__pdfapp.S.bytes.length) - size0) / 1024), 'KB');
await win.screenshot({path:TMP + '/real_after.png', clip:{x:box.x, y:box.y, width:900, height:300}});

// 2. edit it again: the editor comes back with the same formatting; replace the text
p = await at('已修改'); await win.mouse.click(p.x, p.y); await win.waitForTimeout(800);
console.log('re-edit editor ', JSON.stringify(await A(() => window.__pdfapp.TBE())));
await win.keyboard.press('Control+a'); await win.keyboard.type('新的標題 Title');
await win.keyboard.press('Escape'); await win.waitForTimeout(3000);
console.log('after re-edit  ', await all());
console.log('blocks         ', JSON.stringify(await blocks()));
console.log('pdftotext      ', await extract('r2.pdf'));
console.log('subset glyphs  ', await glyphCheck(), '(empty = spaces)');

// 3. two styles in one line: the subtitle, last word made red and bold
p = await at('test document'); await win.mouse.click(p.x, p.y); await win.waitForTimeout(700);
await win.keyboard.press('End'); await win.keyboard.type(' 重點');
for (let k = 0; k < 2; k++) await win.keyboard.press('Shift+ArrowLeft');
await win.waitForTimeout(200);
await A(() => { window.__pdfapp.applyTextFormat('color', '#e03131'); window.__pdfapp.applyTextFormat('bold', true); });
console.log('styled editor  ', JSON.stringify(await A(() => window.__pdfapp.TBE())));
await win.keyboard.press('Escape'); await win.waitForTimeout(3000);
console.log('styled line    ', await all());
console.log('fonts          ', await fonts());
const red = await A(async () => { const tc = await window.__pdfapp.S.pages[0].page.getTextContent(); const it = tc.items.find(i => i.str.includes('重點')); if (!it) return null;
  const pg = window.__pdfapp.S.pages[0], [x, y] = pg.vp1.convertToViewportPoint(it.transform[4] + it.width / 2, it.transform[5] + 4), c = document.querySelector('.page canvas.pc'), k = c.width / pg.w;
  const d = c.getContext('2d').getImageData(Math.round(x * k) - 6, Math.round(y * k) - 6, 13, 13).data; let n = 0; for (let o = 0; o < d.length; o += 4) if (d[o] > 180 && d[o + 1] < 100 && d[o + 2] < 100) n++; return n; });
console.log('red pixels on 重點', red, '| subset glyphs', await glyphCheck());
console.log('stored runs    ', await A(async () => { const d = await PDFLib.PDFDocument.load(window.__pdfapp.S.bytes), P = d.getPage(0).node.Resources().lookup(PDFLib.PDFName.of('Properties'));
  return P.keys().map(k => JSON.parse(P.lookup(k).lookup(PDFLib.PDFName.of('PDFE_RT')).decodeText()).lines.map(l => l.map(r => r.text.slice(-6) + (r.bold ? '/B' : '') + r.color).join(' + ')).join(' // ')).join(' ### '); }));
await win.screenshot({path:TMP + '/real_styled.png', clip:{x:box.x, y:box.y, width:900, height:300}});

// 4. a character the font does not have: falls back to the picture text box
p = await at('Title'); await win.mouse.click(p.x, p.y); await win.waitForTimeout(800);
await win.keyboard.press('End'); await win.keyboard.type('😀');
await win.keyboard.press('Escape');
for (let k = 0; k < 30 && !/FreeText:/.test(await anns()); k++) await win.waitForTimeout(500);   // (the picture text box takes longer on a busy machine)
await win.waitForTimeout(800);
console.log('emoji fallback ', await anns());
console.log('blocks         ', JSON.stringify(await blocks()));

// 5. undo back to the real text
await win.keyboard.press('Control+z'); await win.waitForTimeout(2500);
console.log('after undo     ', await anns(), '| blocks', JSON.stringify(await blocks()));

// 6. drag across both blocks and the first line of body text: one editor for all, one new block
const p1 = await at('Title'), p2 = await at('Lorem ipsum');
await win.mouse.move(p1.x - 60, p1.y - 20); await win.mouse.down(); await win.mouse.move(p2.x + 120, p2.y + 4, {steps:8}); await win.mouse.up(); await win.waitForTimeout(900);
console.log('range editor   ', (await A(() => window.__pdfapp.TBE().html)).replace(/<[^>]+>/g, '|').replace(/\|+/g, '|').slice(0, 160));
await win.keyboard.press('Control+a'); await win.keyboard.type('合併後的一段文字');
const t0 = Date.now(), v0 = await A(() => window.__pdfapp.S.version);
await win.keyboard.press('Escape');
while (await A(() => window.__pdfapp.S.version) === v0 && Date.now() - t0 < 15000) await win.waitForTimeout(50);
console.log('saved in       ', Date.now() - t0, 'ms');
await win.waitForTimeout(1500);
console.log('after range    ', JSON.stringify(await blocks()), '|', await extract('r4.pdf'));
await app.evaluate(({app}) => app.exit(0)).catch(() => {});
