// Duruş göstergeleri (saf). Görüntü düzleminde 2B geometri; kamera perspektifi ve eğimi belirsizliğe eklenir.
//
// İlkeler:
//  - Referans "geometrik nötr"dür (0° eğim, kulak omuz hizasında vb.). Klinik eşik KULLANILMAZ; hastalık adı verilmez.
//  - Her değer ±belirsizlik ve güvenilirlik derecesiyle döner. Belirsizliğin içinde kalan sapma "ayırt edilemez" sayılır.
//  - Doğrulanmamış göstergeler experimental: true (arayüzde "Deneysel").
//  - Taraflar ekran konumundan ve görünüşten çıkarılır (MediaPipe sol/sağ etiketi arka görünümde karışabilir).

import { MP, DEG, angleAt, dist, mid, median, mad } from './geometry.js';
import { nearSide } from './quality.js';

/** Sentetik doğrulamadan (scripts/posture-bench.mjs) türetilen sistematik belirsizlik payları; bkz. docs/ARCHITECTURE.md. */
export const U_SYS = {
  // RMS hata × ~1,25 (sentetik figür, full model, docs/bench/posture-bench-summary.json). Gerçek kişide daha büyük olabilir.
  shoulderLevel: 2.0, shoulderLevelCm: 1.4, hipLevel: 3.0, headTilt: 2.0, trunkLateral: 1.2,
  kneeFrontal: 3.0, footAngle: 6.0,
  headForwardCm: 1.0, earShoulderAngle: 4.0, trunkForward: 1.0, kneeSagittal: 6.0,
};
/** Kamera eğimi bilinmiyorsa (cihaz sensörü yok/izin yok) eğim açılarına eklenen pay (derece). */
export const U_LEVEL_UNKNOWN = 4;
export const U_LEVEL_KNOWN = 1.5;

const GRADE = { iyi: 'iyi', orta: 'orta', dusuk: 'düşük', yok: 'ölçülemedi' };

const px = (lm, k, w, h) => [lm[MP[k]][0] * w, lm[MP[k]][1] * h];
const vis = (lm, k) => lm[MP[k]][3] ?? 0;

/**
 * Ekran soluna/sağına göre iki noktanın eğimi (derece). + : ekranda SAĞDAKİ nokta daha yukarıda.
 */
function screenTilt(a, b) {
  const [L, R] = a[0] <= b[0] ? [a, b] : [b, a];
  return Math.atan2(L[1] - R[1], R[0] - L[0]) * DEG;
}

/** cm/piksel ölçeği: göz–topuk yüksekliği boyun ≈ %93,6'sı. */
export function cmPerPx(lm, w, h, userHeightCm) {
  if (!userHeightCm) return null;
  const top = Math.min(px(lm, 'leftEye', w, h)[1], px(lm, 'rightEye', w, h)[1]);
  const heel = Math.max(px(lm, 'leftHeel', w, h)[1], px(lm, 'rightHeel', w, h)[1]);
  const Hpx = (heel - top) / 0.936;
  return Hpx > 0 ? userHeightCm / Hpx : null;
}

/**
 * Gösterge tanımları. compute(ctx) tek kare için değer döndürür (null → bu karede ölçülemez).
 * ctx: {lm, w, h, view, facing, side, sign, scale}
 *   sign: önden +1 (ekranın sağı = kişinin solu), arkadan −1
 *   facing: yan görünümde kişinin baktığı ekran yönü (+1 sağ, −1 sol)
 */
export const METRICS = {
  // ---- Önden / arkadan ----
  shoulderLevel: {
    tr: 'Omuz seviyesi', unit: '°', views: ['front', 'back'], tilt: true, topic: 'shoulder-level',
    sense: (v) => (v > 0 ? 'sol omuz daha yüksek' : 'sağ omuz daha yüksek'),
    keys: ['leftShoulder', 'rightShoulder'],
    compute: ({ lm, w, h, sign }) => sign * screenTilt(px(lm, 'leftShoulder', w, h), px(lm, 'rightShoulder', w, h)),
  },
  shoulderLevelCm: {
    tr: 'Omuz yükseklik farkı', unit: 'cm', views: ['front', 'back'], tilt: true, cm: true, topic: 'shoulder-level',
    sense: (v) => (v > 0 ? 'sol omuz daha yüksek' : 'sağ omuz daha yüksek'),
    keys: ['leftShoulder', 'rightShoulder'],
    compute: ({ lm, w, h, sign, scale }) => {
      if (!scale) return null;
      const a = px(lm, 'leftShoulder', w, h), b = px(lm, 'rightShoulder', w, h);
      const [L, R] = a[0] <= b[0] ? [a, b] : [b, a];
      return sign * (L[1] - R[1]) * scale;
    },
  },
  hipLevel: {
    tr: 'Kalça seviyesi', unit: '°', views: ['front', 'back'], tilt: true, experimental: true, topic: 'hip-level',
    sense: (v) => (v > 0 ? 'sol kalça daha yüksek' : 'sağ kalça daha yüksek'),
    keys: ['leftHip', 'rightHip'],
    compute: ({ lm, w, h, sign }) => sign * screenTilt(px(lm, 'leftHip', w, h), px(lm, 'rightHip', w, h)),
  },
  headTilt: {
    tr: 'Başın yana eğimi', unit: '°', views: ['front'], tilt: true, topic: 'head-tilt',
    sense: (v) => (v > 0 ? 'baş sağa eğik (sol kulak yukarıda)' : 'baş sola eğik (sağ kulak yukarıda)'),
    keys: ['leftEar', 'rightEar'],
    compute: ({ lm, w, h, sign }) => sign * screenTilt(px(lm, 'leftEar', w, h), px(lm, 'rightEar', w, h)),
  },
  trunkLateral: {
    tr: 'Gövdenin yana eğilimi', unit: '°', views: ['front', 'back'], tilt: true, topic: 'trunk-lateral',
    sense: (v) => (v > 0 ? 'gövde kişinin soluna eğik' : 'gövde kişinin sağına eğik'),
    keys: ['leftShoulder', 'rightShoulder', 'leftHip', 'rightHip'],
    compute: ({ lm, w, h, sign }) => {
      const s = mid(px(lm, 'leftShoulder', w, h), px(lm, 'rightShoulder', w, h));
      const p = mid(px(lm, 'leftHip', w, h), px(lm, 'rightHip', w, h));
      return sign * Math.atan2(s[0] - p[0], p[1] - s[1]) * DEG;
    },
  },
  kneeFrontalL: kneeFrontal('L'), kneeFrontalR: kneeFrontal('R'),
  footAngleL: footAngle('L'), footAngleR: footAngle('R'),

  // ---- Yandan ----
  headForwardCm: {
    tr: 'Başın öne konumu (kulak–omuz)', unit: 'cm', views: ['side'], cm: true, topic: 'head-forward',
    // Nötr değer kişiden kişiye değişir (atlas vücudunda bile kulak omuz noktasının ~4 cm önünde):
    // geometrik 0 referans alınmaz, yalnızca kişinin kendi geçmişiyle karşılaştırılır.
    neutral: null,
    sense: (v) => (v > 0 ? 'kulak omuz hizasının önünde' : 'kulak omuz hizasının arkasında'),
    keys: ['Ear', 'Shoulder'],
    compute: ({ lm, w, h, side, facing, scale }) => {
      if (!scale) return null;
      return facing * (px(lm, `${side}Ear`, w, h)[0] - px(lm, `${side}Shoulder`, w, h)[0]) * scale;
    },
  },
  earShoulderAngle: {
    tr: 'Kulak–omuz açısı (CVA benzeri)', unit: '°', views: ['side'], tilt: true, experimental: true, topic: 'head-forward',
    neutral: null,
    sense: (v) => (v < 90 ? 'baş omuz hizasının önünde' : 'baş omuz hizasında veya geride'),
    keys: ['Ear', 'Shoulder'],
    // Omuz→kulak doğrusunun yatayla açısı, öne doğru ölçülür (90° = kulak tam omzun üstünde).
    // Klinik CVA C7 omurunu kullanır; burada MediaPipe omuz noktası kullanıldığı için yalnızca benzeridir.
    compute: ({ lm, w, h, side, facing }) => {
      const s = px(lm, `${side}Shoulder`, w, h), e = px(lm, `${side}Ear`, w, h);
      return Math.atan2(s[1] - e[1], facing * (e[0] - s[0])) * DEG;
    },
  },
  trunkForward: {
    tr: 'Gövdenin öne eğilimi', unit: '°', views: ['side'], tilt: true, topic: 'trunk-forward',
    sense: (v) => (v > 0 ? 'gövde öne eğik' : 'gövde geriye eğik'),
    keys: ['Shoulder', 'Hip'],
    compute: ({ lm, w, h, side, facing }) => {
      const s = px(lm, `${side}Shoulder`, w, h), p = px(lm, `${side}Hip`, w, h);
      return facing * Math.atan2(s[0] - p[0], p[1] - s[1]) * DEG;
    },
  },
  kneeSagittal: {
    tr: 'Diz hizası (yandan)', unit: '°', views: ['side'], experimental: true, topic: 'knee-sagittal',
    sense: (v) => (v > 0 ? 'diz hafif bükülü' : 'diz düz çizginin gerisinde'),
    keys: ['Hip', 'Knee', 'Ankle'],
    compute: ({ lm, w, h, side, facing }) => {
      const H = px(lm, `${side}Hip`, w, h), K = px(lm, `${side}Knee`, w, h), A = px(lm, `${side}Ankle`, w, h);
      const dev = 180 - angleAt(H, K, A);
      // Diz kalça–ayak bileği doğrusunun önündeyse bükülme (+), gerisindeyse (−)
      const t = (K[1] - H[1]) / ((A[1] - H[1]) || 1);
      const lineX = H[0] + t * (A[0] - H[0]);
      return Math.sign(facing * (K[0] - lineX) || 1) * dev;
    },
  },
};

function kneeFrontal(S) {
  const side = S === 'L' ? 'left' : 'right';
  return {
    tr: `${S === 'L' ? 'Sol' : 'Sağ'} diz hizası (önden)`, unit: '°', views: ['front'], experimental: true, topic: 'knee-frontal',
    sense: (v) => (v > 0 ? 'diz orta hatta doğru' : 'diz dışa doğru'),
    keys: [`${side}Hip`, `${side}Knee`, `${side}Ankle`],
    compute: ({ lm, w, h }) => {
      const H = px(lm, `${side}Hip`, w, h), K = px(lm, `${side}Knee`, w, h), A = px(lm, `${side}Ankle`, w, h);
      const dev = 180 - angleAt(H, K, A);
      const midX = (px(lm, 'leftHip', w, h)[0] + px(lm, 'rightHip', w, h)[0]) / 2;
      const t = (K[1] - H[1]) / ((A[1] - H[1]) || 1);
      const lineX = H[0] + t * (A[0] - H[0]);
      const towardMid = Math.abs(K[0] - midX) < Math.abs(lineX - midX);
      return towardMid ? dev : -dev;
    },
  };
}

function footAngle(S) {
  const side = S === 'L' ? 'left' : 'right';
  return {
    tr: `${S === 'L' ? 'Sol' : 'Sağ'} ayak yönelimi (görünür)`, unit: '°', views: ['front'], experimental: true, topic: 'foot-angle',
    // Perspektif nedeniyle nötr ayakta bile ~30° okunur; mutlak değer anlamlı değil, yalnızca değişim izlenir.
    neutral: null,
    sense: (v) => (v > 0 ? 'ayak ucu dışa dönük' : 'ayak ucu içe dönük'),
    keys: [`${side}Heel`, `${side}FootIndex`],
    // Önden bakışta topuk→ayak ucu yönünün düşeyle açısı; dışa (+). Perspektife çok duyarlıdır.
    compute: ({ lm, w, h }) => {
      const hl = px(lm, `${side}Heel`, w, h), t = px(lm, `${side}FootIndex`, w, h);
      const midX = (px(lm, 'leftHip', w, h)[0] + px(lm, 'rightHip', w, h)[0]) / 2;
      const outward = Math.sign(hl[0] - midX) || 1;
      return Math.atan2(outward * (t[0] - hl[0]), Math.max(1e-6, t[1] - hl[1])) * DEG;
    },
  };
}

/**
 * Bir görünüş çekiminden (çok kare) göstergeleri hesaplar.
 * @param {number[][][]} frames MediaPipe noktaları (kare başına 33 × [x,y,z,vis])
 * @param {{view:'front'|'back'|'side', width:number, height:number, userHeightCm?:number, level?:'known'|'unknown', facing?:'left'|'right'}} o
 * @returns {Record<string, {id, tr, value:number|null, u:number|null, unit, grade, experimental, sense:string|null, n:number, topic}>}
 */
export function postureMetrics(frames, o) {
  const { view, width: w, height: h } = o;
  const out = {};
  if (!frames.length) return out;
  const side = view === 'side' ? nearSide(frames[0]) : null;
  const facingStr = o.facing ?? (view === 'side' ? facingOf(frames, w, h) : null);
  const facing = facingStr === 'left' ? -1 : 1;
  const scales = frames.map((lm) => cmPerPx(lm, w, h, o.userHeightCm)).filter(Boolean);
  const scale = scales.length ? median(scales) : null;
  for (const [id, M] of Object.entries(METRICS)) {
    if (!M.views.includes(view)) continue;
    const keys = M.keys.map((k) => (view === 'side' ? `${side}${k}` : k));
    const good = frames.filter((lm) => keys.every((k) => vis(lm, k) >= 0.6));
    const vals = good.map((lm) => M.compute({ lm, w, h, view, side, facing, sign: view === 'back' ? -1 : 1, scale })).filter(Number.isFinite);
    const base = { id, tr: M.tr, unit: M.unit, experimental: Boolean(M.experimental), topic: M.topic, n: vals.length, neutral: M.neutral === undefined ? 0 : M.neutral };
    if (vals.length < Math.max(5, frames.length * 0.5)) { out[id] = { ...base, value: null, u: null, grade: GRADE.yok, sense: null }; continue; }
    const value = median(vals);
    const nEff = Math.max(1, vals.length / 5); // ardışık kareler bağımsız değil
    const uStat = (1.2533 * mad(vals)) / Math.sqrt(nEff);
    const uSys = U_SYS[id.replace(/[LR]$/, '')] ?? U_SYS[id] ?? 3;
    let uLevel = 0;
    if (M.tilt) uLevel = o.level === 'known' ? U_LEVEL_KNOWN : U_LEVEL_UNKNOWN;
    if (M.cm && M.tilt && scale) {
      // Kamera eğimi yükseklik farkına da yansır: omuz genişliği × sin(eğim payı)
      const swPx = median(good.map((lm) => dist(px(lm, 'leftShoulder', w, h), px(lm, 'rightShoulder', w, h))));
      uLevel = swPx * scale * Math.sin((o.level === 'known' ? U_LEVEL_KNOWN : U_LEVEL_UNKNOWN) / DEG);
    }
    const u = Math.sqrt(uStat ** 2 + uSys ** 2 + uLevel ** 2);
    const hasNeutral = base.neutral !== null;
    const dev = hasNeutral ? value - base.neutral : 0;
    out[id] = {
      ...base, value: +value.toFixed(1), u: +u.toFixed(1), grade: grade(u, M), uStat: +uStat.toFixed(2),
      distinguishable: hasNeutral ? Math.abs(dev) > u : null,
      sense: hasNeutral && Math.abs(dev) > u ? M.sense(value) : null,
    };
  }
  return out;
}

function grade(u, M) {
  const [good, fair] = M.unit === 'cm' ? [1.5, 3] : M.experimental ? [3, 6] : [2.5, 5];
  return u <= good ? GRADE.iyi : u <= fair ? GRADE.orta : GRADE.dusuk;
}

function facingOf(frames, w, h) {
  const votes = frames.map((lm) => (px(lm, 'nose', w, h)[0] > mid(px(lm, 'leftShoulder', w, h), px(lm, 'rightShoulder', w, h))[0] ? 1 : -1));
  return votes.reduce((a, b) => a + b, 0) >= 0 ? 'right' : 'left';
}

/** Gözlem cümlesi (teşhis değildir). */
export function describe(m) {
  if (m.value === null) return `${m.tr}: bu çekimde güvenilir ölçülemedi.`;
  const v = `${m.value > 0 && m.neutral === 0 ? '+' : ''}${m.value.toLocaleString('tr-TR')} ${m.unit} (± ${m.u.toLocaleString('tr-TR')})`;
  if (m.neutral === null) return `${m.tr}: ${v} — kişiden kişiye değişen bir değer; yalnızca kendi önceki taramalarınızla karşılaştırılır.`;
  if (!m.distinguishable) return `${m.tr}: ${v} — nötr referanstan ölçüm belirsizliği içinde ayırt edilemiyor.`;
  return `${m.tr}: ${v} — ${m.sense}. Bu bir gözlemdir, tanı değildir.`;
}
