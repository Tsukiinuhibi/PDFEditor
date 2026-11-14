'use strict';
/*
 * Claude 增益集 (main process): the local bridge Claude Desktop's extension talks to. It listens on 127.0.0.1 only and
 * takes POST /v1/call {tool, args} with the key in X-PDFE-Key; a request from a web page (it carries Origin) or with
 * another Host is refused, so a page in a browser cannot reach it. handle(tool, args) → {text} | {error} carries the
 * call out (main.js passes it to the page). Settings live in userData/claude.json: {enabled, key, port}.
 */
const http = require('http');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');

const DEFAULT_PORT = 47613;
const newKey = () => crypto.randomBytes(24).toString('hex');
function loadSettings(file){
  try {
    const j = JSON.parse(fs.readFileSync(file, 'utf8'));
    return { enabled: !!j.enabled, key: typeof j.key === 'string' && /^[0-9a-f]{48}$/.test(j.key) ? j.key : newKey(), port: Number.isInteger(j.port) && j.port >= 1024 && j.port < 65526 ? j.port : DEFAULT_PORT };
  } catch (_) { return { enabled: false, key: newKey(), port: DEFAULT_PORT }; }
}
// (it holds the key: readable by the owner only — 0o600 also on a file an older version made)
function saveSettings(file, s){
  try { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, JSON.stringify(s), { mode: 0o600 }); fs.chmodSync(file, 0o600); } catch (_) {}
}
// keys compared without giving away, by the time it takes, how much of one matched
const sameKey = (a, b) => { const x = Buffer.from(String(a || '')), y = Buffer.from(String(b || '')); return x.length === y.length && x.length > 0 && crypto.timingSafeEqual(x, y); };

// the bridge: start(port) listens on the port or one of the next nine; stop()
function createBridge({ getKey, handle, onCall = () => {} }){
  let server = null, port = 0;
  const reply = (res, code, obj) => { const b = Buffer.from(JSON.stringify(obj)); res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': b.length }); res.end(b); };
  const onRequest = (req, res) => {
    if (req.headers.origin) return reply(res, 403, { error: '不接受從網頁來的請求' });
    if (!/^(127\.0\.0\.1|localhost)(:\d+)?$/i.test(String(req.headers.host || ''))) return reply(res, 403, { error: '不接受這個位址' });
    if (!sameKey(req.headers['x-pdfe-key'], getKey())) return reply(res, 401, { error: '金鑰不對' });
    if (req.method !== 'POST' || req.url !== '/v1/call') return reply(res, 404, { error: '沒有這個位址' });
    const parts = []; let size = 0, big = false;
    req.on('data', d => { size += d.length; if (size > (1 << 20)) big = true; else parts.push(d); });
    req.on('end', async () => {
      if (big) return reply(res, 413, { error: '請求太大' });
      let j = null; try { j = JSON.parse(Buffer.concat(parts).toString('utf8')); } catch (_) {}
      if (!j || typeof j.tool !== 'string') return reply(res, 400, { error: '請求的格式不對' });
      onCall(j.tool);
      let r; try { r = await handle(j.tool, j.args && typeof j.args === 'object' ? j.args : {}); } catch (e) { r = { error: String((e && e.message) || e) }; }
      reply(res, 200, r && (typeof r.text === 'string' || r.error) ? r : { error: '沒有結果' });
    });
  };
  return {
    get port(){ return port; },
    async start(want){
      await this.stop();
      for (let p = want; p < want + 10; p++) {
        const s = http.createServer(onRequest);
        const ok = await new Promise(res => { s.once('error', () => res(false)); s.listen(p, '127.0.0.1', () => res(true)); });
        if (ok) { server = s; port = p; return p; }
      }
      return 0;
    },
    stop(){
      return new Promise(res => { if (!server) return res(); const s = server; server = null; port = 0; s.close(() => res()); if (s.closeAllConnections) s.closeAllConnections(); });
    },
  };
}

module.exports = { createBridge, loadSettings, saveSettings, newKey, sameKey, DEFAULT_PORT };
