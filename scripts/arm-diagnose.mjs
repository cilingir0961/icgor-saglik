// Tanı: simetrik kol kaldırmada MediaPipe eklem noktalarının yer gerçeğinden sapması (kare kare, taraf taraf).
// Sentetik figürdür; gerçek kişi değildir. Kullanım: node scripts/arm-diagnose.mjs [model] [çıktı.json]
import { writeFile } from 'node:fs/promises';
import { serve, launchChrome } from './lib/cdp.mjs';
import { MP, angleAt, mid, sub, add } from '../src/analysis/geometry.js';

const MODEL = process.argv[2] ?? 'full';
const OUT = process.argv[3] ?? '.cache/bench/arm-diagnose.json';
const W = 480, H = 640;
const CAM = { dist: 2.6, camY: 0.95, yaw: 0 };
const ks = [0, 0.3, 0.5, 0.65, 0.75, 0.85, 0.92, 1];
const abd = (lm, s) => {
  const P = (k) => [lm[MP[k]][0] * W, lm[MP[k]][1] * H];
  const sh = P(`${s}Shoulder`);
  const axis = sub(mid(P('leftHip'), P('rightHip')), mid(P('leftShoulder'), P('rightShoulder')));
  return angleAt(add(sh, axis), sh, P(`${s}Elbow`));
};
const server = await serve();
const browser = await launchChrome();
const page = await browser.cdp.page({ width: W, height: H });
await page.goto(`http://127.0.0.1:${server.address().port}/test/fixtures/bench.html?model=${MODEL}&w=${W}&h=${H}`);
await page.waitFor("document.body.dataset.ready==='true'", 120000);
const rows = [];
try {
  for (const plane of [2.5, 2.2]) for (const k of ks) {
    const p = { ...CAM, pose: { 'shoulder-L': { plane: plane * k }, 'shoulder-R': { plane: -plane * k } } };
    const r = await page.eval(`window.run(${JSON.stringify(p)})`);
    if (!r.lm) { rows.push({ plane, k, detected: false }); continue; }
    const row = { plane, k, deg: +(plane * k * 57.2958).toFixed(0) };
    for (const [S, s] of [['L', 'left'], ['R', 'right']]) {
      const err = {};
      for (const [j, J] of [['Shoulder', 'shoulder'], ['Elbow', 'elbow'], ['Wrist', 'wrist'], ['Hip', 'hip']]) {
        const q = r.truth.joints2d[`${J}-${S}`], m = r.lm[MP[`${s}${j}`]];
        err[j] = { dx: Math.round((m[0] - q[0]) * W), dy: Math.round((m[1] - q[1]) * H), vis: +m[3].toFixed(2) };
      }
      const truthLm = r.lm.map((x) => x.slice());
      for (const [j, J] of [['Shoulder', 'shoulder'], ['Elbow', 'elbow'], ['Hip', 'hip']]) for (const [S2, s2] of [['L', 'left'], ['R', 'right']]) { const q = r.truth.joints2d[`${J}-${S2}`]; truthLm[MP[`${s2}${j}`]] = [q[0], q[1], 0, 1]; }
      row[S] = { abdMeasured: +abd(r.lm, s).toFixed(1), abdTruth: +abd(truthLm, s).toFixed(1), err };
    }
    rows.push(row);
    console.log(JSON.stringify({ deg: row.deg, plane, L: `${row.L.abdMeasured}/${row.L.abdTruth}`, R: `${row.R.abdMeasured}/${row.R.abdTruth}`, Relbow: row.R.err.Elbow, Rsh: row.R.err.Shoulder, Lelbow: row.L.err.Elbow, Lsh: row.L.err.Shoulder }));
  }
} finally { browser.close(); server.close(); }
await writeFile(OUT, JSON.stringify({ model: MODEL, note: 'Sentetik figür; gerçek kişi değildir.', rows }, null, 2));
