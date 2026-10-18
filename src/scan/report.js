// Kişisel tarama raporu (DOM). Ölçülen gözlemler, belirsizlik, güvenilirlik, anatomik açıklama, gelişim
// karşılaştırması ve genel öneriler. Tanı, tedavi veya hastalık riski ifadesi İÇERMEZ.

import { h, s, fmt } from './dom.js';
import { describe } from '../analysis/posture.js';
import { compareScans, windows } from '../analysis/compare.js';
import { MOVEMENT_TESTS } from '../analysis/movement.js';
import { TOPICS, SEEK_CARE, CANNOT_DETECT, ERGONOMICS } from '../anatomy/posture-info.js';
import { VIEWS } from '../analysis/quality.js';
import { metricStatus } from '../analysis/validation-status.js';

const MOVE_TOPIC = { 'kol-kaldirma': 'arm-raise', comelme: 'squat', 'one-egilme': 'forward-bend', 'tek-ayak': 'single-leg', boyun: 'neck', yuruyus: 'gait' };
const LINKS = [[11, 12], [11, 23], [12, 24], [23, 24], [11, 13], [13, 15], [12, 14], [14, 16], [23, 25], [25, 27], [24, 26], [26, 28], [27, 29], [29, 31], [28, 30], [30, 32]];

const u = (unit) => (unit === '°' || unit === '' ? unit : ` ${unit}`);
const gradeClass = (g) => ({ iyi: 'good', orta: 'fair', 'düşük': 'poor' }[g] ?? 'none');

/** Ölçülen iskelet ile nötr referans çizgileri (yer çekimi hattı, yatay seviye çizgileri). */
export function postureDiagram(lm, view, { width, height }) {
  const P = lm.map(([x, y, , v]) => ({ x: x * width, y: y * height, v }));
  const vis = P.filter((p) => p.v > 0.3);
  const minX = Math.min(...vis.map((p) => p.x)), maxX = Math.max(...vis.map((p) => p.x));
  const minY = Math.min(...vis.map((p) => p.y)), maxY = Math.max(...vis.map((p) => p.y));
  const pad = 0.12 * (maxY - minY);
  const vb = [minX - pad * 1.6, minY - pad, maxX - minX + pad * 3.2, maxY - minY + pad * 2];
  const sw = (maxY - minY) / 220;
  const svg = s('svg', { viewBox: vb.map((x) => x.toFixed(1)).join(' '), class: 'posture-diagram', role: 'img', 'aria-label': `${VIEWS[view] ?? view} ölçülen duruş ve nötr referans` });
  const ankleMid = view === 'side'
    ? (P[27].v >= P[28].v ? P[27] : P[28])
    : { x: (P[27].x + P[28].x) / 2, y: (P[27].y + P[28].y) / 2 };
  // Nötr referans: ayak bileğinden geçen düşey çizgi; önden/arkadan omuz ve kalça için yatay çizgiler
  svg.append(s('line', { x1: ankleMid.x, y1: vb[1], x2: ankleMid.x, y2: vb[1] + vb[3], class: 'ref', 'stroke-width': sw }));
  if (view !== 'side') {
    for (const [a, b] of [[11, 12], [23, 24]]) {
      const y = (P[a].y + P[b].y) / 2;
      svg.append(s('line', { x1: Math.min(P[a].x, P[b].x) - pad, y1: y, x2: Math.max(P[a].x, P[b].x) + pad, y2: y, class: 'ref', 'stroke-width': sw }));
    }
  }
  const links = view === 'side'
    ? (P[11].v >= P[12].v ? [[7, 11], [11, 23], [23, 25], [25, 27], [27, 29], [29, 31], [11, 13], [13, 15]] : [[8, 12], [12, 24], [24, 26], [26, 28], [28, 30], [30, 32], [12, 14], [14, 16]])
    : LINKS;
  for (const [a, b] of links) if (P[a].v > 0.3 && P[b].v > 0.3) svg.append(s('line', { x1: P[a].x, y1: P[a].y, x2: P[b].x, y2: P[b].y, class: 'bone', 'stroke-width': sw * 2.2 }));
  for (const i of view === 'side' ? [0, 7, 8, 11, 12, 23, 24, 25, 26, 27, 28] : [0, 7, 8, 11, 12, 23, 24, 25, 26, 27, 28]) if (P[i].v > 0.3) svg.append(s('circle', { cx: P[i].x, cy: P[i].y, r: sw * 3, class: 'joint' }));
  return h('figure', { class: 'diagram' }, svg,
    h('figcaption', {}, h('span', { class: 'key measured' }, 'ölçülen'), h('span', { class: 'key ref' }, 'nötr referans (düşey/yatay çizgi)')));
}

function metricRow(m, onShow3D) {
  const topic = TOPICS[m.topic];
  return h('div', { class: `metric ${m.value == null ? 'na' : ''}`, dataset: { metric: m.id ?? '' } },
    h('div', { class: 'metric-head' },
      h('span', { class: 'name' }, m.tr),
      m.experimental ? h('span', { class: 'tag exp', title: 'Doğruluğu kanıtlanmadı' }, 'Deneysel') : null,
      h('span', { class: `grade ${gradeClass(m.grade)}` }, m.grade)),
    h('div', { class: 'metric-value' },
      m.value == null ? 'ölçülemedi' : `${fmt(m.value)}${u(m.unit)} ± ${fmt(m.u)}${u(m.unit)}`),
    h('p', { class: 'metric-text' }, describe(m)),
    topic && onShow3D ? h('button', { class: 'btn small ghost', onclick: () => onShow3D(m.topic) }, 'İlgili anatomiyi 3B göster') : null);
}

function moveMetricRow(id, m, testId) {
  const vs = metricStatus(`${testId}:${id}`);
  if (vs.status === 'guvenilmez' && m.value != null) {
    return h('div', { class: 'metric na', dataset: { metric: id, unreliable: 'true' } },
      h('div', { class: 'metric-head' }, h('span', { class: 'name' }, m.tr), h('span', { class: 'tag exp' }, 'Güvenilir değil')),
      h('div', { class: 'metric-value' }, 'Ölçüm güvenilir değil, tekrar deneyin.'),
      h('p', { class: 'metric-text' }, vs.why));
  }
  return h('div', { class: `metric ${m.value == null ? 'na' : ''}`, dataset: { metric: id } },
    h('div', { class: 'metric-head' },
      h('span', { class: 'name' }, m.tr),
      m.experimental || vs.status === 'deneysel' ? h('span', { class: 'tag exp', title: vs.why ?? 'Doğruluğu kanıtlanmadı' }, 'Deneysel') : null,
      h('span', { class: `grade ${gradeClass(m.grade)}` }, m.grade)),
    h('div', { class: 'metric-value' }, m.value == null ? 'ölçülemedi' : `${fmt(m.value, m.unit === '' ? 2 : 1)}${u(m.unit)} ± ${fmt(m.u, m.unit === '' ? 2 : 1)}${u(m.unit)}`),
    m.sense ? h('p', { class: 'metric-text' }, `Fark belirsizliği aşıyor: ${m.sense}. Bu bir gözlemdir, tanı değildir.`)
      : m.distinguishable === false ? h('p', { class: 'metric-text' }, 'Sağ–sol fark ölçüm belirsizliği içinde.') : null);
}

/**
 * @param {object} scan tarama kaydı
 * @param {{history?:object[], onShow3D?:(topic:string)=>void, onExport?:()=>void}} ctx
 */
export function renderReport(scan, { history = [], onShow3D, onExport, twin } = {}) {
  const date = new Date(scan.date);
  const levelKnown = Object.values(scan.captures ?? {}).some((c) => c.conditions.level === 'known');
  const discomfort = Object.values(scan.movements ?? {}).some((m) => m.discomfort);
  const root = h('article', { class: 'report', 'aria-label': 'Tarama raporu' },
    h('header', {},
      h('p', { class: 'eyebrow' }, `Tarama · ${date.toLocaleDateString('tr-TR')} ${date.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}`),
      h('h2', {}, 'Kişisel duruş ve hareket raporu'),
      h('p', { class: 'notice' }, 'Eğitim amaçlıdır. Ölçümler deneysel ve yaklaşıktır; tanı, tedavi veya hastalık riski bildirmez.'),
      h('p', { class: 'cond' },
        `Poz modeli: ${scan.model} · Kamera düzlüğü: ${levelKnown ? 'sensörle doğrulandı' : 'doğrulanamadı (açı belirsizliği büyütüldü)'} · Görüntü işleme: yalnızca bu cihazda`)));

  // Duruş
  for (const [view, cap] of Object.entries(scan.captures ?? {})) {
    const metrics = Object.entries(cap.metrics).map(([id, m]) => ({ id, ...m }));
    const seen = metrics.filter((m) => m.distinguishable).length;
    root.append(h('section', { class: 'rep-sec', dataset: { view } },
      h('h3', {}, `${VIEWS[view]} duruş`),
      h('p', { class: 'sub' }, `${cap.frames} kare · ${seen ? `${seen} gözlem nötr referanstan ayırt edilebildi` : 'nötr referanstan ayırt edilebilen sapma yok'}`),
      cap.skeleton ? postureDiagram(cap.skeleton, view, cap.conditions) : null,
      h('div', { class: 'metrics' }, metrics.map((m) => metricRow(m, onShow3D)))));
  }

  // Hareket
  for (const [id, res] of Object.entries(scan.movements ?? {})) {
    const T = MOVEMENT_TESTS[id];
    root.append(h('section', { class: 'rep-sec', dataset: { movement: id } },
      h('h3', {}, T?.tr ?? id),
      h('p', { class: 'sub' }, `${res.samples} kare${res.reps ? ` · tekrar: ${Object.values(res.reps).join(' / ')}` : ''}${res.stopped ? ' · kullanıcı durdurdu' : ''}`),
      res.issues?.length ? h('ul', { class: 'issues' }, res.issues.map((x) => h('li', {}, x))) : null,
      h('div', { class: 'metrics' }, Object.entries(res.metrics).map(([k, m]) => moveMetricRow(k, m, id))),
      res.discomfort ? h('p', { class: 'notice' }, 'Bu test sırasında rahatsızlık bildirdiniz. Hareketi tekrarlamadan önce bir sağlık profesyoneline danışmanız önerilir.') : null,
      onShow3D && MOVE_TOPIC[id] ? h('button', { class: 'btn small ghost', onclick: () => onShow3D(MOVE_TOPIC[id]) }, 'İlgili anatomiyi 3B göster') : null));
  }

  // Oranlar
  if (scan.proportions) {
    const P = scan.proportions;
    root.append(h('section', { class: 'rep-sec' },
      h('h3', {}, 'Dış vücut oranları (tahmini)'),
      h('p', { class: 'sub' }, 'Önden çekimden, girdiğiniz boya göre ölçeklenmiştir. Yalnızca eklem noktaları arası uzaklıklardır; iç organ veya yağ dağılımı hakkında bilgi vermez.'),
      h('div', { class: 'metrics two' }, Object.values(P.segments).map((sg) => h('div', { class: 'metric' },
        h('div', { class: 'metric-head' }, h('span', { class: 'name' }, sg.tr), h('span', { class: 'tag exp' }, 'Deneysel')),
        h('div', { class: 'metric-value' }, sg.cm == null ? 'ölçülemedi' : `${fmt(sg.cm)} cm ± ${fmt(sg.u)}`)))),
      P.bmi ? h('p', { class: 'metric-text' }, `Beden kitle indeksi (girdiğiniz boy ve kiloya göre): ${fmt(P.bmi)} kg/m². Yalnızca boy–kilo oranıdır; vücut yağını veya sağlık durumunu ölçmez.`) : null));
  }

  // Siluet ölçüleri ve dijital ikiz
  if (scan.body || twin) {
    const B = scan.body;
    root.append(h('section', { class: 'rep-sec', id: 'rep-body' },
      h('h3', {}, 'Vücut ölçüleri ve dijital ikiz (deneysel)'),
      h('p', { class: 'sub' }, 'Kişi bölütleme maskesinden, girdiğiniz boya göre: önden genişlik, yandan derinlik, elips modeliyle yaklaşık çevre. Giysi ve saç ölçüye eklenir; mezura ölçümü değildir. İç yağ dağılımı veya organlar hakkında bilgi vermez.'),
      B ? h('div', { class: 'metrics two' }, Object.entries(B.levels).map(([k, L]) => h('div', { class: 'metric', dataset: { level: k } },
        h('div', { class: 'metric-head' }, h('span', { class: 'name' }, L.tr), h('span', { class: 'tag exp' }, 'Deneysel')),
        L.circCm ? h('div', { class: 'metric-value' }, `≈ ${fmt(L.circCm)} cm ± ${fmt(L.uCirc)}`) : h('div', { class: 'metric-value' }, 'ölçülemedi'),
        h('p', { class: 'metric-text' }, L.circCm ? `genişlik ${fmt(L.widthCm)} ± ${fmt(L.uWidth)} cm · derinlik ${fmt(L.depthCm)} ± ${fmt(L.uDepth)} cm` : `Neden: ${L.why ?? 'bilinmiyor'}`)))) : h('p', { class: 'sub' }, 'Siluet adımı tamamlanmadı; ikiz yalnızca boy ve omuz genişliğinden ölçeklenir.'),
      twin ? h('p', { class: 'metric-text' }, `İkiz ölçekleri (atlas vücuduna göre): boy ×${fmt(twin.overall, 3)}, genişlik ×${fmt(twin.sx, 3)}, derinlik ×${fmt(twin.sz, 3)} — kaynak: ${twin.source ?? 'boy'}. Atlas tek bir referans vücuttur, norm değildir.`) : null,
      onShow3D ? h('button', { class: 'btn small', id: 'btn-show-twin', onclick: () => onShow3D('twin') }, 'Dijital ikizi 3B göster') : null));
  }

  // Gelişim karşılaştırması
  const prior = history.filter((x) => x.id !== scan.id && x.date < scan.date);
  const cmpSec = h('section', { class: 'rep-sec', id: 'rep-compare' }, h('h3', {}, 'Gelişim karşılaştırması (30 / 60 / 90 gün)'));
  if (!prior.length) cmpSec.append(h('p', { class: 'sub' }, 'Bu ilk taramanız. Aynı koşullarda (aynı mesafe, aynı yön, aynı ışık) tekrarlanan taramalar karşılaştırılabilir.'));
  else {
    const all = [...prior, scan];
    for (const w of windows(all, scan)) {
      if (!w.base) { cmpSec.append(h('p', { class: 'sub' }, `${w.days} gün: bu aralıkta (±%25) önceki tarama yok.`)); continue; }
      const c = compareScans(w.base, scan);
      const box = h('div', { class: 'cmp' }, h('strong', {}, `${w.days} gün (${new Date(w.base.date).toLocaleDateString('tr-TR')} ile)`));
      for (const [view, r] of Object.entries(c)) {
        if (!r.ok) { box.append(h('p', { class: 'sub' }, `${r.label ?? VIEWS[view] ?? view}: karşılaştırılamaz — ${r.why.join(', ')}. Sahte değişim görmemek için farklı koşullardaki ölçümler karşılaştırılmaz.`)); continue; }
        box.append(h('p', { class: 'cmp-label' }, r.label ?? `${VIEWS[view] ?? view} duruş`), h('ul', { class: 'cmp-list' }, Object.values(r.metrics).map((m) => h('li', { class: m.status }, `${m.tr}: ${m.text}`))));
      }
      cmpSec.append(box);
    }
  }
  root.append(cmpSec);

  // Genel bilgiler
  root.append(
    h('section', { class: 'rep-sec' }, h('h3', {}, 'Ne zaman bir sağlık profesyoneline başvurmalı?'), h('p', { class: discomfort ? 'notice' : '' }, SEEK_CARE)),
    h('section', { class: 'rep-sec' }, h('h3', {}, 'Kamerayla belirlenemeyenler'), h('p', {}, CANNOT_DETECT)),
    h('section', { class: 'rep-sec' }, h('h3', {}, 'Genel hareket ve ergonomi bilgileri'), h('ul', {}, ERGONOMICS.map((x) => h('li', {}, x)))),
    onExport ? h('div', { class: 'actions' }, h('button', { class: 'btn', onclick: onExport }, 'Raporu dışa aktar (JSON)'), h('button', { class: 'btn ghost', onclick: () => print() }, 'Yazdır')) : null,
  );
  return root;
}
