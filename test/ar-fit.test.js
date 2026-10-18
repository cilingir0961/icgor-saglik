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

test('uzuv pozu: ekranda yana kalkmış sol kol model uzayında ~90° düzlem içi açı verir', async () => {
  const { limbPose, invertAffine2 } = await import('../src/camera/ar-fit.js');
  const J = {
    'shoulder-L': [0.17, 1.40, 0], 'elbow-L': [0.21, 1.12, 0], 'wrist-L': [0.25, 0.89, 0],
    'shoulder-R': [-0.17, 1.40, 0], 'elbow-R': [-0.21, 1.12, 0], 'wrist-R': [-0.25, 0.89, 0],
    'hip-L': [0.095, 0.9, 0], 'knee-L': [0.08, 0.46, 0], 'ankle-L': [0.07, 0.08, 0],
    'hip-R': [-0.095, 0.9, 0], 'knee-R': [-0.08, 0.46, 0], 'ankle-R': [-0.07, 0.08, 0],
  };
  // model xy → ekran (y yukarı): ölçek 500, öteleme; H = 1000
  const s = 500, H = 1000, M = [[s, 0, 200], [0, s, -100]];
  const toScreen = ([x, y]) => [s * x + 200, H - (s * y - 100)];
  const I = invertAffine2(M);
  const back = [I[0][0] * 300 + I[0][1] * 400 + I[0][2], I[1][0] * 300 + I[1][1] * 400 + I[1][2]];
  assert.ok(Math.abs(s * back[0] + 200 - 300) < 1e-9 && Math.abs(s * back[1] - 100 - 400) < 1e-9, 'ters afin');
  // Sol kol yana (dirsek omzun 0,28 m solunda, aynı yükseklikte); bilek düz devam
  const shL = J['shoulder-L'];
  const vis = { leftElbow: 1, leftWrist: 1, rightElbow: 0.1, rightWrist: 0.1, leftKnee: 1, leftAnkle: 1, rightKnee: 0, rightAnkle: 0 };
  const screen = {
    leftElbow: toScreen([shL[0] + 0.28, shL[1]]), leftWrist: toScreen([shL[0] + 0.52, shL[1]]),
    leftKnee: toScreen(J['knee-L']), leftAnkle: toScreen(J['ankle-L']),
  };
  const pose = limbPose(M, screen, vis, J, H);
  const restAngle = Math.atan2(J['elbow-L'][1] - shL[1], J['elbow-L'][0] - shL[0]);
  assert.ok(Math.abs(pose['shoulder-L'].plane - (0 - restAngle)) < 1e-6, `omuz açısı ${pose['shoulder-L'].plane}`);
  assert.ok(pose['shoulder-L'].plane > 1.3 && pose['shoulder-L'].plane < 1.8, 'yaklaşık 80–100°');
  assert.ok(Math.abs(pose['elbow-L'].plane) < 0.2, 'dirsek düz');
  assert.ok(Math.abs(pose['hip-L'].plane) < 1e-6 && Math.abs(pose['knee-L'].plane) < 1e-6, 'bacak dinlenmede');
  assert.equal(pose['shoulder-R'], undefined, 'görünmeyen uzuv poz almaz');
});
