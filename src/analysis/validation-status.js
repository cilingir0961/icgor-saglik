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
  // Sentetik simetrik kol kaldırmada sağ kol +16,6° fazla ölçüldü (gerçekte olmayan ~21° sağ–sol fark);
  // ayrıntı: docs/bench/coach-bench-summary.json, docs/INSIGHT.md "Kol kaldırma hatası".
  'kol-kaldirma:abductionAsym': { status: 'guvenilmez', why: 'Kol başın üstüne yaklaştığında vücut takibi dirsek noktasını yanlış yerleştirebiliyor; sentetik testte gerçekte olmayan ~21° sağ–sol fark ölçüldü. Düzeltme doğrulanana kadar bu ölçümden sonuç çıkarılmıyor.' },
  'kol-kaldirma:abductionL': { status: 'guvenilmez', why: 'Kol kaldırma açısı doğrulama bekliyor.' },
  'kol-kaldirma:abductionR': { status: 'guvenilmez', why: 'Kol kaldırma açısı doğrulama bekliyor.' },
  'coach:arm-raise:asym': { status: 'guvenilmez', why: 'Kamera koçunun kol kaldırma sağ–sol karşılaştırması doğrulama bekliyor.' },
  'coach:arm-raise:extreme': { status: 'guvenilmez', why: 'Kamera koçunun kol kaldırma açısı doğrulama bekliyor.' },
};

/** @returns {{status:'guvenilmez'|'deneysel'|'normal', why:string|null}} */
export function metricStatus(key) {
  const s = METRIC_STATUS[key];
  return s ? { status: s.status, why: s.why } : { status: 'normal', why: null };
}

export const isUnreliable = (key) => METRIC_STATUS[key]?.status === 'guvenilmez';
