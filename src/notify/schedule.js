// Hatırlatma zamanlaması (saf). Kullanıcı türleri, saatleri, sessiz saatleri ve günlük üst sınırı seçer.
// Gerçek çalışma sınırı (docs/PLATFORM.md): bu sürüm bildirimleri YALNIZCA uygulama açıkken (ön planda veya
// arka plan sekmesinde, tarayıcı izin verdikçe) gösterir. Uygulama kapalıyken bildirim için Web Push sunucusu
// gerekir; bu sürümde yoktur ve "çalışıyor" gibi sunulmaz.

export const TYPES = {
  sabah: { tr: 'Sabah planı', desc: 'Günün antrenmanı ve adım hedefi.', default: { on: true, time: '08:30' } },
  antrenman: { tr: 'Antrenman zamanı', desc: 'Planlı antrenman günlerinde.', default: { on: true, time: '18:30' } },
  yuruyus: { tr: 'Yürüyüş hatırlatması', desc: 'Adım hedefinin gerisindeyseniz.', default: { on: true, time: '16:00' } },
  hareket: { tr: 'Hareket molası', desc: 'Uzun oturmalarda kısa mola (aralıkla).', default: { on: false, intervalMin: 60, from: '09:00', to: '18:00' } },
  aksam: { tr: 'Akşam değerlendirmesi', desc: 'Günün kısa özeti.', default: { on: false, time: '21:00' } },
  haftalik: { tr: 'Haftalık özet', desc: 'Pazar akşamı haftanın özeti.', default: { on: true, time: '20:00', dow: 6 } },
};

export function defaults() {
  return {
    enabled: false, permission: 'default',
    types: Object.fromEntries(Object.entries(TYPES).map(([k, t]) => [k, { ...t.default }])),
    quiet: { from: '22:00', to: '08:00' }, maxPerDay: 5,
  };
}

const toMin = (hhmm) => { const m = /^(\d{1,2}):(\d{2})$/.exec(String(hhmm ?? '')); return m ? Math.min(23, +m[1]) * 60 + Math.min(59, +m[2]) : null; };
export const validTime = (s) => toMin(s) != null;

/** Sessiz saat içinde mi? (gece yarısını aşan aralık desteklenir) */
export function inQuiet(min, quiet) {
  const a = toMin(quiet?.from), b = toMin(quiet?.to);
  if (a == null || b == null || a === b) return false;
  return a < b ? min >= a && min < b : min >= a || min < b;
}

/** Pazartesi = 0 */
const dow = (d) => (d.getDay() + 6) % 7;

/**
 * Belirli bir gün için planlanan olaylar (sessiz saatler ve günlük sınır uygulanmış, saate göre sıralı).
 * @param {{planDays?:number[]}} ctx planDays: antrenman olan haftanın günleri (Pzt=0)
 */
export function eventsForDay(settings, day, ctx = {}) {
  if (!settings?.enabled) return [];
  const out = [];
  const base = new Date(day); base.setHours(0, 0, 0, 0);
  const at = (min) => new Date(base.getTime() + min * 60000);
  for (const [type, cfg] of Object.entries(settings.types ?? {})) {
    if (!cfg?.on || !TYPES[type]) continue;
    if (type === 'antrenman' && !(ctx.planDays ?? []).includes(dow(base))) continue;
    if (type === 'haftalik' && dow(base) !== (cfg.dow ?? 6)) continue;
    if (type === 'hareket') {
      const a = toMin(cfg.from), b = toMin(cfg.to), step = Math.max(30, Number(cfg.intervalMin) || 60);
      if (a == null || b == null) continue;
      for (let m = a + step; m <= b; m += step) out.push({ type, min: m, at: at(m) });
      continue;
    }
    const m = toMin(cfg.time);
    if (m != null) out.push({ type, min: m, at: at(m) });
  }
  return out
    .filter((e) => !inQuiet(e.min, settings.quiet))
    .sort((a, b) => a.min - b.min)
    .slice(0, Math.max(1, Math.min(12, settings.maxPerDay ?? 5)))
    .map(({ type, at: when }) => ({ type, at: when, id: `${type}@${when.toISOString()}` }));
}

/**
 * Zamanı gelmiş ve henüz gösterilmemiş olaylar. Uygulama uzun süre kapalı kaldıysa en fazla 30 dk geciken olay
 * gösterilir (eski hatırlatmalar toplu halde patlamaz).
 */
export function dueEvents(settings, fired, now = new Date(), ctx = {}, graceMin = 30) {
  const seen = new Set(fired ?? []);
  return eventsForDay(settings, now, ctx).filter((e) => e.at <= now && now - e.at <= graceMin * 60000 && !seen.has(e.id));
}

/** Sıradaki olay (bugün veya yarın). */
export function nextEvent(settings, now = new Date(), ctx = {}) {
  for (let d = 0; d < 8; d++) {
    const day = new Date(now); day.setDate(day.getDate() + d);
    const e = eventsForDay(settings, day, ctx).find((x) => x.at > now);
    if (e) return e;
  }
  return null;
}

/** Bildirim metni: genel ve kısa; kilit ekranında sağlık ayrıntısı göstermez. */
export function message(type, info = {}) {
  switch (type) {
    case 'sabah': return { title: 'Günaydın', body: info.workout ? `Bugün ~${info.workout} dk antrenmanınız var. Adım hedefi: ${info.goal ?? '—'}.` : `Bugünkü adım hedefiniz: ${info.goal ?? '—'}.` };
    case 'antrenman': return { title: 'Antrenman zamanı', body: 'Planınız hazır. Isınmayla başlayın; ağrı olursa durun.' };
    case 'yuruyus': return info.remaining > 0 ? { title: 'Kısa bir yürüyüş?', body: `Hedefe ${info.remaining.toLocaleString('tr-TR')} adım kaldı. 10 dakikalık yürüyüş yaklaşık 1.000 adımdır.` } : { title: 'Adım hedefi', body: 'Bugünkü hedefinize ulaştınız. Tebrikler!' };
    case 'hareket': return { title: 'Hareket molası', body: 'Kalkın, omuzlarınızı gevşetin, 1–2 dakika yürüyün.' };
    case 'aksam': return { title: 'Günün özeti', body: 'Bugünü değerlendirmek ister misiniz? Su, uyku ve hareket kaydınızı tamamlayın.' };
    case 'haftalik': return { title: 'Haftalık özet', body: 'Haftanızın antrenman ve adım özeti hazır.' };
    default: return { title: 'İçGör', body: '' };
  }
}
