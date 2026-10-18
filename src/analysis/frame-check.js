// Kare düzeyinde anatomik tutarlılık kapısı (saf). Tarama hareket testleri ve kamera koçu AYNI kuralı kullanır.
//
// Neden: scripts/arm-diagnose.mjs — sentetik figürde kollar ~120–126° yükseldiğinde MediaPipe iskeleti içe
// "çökertti": omuz noktaları 60–70 px içe kayıp sol/sağ sırası ters döndü, bilekler orta çizginin karşı tarafına
// geçti; görünürlük yine 0,95–0,99 idi (görünürlük kapısı yakalayamaz). Bu kareler simetrik harekette ~21°
// sahte sağ–sol fark üretti. Böyle kareler ölçümden ÇIKARILIR (ortalamaya katılmaz).
//
// Kurallar (önden görünüş, aynasız görüntü koordinatı; kişinin solu ekranın sağında):
//  1) Omuz sırası kalça sırasıyla aynı olmalı (ikisi de kişinin solu ekranın aynı tarafında).
//  2) Omuz genişliği, kalibrasyon genişliğinin en az %60'ı olmalı (çökme).
//  3) Her dirsek kendi omuzunun bulunduğu tarafta olmalı (orta çizgiyi geçmemeli). Bilek bilerek denetlenmez:
//     kollar tam yukarıdayken eller baş üstünde birleşebilir veya çaprazlanabilir (doğru kareyi atmamak için).

import { MP } from './geometry.js';

const x = (lm, k) => lm[MP[k]][0];
export const MIN_WIDTH_FRAC = 0.6;

/** İlk kareler (dinlenme) için omuz genişliği referansı (normalize x). */
export function shoulderRef(frames) {
  const w = frames.map((lm) => Math.abs(x(lm, 'leftShoulder') - x(lm, 'rightShoulder'))).filter((v) => v > 0).sort((a, b) => a - b);
  return w.length ? w[w.length >> 1] : null;
}

/**
 * @param {number[][]} lm 33 nokta [x,y,z,vis] (normalize)
 * @param {{refWidth?:number|null}} o
 * @returns {{ok:boolean, why:string|null}}
 */
export function frontArmFrameOk(lm, { refWidth = null } = {}) {
  if (!lm) return { ok: false, why: 'kişi yok' };
  const shSign = Math.sign(x(lm, 'leftShoulder') - x(lm, 'rightShoulder'));
  const hipSign = Math.sign(x(lm, 'leftHip') - x(lm, 'rightHip'));
  if (shSign === 0 || hipSign === 0 || shSign !== hipSign) return { ok: false, why: 'omuz ve kalça sırası tutarsız (sol/sağ karışması)' };
  const width = Math.abs(x(lm, 'leftShoulder') - x(lm, 'rightShoulder'));
  if (refWidth && width < MIN_WIDTH_FRAC * refWidth) return { ok: false, why: 'omuz genişliği beklenenden çok dar (iskelet çökmesi)' };
  const midX = (x(lm, 'leftShoulder') + x(lm, 'rightShoulder')) / 2;
  for (const s of ['left', 'right']) {
    const side = Math.sign(x(lm, `${s}Shoulder`) - midX);
    if (Math.sign(x(lm, `${s}Elbow`) - midX) !== side) return { ok: false, why: `${s === 'left' ? 'sol' : 'sağ'} dirsek orta çizginin karşı tarafında` };
  }
  return { ok: true, why: null };
}
