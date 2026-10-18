// Çizim listesi üretimi: saf fonksiyonlar, DOM/Canvas'a bağımlı değil (test edilebilir).
// Ekran uzayı: x sağa, y aşağı, z izleyiciye doğru (büyük z = daha yakın).

import { cross, dot, mulMat3, mulMat3Vec, normalize, rotationX, rotationY, sub } from '../core/vec3.js';
import { ellipsoidMesh } from '../anatomy/mesh.js';

const LIGHT_DIR = normalize([-0.4, -0.6, 1]); // sol-üst-önden

/** Atlas organlarından ağları bir kez üretir. */
export function buildOrganMeshes(organs, detail = { lat: 12, lon: 18 }) {
  return organs.map((o) => ({ organ: o, mesh: ellipsoidMesh(o.center, o.radii, detail.lat, detail.lon) }));
}

/**
 * @param {Array<{organ, mesh}>} organMeshes
 * @param {(p:number[]) => number[]} toScreen atlas noktası → [x, y, z]
 * @param {{visible?: Set<string>, alpha?: number}} [opts]
 * @returns {Array<{points:number[][], depth:number, color:string, shade:number, alpha:number, organId:string}>}
 *   uzaktan yakına sıralı (ressam algoritması).
 */
export function buildDrawList(organMeshes, toScreen, opts = {}) {
  const out = [];
  const alpha = opts.alpha ?? 0.85;
  for (const { organ, mesh } of organMeshes) {
    if (opts.visible && !opts.visible.has(organ.id)) continue;
    const sv = mesh.vertices.map(toScreen);
    const sc = toScreen(organ.center);
    for (const [a, b, c] of mesh.triangles) {
      const A = sv[a], B = sv[b], C = sv[c];
      let n = cross(sub(B, A), sub(C, A));
      const centroid = [(A[0] + B[0] + C[0]) / 3, (A[1] + B[1] + C[1]) / 3, (A[2] + B[2] + C[2]) / 3];
      // Dış normali, sarım yönünden ve olası ayna dönüşümünden bağımsız biçimde belirle.
      if (dot(n, sub(centroid, sc)) < 0) n = [-n[0], -n[1], -n[2]];
      n = normalize(n);
      if (n[2] <= 0) continue; // arka yüz
      const shade = 0.35 + 0.65 * Math.max(0, dot(n, LIGHT_DIR));
      out.push({ points: [A, B, C], depth: centroid[2], color: organ.color, shade, alpha, organId: organ.id });
    }
  }
  out.sort((p, q) => p.depth - q.depth);
  return out;
}

/**
 * Serbest 3B görünüm için perspektif dönüşüm (kameradan bağımsız mod).
 * @param {{yaw:number, pitch:number, zoom:number, width:number, height:number, pivot?:number[]}} v
 */
export function orbitTransform(v) {
  const pivot = v.pivot ?? [0, 0.6, 0];
  const R = mulMat3(rotationX(v.pitch), rotationY(v.yaw));
  const D = 3; // kamera uzaklığı (atlas birimi)
  const f = Math.min(v.width, v.height) * 1.7 * v.zoom;
  const cx = v.width / 2, cy = v.height / 2;
  return (p) => {
    const q = mulMat3Vec(R, sub(p, pivot));
    const d = D - q[2];
    return [cx + (f * q[0]) / d, cy + (f * q[1]) / d, q[2]];
  };
}
