// Kamera koçu (saf; DOM yok): kare kare MediaPipe noktalarından ÇEVRİMİÇİ tekrar sayımı, hareketin başlangıç/
// bitişi, görünür eklem açıları, sağ–sol farkı ve tempo. Fizyoterapist değildir: düzeltme komutu vermez, yalnızca
// ölçülen gözlemi ±belirsizlikle bildirir. Güvenilirlik kapısı geçilmezse açı/tempo gözlemi hiç gösterilmez.
//
// Ölçüm kuralları (src/analysis/movement.js ile aynı):
//  - Açılar görüntü düzleminde ölçülür; görünürlüğü < 0,6 olan nokta kullanılmaz.
//  - Segment kameraya doğru yöneldiğinde (görünür boy, kalibre boyun %80'inden kısa) o kare açı ölçümünden çıkar.
//  - Sistematik belirsizlik uSys = 6° (scripts/movement-bench.mjs: MediaPipe full, taraf başına 3,2° ve −5,9°;
//    coach-bench.mjs bu modül için ayrıca ölçer). Sağ–sol fark yalnızca |fark| > 2u ise "ayırt edilebilir".

import { MP, angleAt, dist, median, mad } from '../analysis/geometry.js';

export const U_SYS = 6;
const VIS = 0.6;
const FORESHORTEN = 0.8;
const SMOOTH = 5;

/**
 * Hareket türleri. signal: kare başına taraf açısı; phase: tekrar eşikleri (histerezis).
 *  - 'down' hareketleri (squat, otur-kalk): açı tepe eşiğinin altına inince başlar, en küçük değer hareketin
 *    en derin anıdır, üst eşiğe dönünce tekrar biter.
 *  - 'up' hareketleri (kol kaldırma): açı başlangıç eşiğini geçince başlar, tepe en yüksek an, dönüşte biter.
 */
export const COACH_KINDS = {
  squat: {
    tr: 'Squat', view: 'side', dir: 'down', joint: 'diz', start: 150, end: 160, minDepth: 30,
    setup: 'Telefonu bel hizasında, 2–3 m uzağa koyun ve yan dönün; baştan ayağa görünün.',
    chain: ['Hip', 'Knee', 'Ankle'], ref: [['Hip', 'Knee'], ['Knee', 'Ankle']],
  },
  'sit-to-stand': {
    tr: 'Sandalyeden otur-kalk', view: 'side', dir: 'down', joint: 'diz', start: 145, end: 155, minDepth: 35,
    setup: 'Sağlam bir sandalyeyi duvara dayayın; telefonu yan tarafa, 2–3 m uzağa koyun.',
    chain: ['Hip', 'Knee', 'Ankle'], ref: [['Hip', 'Knee'], ['Knee', 'Ankle']],
  },
  'arm-raise': {
    tr: 'Kol kaldırma', view: 'front', dir: 'up', joint: 'omuz', start: 70, end: 55, minDepth: 40, perSide: true,
    setup: 'Telefonu göğüs hizasında, 2 m uzağa koyun ve kameraya dönün; kollarınız ve kalçanız görünsün.',
    chain: ['Hip', 'Shoulder', 'Elbow'], ref: [['Shoulder', 'Elbow']],
  },
};

const SIDES = [['L', 'left', 'Sol'], ['R', 'right', 'Sağ']];
const pt = (lm, k, w, h) => [lm[MP[k]][0] * w, lm[MP[k]][1] * h];
const vis = (lm, k) => lm[MP[k]]?.[3] ?? 0;

/** Tekrarlanan ölçümlerden değer ± belirsizlik (movement.js metric() ile aynı yöntem). */
export function summarize(values, uSys = U_SYS) {
  const v = values.filter(Number.isFinite);
  if (!v.length) return { value: null, u: null, n: 0 };
  const uRep = v.length > 1 ? (1.2533 * mad(v)) / Math.sqrt(v.length) : uSys;
  return { value: +median(v).toFixed(1), u: +Math.sqrt(uRep ** 2 + uSys ** 2).toFixed(1), n: v.length };
}

/**
 * @param {keyof COACH_KINDS} kind
 * @param {{width?:number, height?:number, calibFrames?:number}} o
 */
export function createCoach(kind, { width = 1, height = 1, calibFrames = 8 } = {}) {
  const K = COACH_KINDS[kind];
  if (!K) throw new Error(`bilinmeyen koç hareketi: ${kind}`);
  const sides = Object.fromEntries(SIDES.map(([S]) => [S, {
    raw: [], ref: null, calib: [], phase: 'ready', cur: null, reps: [],
  }]));
  let frames = 0, usable = 0, lastT = null;

  function sideAngle(lm, s) {
    const keys = K.chain.map((k) => `${s}${k}`);
    if (!keys.every((k) => vis(lm, k) > VIS)) return { a: NaN, lens: null };
    const lens = K.ref.map(([a, b]) => dist(pt(lm, `${s}${a}`, width, height), pt(lm, `${s}${b}`, width, height)));
    const [a, b, c] = keys.map((k) => pt(lm, k, width, height));
    return { a: angleAt(a, b, c), lens };
  }

  function step(S, s, a, t) {
    const st = sides[S];
    st.raw.push(a);
    if (st.raw.length > SMOOTH) st.raw.shift();
    const x = median(st.raw);
    if (!Number.isFinite(x)) return null;
    const down = K.dir === 'down';
    const beyondStart = down ? x < K.start : x > K.start;
    const backAtEnd = down ? x > K.end : x < K.end;
    if (st.phase === 'ready' && backAtEnd) st.phase = 'top';
    if (st.phase === 'top' && beyondStart) {
      st.phase = 'move';
      st.cur = { start: t, extreme: x, extremeT: t };
    } else if (st.phase === 'move') {
      if (down ? x < st.cur.extreme : x > st.cur.extreme) { st.cur.extreme = x; st.cur.extremeT = t; }
      if (backAtEnd) {
        st.phase = 'top';
        const r = { ...st.cur, end: t };
        st.cur = null;
        const rom = down ? K.end - r.extreme : r.extreme - K.end;
        if (rom >= K.minDepth - 10) { st.reps.push(r); return r; } // çok küçük salınım tekrar sayılmaz
      }
    }
    return null;
  }

  return {
    kind, def: K,
    /**
     * @param {number[][]|null} lm 33 nokta [x,y,z,görünürlük] (normalize) ya da kişi yoksa null
     * @param {number} t saniye
     * @returns {{reps:number, newRep:object|null, angle:Record<string,number|null>, visible:boolean, phase:string}}
     */
    push(lm, t) {
      frames++;
      lastT = t;
      const angle = {};
      let newRep = null, anyVisible = false;
      for (const [S, s] of SIDES) {
        if (!lm) { angle[S] = null; continue; }
        const st = sides[S];
        let { a, lens } = sideAngle(lm, s);
        if (Number.isFinite(a)) {
          if (!st.ref) {
            st.calib.push(lens);
            if (st.calib.length >= calibFrames) st.ref = lens.map((_, i) => median(st.calib.map((l) => l[i])));
          } else if (lens.some((l, i) => l < FORESHORTEN * st.ref[i])) a = NaN; // kameraya doğru: ölçme
        }
        angle[S] = Number.isFinite(a) ? +a.toFixed(1) : null;
        if (angle[S] != null) anyVisible = true;
        const r = step(S, s, a, t);
        if (r) newRep = { side: S, ...r };
      }
      if (anyVisible) usable++;
      return { reps: this.count(), newRep, angle, visible: anyVisible, phase: this.phase() };
    },
    /** Kol kaldırmada iki kol ayrı sayılır, gösterilen sayı ikisinin küçüğüdür; diğerlerinde en çok sayan taraf. */
    count() {
      const n = SIDES.map(([S]) => sides[S].reps.length);
      if (K.perSide) {
        const active = n.filter((x) => x > 0);
        return active.length === 2 ? Math.min(...active) : Math.max(...n);
      }
      return Math.max(...n);
    },
    phase() {
      const ph = SIDES.map(([S]) => sides[S].phase);
      return ph.includes('move') ? 'move' : ph.includes('top') ? 'top' : 'ready';
    },
    /**
     * Oturum özeti. reliable=false ise açı/tempo gözlemleri null döner (kesin düzeltme yapılmaz).
     */
    summary() {
      const coverage = frames ? usable / frames : 0;
      const per = {};
      for (const [S, , T] of SIDES) {
        const reps = sides[S].reps;
        per[S] = {
          tr: T, reps: reps.length,
          extreme: summarize(reps.map((r) => r.extreme)),
          down: summarize(reps.map((r) => r.extremeT - r.start), 0.15),
          up: summarize(reps.map((r) => r.end - r.extremeT), 0.15),
          duration: summarize(reps.map((r) => r.end - r.start), 0.15),
        };
      }
      const reps = this.count();
      const counted = per.L.reps >= per.R.reps ? per.L : per.R;
      const reasons = [];
      if (frames < 15) reasons.push('Çok kısa kayıt.');
      if (coverage < 0.7) reasons.push(`Gerekli eklemler karelerin yalnızca %${Math.round(coverage * 100)}'inde net göründü (en az %70 gerekir).`);
      if (reps < 2) reasons.push('Belirsizlik hesabı için en az 2 tekrar gerekir.');
      if (counted.extreme.u != null && counted.extreme.u > 12) reasons.push(`Tekrarlar arası açı dağınıklığı yüksek (±${counted.extreme.u}°).`);
      const reliable = reasons.length === 0;
      // Yandan görünüşte uzak taraf gizlidir: sağ–sol karşılaştırması yapılmaz (yalnızca önden).
      let asym = null;
      if (reliable && K.view === 'front' && per.L.extreme.value != null && per.R.extreme.value != null) {
        const value = +(per.L.extreme.value - per.R.extreme.value).toFixed(1);
        const u = +Math.hypot(per.L.extreme.u, per.R.extreme.u).toFixed(1);
        asym = { value, u, distinguishable: Math.abs(value) > 2 * u };
      }
      return {
        kind, tr: K.tr, reps, coverage: +coverage.toFixed(2), durationS: lastT, reliable, reasons,
        sides: reliable ? per : null, asym,
        observations: reliable ? observations(K, per, asym) : [],
      };
    },
  };
}

/** Yalnızca gözlem cümleleri (komut değil). Tıbbi yorum ve "doğru/yanlış form" hükmü yok. */
export function observations(K, per, asym) {
  const out = [];
  const sides = Object.values(per).filter((p) => p.extreme.value != null);
  const lead = sides.sort((a, b) => b.reps - a.reps)[0];
  if (!lead) return out;
  const label = K.dir === 'down' ? `En küçük ${K.joint} açısı` : `En yüksek ${K.joint} açısı`;
  for (const p of K.perSide ? Object.values(per) : [lead]) {
    if (p.extreme.value != null) out.push(`${K.perSide ? `${p.tr} kol — ` : ''}${label}: ${Math.round(p.extreme.value)}° ± ${Math.round(p.extreme.u)}° (${p.reps} tekrar).`);
  }
  if (lead.down.value != null && lead.up.value != null) {
    out.push(`Tempo: ${K.dir === 'down' ? 'iniş' : 'kaldırış'} ≈ ${lead.down.value.toFixed(1)} s, ${K.dir === 'down' ? 'kalkış' : 'indiriş'} ≈ ${lead.up.value.toFixed(1)} s (tekrar başına ≈ ${lead.duration.value.toFixed(1)} s).`);
    if (lead.down.value < 0.8) out.push('İniş bir saniyeden kısa sürdü; programdaki önerilen tempo genellikle 2 saniyelik kontrollü iniştir.');
  }
  if (lead.extreme.u != null && lead.reps >= 3) {
    out.push(lead.extreme.u <= 8 ? 'Tekrarlar arası hareket açıklığı ölçüm belirsizliği içinde tutarlı.' : 'Tekrarlar arasında hareket açıklığı değişti; yorgunluk veya ölçüm kaynaklı olabilir.');
  }
  if (asym) {
    out.push(asym.distinguishable
      ? `Sağ–sol farkı ${Math.abs(asym.value)}° ± ${asym.u}°: ölçüm belirsizliğinin dışında. Tek oturumluk bir gözlemdir; ağrı veya kısıtlılık varsa bir uzmana danışın.`
      : `Sağ–sol farkı ${Math.abs(asym.value)}° ± ${asym.u}°: ölçüm belirsizliği içinde, ayırt edilemiyor.`);
  }
  return out;
}
