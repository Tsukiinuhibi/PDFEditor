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
check('changelog: every version, newest first, the current one on top', cl.length === VERS.length && VERS.length > 1 && cl[0].version === PKG.version && cl.every((s, k) => !k || cmp(cl[k - 1].version, s.version) > 0), cl.map(s => s.version).slice(0, 4));
check('changelog: a section holds its text, not its heading', cl[0].md.includes('###') && !cl[0].md.includes('## PDF 工作台'));
const h = await A(() => window.__pdfapp.notesHTML([{version:'9.9.9', md:'### 標題\n- 一 **粗** `碼`\n\n文字 <script>x</script>'}]));
check('notes HTML: heading, version, list, bold, code', h.includes('<h3 class="wn-v">v9.9.9</h3>') && h.includes('<h4>標題</h4>') && h.includes('<li>一 <b>粗</b> <code>碼</code></li>'), h);
check('notes HTML: other markup shown as text', h.includes('&lt;script&gt;') && !h.includes('<script>'), h);
check('missing changelog: empty, no error', JSON.stringify(await A(() => window.__pdfapp.changelog('nope.md'))) === '[]');
const shown = () => A(() => document.querySelector('#mask').classList.contains('show') ? {title:document.querySelector('#modal .mh').textContent, vers:[...document.querySelectorAll('#modal .wn-v')].map(e => e.textContent), all:!!document.querySelector('#modal .mf button') && [...document.querySelectorAll('#modal .mf button')].some(b => b.textContent === '全部版本記錄')} : null);
const seen = () => A(() => localStorage.getItem('pdfeditor.seenversion.v1'));
check('a new install: no window, the version recorded', (await shown()) === null && (await seen()) === PKG.version, {shown:await shown(), seen:await seen()});
await app.close();

// ---- part 2: the window once after an update (the same profile, opened again) ---------------------------------
const setSeen = async v => { await A(v => v == null ? localStorage.removeItem('pdfeditor.seenversion.v1') : localStorage.setItem('pdfeditor.seenversion.v1', v), v); await app.close(); ({ app, win, A } = await open('wn.pdf')); };
({ app, win, A } = await open('wn2.pdf'));
await setSeen('1.0.26');
let w = await shown();
// (v4.5.0) 1.0.26 is an old number: the versions were numbered again, it is 3.3.0 now
const after126 = VERS.filter(v => cmp(v, '3.3.0') > 0 && cmp(v, PKG.version) <= 0).map(v => 'v' + v);
check('updated from 1.0.26: 已更新到 the current version', !!w && w.title === `已更新到 v${PKG.version}`, w);
check('updated from 1.0.26 (old number of 3.3.0): every newer version, newest first, not the whole history', !!w && JSON.stringify(w.vers) === JSON.stringify(after126), w && w.vers);
await win.click('#modal .mf button:has-text("知道了")'); await win.waitForTimeout(300);
check('知道了 closes it; the version recorded', (await shown()) === null && (await seen()) === PKG.version);
await app.close(); ({ app, win, A } = await open('wn3.pdf'));
check('opened again: no window', (await shown()) === null);
await setSeen(null);
w = await shown();
check('no record on a used computer: this version and the one before', !!w && JSON.stringify(w.vers) === JSON.stringify(VERS.filter(v => cmp(v, PKG.version) <= 0).slice(0, 2).map(v => 'v' + v)), w && w.vers);
await win.click('#modal .mf button:has-text("全部版本記錄")'); await win.waitForTimeout(300);
w = await shown();
check('全部版本記錄: every version, the button gone', !!w && w.vers.length === VERS.length && w.vers[0] === 'v' + VERS[0] && !w.all, w && {n:w.vers.length, all:w.all});
await win.click('#modal .mf button:has-text("知道了")'); await win.waitForTimeout(300);
await setSeen('9.9.9');
check('an older version installed again: no window, the version recorded', (await shown()) === null && (await seen()) === PKG.version, {shown:await shown(), seen:await seen()});
check('nothing written between two versions: no empty window', JSON.stringify(await A(() => window.__pdfapp.whatsNewList({current:'1.0.30', seen:'1.0.29', used:true, versions:['1.0.28', '1.0.27']}))) === '[]');
check('this version has no notes: no window (not older ones under its title)', JSON.stringify(await A(() => [window.__pdfapp.whatsNewList({current:'1.0.30', seen:null, used:true, versions:['1.0.28', '1.0.27']}), window.__pdfapp.whatsNewList({current:'1.0.30', seen:'1.0.27', used:true, versions:['1.0.28', '1.0.27']})])) === '[[],[]]');
// another window open first (e.g. a password): the notes wait for it
await win.click('#bSettings'); await win.waitForTimeout(500);
await A(v => window.__pdfapp.showWhatsNew(v, [v]), PKG.version); await win.waitForTimeout(1200);
check('another window open: it stays', (await shown() || {}).title === '設定', await shown());
await win.click('#modal .mf button:has-text("關閉")'); await win.waitForTimeout(1200);
check('then the notes', (await shown() || {}).title === `已更新到 v${PKG.version}`, await shown());
await win.click('#modal .mf button:has-text("知道了")'); await win.waitForTimeout(300);
await A(() => localStorage.setItem('pdfeditor.seenversion.v1', '1.0.26'));
await win.click('#bSettings'); await win.waitForTimeout(500);
await A(v => window.__pdfapp.checkWhatsNew(v, true), PKG.version); await win.waitForTimeout(1000);
check('waiting behind another window: not recorded yet', (await seen()) === '1.0.26' && (await shown() || {}).title === '設定', await seen());
await win.click('#modal .mf button:has-text("關閉")'); await win.waitForTimeout(1200);
check('shown: recorded then', (await shown() || {}).title === `已更新到 v${PKG.version}` && (await seen()) === PKG.version, {shown:await shown(), seen:await seen()});
await win.click('#modal .mf button:has-text("知道了")'); await win.waitForTimeout(300);
await app.close();

// ---- part 3: the history in 設定 → 軟體更新 ------------------------------------------------------------------------
({ app, win, A } = await open('wn4.pdf'));
check('same version again: no window', (await shown()) === null);
await win.click('#bSettings'); await win.waitForTimeout(400);
await win.click('#modal [data-st="update"]'); await win.waitForTimeout(300);
await win.click('#modal [data-u2="notes"]'); await win.waitForTimeout(500);
let nt = await A(() => { const el = document.querySelector('#updNotes'); return el && !el.hidden ? [...el.querySelectorAll('.wn-v')].map(e => e.textContent) : null; });
check('設定: 更新內容 lists every version, this one first', !!nt && nt.length === VERS.length && nt[0] === 'v' + PKG.version, nt && nt.slice(0, 3));
const notesView = () => A(() => { const el = document.querySelector('#updNotes'); return el && !el.hidden && el.getBoundingClientRect().height > 50 ? {n:el.querySelectorAll('.wn-v').length, top:el.scrollTop} : null; });
await A(() => { const el = document.querySelector('#updNotes'); el.scrollTop = 120; });
await A(() => window.__pdfapp.updState({state:'downloading', version:'9.9.9', percent:30})); await win.waitForTimeout(300);
await A(() => window.__pdfapp.updState({state:'downloading', version:'9.9.9', percent:60})); await win.waitForTimeout(300);
let nv = await notesView();
check('設定: an update in progress leaves 更新內容 open where it was', !!nv && nv.n === VERS.length && nv.top >= 100, nv);
await A(v => window.__pdfapp.updState({state:'latest', version:v}), PKG.version); await win.waitForTimeout(300);
await win.click('#modal [data-u2="notes"]'); await win.waitForTimeout(300);
check('設定: pressed again, folded away (not on screen)', await A(() => { const el = document.querySelector('#updNotes'); return !el || el.getBoundingClientRect().height === 0; }));
// (v1.0.51) the history cannot be read: 設定 says so
await A(() => window.__pdfapp.changelogGone());
await win.click('#modal [data-u2="notes"]'); await win.waitForTimeout(400);
const gone = await A(() => { const el = document.querySelector('#updNotes'); return el && el.getBoundingClientRect().height > 0 ? el.textContent.trim() : null; });
check('設定: the history cannot be read — 「讀不到版本記錄」 on screen', gone === '讀不到版本記錄', gone);
await app.close();

// the release check: the top of app/CHANGELOG.md must be this version and the same as RELEASE_NOTES.md
const tmp = fs.mkdtempSync(path.join(TMP, 'chk-'));
for (const f of ['main.js', 'word.js', 'claude.js', 'pdfcrypt.js', 'app/claude/server/index.js', 'preload.js', 'package.json', 'RELEASE_NOTES.md', 'scripts/check.mjs', 'app/index.html', 'app/fontid.js', 'app/CHANGELOG.md']) {
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

// ---- part 3 (v1.0.51) -------------------------------------------------------------------------------------------------
({ app, win, A } = await open('wn3.pdf'));
const h3 = await A(() => window.__pdfapp.notesHTML([{version:'9.9.8', md:'## 段落裡的標題\n- 一\n  - 一之一\n  - 一之二\n- 二'}]));
check('notes HTML: 「##」 inside a section is a heading, not shown as it is written', h3.includes('<h4>段落裡的標題</h4>') && !h3.includes('##'), h3);
check('notes HTML: a list inside a list keeps its level', h3.includes('<ul><li>一<ul><li>一之一</li><li>一之二</li></ul></li><li>二</li></ul>'), h3);
const nt3 = await app.evaluate(() => global.__pdfeNotesText('<p>大於 <5 MB> 的 <b>檔案</b>、<檔名>、<file name></p>'));
check('the notes of an update: only HTML tags taken out (「<5 MB>」, 「<檔名>」 and 「<file name>」 stay)', nt3 === '大於 <5 MB> 的 檔案、<檔名>、<file name>', nt3);
// the seen version cannot be written: the window is not shown (it would come up at every start)
await A(() => { const S = Storage.prototype; S.__set = S.setItem; S.__set.call(localStorage, 'pdfeditor.seenversion.v1', '1.0.26');
  S.setItem = function(k, v){ if (k === 'pdfeditor.seenversion.v1') throw new Error('blocked'); return S.__set.call(this, k, v); }; });
await A(v => window.__pdfapp.checkWhatsNew(v, true), PKG.version); await win.waitForTimeout(1500);
const w3 = await shown();
await A(() => { const S = Storage.prototype; if (S.__set) { S.setItem = S.__set; delete S.__set; } });
check('the seen version cannot be written: no window (it would come up at every start)', w3 === null, w3);
await app.close();

console.log(failed ? `\n${failed} check(s) failed` : '\nall checks passed');
