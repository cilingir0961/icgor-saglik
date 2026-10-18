// Siluet ölçüleri (saf, DENEYSEL): kişi bölütleme maskesinden belirli yüksekliklerde vücut genişliği (önden)
// ve derinliği (yandan); elips modeliyle yaklaşık çevre. Yalnızca dış hat; iç yağ dağılımı veya organlar
// hakkında bilgi VERMEZ. Giysi ve saç ölçüye dahil olur.

import { MP, median } from './geometry.js';
import { cmPerPx } from './posture.js';
import { ATLAS_SILHOUETTE } from './atlas-silhouette.js';

/**
 * Ölçü düzeyleri: omuz çizgisi (0) → kalça çizgisi (1) arası oran. Uyluk düzeyi denendi ve ÇIKARILDI:
 * sentetik doğrulamada maske iki bacağı birleştirdi (15 cm yerine 37 cm) ve yandan bacaklar örtüştü.
 */
export const LEVELS = {
  // 0,4: atlas derisinde kollar bu düzeyin üstünde gövde yüzeyiyle kaynaşık (kesit tek halka); altta ayrılır
  chest: { tr: 'Göğüs altı', torso: 0.4 },
  waist: { tr: 'Bel', torso: 0.62 },
  hip: { tr: 'Kalça', torso: 1.0 },
};

/** Düzeylerin görüntü satırları (piksel, y) ve gövde merkez x'i. */
export function levelRows(lm, w, h, view) {
  const P = (k) => [lm[MP[k]][0] * w, lm[MP[k]][1] * h];
  const V = (k) => lm[MP[k]][3] ?? 0;
  const near = view === 'side' ? (V('leftShoulder') + V('leftHip') >= V('rightShoulder') + V('rightHip') ? 'left' : 'right') : null;
  const sh = view === 'side' ? P(`${near}Shoulder`) : [(P('leftShoulder')[0] + P('rightShoulder')[0]) / 2, (P('leftShoulder')[1] + P('rightShoulder')[1]) / 2];
  const hp = view === 'side' ? P(`${near}Hip`) : [(P('leftHip')[0] + P('rightHip')[0]) / 2, (P('leftHip')[1] + P('rightHip')[1]) / 2];
  const kn = view === 'side' ? P(`${near}Knee`) : P('leftKnee');
  const rows = {};
  for (const [id, L] of Object.entries(LEVELS)) {
    if (L.torso != null) rows[id] = { y: sh[1] + L.torso * (hp[1] - sh[1]), cx: sh[0] + L.torso * (hp[0] - sh[0]) };
    else if (view !== 'side') {
      // Önden uyluk: sol uyluğun ortası (kalça→diz doğrusu üzerinde)
      const lh = P('leftHip');
      rows[id] = { y: lh[1] + L.thigh * (kn[1] - lh[1]), cx: lh[0] + L.thigh * (kn[0] - lh[0]) };
    } else rows[id] = { y: hp[1] + L.thigh * (kn[1] - hp[1]), cx: hp[0] + L.thigh * (kn[0] - hp[0]) };
  }
  return rows;
}

/** Maskedeki bir satırda cx'i içeren kesintisiz koşu [x0, x1] (eşik 0,5). */
export function runAt(mask, mw, row, cx, thr = 0.5) {
  const y = Math.round(row);
  let x = Math.round(cx);
  const at = (xx) => mask[y * mw + xx] >= thr;
  if (x < 0 || x >= mw || y < 0 || !at(x)) {
    // Merkez maske dışındaysa (ör. bacak arası) en yakın içi bul
    let found = -1;
    for (let d = 1; d < mw / 4 && found < 0; d++) for (const xx of [x - d, x + d]) if (xx >= 0 && xx < mw && at(xx)) { found = xx; break; }
    if (found < 0) return null;
    x = found;
  }
  let x0 = x, x1 = x;
  while (x0 > 0 && at(x0 - 1)) x0--;
  while (x1 < mw - 1 && at(x1 + 1)) x1++;
  return [x0, x1 + 1];
}

/**
 * Bir kareden düzey genişlikleri (piksel). Önden bakışta koşu kol çizgisine ulaşıyorsa (kollar gövdeye
 * değiyor) o düzey geçersiz sayılır.
 * @param {Float32Array} mask mw×mh, 0–1 kişi olasılığı (görüntüyle aynı çözünürlük)
 */
export function silhouetteWidths(mask, mw, mh, lm, view) {
  const rows = levelRows(lm, mw, mh, view);
  const out = {};
  for (const [id, r] of Object.entries(rows)) {
    if (r.y < 0 || r.y >= mh) { out[id] = { px: null, why: 'kadraj dışı' }; continue; }
    const run = runAt(mask, mw, r.y, r.cx);
    if (!run) { out[id] = { px: null, why: 'maske yok' }; continue; }
    if (view !== 'side') {
      // Kol çizgisi bu satırda nerede? (omuz→dirsek ve dirsek→bilek doğruları)
      const armX = (S) => {
        const pts = ['Shoulder', 'Elbow', 'Wrist'].map((k) => [lm[MP[`${S}${k}`]][0] * mw, lm[MP[`${S}${k}`]][1] * mh]);
        for (let i = 0; i < 2; i++) {
          const [a, b] = [pts[i], pts[i + 1]];
          if ((r.y - a[1]) * (r.y - b[1]) <= 0 && a[1] !== b[1]) return a[0] + ((r.y - a[1]) / (b[1] - a[1])) * (b[0] - a[0]);
        }
        return null;
      };
      const xs = ['left', 'right'].map(armX).filter((x) => x != null);
      // Koşu, kol çizgisini (gövdeye göre dış tarafta) içeriyorsa kol gövdeyle birleşmiştir
      if (id !== 'thigh' && xs.some((x) => x >= run[0] && x <= run[1])) { out[id] = { px: null, why: 'kollar gövdeye değiyor' }; continue; }
    }
    out[id] = { px: run[1] - run[0], run };
  }
  return out;
}

/** Elips çevresi (Ramanujan II yaklaşımı); a, b yarı eksenler. */
export function ellipseCircumference(a, b) {
  const h = ((a - b) / (a + b)) ** 2;
  return Math.PI * (a + b) * (1 + (3 * h) / (10 + Math.sqrt(4 - 3 * h)));
}

/** Dışbükey zarf çevresi (mezura gibi girintilerin üzerinden geçer). points: [[x, z], …] */
export function hullPerimeter(points) {
  const p = points.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (p.length < 3) return 0;
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower = [], upper = [];
  for (const q of p) { while (lower.length >= 2 && cross(lower.at(-2), lower.at(-1), q) <= 0) lower.pop(); lower.push(q); }
  for (const q of p.reverse()) { while (upper.length >= 2 && cross(upper.at(-2), upper.at(-1), q) <= 0) upper.pop(); upper.push(q); }
  const hull = lower.slice(0, -1).concat(upper.slice(0, -1));
  let per = 0;
  for (let i = 0; i < hull.length; i++) { const a = hull[i], b = hull[(i + 1) % hull.length]; per += Math.hypot(a[0] - b[0], a[1] - b[1]); }
  return per;
}

/**
 * Kesit noktalarını x boşluklarına göre kümelere ayırıp merkeze (cx) en yakın kümeyi seçer (kollar ayrılır).
 * @param {number[][]} pts [[x, z]], @returns {{width, depth, perimeter}|null}
 */
export function torsoSection(pts, cx = 0, gap = 0.012) {
  if (pts.length < 3) return null;
  const s = pts.slice().sort((a, b) => a[0] - b[0]);
  const clusters = [[s[0]]];
  for (let i = 1; i < s.length; i++) {
    if (s[i][0] - s[i - 1][0] > gap) clusters.push([]);
    clusters.at(-1).push(s[i]);
  }
  const c = clusters.find((k) => k[0][0] <= cx && k.at(-1)[0] >= cx)
    ?? clusters.sort((a, b) => Math.abs((a[0][0] + a.at(-1)[0]) / 2 - cx) - Math.abs((b[0][0] + b.at(-1)[0]) / 2 - cx))[0];
  const xs = c.map((p) => p[0]), zs = c.map((p) => p[1]);
  return { width: Math.max(...xs) - Math.min(...xs), depth: Math.max(...zs) - Math.min(...zs), perimeter: hullPerimeter(c) };
}

/**
 * Kesit parçalarından kapalı halkalar kurar (ortak kenar noktaları birleştirilir) ve en büyük alanlı
 * halkayı döndürür. Tek parça yüzeylerde (deri) gövde ile yaslı kollar ayrı halkalardır.
 * @param {number[][][]} segs [[[x1,z1],[x2,z2]], …]
 * @returns {{width, depth, perimeter, area}|null}
 */
export function largestLoop(segs, tol = 1e-5) {
  const key = ([x, z]) => `${Math.round(x / tol)},${Math.round(z / tol)}`;
  const adj = new Map();
  const pt = new Map();
  for (const [a, b] of segs) {
    const ka = key(a), kb = key(b);
    if (ka === kb) continue;
    pt.set(ka, a); pt.set(kb, b);
    (adj.get(ka) ?? adj.set(ka, []).get(ka)).push(kb);
    (adj.get(kb) ?? adj.set(kb, []).get(kb)).push(ka);
  }
  const seen = new Set();
  let best = null, nLoops = 0;
  for (const start of adj.keys()) {
    if (seen.has(start)) continue;
    const loop = [];
    let prev = null, cur = start;
    while (cur && !seen.has(cur)) {
      seen.add(cur);
      loop.push(pt.get(cur));
      const next = adj.get(cur).find((n) => n !== prev && !seen.has(n));
      prev = cur; cur = next;
    }
    if (loop.length < 3) continue;
    nLoops++;
    let area = 0;
    for (let i = 0; i < loop.length; i++) { const a = loop[i], b = loop[(i + 1) % loop.length]; area += a[0] * b[1] - b[0] * a[1]; }
    area = Math.abs(area) / 2;
    if (!best || area > best.area) best = { area, loop };
  }
  if (!best) return null;
  const xs = best.loop.map((p) => p[0]), zs = best.loop.map((p) => p[1]);
  return { width: Math.max(...xs) - Math.min(...xs), depth: Math.max(...zs) - Math.min(...zs), perimeter: hullPerimeter(best.loop), area: best.area, loops: nLoops };
}

/**
 * Sentetik doğrulamadan (scripts/silhouette-bench.mjs, docs/bench/silhouette-bench-summary.json):
 * maske genişliği gerçeğe göre ortalama sapma (cm) ve belirsizlik payları. Gerçek kişide giysi/saç eklenir.
 */
export const SIL_CAL = { widthBias: 0.8, depthBias: 0.5, uWidth: 1.2, uDepth: 2.0, uCircPct: 5 };

/**
 * Önden (kollar açık) ve yandan maske örneklerinden göğüs altı/bel/kalça genişlik, derinlik ve elips çevresi;
 * dijital ikiz çarpanları (atlas derisine göre). Hepsi DENEYSEL.
 * @param {{mask:{data,width,height}, lm:number[][]}[]} front
 * @param {{mask:{data,width,height}, lm:number[][]}[]} side
 */
export function bodyMeasures(front, side, heightCm) {
  const per = (samples, view) => {
    const acc = {};
    for (const { mask, lm } of samples) {
      const sc = cmPerPx(lm, mask.width, mask.height, heightCm);
      if (!sc) continue;
      const w = silhouetteWidths(mask.data, mask.width, mask.height, lm, view);
      for (const [k, v] of Object.entries(w)) {
        (acc[k] ??= { vals: [], why: null });
        if (v.px != null) acc[k].vals.push(v.px * sc); else acc[k].why = v.why;
      }
    }
    return acc;
  };
  const F = per(front, 'front'), S = per(side, 'side');
  const levels = {}, fx = [], fz = [];
  const Hm = heightCm / 100;
  for (const [k, L] of Object.entries(LEVELS)) {
    const w = F[k]?.vals.length ? median(F[k].vals) - SIL_CAL.widthBias : null;
    const d = S[k]?.vals.length ? median(S[k].vals) - SIL_CAL.depthBias : null;
    const c = w && d ? ellipseCircumference(w / 2, d / 2) : null;
    const ref = ATLAS_SILHOUETTE[k];
    if (w && ref) fx.push(w / (ref.width * Hm));
    if (d && ref) fz.push(d / (ref.depth * Hm));
    levels[k] = {
      tr: L.tr,
      widthCm: w && +w.toFixed(1), depthCm: d && +d.toFixed(1), circCm: c && +c.toFixed(1),
      uWidth: SIL_CAL.uWidth, uDepth: SIL_CAL.uDepth,
      uCirc: c ? +(Math.hypot((c * SIL_CAL.uCircPct) / 100, Math.PI * Math.hypot(SIL_CAL.uWidth, SIL_CAL.uDepth) / 2)).toFixed(1) : null,
      why: !w ? F[k]?.why ?? 'önden ölçülemedi' : !d ? S[k]?.why ?? 'yandan ölçülemedi' : null,
    };
  }
  const clamp = (x) => Math.min(1.3, Math.max(0.8, x));
  return {
    levels,
    twin: { sx: fx.length ? +clamp(median(fx)).toFixed(3) : null, sz: fz.length ? +clamp(median(fz)).toFixed(3) : null },
    experimental: true,
  };
}
