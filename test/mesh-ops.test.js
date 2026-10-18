import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseObj, mergeMeshes, weld, simplify, simplifierReady, computeNormals, measure, transformMesh, triangleCount, compact,
} from '../scripts/anatomy/mesh-ops.mjs';
import { unzipEntry } from '../scripts/anatomy/sources.mjs';
import { deflateRawSync } from 'node:zlib';

// Birim küp (OBJ, dörtgen yüzler)
const CUBE = `# küp
v 0 0 0
v 1 0 0
v 1 1 0
v 0 1 0
v 0 0 1
v 1 0 1
v 1 1 1
v 0 1 1
f 1 4 3 2
f 5 6 7 8
f 1 2 6 5
f 2 3 7 6
f 3 4 8 7
f 4 1 5 8
`;

test('OBJ okuma: dörtgenler üçgenlenir', () => {
  const m = parseObj(CUBE);
  assert.equal(m.positions.length, 24);
  assert.equal(triangleCount(m), 12);
});

test('ölçüm: küpün yüzey alanı 6, ağırlık merkezi ortada', () => {
  const r = measure(parseObj(CUBE));
  assert.ok(Math.abs(r.area - 6) < 1e-9);
  assert.ok(r.centroid.every((c) => Math.abs(c - 0.5) < 1e-9));
  assert.deepEqual(r.min, [0, 0, 0]);
  assert.deepEqual(r.max, [1, 1, 1]);
});

test('birleştirme + weld: yinelenen köşeler tekilleşir', () => {
  const a = parseObj(CUBE);
  const merged = mergeMeshes([a, a]);
  assert.equal(merged.positions.length, 48);
  const w = weld(merged);
  assert.equal(w.positions.length, 24);
});

test('normaller dışa bakar (küp köşesi normali merkezden uzağa)', () => {
  const m = parseObj(CUBE);
  const n = computeNormals(m);
  // köşe 7: (1,1,1) — üç dış yüzün ortalaması; yelpaze üçgenleme ağırlıkları eşit değil
  assert.ok(n[18] > 0.3 && n[19] > 0.3 && n[20] > 0.3);
  assert.ok(Math.abs(Math.hypot(n[18], n[19], n[20]) - 1) < 1e-6);
});

test('dönüşüm ve sıkıştırma', () => {
  const m = transformMesh(parseObj(CUBE), ([x, y, z]) => [x * 2, z, -y]);
  measure(m).max.forEach((v, i) => assert.ok(Math.abs(v - [2, 1, 0][i]) < 1e-9));
  const c = compact({ positions: m.positions, indices: Uint32Array.from([0, 1, 2]) });
  assert.equal(c.positions.length, 9);
});

test('sadeleştirme hedef üçgen sayısına iner ve şekli korur', async () => {
  await simplifierReady;
  // 40x40 ızgara küresi
  const pos = [], idx = [];
  const N = 40;
  for (let i = 0; i <= N; i++) for (let j = 0; j <= N; j++) {
    const th = (i / N) * Math.PI, ph = (j / N) * 2 * Math.PI;
    pos.push(Math.sin(th) * Math.cos(ph), Math.cos(th), Math.sin(th) * Math.sin(ph));
  }
  for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
    const a = i * (N + 1) + j, b = a + 1, c = a + N + 1, d = c + 1;
    idx.push(a, c, b, b, c, d);
  }
  const sphere = weld({ positions: Float32Array.from(pos), indices: Uint32Array.from(idx) });
  const before = triangleCount(sphere);
  const { mesh } = simplify(sphere, 400, 0.05);
  assert.ok(triangleCount(mesh) <= 400 && triangleCount(mesh) > 200, `${before} → ${triangleCount(mesh)}`);
  const r = measure(mesh);
  assert.ok(r.centroid.every((c) => Math.abs(c) < 0.05), 'merkez korunur');
  assert.ok(r.max[0] > 0.95 && r.min[1] < -0.95, 'boyut korunur');
});

test('zip okuyucu: deflate girdisini açar', () => {
  const data = Buffer.from('anatomi verisi '.repeat(50));
  const comp = deflateRawSync(data);
  const name = Buffer.from('a/model.glb');
  const local = Buffer.alloc(30); local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(8, 8);
  local.writeUInt32LE(comp.length, 18); local.writeUInt16LE(name.length, 26);
  const central = Buffer.alloc(46); central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE(8, 10);
  central.writeUInt32LE(comp.length, 20); central.writeUInt16LE(name.length, 28); central.writeUInt32LE(0, 42);
  const cdOffset = 30 + name.length + comp.length;
  const eocd = Buffer.alloc(22); eocd.writeUInt32LE(0x06054b50, 0); eocd.writeUInt16LE(1, 10); eocd.writeUInt32LE(cdOffset, 16);
  const zip = Buffer.concat([local, name, comp, central, name, eocd]);
  assert.equal(unzipEntry(zip, (n) => n.endsWith('.glb')).toString(), data.toString());
});

test('işaretli hacim: dışa dönük küp +1, ters çevrilince −1 ve orientOutward düzeltir', async () => {
  const { signedVolume, flipWinding, orientOutward } = await import('../scripts/anatomy/mesh-ops.mjs');
  const cube = parseObj(CUBE);
  assert.ok(Math.abs(signedVolume(cube) - 1) < 1e-9);
  const inv = flipWinding(cube);
  assert.ok(Math.abs(signedVolume(inv) + 1) < 1e-9);
  const fixed = orientOutward(inv);
  assert.ok(fixed.flipped);
  assert.ok(signedVolume(fixed.mesh) > 0);
  assert.equal(orientOutward(cube).flipped, false);
});

test('AO: açık düzlemde 1, kapalı köşe içinde karanlık', async () => {
  const { bakeAO, hemisphereDirections } = await import('../scripts/anatomy/ao.mjs');
  const d = hemisphereDirections(32);
  assert.ok(d.every(([x, y, z]) => z > 0 && Math.abs(Math.hypot(x, y, z) - 1) < 1e-9));
  // Zemin (y=0, normal +y) ve üstte yakın bir tavan (y=0.01, normal -y)
  const quad = (y, flip, r = 1) => ({
    positions: Float32Array.from([-r, y, -r, r, y, -r, r, y, r, -r, y, r]),
    indices: Uint32Array.from(flip ? [0, 1, 2, 0, 2, 3] : [0, 2, 1, 0, 3, 2]),
  });
  const up = Float32Array.from([0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0]);
  const down = Float32Array.from([0, -1, 0, 0, -1, 0, 0, -1, 0, 0, -1, 0]);
  const open = bakeAO([{ mesh: quad(0, false), normals: up }], { maxDist: 0.05 });
  assert.ok(open[0].every((v) => v === 1), 'açık yüzey aydınlık');
  const closed = bakeAO([{ mesh: quad(0, false), normals: up }, { mesh: quad(0.01, true, 3), normals: down }], { maxDist: 0.05 });
  assert.ok(closed[0][0] < 0.6, `kapalı aralık karanlık: ${closed[0][0]}`);
});

test('ICP: bilinen afin bozulmayı geri bulur (küre yüzeyi)', async () => {
  const { icpAffine, compose } = await import('../scripts/anatomy/register.mjs');
  const { applyAffine } = await import('../src/core/affine.js');
  const pos = [], idx = [];
  const N = 24;
  for (let i = 0; i <= N; i++) for (let j = 0; j <= N; j++) {
    const th = (i / N) * Math.PI, ph = (j / N) * 2 * Math.PI;
    pos.push(40 * Math.sin(th) * Math.cos(ph), 120 * Math.cos(th), 25 * Math.sin(th) * Math.sin(ph)); // uzun kemik benzeri elipsoit
  }
  for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) { const a = i * (N + 1) + j, b = a + 1, c = a + N + 1, d = c + 1; idx.push(a, c, b, b, c, d); }
  const target = { positions: Float32Array.from(pos), indices: Uint32Array.from(idx) };
  const T = [[1.03, 0.05, 0, 30], [-0.04, 0.98, 0.02, 95], [0, 0.03, 1.01, 60]]; // ~1 cm kayma + küçük dönme/ölçek
  const src = { positions: Float32Array.from(target.positions), indices: target.indices };
  for (let i = 0; i < src.positions.length; i += 3) {
    const p = applyAffine(T, [src.positions[i], src.positions[i + 1], src.positions[i + 2]]);
    src.positions.set(p, i);
  }
  const r = icpAffine([src], [target]);
  assert.ok(r.initialRmsMm > 1, `başlangıç (merkez hizası sonrası) ${r.initialRmsMm}`);
  assert.ok(r.rmsMm < 0.5, `son RMS ${r.rmsMm} mm`);
  // compose doğrulaması
  const I = compose([[1, 0, 0, 1], [0, 1, 0, 2], [0, 0, 1, 3]], [[2, 0, 0, 0], [0, 2, 0, 0], [0, 0, 2, 0]]);
  assert.deepEqual(I, [[2, 0, 0, 1], [0, 2, 0, 2], [0, 0, 2, 3]]);
});
