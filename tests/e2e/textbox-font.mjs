// 文字方塊選字型: the system fonts are listed (Chinese names read from the font files, cached), a text box run can
// carry a font, and the font menu in the format bar picks one.
import { launch, TMP } from './_env.mjs';

let failed = 0;
const check = (name, ok, detail = '') => { console.log(`${ok ? '✔' : '✘'} ${name}${detail !== '' ? '  ' + (typeof detail === 'string' ? detail : JSON.stringify(detail)) : ''}`); if (!ok) { failed++; process.exitCode = 1; } };
const open = async name => {
  const { app } = await launch(name);
  const win = await app.firstWindow(); win.on('pageerror', e => console.log('PAGEERR', e.message)); win.on('console', m => { if (m.type() === 'error') console.log('C', m.text().slice(0, 300)); });
  await win.waitForTimeout(3000);
  return { app, win, A:win.evaluate.bind(win) };
};

// ---- part 1: the font catalogue -------------------------------------------------------------
let { app, win, A } = await open('font1.pdf');
await A(() => window.__pdfapp.fontReady());
const cat = await A(() => window.__pdfapp.fontCat());
const wqy = cat.fams.find(f => f.family === 'WenQuanYi Zen Hei'), dv = cat.fams.find(f => f.family === 'DejaVu Serif');
check('catalog ok', cat.ok === true && cat.fams.length >= 10, cat.fams.length);
check('zh name from .ttc', !!wqy && wqy.name === '文泉驛正黑' && wqy.cjk === true, wqy);
check('latin font', !!dv && dv.name === 'DejaVu Serif' && dv.cjk === false, dv);
check('cache written', await A(() => Object.keys(JSON.parse(localStorage.getItem('pdfeditor.fontcat.v1') || '{}')).length) >= cat.fams.length);
await app.close();

// the same profile again: the names come from the cache straight away
({ app, win, A } = await open('font2.pdf'));
const cat2 = await A(async () => { await window.__pdfapp.fontLoad(); return window.__pdfapp.fontCat(); });
const wqy2 = cat2.fams.find(f => f.family === 'WenQuanYi Zen Hei');
check('cache used on 2nd launch', !!wqy2 && wqy2.name === '文泉驛正黑' && wqy2.cjk === true, wqy2);

// ---- end --------------------------------------------------------------------------------------
console.log(failed ? `${failed} check(s) failed` : 'all checks passed');
await app.evaluate(({app}) => app.exit(0)).catch(() => {});
