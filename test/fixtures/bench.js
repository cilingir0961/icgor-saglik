// Poz doğruluk kıyası: sentetik figürü bilinen pozda çizer, MediaPipe ile aynı karede nokta çıkarır.
// ?model=lite|full|heavy  (heavy yalnızca .cache/models altında, uygulamayla dağıtılmaz)
import { createFigure } from './figure.js';
import { FilesetResolver, PoseLandmarker } from '../../vendor/mediapipe/vision_bundle.mjs';
import { silhouetteWidths } from '../../src/analysis/silhouette.js';

const q = new URLSearchParams(location.search);
const model = q.get('model') ?? 'lite';
const MODEL_URL = {
  lite: '../../vendor/mediapipe/models/pose_landmarker_lite.task',
  full: '../../vendor/mediapipe/models/pose_landmarker_full.task',
  heavy: '../../.cache/models/pose_landmarker_heavy.task',
}[model];
const fig = await createFigure({ width: Number(q.get('w') ?? 640), height: Number(q.get('h') ?? 480), layers: (q.get('layers') ?? 'muscles,skeleton').split(',') });
const MASKS = q.get('masks') === '1';
// ?nomp=1: yalnızca figür çizimi (sahte kamera videosu üretimi için MediaPipe yüklenmez)
const fileset = q.get('nomp') ? null : await FilesetResolver.forVisionTasks(new URL('../../vendor/mediapipe/wasm', import.meta.url).href);
const landmarker = !fileset ? null : await PoseLandmarker.createFromOptions(fileset, {
  baseOptions: { modelAssetPath: new URL(MODEL_URL, import.meta.url).href, delegate: q.get('delegate') ?? 'GPU' },
  runningMode: 'IMAGE', numPoses: 1, outputSegmentationMasks: MASKS,
});
window.run = (params) => {
  const truth = fig.render(params);
  if (params.sections) truth.sections = fig.sections(params);
  if (!landmarker) return { truth };
  const t = performance.now();
  const res = landmarker.detect(fig.canvas);
  const ms = performance.now() - t;
  const lm = res.landmarks?.[0]?.map((p) => [p.x, p.y, p.z, p.visibility ?? 0]) ?? null;
  const world = res.worldLandmarks?.[0]?.map((p) => [p.x, p.y, p.z]) ?? null;
  let sil = null, maskSize = null;
  const mask = res.segmentationMasks?.[0];
  if (mask && lm) {
    const arr = mask.getAsFloat32Array();
    maskSize = [mask.width, mask.height];
    sil = silhouetteWidths(arr, mask.width, mask.height, lm, params.view ?? 'front');
    // Yer gerçeği maske: düz gri arka plandan farklı pikseller (aynı yöntemle genişlik)
    const g = fig.renderer.getContext();
    const W = g.drawingBufferWidth, H = g.drawingBufferHeight;
    const px = new Uint8Array(W * H * 4);
    g.readPixels(0, 0, W, H, g.RGBA, g.UNSIGNED_BYTE, px);
    const tm = new Float32Array(W * H);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = ((H - 1 - y) * W + x) * 4; // WebGL alt satırdan başlar
      tm[y * W + x] = Math.abs(px[i] - 0x8a) + Math.abs(px[i + 1] - 0x8f) + Math.abs(px[i + 2] - 0x96) > 12 ? 1 : 0;
    }
    truth.silhouette = silhouetteWidths(tm, W, H, lm, params.view ?? 'front');
  }
  res.segmentationMasks?.forEach((m) => m.close());
  return { truth, lm, world, ms, sil, maskSize };
};
window.fig = fig; // hata ayıklama
document.body.dataset.ready = 'true';
