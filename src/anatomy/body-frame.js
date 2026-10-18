// Görüntüdeki 4 gövde işaret noktasından (omuzlar + kalçalar) atlas → ekran
// dönüşümü kurar. İşaret noktaları elle (sürüklenebilir tutamaçlar) veya
// ileride bir poz algılayıcıdan (ör. MediaPipe) gelebilir; bu modül kaynaktan
// bağımsızdır.
//
// Noktalar görüntü pikseli cinsinden [x, y] (x sağa, y aşağı). "left/right"
// KİŞİNİN solu/sağıdır, görüntünün değil.

const MIN_SHOULDER_PX = 24;
const RATIO_RANGE = [0.6, 3.0]; // gövde uzunluğu / omuz genişliği
const MAX_SKEW_COS = 0.5; // omuz ekseni ile gövde ekseni ~dik olmalı (60°–120°)

const mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
const sub2 = (a, b) => [a[0] - b[0], a[1] - b[1]];
const len2 = (a) => Math.hypot(a[0], a[1]);

/**
 * @param {{leftShoulder:number[], rightShoulder:number[], leftHip:number[], rightHip:number[]}} lm
 * @param {{mirrored?: boolean}} [opts] mirrored: görüntü ayna (selfie) olarak işlendiyse true.
 * @returns {{ok:true, frame:object} | {ok:false, reason:string}}
 */
export function computeBodyFrame(lm, opts = {}) {
  for (const k of ['leftShoulder', 'rightShoulder', 'leftHip', 'rightHip']) {
    const p = lm?.[k];
    if (!Array.isArray(p) || p.length < 2 || !Number.isFinite(p[0]) || !Number.isFinite(p[1])) {
      return { ok: false, reason: 'missing-landmark' };
    }
  }
  const shoulderMid = mid(lm.leftShoulder, lm.rightShoulder);
  const hipMid = mid(lm.leftHip, lm.rightHip);
  const ex = sub2(lm.leftShoulder, lm.rightShoulder); // atlas +x (kişinin solu)
  const ey = sub2(hipMid, shoulderMid); // atlas +y (aşağı)
  const W = len2(ex);
  const H = len2(ey);

  if (W < MIN_SHOULDER_PX) return { ok: false, reason: 'too-small' };
  const ratio = H / W;
  if (ratio < RATIO_RANGE[0] || ratio > RATIO_RANGE[1]) return { ok: false, reason: 'implausible-proportions' };
  const cos = (ex[0] * ey[0] + ex[1] * ey[1]) / (W * H);
  if (Math.abs(cos) > MAX_SKEW_COS) return { ok: false, reason: 'skewed' };

  // Kişinin solu görüntüde sağdaysa ve görüntü ayna değilse kişi kameraya bakıyordur.
  const crossZ = ex[0] * ey[1] - ex[1] * ey[0];
  const facesCamera = (crossZ > 0) !== Boolean(opts.mirrored);
  const zSign = facesCamera ? 1 : -1;

  const frame = {
    origin: shoulderMid,
    ex,
    ey,
    shoulderWidth: W,
    torsoLength: H,
    view: facesCamera ? 'anterior' : 'posterior',
    /** Atlas noktası → [ekranX, ekranY, derinlik]; derinlik büyükse kameraya daha yakın. */
    toScreen(p) {
      return [
        shoulderMid[0] + p[0] * ex[0] + p[1] * ey[0],
        shoulderMid[1] + p[0] * ex[1] + p[1] * ey[1],
        zSign * p[2] * W,
      ];
    },
  };
  return { ok: true, frame };
}

export const FRAME_ERROR_MESSAGES_TR = {
  'missing-landmark': 'Gövde noktaları eksik.',
  'too-small': 'Gövde çok küçük görünüyor; kameraya yaklaşın.',
  'implausible-proportions': 'Oranlar gerçekçi değil; omuz ve kalça noktalarını kontrol edin.',
  skewed: 'Gövde çok eğik; kameraya karşı dik durun.',
};
