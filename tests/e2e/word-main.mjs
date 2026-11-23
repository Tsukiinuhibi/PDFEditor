// 轉存 Word, the main-process side (word.js): Word's own conversion driven through PowerShell. Linux has no Word, so the
// programs it runs (reg, powershell) are replaced by a recorder here; what is checked is the bookkeeping around them: the
// conversion question's setting is always put back (also after 取消 or a timeout, when the script's own finally never
// runs), 取消 before PowerShell starts runs nothing, the .docx reaches its place only on success, the temporary folder goes.
import { createRequire } from 'module';
import { ROOT } from './_env.mjs';
import fs from 'fs';
import fsp from 'fs/promises';
import os from 'os';
import path from 'path';

let failed = 0;
const check = (name, ok, detail = '') => { console.log(`${ok ? '✔' : '✘'} ${name}${detail !== '' ? '  ' + (typeof detail === 'string' ? detail : JSON.stringify(detail)) : ''}`); if (!ok) { failed++; process.exitCode = 1; } };
const require = createRequire(import.meta.url);
let W = null; try { W = require(path.join(ROOT, 'word.js')); } catch (e) { console.log('no word.js:', e.message); }
const KEY = 'HKCU\\Software\\Microsoft\\Office\\16.0\\Word\\Options';
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'pdfe-wordmain-'));

// a recorder for the programs word.js runs. had: the setting before (null: not set); ps: what PowerShell does
function fake({had = null, ps = 'ok', job = null, during = null} = {}){
  const calls = [];
  const run = async (file, args, opts = {}) => {
    calls.push([file, ...args]);
    if (file === 'reg' && args[0] === 'query') return {stdout:had == null ? '' : `\r\n${KEY}\r\n    DisableConvertPdfWarning    REG_DWORD    0x${had.toString(16)}\r\n`, stderr:'', err:had == null ? {code:1} : null};
    if (file === 'powershell.exe' && args.includes('-File')) {
      if (opts.onChild) opts.onChild({kill:() => { calls.push(['kill']); }});
      if (during) during();
      const out = opts.env && opts.env.PDFE_OUT;
      if (ps === 'ok') { fs.writeFileSync(out, 'PK fake docx'); return {stdout:'PDFE_OK\r\n', stderr:'', err:null}; }
      if (ps === 'fail') return {stdout:'PDFE_ERR:無法開啟檔案\r\n', stderr:'', err:{code:2}};
      if (ps === 'cancel') { job.cancelled = true; return {stdout:'', stderr:'', err:{killed:true, signal:'SIGTERM'}}; }
      if (ps === 'timeout') return {stdout:'', stderr:'', err:{killed:true, signal:'SIGTERM'}};
    }
    return {stdout:'', stderr:'', err:null};
  };
  return {run, calls};
}
const regCalls = calls => calls.filter(c => c[0] === 'reg').map(c => c.slice(1).join(' '));
const tempLeft = () => fs.readdirSync(os.tmpdir()).filter(n => n.startsWith('pdfe-word-') && fs.statSync(path.join(os.tmpdir(), n)).mtimeMs > T0);
const T0 = Date.now() - 1000;

if (W) {
  // success: the setting was 0 before; the .docx is copied to its place
  let job = {cancelled:false}, f = fake({had:0}), out = path.join(TMP, '成功 報告.docx');
  let r = await W.convertWithWord({pdf:new Uint8Array([37, 80, 68, 70]), out, version:16, run:f.run, job});
  check('success: the .docx is copied to its place; the setting is turned off for the run and put back to 0',
    r.ok && fs.existsSync(out) && JSON.stringify(regCalls(f.calls)) === JSON.stringify([`query ${KEY} /v DisableConvertPdfWarning`, `add ${KEY} /v DisableConvertPdfWarning /t REG_DWORD /d 1 /f`, `add ${KEY} /v DisableConvertPdfWarning /t REG_DWORD /d 0 /f`]),
    {r, reg:regCalls(f.calls)});
  // 取消 while PowerShell runs: killed, the setting (not there before) removed again, nothing written
  job = {cancelled:false}; f = fake({had:null, ps:'cancel', job}); out = path.join(TMP, 'cancel.docx');
  r = await W.convertWithWord({pdf:new Uint8Array([37, 80, 68, 70]), out, version:16, run:f.run, job, killWord:async () => { f.calls.push(['killWord']); }});
  check('取消 during the run: Word is closed, the setting that was not there is deleted again, nothing is written',
    !r.ok && r.why === 'cancel' && !fs.existsSync(out) && f.calls.some(c => c[0] === 'killWord') && regCalls(f.calls).pop() === `delete ${KEY} /v DisableConvertPdfWarning /f`, {r, calls:f.calls});
  // a timeout: the same
  job = {cancelled:false}; f = fake({had:1, ps:'timeout'}); out = path.join(TMP, 'timeout.docx');
  r = await W.convertWithWord({pdf:new Uint8Array([37, 80, 68, 70]), out, version:16, run:f.run, job, killWord:async () => { f.calls.push(['killWord']); }});
  check('a timeout: Word is closed and the setting is put back (1)', !r.ok && r.why === 'timeout' && f.calls.some(c => c[0] === 'killWord') && regCalls(f.calls).pop() === `add ${KEY} /v DisableConvertPdfWarning /t REG_DWORD /d 1 /f`, {r, reg:regCalls(f.calls)});
  // Word reports an error: its message comes back
  job = {cancelled:false}; f = fake({had:null, ps:'fail'});
  r = await W.convertWithWord({pdf:new Uint8Array([37, 80, 68, 70]), out:path.join(TMP, 'fail.docx'), version:16, run:f.run, job});
  check('Word fails: its message comes back; the setting is deleted again', !r.ok && r.why === 'word' && r.msg === '無法開啟檔案' && regCalls(f.calls).pop() === `delete ${KEY} /v DisableConvertPdfWarning /f`, {r, reg:regCalls(f.calls)});
  // 取消 before PowerShell starts: nothing runs
  job = {cancelled:true}; f = fake({had:null});
  r = await W.convertWithWord({pdf:new Uint8Array([37, 80, 68, 70]), out:path.join(TMP, 'early.docx'), version:16, run:f.run, job});
  check('取消 before PowerShell starts: it is not started, and the setting is left as it was', !r.ok && r.why === 'cancel' && !f.calls.some(c => c[0] === 'powershell.exe') && !f.calls.some(c => c[0] === 'reg' && c[1] !== 'query'), {r, calls:f.calls});
  await new Promise(res => setTimeout(res, 300));
  check('no temporary folder is left behind', tempLeft().length === 0, tempLeft());
  // (v1.0.47) a .docx that cannot be written — open in Word (EBUSY on Windows), here a folder of that name: said at once,
  // before the setting is touched or Word started
  const busy = path.join(TMP, 'busy.docx'); fs.mkdirSync(busy);
  job = {cancelled:false}; f = fake({had:null});
  r = await W.convertWithWord({pdf:new Uint8Array([37, 80, 68, 70]), out:busy, version:16, run:f.run, job});
  check('a .docx that cannot be written (open in Word): 「locked」 and a message, Word not started, the setting not touched',
    !r.ok && r.why === 'locked' && /開著|不能寫入/.test(r.msg || '') && !f.calls.some(c => c[0] === 'powershell.exe') && !f.calls.some(c => c[0] === 'reg'), {r, calls:f.calls});
  // … or it becomes so while Word works: the copy to its place fails the same way, not as a Word failure
  const later = path.join(TMP, 'later.docx');
  job = {cancelled:false}; f = fake({had:null, during:() => fs.mkdirSync(later)});
  r = await W.convertWithWord({pdf:new Uint8Array([37, 80, 68, 70]), out:later, version:16, run:f.run, job});
  check('the .docx is opened elsewhere while Word works: 「locked」 too, not 「Word 轉換失敗」', !r.ok && r.why === 'locked' && /開著|不能寫入/.test(r.msg || ''), r);
  // temporary folders left by a run whose Word could not be closed: over an hour old → removed at the next run; a new one stays
  const old = fs.mkdtempSync(path.join(os.tmpdir(), 'pdfe-word-')), fresh = fs.mkdtempSync(path.join(os.tmpdir(), 'pdfe-word-'));
  fs.writeFileSync(path.join(old, 'in.pdf'), '%PDF'); const hoursAgo = new Date(Date.now() - 2 * 3600e3); fs.utimesSync(old, hoursAgo, hoursAgo);
  job = {cancelled:false}; f = fake({had:null});
  r = await W.convertWithWord({pdf:new Uint8Array([37, 80, 68, 70]), out:path.join(TMP, 'sweep.docx'), version:16, run:f.run, job});
  check('a temporary folder over an hour old (a Word that could not be closed) goes at the next run; a new one is kept', r.ok && !fs.existsSync(old) && fs.existsSync(fresh), {r, old:fs.existsSync(old), fresh:fs.existsSync(fresh)});
  fs.rmSync(old, {recursive:true, force:true}); fs.rmSync(fresh, {recursive:true, force:true});

  // ---- 開啟 Word 檔: Word turns a Word file into a PDF (wordToPdf) -------------------------------------------------------
  check('開啟 Word 檔: wordToPdf exists', typeof W.wordToPdf === 'function');
  if (typeof W.wordToPdf === 'function') {
    const PS = W.WORD_PDF_PS || '';
    check('the script: macros never run, the file opened read-only (and a made-up password so it never asks), saved as PDF (17)',
      /AutomationSecurity\s*=\s*3/.test(PS) && /Open-WordDoc \$word \$in/.test(PS) && /\$word\.Quit\(0\)/.test(PS), PS.slice(0, 600));
    const src = path.join(TMP, '會議 紀錄.docx'); fs.writeFileSync(src, 'PK the users word file');
    // a fake Word that writes a PDF where it is asked, and remembers what it was given
    let seen = null;
    const fakePdf = ({ps = 'ok', job = null} = {}) => { const calls = [];
      return {calls, run:async (file, args, opts = {}) => { calls.push([file, ...args]);
        if (file === 'powershell.exe' && args.includes('-File')) {
          if (opts.onChild) opts.onChild({kill:() => calls.push(['kill'])});
          const inp = opts.env && opts.env.PDFE_IN, out = opts.env && opts.env.PDFE_OUT;
          seen = {inp, content:inp && fs.existsSync(inp) ? fs.readFileSync(inp, 'utf8') : null};
          if (ps === 'ok') { fs.writeFileSync(out, '%PDF-1.7 made by word'); return {stdout:'PDFE_OK\r\n', stderr:'', err:null}; }
          if (ps === 'password') return {stdout:'PDFE_ERR:The password is incorrect. Word cannot open the document.\r\n', stderr:'', err:{code:2}};
          if (ps === 'fail') return {stdout:'PDFE_ERR:檔案已損毀\r\n', stderr:'', err:{code:2}};
          if (ps === 'cancel') { job.cancelled = true; return {stdout:'', stderr:'', err:{killed:true, signal:'SIGTERM'}}; }
          if (ps === 'timeout') return {stdout:'', stderr:'', err:{killed:true, signal:'SIGTERM'}};
        }
        return {stdout:'', stderr:'', err:null}; }}; };
    let g = fakePdf(); job = {cancelled:false};
    r = await W.wordToPdf({file:src, version:16, run:g.run, job});
    check('success: the PDF Word made comes back', r.ok && Buffer.from(r.data).toString() === '%PDF-1.7 made by word', r);
    check('Word is given a copy in a temporary folder (same kind, same content), never the user\'s file itself',
      !!seen && seen.inp !== src && /\.docx$/i.test(seen.inp) && seen.content === 'PK the users word file' && fs.readFileSync(src, 'utf8') === 'PK the users word file', seen);
    check('no registry setting is touched', !g.calls.some(c => c[0] === 'reg'), g.calls.map(c => c[0]));
    await new Promise(res => setTimeout(res, 200));
    check('the temporary folder goes afterwards', tempLeft().length === 0, tempLeft());
    g = fakePdf({ps:'password'}); r = await W.wordToPdf({file:src, version:16, run:g.run, job:{cancelled:false}});
    check('a file with a password: 「password」 and a message saying so', !r.ok && r.why === 'password' && /密碼/.test(r.msg || ''), r);
    g = fakePdf({ps:'fail'}); r = await W.wordToPdf({file:src, version:16, run:g.run, job:{cancelled:false}});
    check('Word fails: its message comes back', !r.ok && r.why === 'word' && r.msg === '檔案已損毀', r);
    job = {cancelled:false}; g = fakePdf({ps:'cancel', job});
    r = await W.wordToPdf({file:src, version:16, run:g.run, job, killWord:async () => { g.calls.push(['killWord']); }});
    check('取消 during the run: Word is closed, nothing comes back', !r.ok && r.why === 'cancel' && g.calls.some(c => c[0] === 'killWord'), {r, calls:g.calls});
    g = fakePdf({ps:'timeout'});
    r = await W.wordToPdf({file:src, version:16, run:g.run, job:{cancelled:false}, killWord:async () => { g.calls.push(['killWord']); }});
    check('a timeout: Word is closed', !r.ok && r.why === 'timeout' && g.calls.some(c => c[0] === 'killWord'), r);
    g = fakePdf(); r = await W.wordToPdf({file:path.join(TMP, 'not-there.docx'), version:16, run:g.run, job:{cancelled:false}});
    check('a file that cannot be read: 「read」, Word not started', !r.ok && r.why === 'read' && !g.calls.some(c => c[0] === 'powershell.exe'), r);
    g = fakePdf(); r = await W.wordToPdf({file:src, version:16, run:g.run, job:{cancelled:true}});
    check('取消 before it starts: Word not started', !r.ok && r.why === 'cancel' && !g.calls.some(c => c[0] === 'powershell.exe'), r);
    // (review) no encoding question for a .doc / .rtf that is really text. (v4.12.1) Not as 15 positional arguments with
    // [Type]::Missing in the gaps: Windows PowerShell cannot pass them (「無法將 bool 類型的 True 值轉換成 Object 類型」,
    // seen on the user's computer): by name, through IDispatch (InvokeMember), and only if that cannot be called at all
    // (not an error from Word itself), the plain call
    check('(v4.12.1) the file is opened by named arguments (InvokeMember: ReadOnly, PasswordDocument, Visible, NoEncodingDialog)',
      /InvokeMember\('Open'/.test(PS) && ['FileName', 'ConfirmConversions', 'ReadOnly', 'AddToRecentFiles', 'PasswordDocument', 'Visible', 'NoEncodingDialog'].every(n => PS.includes(`'${n}'`)) && !/\[Type\]::Missing/.test(PS), PS.slice(0, 1200));
    check('(v4.12.1) …the plain call only when that cannot be called (an error from Word itself, 800A…, is not retried)', /Test-WordError/.test(PS) && /'800A'/.test(PS) && /\.Open\(\$path, \$false, \$true, \$false, 'pdfe-no-password'\)/.test(PS));
    check('(v4.12.1) saved as PDF by ExportAsFixedFormat, or SaveAs2 (17) when that cannot be called', /ExportAsFixedFormat\(\$out, 17\)/.test(PS) && /SaveAs2\(\$out, 17\)/.test(PS));
    // (review) a password told by Word's error number, whatever Word's language
    { const run = async (file, args, opts = {}) => (file === 'powershell.exe' && args.includes('-File')) ? {stdout:'PDFE_HR:800A1520\r\nPDFE_ERR:パスワードが正しくありません。\r\n', stderr:'', err:{code:2}} : {stdout:'', stderr:'', err:null};
      r = await W.wordToPdf({file:src, version:16, run, job:{cancelled:false}});
      check('(review) a password in a Word of another language (error 5408): still 「password」', !r.ok && r.why === 'password', r); }
    check('(review) the script prints the error number (of the innermost error)', /PDFE_HR:/.test(PS) && /InnerException/.test(PS));
    // (review) Word jobs one at a time (a stopped one closes every Word started since it began)
    check('(review) oneAtATime exists', typeof W.oneAtATime === 'function');
    if (typeof W.oneAtATime === 'function') {
      const order = [], job = (n, ms, fail) => () => new Promise((res, rej) => { order.push('start ' + n); setTimeout(() => { order.push('end ' + n); fail ? rej(new Error('x')) : res(n); }, ms); });
      const rs = await Promise.allSettled([W.oneAtATime(job(1, 120, true)), W.oneAtATime(job(2, 20)), W.oneAtATime(job(3, 10))]);
      check('(review) one Word job at a time, in order, a failed one does not stop the next', JSON.stringify(order) === JSON.stringify(['start 1', 'end 1', 'start 2', 'end 2', 'start 3', 'end 3']) && rs[1].value === 2 && rs[2].value === 3, order);
    }
    check('(review) zoneOf exists (a file from the internet), 0 where there is no mark', typeof W.zoneOf === 'function' && await W.zoneOf(src) === 0);
    check('the Word kinds: .docx .doc .docm .dotx .dot .rtf .odt, not .pdf or .txt', ['a.docx', 'a.DOC', 'a.docm', 'a.dotx', 'a.dot', 'a.rtf', 'a.odt'].every(n => W.WORD_EXT.test(n)) && !['a.pdf', 'a.txt', 'docx'].some(n => W.WORD_EXT.test(n)));
  }
} else check('word.js exists and loads', false);
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
check('word.js is packed into the installer (package.json build.files)', (pkg.build.files || []).includes('word.js'), pkg.build.files.slice(0, 4));

console.log(failed ? `\n${failed} check(s) failed` : '\nall checks passed');
fs.rmSync(TMP, {recursive:true, force:true});
