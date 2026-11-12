// 修改原文選系統字型: the font catalogue knows each font's embedding rights and vertical data, system fonts (single
// files, collections, bold faces, CFF) embed cleanly, and edited page text is written in the chosen font.
import { launch, TMP, ROOT } from './_env.mjs';
import fs from 'fs';
import path from 'path';

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

// ---- end --------------------------------------------------------------------------------------
console.log(failed ? `${failed} check(s) failed` : 'all checks passed');
await app.evaluate(({app}) => app.exit(0)).catch(() => {});
