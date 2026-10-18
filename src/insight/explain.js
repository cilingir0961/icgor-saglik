// "Bana Anlat" açıklama metinleri (saf). Günlük Türkçe; teşhis, hastalık adı veya risk dili yok.
// Her bulgu için: ne gözlemlendi → hangi ölçüme dayanıyor → ne kadar güvenilir → kamera kaynaklı olası
// nedenler → ne yapılabilir. Genel bilgi (Daha fazla bilgi) ile kişisel ölçüm ayrı tutulur.

import { TOPICS } from '../anatomy/posture-info.js';
import { BODY_REGIONS } from './regions.js';
import { observationText, fmt, dateTr } from './evaluate.js';

const un = (f) => (f.unit === '°' ? '°' : ` ${f.unit}`);

/** Göstergeye göre "Bu ne demek?" metni. */
const MEANING = {
  shoulderLevel: 'Omuzlarından biri diğerinden biraz daha yukarıda göründü. Çoğu insanda küçük bir sağ–sol farkı olağandır; baskın el, çanta taşıma alışkanlığı veya o anki duruşun bunu etkileyebilir.',
  headTilt: 'Başın çekim sırasında bir yana hafif eğik göründü. Bu çoğunlukla o anki bakış yönü veya duruş alışkanlığıyla ilgilidir.',
  trunkLateral: 'Omuzlarının orta noktası kalçalarının orta noktasına göre bir yana kaymış göründü. Ağırlığı bir bacağa vermek bile bunu değiştirir. Bu ölçüm omurganın şeklini göstermez.',
  trunkForward: 'Ayakta dururken gövden düz çizgiye göre öne ya da arkaya eğik göründü. Ayakta duruş alışkanlığı ve o anki dengeyle ilgilidir.',
  hipLevel: 'Kalçalarından biri biraz daha yukarıda göründü. Ağırlığı hangi bacağa verdiğin bu ölçümü doğrudan etkiler; gösterge deneyseldir.',
  'kol-kaldirma:abductionAsym': 'Kollarını yandan kaldırırken bir kol diğerinden daha yükseğe kalktı. Bu, hareketi iki tarafta farklı yaptığın, bir tarafta daha rahat olduğun ya da kameranın bir kolu daha zor gördüğü anlamına gelebilir.',
  'boyun:latAsym': 'Başını iki yana yatırırken bir tarafa daha fazla yatırdın. Hareketin hızı ve omuzların kıpırdaması bu farkı etkileyebilir.',
  'coach:arm-raise:asym': 'Antrenman sırasında kamera koçu, iki kolun kalkış yüksekliğinde fark ölçtü.',
};

const NOT_DIAGNOSIS = 'Bu fark tek başına bir sağlık sorunu olduğunu göstermez. Kamera yalnızca vücudunun dış hatlarını ve eklem noktalarının yaklaşık yerini görür; kas, kemik, disk, sinir veya iç organ hakkında bilgi veremez. Fıtık, skolyoz, kas yırtığı gibi durumlar kamerayla belirlenemez.';

/** Kamera kaynaklı olası hata nedenleri (bulgunun türüne göre). */
export function caveats(f) {
  const c = [];
  if (f.levelUnknown) c.push('Telefonun düz durduğu doğrulanamadı; birkaç derecelik telefon eğimi omuz/gövde eğimine eklenebilir.');
  if (f.source === 'posture') c.push('Bol kıyafet, saç veya kollar omuz/kalça noktalarının yerini kaydırabilir.');
  if (f.kind === 'asym' && f.source !== 'posture') c.push('Kamera vücuduna tam karşıdan bakmıyorsa uzak taraftaki kol/baş daha kısa görünür ve açı küçük ölçülür.');
  if (f.source === 'coach') c.push('Kamera koçu yalnızca sentetik figürle doğrulandı; gerçek kişilerde doğruluğu henüz ölçülmedi.');
  if (f.experimental) c.push('Bu gösterge deneyseldir: doğruluğu henüz yeterince kanıtlanmadı.');
  c.push('Işık azsa veya eklemler kısmen görünmüyorsa ölçüm sapabilir; bu nedenle tek ölçüm kesin sonuç sayılmaz.');
  return c;
}

/** Güvenilirlik cümlesi. */
export function reliabilityText(f) {
  const unit = f.unit === '°' ? '°' : ` ${f.unit}`;
  const grade = f.grade ? `Ölçüm güvenilirliği: ${f.grade}.` : '';
  const lim = f.u != null ? ` Belirsizlik ± ${fmt(f.u)}${unit}; bir farkı "belirgin" saymak için en az ± ${fmt(2 * f.u)}${unit} gerekir.` : '';
  const rep = f.repeats ? ` Aynı fark ${f.repeats + 1} ayrı ölçümde aynı yönde görüldü.` : f.flagged ? ' Şimdilik tek ölçüme dayanıyor.' : '';
  return `${grade}${lim}${rep}`.trim();
}

/**
 * Bir bölgenin açıklama kartı içeriği.
 * @returns {{title, status, headline, findings:{text, meaning, basis, reliability, caveats}[], measuredOk:string[], whatIs:string, next:string[], more:string, safety:string}}
 */
export function explainRegion(r) {
  const R = BODY_REGIONS[r.id];
  const topic = TOPICS[R.topic];
  const findings = r.flagged.map((f) => ({
    id: f.id,
    text: observationText(f),
    meaning: MEANING[f.id.split(':').slice(0, 2).join(':')] ?? MEANING[f.id] ?? 'Ölçülen değer, sağ–sol veya düz duruş referansına göre ölçüm belirsizliğini aşan bir fark gösterdi.',
    basis: `${f.test}${f.date ? `, ${dateTr(f.date)}` : ''}${f.source === 'coach' ? '' : ' taraması'}.`,
    reliability: reliabilityText(f),
    caveats: caveats(f),
    history: f.history?.length ? `Önceki karşılaştırılabilir ölçümler: ${f.history.map((x) => `${dateTr(x.date)}: ${fmt(x.value)}${un(f)} ± ${fmt(x.u)}${un(f)}`).join(' · ')} · Son: ${fmt(f.value)}${un(f)} ± ${fmt(f.u)}${un(f)}.` : null,
  }));
  const measuredOk = r.items.filter((e) => e.reliable && !e.flagged).map((e) => (e.kind === 'measure' || e.kind === 'consistency'
    ? `${e.tr}: ${fmt(e.value)}${e.unit === '°' ? '°' : ` ${e.unit}`} ± ${fmt(e.u)} (${e.test}).`
    : `${e.tr}: belirgin fark görülmedi (${fmt(e.value)}${e.unit === '°' ? '°' : ` ${e.unit}`} ± ${fmt(e.u)}).`));
  const next = [];
  if (r.status === 'gri') next.push(R.side || r.id === 'govde' || r.id === 'bas-boyun' || r.id === 'kalca' ? 'Önden ve yandan duruş taraması ile ilgili hareket testini yaparsan bu bölge değerlendirilebilir.' : 'İlgili hareket testini yaparsan bu bölge değerlendirilebilir.');
  if (r.status === 'sari') next.push('Ölçümü aynı koşullarda (aynı mesafe, ışık, dar kıyafet, telefon sabit) tekrar edelim; fark yine görülürse daha anlamlı olur.');
  if (r.status === 'turuncu') next.push('Bu fark birkaç ölçümde sürdü. Hareketi rahat yapabildiğin aralıkta, kontrollü egzersizlerle çalışabilirsin; ağrı, uyuşma veya güç kaybı varsa bir fizyoterapist ya da hekime göstermen iyi olur.');
  if (r.status === 'yesil') next.push('Haftalık programına devam edebilirsin; ilerlemeyi görmek için birkaç hafta sonra aynı koşullarda tekrar ölç.');
  return {
    unreliable: (r.unreliable ?? []).map((x) => `${x.test}: ${x.tr} — Ölçüm güvenilir değil, tekrar deneyin. ${x.why}`),
    title: r.tr, status: r.status, headline: r.reason,
    findings, measuredOk,
    whatIs: findings.length ? NOT_DIAGNOSIS : '',
    next,
    more: topic ? `${topic.anatomy} ${topic.general ?? ''}`.trim() : '',
    safety: 'Ağrı olursa hareketi zorlamadan dur. Ağrı, uyuşma, güç kaybı veya baş dönmesi varsa egzersiz yerine bir sağlık profesyoneline danış.',
    discomfort: r.items.some((e) => e.discomfort),
  };
}
