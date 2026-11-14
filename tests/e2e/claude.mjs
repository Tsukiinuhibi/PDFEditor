// Claude 增益集: in 設定 → Claude the program opens a local bridge (127.0.0.1, a key) and saves a Claude Desktop extension
// (.mcpb) with the port and key in it. Claude Desktop runs the extension's MCP server (app/claude/server/index.js) with its
// own Node; here the test runs it the same way and talks MCP (JSON-RPC over stdio) to it, against the real app.
import { launch, TMP, ROOT } from './_env.mjs';
import { spawn } from 'child_process';
import zlib from 'zlib';
import http from 'http';
import net from 'net';
import fs from 'fs';
import path from 'path';
import { PDFDocument, StandardFonts, beginText, endText, setFontAndSize, setTextRenderingMode, TextRenderingMode, moveText, showText } from 'pdf-lib';

let failed = 0;
const check = (name, ok, detail = '') => { console.log(`${ok ? '✔' : '✘'} ${name}${detail !== '' ? '  ' + (typeof detail === 'string' ? detail : JSON.stringify(detail)) : ''}`); if (!ok) { failed++; process.exitCode = 1; } };
function unzip(buf){
  const out = {}; let e = buf.length - 22; while (e >= 0 && buf.readUInt32LE(e) !== 0x06054b50) e--;
  if (e < 0) return null;
  let p = buf.readUInt32LE(e + 16);
  for (let k = buf.readUInt16LE(e + 10); k > 0; k--) {
    const method = buf.readUInt16LE(p + 10), size = buf.readUInt32LE(p + 20), nl = buf.readUInt16LE(p + 28), xl = buf.readUInt16LE(p + 30), cl = buf.readUInt16LE(p + 32), off = buf.readUInt32LE(p + 42);
    const name = buf.subarray(p + 46, p + 46 + nl).toString('utf8'), lnl = buf.readUInt16LE(off + 26), lxl = buf.readUInt16LE(off + 28), data = buf.subarray(off + 30 + lnl + lxl, off + 30 + lnl + lxl + size);
    out[name] = method === 8 ? zlib.inflateRawSync(data) : Buffer.from(data);
    p += 46 + nl + xl + cl;
  }
  return out;
}
// an MCP session with the extension's server: request(method, params) → result (or {error})
function mcp(env){
  const ch = spawn(process.execPath, [path.join(ROOT, 'app', 'claude', 'server', 'index.js')], {env:{...process.env, ...env}, stdio:['pipe', 'pipe', 'inherit']});
  let buf = '', seq = 0, noId = null; const wait = new Map();
  ch.stdout.setEncoding('utf8');
  ch.stdout.on('data', d => { buf += d; let k; while ((k = buf.indexOf('\n')) >= 0) { const line = buf.slice(0, k); buf = buf.slice(k + 1); if (!line.trim()) continue; const m = JSON.parse(line); if (m.id == null && noId) { noId(m); noId = null; continue; } const f = wait.get(m.id); if (f) { wait.delete(m.id); f(m); } } });
  return {
    request:(method, params = {}) => new Promise(res => { const id = ++seq; wait.set(id, m => res(m.error ? {error:m.error} : m.result)); ch.stdin.write(JSON.stringify({jsonrpc:'2.0', id, method, params}) + '\n'); setTimeout(() => { if (wait.has(id)) { wait.delete(id); res({error:'timeout'}); } }, 60000); }),
    notify:(method, params = {}) => ch.stdin.write(JSON.stringify({jsonrpc:'2.0', method, params}) + '\n'),
    raw:line => new Promise(res => { noId = res; ch.stdin.write(line + '\n'); setTimeout(() => { if (noId === res) { noId = null; res(null); } }, 5000); }),
    close:() => { ch.stdin.end(); ch.kill(); },
  };
}
const tool = async (s, name, args = {}) => { const r = await s.request('tools/call', {name, arguments:args}); return {text:r && r.content ? r.content.map(c => c.text).join('') : '', isError:!!(r && r.isError), raw:r}; };
const post = (port, headers, body = {tool:'pdf_status', args:{}}) => new Promise(res => {
  const b = Buffer.from(JSON.stringify(body));
  const req = http.request({host:'127.0.0.1', port, path:'/v1/call', method:'POST', headers:{'Content-Type':'application/json', 'Content-Length':b.length, ...headers}}, r => { r.resume(); r.on('end', () => res(r.statusCode)); });
  req.on('error', e => res('error ' + e.code)); req.end(b);
});

const { app } = await launch('c.pdf');
process.on('exit', () => { try { app.process().kill(); } catch (_) {} });
const win = await app.firstWindow(); win.on('pageerror', e => console.log('PAGEERR', e.message)); win.on('console', m => { if (m.type() === 'error') console.log('C', m.text().slice(0, 300)); });
await win.waitForTimeout(3000);
await win.waitForFunction(() => !!(window.__pdfapp && window.__pdfapp.S.pages.length), null, {timeout:30000});
const Ev = win.evaluate.bind(win);
const answerSave = out => app.evaluate(({ipcMain}, out) => { ipcMain.removeHandler('file:choose-save'); ipcMain.handle('file:choose-save', () => out); }, out);
const openClaude = async () => { await Ev(() => { window.__pdfapp.actions.settings(); }); await win.waitForTimeout(600); await win.click('.set-tabs [data-st="claude"]'); await win.waitForTimeout(500); };
const closeModal = async () => { await win.keyboard.press('Escape'); await win.waitForTimeout(400); };
const status = () => Ev(() => (document.querySelector('#clSt') || {}).textContent || '');

// ---- part 1: the bridge, the extension, the first tools -------------------------------------------------------------
await openClaude();
const st0 = await status();
await win.click('#clOn'); await win.waitForTimeout(800);
const st1 = await status();
check('設定 → Claude: off at first; 允許 on → 「等待 Claude 連線」 with its port', /關閉/.test(st0) && /等待 Claude 連線/.test(st1) && /\d{4,5}/.test(st1), {st0, st1});
const MCPB = path.join(TMP, 'pdf.mcpb'); await answerSave(MCPB);
await win.click('[data-cl="mcpb"]');
for (let k = 0; k < 40 && !fs.existsSync(MCPB); k++) await win.waitForTimeout(250);
const z = fs.existsSync(MCPB) ? unzip(fs.readFileSync(MCPB)) : null, man = z && z['manifest.json'] ? JSON.parse(z['manifest.json'].toString('utf8')) : null;
const tools = z && z['server/tools.json'] ? JSON.parse(z['server/tools.json'].toString('utf8')) : [];
const port = man && man.user_config && man.user_config.port.default, key = man && man.user_config && man.user_config.key.default;
check('〔儲存 Claude 擴充功能…〕: a .mcpb (zip) with manifest.json (0.3, node, ${__dirname}, ${user_config.*}, port and key filled in), the server and its 14 tools',
  !!man && man.manifest_version === '0.3' && man.server.type === 'node' && man.server.entry_point === 'server/index.js' && man.server.mcp_config.command === 'node'
  && man.server.mcp_config.args[0] === '${__dirname}/server/index.js' && man.server.mcp_config.env.PDFE_PORT === '${user_config.port}' && man.server.mcp_config.env.PDFE_KEY === '${user_config.key}'
  && Number.isInteger(port) && /^[0-9a-f]{48}$/.test(key) && man.user_config.key.sensitive === true && !!z['server/index.js'] && tools.length === 14 && man.tools.length === 14 && st1.includes(String(port)),
  {man:man && {...man, user_config:{port, key:key && key.slice(0, 6) + '…'}}, files:z && Object.keys(z)});
await closeModal();
const s = mcp({PDFE_PORT:String(port), PDFE_KEY:key});
const init = await s.request('initialize', {protocolVersion:'2025-06-18', capabilities:{}, clientInfo:{name:'test', version:'1'}});
s.notify('notifications/initialized');
const list = await s.request('tools/list');
check('MCP: initialize (the asked protocol version, tools), tools/list gives the 14 tools with their input schemas',
  init && init.protocolVersion === '2025-06-18' && !!init.capabilities.tools && init.serverInfo.name === 'pdf-workbench' && list && list.tools.length === 14 && list.tools.every(t => t.inputSchema && t.inputSchema.type === 'object'), {init, n:list && list.tools && list.tools.length});
let r = await tool(s, 'pdf_status'); let js = null; try { js = JSON.parse(r.text); } catch (_) {}
const pages = await Ev(() => window.__pdfapp.S.pages.length);
check('pdf_status: the open document (name, pages, page sizes in pt, the current page)', !r.isError && !!js && js.active && js.active.name === 'c.pdf' && js.active.pages === pages && js.active.page_sizes.length === pages && js.active.current_page === 1, r.text.slice(0, 300));
r = await tool(s, 'pdf_read_text', {pages:'1'});
check('pdf_read_text: page 1\'s text', !r.isError && /第 1 頁/.test(r.text) && /Sample/i.test(r.text), r.text.slice(0, 200));
r = await tool(s, 'pdf_go_to_page', {page:2}); await win.waitForTimeout(500);
check('pdf_go_to_page 2: the view goes to page 2', !r.isError && (await Ev(() => window.__pdfapp.S.current)) === 1, r.text);
r = await tool(s, 'pdf_go_to_page', {page:99});
check('pdf_go_to_page 99 (of fewer): an error that says the range', r.isError && new RegExp(`1～${pages}`).test(r.text), r.text);
// the bridge refuses: no key, a wrong key, a request from a web page (Origin)
const noKey = await post(port, {}), badKey = await post(port, {'X-PDFE-Key':'0'.repeat(48)}), web = await post(port, {'X-PDFE-Key':key, Origin:'https://example.com'});
check('the bridge: no key 401, a wrong key 401, a web page (Origin) 403', noKey === 401 && badKey === 401 && web === 403, {noKey, badKey, web});
// a new key: shown in 設定 (to paste into the extension), one click asks first, the second makes it; the old one is refused
await openClaude();
const keyShown = await Ev(() => (document.querySelector('#clKey') || {}).textContent || '');
await win.click('[data-cl="key"]'); await win.waitForTimeout(400);
const stillOld = await post(port, {'X-PDFE-Key':key});
await win.click('[data-cl="key"]'); await win.waitForTimeout(500);
const oldNow = await post(port, {'X-PDFE-Key':key}), keyNew = await Ev(() => (document.querySelector('#clKey') || {}).textContent || '');
r = await tool(s, 'pdf_status');
check('〔重新產生金鑰〕: the key is shown in 設定; the first click only asks, the second makes a new one (shown); the old key is refused, and the extension says how to put the new one in',
  keyShown === key && stillOld === 200 && oldNow === 401 && /^[0-9a-f]{48}$/.test(keyNew) && keyNew !== key && r.isError && /複製新的金鑰/.test(r.text), {keyShown:keyShown.slice(0, 6), stillOld, oldNow, text:r.text});
// 允許 off: the extension cannot reach the program, and says so (no hang)
await win.click('#clOn'); await win.waitForTimeout(800);
const st2 = await status();
r = await tool(s, 'pdf_status');
check('允許 off: 「關閉」; the extension says it cannot reach PDF 工作台', /關閉/.test(st2) && r.isError && /連不上 PDF 工作台/.test(r.text), {st2, text:r.text});
s.close();

// ---- part 2: editing tools -----------------------------------------------------------------------------------------
await openClaude(); await win.click('#clOn'); await win.waitForTimeout(800);
const MCPB2 = path.join(TMP, 'pdf2.mcpb'); await answerSave(MCPB2); await win.click('[data-cl="mcpb"]');
for (let k = 0; k < 40 && !fs.existsSync(MCPB2); k++) await win.waitForTimeout(250);
const man2 = JSON.parse(unzip(fs.readFileSync(MCPB2))['manifest.json'].toString('utf8'));
await closeModal();
const s2 = mcp({PDFE_PORT:String(man2.user_config.port.default), PDFE_KEY:man2.user_config.key.default});
await s2.request('initialize', {protocolVersion:'2025-03-26', capabilities:{}, clientInfo:{name:'test', version:'1'}}); s2.notify('notifications/initialized');
const undos = () => Ev(() => window.__pdfapp.S.undo.length);
const anns = i => Ev(async i => (await window.__pdfapp.getAnns(i)).map(a => ({sub:a.subtype, contents:a.contents})), i);
const pageText = i => Ev(async i => { const S = window.__pdfapp.S, tc = await S.pages[i].page.getTextContent(); return tc.items.map(t => t.str).join(' '); }, i);
r = await tool(s2, 'pdf_find', {query:'Sample'});
check('pdf_find: each place with its page and the words around it', !r.isError && /第 1 頁：/.test(r.text) && /【Sample】/.test(r.text), r.text.slice(0, 200));
let u0 = await undos();
r = await tool(s2, 'pdf_replace', {query:'Sample', replacement:'Example', pages:'1'}); await win.waitForTimeout(1500);
const t1 = await pageText(0);
check('pdf_replace (page 1): the page\'s own text changed, in one undo step', !r.isError && /已把「Sample」取代成「Example」/.test(r.text) && /Example/.test(t1) && !/Sample/.test(t1) && (await undos()) === u0 + 1, {text:r.text, t1:t1.slice(0, 120)});
u0 = await undos();
r = await tool(s2, 'pdf_highlight', {query:'Example', color:'#74c0fc'}); await win.waitForTimeout(1200);
const hl = (await anns(0)).filter(a => a.sub === 'Highlight');
check('pdf_highlight: the found text is marked (one undo step)', !r.isError && hl.length >= 1 && (await undos()) === u0 + 1, {text:r.text, hl:hl.length});
u0 = await undos();
r = await tool(s2, 'pdf_add_text', {page:1, x:72, y:300, text:'Claude 加的字\n第二行', size:14, color:'#e03131', bold:true}); await win.waitForTimeout(1500);
const ft = (await anns(0)).filter(a => a.sub === 'FreeText');
check('pdf_add_text: a text box with that text on page 1 (one undo step)', !r.isError && ft.some(a => a.contents === 'Claude 加的字\n第二行') && (await undos()) === u0 + 1, {text:r.text, ft});
r = await tool(s2, 'pdf_add_note', {page:2, x:100, y:120, text:'請確認這一段'}); await win.waitForTimeout(1500);
const nt = (await anns(1)).filter(a => a.sub === 'Text');
check('pdf_add_note: a sticky note with that text on page 2', !r.isError && nt.some(a => a.contents === '請確認這一段'), {text:r.text, nt});
const u1 = await undos();
r = await tool(s2, 'pdf_undo'); await win.waitForTimeout(1500);
check('pdf_undo: the last change (the note) goes', !r.isError && (await undos()) === u1 - 1 && !(await anns(1)).some(a => a.sub === 'Text'), r.text);
// busy (a window open) and a wrong page: an error, nothing changed
await Ev(() => { window.__pdfapp.actions.settings(); }); await win.waitForTimeout(600);
u0 = await undos();
r = await tool(s2, 'pdf_add_text', {page:1, x:72, y:400, text:'不該出現'});
const busyOk = r.isError && /正在忙/.test(r.text) && (await undos()) === u0;
await closeModal();
r = await tool(s2, 'pdf_add_note', {page:99, x:10, y:10, text:'x'});
check('a window open: 「PDF 工作台正在忙」 and nothing added; page 99: an error that says the range, nothing added', busyOk && r.isError && /1～\d/.test(r.text) && (await undos()) === u0, {busyOk, text:r.text});
s2.close();

// ---- part 3: pages, opening a file, 另存新檔, no document ------------------------------------------------------------
const s3 = mcp({PDFE_PORT:String(man2.user_config.port.default), PDFE_KEY:man2.user_config.key.default});
await s3.request('initialize', {protocolVersion:'2024-11-05', capabilities:{}, clientInfo:{name:'test', version:'1'}}); s3.notify('notifications/initialized');
const n0 = await Ev(() => window.__pdfapp.S.pages.length);
r = await tool(s3, 'pdf_rotate_pages', {pages:'1', degrees:90}); await win.waitForTimeout(1200);
check('pdf_rotate_pages 1 by 90°: page 1 turned', !r.isError && (await Ev(() => window.__pdfapp.S.pages[0].rot)) === 90, r.text);
r = await tool(s3, 'pdf_insert_blank_page', {after:1}); await win.waitForTimeout(1200);
const sz = await Ev(() => window.__pdfapp.S.pages.slice(0, 2).map(p => [Math.round(p.w), Math.round(p.h)]));
check('pdf_insert_blank_page after 1: one page more, page 2 as large and turned as page 1', !r.isError && (await Ev(() => window.__pdfapp.S.pages.length)) === n0 + 1 && JSON.stringify(sz[0]) === JSON.stringify(sz[1]), {text:r.text, sz});
r = await tool(s3, 'pdf_delete_pages', {pages:'2'}); await win.waitForTimeout(1200);
const nAfter = await Ev(() => window.__pdfapp.S.pages.length);
const all = await tool(s3, 'pdf_delete_pages', {pages:`1-${nAfter}`});
check('pdf_delete_pages 2: one page fewer; deleting every page: refused', !r.isError && nAfter === n0 && all.isError && /至少要留一頁/.test(all.text) && (await Ev(() => window.__pdfapp.S.pages.length)) === n0, {text:r.text, all:all.text});
await app.evaluate(({ipcMain}, dir) => { global.__saved = null; ipcMain.removeHandler('file:save-as'); ipcMain.handle('file:save-as', (_e, name, data) => { global.__saved = {name, head:Buffer.from(data).subarray(0, 5).toString('latin1')}; return dir + '/c_已編輯.pdf'; }); }, TMP);
r = await tool(s3, 'pdf_save_as');
const saved = await app.evaluate(() => global.__saved);
check('pdf_save_as: the 另存新檔 window gets the document (a PDF), and the answer names the new file', !r.isError && !!saved && saved.head === '%PDF-' && /c_已編輯\.pdf/.test(r.text), {text:r.text, saved});
// no document: every tab closed (without saving)
for (let k = 0; k < 4 && (await Ev(() => document.querySelectorAll('.dtab').length)) > 0; k++) {
  await win.keyboard.press('Control+W'); await win.waitForTimeout(600);
  if (await Ev(() => document.querySelector('#mask').classList.contains('show'))) { await win.click('#modal button:has-text("不儲存並關閉")'); await win.waitForTimeout(800); }
}
r = await tool(s3, 'pdf_status');
const r2 = await tool(s3, 'pdf_read_text', {});
check('no document open: pdf_status says so, and a reading tool says to open one first', !r.isError && /沒有開啟的文件/.test(r.text) && r2.isError && /pdf_open/.test(r2.text), {text:r.text, r2:r2.text});
const OTHER = path.join(TMP, '另一份 文件.pdf'); fs.copyFileSync(path.join(ROOT, 'tests', 'e2e', 'fixtures', 'sample.pdf'), OTHER);
r = await tool(s3, 'pdf_open', {path:OTHER}); await win.waitForTimeout(1500);
const st3 = await tool(s3, 'pdf_status'); let j3 = null; try { j3 = JSON.parse(st3.text); } catch (_) {}
const bad1 = await tool(s3, 'pdf_open', {path:path.join(TMP, 'notes.txt')}), bad2 = await tool(s3, 'pdf_open', {path:path.join(TMP, 'missing.pdf')});
check('pdf_open: a PDF by its path (Chinese and a space in it) opens and becomes the current document; not a .pdf, or no such file: an error',
  !r.isError && !!j3 && j3.active && j3.active.name === '另一份 文件.pdf' && bad1.isError && /\.pdf/.test(bad1.text) && bad2.isError && /讀不到/.test(bad2.text), {text:r.text, active:j3 && j3.active && j3.active.name, bad1:bad1.text, bad2:bad2.text});
s3.close();

// ---- part 4 (final review): changes that do not happen, calls at once, a slow 另存新檔, page ranges, paths, the port ---
const s4 = mcp({PDFE_PORT:String(man2.user_config.port.default), PDFE_KEY:man2.user_config.key.default});
await s4.request('initialize', {protocolVersion:'2025-06-18', capabilities:{}, clientInfo:{name:'test', version:'1'}}); s4.notify('notifications/initialized');
const npages = () => Ev(() => window.__pdfapp.S.pages.length);
// a change the person declines (a signed document asks first): Claude is told, nothing changed
await Ev(() => { window.__pdfapp.S.signed = true; });
const n4 = await npages();
const pDel = tool(s4, 'pdf_delete_pages', {pages:'2'});
await win.waitForFunction(() => document.querySelector('#mask').classList.contains('show'), null, {timeout:15000});
await win.click('#modal button:has-text("取消")');
r = await pDel;
await Ev(() => { window.__pdfapp.S.signed = false; });
check('a change the person declines (a signed document): Claude is told it did not happen, and nothing changed', r.isError && /取消/.test(r.text) && (await npages()) === n4, r.text);
// two calls at once: one after the other, both carried out
const [a1, a2] = await Promise.all([tool(s4, 'pdf_add_note', {page:1, x:50, y:50, text:'第一張'}), tool(s4, 'pdf_add_note', {page:1, x:50, y:120, text:'第二張'})]);
await win.waitForTimeout(1000);
const notes4 = (await anns(0)).filter(a => a.sub === 'Text').map(a => a.contents);
check('two calls at once: one after the other, both carried out', !a1.isError && !a2.isError && notes4.includes('第一張') && notes4.includes('第二張'), {notes4, a1:a1.text, a2:a2.text});
// a 另存新檔 window that stays open: Claude is told; a change meanwhile is refused as busy; once it closes, changes work
await app.evaluate(({ipcMain}, dir) => { ipcMain.removeHandler('file:save-as'); ipcMain.handle('file:save-as', () => new Promise(res => setTimeout(() => res(dir + '/slow_已編輯.pdf'), 4000))); }, TMP);
await Ev(() => window.__pdfapp.claudeSaveWait(800));   // (the tool answers after 0.8 s here instead of 150 s)
r = await tool(s4, 'pdf_save_as');
const during = await tool(s4, 'pdf_add_text', {page:1, x:72, y:500, text:'存檔中加的字'});
await win.waitForTimeout(4500);
const later = await tool(s4, 'pdf_add_text', {page:1, x:72, y:520, text:'存好之後加的字'});
check('a 另存新檔 window still open: Claude is told so, a change meanwhile is refused as busy; after it closes changes work again',
  /還沒有選好位置/.test(r.text) && during.isError && /正在忙/.test(during.text) && !later.isError, {r:r.text, during:during.text, later:later.text});
// page ranges reaching past the last page, or huge: an error at once, nothing changed
const n5 = await npages(), t0 = Date.now();
const e1 = await tool(s4, 'pdf_delete_pages', {pages:`${n5 - 1}-${n5 + 3}`}), e2 = await tool(s4, 'pdf_delete_pages', {pages:`2, ${n5 + 50}`}), e3 = await tool(s4, 'pdf_rotate_pages', {pages:'1-99999999999', degrees:90});
check('page ranges reaching past the last page, or huge: an error that says the range, at once, nothing changed',
  [e1, e2, e3].every(e => e.isError && /1～\d+/.test(e.text)) && Date.now() - t0 < 10000 && (await npages()) === n5, {e1:e1.text, e2:e2.text, e3:e3.text, ms:Date.now() - t0});
// pdf_open: only a full path on this computer
const p1 = await tool(s4, 'pdf_open', {path:'\\\\attacker-host\\share\\x.pdf'}), p2 = await tool(s4, 'pdf_open', {path:'//attacker-host/share/x.pdf'}), p3 = await tool(s4, 'pdf_open', {path:'relative/x.pdf'});
check('pdf_open refuses a network share and a relative path', [p1, p2, p3].every(u => u.isError && /完整路徑/.test(u.text)), [p1.text, p2.text, p3.text]);
s4.close();
// the port that was free is remembered, so the installed extension still finds the program after a restart
const profFile = path.join(TMP, 'profile', 'claude.json'), prof = JSON.parse(fs.readFileSync(profFile, 'utf8'));
await openClaude(); await win.click('#clOn'); await win.waitForTimeout(800);   // off
const blocker = net.createServer(); await new Promise(res => blocker.listen(prof.port, '127.0.0.1', res));
await win.click('#clOn'); await win.waitForTimeout(1000);   // on again: that port is taken
const prof2 = JSON.parse(fs.readFileSync(profFile, 'utf8')), st6 = await status();
blocker.close(); await closeModal();
check('its port taken: the next one is used, shown and remembered', prof2.port === prof.port + 1 && st6.includes(String(prof.port + 1)), {before:prof.port, after:prof2.port, st6});

// ---- part 5 (v1.0.47): the small things left over ------------------------------------------------------------------------
await Ev(() => { window.__toasts = []; new MutationObserver(ms => ms.forEach(m => m.addedNodes.forEach(n => n.classList && n.classList.contains('toast') && window.__toasts.push(n.textContent))))
  .observe(document.querySelector('#toasts'), {childList:true}); });
const toasts = () => Ev(() => window.__toasts.splice(0));
const prof5 = JSON.parse(fs.readFileSync(profFile, 'utf8'));
const s5 = mcp({PDFE_PORT:String(prof5.port), PDFE_KEY:prof5.key});
await s5.request('initialize', {protocolVersion:'2025-06-18', capabilities:{}, clientInfo:{name:'test', version:'1'}});
check('claude.json (it holds the key) can be read only by its owner', (fs.statSync(profFile).mode & 0o777) === 0o600, (fs.statSync(profFile).mode & 0o777).toString(8));
const evilHost = await post(prof5.port, {'X-PDFE-Key':prof5.key, Host:'evil.example.com'});
check('a request whose Host is not this computer is refused (403)', evilHost === 403, evilHost);
const batch = await s5.raw(JSON.stringify([{jsonrpc:'2.0', id:91, method:'ping'}]));
check('a JSON-RPC batch is answered: -32600, batches are not supported', !!(batch && batch.error && batch.error.code === -32600), batch);
const list5 = await s5.request('tools/list'), ann = n => ((list5.tools || []).find(t => t.name === n) || {}).annotations || {};
check('the tools say what they do (for Claude Desktop\'s permission prompts): reading is read-only, replacing and deleting are destructive',
  ['pdf_status', 'pdf_read_text', 'pdf_find'].every(n => ann(n).readOnlyHint === true) && ann('pdf_add_note').readOnlyHint === false && ann('pdf_add_note').destructiveHint === false
  && ann('pdf_delete_pages').destructiveHint === true && ann('pdf_replace').destructiveHint === true, {status:ann('pdf_status'), del:ann('pdf_delete_pages'), note:ann('pdf_add_note')});
// the settings pane follows Claude's calls while it is open
await openClaude();
await tool(s5, 'pdf_status'); await win.waitForTimeout(2800);
const st7 = await status(); await closeModal();
check('設定 → Claude, left open: after a call it says Claude is connected, without being reopened', st7.includes('已連線'), st7);
// a document whose second page holds hidden (scan) text only
const SCANS = path.join(TMP, 'scan words.pdf');
{
  const d = await PDFDocument.create(), f = await d.embedFont(StandardFonts.Helvetica);
  d.addPage([595, 842]).drawText('Hello visible', {x:72, y:700, size:24, font:f});
  const p2 = d.addPage([595, 842]), fk = p2.node.newFontDictionary(f.name, f.ref);
  p2.pushOperators(beginText(), setFontAndSize(fk, 24), setTextRenderingMode(TextRenderingMode.Invisible), moveText(72, 700), showText(f.encodeText('Hello hidden')), endText());
  fs.writeFileSync(SCANS, await d.save());
}
let o5 = await tool(s5, 'pdf_open', {path:SCANS}); await toasts();
let r5 = await tool(s5, 'pdf_replace', {query:'Hello', replacement:'World'});
let t5 = await toasts();
check('pdf_replace on a page with scan text: says only the pages done and how many scan places were skipped; the notice starts with 「Claude：」',
  !r5.isError && /第 1 頁/.test(r5.text) && !/第 1、2 頁/.test(r5.text) && /跳過/.test(r5.text) && t5.some(x => x.startsWith('Claude：已取代')), {open:o5.text, r:r5.text, t5});
let u5 = await tool(s5, 'pdf_undo'); t5 = await toasts();
check('pdf_undo of Claude\'s change: says what was undone; the notice starts with 「Claude：」', !u5.isError && /已取代/.test(u5.text) && t5.some(x => x.startsWith('Claude：已復原')), {u:u5.text, t5});
// the person's own change is not undone by Claude
await win.click('[data-view="single"]'); await win.waitForTimeout(400);
await Ev(() => window.__pdfapp.setTool('rect')); await win.waitForTimeout(300);
{ const box = await win.locator('.page').first().boundingBox();
  await win.mouse.move(box.x + 120, box.y + 120); await win.mouse.down(); await win.mouse.move(box.x + 260, box.y + 220, {steps:5}); await win.mouse.up(); await win.waitForTimeout(2200); }
await Ev(() => window.__pdfapp.setTool('select'));
const uMine = await undos(), u6 = await tool(s5, 'pdf_undo');
check('pdf_undo when the last change was the person\'s own: not undone, and Claude is told why', !u6.isError && /使用者/.test(u6.text) && (await undos()) === uMine, {u:u6.text, before:uMine, after:await undos()});
// a long text wraps at the page's right edge
const w5 = await tool(s5, 'pdf_add_text', {page:1, x:300, y:400, size:14, text:'This is a fairly long sentence that would run far past the right edge of the page if it were not wrapped onto more lines.'});
const ft5 = (await Ev(async () => (await window.__pdfapp.getAnns(0)).filter(a => a.subtype === 'FreeText').map(a => ({x:a.x, y:a.y, w:a.w, h:a.h})))).pop(), pw5 = await Ev(() => window.__pdfapp.S.pages[0].w);
check('pdf_add_text with a long line: wrapped to stay on the page (several lines, within the right edge)', !w5.isError && !!ft5 && ft5.x + ft5.w <= pw5 + 0.5 && ft5.h > 14 * 2.5, {w:w5.text, ft5, pw5});
const neg = await tool(s5, 'pdf_add_text', {page:1, x:-5, y:40, text:'x'}), empty = await tool(s5, 'pdf_add_text', {page:1, x:5, y:40, text:'   '});
check('pdf_add_text with a negative x, or nothing to write: an error, nothing added', neg.isError && /0 以上/.test(neg.text) && empty.isError, {neg:neg.text, empty:empty.text});
// pdf_go_to_page while the person is typing in a text box: refused as busy
await Ev(() => window.__pdfapp.setTool('textbox')); await win.waitForTimeout(300);
{ const bx = await Ev(() => { const r = window.__pdfapp.S.els[window.__pdfapp.S.current].getBoundingClientRect(); return [r.left + 200, r.top + 520]; });
  await win.mouse.click(...bx); await win.waitForTimeout(600); await win.keyboard.type('typing'); }
const g5 = await tool(s5, 'pdf_go_to_page', {page:2}), tbe5 = !!(await Ev(() => window.__pdfapp.TBE()));
await win.keyboard.press('Escape'); await win.waitForTimeout(500); await Ev(() => window.__pdfapp.setTool('select'));
check('pdf_go_to_page while a text box is being typed in: refused as busy', tbe5 && g5.isError && /正在忙/.test(g5.text), {g:g5.text, tbe5});
// pdf_open: a file that needs a password, and a broken file named like an open one
const LOCKED = path.join(TMP, 'locked.pdf'); fs.copyFileSync(path.join(ROOT, 'tests', 'e2e', 'fixtures', 'encrypted', 'r6-userpw.pdf'), LOCKED);
const pw = await tool(s5, 'pdf_open', {path:LOCKED});
check('pdf_open of a PDF that needs a password: says so', pw.isError && /密碼/.test(pw.text), pw.text);
await tool(s5, 'pdf_open', {path:OTHER});   // (its tab is the current one now)
fs.mkdirSync(path.join(TMP, 'other'), {recursive:true}); const SAME = path.join(TMP, 'other', path.basename(OTHER)); fs.writeFileSync(SAME, '%PDF-1.7\nnot really a pdf');
const sm = await tool(s5, 'pdf_open', {path:SAME});
check('pdf_open of a broken file named like the current document: an error, not 「已開啟」', sm.isError, sm.text);
// a call still waiting when the window reloads is answered at once
await app.evaluate(({ipcMain, dialog}) => { ipcMain.removeHandler('file:save-as'); ipcMain.handle('file:save-as', () => new Promise(() => {}));
  dialog.showMessageBoxSync = () => 0; });   // (the document has changes: 「不儲存並關閉」 lets the page reload)
await Ev(() => window.__pdfapp.claudeSaveWait(60000));
const tReload = Date.now(), pend = tool(s5, 'pdf_save_as');
await win.waitForTimeout(1500);
await win.reload().catch(() => {});
const rp = await Promise.race([pend, new Promise(res => setTimeout(() => res({text:'(no answer in 20 s)', isError:true, late:true}), 20000))]);
check('a call still waiting when the window reloads: answered at once with an error', rp.isError && !rp.late && Date.now() - tReload < 15000 && /重新載入/.test(rp.text), {r:rp.text, ms:Date.now() - tReload});
s5.close();

console.log(failed ? `\n${failed} check(s) failed` : '\nall checks passed');
await app.evaluate(({app}) => app.exit(0)).catch(() => {});
