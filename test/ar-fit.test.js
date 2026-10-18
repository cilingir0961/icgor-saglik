import { test } from 'node:test';
import assert from 'node:assert/strict';
import { videoToDisplay, fitModelToScreen, virtualHips, facesCamera, assessPose } from '../src/camera/ar-fit.js';

const MODEL = {
  leftShoulder: [0.17, 1.40, 0], rightShoulder: [-0.17, 1.40, 0],
  leftHip: [0.095, 0.895, 0], rightHip: [-0.095, 0.895, 0],
};
// Three.js Matrix4 (sütun öncelikli) uygula
const apply = (e, [x, y, z]) => [e[0] * x + e[4] * y + e[8] * z + e[12], e[1] * x + e[5] * y + e[9] * z + e[13], e[2] * x + e[6] * y + e[10] * z + e[14]];

test('video→ekran: cover ölçekleme, kırpma ve ayna', () => {
  const video = { width: 1280, height: 720 }, display = { width: 390, height: 700 };
  // Dikey ekranda video yüksekliğe göre ölçeklenir, yanlar kırpılır.
  const s = 700 / 720, cropX = (1280 * s - 390) / 2;
  const [x, y] = videoToDisplay([0.5, 0.5], video, display, false);
  assert.ok(Math.abs(x - 195) < 1e-9 && Math.abs(y - 350) < 1e-9);
  const [x2] = videoToDisplay([0.25, 0], video, display, false);
  assert.ok(Math.abs(x2 - (0.25 * 1280 * s - cropX)) < 1e-9);
  const [xm] = videoToDisplay([0.25, 0], video, display, true);
  assert.ok(Math.abs(xm - (390 - x2)) < 1e-9);
});

test('kameraya bakan kişi (ayna yok): model noktaları ekran noktalarına oturur, ön yüz kameraya döner', () => {
  const H = 800;
  const screen = { leftShoulder: [300, 200], rightShoulder: [100, 200], leftHip: [256, 497], rightHip: [144, 497] };
  const fit = fitModelToScreen(screen, MODEL, { mirrored: false, height: H });
  assert.ok(fit.facing);
  assert.ok(fit.rms < 1, `rms ${fit.rms}`);
  const p = apply(fit.elements, MODEL.leftShoulder);
  assert.ok(Math.abs(p[0] - 300) < 1 && Math.abs(H - p[1] - 200) < 1);
  assert.ok(apply(fit.elements, [0, 1.2, 0.1])[2] > apply(fit.elements, [0, 1.2, -0.1])[2], 'ön yapılar kameraya yakın');
  assert.equal(fit.mirroredMapping, false);
});

test('ön kamera (ayna): kişinin solu ekranın solunda, yine önden görünüm; eşleme aynalıdır', () => {
  const screen = { leftShoulder: [100, 200], rightShoulder: [300, 200], leftHip: [144, 497], rightHip: [256, 497] };
  const fit = fitModelToScreen(screen, MODEL, { mirrored: true, height: 800 });
  assert.ok(fit.facing);
  assert.ok(fit.mirroredMapping);
  assert.ok(apply(fit.elements, [0.05, 1.3, 0])[0] < 200, 'kalp (hafif sol) ekranın solunda');
  assert.ok(apply(fit.elements, [0, 1.2, 0.1])[2] > apply(fit.elements, [0, 1.2, -0.1])[2]);
});

test('arkası dönük kişi: arka yapılar kameraya yakın', () => {
  const screen = { leftShoulder: [100, 200], rightShoulder: [300, 200], leftHip: [144, 497], rightHip: [256, 497] };
  assert.equal(facesCamera(screen, false), false);
  const fit = fitModelToScreen(screen, MODEL, { mirrored: false, height: 800 });
  assert.ok(apply(fit.elements, [0, 1.2, -0.1])[2] > apply(fit.elements, [0, 1.2, 0.1])[2]);
});

test('sanal kalçalar: dik duran kişide omuzların altında, model oranında', () => {
  const ls = [300, 200], rs = [100, 200];
  const h = virtualHips(ls, rs, MODEL, 1);
  const torso = (1.40 - 0.895) / 0.34 * 200;
  assert.ok(Math.abs((h.leftHip[1] + h.rightHip[1]) / 2 - (200 + torso)) < 1e-6);
  assert.ok(h.leftHip[0] > h.rightHip[0], 'kişinin sol kalçası ekranın sağında (ayna yok)');
  assert.ok(Math.abs(h.leftHip[0] - h.rightHip[0] - 0.19 / 0.34 * 200) < 1e-6);
});

test('poz değerlendirme: görünürlük ve uzaklık', () => {
  const lm = { leftShoulder: [300, 200], rightShoulder: [100, 200], leftHip: [256, 497], rightHip: [144, 497] };
  const all = { leftShoulder: 0.9, rightShoulder: 0.9, leftHip: 0.9, rightHip: 0.9 };
  assert.deepEqual(assessPose(lm, all), { ok: true, partial: false });
  assert.deepEqual(assessPose(lm, { ...all, leftHip: 0.1 }), { ok: true, partial: true });
  assert.equal(assessPose(lm, { ...all, rightShoulder: 0.2 }).reason, 'no-shoulders');
  assert.equal(assessPose({ ...lm, leftShoulder: [110, 200] }, all).reason, 'too-far');
});
