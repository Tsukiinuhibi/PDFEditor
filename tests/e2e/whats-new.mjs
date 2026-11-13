// 更新後顯示版本與更新內容: the version history inside the app (app/CHANGELOG.md), the window shown once after an
// update, the history in 設定 → 軟體更新, and the release check in scripts/check.mjs.
import { launch, ROOT, TMP } from './_env.mjs';
import { spawnSync } from 'child_process';
import fs from 'fs';
import path from 'path';

let failed = 0;
const check = (name, ok, detail = '') => { console.log(`${ok ? '✔' : '✘'} ${name}${detail !== '' ? '  ' + (typeof detail === 'string' ? detail : JSON.stringify(detail)) : ''}`); if (!ok) { failed++; process.exitCode = 1; } };
const open = async name => {
  const { app } = await launch(name);
  const win = await app.firstWindow(); win.on('pageerror', e => console.log('PAGEERR', e.message)); win.on('console', m => { if (m.type() === 'error') console.log('C', m.text().slice(0, 300)); });
  await win.waitForTimeout(3000);
  return { app, win, A:win.evaluate.bind(win) };
};
const PKG = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
const cmp = (a, b) => { const x = a.split('.').map(Number), y = b.split('.').map(Number); for (let k = 0; k < 3; k++) if (x[k] !== y[k]) return x[k] - y[k]; return 0; };
const VERS = [...fs.readFileSync(path.join(ROOT, 'app', 'CHANGELOG.md'), 'utf8').matchAll(/^## PDF 工作台 v(\d+\.\d+\.\d+)\s*$/gm)].map(m => m[1]);

// ---- part 1: the history inside the app, and the release check -------------------------------------------
let { app, win, A } = await open('wn1.pdf');
const cl = await A(() => window.__pdfapp.changelog());
check('changelog: every version, newest first, the current one on top', cl.length === VERS.length && cl.length >= 19 && cl[0].version === PKG.version && cl.every((s, k) => !k || cmp(cl[k - 1].version, s.version) > 0), cl.map(s => s.version).slice(0, 4));
check('changelog: a section holds its text, not its heading', cl[0].md.includes('###') && !cl[0].md.includes('## PDF 工作台'));
const h = await A(() => window.__pdfapp.notesHTML([{version:'9.9.9', md:'### 標題\n- 一 **粗** `碼`\n\n文字 <script>x</script>'}]));
check('notes HTML: heading, version, list, bold, code', h.includes('<h3 class="wn-v">v9.9.9</h3>') && h.includes('<h4>標題</h4>') && h.includes('<li>一 <b>粗</b> <code>碼</code></li>'), h);
check('notes HTML: other markup shown as text', h.includes('&lt;script&gt;') && !h.includes('<script>'), h);
check('missing changelog: empty, no error', JSON.stringify(await A(() => window.__pdfapp.changelog('nope.md'))) === '[]');
await app.evaluate(({app}) => app.exit(0)).catch(() => {});

// the release check: the top of app/CHANGELOG.md must be this version and the same as RELEASE_NOTES.md
const tmp = fs.mkdtempSync(path.join(TMP, 'chk-'));
for (const f of ['main.js', 'preload.js', 'package.json', 'RELEASE_NOTES.md', 'scripts/check.mjs', 'app/index.html', 'app/fontid.js', 'app/CHANGELOG.md']) {
  fs.mkdirSync(path.dirname(path.join(tmp, f)), {recursive:true}); fs.copyFileSync(path.join(ROOT, f), path.join(tmp, f));
}
const runCheck = cwd => spawnSync(process.execPath, ['scripts/check.mjs'], {cwd, encoding:'utf8'});
let r = runCheck(tmp);
check('release check: a copy of the project passes', r.status === 0, (r.stdout + r.stderr).slice(-300));
fs.writeFileSync(path.join(tmp, 'app/CHANGELOG.md'), fs.readFileSync(path.join(tmp, 'app/CHANGELOG.md'), 'utf8').replace(`## PDF 工作台 v${PKG.version}`, '## PDF 工作台 v0.0.1'));
r = runCheck(tmp);
check('release check: the wrong version on top fails', r.status !== 0 && /CHANGELOG/.test(r.stdout + r.stderr), (r.stdout + r.stderr).slice(-300));
fs.copyFileSync(path.join(ROOT, 'app/CHANGELOG.md'), path.join(tmp, 'app/CHANGELOG.md'));
fs.writeFileSync(path.join(tmp, 'RELEASE_NOTES.md'), fs.readFileSync(path.join(tmp, 'RELEASE_NOTES.md'), 'utf8') + '\n- 多一行\n');
r = runCheck(tmp);
check('release check: notes different from RELEASE_NOTES.md fail', r.status !== 0 && /RELEASE_NOTES/.test(r.stdout + r.stderr), (r.stdout + r.stderr).slice(-300));

console.log(failed ? `\n${failed} check(s) failed` : '\nall checks passed');
