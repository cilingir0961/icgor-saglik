// Adım ve aktivite hesapları (saf). Hedef herkes için sabit 10.000 DEĞİLDİR: kişinin son günlerdeki
// ortalamasından kademeli (+%10) uyarlanır; veri yoksa ılımlı bir başlangıç önerilir.

import { median } from '../analysis/geometry.js';

/** Yerel tarih anahtarı (YYYY-AA-GG). */
export function dayKey(d = new Date()) {
  const x = new Date(d);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
}

/** Son n günün anahtarları (bugün dahil, eskiden yeniye). */
export function lastDays(n, now = new Date()) {
  return Array.from({ length: n }, (_, i) => { const d = new Date(now); d.setDate(d.getDate() - (n - 1 - i)); return dayKey(d); });
}

/**
 * Uyarlanır günlük hedef.
 * @param {Record<string,{steps:number}>} days
 * @returns {{goal:number, basis:string, baseline:number|null}}
 */
export function adaptiveGoal(days, now = new Date(), { goalType } = {}) {
  const keys = lastDays(15, now).slice(0, -1); // bugün hariç son 14 gün
  const vals = keys.map((k) => days?.[k]?.steps).filter((v) => Number.isFinite(v) && v > 0);
  if (vals.length < 3) return { goal: 5000, baseline: null, basis: 'Yeterli kayıt yok: ılımlı bir başlangıç hedefi. Birkaç gün kayıttan sonra hedef ortalamanıza göre uyarlanır.' };
  const baseline = median(vals);
  const k = goalType === 'aktivite' ? 1.15 : 1.1;
  const goal = Math.min(12000, Math.max(3000, Math.round((baseline * k) / 500) * 500));
  return { goal, baseline: Math.round(baseline), basis: `Son ${vals.length} günün ortanca değeri ${Math.round(baseline).toLocaleString('tr-TR')} adım; hedef bunun yaklaşık %${Math.round((k - 1) * 100)} üstü.` };
}

/** Haftalık özet: son 7 gün ortalaması ve önceki 7 günle fark. */
export function weekStats(days, now = new Date()) {
  const k = lastDays(14, now);
  const v = (keys) => keys.map((x) => days?.[x]?.steps).filter((s) => Number.isFinite(s));
  const cur = v(k.slice(7)), prev = v(k.slice(0, 7));
  const avg = (xs) => (xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : null);
  return { avg: avg(cur), prevAvg: avg(prev), daysLogged: cur.length, change: avg(cur) != null && avg(prev) != null ? avg(cur) - avg(prev) : null };
}

/** Hedefe ulaşılan art arda gün sayısı (bugünden geriye). */
export function streak(days, goal, now = new Date()) {
  let n = 0;
  for (const k of lastDays(60, now).reverse()) {
    const s = days?.[k]?.steps;
    if (Number.isFinite(s) && s >= goal) n++; else if (k !== dayKey(now)) break;
  }
  return n;
}

/** Açıkça etiketli demo verisi (belirlenimci). Gerçek ölçüm değildir. */
export function demoDays(n = 21, now = new Date(), seed = 7) {
  let x = seed;
  const rnd = () => { x = (x * 16807) % 2147483647; return x / 2147483647; };
  return Object.fromEntries(lastDays(n, now).slice(0, -1).map((k, i) => [k, { steps: Math.round(4200 + 2200 * rnd() + i * 40), source: 'demo' }]));
}
