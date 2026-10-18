// Duruş göstergeleri doğrulaması (sentetik figür, full model). İki tür kontrol:
//  - "mutlak": gösterge, yer gerçeği eklem noktalarına aynı formülle uygulanır → MediaPipe kaynaklı hata
//  - "fark": bilinen bir değişiklik (ör. baş 4 cm öne) uygulanır; ölçülen değişim beklenenle karşılaştırılır
// Kamera burada kusursuz düzdür; gerçek kullanımda eğim payı ayrıca eklenir (posture.js).
// Kullanım: node scripts/posture-bench.mjs [model] [çıktı.json]
import { writeFile, mkdir, readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { serve, launchChrome } from './lib/cdp.mjs';
import { postureMetrics, METRICS } from '../src/analysis/posture.js';
import { MP, rms } from '../src/analysis/geometry.js';

const MODEL = process.argv[2] ?? 'full';
const OUT = resolve(process.argv[3] ?? `.cache/bench/posture-bench-${MODEL}.json`);
const W = 480, H = 640; // telefon dikey kadrajı
const manifest = JSON.parse(await readFile('assets/anatomy/manifest.json', 'utf8'));
const HEIGHT_CM = manifest.bodyHeight * 100;

const Y = Math.PI / 2;
// view: ölçüm görünüşü; diff: bu senaryonun karşılaştırıldığı nötr senaryo ve beklenen değişim
const SCENARIOS = [
  { id: 'ön-nötr', view: 'front', p: { yaw: 0 } },
  { id: 'ön-sol-omuz+2cm', view: 'front', p: { yaw: 0, shoulderRaise: { L: 0.02 } }, diff: { from: 'ön-nötr', shoulderLevelCm: 2 } },
  { id: 'ön-sol-omuz+4cm', view: 'front', p: { yaw: 0, shoulderRaise: { L: 0.04 } }, diff: { from: 'ön-nötr', shoulderLevelCm: 4 } },
  { id: 'ön-sağ-omuz+3cm', view: 'front', p: { yaw: 0, shoulderRaise: { R: 0.03 } }, diff: { from: 'ön-nötr', shoulderLevelCm: -3 } },
  { id: 'ön-yana-eğilme-6°', view: 'front', p: { yaw: 0, trunkLean: 0.105 } },
  { id: 'ön-yana-eğilme-−4°', view: 'front', p: { yaw: 0, trunkLean: -0.07 } },
  { id: 'ön-diz-içe', view: 'front', p: { yaw: 0, pose: { 'hip-L': { plane: -0.08 }, 'knee-L': { plane: 0.16 }, 'hip-R': { plane: 0.08 }, 'knee-R': { plane: -0.16 } } } },
  { id: 'ön-ayak-dışa-17°', view: 'front', p: { yaw: 0, legYaw: { L: 0.3, R: 0.3 } }, diff: { from: 'ön-nötr', footAngleL: '+', footAngleR: '+' } },
  { id: 'arka-nötr', view: 'back', p: { yaw: Math.PI } },
  { id: 'arka-sol-omuz+3cm', view: 'back', p: { yaw: Math.PI, shoulderRaise: { L: 0.03 } }, diff: { from: 'arka-nötr', shoulderLevelCm: 3 } },
  { id: 'yan-nötr', view: 'side', p: { yaw: Y } },
  { id: 'yan-baş-öne-3cm', view: 'side', p: { yaw: Y, headForward: 0.03 }, diff: { from: 'yan-nötr', headForwardCm: 3 } },
  { id: 'yan-baş-öne-6cm', view: 'side', p: { yaw: Y, headForward: 0.06 }, diff: { from: 'yan-nötr', headForwardCm: 6 } },
  { id: 'yan-öne-eğilme-8°', view: 'side', p: { yaw: Y, trunkFlex: 0.14 } },
  { id: 'yan-diz-bükülü', view: 'side', p: { yaw: Y, pose: { 'hip-L': { flex: 0.15 }, 'knee-L': { flex: 0.3 }, 'hip-R': { flex: 0.15 }, 'knee-R': { flex: 0.3 } } } },
  { id: 'yan-sol-bakış-nötr', view: 'side', p: { yaw: -Y } },
];

/** Yer gerçeği eklemlerinden (omuz, kalça, diz, ayak bileği) sahte bir nokta dizisi kurar. */
function truthLandmarks(truth, lm) {
  const t = lm.map((p) => p.slice());
  const set = (k, j) => { const q = truth.joints2d[j]; t[MP[k]] = [q[0], q[1], 0, 1]; };
  for (const [S, s] of [['L', 'left'], ['R', 'right']]) {
    set(`${s}Shoulder`, `shoulder-${S}`); set(`${s}Hip`, `hip-${S}`); set(`${s}Knee`, `knee-${S}`); set(`${s}Ankle`, `ankle-${S}`);
    set(`${s}Elbow`, `elbow-${S}`); set(`${s}Wrist`, `wrist-${S}`);
  }
  return t;
}
// Yer gerçeği yalnızca eklem tabanlı göstergeler için tanımlı
const JOINT_ONLY = ['shoulderLevel', 'hipLevel', 'trunkLateral', 'kneeFrontalL', 'kneeFrontalR', 'trunkForward', 'kneeSagittal'];

async function main() {
  await mkdir(dirname(OUT), { recursive: true });
  const server = await serve();
  const browser = await launchChrome();
  const page = await browser.cdp.page({ width: W, height: H });
  await page.goto(`http://127.0.0.1:${server.address().port}/test/fixtures/bench.html?model=${MODEL}&w=${W}&h=${H}`);
  await page.waitFor("document.body.dataset.ready==='true'", 120000);
  const res = {};
  try {
    for (const s of SCENARIOS) {
      // Tam boy dikey kadraj (tarama koşulu): kamera 2,6 m uzakta, 0,95 m yükseklikte
      const r = await page.eval(`window.run(${JSON.stringify({ dist: 2.6, camY: 0.95, ...s.p })})`);
      if (!r.lm) { res[s.id] = { detected: false }; continue; }
      const frames = Array(8).fill(r.lm);
      const opts = { view: s.view, width: W, height: H, userHeightCm: HEIGHT_CM, level: 'known' };
      const meas = postureMetrics(frames, opts);
      const tru = postureMetrics(Array(8).fill(truthLandmarks(r.truth, r.lm)), opts);
      res[s.id] = { detected: true, view: s.view, meas, truth: Object.fromEntries(JOINT_ONLY.filter((k) => tru[k]?.value != null).map((k) => [k, tru[k].value])) };
    }
  } finally { browser.close(); server.close(); }

  // Özet: mutlak hata (eklem tabanlı) ve fark hatası
  const absErr = {}, diffErr = {}, rows = [];
  for (const s of SCENARIOS) {
    const R = res[s.id];
    if (!R?.detected) { rows.push(`${s.id}: algılanmadı`); continue; }
    for (const [k, tv] of Object.entries(R.truth)) {
      const mv = R.meas[k]?.value;
      if (mv == null) continue;
      (absErr[k] ??= []).push(mv - tv);
    }
    if (s.diff) {
      const base = res[s.diff.from];
      for (const [k, exp] of Object.entries(s.diff)) {
        if (k === 'from') continue;
        const d = R.meas[k]?.value - base?.meas[k]?.value;
        if (typeof exp === 'number') (diffErr[k] ??= []).push(d - exp);
        rows.push(`${s.id}: ${k} değişim ${d?.toFixed(1)} (beklenen ${exp})`);
      }
    }
    rows.push(`${s.id}: ${Object.entries(R.meas).filter(([, m]) => m.value != null).map(([k, m]) => `${k}=${m.value}${R.truth[k] != null ? `[gerçek ${R.truth[k]}]` : ''}`).join(' ')}`);
  }
  const sum = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, { n: v.length, rms: +rms(v).toFixed(2), max: +Math.max(...v.map(Math.abs)).toFixed(2), bias: +(v.reduce((a, b) => a + b, 0) / v.length).toFixed(2) }]));
  const summary = { model: MODEL, absolute: sum(absErr), difference: sum(diffErr) };
  await writeFile(OUT, JSON.stringify({ date: new Date().toISOString(), summary, rows, res }, null, 2));
  console.log(rows.join('\n'));
  console.log(JSON.stringify(summary, null, 1));
}

main().catch((e) => { console.error(e); process.exit(1); });
export { SCENARIOS, METRICS };
