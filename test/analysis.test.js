import { test } from 'node:test';
import assert from 'node:assert/strict';
import { angleAt, tiltFromHorizontal, median, mad, MP } from '../src/analysis/geometry.js';
import { classifyView, assessFrame, stability, lumaStats, levelError } from '../src/analysis/quality.js';
import { postureMetrics, describe, U_LEVEL_UNKNOWN } from '../src/analysis/posture.js';
import { MOVEMENT_TESTS, findReps, analyzeSingleLeg, analyzeGait } from '../src/analysis/movement.js';
import { comparable, change, windows, compareScans } from '../src/analysis/compare.js';
import { measureSegments, twinScales, bmi } from '../src/analysis/proportions.js';
import { skeleton } from './helpers/skeleton.js';

const W = 480, H = 640;
const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg ?? ''} ${a} ≉ ${b} (±${tol})`);
const frames = (o, n = 10) => Array.from({ length: n }, () => skeleton(o));
// Kişinin boyu: skeleton() göz yüksekliği 161 cm → boy ≈ 161/0,936
const HEIGHT = 161 / 0.936;

test('geometri: iç açı, eğim, medyan/MAD', () => {
  near(angleAt([0, 0], [1, 0], [1, 1]), 90, 1e-9);
  near(angleAt([0, 0, 0], [1, 0, 0], [2, 0, 0]), 180, 1e-9);
  near(tiltFromHorizontal([0, 0], [10, -10]), 45, 1e-9);
  assert.equal(median([3, 1, 2]), 2);
  near(mad([1, 1, 1, 1]), 0, 1e-12);
});

test('kalite: görünüş sınıflama (ön, arka, yan ve bakış yönü)', () => {
  assert.equal(classifyView(skeleton({ view: 'front' }), W, H).view, 'front');
  assert.equal(classifyView(skeleton({ view: 'back' }), W, H).view, 'back');
  const s = classifyView(skeleton({ view: 'side', facing: 'left' }), W, H);
  assert.equal(s.view, 'side');
  assert.equal(s.facing, 'left');
});

test('kalite: mesafe, kadraj, ışık ve eğim yönergeleri; eksik koşulda ölçüm yok', () => {
  const ok = assessFrame(skeleton({ scale: 2.2 }), { expectedView: 'front', width: W, height: H, light: { mean: 0.5, std: 0.2 }, tilt: { beta: 90, gamma: 0 } });
  assert.equal(ok.ok, true, JSON.stringify(ok.checks));
  const far = assessFrame(skeleton({ scale: 1.2 }), { expectedView: 'front', width: W, height: H });
  assert.equal(far.ok, false);
  assert.match(far.message, /yaklaşın/);
  const close = assessFrame(skeleton({ scale: 3.4, footY: 630 }), { expectedView: 'front', width: W, height: H });
  assert.equal(close.ok, false);
  const dark = assessFrame(skeleton(), { expectedView: 'front', width: W, height: H, light: { mean: 0.1, std: 0.05 } });
  assert.match(dark.message, /karanlık/);
  const tilted = assessFrame(skeleton(), { expectedView: 'front', width: W, height: H, tilt: { beta: 90, gamma: 8 } });
  assert.match(tilted.message, /dik ve düz/);
  const wrongView = assessFrame(skeleton({ view: 'front' }), { expectedView: 'side', width: W, height: H });
  assert.match(wrongView.message, /Yan dönün/);
  assert.equal(assessFrame(null, {}).ok, false);
  assert.deepEqual(levelError({ beta: 92, gamma: -1 }), { roll: -1, pitch: 2 });
});

test('kalite: kararlılık ve parlaklık istatistiği', () => {
  assert.equal(stability(frames({})).ok, true);
  const moving = Array.from({ length: 10 }, (_, i) => skeleton({ cx: 200 + i * 15 }));
  assert.equal(stability(moving).ok, false);
  const l = lumaStats(new Uint8ClampedArray([0, 0, 0, 255, 255, 255, 255, 255]));
  near(l.mean, 0.5, 1e-6); near(l.std, 0.5, 1e-6);
});

test('duruş (önden): sol omuz 3 cm yüksek → + işaret, cm değeri, belirgin; arkadan işaret aynı anlama gelir', () => {
  const o = { view: 'front', width: W, height: H, userHeightCm: HEIGHT, level: 'known' };
  const m = postureMetrics(frames({ shoulderRaiseL: 3 }), o);
  assert.ok(m.shoulderLevel.value > 0, 'sol omuz yüksek → +');
  near(m.shoulderLevelCm.value, 3, 0.3, 'cm');
  assert.equal(m.shoulderLevelCm.distinguishable, true);
  assert.match(describe(m.shoulderLevelCm), /sol omuz daha yüksek.*tanı değildir/);
  const back = postureMetrics(frames({ view: 'back', shoulderRaiseL: 3 }), { ...o, view: 'back' });
  near(back.shoulderLevelCm.value, 3, 0.3, 'arka görünüm');
});

test('duruş: nötr duruşta sapma belirsizlik içinde; kamera eğimi bilinmiyorsa belirsizlik büyür', () => {
  const o = { view: 'front', width: W, height: H, userHeightCm: HEIGHT };
  const known = postureMetrics(frames({}), { ...o, level: 'known' });
  const unknown = postureMetrics(frames({}), { ...o, level: 'unknown' });
  assert.equal(known.shoulderLevel.distinguishable, false);
  assert.ok(unknown.shoulderLevel.u > known.shoulderLevel.u);
  assert.ok(unknown.shoulderLevel.u >= U_LEVEL_UNKNOWN);
  assert.match(describe(known.shoulderLevel), /ayırt edilemiyor/);
});

test('duruş: gövdenin yana eğilimi işaret ve büyüklük', () => {
  const m = postureMetrics(frames({ lean: 5 }), { view: 'front', width: W, height: H, level: 'known' });
  near(m.trunkLateral.value, 5, 0.3);
  assert.match(m.trunkLateral.sense, /soluna/);
});

test('duruş (yandan): baş-öne cm, iki bakış yönünde aynı; nötr referans yok', () => {
  for (const facing of ['right', 'left']) {
    const m = postureMetrics(frames({ view: 'side', facing, headForwardCm: 5 }), { view: 'side', width: W, height: H, userHeightCm: HEIGHT, level: 'known' });
    near(m.headForwardCm.value, 5, 0.3, facing);
    assert.equal(m.headForwardCm.distinguishable, null);
    assert.match(describe(m.headForwardCm), /kendi önceki taramalarınızla/);
  }
  const t = postureMetrics(frames({ view: 'side', trunkForward: 10 }), { view: 'side', width: W, height: H, level: 'known' });
  near(t.trunkForward.value, 10, 0.3);
  const k = postureMetrics(frames({ view: 'side', knee: 15 }), { view: 'side', width: W, height: H, level: 'known' });
  near(k.kneeSagittal.value, 15, 0.5);
});

test('duruş: noktalar görünmüyorsa "ölçülemedi"', () => {
  const m = postureMetrics(frames({ vis: 0.3 }), { view: 'front', width: W, height: H });
  assert.equal(m.shoulderLevel.value, null);
  assert.equal(m.shoulderLevel.grade, 'ölçülemedi');
});

test('hareket: kol kaldırma — 3 tekrar, en yüksek açı, sağ–sol fark, kameraya doğru kareler dışlanır', () => {
  const samples = [];
  let t = 0;
  for (let rep = 0; rep < 3; rep++) {
    // Yönerge "yavaşça": tekrar başına ~2,7 s (15 kare/s). Medyan yumuşatma tepeyi hızlı harekette ~2° düşük okur.
    for (let i = 0; i <= 40; i++) {
      const a = 170 * Math.sin((i / 40) * Math.PI);
      samples.push({ t: (t += 1 / 15), lm: skeleton({ abdL: a, abdR: a * 0.8 }) });
    }
  }
  const r = MOVEMENT_TESTS['kol-kaldirma'].analyze(samples, { width: W, height: H });
  assert.equal(r.reps.L, 3); assert.equal(r.reps.R, 3);
  near(r.metrics.abductionL.value, 170, 2);
  near(r.metrics.abductionR.value, 136, 2);
  assert.equal(r.metrics.abductionAsym.distinguishable, true);
  assert.equal(r.metrics.abductionAsym.sense, 'sol taraf daha geniş/uzun');
  // Dirsek bükülü tepede uyarı
  const bent = MOVEMENT_TESTS['kol-kaldirma'].analyze(samples.map((s, i) => ({ ...s, lm: skeleton({ abdL: 170 * Math.sin(((i % 41) / 40) * Math.PI), elbowL: 60 }) })), { width: W, height: H });
  assert.ok(bent.issues.some((x) => /dirsek/.test(x)));
  // Kol kameraya doğru (görünür üst kol boyu %50): bu kareler açı ölçümüne katılmaz ve uyarı verilir
  const toward = samples.map((s, i) => {
    if (i % 41 < 15) return s;
    const lm = s.lm.map((p) => p.slice());
    for (const k of ['leftElbow', 'leftWrist']) lm[MP[k]] = [(lm[MP[k]][0] + lm[MP.leftShoulder][0]) / 2, (lm[MP[k]][1] + lm[MP.leftShoulder][1]) / 2, 0, 0.95];
    return { ...s, lm };
  });
  const tr = MOVEMENT_TESTS['kol-kaldirma'].analyze(toward, { width: W, height: H });
  assert.ok(tr.issues.some((x) => /kameraya doğru/.test(x)), JSON.stringify(tr.issues));
  assert.ok(tr.metrics.abductionL.value <= 158, 'yalnızca kısalmamış kareler (≤157°) kullanıldı; 170° tepe dışlandı');
});

test('hareket: tekrar bulucu histerezis', () => {
  assert.equal(findReps([0, 70, 50, 65, 30, 80, 20], { hi: 60, lo: 40 }).peaks.length, 2);
});

test('hareket: çömelme en derin diz açısı', () => {
  const samples = [];
  for (let rep = 0; rep < 2; rep++) for (let i = 0; i <= 20; i++) samples.push({ t: samples.length / 15, lm: skeleton({ view: 'side', knee: 70 * Math.sin((i / 20) * Math.PI) }) });
  const r = MOVEMENT_TESTS.comelme.analyze(samples, { width: W, height: H });
  assert.equal(r.reps.n, 2);
  near(r.metrics.kneeMin.value, 180 - 70, 3);
});

test('hareket: tek ayak süresi ve kaldırılan taraf', () => {
  const samples = [];
  for (let i = 0; i < 150; i++) { const t = i / 15; samples.push({ t, lm: skeleton({ liftL: t > 2 && t < 7 ? 10 : 0 }) }); }
  const r = analyzeSingleLeg(samples, { width: W, height: H, userHeightCm: HEIGHT });
  near(r.metrics.holdL.value, 5, 0.3);
  assert.match(r.metrics.holdL.tr, /Sağ ayak/);
  assert.equal(r.metrics.holdR.value, null);
  const capped = analyzeSingleLeg(Array.from({ length: 600 }, (_, i) => ({ t: i / 15, lm: skeleton({ liftR: i > 3 ? 10 : 0 }) })), { width: W, height: H, maxHoldS: 30 });
  assert.equal(capped.metrics.holdR.value, 30);
});

test('hareket: yürüyüş kadansı (yandan)', () => {
  // 1 Hz adım çifti → 120 adım/dk
  const samples = Array.from({ length: 150 }, (_, i) => {
    const t = i / 30;
    const lm = skeleton({ view: 'side' });
    const d = Math.sin(2 * Math.PI * t) * 0.05;
    lm[MP.leftAnkle][0] += d; lm[MP.rightAnkle][0] -= d;
    lm[MP.rightAnkle][3] = 0.9;
    return { t, lm };
  });
  const r = analyzeGait(samples, { width: W, height: H });
  assert.equal(r.valid, true);
  near(r.metrics.cadence.value, 120, 6);
  near(r.metrics.stepSymmetry.value, 1, 0.1);
});

test('karşılaştırma: koşullar farklıysa karşılaştırılmaz; fark MDC içindeyse değişim yok sayılır', () => {
  const c = { view: 'side', facing: 'right', model: 'full', level: 'known', heightFrac: 0.75 };
  assert.equal(comparable(c, { ...c }).ok, true);
  assert.deepEqual(comparable(c, { ...c, facing: 'left' }).why, ['farklı bakış yönü (sol/sağ yan)']);
  assert.ok(comparable(c, { ...c, heightFrac: 0.55 }).why.includes('kamera uzaklığı farklı'));
  const m = (v) => ({ value: v, u: 1, unit: 'cm', neutral: 0 });
  assert.equal(change(m(2), m(3)).status, 'belirsiz');
  const ch = change(m(4), m(0.5));
  assert.equal(ch.status, 'olasi');
  assert.match(ch.text, /yaklaşmış/);
});

test('karşılaştırma: 30/60/90 gün pencereleri ve görünüş bazında eşleştirme', () => {
  const d = (n) => new Date(Date.UTC(2026, 0, 1) + n * 86400000).toISOString();
  const cond = { view: 'front', model: 'full', level: 'known', heightFrac: 0.7 };
  const mk = (n, v) => ({ date: d(n), captures: { front: { conditions: cond, metrics: { shoulderLevel: { tr: 'Omuz', value: v, u: 1, unit: '°', neutral: 0 } } } } });
  const scans = [mk(0, 4), mk(28, 3.5), mk(62, 1), mk(90, 0.5)];
  const w = windows(scans);
  assert.equal(w.find((x) => x.days === 30).base.date, d(62));
  assert.equal(w.find((x) => x.days === 60).base.date, d(28));
  assert.equal(w.find((x) => x.days === 90).base.date, d(0));
  const cmp = compareScans(scans[0], scans[3]);
  assert.equal(cmp.front.metrics.shoulderLevel.status, 'olasi');
  const other = { ...scans[3], captures: { front: { ...scans[3].captures.front, conditions: { ...cond, model: 'lite' } } } };
  assert.equal(compareScans(scans[0], other).front.ok, false);
});

test('oranlar: segment boyları kullanıcı boyundan ölçeklenir; ikiz çarpanları sınırlanır; BKİ', () => {
  const seg = measureSegments(frames({}), { width: W, height: H, userHeightCm: HEIGHT });
  near(seg.shoulderWidth.cm, 38, 0.5);
  near(seg.upperArm.cm, 30, 0.5);
  near(seg.shank.cm, 43, 0.5);
  const k = twinScales(seg, { shoulderWidth: 30, hipWidth: 20, upperArm: 30, forearm: 26, thigh: 40, shank: 43 }, 172, 172);
  assert.equal(k.shoulderWidth, 1.15, 'sınır');
  near(k.upperArm, 1, 0.02);
  assert.equal(bmi(180, 81), 25);
  assert.equal(bmi(null, 80), null);
});
