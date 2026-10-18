// ŞEMATİK EĞİTİM ATLASI — gerçek hasta verisi DEĞİLDİR.
//
// Organlar, "gövde koordinat sistemi"nde elipsoit olarak tanımlanır:
//   x: omuz genişliği birimi. 0 = orta hat, +x = kişinin SOLU.
//   y: 0 = omuz hattı, 1 = kalça (iliak tepe) hattı; aşağı doğru artar.
//   z: omuz genişliği birimi. +z = ön (anterior, kameraya doğru), -z = arka.
//
// Konumlar ortalama bir yetişkin için kaba yaklaşımlardır; kişiden kişiye
// belirgin biçimde değişir. Bir kişinin gerçek organ konumu, boyutu veya
// durumu YALNIZCA uygun tıbbi görüntüleme donanımıyla (BT, MR, ultrason vb.)
// belirlenebilir. Bu atlas teşhis amacıyla kullanılamaz.

export const ATLAS_VERSION = '0.1.0';

export const ORGANS = [
  { id: 'lung-right', tr: 'Sağ akciğer', en: 'Right lung', system: 'solunum',
    center: [-0.2, 0.26, 0.0], radii: [0.15, 0.25, 0.16], color: '#e8a0a8' },
  { id: 'lung-left', tr: 'Sol akciğer', en: 'Left lung', system: 'solunum',
    center: [0.21, 0.27, 0.0], radii: [0.13, 0.24, 0.16], color: '#e8a0a8' },
  { id: 'heart', tr: 'Kalp', en: 'Heart', system: 'dolaşım',
    center: [0.06, 0.32, 0.1], radii: [0.12, 0.13, 0.1], color: '#c8323c' },
  { id: 'liver', tr: 'Karaciğer', en: 'Liver', system: 'sindirim',
    center: [-0.14, 0.56, 0.04], radii: [0.24, 0.11, 0.14], color: '#8b3a2e' },
  { id: 'stomach', tr: 'Mide', en: 'Stomach', system: 'sindirim',
    center: [0.15, 0.58, 0.08], radii: [0.12, 0.09, 0.08], color: '#e3a76f' },
  { id: 'spleen', tr: 'Dalak', en: 'Spleen', system: 'lenfatik',
    center: [0.3, 0.56, -0.08], radii: [0.06, 0.08, 0.05], color: '#7a2f5c' },
  { id: 'kidney-right', tr: 'Sağ böbrek', en: 'Right kidney', system: 'boşaltım',
    center: [-0.13, 0.72, -0.15], radii: [0.05, 0.09, 0.05], color: '#a0522d' },
  { id: 'kidney-left', tr: 'Sol böbrek', en: 'Left kidney', system: 'boşaltım',
    center: [0.13, 0.7, -0.15], radii: [0.05, 0.09, 0.05], color: '#a0522d' },
  { id: 'intestines', tr: 'Bağırsaklar (basitleştirilmiş)', en: 'Intestines (simplified)', system: 'sindirim',
    center: [0.0, 0.86, 0.05], radii: [0.25, 0.14, 0.12], color: '#d9a066' },
  { id: 'bladder', tr: 'Mesane', en: 'Bladder', system: 'boşaltım',
    center: [0.0, 1.12, 0.06], radii: [0.07, 0.06, 0.06], color: '#d8c35a' },
];

export const getOrgan = (id) => ORGANS.find((o) => o.id === id);
