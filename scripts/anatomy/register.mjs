// Yüzey kaydı (registration): kırpılmış afin ICP (Iterative Closest Point).
// Z-Anatomy iskeleti BodyParts3D'den türetilmiş ama yeniden düzenlenmiştir (konum/boy farkları ~1 cm);
// kaslarını BodyParts3D iskeletine oturtmak için her eklem segmentinde kemik yüzeyleri eşlenir.

import * as THREE from 'three';
import { MeshBVH } from 'three-mesh-bvh';
import { fitAffine, applyAffine } from '../../src/core/affine.js';
import { mergeMeshes } from './mesh-ops.mjs';

/** Kaynak noktalardan düzgün alt örnek. */
export function samplePoints(mesh, max = 3000) {
  const n = mesh.positions.length / 3;
  const step = Math.max(1, Math.floor(n / max));
  const out = [];
  for (let i = 0; i < n; i += step) out.push([mesh.positions[i * 3], mesh.positions[i * 3 + 1], mesh.positions[i * 3 + 2]]);
  return out;
}

/**
 * @param {Array<{positions,indices}>} sourceMeshes taşınacak (Z-Anatomy) kemikler
 * @param {Array<{positions,indices}>} targetMeshes hedef (BodyParts3D) kemikler
 * @param {{iterations?:number, trim?:number}} opts trim: medyan uzaklığın kaç katının üstü aykırı sayılır
 * @returns {{matrix:number[][], rmsMm:number, initialRmsMm:number, iterations:number, inliers:number}}
 */
export function icpAffine(sourceMeshes, targetMeshes, { iterations = 40, trim = 2.5 } = {}) {
  const target = mergeMeshes(targetMeshes);
  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.BufferAttribute(target.positions, 3));
  geom.setIndex(new THREE.BufferAttribute(target.indices, 1));
  const bvh = new MeshBVH(geom);
  const src = samplePoints(mergeMeshes(sourceMeshes));

  // Başlangıç: ağırlık merkezlerini çakıştıran öteleme
  const mean = (pts) => [0, 1, 2].map((k) => pts.reduce((s, p) => s + p[k], 0) / pts.length);
  const tPts = samplePoints(target);
  const ms = mean(src), mt = mean(tPts);
  let M = [[1, 0, 0, mt[0] - ms[0]], [0, 1, 0, mt[1] - ms[1]], [0, 0, 1, mt[2] - ms[2]]];

  const hit = { point: new THREE.Vector3(), distance: 0 };
  const q = new THREE.Vector3();
  const closest = (pts) => pts.map((p) => {
    q.set(p[0], p[1], p[2]);
    bvh.closestPointToPoint(q, hit);
    return { p, c: [hit.point.x, hit.point.y, hit.point.z], d: hit.distance };
  });
  const rms = (pairs) => Math.sqrt(pairs.reduce((s, x) => s + x.d * x.d, 0) / pairs.length);

  let initialRms = null, last = Infinity, it = 0, inliers = 0, cur = Infinity;
  for (; it < iterations; it++) {
    const moved = src.map((p) => applyAffine(M, p));
    const pairs = closest(moved);
    cur = rms(pairs);
    initialRms ??= cur;
    const med = [...pairs.map((x) => x.d)].sort((a, b) => a - b)[pairs.length >> 1];
    const keep = pairs.map((x, i) => ({ ...x, i })).filter((x) => x.d <= Math.max(trim * med, 1e-6));
    inliers = keep.length;
    // Taşınmış noktalardan hedefe artımlı afin, sonra birleştir: M ← D ∘ M
    const D = fitAffine(keep.map((x) => moved[x.i]), keep.map((x) => x.c)).matrix;
    M = compose(D, M);
    if (Math.abs(last - cur) < 1e-3 * Math.max(cur, 1)) break;
    last = cur;
  }
  const final = closest(src.map((p) => applyAffine(M, p)));
  const sorted = final.map((x) => x.d).sort((a, b) => a - b);
  return {
    matrix: M,
    rmsMm: +rms(final).toFixed(2),
    medianMm: +sorted[sorted.length >> 1].toFixed(2),
    p90Mm: +sorted[Math.floor(sorted.length * 0.9)].toFixed(2),
    initialRmsMm: +initialRms.toFixed(2),
    iterations: it + 1,
    inliers,
  };
}

/** İki 3x4 afin matrisin bileşkesi: (A ∘ B)(p) = A(B(p)) */
export function compose(A, B) {
  return [0, 1, 2].map((r) => [0, 1, 2, 3].map((c) => {
    let v = A[r][0] * B[0][c] + A[r][1] * B[1][c] + A[r][2] * B[2][c];
    if (c === 3) v += A[r][3];
    return v;
  }));
}
