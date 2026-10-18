// Çekim kalite kapısı (saf). Kalibrasyon yeterli değilse ölçüm ÜRETİLMEZ; kullanıcıya tek, uygulanabilir
// bir yönerge verilir (ekranda ve isteğe bağlı sesli).
//
// Girdi: MediaPipe 33 nokta (normalize [x, y, z, görünürlük], ham video karesi — ayna yok), kare boyutu,
// isteğe bağlı parlaklık istatistiği {mean, std} (0–1) ve cihaz eğimi {beta, gamma} (derece, DeviceOrientation).

import { MP, dist, mid, median } from './geometry.js';

export const VIEWS = { front: 'Önden', side: 'Yandan', back: 'Arkadan' };

/** Görünüme göre zorunlu noktalar. */
const REQUIRED = {
  front: ['leftShoulder', 'rightShoulder', 'leftHip', 'rightHip', 'leftKnee', 'rightKnee', 'leftAnkle', 'rightAnkle', 'nose'],
  back: ['leftShoulder', 'rightShoulder', 'leftHip', 'rightHip', 'leftKnee', 'rightKnee', 'leftAnkle', 'rightAnkle'],
  side: ['shoulder', 'hip', 'knee', 'ankle', 'ear'],
};
export const LIMITS = {
  minVis: 0.6, margin: 0.03,
  heightFrac: [0.55, 0.92], // vücudun (göz–topuk) kare yüksekliğine oranı
  centerX: [0.3, 0.7],
  light: { mean: [0.22, 0.88], std: 0.07 },
  level: { roll: 3, pitch: 6 }, // derece
  jitter: 0.015, // gövde boyuna göre medyan kare-kare oynama
  sideRatio: 0.38, frontRatio: 0.55, // omuz genişliği / gövde boyu
};

const P = (lm, k, w, h) => [lm[MP[k]][0] * w, lm[MP[k]][1] * h];
const V = (lm, k) => lm[MP[k]][3] ?? 0;

/** Görünüş sınıflaması: ön / arka / yan (sol-sağ) / eğik (belirsiz). Ham (aynasız) görüntü. */
export function classifyView(lm, w = 1, h = 1) {
  const ls = P(lm, 'leftShoulder', w, h), rs = P(lm, 'rightShoulder', w, h);
  const lh = P(lm, 'leftHip', w, h), rh = P(lm, 'rightHip', w, h);
  const sw = dist(ls, rs);
  const torso = dist(mid(ls, rs), mid(lh, rh)) || 1;
  const ratio = sw / torso;
  if (ratio < LIMITS.sideRatio) {
    // Burun omuz ortasının hangi yanında → kişinin baktığı yön (ekranda)
    const facing = P(lm, 'nose', w, h)[0] > mid(ls, rs)[0] ? 'right' : 'left';
    return { view: 'side', facing, ratio, confidence: 1 - ratio / LIMITS.sideRatio };
  }
  if (ratio < LIMITS.frontRatio) return { view: 'oblique', ratio, confidence: 0 };
  // Kameraya bakan kişide (aynasız) kişinin solu ekranın sağındadır
  const faceVis = (V(lm, 'nose') + V(lm, 'leftEye') + V(lm, 'rightEye')) / 3;
  const front = ls[0] > rs[0] && faceVis > 0.5;
  return { view: front ? 'front' : 'back', ratio, confidence: Math.min(1, (ratio - LIMITS.frontRatio) / 0.2) };
}

/** Yan görünümde kameraya yakın taraf (daha görünür olan). */
export function nearSide(lm) {
  const s = (k) => V(lm, `left${k}`) - V(lm, `right${k}`);
  return s('Shoulder') + s('Hip') + s('Knee') + s('Ankle') >= 0 ? 'left' : 'right';
}

/** Görünüme göre zorunlu nokta adları (yan görünümde yakın taraf). */
export function requiredKeys(view, lm) {
  if (view !== 'side') return REQUIRED[view];
  const S = nearSide(lm);
  return REQUIRED.side.map((k) => `${S}${k[0].toUpperCase()}${k.slice(1)}`);
}

/**
 * Tek kare kalite değerlendirmesi.
 * @returns {{ok:boolean, checks:{id:string, ok:boolean|null, msg:string}[], message:string|null, view:object, heightFrac:number}}
 */
export function assessFrame(lm, { expectedView, width = 1, height = 1, light, tilt } = {}) {
  const checks = [];
  const add = (id, ok, msg) => checks.push({ id, ok, msg });
  if (!lm) {
    add('person', false, 'Kişi algılanamadı — tüm vücut kadrajda olsun.');
    return finish(checks, null, 0);
  }
  const v = classifyView(lm, width, height);
  // Görünüş
  if (expectedView) {
    const okView = v.view === expectedView;
    const msg = expectedView === 'side' ? 'Yan dönün: omzunuz kameraya baksın.'
      : expectedView === 'back' ? 'Arkanızı kameraya dönün.' : 'Yüzünüz kameraya dönük durun.';
    add('view', okView, okView ? '' : msg);
  }
  const view = v.view === 'oblique' ? expectedView ?? 'front' : v.view;
  // Görünürlük
  const keys = requiredKeys(view, lm);
  const missing = keys.filter((k) => V(lm, k) < LIMITS.minVis);
  add('visible', missing.length === 0, missing.length ? 'Tüm vücudunuz görünmüyor — başınızdan ayaklarınıza kadar kadrajda olun.' : '');
  // Kadraj kenarları (baş ve ayaklar dahil)
  const pts = [...keys, 'nose', 'leftHeel', 'rightHeel'].filter((k) => V(lm, k) >= 0.3).map((k) => lm[MP[k]]);
  const m = LIMITS.margin;
  const inside = pts.every(([x, y]) => x > m && x < 1 - m && y > m && y < 1 - m);
  add('framing', inside, inside ? '' : 'Kadrajın kenarına çok yakınsınız — ortalanın veya biraz uzaklaşın.');
  // Mesafe: göz (veya kulak) ile topuk arası
  const top = Math.min(...['leftEye', 'rightEye', 'leftEar', 'rightEar', 'nose'].map((k) => lm[MP[k]][1]));
  const bottom = Math.max(...['leftHeel', 'rightHeel', 'leftAnkle', 'rightAnkle'].map((k) => lm[MP[k]][1]));
  const heightFrac = (bottom - top) / 0.936; // göz yüksekliği ≈ boyun %93,6'sı (antropometri)
  const [lo, hi] = LIMITS.heightFrac;
  add('distance', heightFrac >= lo && heightFrac <= hi, heightFrac < lo ? 'Kameraya biraz yaklaşın.' : heightFrac > hi ? 'Kameradan biraz uzaklaşın.' : '');
  // Ortalama
  const cx = (lm[MP.leftHip][0] + lm[MP.rightHip][0]) / 2;
  add('center', cx >= LIMITS.centerX[0] && cx <= LIMITS.centerX[1], cx < LIMITS.centerX[0] ? 'Biraz sağa geçin (ekranın ortasına).' : cx > LIMITS.centerX[1] ? 'Biraz sola geçin (ekranın ortasına).' : '');
  // Işık
  if (light) {
    const okL = light.mean >= LIMITS.light.mean[0] && light.mean <= LIMITS.light.mean[1] && light.std >= LIMITS.light.std;
    add('light', okL, okL ? '' : light.mean < LIMITS.light.mean[0] ? 'Ortam çok karanlık — ışığı artırın.' : light.mean > LIMITS.light.mean[1] ? 'Görüntü çok parlak — ışığa karşı durmayın.' : 'Görüntü kontrastı düşük — arka planı sadeleştirin veya ışığı değiştirin.');
  } else add('light', null, '');
  // Kamera düzlüğü (cihaz eğimi). Bilinmiyorsa engellemez; açı ölçümlerinin güvenilirliği düşürülür.
  if (tilt && Number.isFinite(tilt.beta) && Number.isFinite(tilt.gamma)) {
    const lv = levelError(tilt);
    const okT = Math.abs(lv.roll) <= LIMITS.level.roll && Math.abs(lv.pitch) <= LIMITS.level.pitch;
    add('level', okT, okT ? '' : 'Telefonu dik ve düz tutun (yere paralel eğmeyin).');
  } else add('level', null, '');
  return finish(checks, v, heightFrac);
}

/** Dikey (portre) tutulan telefonda eğim hatası: roll (yana yatma) ve pitch (öne/arkaya). */
export function levelError({ beta, gamma }) {
  return { roll: gamma, pitch: beta - 90 };
}

function finish(checks, view, heightFrac) {
  const fail = checks.find((c) => c.ok === false);
  return { ok: !fail, checks, message: fail?.msg ?? null, view, heightFrac };
}

/**
 * Kararlılık: son karelerdeki noktaların oynaması (gövde boyuna oranla medyan). Kişi durağan olmalı.
 * @param {number[][][]} frames son N karenin noktaları
 */
export function stability(frames, keys = ['leftShoulder', 'rightShoulder', 'leftHip', 'rightHip', 'leftAnkle', 'rightAnkle']) {
  if (frames.length < 2) return { ok: false, jitter: Infinity };
  const torso = median(frames.map((lm) => dist(mid(lm[MP.leftShoulder], lm[MP.rightShoulder]), mid(lm[MP.leftHip], lm[MP.rightHip])))) || 1;
  const d = [];
  for (let i = 1; i < frames.length; i++) for (const k of keys) d.push(dist(frames[i][MP[k]].slice(0, 2), frames[i - 1][MP[k]].slice(0, 2)) / torso);
  const jitter = median(d);
  return { ok: jitter <= LIMITS.jitter, jitter };
}

/** Küçük gri tonlu kareden parlaklık ortalaması ve standart sapması (0–1). */
export function lumaStats(rgba) {
  let s = 0, s2 = 0, n = 0;
  for (let i = 0; i < rgba.length; i += 4) {
    const y = (0.299 * rgba[i] + 0.587 * rgba[i + 1] + 0.114 * rgba[i + 2]) / 255;
    s += y; s2 += y * y; n++;
  }
  const mean = s / n;
  return { mean, std: Math.sqrt(Math.max(0, s2 / n - mean * mean)) };
}
