// Köşe başına ortam kapatması (ambient occlusion) pişirme.
// Derleme sırasında bir kez hesaplanır, köşe rengi olarak saklanır: çalışma anında sıfır GPU maliyeti
// (ekran-uzayı AO'nun aksine mobilde pil/ısı yükü yoktur). Kıvrım ve girintiler (beyin kıvrımları,
// kas aralıkları, bağırsak katlantıları) koyulaşır; düz yüzeyler etkilenmez.

import * as THREE from 'three';
import { MeshBVH } from 'three-mesh-bvh';
import { mergeMeshes } from './mesh-ops.mjs';

/** Yarıküre üzerinde düzgün dağılmış (Fibonacci, kosinüs ağırlıklı) yönler; z = normal ekseni. */
export function hemisphereDirections(n) {
  const dirs = [];
  const golden = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < n; i++) {
    const r = Math.sqrt((i + 0.5) / n); // kosinüs ağırlıklı: sinθ = √u
    const phi = i * golden;
    dirs.push([r * Math.cos(phi), r * Math.sin(phi), Math.sqrt(1 - r * r)]);
  }
  return dirs;
}

/**
 * @param {Array<{mesh:{positions:Float32Array, indices:Uint32Array}, normals:Float32Array}>} prims aynı katmandaki tüm parçalar
 * @param {{rays?:number, maxDist?:number, strength?:number, floor?:number}} opts
 * @returns {Float32Array[]} her prim için köşe başına AO (0–1, 1 = açık)
 */
export function bakeAO(prims, { rays = 24, maxDist = 0.05, strength = 0.9, floor = 0.3 } = {}) {
  const merged = mergeMeshes(prims.map((p) => p.mesh));
  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.BufferAttribute(merged.positions, 3));
  geom.setIndex(new THREE.BufferAttribute(merged.indices, 1));
  const bvh = new MeshBVH(geom);
  const dirs = hemisphereDirections(rays);
  const ray = new THREE.Ray();
  const n = new THREE.Vector3(), t = new THREE.Vector3(), b = new THREE.Vector3(), up = new THREE.Vector3();
  const eps = maxDist * 0.01;
  return prims.map(({ mesh, normals }) => {
    const P = mesh.positions;
    const ao = new Float32Array(P.length / 3);
    for (let v = 0; v < ao.length; v++) {
      n.set(normals[v * 3], normals[v * 3 + 1], normals[v * 3 + 2]);
      up.set(Math.abs(n.y) < 0.9 ? 0 : 1, Math.abs(n.y) < 0.9 ? 1 : 0, 0);
      t.crossVectors(up, n).normalize();
      b.crossVectors(n, t);
      let occ = 0;
      for (const [x, y, z] of dirs) {
        ray.origin.set(P[v * 3] + n.x * eps, P[v * 3 + 1] + n.y * eps, P[v * 3 + 2] + n.z * eps);
        ray.direction.set(t.x * x + b.x * y + n.x * z, t.y * x + b.y * y + n.y * z, t.z * x + b.z * y + n.z * z);
        const hit = bvh.raycastFirst(ray, THREE.DoubleSide, 0, maxDist);
        if (hit) occ += 1 - hit.distance / maxDist; // yakın engel daha çok karartır
      }
      ao[v] = Math.max(floor, 1 - strength * (occ / dirs.length));
    }
    return ao;
  });
}
