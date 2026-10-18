// MediaPipe Pose Landmarker sarmalayıcısı. Tüm dosyalar yerelden (vendor/) yüklenir;
// görüntü cihazda işlenir, ağa hiçbir şey gönderilmez.

import { FilesetResolver, PoseLandmarker } from '../../vendor/mediapipe/vision_bundle.mjs';
import { POSE, KEYS } from './ar-fit.js';

const WASM = new URL('../../vendor/mediapipe/wasm', import.meta.url).href;
const MODEL = new URL('../../vendor/mediapipe/models/pose_landmarker_lite.task', import.meta.url).href;

export class PoseTracker {
  static async create() {
    const fileset = await FilesetResolver.forVisionTasks(WASM);
    let lastError;
    for (const delegate of ['GPU', 'CPU']) {
      try {
        const landmarker = await PoseLandmarker.createFromOptions(fileset, {
          baseOptions: { modelAssetPath: MODEL, delegate },
          runningMode: 'VIDEO',
          numPoses: 1,
          minPoseDetectionConfidence: 0.5,
          minPosePresenceConfidence: 0.5,
          minTrackingConfidence: 0.5,
        });
        return new PoseTracker(landmarker, delegate);
      } catch (e) {
        lastError = e;
      }
    }
    throw lastError ?? new Error('vücut takibi başlatılamadı');
  }

  constructor(landmarker, delegate) {
    this.landmarker = landmarker;
    this.delegate = delegate;
    this.lastTs = -1;
  }

  /**
   * @returns {null | {points: Record<string, number[]>, visibility: Record<string, number>}} normalize (0–1) video koordinatı
   */
  detect(video, nowMs) {
    const ts = Math.max(nowMs, this.lastTs + 1); // zaman damgası kesin artan olmalı
    this.lastTs = ts;
    const res = this.landmarker.detectForVideo(video, ts);
    const lm = res.landmarks?.[0];
    if (!lm) return null;
    const points = {}, visibility = {};
    for (const k of KEYS) {
      const p = lm[POSE[k]];
      points[k] = [p.x, p.y];
      visibility[k] = p.visibility ?? 0;
    }
    return { points, visibility };
  }

  close() { this.landmarker.close(); }
}
