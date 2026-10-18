// AI asistanına paylaşılacak özetin hazırlanması (saf). Kural: varsayılan olarak HİÇBİR şey paylaşılmaz; kullanıcı
// her kategoriyi ayrı açar ve gönderilecek metnin aynısını önizlemede görür. Görüntü, video, iskelet noktaları,
// tarih/saat damgası ve cihaz kimliği özete girmez; yalnızca sayısal sonuçlar ve belirsizlikleri.

import { dayKey, adaptiveGoal, weekStats } from '../activity/steps.js';
import { compareScans, windows } from '../analysis/compare.js';
import { evaluate, regionHeadline } from '../insight/evaluate.js';
import { bodySummary } from '../insight/summary.js';
import { recommend } from '../insight/recommend.js';
import { STATUS } from '../insight/regions.js';

export const SHARE_CATEGORIES = {
  findings: { tr: 'Bana Anlat bulguları', desc: 'Bölge renkleri (yeşil/sarı/turuncu/gri), ölçülen farkların cümleleri ± belirsizlik, ölçülmeyen bölgeler ve önerilen hafif hareketlerin adları.', sensitive: true },
  profile: { tr: 'Profil', desc: 'Yaş, boy, kilo, seviye, hedef, antrenman yeri/süresi ve bildirdiğiniz kısıtlı bölgeler.', sensitive: true },
  posture: { tr: 'Son tarama — duruş gözlemleri', desc: 'Ölçülen duruş göstergeleri, ± belirsizlik ve “ayırt edilebilir mi” sonucu. Görüntü gönderilmez.', sensitive: true },
  movements: { tr: 'Son tarama — hareket testleri', desc: 'Hareket açıklığı ve sağ–sol fark değerleri, ± belirsizlik.', sensitive: true },
  comparisons: { tr: 'Tarama karşılaştırmaları', desc: '30/60/90 gün önceki karşılaştırılabilir taramayla değişim (en küçük saptanabilir değişim ile).', sensitive: true },
  workouts: { tr: 'Antrenmanlar', desc: 'Bu hafta tamamlanan antrenman sayısı, son his ve ağrı bildirilip bildirilmediği.', sensitive: true },
  activity: { tr: 'Aktivite', desc: 'Bugünkü adım, 7 günlük ortalama ve hedef.', sensitive: false },
};

const PROFILE_KEYS = ['age', 'heightCm', 'weightKg', 'level', 'goal', 'location', 'daysPerWeek', 'minutesPerDay', 'limitations'];

/**
 * @param {object} st depo durumu
 * @param {Record<string, boolean>} share kategori → paylaşılsın mı
 * @returns {object|null} yalnızca açık kategoriler; hiçbiri yoksa null
 */
export function buildContext(st, share = {}, now = new Date()) {
  const c = {};
  if (share.profile && st.profile) {
    const p = {};
    for (const k of PROFILE_KEYS) if (st.profile[k] != null && st.profile[k] !== '' && !(Array.isArray(st.profile[k]) && !st.profile[k].length)) p[k] = st.profile[k];
    if (Object.keys(p).length) c.profile = p;
  }
  const last = st.scans?.at(-1);
  if (share.posture && last) {
    const obs = [];
    for (const cap of Object.values(last.captures ?? {})) {
      for (const m of Object.values(cap.metrics ?? {})) {
        if (m.value == null) continue;
        obs.push({ tr: m.tr, value: m.value, unit: m.unit, u: m.u, experimental: Boolean(m.experimental), distinguishable: m.distinguishable ?? null, sense: m.sense ?? null });
      }
    }
    if (obs.length) c.posture = obs;
  }
  if (share.movements && last) {
    const mv = [];
    for (const res of Object.values(last.movements ?? {})) {
      for (const m of Object.values(res.metrics ?? {})) if (m.value != null) mv.push({ tr: m.tr, value: m.value, unit: m.unit, u: m.u, experimental: Boolean(m.experimental) });
    }
    if (mv.length) c.movements = mv;
  }
  if (share.comparisons && last && st.scans.length > 1) {
    const out = [];
    for (const w of windows(st.scans)) {
      if (!w.base) continue;
      for (const r of Object.values(compareScans(w.base, last))) {
        if (!r.ok) continue;
        for (const m of Object.values(r.metrics)) if (m.status !== 'yok') out.push({ tr: `${w.days} gün: ${m.tr}`, text: m.text });
      }
    }
    if (out.length) c.comparisons = out.slice(0, 8);
  }
  if (share.findings && st.scans?.length + (st.trainer?.coachLog?.length ?? 0) > 0) {
    const ev = evaluate(st, now);
    const sm = bodySummary(ev);
    const regions = Object.values(ev.regions).map((r) => ({ id: r.id, tr: r.tr, status: r.status, statusTr: STATUS[r.status].tr, text: regionHeadline(r) }));
    const exercises = {};
    for (const r of Object.values(ev.regions)) {
      if (r.status !== 'sari' && r.status !== 'turuncu') continue;
      const rec = recommend(r.id, st, now);
      exercises[r.tr] = rec.blocked ? ['(belirti bildirildiği için öneri yok — uzmana danışın)'] : rec.exercises.map((e) => e.tr);
    }
    c.findings = { quality: sm.empty ? null : sm.text, regions, positives: sm.positives ?? [], next: sm.next, exercises, synthetic: ev.synthetic };
  }
  if (share.workouts && st.trainer?.plan) {
    const week = (st.trainer.history ?? []).filter((x) => now - new Date(x.date) < 7 * 86400000);
    const lastH = st.trainer.history?.at(-1);
    c.workouts = { thisWeek: week.length, planned: st.trainer.plan.sessions.length, lastFeeling: lastH?.feedback?.feeling ?? null, pain: Boolean(lastH?.feedback?.pain?.length) };
  }
  if (share.activity) {
    const days = st.activity?.days ?? {};
    const ws = weekStats(days, now);
    const goal = st.activity?.goalMode === 'manual' && st.activity?.goal ? st.activity.goal : adaptiveGoal(days, now, { goalType: st.profile?.goal }).goal;
    c.activity = { today: days[dayKey(now)]?.steps ?? 0, weekAvg: ws.avg, goal, demo: Object.values(days).some((d) => d.source === 'demo') };
  }
  return Object.keys(c).length ? c : null;
}

/** Önizleme: sunucunun modele vereceği metnin aynısı (server/ai/chat.mjs contextToText ile eşdeğer biçim). */
export function previewLines(ctx) {
  if (!ctx) return ['Hiçbir kişisel bilgi paylaşılmıyor. Asistan yalnızca yazdığınız mesajı görür.'];
  const lines = [];
  if (ctx.profile) {
    const p = ctx.profile;
    lines.push(`Profil: ${[p.age && `${p.age} yaş`, p.heightCm && `${p.heightCm} cm`, p.weightKg && `${p.weightKg} kg`, p.level && `seviye ${p.level}`, p.goal && `hedef ${p.goal}`, p.location && `yer ${p.location}`, p.daysPerWeek && `haftada ${p.daysPerWeek} gün`, p.minutesPerDay && `${p.minutesPerDay} dk`, p.limitations?.length && `kısıtlar: ${p.limitations.join(', ')}`].filter(Boolean).join(', ')}`);
  }
  if (ctx.findings) {
    const f = ctx.findings;
    if (f.quality) lines.push(`Bana Anlat: ${f.quality}`);
    for (const r of f.regions) lines.push(`Bölge ${r.tr} [${r.statusTr}]: ${r.text}`);
    for (const [k, v] of Object.entries(f.exercises)) lines.push(`Önerilen hareketler (${k}): ${v.join(', ')}`);
  }
  for (const o of ctx.posture ?? []) lines.push(`Duruş: ${o.tr}: ${o.value} ${o.unit} ± ${o.u}${o.experimental ? ' [deneysel]' : ''}${o.distinguishable ? ` → ${o.sense}` : o.distinguishable === false ? ' → nötrden ayırt edilemez' : ''}`);
  for (const m of ctx.movements ?? []) lines.push(`Hareket: ${m.tr}: ${m.value} ${m.unit} ± ${m.u}${m.experimental ? ' [deneysel]' : ''}`);
  for (const x of ctx.comparisons ?? []) lines.push(`Karşılaştırma: ${x.tr}: ${x.text}`);
  if (ctx.workouts) lines.push(`Antrenman: bu hafta ${ctx.workouts.thisWeek} / ${ctx.workouts.planned}, son his: ${ctx.workouts.lastFeeling ?? '?'}${ctx.workouts.pain ? ', ağrı bildirildi' : ''}`);
  if (ctx.activity) lines.push(`Aktivite: bugün ${ctx.activity.today} adım, 7 gün ort. ${ctx.activity.weekAvg ?? '?'}, hedef ${ctx.activity.goal}${ctx.activity.demo ? ' (demo veri)' : ''}`);
  return lines;
}
