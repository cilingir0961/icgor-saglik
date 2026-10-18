import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ellipsoidMesh } from '../src/anatomy/mesh.js';

test('köşe ve üçgen sayıları beklenen formüle uyar', () => {
  const lat = 8, lon = 12;
  const m = ellipsoidMesh([0, 0, 0], [1, 1, 1], lat, lon);
  assert.equal(m.vertices.length, (lat + 1) * lon);
  assert.equal(m.triangles.length, 2 * lon * (lat - 1));
});

test('tüm köşeler elipsoit yüzeyinde', () => {
  const c = [0.1, -0.2, 0.3], r = [0.5, 0.2, 0.3];
  const m = ellipsoidMesh(c, r, 10, 14);
  for (const v of m.vertices) {
    const s = ((v[0] - c[0]) / r[0]) ** 2 + ((v[1] - c[1]) / r[1]) ** 2 + ((v[2] - c[2]) / r[2]) ** 2;
    assert.ok(Math.abs(s - 1) < 1e-9);
  }
});

test('üçgen indeksleri geçerli ve dejenere üçgen yok', () => {
  const m = ellipsoidMesh([0, 0, 0], [1, 1, 1], 6, 8);
  for (const t of m.triangles) {
    assert.equal(new Set(t).size, 3);
    for (const i of t) assert.ok(i >= 0 && i < m.vertices.length);
  }
});
