import { test } from 'node:test';
import assert from 'node:assert/strict';
import { OneEuroFilter } from '../src/core/one-euro.js';

test('ilk örnek değişmeden döner, sabit sinyal sabit kalır', () => {
  const f = new OneEuroFilter();
  assert.equal(f.filter(5, 0), 5);
  for (let i = 1; i < 50; i++) assert.ok(Math.abs(f.filter(5, i / 30) - 5) < 1e-12);
});

test('gürültüyü azaltır: çıktı varyansı girdiden belirgin düşük', () => {
  let seed = 42;
  const rand = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31) - 0.5;
  const f = new OneEuroFilter({ minCutoff: 1, beta: 0 });
  const inp = [], out = [];
  for (let i = 0; i < 300; i++) {
    const x = 100 + rand() * 10;
    inp.push(x);
    out.push(f.filter(x, i / 30));
  }
  const variance = (a) => { const m = a.reduce((s, v) => s + v, 0) / a.length; return a.reduce((s, v) => s + (v - m) ** 2, 0) / a.length; };
  assert.ok(variance(out.slice(30)) < variance(inp.slice(30)) * 0.3);
});

test('beta > 0 iken hızlı harekette gecikme daha azdır', () => {
  const run = (beta) => {
    const f = new OneEuroFilter({ minCutoff: 1, beta });
    let y = 0;
    for (let i = 0; i <= 30; i++) y = f.filter(i * 20, i / 30); // hızlı rampa
    return 600 - y; // gecikme
  };
  assert.ok(run(0.05) < run(0));
});

test('aynı veya geri giden zaman damgası durumu bozmaz', () => {
  const f = new OneEuroFilter();
  f.filter(1, 1);
  assert.equal(f.filter(100, 1), 1);
  assert.equal(f.filter(100, 0.5), 1);
});
