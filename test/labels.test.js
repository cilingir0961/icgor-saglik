import { test } from 'node:test';
import assert from 'node:assert/strict';
import { layoutLabels, stackVertically } from '../src/render/labels.js';

const items = [
  { id: 'a', text: 'Sağ akciğer', anchor: [150, 200] },
  { id: 'b', text: 'Sol akciğer', anchor: [250, 200] },
  { id: 'c', text: 'Kalp', anchor: [215, 205] },
  { id: 'd', text: 'Karaciğer', anchor: [160, 300] },
  { id: 'e', text: 'Mide', anchor: [240, 302] },
  { id: 'f', text: 'Dalak', anchor: [265, 300] },
];
const opts = { width: 400, height: 600, lineHeight: 18 };

test('aynı sütundaki etiketler en az bir satır aralıklı (çakışma yok)', () => {
  const placed = layoutLabels(items, opts);
  assert.equal(placed.length, items.length);
  for (const side of ['left', 'right']) {
    const ys = placed.filter((p) => p.align === side).map((p) => p.y).sort((a, b) => a - b);
    for (let i = 1; i < ys.length; i++) assert.ok(ys[i] - ys[i - 1] >= 18 - 1e-9);
  }
});

test('etiketler organların dışına, doğru tarafa yerleşir ve ekranda kalır', () => {
  const measure = (t) => t.length * 7;
  for (const p of layoutLabels(items, { ...opts, measure })) {
    if (p.align === 'right') {
      assert.ok(p.x <= p.anchor[0]);
      assert.ok(p.x - measure(p.text) >= 0);
    } else {
      assert.ok(p.x >= p.anchor[0]);
      assert.ok(p.x + measure(p.text) <= 400);
    }
  }
});

test('stackVertically alt sınırı aşarsa yukarı iter', () => {
  const ys = stackVertically([90, 95, 100], 10, 0, 100);
  assert.deepEqual(ys, [80, 90, 100]);
});

test('boş girdi boş çıktı verir', () => {
  assert.deepEqual(layoutLabels([], opts), []);
});
