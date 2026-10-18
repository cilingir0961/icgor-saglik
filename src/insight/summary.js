// "Vücudumun Özeti" (saf): son taramanın anlaşılır özeti. Metinler YALNIZCA hesaplanmış ölçümlerden üretilir;
// ölçülmeyen şey için cümle kurulmaz. Sentetik/demo veri ayrıca işaretlenir.

import { regionHeadline } from './evaluate.js';
import { BODY_REGIONS, STATUS } from './regions.js';

/** Sayıya gelen iyelik eki ("4'ü", "6'sı"). */
const POSS = ['ı', 'i', 'si', 'ü', 'ü', 'i', 'sı', 'si', 'i', 'u', 'u', 'i', 'si'];
const VIEW_TR = { front: 'Önden duruş', side: 'Yandan duruş', back: 'Arkadan duruş' };

/**
 * @param {ReturnType<import('./evaluate.js').evaluate>} ev
 */
export function bodySummary(ev) {
  const scan = ev.latest;
  if (!scan) return { empty: true, title: 'Henüz tarama yok', text: 'Vücudunu tarayınca, ölçebildiğimiz bölgeleri burada anlaşılır bir dille özetleyeceğiz.', attention: [], positives: [], next: 'Önden ve yandan bir duruş taraması yapalım.' };
  const parts = [];
  for (const [view, cap] of Object.entries(scan.captures ?? {})) {
    const ms = Object.values(cap.metrics ?? {});
    parts.push({ tr: VIEW_TR[view] ?? view, ok: ms.length > 0 && ms.filter((m) => m.value != null).length >= ms.length / 2 });
  }
  for (const mv of Object.values(scan.movements ?? {})) {
    const ms = Object.values(mv.metrics ?? {});
    parts.push({ tr: mv.tr, ok: ms.some((m) => m.value != null && m.grade !== 'düşük') && !mv.stopped });
  }
  const okN = parts.filter((p) => p.ok).length;
  const regions = Object.values(ev.regions);
  // Aynı ölçüme dayanan bölgeler (ör. kol farkı → iki omuz) tek cümlede birleştirilir
  const attention = [];
  for (const r of regions.filter((x) => x.status === 'sari' || x.status === 'turuncu').sort((a, b) => STATUS[b.status].rank - STATUS[a.status].rank)) {
    const key = r.flagged.map((f) => f.id).sort().join('|');
    const same = attention.find((a) => a.key === key && a.status === r.status);
    if (same) { same.names.push(r.tr); same.regions.push(r.id); continue; }
    attention.push({ key, region: r.id, regions: [r.id], names: [r.tr], status: r.status, body: regionHeadline(r).slice(r.tr.length + 2), retest: r.status === 'sari' });
  }
  for (const a of attention) a.text = `${a.names.join(' ve ')}: ${a.body}`;
  const positives = [];
  for (const [, mv] of Object.entries(scan.movements ?? {})) {
    const c = mv.metrics?.depthConsistency;
    if (c?.value != null && c.u != null && c.value <= 2 * c.u) positives.push(`${mv.tr}: tekrarlar arası derinlik tutarlıydı (fark ${Math.round(c.value)}° ± ${Math.round(c.u)}°).`);
    const r = mv.reps ?? {};
    if (!mv.stopped && (r.L || r.R)) positives.push(`${mv.tr}: sol tarafla ${r.L ?? 0}, sağ tarafla ${r.R ?? 0} tekrarı tamamladın.`);
    else if (!mv.stopped && r.n) positives.push(`${mv.tr}: ${r.n} tekrarı tamamladın.`);
  }
  // Hareket gözlemleri önce (daha somut), sonra fark görülmeyen bölgeler
  for (const r of regions.filter((x) => x.status === 'yesil')) positives.push(`${r.tr}: ölçümde belirgin fark görülmedi.`);
  const gray = regions.filter((r) => r.status === 'gri').map((r) => BODY_REGIONS[r.id].short);
  let next;
  if (attention.some((a) => a.retest)) next = `${BODY_REGIONS[attention.find((a) => a.retest).region].tr} için ölçümü aynı koşullarda tekrar edelim ve hareketi rahat yapabildiğin aralıkta deneyelim.`;
  else if (attention.length) next = 'Dikkat çeken bölge için önerilen hafif hareketlere göz at; ağrı varsa zorlamadan dur.';
  else if (gray.length) next = `Henüz ölçülmeyen bölgeler var (${gray.join(', ')}); ilgili çekimi veya hareket testini yapabilirsin.`;
  else next = 'Programına devam et; birkaç hafta sonra aynı koşullarda tekrar ölçerek değişimi görebilirsin.';
  return {
    empty: false, date: scan.date, synthetic: ev.synthetic,
    title: 'Bugünkü hareket değerlendirmen',
    text: `${parts.length} ölçümün ${okN}'${POSS[okN] ?? 'i'} yeterli görüntü kalitesiyle değerlendirildi.`,
    parts, attention, positives: [...new Set(positives)].slice(0, 6), gray, next,
  };
}
