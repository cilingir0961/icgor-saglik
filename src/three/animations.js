// 4D (zaman içinde değişen 3B) EĞİTİM SİMÜLASYONLARI — gerçek fizyolojik ölçüm değildir.
// Saf fonksiyonlar: zaman (s) → animasyon parametreleri. Değerler ders kitabı düzeyinde temsili büyüklüklerdir.

const smooth = (x) => x * x * (3 - 2 * x);
const pulse = (t, start, rise, fall) => {
  if (t < start) return 0;
  if (t < start + rise) return smooth((t - start) / rise);
  if (t < start + rise + fall) return 1 - smooth((t - start - rise) / fall);
  return 0;
};

/**
 * Kalp döngüsü (varsayılan 70/dk ≈ 0,86 s). Önce kulakçıklar (atriyal sistol), ardından karıncıklar
 * (ventriküler sistol) kasılır. Döndürülen değer: hacim küçülme oranı (0 = gevşek).
 */
export function heartCycle(timeSec, bpm = 70) {
  const period = 60 / bpm;
  const t = ((timeSec % period) + period) % period / period; // 0–1 faz
  return {
    phase: t,
    atria: pulse(t, 0.0, 0.06, 0.1), // ~P dalgası sonrası
    ventricles: pulse(t, 0.14, 0.12, 0.26), // QRS sonrası sistol, ardından gevşeme
  };
}

/** Kasılmada ölçek: kulakçıklar %7, karıncıklar %9 küçülür (temsili). */
export const heartScale = (h) => ({ atria: 1 - 0.07 * h.atria, ventricles: 1 - 0.09 * h.ventricles });

/**
 * Sakin solunum (varsayılan 14/dk). Soluk alma döngünün ~%40'ı, verme ~%60'ı. 0 = tam soluk verme, 1 = tam soluk alma.
 */
export function breathCycle(timeSec, perMinute = 14) {
  const period = 60 / perMinute;
  const t = ((timeSec % period) + period) % period / period;
  const k = t < 0.4 ? smooth(t / 0.4) : 1 - smooth((t - 0.4) / 0.6);
  return { phase: t, inhale: k };
}

/**
 * Soluk almanın yapılara etkisi (metre / ölçek): diyafram iner, akciğerler aşağı-öne-yana genişler,
 * karın üst organları aşağı itilir, göğüs kafesi hafifçe genişler.
 */
export function breathEffects(inhale) {
  return {
    diaphragmDrop: 0.016 * inhale,
    abdominalDrop: 0.011 * inhale,
    heartDrop: 0.005 * inhale,
    lungScale: [1 + 0.03 * inhale, 1 + 0.06 * inhale, 1 + 0.045 * inhale],
    ribScale: [1 + 0.015 * inhale, 1 + 0.004 * inhale, 1 + 0.025 * inhale],
  };
}

const deg = Math.PI / 180;

/** Eklem hareketi programları → rig pozu. */
export const MOTIONS = {
  'kol-kaldirma': {
    tr: 'Kol kaldırma ve dirsek bükme',
    period: 4,
    pose(t) {
      const k = 0.5 - 0.5 * Math.cos((t / this.period) * 2 * Math.PI);
      const e = Math.max(0, Math.sin((t / this.period) * 2 * Math.PI));
      return {
        'shoulder-L': { abduct: 70 * deg * k }, 'shoulder-R': { abduct: 70 * deg * k },
        'elbow-L': { flex: 100 * deg * e }, 'elbow-R': { flex: 100 * deg * e },
      };
    },
  },
  yurume: {
    tr: 'Yürüme döngüsü',
    period: 1.1,
    pose(t) {
      const w = (t / this.period) * 2 * Math.PI;
      const knee = (ph) => 55 * deg * Math.max(0, Math.sin(w + ph + 0.6)) ** 1.5;
      return {
        'hip-L': { flex: 25 * deg * Math.sin(w) }, 'hip-R': { flex: 25 * deg * Math.sin(w + Math.PI) },
        'knee-L': { flex: knee(0) + 5 * deg }, 'knee-R': { flex: knee(Math.PI) + 5 * deg },
        'shoulder-L': { flex: -18 * deg * Math.sin(w) }, 'shoulder-R': { flex: -18 * deg * Math.sin(w + Math.PI) },
        'elbow-L': { flex: 20 * deg }, 'elbow-R': { flex: 20 * deg },
      };
    },
  },
};
