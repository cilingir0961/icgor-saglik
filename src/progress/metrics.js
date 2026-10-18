// Gelişim hesapları (saf). Kural: değişim yalnızca belirsizliği aşıyorsa "olası değişim" denir; aksi halde
// "belirsiz". Adımlarda belirsizlik günlük dağılımdan (ortalamaların standart hatası), kamera koçunda ölçüm
// belirsizliğinden (en küçük saptanabilir değişim, MDC95) gelir.

import { lastDays } from '../activity/steps.js';

const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
const sd = (xs) => { const m = mean(xs); return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / Math.max(1, xs.length - 1)); };

/**
 * Son n gün ile ondan önceki n günün adım ortalaması karşılaştırması.
 * @returns {{days:number, avg:number|null, prevAvg:number|null, n:number, prevN:number, delta?:number, margin?:number, status:'yok'|'belirsiz'|'artis'|'azalis', demo:boolean}}
 */
export function stepPeriod(days, n, now = new Date()) {
  const keys = lastDays(2 * n, now);
  const pick = (ks) => ks.map((k) => days?.[k]).filter((d) => d && Number.isFinite(d.steps));
  const cur = pick(keys.slice(n)), prev = pick(keys.slice(0, n));
  const demo = [...cur, ...prev].some((d) => d.source === 'demo');
  const out = { days: n, avg: cur.length ? Math.round(mean(cur.map((d) => d.steps))) : null, prevAvg: prev.length ? Math.round(mean(prev.map((d) => d.steps))) : null, n: cur.length, prevN: prev.length, demo };
  // En az 3 kayıtlı gün olmadan karşılaştırma yapılmaz; kayıtlar dönemin en az üçte biri olmalı
  const need = Math.max(3, Math.ceil(n / 3));
  if (cur.length < need || prev.length < need) return { ...out, status: 'yok' };
  const a = cur.map((d) => d.steps), b = prev.map((d) => d.steps);
  const se = Math.sqrt(sd(a) ** 2 / a.length + sd(b) ** 2 / b.length);
  const delta = Math.round(mean(a) - mean(b));
  const margin = Math.round(1.96 * se);
  return { ...out, delta, margin, status: Math.abs(delta) <= margin ? 'belirsiz' : delta > 0 ? 'artis' : 'azalis' };
}

/** Haftalık antrenman sayıları (son w hafta, eskiden yeniye; hafta Pazartesi başlar). */
export function weeklyWorkouts(history, w = 6, now = new Date()) {
  const start = new Date(now); start.setHours(0, 0, 0, 0); start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
  return Array.from({ length: w }, (_, i) => {
    const from = new Date(start); from.setDate(from.getDate() - 7 * (w - 1 - i));
    const to = new Date(from); to.setDate(to.getDate() + 7);
    const items = (history ?? []).filter((x) => { const d = new Date(x.date); return d >= from && d < to; });
    return { from, count: items.length, exercises: items.reduce((s, x) => s + (x.done ?? 0), 0) };
  });
}

/**
 * Kamera koçu kayıtları: aynı hareket için ilk ve son GÜVENİLİR ölçüm karşılaştırması (MDC95).
 * @param {{date:string, kind:string, tr:string, reliable:boolean, extreme?:{value:number,u:number}}[]} log
 */
export function coachChanges(log) {
  const by = {};
  for (const r of log ?? []) if (r.reliable && r.extreme?.value != null) (by[r.kind] ??= []).push(r);
  return Object.entries(by).map(([kind, rs]) => {
    rs.sort((a, b) => a.date.localeCompare(b.date));
    const first = rs[0], last = rs.at(-1);
    if (rs.length < 2) return { kind, tr: last.tr, n: 1, status: 'yok', text: 'Karşılaştırma için en az iki güvenilir ölçüm gerekir.' };
    const delta = +(last.extreme.value - first.extreme.value).toFixed(1);
    const mdc = +(1.96 * Math.hypot(first.extreme.u, last.extreme.u)).toFixed(1);
    const status = Math.abs(delta) <= mdc ? 'belirsiz' : 'olasi';
    return {
      kind, tr: last.tr, n: rs.length, delta, mdc, status,
      text: status === 'belirsiz'
        ? `Fark ${delta > 0 ? '+' : ''}${delta}° ölçüm belirsizliği içinde (±${mdc}°); değişim gösterilemiyor.`
        : `Olası değişim: ${delta > 0 ? '+' : ''}${delta}° (en küçük saptanabilir değişim ±${mdc}°). Kamera açısı ve kıyafet farkı da etkileyebilir.`,
    };
  });
}
