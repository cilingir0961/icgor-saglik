// Üçgen ağ işlemleri (saf, Node ve testlerde kullanılır).
// Ağ: { positions: Float32Array [x,y,z,...], indices: Uint32Array }

import { MeshoptSimplifier } from 'meshoptimizer';

/** Wavefront OBJ: yalnızca 'v' ve 'f' satırları; çokgenler yelpaze ile üçgenlenir. */
export function parseObj(text) {
  const pos = [];
  const idx = [];
  for (const line of text.split('\n')) {
    if (line.startsWith('v ')) {
      const p = line.trim().split(/\s+/);
      pos.push(+p[1], +p[2], +p[3]);
    } else if (line.startsWith('f ')) {
      const f = line.trim().split(/\s+/).slice(1).map((t) => {
        const i = parseInt(t, 10);
        return i < 0 ? pos.length / 3 + i : i - 1;
      });
      for (let k = 1; k + 1 < f.length; k++) idx.push(f[0], f[k], f[k + 1]);
    }
  }
  return { positions: Float32Array.from(pos), indices: Uint32Array.from(idx) };
}

export const triangleCount = (m) => m.indices.length / 3;

export function mergeMeshes(meshes) {
  const vCount = meshes.reduce((s, m) => s + m.positions.length, 0);
  const iCount = meshes.reduce((s, m) => s + m.indices.length, 0);
  const positions = new Float32Array(vCount);
  const indices = new Uint32Array(iCount);
  let vo = 0, io = 0;
  for (const m of meshes) {
    positions.set(m.positions, vo);
    const base = vo / 3;
    for (let i = 0; i < m.indices.length; i++) indices[io + i] = m.indices[i] + base;
    vo += m.positions.length;
    io += m.indices.length;
  }
  return { positions, indices };
}

/** Her köşeye p → f(p) uygular. */
export function transformMesh(m, f) {
  const out = new Float32Array(m.positions.length);
  for (let i = 0; i < m.positions.length; i += 3) {
    const q = f([m.positions[i], m.positions[i + 1], m.positions[i + 2]]);
    out[i] = q[0]; out[i + 1] = q[1]; out[i + 2] = q[2];
  }
  return { positions: out, indices: m.indices };
}

/** Aynı konumdaki (eps hassasiyetinde) köşeleri birleştirir, dejenere üçgenleri atar. */
export function weld(m, eps = 1e-4) {
  const map = new Map();
  const remap = new Uint32Array(m.positions.length / 3);
  const pos = [];
  for (let v = 0; v < remap.length; v++) {
    const x = m.positions[v * 3], y = m.positions[v * 3 + 1], z = m.positions[v * 3 + 2];
    const key = `${Math.round(x / eps)},${Math.round(y / eps)},${Math.round(z / eps)}`;
    let id = map.get(key);
    if (id === undefined) {
      id = pos.length / 3;
      map.set(key, id);
      pos.push(x, y, z);
    }
    remap[v] = id;
  }
  const idx = [];
  for (let t = 0; t < m.indices.length; t += 3) {
    const a = remap[m.indices[t]], b = remap[m.indices[t + 1]], c = remap[m.indices[t + 2]];
    if (a !== b && b !== c && a !== c) idx.push(a, b, c);
  }
  return { positions: Float32Array.from(pos), indices: Uint32Array.from(idx) };
}

/** Kullanılmayan köşeleri atar. */
export function compact(m) {
  const remap = new Int32Array(m.positions.length / 3).fill(-1);
  const pos = [];
  const idx = new Uint32Array(m.indices.length);
  for (let i = 0; i < m.indices.length; i++) {
    const v = m.indices[i];
    if (remap[v] < 0) {
      remap[v] = pos.length / 3;
      pos.push(m.positions[v * 3], m.positions[v * 3 + 1], m.positions[v * 3 + 2]);
    }
    idx[i] = remap[v];
  }
  return { positions: Float32Array.from(pos), indices: idx };
}

export const simplifierReady = MeshoptSimplifier.ready;

/**
 * meshoptimizer ile hedef üçgen sayısına sadeleştirir (kenar çöktürme, ikinci dereceden hata).
 * targetError göreli hatadır (ağ boyutuna oranla); hedef sayıya önce ulaşılırsa durur.
 */
export function simplify(m, targetTris, targetError = 0.02) {
  const current = triangleCount(m);
  if (targetTris >= current) return { mesh: m, error: 0 };
  const [indices, error] = MeshoptSimplifier.simplify(m.indices, m.positions, 3, Math.max(3, targetTris * 3), targetError, []);
  return { mesh: compact({ positions: m.positions, indices }), error };
}

/** Alan ağırlıklı yumuşak köşe normalleri. */
export function computeNormals(m) {
  const n = new Float32Array(m.positions.length);
  const P = m.positions;
  for (let t = 0; t < m.indices.length; t += 3) {
    const a = m.indices[t] * 3, b = m.indices[t + 1] * 3, c = m.indices[t + 2] * 3;
    const ux = P[b] - P[a], uy = P[b + 1] - P[a + 1], uz = P[b + 2] - P[a + 2];
    const vx = P[c] - P[a], vy = P[c + 1] - P[a + 1], vz = P[c + 2] - P[a + 2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    for (const v of [a, b, c]) { n[v] += nx; n[v + 1] += ny; n[v + 2] += nz; }
  }
  for (let i = 0; i < n.length; i += 3) {
    const l = Math.hypot(n[i], n[i + 1], n[i + 2]) || 1;
    n[i] /= l; n[i + 1] /= l; n[i + 2] /= l;
  }
  return n;
}

/** Alan ağırlıklı yüzey ağırlık merkezi ve sınır kutusu. */
export function measure(m) {
  const P = m.positions;
  let area = 0, cx = 0, cy = 0, cz = 0;
  for (let t = 0; t < m.indices.length; t += 3) {
    const a = m.indices[t] * 3, b = m.indices[t + 1] * 3, c = m.indices[t + 2] * 3;
    const ux = P[b] - P[a], uy = P[b + 1] - P[a + 1], uz = P[b + 2] - P[a + 2];
    const vx = P[c] - P[a], vy = P[c + 1] - P[a + 1], vz = P[c + 2] - P[a + 2];
    const s = Math.hypot(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx) / 2;
    area += s;
    cx += s * (P[a] + P[b] + P[c]) / 3;
    cy += s * (P[a + 1] + P[b + 1] + P[c + 1]) / 3;
    cz += s * (P[a + 2] + P[b + 2] + P[c + 2]) / 3;
  }
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < P.length; i += 3) {
    for (let k = 0; k < 3; k++) {
      if (P[i + k] < min[k]) min[k] = P[i + k];
      if (P[i + k] > max[k]) max[k] = P[i + k];
    }
  }
  return { area, centroid: area ? [cx / area, cy / area, cz / area] : [0, 0, 0], min, max };
}
