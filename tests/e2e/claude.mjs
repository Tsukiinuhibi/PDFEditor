// Claude 增益集: in 設定 → Claude the program opens a local bridge (127.0.0.1, a key) and saves a Claude Desktop extension
// (.mcpb) with the port and key in it. Claude Desktop runs the extension's MCP server (app/claude/server/index.js) with its
// own Node; here the test runs it the same way and talks MCP (JSON-RPC over stdio) to it, against the real app.
import { launch, TMP, ROOT } from './_env.mjs';
import { spawn } from 'child_process';
import zlib from 'zlib';
import http from 'http';
import fs from 'fs';
import path from 'path';

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
  let buf = '', seq = 0; const wait = new Map();
  ch.stdout.setEncoding('utf8');
  ch.stdout.on('data', d => { buf += d; let k; while ((k = buf.indexOf('\n')) >= 0) { const line = buf.slice(0, k); buf = buf.slice(k + 1); if (!line.trim()) continue; const m = JSON.parse(line); const f = wait.get(m.id); if (f) { wait.delete(m.id); f(m); } } });
  return {
    request:(method, params = {}) => new Promise(res => { const id = ++seq; wait.set(id, m => res(m.error ? {error:m.error} : m.result)); ch.stdin.write(JSON.stringify({jsonrpc:'2.0', id, method, params}) + '\n'); setTimeout(() => { if (wait.has(id)) { wait.delete(id); res({error:'timeout'}); } }, 60000); }),
    notify:(method, params = {}) => ch.stdin.write(JSON.stringify({jsonrpc:'2.0', method, params}) + '\n'),
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
// a new key: the old one is refused, also through the extension
await openClaude(); await win.click('[data-cl="key"]'); await win.waitForTimeout(500);
const oldNow = await post(port, {'X-PDFE-Key':key});
r = await tool(s, 'pdf_status');
check('〔重新產生金鑰〕: the old key is refused, and the extension says to save and install it again', oldNow === 401 && r.isError && /金鑰/.test(r.text), {oldNow, text:r.text});
// 允許 off: the extension cannot reach the program, and says so (no hang)
await win.click('#clOn'); await win.waitForTimeout(800);
const st2 = await status();
r = await tool(s, 'pdf_status');
check('允許 off: 「關閉」; the extension says it cannot reach PDF 工作台', /關閉/.test(st2) && r.isError && /連不上 PDF 工作台/.test(r.text), {st2, text:r.text});
s.close();

console.log(failed ? `\n${failed} check(s) failed` : '\nall checks passed');
await app.evaluate(({app}) => app.exit(0)).catch(() => {});
