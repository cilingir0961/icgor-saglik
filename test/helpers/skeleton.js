// Birim testleri için 2B iskelet üreteci: bilinen geometriden MediaPipe biçiminde 33 nokta (normalize, aynasız).
import { MP } from '../../src/analysis/geometry.js';

const R = Math.PI / 180;

/**
 * @param {object} o
 *  view: 'front'|'back'|'side'; facing: 'right'|'left' (yan); W,H: kare (px); cx: kalça ortası x (px); footY (px)
 *  scale: px/cm; abdL/abdR: kol kaldırma (derece, 0 = yanda); elbowL/R: dirsek bükümü (derece, 0 = düz)
 *  shoulderRaiseL/R (cm), lean (derece, + kişinin soluna), headForwardCm (yan), knee (diz bükümü, yan, derece)
 *  vis: varsayılan görünürlük; liftL/liftR: ayak bileği kaldırma (cm)
 */
export function skeleton(o = {}) {
  const { view = 'front', facing = 'right', W = 480, H = 640, scale = 2.2, vis = 0.95 } = o;
  const cx = o.cx ?? W / 2, footY = o.footY ?? H * 0.9;
  const lm = Array.from({ length: 33 }, () => [0.5, 0.5, 0, vis]);
  const put = (k, x, y, v = vis) => { lm[MP[k]] = [x / W, y / H, 0, v]; };
  const cm = (c) => c * scale;
  // Ön görünüşte kişinin solu ekranın sağında (+1); arkadan tersi
  const sgn = view === 'back' ? -1 : 1;
  const hipY = footY - cm(90), shY = footY - cm(140), earY = footY - cm(158), eyeY = footY - cm(161);
  if (view === 'side') {
    const f = facing === 'right' ? 1 : -1;
    const kneeBend = (o.knee ?? 0) * R;
    const ankle = [cx, footY - cm(7)];
    const knee = [ankle[0] + f * Math.sin(kneeBend) * cm(45), ankle[1] - Math.cos(kneeBend) * cm(45)];
    const hip = [knee[0], knee[1] - cm(45)];
    const lean = (o.trunkForward ?? 0) * R;
    const sh = [hip[0] + f * Math.sin(lean) * cm(50), hip[1] - Math.cos(lean) * cm(50)];
    const ear = [sh[0] + f * cm(o.headForwardCm ?? 0), sh[1] - cm(18)];
    for (const s of ['left', 'right']) {
      const v = s === 'left' ? vis : 0.3; // uzak taraf az görünür
      put(`${s}Ankle`, ankle[0], ankle[1], v); put(`${s}Knee`, knee[0], knee[1], v); put(`${s}Hip`, hip[0], hip[1], v);
      put(`${s}Shoulder`, sh[0], sh[1], v); put(`${s}Ear`, ear[0], ear[1], v);
      put(`${s}Heel`, ankle[0] - f * cm(5), footY, v); put(`${s}FootIndex`, ankle[0] + f * cm(18), footY, v);
      put(`${s}Elbow`, sh[0], sh[1] + cm(30), v); put(`${s}Wrist`, sh[0], sh[1] + cm(55), v); put(`${s}Index`, sh[0], sh[1] + cm(70), v);
      put(`${s}Eye`, ear[0] + f * cm(8), eyeY, v);
    }
    put('nose', ear[0] + f * cm(11), earY + cm(2));
    return lm;
  }
  const leanR = (o.lean ?? 0) * R;
  const hipMid = [cx, hipY];
  for (const [S, side] of [['L', 'left'], ['R', 'right']]) {
    const d = (S === 'L' ? 1 : -1) * sgn; // ekran yönü
    const ankle = [cx + d * cm(10), footY - cm(7) - cm(o[`lift${S}`] ?? 0)];
    put(`${side}Ankle`, ...ankle); put(`${side}Heel`, ankle[0], footY - cm(o[`lift${S}`] ?? 0));
    put(`${side}FootIndex`, ankle[0] + d * cm(4), footY + cm(4));
    put(`${side}Knee`, cx + d * cm(10), footY - cm(50));
    put(`${side}Hip`, cx + d * cm(10), hipY);
    // Gövde kalça ortası etrafında yana eğilir (+ kişinin soluna → ekranda sgn yönünde)
    const rot = ([x, y]) => {
      const a = sgn * leanR, dx = x - hipMid[0], dy = y - hipMid[1];
      return [hipMid[0] + dx * Math.cos(a) - dy * Math.sin(a), hipMid[1] + dx * Math.sin(a) + dy * Math.cos(a)];
    };
    const sh = rot([cx + d * cm(19), shY - cm(o[`shoulderRaise${S}`] ?? 0)]);
    put(`${side}Shoulder`, ...sh);
    const abd = (o[`abd${S}`] ?? 0) * R, el = (o[`elbow${S}`] ?? 0) * R;
    const elbow = [sh[0] + d * Math.sin(abd) * cm(30), sh[1] + Math.cos(abd) * cm(30)];
    const fa = abd + el;
    const wrist = [elbow[0] + d * Math.sin(fa) * cm(26), elbow[1] + Math.cos(fa) * cm(26)];
    put(`${side}Elbow`, ...elbow); put(`${side}Wrist`, ...wrist); put(`${side}Index`, wrist[0], wrist[1] + cm(8));
    const ear = rot([cx + d * cm(7), earY]);
    put(`${side}Ear`, ...ear); put(`${side}Eye`, ...rot([cx + d * cm(3.5), eyeY]), view === 'back' ? 0.1 : vis);
  }
  put('nose', ...[cx, earY + cm(1)], view === 'back' ? 0.1 : vis);
  return lm;
}
