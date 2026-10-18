// Kamera koçu doğrulaması (sentetik figür + MediaPipe, kare kare). Her dizi için bilinen tekrar sayısı ve
// tekrar süresi; açı yer gerçeği aynı koçun gerçek eklem noktalarına uygulanmasıyla bulunur. Gerçek kişi değildir:
// sonuçlar "sentetik" olarak raporlanır, insan doğruluğu iddiası taşımaz.
// Kullanım: node scripts/coach-bench.mjs [model] [çıktı.json] [dizi1,dizi2 — yalnızca bunlar]
import { writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { serve, launchChrome } from './lib/cdp.mjs';
import { createCoach } from '../src/fitness/coach.js';
import { MP } from '../src/analysis/geometry.js';
import { MOVEMENT_TESTS } from '../src/analysis/movement.js';

const MODEL = process.argv[2] ?? 'full';
const OUT = resolve(process.argv[3] ?? `.cache/bench/coach-bench-${MODEL}.json`);
const ONLY = process.argv[4]?.split(',') ?? null;
const W = 480, H = 640, FPS = 15;
const CAM = { dist: 2.6, camY: 0.95 };
const Y = Math.PI / 2;

/** n tekrar, her biri period s; başta ve sonda 1 s durağan. */
function seq(n, period, poseAt, extra = {}) {
  const total = n * period + 2;
  return {
    reps: n, period,
    frames: Array.from({ length: Math.round(total * FPS) }, (_, i) => {
      const t = i / FPS, u = t - 1;
      const k = u < 0 || u > n * period ? 0 : Math.sin(((u % period) / period) * Math.PI);
      return { ...CAM, ...extra, ...poseAt(k) };
    }),
  };
}
const legs = (hip, knee) => (k) => ({ pose: { 'hip-L': { flex: hip * k }, 'knee-L': { flex: knee * k }, 'hip-R': { flex: hip * k }, 'knee-R': { flex: knee * k } } });
const SEQS = {
  'squat-yavas': { kind: 'squat', ...seq(5, 3, legs(1.1, 1.6), { yaw: Y }) },
  'squat-hizli': { kind: 'squat', ...seq(6, 1.6, legs(1.1, 1.6), { yaw: Y }) },
  'squat-yarim': { kind: 'squat', ...seq(5, 2.5, legs(0.6, 0.9), { yaw: Y }) },
  'otur-kalk': { kind: 'sit-to-stand', ...seq(5, 3, legs(1.5, 1.55), { yaw: Y }) },
  'kol-simetrik': { kind: 'arm-raise', ...seq(4, 3, (k) => ({ pose: { 'shoulder-L': { plane: 2.5 * k }, 'shoulder-R': { plane: -2.5 * k } } }), { yaw: 0 }) },
  'kol-asimetrik': { kind: 'arm-raise', ...seq(4, 3, (k) => ({ pose: { 'shoulder-L': { plane: 2.6 * k }, 'shoulder-R': { plane: -1.9 * k } } }), { yaw: 0 }) },
  'kucuk-salinim': { kind: 'squat', ...seq(5, 2, legs(0.15, 0.25), { yaw: Y }), reps: 0 },
};

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
    for (const [id, S] of Object.entries(SEQS)) {
      if (ONLY && !ONLY.includes(id)) continue;
      const A = createCoach(S.kind, { width: W, height: H });
      const T = createCoach(S.kind, { width: W, height: H });
      const meas = [], tru = [];
      for (const [i, p] of S.frames.entries()) {
        const r = await page.eval(`window.run(${JSON.stringify(p)})`);
        const t = i / FPS;
        A.push(r.lm, t);
        T.push(r.lm ? truthLandmarks(r.truth, r.lm) : null, t);
        if (r.lm) { meas.push({ t, lm: r.lm }); tru.push({ t, lm: truthLandmarks(r.truth, r.lm) }); }
      }
      const a = A.summary(), tr = T.summary();
      const side = (s) => (s?.sides ? (s.sides.L.reps >= s.sides.R.reps ? s.sides.L : s.sides.R) : null);
      const row = {
        kind: S.kind, trueReps: S.reps, counted: a.reps, truthCoachReps: tr.reps, reliable: a.reliable, reasons: a.reasons,
        coverage: a.coverage, period: S.period,
        duration: side(a)?.duration.value ?? null,
        extreme: side(a)?.extreme.value ?? null, extremeTruth: side(tr)?.extreme.value ?? null,
        asym: a.asym, asymTruth: tr.asym,
      };
      row.extremeErr = row.extreme != null && row.extremeTruth != null ? +(row.extreme - row.extremeTruth).toFixed(1) : null;
      if (S.kind === 'arm-raise' && a.sides && tr.sides) {
        row.perSideErr = { L: +(a.sides.L.extreme.value - tr.sides.L.extreme.value).toFixed(1), R: +(a.sides.R.extreme.value - tr.sides.R.extreme.value).toFixed(1) };
      }
      // Aynı kareler tarama ekranının kol kaldırma çözümleyicisiyle (movement.js) — "Bana Anlat" bu testi de kullanır
      if (S.kind === 'arm-raise') {
        const ctx = { width: W, height: H };
        const mA = MOVEMENT_TESTS['kol-kaldirma'].analyze(meas, ctx).metrics, mT = MOVEMENT_TESTS['kol-kaldirma'].analyze(tru, ctx).metrics;
        row.scanTest = {
          L: +(mA.abductionL.value - mT.abductionL.value).toFixed(1), R: +(mA.abductionR.value - mT.abductionR.value).toFixed(1),
          asym: mA.abductionAsym.value, asymTruth: mT.abductionAsym.value, u: mA.abductionAsym.u, distinguishable: mA.abductionAsym.distinguishable,
        };
      }
      out[id] = row;
      console.log(id, JSON.stringify(row));
    }
  } finally { browser.close(); server.close(); }
  const rows = Object.values(out);
  const errs = rows.flatMap((r) => (r.perSideErr ? Object.values(r.perSideErr) : r.extremeErr != null ? [r.extremeErr] : []));
  const summary = {
    sequences: rows.length,
    repsExact: rows.filter((r) => r.counted === r.trueReps).length,
    repAbsErrMax: Math.max(...rows.map((r) => Math.abs(r.counted - r.trueReps))),
    angleErrMaxAbs: errs.length ? Math.max(...errs.map(Math.abs)) : null,
    angleErrRms: errs.length ? +Math.sqrt(errs.reduce((s, e) => s + e * e, 0) / errs.length).toFixed(1) : null,
  };
  console.log('ÖZET', JSON.stringify(summary));
  await writeFile(OUT, JSON.stringify({ date: new Date().toISOString(), model: MODEL, fps: FPS, note: 'Sentetik figür; gerçek kişi değildir.', summary, out }, null, 2));
}

main().catch((e) => { console.error(e); process.exit(1); });
