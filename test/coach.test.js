import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCoach, COACH_KINDS, summarize } from '../src/fitness/coach.js';
import { MP } from '../src/analysis/geometry.js';

const R = Math.PI / 180;
/** Yandan bacak: kalça sabit, diz açısı a (derece). Üç nokta normalize koordinatta. */
function legFrame(kneeDeg, { visL = 0.9, visR = 0.9, thigh = 0.2 } = {}) {
  const lm = Array.from({ length: 33 }, () => [0.5, 0.5, 0, 0.9]);
  const hip = [0.5, 0.4], knee = [0.5 + thigh * Math.sin(40 * R), 0.4 + thigh * Math.cos(40 * R)];
  // diz açısı: kalça–diz–ayak bileği arası iç açı
  const dirUp = Math.atan2(hip[1] - knee[1], hip[0] - knee[0]);
  const shin = dirUp + kneeDeg * R;
  const ankle = [knee[0] + thigh * Math.cos(shin), knee[1] + thigh * Math.sin(shin)];
  for (const [s, v] of [['left', visL], ['right', visR]]) {
    lm[MP[`${s}Hip`]] = [...hip, 0, v]; lm[MP[`${s}Knee`]] = [...knee, 0, v]; lm[MP[`${s}Ankle`]] = [...ankle, 0, v];
  }
  return lm;
}
/** Önden kollar: omuz açısı (kalça–omuz–dirsek) sol aL, sağ aR. */
function armFrame(aL, aR) {
  const lm = Array.from({ length: 33 }, () => [0.5, 0.5, 0, 0.9]);
  for (const [s, a, sx] of [['left', aL, 1], ['right', aR, -1]]) {
    const sh = [0.5 + sx * 0.1, 0.3], hip = [0.5 + sx * 0.1, 0.6];
    const el = [sh[0] + sx * 0.15 * Math.sin(a * R), sh[1] + 0.15 * Math.cos(a * R)];
    lm[MP[`${s}Shoulder`]] = [...sh, 0, 0.9]; lm[MP[`${s}Hip`]] = [...hip, 0, 0.9]; lm[MP[`${s}Elbow`]] = [...el, 0, 0.9];
  }
  return lm;
}
const run = (coach, fn, seconds, fps = 15) => {
  let last;
  for (let i = 0; i <= seconds * fps; i++) last = coach.push(fn(i / fps), i / fps);
  return last;
};

test('squat: 4 tekrar sayılır; en derin diz açısı ve tempo ölçülür', () => {
  const c = createCoach('squat');
  // 1 s ayakta, sonra 4 × 3 s (1,5 s iniş, 1,5 s kalkış), diz 175° → 85°
  run(c, (t) => legFrame(t < 1 ? 175 : 175 - 90 * Math.sin((((t - 1) % 3) / 3) * Math.PI)), 13);
  const s = c.summary();
  assert.equal(s.reps, 4);
  assert.equal(s.reliable, true, s.reasons.join(' '));
  assert.ok(Math.abs(s.sides.L.extreme.value - 85) < 3, s.sides.L.extreme.value);
  assert.ok(Math.abs(s.sides.L.duration.value - 3) < 0.8, `süre ${s.sides.L.duration.value}`);
  assert.equal(s.asym, null, 'yandan görünüşte sağ–sol karşılaştırması yapılmaz');
  assert.ok(s.observations.some((o) => /diz açısı/.test(o)));
  assert.ok(s.observations.every((o) => !/yanlış|hatalı|düzelt/i.test(o)), 'komut/hüküm yok');
});

test('küçük salınımlar ve görünmeyen eklem tekrar sayılmaz', () => {
  const c = createCoach('squat');
  run(c, (t) => legFrame(175 - 10 * Math.sin(t * 3)), 6);
  assert.equal(c.summary().reps, 0);
  const c2 = createCoach('squat');
  run(c2, (t) => legFrame(175 - 90 * Math.sin(((t % 3) / 3) * Math.PI), { visL: 0.3, visR: 0.3 }), 9);
  const s = c2.summary();
  assert.equal(s.reps, 0); assert.equal(s.reliable, false);
  assert.equal(s.sides, null); assert.deepEqual(s.observations, []);
});

test('güvenilirlik kapısı: kişi kadrajdan çıkınca açı gözlemi verilmez', () => {
  const c = createCoach('sit-to-stand');
  run(c, (t) => (t > 4 && t < 12 ? null : legFrame(t < 1 ? 170 : 170 - 80 * Math.sin((((t - 1) % 3) / 3) * Math.PI))), 14);
  const s = c.summary();
  assert.equal(s.reliable, false);
  assert.match(s.reasons.join(' '), /%70/);
  assert.deepEqual(s.observations, []);
});

test('kameraya doğru kısalan segment o karede ölçülmez', () => {
  const c = createCoach('squat');
  run(c, () => legFrame(175), 1);
  const r = c.push(legFrame(120, { thigh: 0.12 }), 1.1);
  assert.equal(r.angle.L, null);
});

test('kol kaldırma: doğrulama listesinde "güvenilmez" → tekrar sayılır, açı/fark/yorum gösterilmez', () => {
  const c = createCoach('arm-raise');
  run(c, (t) => { const k = Math.sin(((t % 2) / 2) * Math.PI); return armFrame(20 + 140 * k, 20 + 100 * k); }, 8.5);
  const s = c.summary();
  assert.equal(s.reps, 4, 'tekrar sayımı etkilenmez');
  assert.equal(s.angleUnreliable, true);
  assert.equal(s.asym, null); assert.equal(s.sides, null); assert.deepEqual(s.observations, []);
  assert.match(s.angleNote, /Ölçüm güvenilir değil, tekrar deneyin/);
});

test('kol kaldırma algoritması (doğrulama kapısı kapalı, yalnızca kıyas için): iki kol ayrı; fark 2u kuralı', () => {
  const c = createCoach('arm-raise', { validationGate: false });
  run(c, (t) => { const k = Math.sin(((t % 2) / 2) * Math.PI); return armFrame(20 + 140 * k, 20 + 100 * k); }, 8.5);
  const s = c.summary();
  assert.equal(s.reps, 4);
  assert.ok(Math.abs(s.sides.L.extreme.value - 160) < 3 && Math.abs(s.sides.R.extreme.value - 120) < 3);
  assert.equal(s.asym.distinguishable, true);
  const c2 = createCoach('arm-raise', { validationGate: false });
  run(c2, (t) => { const k = Math.sin(((t % 2) / 2) * Math.PI); return armFrame(20 + 140 * k, 20 + 136 * k); }, 8.5);
  assert.equal(c2.summary().asym.distinguishable, false);
});

test('summarize: tek ölçümde sistematik belirsizlik; her tür tanımlı', () => {
  assert.deepEqual(summarize([90]), { value: 90, u: 8.5, n: 1 });
  assert.equal(summarize([]).value, null);
  for (const k of Object.keys(COACH_KINDS)) assert.ok(createCoach(k).def.setup);
  assert.throws(() => createCoach('uçmak'));
});

test('düşük kare hızında (< 8 fps) ölçüm güvenilmez sayılır, gözlem gösterilmez', () => {
  const c = createCoach('squat');
  run(c, (t) => legFrame(t < 1 ? 175 : 175 - 90 * Math.sin((((t - 1) % 3) / 3) * Math.PI)), 13, 4);
  const s = c.summary();
  assert.equal(s.reliable, false);
  assert.match(s.reasons.join(' '), /saniyede 4 kare/);
  assert.deepEqual(s.observations, []);
});
