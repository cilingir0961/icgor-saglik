// İçGör HTTP uygulaması (bağımlılıksız): statik dosyalar + AI API.
//   GET  /api/ai/status  → sağlayıcı durumu (demo/gerçek), sınırlar — gizli bilgi içermez
//   POST /api/chat       → sohbet yanıtı (yalnızca aynı köken, JSON, boyut sınırlı)
// Statik sunumda gizli dosyalar (.env, .git vb.), node_modules ve server/data ASLA sunulmaz.

import { readFile } from 'node:fs/promises';
import { extname, join, resolve, sep } from 'node:path';
import { createChat } from './ai/chat.mjs';
import { publicStatus } from './ai/config.mjs';

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css',
  '.png': 'image/png', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml', '.json': 'application/json',
  '.glb': 'model/gltf-binary', '.wasm': 'application/wasm', '.task': 'application/octet-stream', '.md': 'text/markdown',
  '.webm': 'video/webm',
};

/**
 * @param {{root:string, cfg:object, allowCache?:boolean, fetchImpl?:Function}} o allowCache: .cache/ sunulur (yalnızca test)
 */
export function createApp({ root, cfg, allowCache = false, fetchImpl }) {
  const ROOT = resolve(root);
  const chat = createChat(cfg, { fetchImpl });

  function forbidden(rel) {
    const parts = rel.split('/').filter(Boolean);
    if (parts.some((p) => p.startsWith('.') && !(allowCache && p === '.cache'))) return true;
    if (parts[0] === 'node_modules' || (parts[0] === 'server' && parts[1] === 'data')) return true;
    return false;
  }

  async function serveStatic(req, res, url) {
    if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, 'text/plain', 'Yöntem desteklenmiyor');
    let rel;
    try { rel = decodeURIComponent(url.pathname); } catch { return send(res, 400, 'text/plain', 'Geçersiz adres'); }
    const path = resolve(join(ROOT, rel));
    if (path !== ROOT && !path.startsWith(ROOT + sep)) return send(res, 403, 'text/plain', 'Yasak');
    if (forbidden(rel)) return send(res, 404, 'text/plain', 'Bulunamadı');
    try {
      const file = rel.endsWith('/') ? join(path, 'index.html') : path;
      const body = await readFile(file);
      res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream', 'x-content-type-options': 'nosniff' });
      res.end(req.method === 'HEAD' ? undefined : body);
    } catch {
      send(res, 404, 'text/plain', 'Bulunamadı');
    }
  }

  async function api(req, res, url) {
    if (url.pathname === '/api/ai/status' && req.method === 'GET') return json(res, 200, publicStatus(cfg));
    if (url.pathname !== '/api/chat') return json(res, 404, { error: 'Bulunamadı' });
    if (req.method !== 'POST') return json(res, 405, { error: 'Yöntem desteklenmiyor' });
    // Yalnızca aynı köken: tarayıcı kökeni sunucu adresiyle eşleşmeli (CORS başlığı verilmez)
    const origin = req.headers.origin;
    if (origin && origin !== `http://${req.headers.host}` && origin !== `https://${req.headers.host}`) return json(res, 403, { error: 'Köken reddedildi' });
    if (req.headers['sec-fetch-site'] === 'cross-site') return json(res, 403, { error: 'Köken reddedildi' });
    if (!String(req.headers['content-type'] ?? '').startsWith('application/json')) return json(res, 415, { error: 'JSON bekleniyor' });
    let size = 0;
    const chunks = [];
    for await (const c of req) {
      size += c.length;
      if (size > cfg.limits.bodyBytes) return json(res, 413, { error: 'İstek çok büyük' });
      chunks.push(c);
    }
    let payload;
    try { payload = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { return json(res, 400, { error: 'Geçersiz JSON' }); }
    try {
      const out = await chat.handle(payload, { ip: req.socket.remoteAddress ?? '' });
      if (out.body.retryAfterS) res.setHeader('retry-after', String(out.body.retryAfterS));
      return json(res, out.status, out.body);
    } catch {
      return json(res, 500, { error: 'Beklenmeyen hata' }); // ayrıntı sızdırılmaz
    }
  }

  const handler = async (req, res) => {
    const url = new URL(req.url, 'http://yerel');
    if (url.pathname.startsWith('/api/')) return api(req, res, url);
    return serveStatic(req, res, url);
  };
  handler.chat = chat;
  return handler;
}

function send(res, status, type, text) {
  res.writeHead(status, { 'content-type': `${type}; charset=utf-8`, 'x-content-type-options': 'nosniff' });
  res.end(text);
}

function json(res, status, obj) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' });
  res.end(JSON.stringify(obj));
}
