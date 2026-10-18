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
