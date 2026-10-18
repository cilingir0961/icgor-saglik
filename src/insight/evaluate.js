// "Bana Anlat" değerlendirmesi (saf). Ölçülmüş göstergelerden bölge durumları ve anlaşılır bulgular üretir.
//
// Renk kuralı (docs/INSIGHT.md):
//  gri     — bölge için ölçüm yok ya da yalnızca düşük güvenilirlikli ölçüm var. ÖLÇÜLMEMİŞ BÖLGE YEŞİL OLMAZ.
//  yeşil   — en az bir güvenilir ölçüm var ve hiçbiri belirsizliği aşan (|fark| > 2u) bir fark göstermiyor.
//  sarı    — son ölçümde belirsizliği aşan bir fark var (tek ölçüm → "tekrar ölçelim"), ya da fark yalnızca
//            deneysel bir göstergede.
//  turuncu — aynı göstergede, aynı yönde, karşılaştırılabilir koşullarda EN AZ İKİ ayrı güvenilir ölçümde süren fark.
// Teşhis, hastalık olasılığı veya risk puanı ÜRETİLMEZ. Kırmızı renk kullanılmaz.

import { BODY_REGIONS, POSTURE_MAP, MOVEMENT_MAP, COACH_MAP } from './regions.js';
import { comparable } from '../analysis/compare.js';
import { metricStatus, STATUS_TEXT } from '../analysis/validation-status.js';

const DAY = 86400000;
const K = 2; // karar çarpanı (posture.js K_DECIDE ile aynı)
const fmt = (x, d = 1) => (x == null ? '—' : Number(x).toLocaleString('tr-TR', { maximumFractionDigits: d }));
const dateTr = (iso) => new Date(iso).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long' });

/** Bir taramadan kanıt öğeleri. */
export function scanEvidence(scan) {
  const out = [];
  if (!scan) return out;
  for (const [view, cap] of Object.entries(scan.captures ?? {})) {
    for (const [id, m] of Object.entries(cap.metrics ?? {})) {
      const map = POSTURE_MAP[id];
      if (!map) continue;
      const kind = map.kind === 'deviation' && m.neutral === null ? 'measure' : map.kind;
      out.push(item({ source: 'posture', id, test: `${map.test.split(' (')[0]} (${{ front: 'önden', side: 'yandan', back: 'arkadan' }[view] ?? view})`, view, regions: map.regions, kind, m, scan, conditions: cap.conditions,
        flagged: kind === 'deviation' && m.value != null ? Boolean(m.distinguishable) : null,
        sign: m.value != null && m.neutral != null ? Math.sign(m.value - m.neutral) : 0, sense: m.sense ?? null }));
    }
  }
  for (const [testId, mv] of Object.entries(scan.movements ?? {})) {
    const map = MOVEMENT_MAP[testId];
    if (!map) continue;
    for (const [id, m] of Object.entries(mv.metrics ?? {})) {
      const mm = map[id];
      if (!mm) continue;
      let flagged = null, sense = null;
      if (mm.kind === 'asym' && m.value != null && m.u != null) {
        flagged = Math.abs(m.value) > K * m.u;
        if (flagged) sense = m.value > 0 ? `sol taraf ${fmt(Math.abs(m.value), 0)}° daha fazla` : `sağ taraf ${fmt(Math.abs(m.value), 0)}° daha fazla`;
      }
      out.push(item({ source: 'movement', id: `${testId}:${id}`, test: mv.tr, view: mv.conditions?.view, regions: mm.regions, kind: mm.kind, m, scan, conditions: mv.conditions,
        flagged, sign: m.value ? Math.sign(m.value) : 0, sense, discomfort: Boolean(mv.discomfort),
        sides: mm.kind === 'asym' ? sidesOf(mv.metrics, id) : null }));
    }
  }
  return out;
}

function sidesOf(metrics, asymId) {
  const base = asymId.replace(/Asym$/, '');
  const L = metrics[`${base}L`] ?? metrics[`${base === 'lat' ? 'latFlex' : base}L`];
  const R = metrics[`${base}R`] ?? metrics[`${base === 'lat' ? 'latFlex' : base}R`];
  return L && R ? { L: { value: L.value, u: L.u, tr: L.tr }, R: { value: R.value, u: R.u, tr: R.tr } } : null;
}

function item({ source, id, test, view, regions, kind, m, scan, conditions, flagged, sign, sense, discomfort = false, sides = null }) {
  const measured = m.value != null && m.u != null;
  const vs = metricStatus(id);
  const reliable = measured && m.grade !== 'düşük' && m.grade !== 'ölçülemedi' && vs.status !== 'guvenilmez';
  return {
    unreliable: measured && vs.status === 'guvenilmez' ? vs.why : null,
    source, id, test, view, regions, kind, tr: m.tr, unit: m.unit, value: m.value, u: m.u, grade: m.grade ?? null,
    experimental: Boolean(m.experimental) || vs.status === 'deneysel', measured, reliable, flagged: reliable ? flagged : null, sign, sense,
    date: scan?.date ?? null, scanId: scan?.id ?? null, conditions: conditions ?? null, discomfort, sides,
    levelUnknown: conditions?.level === 'unknown',
  };
}

/** Kamera koçu kayıtlarından kanıt (yalnızca güvenilir oturumlar; son `days` gün). */
export function coachEvidence(log, now = new Date(), days = 30) {
  const out = [];
  for (const r of log ?? []) {
    if (!r.reliable || now - new Date(r.date) > days * DAY) continue;
    const map = COACH_MAP[r.kind];
    if (!map) continue;
    if (r.asym && r.kind === 'arm-raise') {
      const vs = metricStatus(`coach:${r.kind}:asym`);
      out.push({
        unreliable: vs.status === 'guvenilmez' ? vs.why : null,
        source: 'coach', id: `coach:${r.kind}:asym`, test: map.test, regions: map.regions, kind: 'asym', tr: 'Sağ–sol fark (kol kaldırma, kamera koçu)',
        unit: '°', value: r.asym.value, u: r.asym.u, grade: 'orta', experimental: true, measured: true, reliable: vs.status !== 'guvenilmez',
        flagged: vs.status === 'guvenilmez' ? null : Math.abs(r.asym.value) > K * r.asym.u, sign: Math.sign(r.asym.value),
        sense: r.asym.value > 0 ? `sol kol ${fmt(Math.abs(r.asym.value), 0)}° daha yükseğe kalktı` : `sağ kol ${fmt(Math.abs(r.asym.value), 0)}° daha yükseğe kalktı`,
        date: r.date, sides: r.sides ?? null, fps: r.fps ?? null, conditions: null,
      });
    }
    if (r.extreme?.value != null) {
      const vs = metricStatus(`coach:${r.kind}:extreme`);
      out.push({
        unreliable: vs.status === 'guvenilmez' ? vs.why : null,
        source: 'coach', id: `coach:${r.kind}:extreme`, test: map.test, regions: map.regions, kind: 'measure',
        tr: r.kind === 'arm-raise' ? 'En yüksek omuz açısı (kamera koçu)' : 'En küçük diz açısı (kamera koçu)', unit: '°',
        value: r.extreme.value, u: r.extreme.u, grade: 'orta', experimental: true, measured: true, reliable: vs.status !== 'guvenilmez', flagged: null, sign: 0, date: r.date, reps: r.reps,
      });
    }
  }
  return out;
}

/** Aynı göstergenin önceki taramalarda aynı yönde ve karşılaştırılabilir koşullarda tekrar görülüp görülmediği. */
function persistsIn(ev, previous) {
  return previous.filter((p) => p.id === ev.id && p.flagged && p.sign === ev.sign && p.scanId !== ev.scanId
    && (!ev.conditions || !p.conditions || comparable(p.conditions, ev.conditions).ok));
}

/**
 * Bölge durumları.
 * @param {{scans:object[], trainer?:{coachLog?:object[]}}} state
 * @returns {{regions: Record<string, {id, tr, status, items, flagged, reason}>, latest: object|null, evidence: object[]}}
 */
export function evaluate(state, now = new Date()) {
  const scans = [...(state.scans ?? [])].sort((a, b) => a.date.localeCompare(b.date));
  const latest = scans.at(-1) ?? null;
  const latestEv = scanEvidence(latest);
  // Önceki taramalar: kalıcılık için (son 120 gün)
  const prevEv = scans.slice(0, -1).filter((s) => now - new Date(s.date) < 120 * DAY).flatMap(scanEvidence);
  const coach = coachEvidence(state.trainer?.coachLog, now);
  const all = [...latestEv, ...coach];
  const regions = {};
  for (const [rid, R] of Object.entries(BODY_REGIONS)) {
    const items = all.filter((e) => e.regions.includes(rid));
    const reliable = items.filter((e) => e.reliable);
    const flagged = reliable.filter((e) => e.flagged);
    let status, reason;
    if (!reliable.length) {
      status = 'gri';
      reason = items.some((e) => e.unreliable) ? `${STATUS_TEXT.guvenilmez} Bu bölgedeki ölçüm şu an güvenilir kabul edilmiyor; sonuç ve renk gösterilmiyor.`
        : items.some((e) => e.measured) ? 'Bu bölgede ölçüm yapıldı ama güvenilirliği düşüktü; sonuç gösterilmiyor.' : 'Bu bölge için henüz ölçüm yok.';
    } else if (!flagged.length) {
      status = 'yesil';
      reason = 'Ölçülen değerlerde belirsizliği aşan belirgin bir fark görülmedi.';
    } else {
      // Kalıcılık: tarama göstergesi önceki taramada, koç göstergesi önceki koç oturumunda aynı yönde
      for (const f of flagged) {
        // Hareketimi karşılaştır: aynı göstergenin önceki karşılaştırılabilir ölçümleri (yön fark etmeksizin)
        f.history = (f.source === 'coach' ? coach.filter((c) => c.id === f.id && c.date !== f.date)
          : prevEv.filter((p) => p.id === f.id && p.reliable && (!f.conditions || !p.conditions || comparable(p.conditions, f.conditions).ok)))
          .map((p) => ({ date: p.date, value: p.value, u: p.u })).sort((a, b) => a.date.localeCompare(b.date)).slice(-4);
        f.repeats = f.source === 'coach'
          ? coach.filter((c) => c.id === f.id && c.flagged && c.sign === f.sign && c.date !== f.date).length
          : persistsIn(f, prevEv).length;
      }
      const persistent = flagged.filter((f) => f.repeats >= 1 && !f.experimental);
      status = persistent.length ? 'turuncu' : 'sari';
      reason = persistent.length
        ? 'Aynı fark birden fazla güvenilir ölçümde, aynı yönde görüldü.'
        : flagged.every((f) => f.experimental) ? 'Fark yalnızca deneysel bir göstergede görüldü; tekrar ölçüm önerilir.'
          : 'Fark yalnızca bir ölçümde görüldü; tekrar ölçerek doğrulayalım.';
    }
    const unreliable = items.filter((e) => e.unreliable).map((e) => ({ tr: e.tr, test: e.test, why: e.unreliable }));
    regions[rid] = { id: rid, tr: R.tr, status, reason, items, flagged, unreliable, anchor: R.anchor, side: R.side ?? null };
  }
  return { regions, latest, evidence: all, synthetic: Boolean(latest?.synthetic || latest?.source === 'demo') };
}

/** Bölge durumu → kısa kullanıcı cümlesi (tıbbi dil yok). */
export function regionHeadline(r) {
  if (r.status === 'gri') return r.reason;
  if (r.status === 'yesil') return `${r.tr}: ölçümde belirgin fark görülmedi.`;
  const f = [...r.flagged].sort((a, b) => (b.repeats ?? 0) - (a.repeats ?? 0))[0];
  return `${r.tr}: ${observationText(f, r.side)}`;
}

/** Bir bulgunun gözlem cümlesi: hangi harekette/duruşta, kaç derece/cm, ± belirsizlik. */
/** Hareket türüne göre "Sağ kolunu kaldırırken …" kalıbı (taraf: dokunulan bölgenin tarafı). */
const ASYM_PHRASE = {
  'kol-kaldirma:abductionAsym': { L: ['Sol kolunu kaldırırken', 'sağ koluna'], R: ['Sağ kolunu kaldırırken', 'sol koluna'] },
  'boyun:latAsym': { L: ['Başını sola yatırırken', 'sağa yatırmaya'], R: ['Başını sağa yatırırken', 'sola yatırmaya'] },
  'coach:arm-raise:asym': { L: ['Sol kolunu kaldırırken', 'sağ koluna'], R: ['Sağ kolunu kaldırırken', 'sol koluna'] },
};

/**
 * @param {object} f bulgu
 * @param {'L'|'R'|null} side kartın tarafı (sol/sağ bölge). Taraf yoksa, daha az hareket eden taraf anlatılır.
 */
export function observationText(f, side = null) {
  const u = `± ${fmt(f.u)}${f.unit === '°' ? '°' : ` ${f.unit}`}`;
  const P = ASYM_PHRASE[f.id];
  if (f.kind === 'asym' && P && f.value != null) {
    const s = f.sides, d = Math.abs(f.value);
    const lower = f.value > 0 ? 'R' : 'L'; // fark = sol − sağ; pozitif → sağ taraf daha az
    const S = side ?? lower;
    const [verb, other] = P[S];
    const less = S === lower;
    const vals = s && s.L.value != null && s.R.value != null
      ? (S === 'L' ? `sol ${fmt(s.L.value, 0)}°, sağ ${fmt(s.R.value, 0)}°` : `sağ ${fmt(s.R.value, 0)}°, sol ${fmt(s.L.value, 0)}°`) : null;
    return `${verb} ${other} göre ${fmt(d, 0)}° daha ${less ? 'az' : 'fazla'} hareket ölçüldü (${vals ? `${vals}; ` : ''}fark ${u}).`;
  }
  if (f.kind === 'asym') {
    const s = f.sides;
    const detail = s && s.L.value != null && s.R.value != null ? ` (sol ${fmt(s.L.value, 0)}°, sağ ${fmt(s.R.value, 0)}°)` : '';
    return `${f.test} sırasında ${f.sense ?? 'sağ ve sol arasında fark'} ölçüldü${detail}; fark ${fmt(Math.abs(f.value))}° ${u}.`;
  }
  if (f.kind === 'deviation') {
    return `${f.tr}: ${f.sense ?? 'nötrden fark'} — ${fmt(Math.abs(f.value))}${f.unit === '°' ? '°' : ` ${f.unit}`} ${u} (${f.test.toLowerCase()}).`;
  }
  return `${f.tr}: ${fmt(f.value)}${f.unit === '°' ? '°' : ` ${f.unit}`} ${u}.`;
}

export { fmt, dateTr };
