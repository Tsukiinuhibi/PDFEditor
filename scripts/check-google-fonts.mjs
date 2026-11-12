// Checks the Google Fonts list in app/fontid.js against Google (needs the network; not part of the e2e tests):
// every family name must be accepted by the CSS2 API, and the "has bold" flag must match whether
// `family:wght@700` is accepted. Prints the families to fix and exits 1 when there are any.
//   node scripts/check-google-fonts.mjs
import fs from 'fs';

const src = fs.readFileSync(new URL('../app/fontid.js', import.meta.url), 'utf8');
const m = /\/\/ google-fonts-list:start\s*const GOOGLE_LIST = (\[[\s\S]*?\]);\s*\/\/ google-fonts-list:end/.exec(src);
if (!m) { console.error('google-fonts-list markers not found in app/fontid.js'); process.exit(1); }
const list = new Function('return ' + m[1])();
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36';
const ok = async q => { for (let k = 0; k < 3; k++) { try { const r = await fetch('https://fonts.googleapis.com/css2?' + q + '&text=Aa', {headers:{'User-Agent':UA}}); return r.status === 200; } catch (_) { await new Promise(r => setTimeout(r, 500 * (k + 1))); } } throw new Error('no answer from Google'); };
const fam = f => 'family=' + encodeURIComponent(f).replace(/%20/g, '+');
const bad = [], wrongBold = [], seen = new Set();
let next = 0;
await Promise.all(Array.from({length:8}, async () => {
  while (next < list.length) {
    const [family, , , bold] = list[next++];
    if (seen.has(family)) { bad.push(family + ' (listed twice)'); continue; }
    seen.add(family);
    if (!(await ok(fam(family)))) { bad.push(family); continue; }
    const b = await ok(fam(family) + ':wght@700');
    if (b !== !!bold) wrongBold.push(`${family}: bold should be ${b ? 1 : 0}`);
  }
}));
console.log(`${list.length} families checked (${list.filter(x => x[2] === 'cjk').length} Chinese/Japanese, ${list.filter(x => x[2] === 'latin').length} Latin)`);
if (bad.length) console.log('not accepted by Google:\n  ' + bad.join('\n  '));
if (wrongBold.length) console.log('wrong bold flag:\n  ' + wrongBold.join('\n  '));
if (bad.length || wrongBold.length) process.exit(1);
console.log('all families OK');
