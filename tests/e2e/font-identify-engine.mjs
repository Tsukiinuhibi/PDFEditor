// 字型辨識的比對引擎（app/fontid.js）: the blank fallback font, glyphs out of a scanned picture, glyph-by-glyph
// matching against installed fonts, and the Google Fonts subset loader (with a fake source, no network).
import { launch } from './_env.mjs';

let failed = 0;
const check = (name, ok, detail = '') => { console.log(`${ok ? '✔' : '✘'} ${name}${detail !== '' ? '  ' + (typeof detail === 'string' ? detail : JSON.stringify(detail)) : ''}`); if (!ok) { failed++; process.exitCode = 1; } };
const open = async name => {
  const { app } = await launch(name);
  const win = await app.firstWindow(); win.on('pageerror', e => console.log('PAGEERR', e.message)); win.on('console', m => { if (m.type() === 'error') console.log('C', m.text().slice(0, 300)); });
  await win.waitForTimeout(3000);
  return { app, win, A:win.evaluate.bind(win) };
};

// ---- part 1: the blank fallback font ----------------------------------------------------------
let { app, win, A } = await open('fid1.pdf');
await A(() => FontId.ready());
const hg = (css, ch) => A(([c, h]) => FontId.hasGlyph(c, h), [css, ch]);
check('blank font loaded', await A(() => document.fonts.check('16px "PDFE Blank"')));
check('latin font has A', await hg('"DejaVu Serif"', 'A'));
check('latin font lacks 中', !(await hg('"DejaVu Serif"', '中')));
check('cjk font has 中', await hg('"WenQuanYi Zen Hei"', '中'));
check('type 1 font unusable', !(await hg('"Bitstream Charter"', 'A')));
check('missing font', !(await hg('"No Such Font 123"', 'A')));
check('bundled font', await A(async () => { await document.fonts.load('16px "PDFE Sans"', '中'); return FontId.hasGlyph('"PDFE Sans"', '中'); }));
check('font string', (await A(() => FontId.fontString('"DejaVu Serif"', 50, 700))) === '700 50px "DejaVu Serif", "PDFE Blank"');
await app.close();

console.log(failed ? `\n${failed} check(s) failed` : '\nall checks passed');
