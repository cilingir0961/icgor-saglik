// Siluet ölçüleri doğrulaması (sentetik figür, full model + bölütleme maskesi). Hata kaynakları ayrı ayrı:
//   bölütleme: MediaPipe maskesi − çizimin kesin maskesi (aynı yöntemle genişlik)
//   izdüşüm/ölçek: kesin maske − ağ kesitinin gerçek genişliği (cm)
//   çevre modeli: elips(genişlik_önden, derinlik_yandan) − ağ kesitinin dışbükey zarf çevresi
// Ayrıca gövde ölçeği değiştirilmiş "kişiler"de ölçülen oranın beklenen orana uyumu (ikiz çarpanları).
// Kullanım: node scripts/silhouette-bench.mjs [çıktı.json]
import { writeFile, mkdir, readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { serve, launchChrome } from './lib/cdp.mjs';
import { cmPerPx } from '../src/analysis/posture.js';
import { ellipseCircumference, LEVELS } from '../src/analysis/silhouette.js';
import { median, rms } from '../src/analysis/geometry.js';

const OUT = resolve(process.argv[2] ?? '.cache/bench/silhouette-bench.json');
const W = 480, H = 640;
const manifest = JSON.parse(await readFile('assets/anatomy/manifest.json', 'utf8'));
const CAM = { dist: 2.6, camY: 0.95 };
const ARMS = { 'shoulder-L': { plane: 0.55 }, 'shoulder-R': { plane: -0.55 } };
const VARIANTS = [
  { id: 'nötr', s: [1, 1, 1] },
  { id: 'geniş+%10', s: [1.1, 1, 1] },
  { id: 'dar−%8', s: [0.92, 1, 1] },
  { id: 'derin+%10', s: [1, 1, 1.1] },
  { id: 'kısa−%6', s: [1, 0.94, 1] },
];

async function main() {
  await mkdir(dirname(OUT), { recursive: true });
  const server = await serve();
  const browser = await launchChrome();
  const page = await browser.cdp.page({ width: W, height: H });
  await page.goto(`http://127.0.0.1:${server.address().port}/test/fixtures/bench.html?model=full&masks=1&w=${W}&h=${H}`);
  await page.waitFor("document.body.dataset.ready==='true'", 120000);
  const res = {};
  try {
    for (const v of VARIANTS) {
      const heightCm = manifest.bodyHeight * v.s[1] * 100;
      const front = await page.eval(`window.run(${JSON.stringify({ ...CAM, yaw: 0, view: 'front', pose: ARMS, bodyScale: v.s, sections: true })})`);
      const side = await page.eval(`window.run(${JSON.stringify({ ...CAM, yaw: Math.PI / 2, view: 'side', bodyScale: v.s })})`);
      const row = {};
      const scF = cmPerPx(front.lm, W, H, heightCm), scS = cmPerPx(side.lm, W, H, heightCm);
      for (const k of Object.keys(LEVELS)) {
        const sec = front.truth.sections[k];
        const wM = front.sil?.[k]?.px != null ? front.sil[k].px * scF : null;
        const wR = front.truth.silhouette?.[k]?.px != null ? front.truth.silhouette[k].px * scF : null;
        const dM = side.sil?.[k]?.px != null ? side.sil[k].px * scS : null;
        const dR = side.truth.silhouette?.[k]?.px != null ? side.truth.silhouette[k].px * scS : null;
        const circ = wM && dM ? ellipseCircumference(wM / 2, dM / 2) : null;
        row[k] = {
          widthMask: r1(wM), widthRender: r1(wR), widthTrue: r1(sec.width * 100),
          depthMask: r1(dM), depthRender: r1(dR), depthTrue: r1(sec.depth * 100),
          circEllipse: r1(circ), circTrue: r1(sec.perimeter * 100),
          why: front.sil?.[k]?.why ?? side.sil?.[k]?.why,
        };
      }
      res[v.id] = { s: v.s, row };
      console.log(v.id, JSON.stringify(row));
    }
  } finally { browser.close(); server.close(); }

  // Özet
  const err = { segW: [], segD: [], projW: [], projD: [], circ: [], circPct: [] };
  for (const { row } of Object.values(res)) {
    for (const r of Object.values(row)) {
      if (r.widthMask != null && r.widthRender != null) err.segW.push(r.widthMask - r.widthRender);
      if (r.depthMask != null && r.depthRender != null) err.segD.push(r.depthMask - r.depthRender);
      if (r.widthRender != null) err.projW.push(r.widthRender - r.widthTrue);
      if (r.depthRender != null) err.projD.push(r.depthRender - r.depthTrue);
      if (r.circEllipse != null) { err.circ.push(r.circEllipse - r.circTrue); err.circPct.push(((r.circEllipse - r.circTrue) / r.circTrue) * 100); }
    }
  }
  const st = (xs) => (xs.length ? { n: xs.length, bias: r1(xs.reduce((a, b) => a + b, 0) / xs.length), rms: r1(rms(xs)), max: r1(Math.max(...xs.map(Math.abs))) } : null);
  // Oran uyumu: varyant / nötr (ölçülen) vs beklenen ölçek
  const ratio = [];
  const base = res['nötr'].row;
  for (const [id, { s, row }] of Object.entries(res)) {
    if (id === 'nötr') continue;
    const rw = median(Object.keys(row).map((k) => row[k].widthMask / base[k].widthMask).filter(Number.isFinite));
    const rd = median(Object.keys(row).map((k) => row[k].depthMask / base[k].depthMask).filter(Number.isFinite));
    // Boy da değiştiyse cm ölçeği kişinin boyuna göre: beklenen genişlik oranı sx (cm cinsinden)
    ratio.push({ id, widthRatio: r3(rw), expectedW: s[0], depthRatio: r3(rd), expectedD: s[2] });
  }
  const summary = { segmentationWidth: st(err.segW), segmentationDepth: st(err.segD), projectionWidth: st(err.projW), projectionDepth: st(err.projD), circumferenceCm: st(err.circ), circumferencePct: st(err.circPct), ratio };
  await writeFile(OUT, JSON.stringify({ date: new Date().toISOString(), summary, res }, null, 2));
  console.log(JSON.stringify(summary, null, 1));
}

const r1 = (x) => (x == null || !Number.isFinite(x) ? null : +x.toFixed(1));
const r3 = (x) => (x == null || !Number.isFinite(x) ? null : +x.toFixed(3));

main().catch((e) => { console.error(e); process.exit(1); });
