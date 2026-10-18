// Bağımlılıksız tarayıcı duman testi: Chromium'u DevTools Protokolü (CDP) ile sürer.
// Node 22+ yerleşik WebSocket'ini kullanır; npm paketi veya ağ erişimi gerekmez.
//
// Kullanım: node scripts/browser-smoke.mjs [çıktı-klasörü]
// Kontroller (telefon 390x844 ve masaüstü 1280x800 için):
//   - konsolda yakalanmamış hata yok
//   - yatay taşma yok
//   - her mod beklenen durum mesajını gösteriyor
//   - #camera ile sahte kamera açılıyor ve video kare üretiyor
//   - CSP ihlali yok
//   - DICOM modu: fantom yükleniyor; sentetik .dcm dosyaları dosya seçiciyle açılıyor

import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { extname, join, resolve } from 'node:path';
import { writePhantomSeries } from './make-sample-dicom.mjs';

const ROOT = resolve(import.meta.dirname, '..');
const OUT = resolve(process.argv[2] ?? join(ROOT, 'smoke-out'));
const CHROME = process.env.CHROME ?? ['/usr/bin/chromium', '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'].find(existsSync);
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml' };

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function serve() {
  const server = createServer(async (req, res) => {
    const path = join(ROOT, decodeURIComponent(new URL(req.url, 'http://x').pathname));
    if (!path.startsWith(ROOT)) return res.writeHead(403).end();
    try {
      const body = await readFile(path.endsWith('/') ? join(path, 'index.html') : path);
      res.writeHead(200, { 'content-type': TYPES[extname(path)] ?? 'application/octet-stream' }).end(body);
    } catch {
      res.writeHead(404).end();
    }
  });
  return new Promise((r) => server.listen(0, '127.0.0.1', () => r(server)));
}

async function launchChrome() {
  const proc = spawn(CHROME, [
    '--headless=new', '--no-sandbox', '--disable-gpu', '--remote-debugging-port=0',
    // Tarayıcının kendi arka plan ağ trafiğini kapat: test tamamen çevrimdışı çalışmalı.
    '--disable-background-networking', '--disable-component-update', '--disable-sync',
    '--disable-default-apps', '--no-first-run', '--disable-domain-reliability',
    '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream',
    `--user-data-dir=${join(OUT, '.profile')}`, 'about:blank',
  ], { stdio: ['ignore', 'ignore', 'pipe'] });
  const wsUrl = await new Promise((res, rej) => {
    let buf = '';
    proc.stderr.on('data', (d) => {
      buf += d;
      const m = buf.match(/DevTools listening on (ws:\/\/\S+)/);
      if (m) res(m[1]);
    });
    proc.on('exit', () => rej(new Error('Chromium başlatılamadı')));
  });
  return { proc, wsUrl };
}

class CDP {
  constructor(ws) {
    this.ws = ws;
    this.id = 0;
    this.pending = new Map();
    this.listeners = [];
    ws.onmessage = (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        msg.error ? reject(new Error(msg.error.message)) : resolve(msg.result);
      } else if (msg.method) {
        this.listeners.forEach((l) => l(msg));
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
}

const VIEWPORTS = [
  { name: 'telefon', width: 390, height: 844, mobile: true, dpr: 3 },
  { name: 'masaustu', width: 1280, height: 800, mobile: false, dpr: 1 },
];
const CASES = [
  { hash: '', expectStatus: /Önden görünüm/ },
  { hash: 'orbit', expectStatus: /Serbest 3B/ },
  { hash: 'camera', expectStatus: /Önden görünüm/, expectCamera: true },
  { hash: 'dicom', expectStatus: /DICOM aç veya Fantom/ },
  { hash: 'dicom-fantom', expectStatus: /kesit değiştirin/, expectSlices: true },
  { hash: 'dicom', expectStatus: /kesit değiştirin/, expectSlices: true, uploadDicom: true },
];

async function run() {
  await mkdir(OUT, { recursive: true });
  const server = await serve();
  const base = `http://127.0.0.1:${server.address().port}/index.html`;
  const dicomFiles = await writePhantomSeries(join(OUT, 'dicom'), 8);
  const { proc, wsUrl } = await launchChrome();
  const cdp = await CDP.connect(wsUrl);
  const results = [];
  try {
    for (const vp of VIEWPORTS) {
      for (const c of CASES) {
        const name = `${vp.name}-${c.hash || 'varsayilan'}${c.uploadDicom ? '-dosya' : ''}`;
        const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank' });
        const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true });
        const errors = [];
        const onEvent = (m) => {
          if (m.sessionId !== sessionId) return;
          if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails.exception?.description ?? m.params.exceptionDetails.text);
          if (m.method === 'Log.entryAdded' && m.params.entry.level === 'error') errors.push(m.params.entry.text);
          if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') errors.push(m.params.args.map((a) => a.value ?? a.description).join(' '));
        };
        cdp.listeners.push(onEvent);
        await cdp.send('Runtime.enable', {}, sessionId);
        await cdp.send('Page.enable', {}, sessionId);
        await cdp.send('Log.enable', {}, sessionId);
        await cdp.send('Emulation.setDeviceMetricsOverride', {
          width: vp.width, height: vp.height, deviceScaleFactor: vp.dpr, mobile: vp.mobile,
        }, sessionId);
        if (vp.mobile) await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true }, sessionId);
        await cdp.send('Page.navigate', { url: `${base}#${c.hash}` }, sessionId);
        await sleep(c.expectCamera ? 2500 : 1200);
        if (c.uploadDicom) {
          const { root } = await cdp.send('DOM.getDocument', {}, sessionId);
          const { nodeId } = await cdp.send('DOM.querySelector', { nodeId: root.nodeId, selector: '#file-dicom' }, sessionId);
          await cdp.send('DOM.setFileInputFiles', { nodeId, files: dicomFiles }, sessionId);
          await sleep(2000);
        }

        const { result } = await cdp.send('Runtime.evaluate', {
          returnByValue: true,
          expression: `({
            status: document.querySelector('#status').textContent,
            overflowX: document.documentElement.scrollWidth - innerWidth,
            cameraButton: document.querySelector('#btn-camera').textContent,
            videoFrames: document.querySelector('#video').videoWidth,
            sliceMax: Number(document.querySelector('#rng-slice').max),
            warnings: document.querySelector('#dicom-warnings').textContent,
          })`,
        }, sessionId);
        const v = result.value;
        const shot = await cdp.send('Page.captureScreenshot', { format: 'png' }, sessionId);
        await writeFile(join(OUT, `${name}.png`), Buffer.from(shot.data, 'base64'));

        const problems = [...errors.map((e) => `konsol hatası: ${e}`)];
        if (v.overflowX > 0) problems.push(`yatay taşma: ${v.overflowX}px`);
        if (!c.expectStatus.test(v.status)) problems.push(`beklenmeyen durum: "${v.status}"`);
        if (c.expectCamera && !(v.cameraButton === 'Kamerayı kapat' && v.videoFrames > 0)) {
          problems.push(`kamera açılmadı (buton: "${v.cameraButton}", video genişliği: ${v.videoFrames})`);
        }
        if (c.expectSlices && !(v.sliceMax > 10)) problems.push(`kesit kaydırıcı hazır değil (max=${v.sliceMax})`);
        if (c.uploadDicom && v.sliceMax + 1 !== dicomFiles.length) problems.push(`kesit sayısı ${v.sliceMax + 1}, beklenen ${dicomFiles.length}`);
        if (c.uploadDicom && v.warnings) problems.push(`beklenmeyen uyarı: ${v.warnings}`);
        results.push({ name, ok: problems.length === 0, problems });
        cdp.listeners = cdp.listeners.filter((l) => l !== onEvent);
        await cdp.send('Target.closeTarget', { targetId });
      }
    }
  } finally {
    cdp.ws.close();
    proc.kill();
    server.close();
  }
  for (const r of results) console.log(`${r.ok ? 'ok  ' : 'HATA'} ${r.name}${r.problems.map((p) => `\n     - ${p}`).join('')}`);
  console.log(`\n${results.filter((r) => r.ok).length}/${results.length} senaryo geçti. Ekran görüntüleri: ${OUT}`);
  process.exit(results.every((r) => r.ok) ? 0 : 1);
}

run().catch((e) => { console.error(e); process.exit(1); });
