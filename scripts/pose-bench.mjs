// Poz doğruluk kıyası (sentetik figür, yer gerçekli). Modeller: lite, full, heavy.
// Ölçer: 2B nokta hatası (omuz genişliğine oran), dirsek ve diz iç açısı hatası
//   - "2B ölçüm": görüntü noktalarından açı (uygulamanın ekran tabanlı yöntemi)
//   - "3B dünya": MediaPipe worldLandmarks ile açı
//   - "izdüşüm sınırı": yer gerçeği 2B noktalarından açı − 3B gerçek açı (perspektif kaynaklı, model hatası değil)
// Kullanım: node scripts/pose-bench.mjs [lite,full,heavy] [çıktı.json]
import { writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { serve, launchChrome } from './lib/cdp.mjs';
import { JOINT_MP, angleAt, dist, toPx, median, rms } from '../src/analysis/geometry.js';

const MODELS = (process.argv[2] ?? 'lite,full,heavy').split(',');
const OUT = resolve(process.argv[3] ?? '.cache/bench/pose-bench.json');
const W = 640, H = 480;

/** Poz ızgarası: ön, eğik ve yan görünüm; kollar ekran düzleminde ve kameraya doğru. */
export function poseGrid() {
  const P = [];
  const front = [[0.4, 0, -0.3, 0], [0.9, 0.5, -0.8, -0.7], [1.4, 1.0, -1.6, 0], [2.0, 0.3, -0.5, -1.2], [0.2, 1.4, -1.1, -0.4], [1.1, 0.8, -0.2, -1.5]];
  for (const [sl, el, sr, er] of front) P.push({ view: 'ön', group: 'kol-düzlem', yaw: 0, pose: { 'shoulder-L': { plane: sl }, 'elbow-L': { plane: el }, 'shoulder-R': { plane: sr }, 'elbow-R': { plane: er } } });
  // Dirsek kameraya doğru bükülü (ön kol görüntü düzleminden çıkar → 2B açı yanıltıcı olur)
  for (const f of [0.6, 1.1, 1.6]) P.push({ view: 'ön', group: 'kol-derinlik', yaw: 0, pose: { 'shoulder-L': { abduct: 0.3 }, 'elbow-L': { flex: f }, 'shoulder-R': { abduct: 0.3 }, 'elbow-R': { flex: f * 0.7 } } });
  for (const [hl, kl] of [[0.25, -0.4], [0.4, -0.8], [0.15, -0.2]]) P.push({ view: 'ön', group: 'bacak-düzlem', yaw: 0, pose: { 'hip-L': { plane: hl }, 'knee-L': { plane: kl }, 'hip-R': { plane: -hl * 0.6 }, 'knee-R': { plane: -kl * 0.5 } } });
  for (const yaw of [0.5, -0.5]) P.push({ view: 'eğik', group: 'kol-düzlem', yaw, pose: { 'shoulder-L': { plane: 1.0 }, 'elbow-L': { plane: 0.6 }, 'shoulder-R': { plane: -0.9 }, 'elbow-R': { plane: -0.4 } } });
  // Yan görünüm: çömelme (kalça + diz bükümü), kolları öne kaldırma
  for (const [h, k] of [[0.3, 0.5], [0.8, 1.2], [1.2, 1.8]]) P.push({ view: 'yan', group: 'çömelme', yaw: Math.PI / 2, pose: { 'hip-L': { flex: h }, 'knee-L': { flex: k }, 'hip-R': { flex: h }, 'knee-R': { flex: k } } });
  for (const [s, e] of [[0.6, 0.3], [1.3, 0.8], [2.2, 0.2]]) P.push({ view: 'yan', group: 'kol-öne', yaw: Math.PI / 2, pose: { 'shoulder-L': { flex: s }, 'elbow-L': { flex: e }, 'shoulder-R': { flex: s }, 'elbow-R': { flex: e } } });
  return P;
}

const CHAINS = { 'elbow-L': ['shoulder-L', 'elbow-L', 'wrist-L'], 'elbow-R': ['shoulder-R', 'elbow-R', 'wrist-R'], 'knee-L': ['hip-L', 'knee-L', 'ankle-L'], 'knee-R': ['hip-R', 'knee-R', 'ankle-R'] };
const VIS = 0.5;

function evaluate(r) {
  const out = { points: {}, angles: {} };
  const t2 = (j) => toPx(r.truth.joints2d[j], W, H);
  const m2 = (j) => toPx(r.lm[JOINT_MP[j]], W, H);
  const sw = dist(t2('shoulder-L'), t2('shoulder-R')) || 1;
  // Yan görünümde omuz genişliği küçülür; ölçek olarak gövde boyu (omuz–kalça) da kullanılır
  const torso = dist(t2('shoulder-L'), t2('hip-L'));
  const ref = Math.max(sw, torso * 0.6);
  for (const j of Object.keys(JOINT_MP)) {
    const vis = r.lm[JOINT_MP[j]][3];
    out.points[j] = { errPct: (dist(t2(j), m2(j)) / ref) * 100, vis };
  }
  for (const [name, [a, b, c]] of Object.entries(CHAINS)) {
    const truth3 = angleAt(r.truth.joints3d[a], r.truth.joints3d[b], r.truth.joints3d[c]);
    const truth2 = angleAt(t2(a), t2(b), t2(c));
    const meas2 = angleAt(m2(a), m2(b), m2(c));
    const w = (j) => r.world[JOINT_MP[j]];
    const meas3 = angleAt(w(a), w(b), w(c));
    const vis = Math.min(...[a, b, c].map((j) => r.lm[JOINT_MP[j]][3]));
    out.angles[name] = { truth3, truth2, meas2, meas3, err2: meas2 - truth3, err3: meas3 - truth3, proj: truth2 - truth3, lm2: meas2 - truth2, vis };
  }
  return out;
}

async function main() {
  await mkdir(dirname(OUT), { recursive: true });
  const server = await serve();
  const browser = await launchChrome();
  const base = `http://127.0.0.1:${server.address().port}`;
  const grid = poseGrid();
  const results = {};
  try {
    for (const model of MODELS) {
      const page = await browser.cdp.page({ width: W, height: H });
      await page.goto(`${base}/test/fixtures/bench.html?model=${model}&w=${W}&h=${H}`);
      await page.waitFor("document.body.dataset.ready==='true'", 120000);
      const rows = [];
      for (const p of grid) {
        const r = await page.eval(`window.run(${JSON.stringify(p)})`);
        if (!r.lm) { rows.push({ p, detected: false }); continue; }
        rows.push({ p, detected: true, ms: r.ms, ...evaluate(r) });
      }
      results[model] = rows;
      await page.close();
      console.log(model, summarize(rows).line);
    }
  } finally { browser.close(); server.close(); }
  const summary = Object.fromEntries(Object.entries(results).map(([m, rows]) => [m, summarize(rows)]));
  await writeFile(OUT, JSON.stringify({ date: new Date().toISOString(), poses: grid.length, summary, results }, null, 2));
  console.log(JSON.stringify(summary, null, 1));
}

/** Görünürlük eşiğini geçen ölçümler üzerinden özet. */
export function summarize(rows) {
  const ok = rows.filter((r) => r.detected);
  const pts = (pred) => ok.flatMap((r) => Object.entries(r.points).filter(([j, v]) => pred(j) && v.vis >= VIS).map(([, v]) => v.errPct));
  const ang = (key, pred = () => true) => ok.flatMap((r) => Object.entries(r.angles).filter(([n, v]) => v.vis >= VIS && pred(r, n)).map(([, v]) => Math.abs(v[key])));
  const s = (xs) => ({ n: xs.length, median: +median(xs).toFixed(1), p90: +(xs.sort((a, b) => a - b)[Math.floor(xs.length * 0.9)] ?? NaN).toFixed(1), rms: xs.length ? +rms(xs).toFixed(1) : null });
  const byGroup = {};
  for (const g of new Set(ok.map((r) => r.p.group))) {
    byGroup[g] = { err2: s(ang('err2', (r) => r.p.group === g)), err3: s(ang('err3', (r) => r.p.group === g)), proj: s(ang('proj', (r) => r.p.group === g)), lm2: s(ang('lm2', (r) => r.p.group === g)) };
  }
  const res = {
    detected: `${ok.length}/${rows.length}`,
    msMedian: +median(ok.map((r) => r.ms)).toFixed(0),
    pointErrPct: { elbow: s(pts((j) => j.startsWith('elbow'))), wrist: s(pts((j) => j.startsWith('wrist'))), shoulder: s(pts((j) => j.startsWith('shoulder'))), hip: s(pts((j) => j.startsWith('hip'))), knee: s(pts((j) => j.startsWith('knee'))), ankle: s(pts((j) => j.startsWith('ankle'))) },
    angleErrDeg: { image2d: s(ang('err2')), world3d: s(ang('err3')), projectionOnly: s(ang('proj')), landmarkOnly2d: s(ang('lm2')) },
    byGroup,
  };
  res.line = `algılama ${res.detected}, dirsek nokta medyan %${res.pointErrPct.elbow.median}, açı 2B medyan ${res.angleErrDeg.image2d.median}° p90 ${res.angleErrDeg.image2d.p90}°, 3B medyan ${res.angleErrDeg.world3d.median}° p90 ${res.angleErrDeg.world3d.p90}°`;
  return res;
}

if (import.meta.url === `file://${process.argv[1]}`) main().catch((e) => { console.error(e); process.exit(1); });
