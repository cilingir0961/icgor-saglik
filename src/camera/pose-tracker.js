// MediaPipe Pose Landmarker sarmalayıcısı. Tüm dosyalar yerelden (vendor/) yüklenir;
// görüntü cihazda işlenir, ağa hiçbir şey gönderilmez.

import { FilesetResolver, PoseLandmarker } from '../../vendor/mediapipe/vision_bundle.mjs';
import { POSE } from './ar-fit.js';

const WASM = new URL('../../vendor/mediapipe/wasm', import.meta.url).href;
// lite: hızlı (canlı AR); full: daha doğru noktalar (tarama ölçümleri). Kıyas: scripts/pose-bench.mjs
export const MODELS = {
  lite: new URL('../../vendor/mediapipe/models/pose_landmarker_lite.task', import.meta.url).href,
  full: new URL('../../vendor/mediapipe/models/pose_landmarker_full.task', import.meta.url).href,
};

export class PoseTracker {
  /** @param {{model?:'lite'|'full', masks?:boolean}} o masks: kişi bölütleme maskesi (siluet ölçüsü, yalnızca tarama) */
  static async create({ model = 'lite', masks = false } = {}) {
    const fileset = await FilesetResolver.forVisionTasks(WASM);
    let lastError;
    for (const delegate of ['GPU', 'CPU']) {
      try {
        const landmarker = await PoseLandmarker.createFromOptions(fileset, {
          baseOptions: { modelAssetPath: MODELS[model] ?? MODELS.lite, delegate },
          runningMode: 'VIDEO',
          numPoses: 1,
          minPoseDetectionConfidence: 0.5,
          minPosePresenceConfidence: 0.5,
          minTrackingConfidence: 0.5,
          outputSegmentationMasks: masks,
        });
        return new PoseTracker(landmarker, delegate, model);
      } catch (e) {
        lastError = e;
      }
    }
    throw lastError ?? new Error('vücut takibi başlatılamadı');
  }

  constructor(landmarker, delegate, model) {
    this.landmarker = landmarker;
    this.delegate = delegate;
    this.model = model;
    this.lastTs = -1;
  }

  /**
   * @returns {null | {points: Record<string, number[]>, visibility: Record<string, number>, all: number[][]}}
   *   normalize (0–1) video koordinatı; all: 33 noktanın tümü [x, y, z, görünürlük]
   */
  detect(video, nowMs, { mask = false } = {}) {
    const ts = Math.max(nowMs, this.lastTs + 1); // zaman damgası kesin artan olmalı
    this.lastTs = ts;
    const res = this.landmarker.detectForVideo(video, ts);
    const lm = res.landmarks?.[0];
    // Maske yalnızca istenirse kopyalanır (büyük dizi); her durumda serbest bırakılır
    const m = res.segmentationMasks?.[0];
    const maskOut = mask && m && lm ? { data: m.getAsFloat32Array().slice(), width: m.width, height: m.height } : null;
    res.segmentationMasks?.forEach((x) => x.close());
    if (!lm) return null;
    const points = {}, visibility = {};
    for (const k of Object.keys(POSE)) {
      const p = lm[POSE[k]];
      points[k] = [p.x, p.y];
      visibility[k] = p.visibility ?? 0;
    }
    return { points, visibility, all: lm.map((p) => [p.x, p.y, p.z, p.visibility ?? 0]), mask: maskOut };
  }

  close() { this.landmarker.close(); }
}
