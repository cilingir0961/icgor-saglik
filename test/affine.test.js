import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fitAffine, applyAffine, linearDeterminant, solve } from '../src/core/affine.js';

const near = (a, b, eps = 1e-9) => a.every((v, i) => Math.abs(v - b[i]) < eps);

test('3B: bilinen afin dönüşüm gürültüsüz veriden tam olarak geri bulunur', () => {
  const A = [[1.1, 0.2, -0.1, 5], [-0.05, 0.9, 0.3, -2], [0.1, 0, 1.2, 0.5]];
  const src = [[0, 0, 0], [1, 0, 0], [0, 1, 0], [0, 0, 1], [1, 2, 3], [-2, 1, 0.5]];
  const dst = src.map((p) => applyAffine(A, p));
  const { matrix, rms } = fitAffine(src, dst);
  assert.ok(rms < 1e-9);
  matrix.forEach((row, i) => assert.ok(near(row, A[i]), `satır ${i}`));
});

test('2B: dönüş+ölçek+öteleme bulunur ve aynalama determinantla saptanır', () => {
  const src = [[0, 0], [1, 0], [0, 1], [1, 1]];
  const rot = src.map(([x, y]) => [2 * y + 3, 2 * x - 1]); // eksen değişimi = aynalama
  const { matrix } = fitAffine(src, rot);
  assert.ok(linearDeterminant(matrix) < 0);
  const plain = fitAffine(src, src.map(([x, y]) => [x * 2 + 1, y * 2]));
  assert.ok(linearDeterminant(plain.matrix) > 0);
});

test('gürültülü veride RMS kalıntı raporlanır', () => {
  const src = [[0, 0], [10, 0], [0, 10], [10, 10], [5, 5]];
  const dst = src.map(([x, y], i) => [x + (i === 4 ? 1 : 0), y]);
  const { rms, residuals } = fitAffine(src, dst);
  assert.ok(rms > 0 && rms < 1);
  assert.equal(residuals.length, 5);
});

test('yetersiz veya doğrusal noktalar hata verir', () => {
  assert.throws(() => fitAffine([[0, 0], [1, 1]], [[0, 0], [1, 1]]), /en az 3/);
  assert.throws(() => fitAffine([[0, 0], [1, 1], [2, 2]], [[0, 0], [1, 1], [2, 2]]), /tekil/);
  assert.deepEqual(solve([[2, 0], [0, 4]], [2, 8]), [1, 2]);
});
