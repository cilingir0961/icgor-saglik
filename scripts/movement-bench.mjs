// Hareket testi doğrulaması (sentetik figür + MediaPipe full, kare kare). Her dizide yer gerçeği,
// aynı çözümleyicinin gerçek eklem noktalarına uygulanmasıyla bulunur (yüz/parmak noktaları gerektiren
// göstergeler hariç). Boyun hareketleri figürde modellenmediği için doğrulanmaz → deneysel kalır.
// Kullanım: node scripts/movement-bench.mjs [model] [çıktı.json]
import { writeFile, mkdir, readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { serve, launchChrome } from './lib/cdp.mjs';
import { MOVEMENT_TESTS } from '../src/analysis/movement.js';
import { MOTIONS } from '../src/three/animations.js';
import { MP } from '../src/analysis/geometry.js';

const MODEL = process.argv[2] ?? 'full';
const OUT = resolve(process.argv[3] ?? `.cache/bench/movement-bench-${MODEL}.json`);
const W = 480, H = 640, FPS = 15;
const manifest = JSON.parse(await readFile('assets/anatomy/manifest.json', 'utf8'));
const HEIGHT_CM = manifest.bodyHeight * 100;
const CAM = { dist: 2.6, camY: 0.95 };
const Y = Math.PI / 2;

const seq = (n, f) => Array.from({ length: n }, (_, i) => ({ ...CAM, ...f(i / FPS, i) }));
const SEQS = {
  'kol-kaldirma': seq(3 * 30, (t) => {
    const k = Math.sin(((t % 2) / 2) * Math.PI); // 2 s'lik tekrar, 3 tekrar
    return { yaw: 0, pose: { 'shoulder-L': { plane: 2.6 * k }, 'shoulder-R': { plane: -2.1 * k } } };
  }),
  comelme: seq(2 * 30, (t) => {
    const k = Math.sin(((t % 2) / 2) * Math.PI);
    return { yaw: Y, pose: { 'hip-L': { flex: 1.1 * k }, 'knee-L': { flex: 1.6 * k }, 'hip-R': { flex: 1.1 * k }, 'knee-R': { flex: 1.6 * k } } };
  }),
  'one-egilme': seq(36, (t) => ({ yaw: Y, trunkFlex: 0.9 * Math.sin((t / 2.4) * Math.PI) })),
  'tek-ayak': seq(8 * FPS, (t) => {
    const up = t > 1.5 && t < 6.5; // 5 s sol ayak kalkık
    return { yaw: 0, x: 0.01 * Math.sin(2 * Math.PI * t), pose: up ? { 'hip-L': { flex: 0.5 }, 'knee-L': { flex: 0.9 } } : {} };
  }),
  yuruyus: seq(4 * FPS, (t) => ({ yaw: Y, x: -0.35 + 0.18 * t, pose: MOTIONS.yurume.pose(t) })),
};
const TRUTH_EXTRA = { yuruyus: { cadence: 60 / (MOTIONS.yurume.period / 2) }, 'tek-ayak': { holdL: 5 } };

function truthLandmarks(truth, lm) {
  const t = lm.map((p) => p.slice());
  const set = (k, j) => { const q = truth.joints2d[j]; t[MP[k]] = [q[0], q[1], 0, 1]; };
  for (const [S, s] of [['L', 'left'], ['R', 'right']]) {
    for (const [k, j] of [['Shoulder', 'shoulder'], ['Elbow', 'elbow'], ['Wrist', 'wrist'], ['Hip', 'hip'], ['Knee', 'knee'], ['Ankle', 'ankle']]) set(`${s}${k}`, `${j}-${S}`);
  }
  return t;
}

async function main() {
  await mkdir(dirname(OUT), { recursive: true });
  const server = await serve();
  const browser = await launchChrome();
  const page = await browser.cdp.page({ width: W, height: H });
  await page.goto(`http://127.0.0.1:${server.address().port}/test/fixtures/bench.html?model=${MODEL}&w=${W}&h=${H}`);
  await page.waitFor("document.body.dataset.ready==='true'", 120000);
  const out = {};
  try {
    for (const [id, frames] of Object.entries(SEQS)) {
      const meas = [], tru = [];
      for (const [i, p] of frames.entries()) {
        const r = await page.eval(`window.run(${JSON.stringify(p)})`);
        const t = i / FPS;
        if (r.lm) { meas.push({ t, lm: r.lm }); tru.push({ t, lm: truthLandmarks(r.truth, r.lm) }); }
      }
      const ctx = { width: W, height: H, userHeightCm: HEIGHT_CM };
      const A = MOVEMENT_TESTS[id].analyze(meas, ctx);
      const T = MOVEMENT_TESTS[id].analyze(tru, ctx);
      const rows = {};
      for (const [k, m] of Object.entries(A.metrics)) {
        const tv = TRUTH_EXTRA[id]?.[k] ?? T.metrics[k]?.value;
        rows[k] = { tr: m.tr, measured: m.value, u: m.u, truth: tv ?? null, err: m.value != null && tv != null ? +(m.value - tv).toFixed(1) : null, experimental: m.experimental };
      }
      out[id] = { frames: frames.length, detected: meas.length, reps: A.reps, truthReps: T.reps, issues: A.issues, rows };
      console.log(id, JSON.stringify(out[id].rows));
    }
  } finally { browser.close(); server.close(); }
  await writeFile(OUT, JSON.stringify({ date: new Date().toISOString(), model: MODEL, fps: FPS, out }, null, 2));
}

main().catch((e) => { console.error(e); process.exit(1); });
