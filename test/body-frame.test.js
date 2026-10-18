import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeBodyFrame } from '../src/anatomy/body-frame.js';

// Kameraya bakan kişi, ayna olmayan görüntü: kişinin solu görüntünün sağında.
const front = {
  leftShoulder: [300, 100], rightShoulder: [100, 100],
  leftHip: [270, 380], rightHip: [130, 380],
};
const close = (a, b, eps = 1e-9) => a.every((v, i) => Math.abs(v - b[i]) < eps);

test('omuz orta noktası atlas orijinine, kalça orta noktası y=1e eşlenir', () => {
  const { ok, frame } = computeBodyFrame(front);
  assert.ok(ok);
  assert.ok(close(frame.toScreen([0, 0, 0]), [200, 100, 0]));
  assert.ok(close(frame.toScreen([0, 1, 0]), [200, 380, 0]));
  assert.ok(close(frame.toScreen([0.5, 0, 0]), [300, 100, 0]), 'x=+0.5 sol omuz');
  assert.equal(frame.shoulderWidth, 200);
  assert.equal(frame.view, 'anterior');
});

test('kameraya bakarken ön (z>0) yapılar daha yakın derinlik alır', () => {
  const { frame } = computeBodyFrame(front);
  assert.ok(frame.toScreen([0, 0.5, 0.1])[2] > frame.toScreen([0, 0.5, -0.1])[2]);
});

test('ayna görüntüde kişinin solu ekranın solunda olur ve yine önden kabul edilir', () => {
  const mirrored = {
    leftShoulder: [100, 100], rightShoulder: [300, 100],
    leftHip: [130, 380], rightHip: [270, 380],
  };
  const { ok, frame } = computeBodyFrame(mirrored, { mirrored: true });
  assert.ok(ok);
  assert.equal(frame.view, 'anterior');
  assert.ok(frame.toScreen([0.06, 0.32, 0])[0] < 200, 'kalp ekranın solunda');
});

test('ayna olmayan görüntüde ters yerleşim arkadan görünüm sayılır, derinlik ters çevrilir', () => {
  const back = {
    leftShoulder: [100, 100], rightShoulder: [300, 100],
    leftHip: [130, 380], rightHip: [270, 380],
  };
  const { frame } = computeBodyFrame(back);
  assert.equal(frame.view, 'posterior');
  assert.ok(frame.toScreen([0, 0.7, -0.15])[2] > frame.toScreen([0, 0.7, 0.1])[2], 'böbrekler öne çıkar');
});

test('dönmüş gövdede afin eşleme dönüşü korur', () => {
  const a = Math.PI / 6, R = ([x, y]) => [x * Math.cos(a) - y * Math.sin(a), x * Math.sin(a) + y * Math.cos(a)];
  const rot = Object.fromEntries(Object.entries(front).map(([k, p]) => [k, R(p)]));
  const { ok, frame } = computeBodyFrame(rot);
  assert.ok(ok);
  assert.ok(close(frame.toScreen([0, 0, 0]).slice(0, 2), R([200, 100]), 1e-6));
});

test('geçersiz girdiler gerekçeyle reddedilir', () => {
  assert.equal(computeBodyFrame({}).reason, 'missing-landmark');
  assert.equal(computeBodyFrame({ ...front, leftHip: [NaN, 1] }).reason, 'missing-landmark');
  assert.equal(computeBodyFrame({
    leftShoulder: [110, 100], rightShoulder: [100, 100], leftHip: [110, 115], rightHip: [100, 115],
  }).reason, 'too-small');
  assert.equal(computeBodyFrame({ ...front, leftHip: [270, 1500], rightHip: [130, 1500] }).reason, 'implausible-proportions');
  assert.equal(computeBodyFrame({ ...front, leftHip: [570, 300], rightHip: [430, 300] }).reason, 'skewed');
});
