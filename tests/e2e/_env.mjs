// Shared setup for the end-to-end scripts: start the real app (Electron) on a copy of the sample PDF,
// with its own throw-away profile so it never touches the installed app's settings or files.
import { _electron as electron } from 'playwright-core';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';
import os from 'os';

const require = createRequire(import.meta.url);
export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'pdfe-e2e-'));
const ELECTRON = require('electron');   // the electron package resolves to its binary

export function fixture(name){
  const p = path.join(TMP, name);
  fs.copyFileSync(path.join(ROOT, 'tests', 'e2e', 'fixtures', 'sample.pdf'), p);
  return p;
}
export async function launch(pdfName){
  return launchPath(fixture(pdfName));
}
// open a PDF the script made itself (it must live in TMP)
export async function launchPath(pdf){
  const app = await electron.launch({
    executablePath: ELECTRON,
    args: [...(process.platform === 'linux' ? ['--no-sandbox'] : []), ROOT, pdf],
    env: { ...process.env, PDFE_USER_DATA: path.join(TMP, 'profile') },
  });
  return { app, pdf };
}
