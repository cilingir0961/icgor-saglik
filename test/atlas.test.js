import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ORGANS, getOrgan } from '../src/anatomy/atlas.js';

test('her organın benzersiz kimliği, TR/EN adı ve geçerli rengi var', () => {
  const ids = new Set();
  for (const o of ORGANS) {
    assert.ok(!ids.has(o.id), `yinelenen kimlik: ${o.id}`);
    ids.add(o.id);
    assert.ok(o.tr && o.en, o.id);
    assert.match(o.color, /^#[0-9a-f]{6}$/i);
    assert.equal(o.center.length, 3);
    assert.ok(o.radii.every((r) => r > 0), o.id);
  }
});

test('sol/sağ yerleşim anatomik kurala uyar (+x = kişinin solu)', () => {
  assert.ok(getOrgan('heart').center[0] > 0, 'kalp hafif solda');
  assert.ok(getOrgan('liver').center[0] < 0, 'karaciğer sağda');
  assert.ok(getOrgan('spleen').center[0] > 0, 'dalak solda');
  assert.ok(getOrgan('stomach').center[0] > 0, 'mide solda');
  assert.ok(getOrgan('lung-left').center[0] > 0 && getOrgan('lung-right').center[0] < 0);
  assert.ok(getOrgan('kidney-left').center[0] > 0 && getOrgan('kidney-right').center[0] < 0);
});

test('dikey sıra: akciğerler/kalp diyaframın üstünde, mesane en altta', () => {
  const y = (id) => getOrgan(id).center[1];
  assert.ok(y('heart') < y('liver') && y('lung-right') < y('liver'));
  assert.ok(y('liver') < y('intestines') && y('intestines') < y('bladder'));
  assert.ok(Math.max(...ORGANS.map((o) => o.center[1])) === y('bladder'));
});

test('böbrekler retroperitoneal: karın organlarının arkasında (z < 0)', () => {
  assert.ok(getOrgan('kidney-left').center[2] < 0 && getOrgan('kidney-right').center[2] < 0);
  assert.ok(getOrgan('kidney-left').center[2] < getOrgan('intestines').center[2]);
});

test('organlar makul gövde sınırları içinde', () => {
  for (const o of ORGANS) {
    assert.ok(Math.abs(o.center[0]) + o.radii[0] <= 0.6, `${o.id} yatay taşıyor`);
    assert.ok(o.center[1] - o.radii[1] >= 0 && o.center[1] + o.radii[1] <= 1.3, `${o.id} dikey taşıyor`);
  }
});
