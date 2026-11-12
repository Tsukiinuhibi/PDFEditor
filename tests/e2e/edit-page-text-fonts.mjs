// 修改原文選系統字型: the font catalogue knows each font's embedding rights and vertical data, system fonts (single
// files, collections, bold faces, CFF) embed cleanly, and edited page text is written in the chosen font.
import { launch, TMP, ROOT } from './_env.mjs';
import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';

const FIX = path.join(ROOT, 'tests', 'e2e', 'fixtures');
const b64Of = f => fs.readFileSync(f).toString('base64');
let failed = 0;
const check = (name, ok, detail = '') => { console.log(`${ok ? '✔' : '✘'} ${name}${detail !== '' ? '  ' + (typeof detail === 'string' ? detail : JSON.stringify(detail)) : ''}`); if (!ok) { failed++; process.exitCode = 1; } };
const open = async name => {
  const { app } = await launch(name);
  const win = await app.firstWindow(); win.on('pageerror', e => console.log('PAGEERR', e.message)); win.on('console', m => { if (m.type() === 'error') console.log('C', m.text().slice(0, 300)); });
  await win.waitForTimeout(3000);
  return { app, win, A:win.evaluate.bind(win) };
};

// ---- part 1: the catalogue knows embedding rights, vertical data, size and faces ---------------------
let { app, win, A } = await open('rf1.pdf');
await A(() => window.__pdfapp.fontReady());
const an = (family, file) => A(a => window.__pdfapp.fontAnalyse(a), {family, ps:'', b64:b64Of(file)});
const DV = '/usr/share/fonts/truetype/dejavu/DejaVuSerif.ttf';
let r = await an('DejaVu Serif', DV);
check('ok font', !!r && r.embed === 'ok' && r.vert === false, r);
check('bytes counted', !!r && r.bytes === fs.statSync(DV).size, r && r.bytes);
r = await an('PDFE NoSubset Test', path.join(FIX, 'nosubset-test.ttf'));
check('no-subsetting font', !!r && r.embed === 'full', r);
r = await an('PDFE Restricted Test', path.join(FIX, 'restricted-test.ttf'));
check('restricted font', !!r && r.embed === 'no', r);
r = await an('PDFE Vert Test', path.join(FIX, 'vert-test.ttf'));
check('vertical data', !!r && r.vert === true, r);
r = await an('WenQuanYi Zen Hei', '/usr/share/fonts/truetype/wqy/wqy-zenhei.ttc');
check('vmtx without vert is not enough', !!r && r.vert === false, r);
const dv = (await A(() => window.__pdfapp.fontCat())).fams.find(f => f.family === 'DejaVu Serif');
check('faces listed', !!dv && Array.isArray(dv.faces) && dv.faces.some(x => /bold/i.test(x.style)) && dv.faces.some(x => /^(book|regular)$/i.test(x.style)), dv && dv.faces);
check('cache v2', await A(() => !!localStorage.getItem('pdfeditor.fontcat.v2')));
await A(b64 => window.__pdfapp.registerTestFont({family:'PDFE Vert Test', b64}), b64Of(path.join(FIX, 'vert-test.ttf')));
const vt = (await A(() => window.__pdfapp.fontCat())).fams.find(f => f.family === 'PDFE Vert Test');
check('test font listed', !!vt && vt.vert === true && vt.embed === 'ok', vt);
check('test font usable in the page', await A(() => document.fonts.check('16px "PDFE Vert Test"', '直')));

// ---- part 2: system fonts embed cleanly ----------------------------------------------------------------
// embedCheck: embed the font in a new PDF with only these characters, then read the subset back (TrueType: every glyph's
// outline; any font: pdf.js extracts the text and draws ink)
const ec = a => A(a => window.__pdfapp.embedCheck(a), a);
let e = await ec({family:'WenQuanYi Zen Hei', bold:false, text:'文泉驛正黑測試'});
check('.ttc face embeds', !!e && e.broken === 0 && e.empty === 0 && e.glyphs >= 7 && /WenQuanYi/.test(e.baseFont) && e.text === '文泉驛正黑測試', e);
e = await ec({family:'DejaVu Serif', bold:true, text:'Bold Serif'});
check('bold face used', !!e && /DejaVuSerif-Bold/.test(e.baseFont) && e.broken === 0 && e.text === 'Bold Serif', e);
e = await ec({family:'DejaVu Serif', bold:false, text:'Plain'});
check('regular face for plain text', !!e && /^DejaVuSerif(-\d+)?$/.test(e.baseFont), e);
e = await ec({family:'Inter', bold:false, text:'Inter CFF'});
check('CFF (.otf) embeds', !!e && e.cff === true && e.text === 'Inter CFF' && e.ink > 100, e);
e = await ec({b64:b64Of(path.join(FIX, 'oddglyph-test.ttf')), text:'奇數長度測試ABCDEFGH'});
check('odd-length glyphs survive subsetting', !!e && e.broken === 0 && e.empty === 0 && e.glyphs >= 14, e);
const syn = await A(() => window.__pdfapp.fontBytesInfo('WenQuanYi Zen Hei', true));
check('no bold face: synthetic bold', !!syn && syn.synthetic === true, syn);

// ---- part 3: edited page text is written in each run's own font ------------------------------------
await win.click('[data-view="single"]'); await win.waitForTimeout(500);
await win.click('[data-tool="textbox"]'); await win.waitForTimeout(400);
const fmt = (k, v) => A(([k, v]) => window.__pdfapp.applyTextFormat(k, v), [k, v]);
const commit = async (ms = 3000) => { await win.keyboard.press('Escape'); await win.waitForTimeout(ms); };
// screen point on the first piece of page text containing `str` (scrolled into view)
const at = str => A(async str => { const app = window.__pdfapp, pg = app.S.pages[0], tc = await pg.page.getTextContent(), it = tc.items.find(i => i.str.includes(str)); if (!it) return null;
  const vw = document.querySelector('#viewer'), vr = vw.getBoundingClientRect();
  const [x, y] = pg.vp1.convertToViewportPoint(it.transform[4] + Math.min(it.width / 2, 40), it.transform[5] + Math.abs(it.transform[3]) * .3);
  let r = app.S.els[0].getBoundingClientRect(); vw.scrollTop += r.top + y * app.S.scale - (vr.top + vr.height / 2); r = app.S.els[0].getBoundingClientRect();
  return {x:r.left + x * app.S.scale, y:r.top + y * app.S.scale}; }, str);
const clickText = async str => { const p = await at(str); if (!p) { console.log('   (no text "' + str + '")'); return false; } await win.waitForTimeout(250); await win.mouse.click(p.x, p.y); await win.waitForTimeout(900); return true; };
const extract = async name => { const b = await A(() => Array.from(window.__pdfapp.S.bytes)); const f = path.join(TMP, name); fs.writeFileSync(f, Buffer.from(b));
  return execFileSync('pdftotext', ['-f', '1', '-l', '1', f, '-']).toString().replace(/\s+/g, ' '); };
const pageFonts = () => A(async () => { const P = PDFLib, d = await P.PDFDocument.load(window.__pdfapp.S.bytes, {ignoreEncryption:true}), F = d.getPage(0).node.Resources().lookup(P.PDFName.of('Font'));
  return F ? F.keys().map(k => String(F.lookup(k).get(P.PDFName.of('BaseFont'))).replace(/^\//, '')) : []; });
// the blocks this app wrote on page 1: their text and the fonts (BaseFont) they use
const blockFonts = () => A(async () => {
  const P = PDFLib, d = await P.PDFDocument.load(window.__pdfapp.S.bytes, {ignoreEncryption:true}), res = d.getPage(0).node.Resources();
  const props = res.lookup(P.PDFName.of('Properties')), F = res.lookup(P.PDFName.of('Font')), out = [];
  if (!props) return out;
  props.keys().forEach(k => { const b = props.lookup(k); if (!(b instanceof P.PDFDict)) return;
    const rt = b.lookupMaybe(P.PDFName.of('PDFE_RT'), P.PDFHexString, P.PDFString), arr = b.lookupMaybe(P.PDFName.of('PDFE_Fonts'), P.PDFArray); if (!rt) return;
    const names = arr ? arr.asArray().map(n => n.toString().slice(1)) : [];
    out.push({text:JSON.parse(rt.decodeText()).lines.flat().map(r => r.text).join(''),
      fonts:names.filter(n => F && F.has(P.PDFName.of(n))).map(n => String(F.lookup(P.PDFName.of(n)).get(P.PDFName.of('BaseFont'))).replace(/^\//, '').replace(/^[A-Z]{6}\+/, '').replace(/-\d+$/, ''))}); });
  return out; });
const blockOf = async txt => (await blockFonts()).find(b => b.text.includes(txt));
// every glyph of every embedded TrueType font still has its outline (spaces aside)
const glyphCheck = () => A(async () => {
  const P = PDFLib, d = await P.PDFDocument.load(window.__pdfapp.S.bytes), out = [];
  d.context.enumerateIndirectObjects().forEach(([, o]) => {
    if (!(o instanceof P.PDFDict) || String(o.get(P.PDFName.of('Type'))) !== '/FontDescriptor') return;
    const ff = o.lookup(P.PDFName.of('FontFile2')); if (!ff) return;
    const f = fontkit.create(P.decodePDFRawStream(ff).decode()); let bad = 0, empty = 0;
    for (let g = 1; g < f.numGlyphs; g++) { try { if (!f.getGlyph(g).path.commands.length) empty++; } catch (_) { bad++; } }
    out.push({font:String(o.get(P.PDFName.of('FontName'))), glyphs:f.numGlyphs - 1, broken:bad, empty});
  });
  return out; });
const editorWidth = () => A(() => { const r = document.createRange(), e = document.querySelector('.tbed'); r.selectNodeContents(e.firstChild); return r.getBoundingClientRect().width / window.__pdfapp.S.scale; });
const contents = () => A(async () => { const P = PDFLib, d = await P.PDFDocument.load(window.__pdfapp.S.bytes), pg = d.getPage(0), c = pg.node.Contents();
  const parts = c instanceof P.PDFArray ? c.asArray().map(x => d.context.lookup(x)) : [c];
  return parts.map(s => new TextDecoder('latin1').decode(s instanceof P.PDFRawStream ? P.decodePDFRawStream(s).decode() : s.getContents())).join('\n'); });

// DejaVu Serif on the bold title
check('(page text editor)', await clickText('Sample Report') && await A(() => !!document.querySelector('.tbed.real')));
await win.keyboard.press('Control+a'); await fmt('font', 'DejaVu Serif'); await win.keyboard.press('End'); await win.keyboard.type(' Serif');
const edW = await editorWidth();
await commit();
check('text readable by other programs', /Sample Report Serif/.test(await extract('rf-a.pdf')));
let bk = await blockOf('Sample Report Serif');
check('bold title uses the DejaVu Serif Bold face', !!bk && bk.fonts.includes('DejaVuSerif-Bold'), bk);
let gc = await glyphCheck();
check('every embedded glyph intact', gc.length > 0 && gc.every(g => g.broken === 0), gc);
const itW = await A(async () => { const tc = await window.__pdfapp.S.pages[0].page.getTextContent(); const it = tc.items.find(i => /Serif/.test(i.str)); return it ? it.width : null; });
check('width on the page = width in the editor (±1 pt)', itW !== null && Math.abs(itW - edW) <= 1, [itW, +edW.toFixed(2)]);
// editing it again brings the font back; edits do not pile up fonts; undo
await clickText('Sample Report Serif');
check('re-edit keeps the font', /DejaVu Serif/.test(await A(() => (window.__pdfapp.TBE() || {}).html || '')));
const nf0 = (await pageFonts()).length;
await win.keyboard.press('End'); await win.keyboard.type('!'); await commit();
await clickText('Sample Report Serif'); await win.keyboard.press('End'); await win.keyboard.type('?'); await commit();
await clickText('Sample Report Serif'); await win.keyboard.press('End'); await win.keyboard.type('#'); await commit();
const nf1 = (await pageFonts()).length;
check('editing the same block again does not pile up fonts', nf1 === nf0, [nf0, nf1]);
await win.click('#bUndo'); await win.waitForTimeout(3000);
const afterUndo = await extract('rf-b.pdf');
check('undo', /Serif!\?/.test(afterUndo) && !/Serif!\?#/.test(afterUndo), afterUndo.slice(0, 60));
// no bold face (文泉驛): drawn bold with 2 Tr
check('(subtitle editor)', await clickText('A test document'));
await win.keyboard.press('Control+a'); await win.keyboard.type('文泉粗體'); await win.keyboard.press('Control+a'); await fmt('font', 'WenQuanYi Zen Hei'); await fmt('bold', true);
await commit();
bk = await blockOf('文泉粗體');
check('文泉驛 embedded for the bold text', !!bk && bk.fonts.some(f => /WenQuanYi/.test(f)), bk);
check('fake bold: 2 Tr with a stroke', /\b2 Tr\b/.test(await contents()) && /\bw\b/.test(await contents()));
// several fonts in one block: each (font, weight) once
await clickText('文泉粗體');
await win.keyboard.press('Control+a'); await win.keyboard.type('AAA BBB 文泉 DDD'); await win.keyboard.press('Control+a'); await fmt('font', ''); await fmt('bold', false);
await win.keyboard.press('Home'); for (let k = 0; k < 3; k++) await win.keyboard.press('Shift+ArrowRight'); await fmt('font', 'DejaVu Serif');
await win.keyboard.press('ArrowRight'); await win.keyboard.press('ArrowRight'); for (let k = 0; k < 3; k++) await win.keyboard.press('Shift+ArrowRight'); await fmt('font', 'DejaVu Serif'); await fmt('bold', true);
await win.keyboard.press('ArrowRight'); await win.keyboard.press('ArrowRight'); for (let k = 0; k < 2; k++) await win.keyboard.press('Shift+ArrowRight'); await fmt('font', 'WenQuanYi Zen Hei');
await commit();
bk = await blockOf('AAA BBB');
const fams = bk ? bk.fonts : [];
check('one font resource per (font, weight)', fams.length === new Set(fams).size && ['DejaVuSerif', 'DejaVuSerif-Bold'].every(f => fams.includes(f)) && fams.some(f => /WenQuanYi/.test(f)) && fams.some(f => /Noto/.test(f)), fams);
// delete all the DejaVu Serif text: no DejaVu Serif left in the block
await clickText('AAA');   // (each font is a piece of its own on the page)
await win.keyboard.press('Home'); for (let k = 0; k < 8; k++) await win.keyboard.press('Shift+ArrowRight'); await win.keyboard.press('Delete');
await commit();
bk = await blockOf('文泉 DDD');
check('a font whose text is gone is not embedded', !!bk && !bk.fonts.some(f => /DejaVu/.test(f)), bk);
// a font whose file cannot be read: a message, and the text in 思源黑體
await A(b64 => window.__pdfapp.registerTestFont({family:'PDFE Gone Test', b64}), b64Of(path.join(FIX, 'vert-test.ttf')));
await clickText('DDD');
await win.keyboard.press('Control+a'); await win.keyboard.type('Gone font'); await win.keyboard.press('Control+a'); await fmt('font', 'PDFE Gone Test');
await A(() => window.__pdfapp.breakTestFont('PDFE Gone Test'));
await win.keyboard.press('Escape'); await win.waitForTimeout(400);
const toasts = await A(() => [...document.querySelectorAll('#toasts .toast')].map(t => t.textContent).join(' | '));
await win.waitForTimeout(2600);
check('unreadable font: message', /讀不到字型.+，這段文字改用思源黑體/.test(toasts), toasts);
bk = await blockOf('Gone font');
check('unreadable font: written in 思源黑體', !!bk && bk.fonts.length > 0 && bk.fonts.every(f => /Noto/.test(f)), bk);
// a subset that comes out broken is replaced by the whole font
await A(() => window.__pdfapp.fontkitPatch(false));
await A(b64 => window.__pdfapp.registerTestFont({family:'PDFE Odd Test', b64}), b64Of(path.join(FIX, 'oddglyph-test.ttf')));
await clickText('Gone font');
await win.keyboard.press('Control+a'); await win.keyboard.type('奇數長度測試'); await win.keyboard.press('Control+a'); await fmt('font', 'PDFE Odd Test');
await commit();
await A(() => window.__pdfapp.fontkitPatch(true));
gc = await glyphCheck();
const odd = gc.find(g => /PDFEOddTest/.test(g.font));
check('broken subset: the whole font is embedded instead', !!odd && odd.glyphs >= 14 && odd.broken === 0 && odd.empty === 0, odd);

// ---- end --------------------------------------------------------------------------------------
console.log(failed ? `${failed} check(s) failed` : 'all checks passed');
await app.evaluate(({app}) => app.exit(0)).catch(() => {});
