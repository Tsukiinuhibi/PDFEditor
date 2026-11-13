// Quick check before a release: the syntax of main.js, preload.js, app/fontid.js and the module script inside
// app/index.html, and that this version's notes head app/CHANGELOG.md and match RELEASE_NOTES.md.
import { execFileSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';

const html = fs.readFileSync('app/index.html', 'utf8');
const mods = [...html.matchAll(/<script type="module">([\s\S]*?)<\/script>/g)];
const tmp = path.join(os.tmpdir(), 'pdfe-index-module.mjs');
fs.writeFileSync(tmp, mods[mods.length - 1][1]);
for (const f of ['main.js', 'preload.js', 'app/fontid.js', tmp]) {
  execFileSync(process.execPath, ['--check', f], { stdio: 'inherit' });
  console.log('ok  ' + (f === tmp ? 'app/index.html (module script)' : f));
}

// the release notes: the newest section of app/CHANGELOG.md (shown in the app after an update) is this version and
// the same text as RELEASE_NOTES.md (the release page)
const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
const log = fs.readFileSync('app/CHANGELOG.md', 'utf8'), heads = [...log.matchAll(/^## PDF 工作台 v(\d+\.\d+\.\d+)\s*$/gm)];
if (!heads.length || heads[0][1] !== pkg.version) {
  console.error(`app/CHANGELOG.md: the newest section is v${heads.length ? heads[0][1] : '?'} but package.json is v${pkg.version} — add this version's notes at the top`);
  process.exit(1);
}
const top = log.slice(heads[0].index, heads[1] ? heads[1].index : log.length).trim();
if (top !== fs.readFileSync('RELEASE_NOTES.md', 'utf8').trim()) {
  console.error('RELEASE_NOTES.md is not the same text as the newest section of app/CHANGELOG.md');
  process.exit(1);
}
console.log(`ok  app/CHANGELOG.md (v${pkg.version}, same as RELEASE_NOTES.md)`);

