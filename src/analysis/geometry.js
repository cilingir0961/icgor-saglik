// Ölçüm geometrisi (saf; DOM/three.js yok). Uygulama ve doğruluk kıyası aynı fonksiyonları kullanır.
// Görüntü noktaları piksel cinsinden [x, y] (y aşağı); dünya noktaları metre [x, y, z].

/** MediaPipe Pose 33 nokta dizinleri (kişinin solu/sağı). */
export const MP = {
  nose: 0, leftEyeInner: 1, leftEye: 2, leftEyeOuter: 3, rightEyeInner: 4, rightEye: 5, rightEyeOuter: 6,
  leftEar: 7, rightEar: 8, mouthLeft: 9, mouthRight: 10,
  leftShoulder: 11, rightShoulder: 12, leftElbow: 13, rightElbow: 14, leftWrist: 15, rightWrist: 16,
  leftPinky: 17, rightPinky: 18, leftIndex: 19, rightIndex: 20, leftThumb: 21, rightThumb: 22,
  leftHip: 23, rightHip: 24, leftKnee: 25, rightKnee: 26, leftAnkle: 27, rightAnkle: 28,
  leftHeel: 29, rightHeel: 30, leftFootIndex: 31, rightFootIndex: 32,
};

/** Eklem adı (rig/manifest biçimi) → MediaPipe dizini. */
export const JOINT_MP = {
  'shoulder-L': 11, 'shoulder-R': 12, 'elbow-L': 13, 'elbow-R': 14, 'wrist-L': 15, 'wrist-R': 16,
  'hip-L': 23, 'hip-R': 24, 'knee-L': 25, 'knee-R': 26, 'ankle-L': 27, 'ankle-R': 28,
};

export const DEG = 180 / Math.PI;
export const sub = (a, b) => a.map((v, i) => v - b[i]);
export const add = (a, b) => a.map((v, i) => v + b[i]);
export const scale = (a, k) => a.map((v) => v * k);
export const dot = (a, b) => a.reduce((s, v, i) => s + v * b[i], 0);
export const norm = (a) => Math.sqrt(dot(a, a));
export const dist = (a, b) => norm(sub(a, b));
export const mid = (a, b) => a.map((v, i) => (v + b[i]) / 2);

/** b noktasındaki iç açı (derece, 0–180); 2B veya 3B. */
export function angleAt(a, b, c) {
  const u = sub(a, b), v = sub(c, b);
  const d = norm(u) * norm(v);
  if (d === 0) return NaN;
  return Math.acos(Math.max(-1, Math.min(1, dot(u, v) / d))) * DEG;
}

/** Görüntüde a→b doğrusunun yatayla açısı (derece). Pozitif: b, a'dan daha YUKARIDA (y aşağı eksen). */
export function tiltFromHorizontal(a, b) {
  return Math.atan2(a[1] - b[1], Math.abs(b[0] - a[0])) * DEG;
}

/** Görüntüde a→b doğrusunun düşeyle açısı (derece, işaretli): + b, a'nın sağında. a altta, b üstte. */
export function angleFromVertical(a, b) {
  return Math.atan2(b[0] - a[0], a[1] - b[1]) * DEG;
}

/** Normalize (0–1) noktayı piksele çevirir. */
export const toPx = (p, w, h) => [p[0] * w, p[1] * h];

/** Medyan. */
export function median(xs) {
  const s = xs.filter(Number.isFinite).sort((a, b) => a - b);
  if (!s.length) return NaN;
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** Ortanca mutlak sapma, normal dağılım için ölçekli (≈ standart sapma). */
export function mad(xs) {
  const m = median(xs);
  return 1.4826 * median(xs.map((x) => Math.abs(x - m)));
}

/** Kareköklü ortalama. */
export const rms = (xs) => Math.sqrt(xs.reduce((s, x) => s + x * x, 0) / xs.length);
