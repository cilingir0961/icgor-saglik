// Kayıt değerlendirme sayfası: bir videoyu kare kare oynatır, uygulamanın çözümleyicileriyle ölçer.
import { FilesetResolver, PoseLandmarker } from '../../vendor/mediapipe/vision_bundle.mjs';
import { postureMetrics } from '../../src/analysis/posture.js';
import { MOVEMENT_TESTS } from '../../src/analysis/movement.js';

const fileset = await FilesetResolver.forVisionTasks(new URL('../../vendor/mediapipe/wasm', import.meta.url).href);
const landmarker = await PoseLandmarker.createFromOptions(fileset, {
  baseOptions: { modelAssetPath: new URL('../../vendor/mediapipe/models/pose_landmarker_full.task', import.meta.url).href, delegate: 'GPU' },
  runningMode: 'VIDEO', numPoses: 1,
});

window.analyze = async (url, { kind, view, heightCm, fps = 10 }) => {
  const v = document.createElement('video');
  v.muted = true; v.playsInline = true; v.src = url;
  document.body.append(v);
  await new Promise((r, j) => { v.onloadedmetadata = r; v.onerror = () => j(new Error('video açılamadı')); });
  // WebM kayıtlarında süre başta Infinity olabilir: sona sarıp gerçek süreyi öğren
  if (!Number.isFinite(v.duration)) { v.currentTime = 1e9; await new Promise((r) => { v.onseeked = r; }); }
  const dur = v.duration;
  const samples = [];
  for (let t = 0; t < dur; t += 1 / fps) {
    v.currentTime = t;
    await new Promise((r) => { v.onseeked = r; });
    const res = landmarker.detectForVideo(v, Math.round(t * 1000) + 1);
    const lm = res.landmarks?.[0];
    if (lm) samples.push({ t, lm: lm.map((p) => [p.x, p.y, p.z, p.visibility ?? 0]) });
  }
  const ctx = { width: v.videoWidth, height: v.videoHeight, userHeightCm: heightCm };
  v.remove();
  if (kind === 'posture') return { n: samples.length, metrics: postureMetrics(samples.map((s) => s.lm), { view, ...ctx, level: 'unknown' }) };
  const T = MOVEMENT_TESTS[kind];
  if (!T) throw new Error(`bilinmeyen tür: ${kind}`);
  return { n: samples.length, ...T.analyze(samples, ctx) };
};
document.body.dataset.ready = 'true';
