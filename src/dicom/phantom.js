// SENTETİK BT FANTOMU — gerçek hasta verisi DEĞİLDİR.
// Şematik atlastaki elipsoitlerden, yaklaşık Hounsfield değerleriyle bir hacim üretir.
// Amaç: görüntüleyiciyi gerçek sağlık verisi kullanmadan geliştirmek ve test etmek.

import { ORGANS } from '../anatomy/atlas.js';

// Yaklaşık kontrastsız BT değerleri (HU). Kaynak: genel radyoloji ders kitabı aralıkları.
export const ORGAN_HU = {
  'lung-right': -850, 'lung-left': -850, heart: 40, liver: 60, stomach: 25,
  spleen: 45, 'kidney-right': 30, 'kidney-left': 30, intestines: 15, bladder: 5,
};
const HU = { air: -1000, fat: -100, muscle: 50, bone: 700, marrow: 250 };

/**
 * @param {{voxel?:number, shoulderMm?:number, torsoMm?:number, noise?:number, seed?:number}} [opts]
 * @returns hacim nesnesi (buildVolume ile aynı arayüz) + {synthetic:true}
 */
export function makePhantom(opts = {}) {
  const voxel = opts.voxel ?? 3; // mm
  const W = opts.shoulderMm ?? 380; // atlas x/z birimi (omuz genişliği)
  const H = opts.torsoMm ?? 520; // atlas y birimi (omuz→kalça)
  const noise = opts.noise ?? 12;
  let seed = opts.seed ?? 1;
  const rand = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32) - 0.5;

  // Hacim sınırları (mm, LPS): x ±220, y ±150, z: kalça altı (atlas y=1.2) → omuz üstü (y=0.05).
  const nx = Math.round(440 / voxel), ny = Math.round(300 / voxel);
  const yTop = 0.05, yBottom = 1.2;
  const nz = Math.round(((yBottom - yTop) * H) / voxel);
  const data = new Float32Array(nx * ny * nz);
  const organs = ORGANS.map((o) => ({ ...o, hu: ORGAN_HU[o.id] ?? 40 }));

  for (let k = 0; k < nz; k++) {
    const zmm = k * voxel; // k=0 en alt (ayak tarafı)
    const ay = yBottom - zmm / H; // atlas y (aşağı artar)
    for (let j = 0; j < ny; j++) {
      const ymm = -150 + j * voxel; // + arka
      const az = -ymm / W; // atlas z (+ ön)
      for (let i = 0; i < nx; i++) {
        const xmm = -220 + i * voxel; // + hastanın solu
        const ax = xmm / W;
        // Gövde kesiti: elips; dış 12 mm yağ tabakası.
        const bx = 0.45, bz = 0.28;
        const r = (ax / bx) ** 2 + ((az - 0.02) / bz) ** 2;
        let v = HU.air;
        if (r <= 1) {
          const inner = (ax / (bx - 12 / W)) ** 2 + ((az - 0.02) / (bz - 12 / W)) ** 2;
          v = inner <= 1 ? HU.muscle : HU.fat;
          // Omurga: arka orta hatta silindir (kortikal kemik + ilik).
          const sr = Math.hypot(ax, az + 0.17);
          if (sr < 0.045) v = sr < 0.03 ? HU.marrow : HU.bone;
          for (const o of organs) {
            const d = ((ax - o.center[0]) / o.radii[0]) ** 2 + ((ay - o.center[1]) / o.radii[1]) ** 2
              + ((az - o.center[2]) / o.radii[2]) ** 2;
            if (d <= 1) v = o.hu;
          }
          v += noise * rand() * 2;
        }
        data[k * nx * ny + j * nx + i] = v;
      }
    }
  }
  return {
    nx, ny, nz,
    spacing: [voxel, voxel, voxel],
    data,
    rowDir: [1, 0, 0], colDir: [0, 1, 0], normal: [0, 0, 1],
    modality: 'CT',
    description: 'Sentetik fantom (gerçek veri değil)',
    window: [40, 400],
    warnings: [],
    synthetic: true,
    origin: [-220, -150, 0],
  };
}
