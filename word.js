'use strict';
/*
 * 轉存 Word with Microsoft Word (main process). Word 2013 and later open a PDF as an editable document with their own
 * conversion. Word is found through the registry and run in the background by PowerShell over COM: the PDF opened
 * read-only without the conversion question, saved as .docx, Word always closed. The paths go in environment variables
 * (Chinese paths survive). Word writes into a temporary folder; the .docx is copied to its place only when Word is done.
 * The conversion question (DisableConvertPdfWarning) is turned off for the run here, and put back here too: when a run is
 * stopped (取消, the 10-minute limit) PowerShell is killed and its own finally never runs.
 * Everything that starts a program goes through `run(file, args, opts)`, so the bookkeeping can be tested without Word.
 */
const path = require('path');
const os = require('os');
const fs = require('fs/promises');

const WORD_PS = `$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$in = $env:PDFE_IN; $out = $env:PDFE_OUT
$word = $null; $code = 0
try {
  $word = New-Object -ComObject Word.Application
  $word.Visible = $false
  $word.DisplayAlerts = 0
  # FileName, ConfirmConversions, ReadOnly, AddToRecentFiles
  $doc = $word.Documents.Open($in, $false, $true, $false)
  try { $doc.SaveAs2($out, 16) } finally { $doc.Close(0) }
  [Console]::Out.WriteLine('PDFE_OK')
} catch {
  [Console]::Out.WriteLine('PDFE_ERR:' + $_.Exception.Message); $code = 2
} finally {
  if ($word) { try { $word.Quit(0) } catch { }; [void][System.Runtime.InteropServices.Marshal]::ReleaseComObject($word) }
}
exit $code
`;
const LIMIT = 10 * 60 * 1000, STALE = 60 * 60 * 1000;
const optionsKey = v => `HKCU\\Software\\Microsoft\\Office\\${v}.0\\Word\\Options`;

// the installed Word's major version (16 for Word 2016 and later), 0 without Word
async function wordVersion(run){
  if (process.platform !== 'win32') return 0;
  const m = /Word\.Application\.(\d+)/.exec((await run('reg', ['query', 'HKCR\\Word.Application\\CurVer', '/ve'])).stdout);
  return m ? +m[1] : 0;
}
// the conversion question's setting as it is: a number, or null when it is not set
async function readPdfWarning(run, v){
  const m = /DisableConvertPdfWarning\s+REG_DWORD\s+0x([0-9a-f]+)/i.exec((await run('reg', ['query', optionsKey(v), '/v', 'DisableConvertPdfWarning'])).stdout);
  return m ? parseInt(m[1], 16) : null;
}
const setPdfWarning = (run, v, val) => val == null
  ? run('reg', ['delete', optionsKey(v), '/v', 'DisableConvertPdfWarning', '/f'])
  : run('reg', ['add', optionsKey(v), '/v', 'DisableConvertPdfWarning', '/t', 'REG_DWORD', '/d', String(val), '/f']);
// close the Word this program started: an /Automation WINWORD.EXE started after `since`
const stopWord = (run, since) => run('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command',
  "Get-CimInstance Win32_Process -Filter \"Name='WINWORD.EXE'\" | Where-Object { $_.CommandLine -match 'Automation' -and $_.CreationDate -ge [datetime]::Parse('"
  + since.toISOString() + "') } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }"], { timeout: 20000 });

// temporary folders an earlier run could not remove (its Word could not be closed and kept the PDF open): gone after an
// hour (a run takes 10 minutes at most)
async function sweepTemp(now = Date.now()){
  let names = []; try { names = await fs.readdir(os.tmpdir()); } catch (_) { return; }
  for (const n of names) {
    if (!n.startsWith('pdfe-word-')) continue;
    const p = path.join(os.tmpdir(), n);
    try { const st = await fs.stat(p); if (st.isDirectory() && now - st.mtimeMs > STALE) await fs.rm(p, { recursive: true, force: true }); } catch (_) {}
  }
}
// a .docx that cannot be written: open in Word (EBUSY on Windows), read-only, or not a file
const LOCKED = new Set(['EBUSY', 'EPERM', 'EACCES', 'EISDIR', 'EROFS']);
const lockedMsg = out => `這個檔案正被其他程式（例如 Word）開著，或不能寫入：${path.basename(out)}。請先關閉它，或換一個檔名。`;
async function targetLocked(out){
  try { const h = await fs.open(out, 'r+'); await h.close(); return false; }   // (opened for writing, nothing written)
  catch (err) { return !!(err && LOCKED.has(err.code)); }   // (not there yet: fine)
}

// the PDF (bytes) → the .docx at `out` by Word `version`. job: {cancelled, child} (取消 sets cancelled and kills child);
// killWord(since) closes the Word a stopped run left (stopWord, replaced in tests)
// → {ok: true} | {ok: false, why: 'cancel' | 'timeout' | 'word' | 'locked', msg}
async function convertWithWord({ pdf, out, version, run, job, killWord: kill = since => stopWord(run, since) }){
  if (job.cancelled) return { ok: false, why: 'cancel' };
  if (await targetLocked(out)) return { ok: false, why: 'locked', msg: lockedMsg(out) };   // (before Word is started for nothing)
  await sweepTemp();
  const since = new Date(Date.now() - 3000), had = await readPdfWarning(run, version);
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'pdfe-word-'));
  await setPdfWarning(run, version, 1);
  try {
    const inPdf = path.join(dir, 'in.pdf'), tmpOut = path.join(dir, 'out.docx'), ps1 = path.join(dir, 'convert.ps1');
    await fs.writeFile(inPdf, pdf); await fs.writeFile(ps1, '﻿' + WORD_PS, 'utf8');
    if (job.cancelled) return { ok: false, why: 'cancel' };
    const r = await run('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', ps1],
      { timeout: LIMIT, env: { ...process.env, PDFE_IN: inPdf, PDFE_OUT: tmpOut }, onChild: c => { job.child = c; } });
    if (job.cancelled) { await kill(since); return { ok: false, why: 'cancel' }; }
    if (r.err && r.err.killed) { await kill(since); return { ok: false, why: 'timeout' }; }
    if (!/PDFE_OK/.test(r.stdout)) { const m = /PDFE_ERR:(.*)/.exec(r.stdout); return { ok: false, why: 'word', msg: (m ? m[1] : r.stderr || (r.err && r.err.message) || '').trim().slice(0, 300) }; }
    try { await fs.copyFile(tmpOut, out); }
    catch (err) { if (err && LOCKED.has(err.code)) return { ok: false, why: 'locked', msg: lockedMsg(out) }; throw err; }
    return { ok: true };
  } catch (err) { return { ok: false, why: 'word', msg: String((err && err.message) || err) }; }
  finally {
    await setPdfWarning(run, version, had).catch(() => {});   // as it was, whatever happened
    await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

module.exports = { WORD_PS, wordVersion, readPdfWarning, setPdfWarning, stopWord, convertWithWord, sweepTemp, targetLocked };
