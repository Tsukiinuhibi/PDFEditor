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
function fake({had = null, ps = 'ok', job = null} = {}){
  const calls = [];
  const run = async (file, args, opts = {}) => {
    calls.push([file, ...args]);
    if (file === 'reg' && args[0] === 'query') return {stdout:had == null ? '' : `\r\n${KEY}\r\n    DisableConvertPdfWarning    REG_DWORD    0x${had.toString(16)}\r\n`, stderr:'', err:had == null ? {code:1} : null};
    if (file === 'powershell.exe' && args.includes('-File')) {
      if (opts.onChild) opts.onChild({kill:() => { calls.push(['kill']); }});
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
} else check('word.js exists and loads', false);
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
check('word.js is packed into the installer (package.json build.files)', (pkg.build.files || []).includes('word.js'), pkg.build.files.slice(0, 4));

console.log(failed ? `\n${failed} check(s) failed` : '\nall checks passed');
fs.rmSync(TMP, {recursive:true, force:true});
