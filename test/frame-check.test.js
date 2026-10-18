import { test } from 'node:test';
import assert from 'node:assert/strict';
import { frontArmFrameOk, shoulderRef } from '../src/analysis/frame-check.js';
import { MOVEMENT_TESTS } from '../src/analysis/movement.js';
import { createCoach } from '../src/fitness/coach.js';
import { MP } from '../src/analysis/geometry.js';

const R = Math.PI / 180;
/** Önden kişi (aynasız görüntü: kişinin solu ekranın sağında). a: omuz açısı (gövde eksenine göre). */
function frame(aL, aR, { collapse = false, crossWrists = false } = {}) {
  const lm = Array.from({ length: 33 }, () => [0.5, 0.5, 0, 0.95]);
  const set = (k, x, y) => { lm[MP[k]] = [x, y, 0, 0.98]; };
  for (const [s, a, sx] of [['left', aL, 1], ['right', aR, -1]]) {
    let shx = 0.5 + sx * 0.1;
    const hipx = 0.5 + sx * 0.06;
    let el = [shx + sx * 0.15 * Math.sin(a * R), 0.3 + 0.15 * Math.cos(a * R)];
    if (collapse) { shx = 0.5 - sx * 0.04; el = [0.5 - sx * 0.2, el[1]]; } // MediaPipe çökmesi: omuzlar/dirsekler ters tarafa
    set(`${s}Shoulder`, shx, 0.3); set(`${s}Hip`, hipx, 0.6); set(`${s}Elbow`, el[0], el[1]);
    set(`${s}Wrist`, crossWrists ? 0.5 - sx * 0.02 : el[0] + sx * 0.02, el[1] - 0.12);
  }
  return lm;
}

test('kapı: normal kare kabul; çöken kare (sol/sağ karışması) reddedilir; baş üstünde çaprazlanan eller kabul', () => {
  const ref = shoulderRef([frame(10, 10)]);
  assert.equal(frontArmFrameOk(frame(30, 40), { refWidth: ref }).ok, true);
  const bad = frontArmFrameOk(frame(125, 125, { collapse: true }), { refWidth: ref });
  assert.equal(bad.ok, false); assert.match(bad.why, /sol\/sağ/);
  assert.equal(frontArmFrameOk(frame(175, 175, { crossWrists: true }), { refWidth: ref }).ok, true, 'eller baş üstünde birleşebilir');
  assert.equal(frontArmFrameOk(null).ok, false);
});

/** Simetrik kol kaldırma dizisi; her tekrarda ~120–126° bandında 2 çöken kare (sentetik bulgunun benzetimi). */
function series(seconds = 9, fps = 15, peak = 145) {
  const out = [];
  for (let i = 0; i <= seconds * fps; i++) {
    const t = i / fps, k = Math.sin(((t % 3) / 3) * Math.PI), a = 15 + (peak - 15) * k;
    const rising = (t % 3) < 1.5;
    out.push({ t, lm: frame(a, a, { collapse: rising && a > 118 && a < 128 }) });
  }
  return out;
}

test('tarama testi: çöken kareler çıkarılır → simetrik harekette sahte sağ–sol fark yok; tekrarlar korunur', () => {
  const res = MOVEMENT_TESTS['kol-kaldirma'].analyze(series(), { width: 480, height: 640 });
  assert.ok(res.rejectedFrames > 0, 'çöken kareler sayıldı');
  assert.ok(res.issues.some((x) => /tutarsız/.test(x)));
  assert.equal(res.reps.L, 3); assert.equal(res.reps.R, 3);
  assert.ok(Math.abs(res.metrics.abductionAsym.value) < 2, `fark ${res.metrics.abductionAsym.value}`);
  assert.equal(res.metrics.abductionAsym.distinguishable, false);
});

test('kamera koçu: aynı kapı; tekrar sayısı değişmez, sahte fark yok', () => {
  const c = createCoach('arm-raise', { width: 480, height: 640, validationGate: false });
  for (const { t, lm } of series(9.5)) c.push(lm, t);
  const s = c.summary();
  assert.equal(s.reps, 3);
  assert.ok(s.rejectedFrames > 0);
  assert.equal(s.asym.distinguishable, false, JSON.stringify(s.asym));
});
