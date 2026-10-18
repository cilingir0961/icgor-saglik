// "Bana Anlat" vücut bölgeleri ve ölçüm → bölge eşlemesi (saf).
//
// Kural: bir bölgeye yalnızca o bölgeyi gerçekten ölçen gösterge bağlanır. Kameranın göremediği yapılar
// (omurga şekli, disk, kas dokusu, sinir, organ) için bölge YOKTUR. Konumlar atlas model uzayındadır
// (+X kişinin solu, +Y baş, +Z ön; metre) ve yalnızca işaretin 3B atlas üzerindeki yeridir.

export const BODY_REGIONS = {
  'bas-boyun': { tr: 'Baş ve boyun', short: 'Boyun', anchor: [0, 1.47, 0.05], topic: 'head-forward', exRegion: 'boyun', highlight: ['mus-head-neck', 'skull', 'spine'] },
  'omuz-L': { tr: 'Sol omuz', short: 'Sol omuz', side: 'L', joint: 'shoulder-L', anchor: [0.17, 1.40, 0.02], topic: 'shoulder-level', exRegion: 'omuz', highlight: ['mus-shoulder-arm', 'upper-limb-bones'] },
  'omuz-R': { tr: 'Sağ omuz', short: 'Sağ omuz', side: 'R', joint: 'shoulder-R', anchor: [-0.17, 1.40, 0.02], topic: 'shoulder-level', exRegion: 'omuz', highlight: ['mus-shoulder-arm', 'upper-limb-bones'] },
  govde: { tr: 'Gövde', short: 'Gövde', anchor: [0, 1.15, 0.10], topic: 'trunk-lateral', exRegion: 'bel', highlight: ['spine', 'mus-back', 'mus-abdomen'] },
  kalca: { tr: 'Kalça ve leğen', short: 'Kalça', anchor: [0, 0.93, 0.08], topic: 'hip-level', exRegion: 'bel', highlight: ['pelvis', 'mus-hip-thigh'] },
  'diz-L': { tr: 'Sol diz', short: 'Sol diz', side: 'L', joint: 'knee-L', anchor: [0.076, 0.46, 0.03], topic: 'squat', exRegion: 'diz', highlight: ['lower-limb-bones', 'mus-hip-thigh', 'mus-leg-foot'] },
  'diz-R': { tr: 'Sağ diz', short: 'Sağ diz', side: 'R', joint: 'knee-R', anchor: [-0.074, 0.46, 0.03], topic: 'squat', exRegion: 'diz', highlight: ['lower-limb-bones', 'mus-hip-thigh', 'mus-leg-foot'] },
  denge: { tr: 'Ayak bilekleri ve denge', short: 'Denge', anchor: [0, 0.09, 0.06], topic: 'single-leg', exRegion: 'denge', highlight: ['mus-leg-foot', 'lower-limb-bones'] },
};

/**
 * Göstergenin hangi bölgelere ve hangi türde kanıt olduğuna dair eşleme.
 *  kind: 'deviation' — nötr referanstan sapma (posture.js distinguishable ile karar)
 *        'asym'      — sağ–sol fark (|fark| > 2u ise ayırt edilebilir)
 *        'measure'   — ölçüldü ama bir referansa göre yorumlanmaz (hareket açıklığı, nötrü kişiye bağlı değerler)
 *        'consistency' — tekrarlar arası tutarlılık (olumlu gözlem kaynağı)
 *  sideOf: 'L'|'R' — yalnızca o taraf bölgesine bağlanır
 */
export const POSTURE_MAP = {
  shoulderLevel: { regions: ['omuz-L', 'omuz-R'], kind: 'deviation', test: 'Duruş (önden/arkadan)' },
  headTilt: { regions: ['bas-boyun'], kind: 'deviation', test: 'Duruş (önden)' },
  trunkLateral: { regions: ['govde'], kind: 'deviation', test: 'Duruş (önden/arkadan)' },
  trunkForward: { regions: ['govde'], kind: 'deviation', test: 'Duruş (yandan)' },
  hipLevel: { regions: ['kalca'], kind: 'deviation', test: 'Duruş (önden/arkadan)' },
  headForwardCm: { regions: ['bas-boyun'], kind: 'measure', test: 'Duruş (yandan)' },
  earShoulderAngle: { regions: ['bas-boyun'], kind: 'measure', test: 'Duruş (yandan)' },
  kneeSagittal: { regions: ['diz-L', 'diz-R'], kind: 'measure', test: 'Duruş (yandan)' },
};

export const MOVEMENT_MAP = {
  'kol-kaldirma': {
    abductionL: { regions: ['omuz-L'], kind: 'measure', sideOf: 'L' },
    abductionR: { regions: ['omuz-R'], kind: 'measure', sideOf: 'R' },
    abductionAsym: { regions: ['omuz-L', 'omuz-R'], kind: 'asym', higher: ['sol', 'sağ'] },
  },
  comelme: {
    kneeMin: { regions: ['diz-L', 'diz-R'], kind: 'measure' },
    hipMin: { regions: ['kalca'], kind: 'measure' },
    trunkLean: { regions: ['govde'], kind: 'measure' },
    depthConsistency: { regions: ['diz-L', 'diz-R'], kind: 'consistency' },
  },
  'one-egilme': {
    trunkFlexMax: { regions: ['govde'], kind: 'measure' },
    fingerFloor: { regions: ['govde'], kind: 'measure' },
  },
  'tek-ayak': {
    holdL: { regions: ['denge'], kind: 'measure' },
    holdR: { regions: ['denge'], kind: 'measure' },
  },
  boyun: {
    latFlexL: { regions: ['bas-boyun'], kind: 'measure' },
    latFlexR: { regions: ['bas-boyun'], kind: 'measure' },
    latAsym: { regions: ['bas-boyun'], kind: 'asym', higher: ['sola', 'sağa'] },
  },
  yuruyus: {
    cadence: { regions: ['denge'], kind: 'measure' },
  },
};

/** Kamera koçu (antrenman) kayıtlarından gelen göstergeler. */
export const COACH_MAP = {
  'arm-raise': { regions: ['omuz-L', 'omuz-R'], test: 'Kamera koçu — kol kaldırma' },
  squat: { regions: ['diz-L', 'diz-R'], test: 'Kamera koçu — squat' },
  'sit-to-stand': { regions: ['diz-L', 'diz-R'], test: 'Kamera koçu — otur-kalk' },
};

/** Ekranda gösterilen renk durumu. Kırmızı bilerek YOK: kameradan tıbbi risk sınıfı çıkarılmaz. */
export const STATUS = {
  yesil: { tr: 'Belirgin fark görülmedi', color: 'green', rank: 1 },
  sari: { tr: 'Tekrar ölçüm / dikkat önerilir', color: 'yellow', rank: 3 },
  turuncu: { tr: 'Birden fazla ölçümde süren fark', color: 'orange', rank: 4 },
  gri: { tr: 'Ölçülmedi / yeterli veri yok', color: 'gray', rank: 0 },
};
