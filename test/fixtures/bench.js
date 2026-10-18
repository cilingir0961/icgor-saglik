// Poz doğruluk kıyası: sentetik figürü bilinen pozda çizer, MediaPipe ile aynı karede nokta çıkarır.
// ?model=lite|full|heavy  (heavy yalnızca .cache/models altında, uygulamayla dağıtılmaz)
import { createFigure } from './figure.js';
import { FilesetResolver, PoseLandmarker } from '../../vendor/mediapipe/vision_bundle.mjs';

const q = new URLSearchParams(location.search);
const model = q.get('model') ?? 'lite';
const MODEL_URL = {
  lite: '../../vendor/mediapipe/models/pose_landmarker_lite.task',
  full: '../../vendor/mediapipe/models/pose_landmarker_full.task',
  heavy: '../../.cache/models/pose_landmarker_heavy.task',
}[model];
const fig = await createFigure({ width: Number(q.get('w') ?? 640), height: Number(q.get('h') ?? 480) });
// ?nomp=1: yalnızca figür çizimi (sahte kamera videosu üretimi için MediaPipe yüklenmez)
const fileset = q.get('nomp') ? null : await FilesetResolver.forVisionTasks(new URL('../../vendor/mediapipe/wasm', import.meta.url).href);
const landmarker = !fileset ? null : await PoseLandmarker.createFromOptions(fileset, {
  baseOptions: { modelAssetPath: new URL(MODEL_URL, import.meta.url).href, delegate: q.get('delegate') ?? 'GPU' },
  runningMode: 'IMAGE', numPoses: 1,
});
window.run = (params) => {
  const truth = fig.render(params);
  if (!landmarker) return { truth };
  const t = performance.now();
  const res = landmarker.detect(fig.canvas);
  const ms = performance.now() - t;
  const lm = res.landmarks?.[0]?.map((p) => [p.x, p.y, p.z, p.visibility ?? 0]) ?? null;
  const world = res.worldLandmarks?.[0]?.map((p) => [p.x, p.y, p.z]) ?? null;
  return { truth, lm, world, ms };
};
document.body.dataset.ready = 'true';
