// Quick syntax check of the app code: main.js, preload.js and the module script inside app/index.html.
import { execFileSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';

const html = fs.readFileSync('app/index.html', 'utf8');
const mods = [...html.matchAll(/<script type="module">([\s\S]*?)<\/script>/g)];
const tmp = path.join(os.tmpdir(), 'pdfe-index-module.mjs');
fs.writeFileSync(tmp, mods[mods.length - 1][1]);
for (const f of ['main.js', 'preload.js', tmp]) {
  execFileSync(process.execPath, ['--check', f], { stdio: 'inherit' });
  console.log('ok  ' + (f === tmp ? 'app/index.html (module script)' : f));
}
