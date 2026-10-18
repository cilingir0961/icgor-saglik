// Dış vücut oranları (saf): önden dinlenme duruşundan segment boyları ve genişlikler.
// Ölçek kullanıcının girdiği boydan gelir (göz–topuk ≈ boyun %93,6'sı). Yalnızca görüntü düzlemine paralel
// segmentler için geçerlidir; değerler tahminidir. İç organ veya yağ dağılımı hakkında bilgi VERMEZ.

import { MP, dist, mid, median } from './geometry.js';
import { cmPerPx } from './posture.js';

const px = (lm, k, w, h) => [lm[MP[k]][0] * w, lm[MP[k]][1] * h];

export const SEGMENTS = {
  shoulderWidth: { tr: 'Omuz genişliği (eklem noktaları arası)', a: 'leftShoulder', b: 'rightShoulder' },
  hipWidth: { tr: 'Kalça genişliği (eklem noktaları arası)', a: 'leftHip', b: 'rightHip' },
  upperArm: { tr: 'Üst kol', pairs: [['leftShoulder', 'leftElbow'], ['rightShoulder', 'rightElbow']] },
  forearm: { tr: 'Ön kol', pairs: [['leftElbow', 'leftWrist'], ['rightElbow', 'rightWrist']] },
  thigh: { tr: 'Uyluk', pairs: [['leftHip', 'leftKnee'], ['rightHip', 'rightKnee']] },
  shank: { tr: 'Baldır', pairs: [['leftKnee', 'leftAnkle'], ['rightKnee', 'rightAnkle']] },
  torso: { tr: 'Gövde (omuz–kalça ortası)', mid: [['leftShoulder', 'rightShoulder'], ['leftHip', 'rightHip']] },
};
/** Nokta hatasından (kıyas medyanı ≈ omuz genişliğinin %5'i) türetilen boy belirsizliği, cm. */
export const U_SEGMENT_CM = 2.5;

/** @returns {Record<string, {tr, cm:number|null, u:number}>} */
export function measureSegments(frames, { width: w, height: h, userHeightCm }) {
  const out = {};
  const scale = median(frames.map((lm) => cmPerPx(lm, w, h, userHeightCm)).filter(Boolean));
  for (const [id, S] of Object.entries(SEGMENTS)) {
    const vals = frames.map((lm) => {
      if (S.a) return dist(px(lm, S.a, w, h), px(lm, S.b, w, h));
      if (S.mid) return dist(mid(px(lm, S.mid[0][0], w, h), px(lm, S.mid[0][1], w, h)), mid(px(lm, S.mid[1][0], w, h), px(lm, S.mid[1][1], w, h)));
      return median(S.pairs.map(([a, b]) => dist(px(lm, a, w, h), px(lm, b, w, h))));
    });
    const v = median(vals) * scale;
    out[id] = { tr: S.tr, cm: Number.isFinite(v) ? +v.toFixed(1) : null, u: U_SEGMENT_CM };
  }
  return out;
}

/**
 * Atlas modelini kişiye uyarlama çarpanları (görsel; ölçüm değildir). Aşırı değerler [0,85; 1,15] ile sınırlanır.
 * @param {Record<string,{cm}>} seg measureSegments çıktısı
 * @param {Record<string, number>} atlasCm atlasın aynı göstergeleri (cm, aynı tanımla)
 * @param {number} userHeightCm, atlasHeightCm
 */
export function twinScales(seg, atlasCm, userHeightCm, atlasHeightCm) {
  const clamp = (x) => Math.min(1.15, Math.max(0.85, x));
  const k = userHeightCm / atlasHeightCm; // genel ölçek
  const rel = (id) => (seg[id]?.cm && atlasCm[id] ? clamp(seg[id].cm / (atlasCm[id] * k)) : 1);
  return {
    overall: +k.toFixed(3),
    shoulderWidth: +rel('shoulderWidth').toFixed(3),
    hipWidth: +rel('hipWidth').toFixed(3),
    upperArm: +rel('upperArm').toFixed(3),
    forearm: +rel('forearm').toFixed(3),
    thigh: +rel('thigh').toFixed(3),
    shank: +rel('shank').toFixed(3),
  };
}

/** Beden kitle indeksi: yalnızca boy/kilo oranıdır; vücut yağını veya sağlığı ölçmez. */
export function bmi(heightCm, weightKg) {
  if (!heightCm || !weightKg) return null;
  return +(weightKg / (heightCm / 100) ** 2).toFixed(1);
}
