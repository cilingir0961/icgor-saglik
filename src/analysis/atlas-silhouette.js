// OTOMATİK ÜRETİLDİ: node scripts/atlas-silhouette.mjs — elle düzenlemeyin.
// Atlas deri modelinin (BodyParts3D, boy 171.9 cm) kesitleri, vücut boyunun metresi başına cm.
// Dijital ikiz çarpanı = kişinin ölçüsü / (bu değer × kişinin boyu, m). Atlas tek bir referans vücuttur, norm değildir.
export const ATLAS_HEIGHT_CM = 171.9;
export const ATLAS_SILHOUETTE = {
  "chest": {
    "width": 18.19,
    "depth": 14.18,
    "perimeter": 53.31
  },
  "waist": {
    "width": 16.37,
    "depth": 12.38,
    "perimeter": 45.51
  },
  "hip": {
    "width": 19.13,
    "depth": 13.09,
    "perimeter": 52.75
  }
};
