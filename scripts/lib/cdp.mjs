// Bağımlılıksız Chromium sürücüsü (Chrome DevTools Protokolü) + yerel statik sunucu.
// Tarayıcı testleri, görsel regresyon ve ekran görüntüsü araçları bunu paylaşır.

import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { existsSync, mkdtempSync } from 'node:fs';
import { extname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';

export const ROOT = resolve(import.meta.dirname, '../..');
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css',
  '.png': 'image/png', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml', '.json': 'application/json', '.glb': 'model/gltf-binary',
  '.wasm': 'application/wasm', '.task': 'application/octet-stream', '.md': 'text/markdown',
};
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function serve(root = ROOT) {
  const server = createServer(async (req, res) => {
    const path = join(root, decodeURIComponent(new URL(req.url, 'http://x').pathname));
    if (!path.startsWith(root)) return res.writeHead(403).end();
    try {
      const body = await readFile(path.endsWith('/') ? join(path, 'index.html') : path);
      res.writeHead(200, { 'content-type': TYPES[extname(path)] ?? 'application/octet-stream' }).end(body);
    } catch {
      res.writeHead(404).end();
    }
  });
  return new Promise((r) => server.listen(0, '127.0.0.1', () => r(server)));
}

export async function launchChrome({ fakeVideo, extraArgs = [] } = {}) {
  const chrome = process.env.CHROME ?? ['/usr/bin/chromium', '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'].find(existsSync);
  const args = [
    '--headless=new', '--no-sandbox', '--remote-debugging-port=0',
    // WebGL için yazılım GPU (SwiftShader): deterministik görsel test.
    '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist',
    '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream',
    ...(fakeVideo ? [`--use-file-for-fake-video-capture=${fakeVideo}`] : []),
    // Tarayıcının kendi arka plan ağ trafiğini kapat: test tamamen çevrimdışı.
    '--disable-background-networking', '--disable-component-update', '--disable-sync',
    '--disable-default-apps', '--no-first-run', '--disable-domain-reliability', '--hide-scrollbars',
    '--no-pings', '--disable-client-side-phishing-detection', '--safebrowsing-disable-auto-update',
    '--disable-features=OptimizationHints,MediaRouter,Translate,AutofillServerCommunication,CertificateTransparencyComponentUpdater',
    '--force-color-profile=srgb', '--font-render-hinting=none',
    `--user-data-dir=${mkdtempSync(join(tmpdir(), 'icgor-chrome-'))}`,
    ...extraArgs, 'about:blank',
  ];
  const proc = spawn(chrome, args, { stdio: ['ignore', 'ignore', 'pipe'] });
  const wsUrl = await new Promise((res, rej) => {
    let buf = '';
    proc.stderr.on('data', (d) => {
      buf += d;
      const m = buf.match(/DevTools listening on (ws:\/\/\S+)/);
      if (m) res(m[1]);
    });
    proc.on('exit', () => rej(new Error('Chromium başlatılamadı')));
  });
  const cdp = await CDP.connect(wsUrl);
  return { proc, cdp, close: () => { cdp.ws.close(); proc.kill(); } };
}

export class CDP {
  constructor(ws) {
    this.ws = ws;
    this.id = 0;
    this.pending = new Map();
    this.listeners = new Set();
    ws.onmessage = (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        msg.error ? reject(new Error(msg.error.message)) : resolve(msg.result);
      } else if (msg.method) {
        for (const l of this.listeners) l(msg);
      }
    };
  }
  static async connect(url) {
    const ws = new WebSocket(url);
    await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
    return new CDP(ws);
  }
  send(method, params = {}, sessionId) {
    const id = ++this.id;
    this.ws.send(JSON.stringify({ id, method, params, sessionId }));
    return new Promise((resolve, reject) => this.pending.set(id, { resolve, reject }));
  }

  /** Yeni sekme açar; mobil/masaüstü emülasyonu, hata toplama ve yardımcılar döndürür. */
  async page({ width, height, mobile = false, dpr = 1, userAgent } = {}) {
    const { targetId } = await this.send('Target.createTarget', { url: 'about:blank' });
    const { sessionId } = await this.send('Target.attachToTarget', { targetId, flatten: true });
    const errors = [];
    const logs = [];
    const onEvent = (m) => {
      if (m.sessionId !== sessionId) return;
      if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails.exception?.description ?? m.params.exceptionDetails.text);
      if (m.method === 'Runtime.consoleAPICalled') {
        const text = m.params.args.map((a) => a.value ?? a.description).join(' ');
        if (m.params.type === 'error') errors.push(text); else logs.push(text);
      }
      if (m.method === 'Log.entryAdded' && m.params.entry.level === 'error') errors.push(m.params.entry.text);
    };
    this.listeners.add(onEvent);
    const s = (method, params) => this.send(method, params, sessionId);
    await s('Runtime.enable');
    await s('Page.enable');
    await s('Log.enable');
    await s('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: dpr, mobile });
    if (mobile) await s('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
    if (userAgent) await s('Emulation.setUserAgentOverride', { userAgent });
    const page = {
      sessionId, errors, logs, send: s,
      async goto(url) { await s('Page.navigate', { url }); },
      async eval(expression) {
        const r = await s('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
        if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
        return r.result.value;
      },
      async waitFor(expression, timeout = 20000) {
        const t0 = Date.now();
        while (Date.now() - t0 < timeout) {
          if (await page.eval(expression).catch(() => false)) return true;
          await sleep(150);
        }
        throw new Error(`zaman aşımı: ${expression}`);
      },
      async screenshot() {
        const shot = await s('Page.captureScreenshot', { format: 'png' });
        return Buffer.from(shot.data, 'base64');
      },
      async tap(x, y) {
        await s('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
        await s('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      },
      async click(x, y) {
        for (const type of ['mousePressed', 'mouseReleased']) await s('Input.dispatchMouseEvent', { type, x, y, button: 'left', clickCount: 1 });
      },
      async setFiles(selector, files) {
        const { root } = await s('DOM.getDocument');
        const { nodeId } = await s('DOM.querySelector', { nodeId: root.nodeId, selector });
        await s('DOM.setFileInputFiles', { nodeId, files });
      },
      async close() { this.closed = true; await sendClose(); },
    };
    const sendClose = async () => { this.listeners.delete(onEvent); await this.send('Target.closeTarget', { targetId }); };
    return page;
  }
}
