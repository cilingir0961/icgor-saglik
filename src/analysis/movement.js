// Yönlendirmeli hareket testleri (saf). Her test: görünüş, Türkçe yönergeler, güvenlik düzeyi, çözümleyici.
// Çözümleyici zaman serisinden (kare başına MediaPipe noktaları) göstergeler üretir; her gösterge ±belirsizlik
// ve güvenilirlik taşır. Klinik eşik ve tanı YOK; hareket açıklığı ve sağ–sol farkı gözlem olarak sunulur.
//
// Ölçüm kuralı (scripts/pose-bench.mjs bulgusu): açılar görüntü düzleminde ölçülür. Segment kameraya doğru
// yöneldiğinde (görünür boyu kalibre boyunun %80'inin altına düşerse) o kare açı ölçümünden ÇIKARILIR.

import { MP, DEG, angleAt, dist, mid, median, mad, sub, add } from './geometry.js';
import { cmPerPx } from './posture.js';

const px = (lm, k, w, h) => [lm[MP[k]][0] * w, lm[MP[k]][1] * h];
const vis = (lm, k) => lm[MP[k]][3] ?? 0;
const SIDES = [['L', 'left', 'Sol'], ['R', 'right', 'Sağ']];
const FORESHORTEN = 0.8;

/** Hareketli medyan ile yumuşatma (tek kare sıçramalarını bastırır). */
export function smooth(xs, k = 5) {
  const h = k >> 1;
  return xs.map((_, i) => median(xs.slice(Math.max(0, i - h), i + h + 1)));
}

/**
 * Tekrar (tepe) bulma: sinyal hi eşiğinin üstüne çıkıp lo eşiğinin altına inince bir tekrar sayılır.
 * @returns {{peaks:{i:number, value:number}[]}}
 */
export function findReps(xs, { hi, lo }) {
  const peaks = [];
  let inRep = false, best = null;
  xs.forEach((x, i) => {
    if (!Number.isFinite(x)) return;
    if (!inRep && x >= hi) { inRep = true; best = { i, value: x }; }
    if (inRep) {
      if (x > best.value) best = { i, value: x };
      if (x <= lo) { peaks.push(best); inRep = false; }
    }
  });
  if (inRep && best) peaks.push({ ...best, open: true });
  return { peaks };
}

/** Çukur bulma (ör. çömelmede diz açısının en küçük olduğu anlar). */
export const findDips = (xs, { lo, hi }) => {
  const r = findReps(xs.map((x) => -x), { hi: -lo, lo: -hi });
  return { dips: r.peaks.map((p) => ({ ...p, value: -p.value })) };
};

function metric(tr, values, { unit = '°', uSys = 3, experimental = false, minN = 1 } = {}) {
  const vals = values.filter(Number.isFinite);
  if (vals.length < minN) return { tr, unit, value: null, u: null, grade: 'ölçülemedi', experimental, n: vals.length };
  const value = median(vals);
  const uRep = vals.length > 1 ? (1.2533 * mad(vals)) / Math.sqrt(vals.length) : uSys; // tek tekrarda tekrarlanabilirlik bilinmez
  const u = Math.sqrt(uRep ** 2 + uSys ** 2);
  const [good, fair] = unit === 'cm' ? [2, 4] : unit === 's' ? [1.5, 4] : [4, 8];
  return { tr, unit, value: +value.toFixed(1), u: +u.toFixed(1), grade: u <= good ? 'iyi' : u <= fair ? 'orta' : 'düşük', experimental, n: vals.length };
}

/** Sağ–sol fark göstergesi (fark belirsizlikler içinde mi?). */
function asymmetry(tr, L, R) {
  if (L.value == null || R.value == null) return { tr, unit: L.unit, value: null, u: null, grade: 'ölçülemedi', experimental: L.experimental || R.experimental };
  const value = +(L.value - R.value).toFixed(1);
  const u = +Math.sqrt(L.u ** 2 + R.u ** 2).toFixed(1);
  return {
    tr, unit: L.unit, value, u, experimental: L.experimental || R.experimental,
    grade: L.grade === 'düşük' || R.grade === 'düşük' ? 'düşük' : L.grade === 'orta' || R.grade === 'orta' ? 'orta' : 'iyi',
    distinguishable: Math.abs(value) > u,
    sense: Math.abs(value) > u ? (value > 0 ? 'sol taraf daha geniş/uzun' : 'sağ taraf daha geniş/uzun') : null,
  };
}

/** İlk karelerden (dinlenme) segment boylarını kalibre eder: görünür boyun %80'i altı → kameraya doğru. */
function refLength(samples, a, b, w, h, n = 8) {
  return median(samples.slice(0, n).filter((s) => vis(s.lm, a) > 0.6 && vis(s.lm, b) > 0.6).map((s) => dist(px(s.lm, a, w, h), px(s.lm, b, w, h))));
}

// ---------------- Test tanımları ----------------

export const MOVEMENT_TESTS = {
  'kol-kaldirma': {
    tr: 'Kolları yandan kaldırma', view: 'front', durationS: 14, safety: 'normal',
    steps: [
      'Kollarınız yanda, dik durun.',
      'Kollarınızı yandan, dirsekleriniz düz, rahat olduğunuz kadar yavaşça kaldırın.',
      'Yavaşça indirin. Toplam üç kez tekrarlayın.',
    ],
    analyze: analyzeArmRaise,
  },
  comelme: {
    tr: 'Kontrollü çömelme', view: 'side', durationS: 16, safety: 'dikkat',
    steps: [
      'Yan dönün, ayaklarınız kalça genişliğinde.',
      'Rahat olduğunuz kadar, yavaşça çömelin ve kalkın. Üç kez tekrarlayın.',
      'Ağrı veya dengesizlik hissederseniz durun.',
    ],
    analyze: analyzeSquat,
  },
  'one-egilme': {
    tr: 'Öne eğilme', view: 'side', durationS: 12, safety: 'dikkat',
    steps: [
      'Yan dönün, dizleriniz düz.',
      'Kollarınız sarkık, rahat olduğunuz kadar yavaşça öne eğilin.',
      'Yavaşça doğrulun. Zorlamayın.',
    ],
    analyze: analyzeForwardBend,
  },
  'tek-ayak': {
    tr: 'Tek ayak üzerinde durma', view: 'front', durationS: 35, safety: 'denge',
    screening: [
      'Son 12 ayda düştünüz mü ya da sık baş dönmesi yaşıyor musunuz?',
      'Denge veya yürüme güçlüğünüz var mı?',
      'Yakın zamanda ameliyat, yaralanma geçirdiniz mi veya hamile misiniz?',
    ],
    preconditions: ['Hemen yanınızda tutunabileceğiniz sağlam bir destek (masa, duvar) olsun.', 'Zemin kaygan olmasın, çevrede engel olmasın.'],
    steps: [
      'Bir eliniz desteğin yakınında olsun.',
      'Bir ayağınızı yerden hafifçe kaldırın. En fazla 30 saniye.',
      'Dengeniz bozulursa hemen ayağınızı yere koyun veya desteğe tutunun.',
    ],
    maxHoldS: 30,
    analyze: analyzeSingleLeg,
  },
  boyun: {
    tr: 'Baş ve boyun hareket açıklığı', view: 'front', durationS: 20, safety: 'dikkat',
    steps: [
      'Omuzlarınızı sabit tutun.',
      'Başınızı yavaşça sağa yatırın, ortaya getirin, sola yatırın.',
      'Sonra başınızı yavaşça sağa ve sola çevirin. Ağrı olursa durun.',
    ],
    analyze: analyzeNeck,
  },
  yuruyus: {
    tr: 'Normal yürüyüş', view: 'side', durationS: 12, safety: 'dikkat',
    steps: [
      'Kameranın önünden, yandan görünecek şekilde normal hızınızda yürüyün.',
      'Kadrajın bir ucundan diğerine yürüyüp geri dönün.',
    ],
    preconditions: ['Yürüme alanında engel ve kaygan zemin olmasın.'],
    analyze: analyzeGait,
  },
};

// ---------------- Çözümleyiciler ----------------
// samples: [{t: saniye, lm: 33×[x,y,z,vis]}], ctx: {width, height, userHeightCm}

function analyzeArmRaise(samples, { width: w, height: h }) {
  const out = { metrics: {}, issues: [], reps: {} };
  const per = {};
  for (const [S, s, T] of SIDES) {
    const ref = refLength(samples, `${s}Shoulder`, `${s}Elbow`, w, h);
    let foreshortened = 0;
    const abd = samples.map(({ lm }) => {
      if (!['leftHip', 'rightHip', 'leftShoulder', 'rightShoulder', `${s}Elbow`].every((k) => vis(lm, k) > 0.6)) return NaN;
      const len = dist(px(lm, `${s}Shoulder`, w, h), px(lm, `${s}Elbow`, w, h));
      if (ref && len < FORESHORTEN * ref) { foreshortened++; return NaN; }
      // Gövde ekseni (omuz ortası → kalça ortası) ile üst kol arasındaki açı; 0° = kol yanda
      const sh = px(lm, `${s}Shoulder`, w, h);
      const axis = sub(mid(px(lm, 'leftHip', w, h), px(lm, 'rightHip', w, h)), mid(px(lm, 'leftShoulder', w, h), px(lm, 'rightShoulder', w, h)));
      return angleAt(add(sh, axis), sh, px(lm, `${s}Elbow`, w, h));
    });
    const sm = smooth(abd);
    const { peaks } = findReps(sm, { hi: 60, lo: 40 });
    out.reps[S] = peaks.length;
    const elbow = peaks.map((p) => {
      const lm = samples[p.i].lm;
      return angleAt(px(lm, `${s}Shoulder`, w, h), px(lm, `${s}Elbow`, w, h), px(lm, `${s}Wrist`, w, h));
    });
    if (elbow.some((a) => a < 150)) out.issues.push(`${T} kolda dirsek tepe noktasında bükülü (${Math.round(Math.min(...elbow))}°); açı omuz hareketini tam yansıtmayabilir.`);
    if (foreshortened > samples.length * 0.2) out.issues.push(`${T} kol karelerin bir kısmında kameraya doğru yöneldi; o kareler ölçüme katılmadı.`);
    per[S] = metric(`${T} kol kaldırma açısı (en yüksek)`, peaks.map((p) => p.value), { uSys: 3 });
    out.metrics[`abduction${S}`] = per[S];
  }
  out.metrics.abductionAsym = asymmetry('Sağ–sol fark (kol kaldırma)', per.L, per.R);
  if (!out.reps.L && !out.reps.R) out.issues.push('Tekrar algılanamadı: kollar 60°\'nin üzerine kalkmadı veya görünmedi.');
  out.valid = (out.reps.L ?? 0) + (out.reps.R ?? 0) > 0;
  return out;
}

function analyzeSquat(samples, { width: w, height: h }) {
  const out = { metrics: {}, issues: [], reps: {} };
  const side = nearSideSeries(samples);
  const knee = samples.map(({ lm }) => (['Hip', 'Knee', 'Ankle'].every((k) => vis(lm, `${side}${k}`) > 0.6)
    ? angleAt(px(lm, `${side}Hip`, w, h), px(lm, `${side}Knee`, w, h), px(lm, `${side}Ankle`, w, h)) : NaN));
  const hip = samples.map(({ lm }) => (['Shoulder', 'Hip', 'Knee'].every((k) => vis(lm, `${side}${k}`) > 0.6)
    ? angleAt(px(lm, `${side}Shoulder`, w, h), px(lm, `${side}Hip`, w, h), px(lm, `${side}Knee`, w, h)) : NaN));
  const sk = smooth(knee);
  const { dips } = findDips(sk, { lo: 140, hi: 160 });
  out.reps.n = dips.length;
  out.metrics.kneeMin = metric('En küçük diz açısı (en derin an)', dips.map((d) => d.value), { uSys: 6 });
  out.metrics.hipMin = metric('En küçük kalça açısı (en derin an)', dips.map((d) => smooth(hip)[d.i]), { uSys: 6 });
  out.metrics.trunkLean = metric('Gövdenin öne eğimi (en derin an)', dips.map((d) => {
    const lm = samples[d.i].lm;
    const s = px(lm, `${side}Shoulder`, w, h), p = px(lm, `${side}Hip`, w, h);
    return Math.abs(Math.atan2(s[0] - p[0], p[1] - s[1]) * DEG);
  }), { uSys: 3 });
  out.metrics.depthConsistency = metric('Tekrarlar arası derinlik farkı', dips.length > 1 ? [Math.max(...dips.map((d) => d.value)) - Math.min(...dips.map((d) => d.value))] : [], { uSys: 6, experimental: true });
  if (!dips.length) out.issues.push('Çömelme algılanamadı: diz açısı 140°\'nin altına inmedi veya bacak görünmedi.');
  out.valid = dips.length > 0;
  out.side = side;
  return out;
}

function analyzeForwardBend(samples, { width: w, height: h, userHeightCm }) {
  const out = { metrics: {}, issues: [], reps: {} };
  const side = nearSideSeries(samples);
  const trunk = samples.map(({ lm }) => (['Shoulder', 'Hip'].every((k) => vis(lm, `${side}${k}`) > 0.6)
    ? Math.abs(Math.atan2(px(lm, `${side}Shoulder`, w, h)[0] - px(lm, `${side}Hip`, w, h)[0], px(lm, `${side}Hip`, w, h)[1] - px(lm, `${side}Shoulder`, w, h)[1]) * DEG) : NaN));
  const st = smooth(trunk);
  const { peaks } = findReps(st, { hi: 30, lo: 15 });
  out.reps.n = peaks.length;
  out.metrics.trunkFlexMax = metric('Gövdenin en fazla öne eğilmesi', peaks.map((p) => p.value), { uSys: 3 });
  const scale = median(samples.slice(0, 8).map((s) => cmPerPx(s.lm, w, h, userHeightCm)).filter(Boolean));
  if (Number.isFinite(scale)) {
    out.metrics.fingerFloor = metric('Parmak ucu – zemin mesafesi (en derin an)', peaks.map((p) => {
      const lm = samples[p.i].lm;
      if (vis(lm, `${side}Index`) < 0.5) return NaN;
      return (px(lm, `${side}Heel`, w, h)[1] - px(lm, `${side}Index`, w, h)[1]) * scale;
    }), { unit: 'cm', uSys: 2.5, experimental: true });
  }
  if (!peaks.length) out.issues.push('Öne eğilme algılanamadı (gövde 30°\'nin üzerine eğilmedi).');
  out.valid = peaks.length > 0;
  return out;
}

/**
 * Tek ayak: kaldırılan ayak (ayak bileği yüksekliği farkı) ve süre; salınım = kalça ortasının yatay sapması.
 * Ayak yere değince veya maxHoldS dolunca süre biter.
 */
export function analyzeSingleLeg(samples, { width: w, height: h, userHeightCm, maxHoldS = 30 }) {
  const out = { metrics: {}, issues: [], reps: {} };
  const leg = median(samples.slice(0, 8).map(({ lm }) => dist(px(lm, 'leftHip', w, h), px(lm, 'leftAnkle', w, h))));
  const scale = median(samples.slice(0, 8).map((s) => cmPerPx(s.lm, w, h, userHeightCm)).filter(Boolean));
  const lift = samples.map(({ lm }) => {
    const d = px(lm, 'rightAnkle', w, h)[1] - px(lm, 'leftAnkle', w, h)[1]; // + : sol ayak bileği daha yukarıda
    return d / (leg || 1);
  });
  const sl = smooth(lift, 5);
  for (const [S, sgn, T] of [['L', 1, 'Sol'], ['R', -1, 'Sağ']]) {
    // Bölümler: kaldırılan ayak bileği bacak boyunun %4'ünden fazla yukarıda
    const eps = [];
    let start = null;
    sl.forEach((v, i) => {
      const up = sgn * v > 0.04;
      if (up && start === null) start = i;
      if ((!up || i === sl.length - 1) && start !== null) { eps.push([start, up ? i : i - 1]); start = null; }
    });
    const longest = eps.sort((a, b) => (samples[b[1]].t - samples[b[0]].t) - (samples[a[1]].t - samples[a[0]].t))[0];
    const stance = S === 'L' ? 'Sağ' : 'Sol'; // sol ayak kalkınca sağ ayak üzerinde durulur
    if (!longest) { out.metrics[`hold${S}`] = { tr: `${stance} ayak üzerinde süre`, unit: 's', value: null, u: null, grade: 'ölçülemedi' }; continue; }
    const dur = Math.min(maxHoldS, samples[longest[1]].t - samples[longest[0]].t);
    out.metrics[`hold${S}`] = { tr: `${stance} ayak üzerinde süre`, unit: 's', value: +dur.toFixed(1), u: 0.3, grade: 'iyi', n: longest[1] - longest[0] + 1 };
    if (Number.isFinite(scale)) {
      const xs = samples.slice(longest[0], longest[1] + 1).map(({ lm }) => mid(px(lm, 'leftHip', w, h), px(lm, 'rightHip', w, h))[0] * scale);
      const m = median(xs);
      const sway = Math.sqrt(xs.reduce((s, x) => s + (x - m) ** 2, 0) / xs.length);
      out.metrics[`sway${S}`] = metric(`${stance} ayakta kalça salınımı (yatay)`, [sway], { unit: 'cm', uSys: 0.5, experimental: true });
    }
  }
  out.valid = out.metrics.holdL?.value != null || out.metrics.holdR?.value != null;
  if (!out.valid) out.issues.push('Ayak kaldırma algılanamadı.');
  return out;
}

function analyzeNeck(samples, { width: w, height: h }) {
  const out = { metrics: {}, issues: [], reps: {} };
  // Yana eğilme: kulak doğrusunun omuz doğrusuna göre açısı (gövde eğimi düşülür). + kişinin sağına (önden).
  const lat = samples.map(({ lm }) => {
    if (!['leftEar', 'rightEar', 'leftShoulder', 'rightShoulder'].every((k) => vis(lm, k) > 0.5)) return NaN;
    const tilt = (a, b) => { const [L, R] = a[0] <= b[0] ? [a, b] : [b, a]; return Math.atan2(L[1] - R[1], R[0] - L[0]) * DEG; };
    return tilt(px(lm, 'leftEar', w, h), px(lm, 'rightEar', w, h)) - tilt(px(lm, 'leftShoulder', w, h), px(lm, 'rightShoulder', w, h));
  });
  const sl = smooth(lat);
  const right = findReps(sl, { hi: 12, lo: 5 }).peaks.map((p) => p.value);
  const left = findReps(sl.map((x) => -x), { hi: 12, lo: 5 }).peaks.map((p) => p.value);
  out.metrics.latFlexR = metric('Başı sağa yatırma', right, { uSys: 3 });
  out.metrics.latFlexL = metric('Başı sola yatırma', left, { uSys: 3 });
  out.metrics.latAsym = asymmetry('Sağ–sol fark (yana yatırma)', out.metrics.latFlexL, out.metrics.latFlexR);
  // Dönme: burnun kulak ortasına göre yatay kayması / kulaklar arası mesafe → yaklaşık açı (deneysel)
  const rot = samples.map(({ lm }) => {
    if (!['nose', 'leftEar', 'rightEar'].every((k) => vis(lm, k) > 0.3)) return NaN;
    const e = mid(px(lm, 'leftEar', w, h), px(lm, 'rightEar', w, h));
    const half = dist(px(lm, 'leftEar', w, h), px(lm, 'rightEar', w, h)) / 2 || 1;
    // Önden bakışta burnun ekranda sola kayması = kişinin soluna dönüş (aynasız görüntü)
    return Math.asin(Math.max(-1, Math.min(1, (e[0] - px(lm, 'nose', w, h)[0]) / (half * 1.6)))) * DEG;
  });
  const sr = smooth(rot);
  out.metrics.rotL = metric('Başı sola çevirme (yaklaşık)', findReps(sr, { hi: 20, lo: 8 }).peaks.map((p) => p.value), { uSys: 10, experimental: true });
  out.metrics.rotR = metric('Başı sağa çevirme (yaklaşık)', findReps(sr.map((x) => -x), { hi: 20, lo: 8 }).peaks.map((p) => p.value), { uSys: 10, experimental: true });
  out.valid = right.length + left.length > 0;
  if (!out.valid) out.issues.push('Baş hareketi algılanamadı.');
  return out;
}

/** Yürüyüş (yandan): ayak bilekleri arasındaki yatay mesafe işaret değiştirdikçe bir adım. */
export function analyzeGait(samples, { width: w, height: h }) {
  const out = { metrics: {}, issues: [], reps: {} };
  const sep = samples.map(({ lm }) => (vis(lm, 'leftAnkle') > 0.4 && vis(lm, 'rightAnkle') > 0.4 ? px(lm, 'leftAnkle', w, h)[0] - px(lm, 'rightAnkle', w, h)[0] : NaN));
  const leg = median(samples.map(({ lm }) => dist(px(lm, 'leftHip', w, h), px(lm, 'leftAnkle', w, h))));
  const s = smooth(sep, 3).map((x) => x / (leg || 1));
  // Histerezis: ±%8 bacak boyu
  const steps = [];
  let state = 0;
  s.forEach((x, i) => {
    if (!Number.isFinite(x)) return;
    if (state <= 0 && x > 0.08) { if (state < 0) steps.push({ i, t: samples[i].t, lead: 'L' }); state = 1; }
    else if (state >= 0 && x < -0.08) { if (state > 0) steps.push({ i, t: samples[i].t, lead: 'R' }); state = -1; }
  });
  out.reps.n = steps.length;
  if (steps.length < 4) {
    out.issues.push('Yeterli adım algılanamadı (en az 4 adım gerekir). Kadrajdan yandan geçerek tekrar deneyin.');
    out.valid = false;
    return out;
  }
  const dts = steps.slice(1).map((st, i) => ({ dt: st.t - steps[i].t, lead: st.lead }));
  const cad = 60 / median(dts.map((d) => d.dt));
  out.metrics.cadence = metric('Adım sıklığı (kadans)', [cad], { unit: 'adım/dk', uSys: Math.max(4, cad * 0.08), experimental: true });
  const L = dts.filter((d) => d.lead === 'L').map((d) => d.dt), R = dts.filter((d) => d.lead === 'R').map((d) => d.dt);
  if (L.length && R.length) {
    const ratio = median(L) / median(R);
    out.metrics.stepSymmetry = metric('Adım süresi oranı (sol/sağ)', [ratio], { unit: '', uSys: 0.08, experimental: true });
  }
  out.valid = true;
  return out;
}

function nearSideSeries(samples) {
  let s = 0;
  for (const { lm } of samples) for (const k of ['Shoulder', 'Hip', 'Knee', 'Ankle']) s += vis(lm, `left${k}`) - vis(lm, `right${k}`);
  return s >= 0 ? 'left' : 'right';
}
