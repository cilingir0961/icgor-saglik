import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Rig } from '../src/three/rig.js';
import { heartCycle, heartScale, breathCycle, breathEffects, MOTIONS } from '../src/three/animations.js';

const manifest = JSON.parse(readFileSync(new URL('../assets/anatomy/manifest.json', import.meta.url)));
const J = manifest.joints;
const near = (a, b, eps = 1e-6) => a.every((v, i) => Math.abs(v - b[i]) < eps);

test('eklem merkezleri anatomik sırada: omuz > dirsek > bilek, kalça > diz > ayak bileği; sol +x', () => {
  for (const S of ['L', 'R']) {
    assert.ok(J[`shoulder-${S}`][1] > J[`elbow-${S}`][1] && J[`elbow-${S}`][1] > J[`wrist-${S}`][1]);
    assert.ok(J[`hip-${S}`][1] > J[`knee-${S}`][1] && J[`knee-${S}`][1] > J[`ankle-${S}`][1]);
  }
  assert.ok(J['shoulder-L'][0] > 0 && J['shoulder-R'][0] < 0);
  const humerus = J['shoulder-L'][1] - J['elbow-L'][1];
  const femur = J['hip-L'][1] - J['knee-L'][1];
  assert.ok(humerus > 0.25 && humerus < 0.36, `humerus ${humerus}`);
  assert.ok(femur > 0.38 && femur < 0.5, `femur ${femur}`);
});

test('dinlenme pozunda dönüşümler birim; eklem merkezleri sabit kalır', () => {
  const rig = new Rig(J).setPose({});
  assert.ok(near(rig.transformPoint('forearm-L', J['wrist-L']), J['wrist-L']));
  const r2 = new Rig(J).setPose({ 'shoulder-L': { abduct: 1 }, 'elbow-L': { flex: 1 } });
  assert.ok(near(r2.transformPoint('upperArm-L', J['shoulder-L']), J['shoulder-L']), 'omuz merkezi döner ama yer değiştirmez');
});

test('sol kol 90° yana kaldırılınca dirsek omuzun solunda ve aynı yükseklikte', () => {
  const rig = new Rig(J).setPose({ 'shoulder-L': { abduct: Math.PI / 2 } });
  const e = rig.transformPoint('upperArm-L', J['elbow-L']);
  assert.ok(e[0] > J['shoulder-L'][0] + 0.2, 'dirsek dışarıda');
  assert.ok(Math.abs(e[1] - J['shoulder-L'][1]) < 0.06, 'yaklaşık omuz hizasında');
  const rr = new Rig(J).setPose({ 'shoulder-R': { abduct: Math.PI / 2 } }).transformPoint('upperArm-R', J['elbow-R']);
  assert.ok(rr[0] < J['shoulder-R'][0] - 0.2, 'sağ kol simetrik olarak sağa');
});

test('dirsek ve kalça bükülünce uç öne (+z), diz bükülünce ayak bileği arkaya (−z)', () => {
  const rig = new Rig(J).setPose({ 'elbow-L': { flex: Math.PI / 2 }, 'hip-L': { flex: Math.PI / 4 }, 'knee-R': { flex: Math.PI / 2 } });
  assert.ok(rig.transformPoint('forearm-L', J['wrist-L'])[2] > J['wrist-L'][2] + 0.15);
  assert.ok(rig.transformPoint('thigh-L', J['knee-L'])[2] > J['knee-L'][2] + 0.1);
  assert.ok(rig.transformPoint('leg-R', J['ankle-R'])[2] < J['ankle-R'][2] - 0.2);
});

test('kalp döngüsü: kulakçıklar karıncıklardan önce kasılır, 70/dk periyodik', () => {
  let tA = null, tV = null;
  for (let t = 0; t < 0.857; t += 0.002) {
    const h = heartCycle(t);
    if (tA === null && h.atria > 0.9) tA = t;
    if (tV === null && h.ventricles > 0.9) tV = t;
  }
  assert.ok(tA !== null && tV !== null && tA < tV, `${tA} < ${tV}`);
  const a = heartCycle(0.3), b = heartCycle(0.3 + 60 / 70);
  assert.ok(Math.abs(a.ventricles - b.ventricles) < 1e-9);
  const s = heartScale({ atria: 1, ventricles: 1 });
  assert.ok(s.atria < 1 && s.ventricles < 1 && s.ventricles > 0.85, 'kasılmada küçülme, makul büyüklük');
});

test('solunum: 14/dk, soluk alma vermeden kısa, etkiler sınırlı ve yönleri doğru', () => {
  const period = 60 / 14;
  let peak = 0, tPeak = 0;
  for (let t = 0; t < period; t += 0.01) { const b = breathCycle(t); if (b.inhale > peak) { peak = b.inhale; tPeak = t; } }
  assert.ok(peak > 0.99 && tPeak / period < 0.45);
  const e = breathEffects(1);
  assert.ok(e.diaphragmDrop > 0.01 && e.diaphragmDrop < 0.03, 'diyafram 1–3 cm iner');
  assert.ok(e.lungScale.every((v) => v > 1 && v < 1.1));
  assert.deepEqual(breathEffects(0).lungScale, [1, 1, 1]);
});

test('hareket programları sonlu ve makul açılar üretir', () => {
  for (const [id, m] of Object.entries(MOTIONS)) {
    for (let t = 0; t < m.period; t += m.period / 20) {
      for (const j of Object.values(m.pose(t))) {
        for (const v of Object.values(j)) assert.ok(Number.isFinite(v) && Math.abs(v) <= Math.PI * 0.75, `${id} ${v}`);
      }
    }
  }
});
