import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ORGANS } from '../src/anatomy/atlas.js';
import { buildOrganMeshes, buildDrawList, orbitTransform } from '../src/render/scene.js';

const meshes = buildOrganMeshes(ORGANS, { lat: 8, lon: 12 });
const ortho = (p) => [p[0] * 100, p[1] * 100, p[2] * 100];
const mirrorX = (p) => [-p[0] * 100, p[1] * 100, p[2] * 100];

test('çizim listesi uzaktan yakına sıralı', () => {
  const list = buildDrawList(meshes, ortho);
  assert.ok(list.length > 0);
  for (let i = 1; i < list.length; i++) assert.ok(list[i - 1].depth <= list[i].depth);
});

test('arka yüzler elenir: yaklaşık yarısı kalır', () => {
  const total = meshes.reduce((s, m) => s + m.mesh.triangles.length, 0);
  const n = buildDrawList(meshes, ortho).length;
  assert.ok(n > total * 0.35 && n < total * 0.65, `${n}/${total}`);
});

test('ayna dönüşümünde de eleme doğru çalışır (sarım yönünden bağımsız)', () => {
  assert.equal(buildDrawList(meshes, mirrorX).length, buildDrawList(meshes, ortho).length);
});

test('görünürlük filtresi uygulanır', () => {
  const list = buildDrawList(meshes, ortho, { visible: new Set(['heart']) });
  assert.ok(list.length > 0 && list.every((t) => t.organId === 'heart'));
});

test('gölgeleme [0.35, 1] aralığında', () => {
  for (const t of buildDrawList(meshes, ortho)) assert.ok(t.shade >= 0.35 && t.shade <= 1 + 1e-9);
});

test('yörünge görünümü: pivot ekran merkezine düşer; yaw=0da kişinin solu ekranın sağında', () => {
  const T = orbitTransform({ yaw: 0, pitch: 0, zoom: 1, width: 400, height: 600, pivot: [0, 0.6, 0] });
  const c = T([0, 0.6, 0]);
  assert.ok(Math.abs(c[0] - 200) < 1e-9 && Math.abs(c[1] - 300) < 1e-9);
  assert.ok(T([0.2, 0.6, 0])[0] > 200);
});

test('yörünge görünümü: 180° dönüşte ön yapılar arkaya geçer', () => {
  const T0 = orbitTransform({ yaw: 0, pitch: 0, zoom: 1, width: 400, height: 400 });
  const T1 = orbitTransform({ yaw: Math.PI, pitch: 0, zoom: 1, width: 400, height: 400 });
  const front = [0, 0.6, 0.1], back = [0, 0.6, -0.1];
  assert.ok(T0(front)[2] > T0(back)[2]);
  assert.ok(T1(front)[2] < T1(back)[2]);
});
