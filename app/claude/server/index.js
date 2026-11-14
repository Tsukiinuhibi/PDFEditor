#!/usr/bin/env node
'use strict';
/*
 * PDF 工作台 for Claude: an MCP server (stdio; JSON-RPC 2.0, one message per line). Claude Desktop runs it with its own
 * Node from the installed .mcpb (PDF 工作台 → 設定 → Claude → 儲存 Claude 擴充功能). Each tool call is carried out by
 * PDF 工作台 over its local bridge: POST http://127.0.0.1:PDFE_PORT/v1/call {tool, args}, the key in X-PDFE-Key.
 * No dependencies: Node's own http only.
 */
const http = require('http');
const TOOLS = require('./tools.json');

const VERSION = '1.0.0';
const PORT = parseInt(process.env.PDFE_PORT, 10) || 0, KEY = String(process.env.PDFE_KEY || '');
const PROTOCOLS = ['2025-06-18', '2025-03-26', '2024-11-05'];
const AGAIN = '請在 PDF 工作台的「設定 → Claude」按〔儲存 Claude 擴充功能…〕，再安裝一次存出來的檔案。';

// one call to PDF 工作台 → {text} | {error}
function call(tool, args){
  return new Promise(resolve => {
    if (!PORT || !KEY) return resolve({ error: '擴充功能沒有 PDF 工作台的連接埠或金鑰。' + AGAIN });
    const body = Buffer.from(JSON.stringify({ tool, args }));
    const req = http.request({ host: '127.0.0.1', port: PORT, path: '/v1/call', method: 'POST', timeout: 180000,
      headers: { 'Content-Type': 'application/json', 'Content-Length': body.length, 'X-PDFE-Key': KEY } }, res => {
      const parts = [];
      res.on('data', d => parts.push(d));
      res.on('end', () => {
        let j = null; try { j = JSON.parse(Buffer.concat(parts).toString('utf8')); } catch (_) {}
        if (res.statusCode === 401) return resolve({ error: 'PDF 工作台拒絕了連線：金鑰不對（可能在 PDF 工作台重新產生過金鑰）。請在 PDF 工作台的「設定 → Claude」複製新的金鑰，貼到 Claude 的「設定 → 擴充功能 → PDF 工作台」的連線金鑰；或移除這個擴充功能，再重新儲存並安裝。' });
        if (res.statusCode !== 200 || !j) return resolve({ error: (j && j.error) || `PDF 工作台回應錯誤（${res.statusCode}）` });
        resolve(j);
      });
    });
    req.on('timeout', () => req.destroy(new Error('timeout')));
    req.on('error', e => resolve({ error: e && e.message === 'timeout' ? 'PDF 工作台太久沒有回應（它可能正在等使用者處理某個視窗）。'
      : '連不上 PDF 工作台：請確認 PDF 工作台開著，而且「設定 → Claude」裡的「允許 Claude 使用 PDF 工作台」是打開的。' }));
    req.end(body);
  });
}

const send = m => process.stdout.write(JSON.stringify(m) + '\n');
async function handle(m){
  const { id, method, params } = m, has = id !== undefined && id !== null;
  if (method === 'initialize') {
    const want = params && params.protocolVersion;
    return send({ jsonrpc: '2.0', id, result: { protocolVersion: PROTOCOLS.includes(want) ? want : PROTOCOLS[0], capabilities: { tools: {} }, serverInfo: { name: 'pdf-workbench', version: VERSION } } });
  }
  if (method === 'tools/list') return send({ jsonrpc: '2.0', id, result: { tools: TOOLS } });
  if (method === 'tools/call') {
    const name = params && params.name, args = (params && params.arguments) || {};
    if (!TOOLS.some(t => t.name === name)) return send({ jsonrpc: '2.0', id, error: { code: -32602, message: 'Unknown tool: ' + name } });
    const r = await call(name, args);
    return send({ jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: r.error ? String(r.error) : String(r.text) }], isError: !!r.error } });
  }
  if (method === 'ping') return send({ jsonrpc: '2.0', id, result: {} });
  if (has) send({ jsonrpc: '2.0', id, error: { code: -32601, message: 'Method not found: ' + method } });   // (notifications get no answer)
}

let buf = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', chunk => {
  buf += chunk;
  for (let k; (k = buf.indexOf('\n')) >= 0;) {
    const line = buf.slice(0, k).trim(); buf = buf.slice(k + 1);
    if (!line) continue;
    let m; try { m = JSON.parse(line); } catch (_) { send({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } }); continue; }
    handle(m).catch(e => { if (m && m.id != null) send({ jsonrpc: '2.0', id: m.id, error: { code: -32603, message: String((e && e.message) || e) } }); });
  }
});
process.stdin.on('end', () => process.exit(0));
