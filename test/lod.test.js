import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chooseLod, pixelRatioFor } from '../src/three/lod.js';

test('LOD: geçersiz kılma her zaman kazanır', () => {
  assert.equal(chooseLod({ override: 'high', isMobile: true }), 'high');
  assert.equal(chooseLod({ override: 'low' }), 'low');
  assert.equal(chooseLod({ override: 'bogus', cores: 16 }), 'high');
});

test('LOD: mobil, az bellek, az çekirdek veya veri tasarrufu → low', () => {
  assert.equal(chooseLod({ isMobile: true }), 'low');
  assert.equal(chooseLod({ deviceMemory: 4, cores: 16 }), 'low');
  assert.equal(chooseLod({ deviceMemory: 8, cores: 4 }), 'low');
  assert.equal(chooseLod({ saveData: true, cores: 16 }), 'low');
  assert.equal(chooseLod({ deviceMemory: 8, cores: 8 }), 'high');
  assert.equal(chooseLod({}), 'high');
});

test('piksel oranı sınırı', () => {
  assert.equal(pixelRatioFor('low', 3), 1.5);
  assert.equal(pixelRatioFor('high', 3), 2);
  assert.equal(pixelRatioFor('high', 1), 1);
  assert.equal(pixelRatioFor('low', undefined), 1);
});
