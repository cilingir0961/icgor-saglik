// Gösterge doğrulama durumu (saf, TEK kaynak). Kamera koçu, tarama raporu ve "Bana Anlat" aynı listeyi kullanır:
// birinin güvenilmez saydığı ölçümü diğeri normal kabul edemez.
//
// 'guvenilmez': sentetik kıyasta belirsizlik payını aşan sistematik hata görüldü ve düzeltmesi henüz
//   doğrulanmadı → değer kullanıcıya renk/yorum olarak sunulmaz; "Ölçüm güvenilir değil, tekrar deneyin" yazılır.
// 'deneysel': doğruluk yeterince kanıtlanmadı → en fazla sarı (tekrar ölç), asla turuncu.

export const STATUS_TEXT = {
  guvenilmez: 'Ölçüm güvenilir değil, tekrar deneyin.',
};

/** Anahtar biçimi: tarama hareket testi 'kol-kaldirma:abductionAsym', koç 'coach:arm-raise:asym'. */
export const METRIC_STATUS = {
  // Kol kaldırma: sentetik simetrik dizide sağ kol +16,6° fazla ölçülüyordu (MediaPipe ~120–126°'de iskeleti
  // çökertiyor). Kare düzeyinde anatomik tutarlılık kapısıyla (frame-check.js) yeniden ölçüldü: simetrik fark
  // 0,1° (gerçek −0,1°), asimetrik fark 39,7° (gerçek 39,8°), en büyük açı hatası 4,9° < 6°; tekrar sayımı
  // değişmedi (docs/bench/coach-bench-summary.json). YALNIZCA SENTETİK doğrulama → gerçek cihaz/kişi
  // doğrulanana kadar 'deneysel': en fazla "tekrar ölç" (sarı), asla turuncu.
  'kol-kaldirma:abductionAsym': { status: 'deneysel', why: 'Kol kaldırma ölçümü yalnızca sentetik figürle doğrulandı; gerçek kişilerde doğruluğu henüz ölçülmedi.' },
  'kol-kaldirma:abductionL': { status: 'deneysel', why: 'Yalnızca sentetik figürle doğrulandı.' },
  'kol-kaldirma:abductionR': { status: 'deneysel', why: 'Yalnızca sentetik figürle doğrulandı.' },
  'coach:arm-raise:asym': { status: 'deneysel', why: 'Kamera koçu kol karşılaştırması yalnızca sentetik figürle doğrulandı.' },
  'coach:arm-raise:extreme': { status: 'deneysel', why: 'Yalnızca sentetik figürle doğrulandı.' },
};

/** @returns {{status:'guvenilmez'|'deneysel'|'normal', why:string|null}} */
export function metricStatus(key) {
  const s = METRIC_STATUS[key];
  return s ? { status: s.status, why: s.why } : { status: 'normal', why: null };
}

export const isUnreliable = (key) => METRIC_STATUS[key]?.status === 'guvenilmez';
