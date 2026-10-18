// Görüntüleme kaynağı mimarisi (saf). Üç veri türünü birbirinden kesin olarak ayırır:
//   1. atlas      — genel anatomi modeli (kişiye ait değil)
//   2. tracking   — kamera ile vücut dış hattı takibi (yaklaşık, iç organ görmez)
//   3. imaging    — tıbbi cihazdan gelen gerçek görüntü verisi (DICOM; ileride onaylı ultrason)
//
// Yeni bir tıbbi cihaz eklemek için `ImagingSourceKind` tanımı + bir bağdaştırıcı (adapter) gerekir.
// Bağdaştırıcı, onay (regulatory) bilgisi doğrulanmadan "imaging" sınıfında gösterilemez.

export const DATA_CLASSES = {
  atlas: { tr: 'Anatomik model (atlas)', personal: false, diagnostic: false },
  tracking: { tr: 'Kamera takibi (yaklaşık)', personal: true, diagnostic: false },
  imaging: { tr: 'Tıbbi görüntü', personal: true, diagnostic: false }, // bu uygulamada asla tanısal değildir
  synthetic: { tr: 'Sentetik veri', personal: false, diagnostic: false },
};

/**
 * @typedef {object} ImagingSourceKind
 * @property {string} id
 * @property {keyof DATA_CLASSES} dataClass
 * @property {string} tr kullanıcıya gösterilen ad
 * @property {'file'|'generated'|'device-stream'} transport
 * @property {boolean} requiresApprovedDevice gerçek cihaz akışı için onay şartı
 * @property {boolean} available bu sürümde kullanılabilir mi
 */

/** @type {Record<string, ImagingSourceKind>} */
export const SOURCE_KINDS = {
  'dicom-file': {
    id: 'dicom-file', dataClass: 'imaging', tr: 'DICOM dosyası (BT/MR)', transport: 'file',
    requiresApprovedDevice: false, available: true,
  },
  'synthetic-phantom': {
    id: 'synthetic-phantom', dataClass: 'synthetic', tr: 'Sentetik BT fantomu', transport: 'generated',
    requiresApprovedDevice: false, available: true,
  },
  // Gelecek: onaylı ultrason cihazı (ör. DICOM-US veya üretici SDK'sı üzerinden canlı akış).
  // Bu sürümde devre dışı; cihaz bağdaştırıcısı ve düzenleyici doğrulama olmadan etkinleştirilmemelidir.
  'ultrasound-device': {
    id: 'ultrasound-device', dataClass: 'imaging', tr: 'Onaylı ultrason cihazı (planlanan)', transport: 'device-stream',
    requiresApprovedDevice: true, available: false,
  },
};

/**
 * Bir cihaz bağdaştırıcısının kullanılabilir olup olmadığına karar verir.
 * @param {ImagingSourceKind} kind
 * @param {{regulatoryClearance?: {authority:string, id:string, verified:boolean}}} [device]
 */
export function canUseSource(kind, device) {
  if (!kind?.available) return { ok: false, reason: 'unavailable' };
  if (kind.requiresApprovedDevice && !device?.regulatoryClearance?.verified) return { ok: false, reason: 'unapproved-device' };
  return { ok: true };
}

/** Ekranda gösterilecek kaynak rozeti (sınıf + açıklama). */
export function provenanceBadge(kindId, extra = '') {
  const kind = SOURCE_KINDS[kindId];
  if (!kind) return { kind: 'none', text: 'Kaynak seçilmedi' };
  const cls = DATA_CLASSES[kind.dataClass];
  const base = kind.dataClass === 'synthetic'
    ? 'Sentetik fantom — gerçek hasta verisi değil'
    : `${cls.tr} · ${kind.tr} · cihazda işlenir, tanı amaçlı değil`;
  return { kind: kind.dataClass, text: extra ? `${base} · ${extra}` : base };
}
