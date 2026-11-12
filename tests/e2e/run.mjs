// Runs every end-to-end script one after another and flags the ones that crashed, timed out or logged errors.
//   node tests/e2e/run.mjs            (all)
//   node tests/e2e/run.mjs layers     (only scripts whose name contains "layers")
// On Linux without a display the scripts are run under xvfb-run.
import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';

const dir = path.dirname(fileURLToPath(import.meta.url));
const only = process.argv[2] || '';
const tests = fs.readdirSync(dir).filter(f => f.endsWith('.mjs') && !f.startsWith('_') && f !== 'run.mjs' && f.includes(only)).sort();
const wrap = process.platform === 'linux' && !process.env.DISPLAY;
let bad = 0;
for (const t of tests) {
  const cmd = wrap ? ['xvfb-run', ['-a', process.execPath, path.join(dir, t)]] : [process.execPath, [path.join(dir, t)]];
  const r = spawnSync(cmd[0], cmd[1], { encoding: 'utf8', timeout: 180000 });
  const out = (r.stdout || '') + (r.stderr || '');
  const lines = out.split('\n').filter(l => l.trim() && !/TUNNEL|dbus|Gtk-|ERROR:|DevTools|proxy|fonts\.goo/.test(l));
  // pdf.js prints some harmless "Warning: …" lines; only real errors count
  const failed = r.status !== 0 || r.signal || lines.some(l => !/Warning:/.test(l) && /PAGEERR|CERR|TimeoutError|^\s*\w*Error:/.test(l));
  if (failed) bad++;
  console.log(`${failed ? '✗' : '✓'} ${t}${r.signal ? ' (timed out)' : ''}`);
  lines.forEach(l => console.log('    ' + l.slice(0, 220)));
}
console.log(bad ? `\n${bad} of ${tests.length} need a look` : `\nall ${tests.length} ran cleanly`);
process.exit(bad ? 1 : 0);
