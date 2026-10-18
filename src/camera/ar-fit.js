// Kamera AR hizalaması (saf fonksiyonlar, DOM/three.js yok → Node'da test edilir).
//
// Akış: MediaPipe normalize nokta (video karesi) → ekran pikseli (object-fit: cover + ayna)
//       → 4 gövde noktasından 2B afin uydurma → three.js Matrix4 (ortografik, 1 birim = 1 piksel).
// Sonuç YAKLAŞIKTIR: model genel bir atlas, kişinin gerçek anatomisi değildir.

import { fitAffine, linearDeterminant } from '../core/affine.js';

export const POSE = { leftShoulder: 11, rightShoulder: 12, leftHip: 23, rightHip: 24 };
export const KEYS = ['leftShoulder', 'rightShoulder', 'leftHip', 'rightHip'];

/**
 * Video karesindeki normalize noktayı (0–1) ekrandaki CSS pikseline çevirir.
 * Video 'object-fit: cover' ile ölçeklenip ortalanır; ön kamerada yatay aynalanır.
 */
export function videoToDisplay([nx, ny], video, display, mirrored) {
  const s = Math.max(display.width / video.width, display.height / video.height);
  const dx = (display.width - video.width * s) / 2;
  const dy = (display.height - video.height * s) / 2;
  let x = nx * video.width * s + dx;
  const y = ny * video.height * s + dy;
  if (mirrored) x = display.width - x;
  return [x, y];
}

/**
 * Kalçalar görünmüyorsa (yakın çekim) omuz çizgisine dik doğrultuda, modelin
 * gövde oranıyla sanal kalça noktaları üretir. Böylece üst gövde takibi sürer.
 */
export function virtualHips(ls, rs, modelLm, facingSign = 1) {
  const W = Math.hypot(modelLm.leftShoulder[0] - modelLm.rightShoulder[0], modelLm.leftShoulder[1] - modelLm.rightShoulder[1]);
  const torso = ((modelLm.leftShoulder[1] + modelLm.rightShoulder[1]) - (modelLm.leftHip[1] + modelLm.rightHip[1])) / 2;
  const hipHalf = Math.abs(modelLm.leftHip[0] - modelLm.rightHip[0]) / 2 / W;
  const ex = [ls[0] - rs[0], ls[1] - rs[1]];
  const w = Math.hypot(ex[0], ex[1]);
  // Ekran y aşağı: omuz ekseninin "aşağı" dikmesi; yön, kişinin kameraya bakışına göre.
  const down = [(-ex[1] / w) * facingSign, (ex[0] / w) * facingSign];
  const mid = [(ls[0] + rs[0]) / 2, (ls[1] + rs[1]) / 2];
  const len = (torso / W) * w;
  const hipMid = [mid[0] + down[0] * len, mid[1] + down[1] * len];
  const u = [ex[0] / w, ex[1] / w];
  return {
    leftHip: [hipMid[0] + u[0] * hipHalf * w, hipMid[1] + u[1] * hipHalf * w],
    rightHip: [hipMid[0] - u[0] * hipHalf * w, hipMid[1] - u[1] * hipHalf * w],
  };
}

/** Kişi kameraya mı bakıyor? (Görüntü aynalıysa kişinin solu ekranın solundadır.) */
export function facesCamera(lm, mirrored) {
  const ex = [lm.leftShoulder[0] - lm.rightShoulder[0], lm.leftShoulder[1] - lm.rightShoulder[1]];
  const ey = [(lm.leftHip[0] + lm.rightHip[0] - lm.leftShoulder[0] - lm.rightShoulder[0]) / 2,
    (lm.leftHip[1] + lm.rightHip[1] - lm.leftShoulder[1] - lm.rightShoulder[1]) / 2];
  const crossZ = ex[0] * ey[1] - ex[1] * ey[0];
  return (crossZ > 0) !== Boolean(mirrored);
}

/**
 * Model (x,y) eklem noktalarından ekran noktalarına afin uydurur ve three.js için
 * sütun-öncelikli 4x4 matris döndürür. Ortografik kamera: x sağa, y YUKARI, 1 birim = 1 px.
 * @param {Record<string, number[]>} screen ekran pikseli (y aşağı)
 * @param {Record<string, number[]>} model model koordinatı (metre; +x hastanın solu, +y baş, +z ön)
 * @returns {{elements:number[], rms:number, scale:number, facing:boolean, mirroredMapping:boolean}}
 */
export function fitModelToScreen(screen, model, { mirrored = false, height } = {}) {
  const src = KEYS.map((k) => [model[k][0], model[k][1]]);
  const dst = KEYS.map((k) => [screen[k][0], height - screen[k][1]]); // y yukarı
  const { matrix, rms } = fitAffine(src, dst);
  const det = linearDeterminant(matrix);
  const scale = Math.sqrt(Math.abs(det));
  const facing = facesCamera(screen, mirrored);
  // Kameraya bakıyorsa modelin önü (+z) kameraya (+Z) döner; arkası dönükse tersi.
  const sz = facing ? scale : -scale;
  const [[a, b, tx], [c, d, ty]] = matrix;
  return {
    // three.js Matrix4.elements (sütun öncelikli)
    elements: [a, c, 0, 0, b, d, 0, 0, 0, 0, sz, 0, tx, ty, 0, 1],
    rms,
    scale,
    facing,
    mirroredMapping: det < 0,
  };
}

/** Takip kalitesi: görünürlük eşiği ve makul gövde oranı kontrolü. */
export function assessPose(lm, visibility, minVis = 0.5) {
  const shouldersOk = visibility.leftShoulder >= minVis && visibility.rightShoulder >= minVis;
  const hipsOk = visibility.leftHip >= minVis && visibility.rightHip >= minVis;
  if (!shouldersOk) return { ok: false, reason: 'no-shoulders' };
  const w = Math.hypot(lm.leftShoulder[0] - lm.rightShoulder[0], lm.leftShoulder[1] - lm.rightShoulder[1]);
  if (w < 30) return { ok: false, reason: 'too-far' };
  return { ok: true, partial: !hipsOk };
}

export const AR_MESSAGES_TR = {
  'no-shoulders': 'Vücut algılanamadı — omuzlarınız kadrajda olsun.',
  'too-far': 'Çok uzaktasınız — kameraya biraz yaklaşın.',
  partial: 'Kısmi takip: kalçalar görünmüyor, gövde oranından tahmin ediliyor.',
};
