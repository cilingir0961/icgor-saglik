// "Bana Anlat — Vücudumun Özeti" (#/anlat, İçGör Studio açık tema).
// Yalnızca gerçekten ölçülmüş verilerden; ölçülmeyen bölge gri ve "ölçülmedi" yazar. Teşhis yapılmaz.
// Vücut görseli projenin 3B atlasının renderıdır (genel model; kişiye ait değil). İşaret yerleri aynı kamerayla
// hesaplanmıştır (assets/ui/body-*.json, scripts/render-ui-assets.mjs).

import { getStore } from '../scan/store.js';
import { h, icon } from '../scan/dom.js';
import { evaluate, regionHeadline, dateTr } from './evaluate.js';
import { bodySummary } from './summary.js';
import { BODY_REGIONS, STATUS } from './regions.js';
import { openInsightCard, statusChip } from './card.js';
import { speak } from './speak.js';
import { BODY_FRONT, BODY_BACK, REGION_IMAGE, img } from '../ui/visuals.js';

const LEGEND = [['yesil', 'Ölçümde belirgin fark görülmedi'], ['sari', 'Tekrar ölçülmesi önerilen fark'], ['turuncu', 'Birden fazla ölçümde süren fark'], ['gri', 'Yeterli veri yok / ölçülmedi']];
const points = {};
async function loadPoints(view) {
  if (points[view]) return points[view];
  try { points[view] = (await (await fetch(`assets/ui/body-${view}.json`)).json()).points; } catch { points[view] = {}; }
  return points[view];
}

export function applyLargeText(store = getStore()) {
  document.body.classList.toggle('large-text', Boolean(store.state.settings?.largeText));
}

/** Vücudumun Özeti kartı (tarama raporunda ve Bana Anlat ekranında ortak). */
export function summaryCard(store, { compact = false } = {}) {
  const ev = evaluate(store.state);
  const sm = bodySummary(ev);
  return h('section', { class: 'card isummary', id: compact ? 'scan-insight-summary' : 'insight-summary' },
    h('h3', { class: 'card-title' }, icon('i-explain'), compact ? 'Vücudumun Özeti' : 'Değerlendirme'),
    sm.empty ? [h('p', { class: 'big-line' }, sm.title), h('p', {}, sm.text), h('a', { class: 'btn primary block', href: '#/tarama' }, 'Taramaya başla')] : [
      h('p', { class: 'sub' }, `${sm.title} · ${dateTr(sm.date)}`),
      sm.synthetic ? h('p', { class: 'warnline' }, 'DEMO / SENTETİK VERİ — gerçek ölçüm değildir.') : null,
      h('p', { class: 'big-line', id: 'insight-quality' }, sm.text),
      sm.unreliable?.length ? h('ul', { class: 'ilist small muted', id: 'insight-unreliable-tests' }, sm.unreliable.map((x) => h('li', {}, x))) : null,
      compact ? [
        sm.attention.length ? h('ul', { class: 'ilist' }, sm.attention.map((a) => h('li', {}, statusChip(a.status), ' ', a.text))) : h('p', {}, 'Ölçülen bölgelerde belirsizliği aşan belirgin bir fark görülmedi.'),
        h('a', { class: 'btn primary block', id: 'btn-scan-insight', href: '#/anlat' }, 'Bana Anlat: bölgeleri tek tek gör')] : null,
    ]);
}

export async function createInsightScreen() {
  const store = getStore();
  const page = document.getElementById('insight-page');
  let speaking = null, view = 'front';
  const dbg = (window.__icgorInsight = { ...(window.__icgorInsight ?? {}), regions: null });

  const show3D = (rid) => { location.hash = `#/anatomi?anlat=${rid}`; };
  const open = (rid) => openInsightCard(rid, { store, onShow3D: show3D });

  /** Atlas vücut görseli + dokunulabilir bölge işaretleri. */
  function bodyFigure(ev, pts) {
    const wrap = h('div', { class: 'figure', id: 'insight-map', role: 'group', 'aria-label': `Vücut haritası (${view === 'front' ? 'önden' : 'arkadan'} görünüm, genel atlas modeli).` },
      img(view === 'front' ? BODY_FRONT : BODY_BACK, 'Genel 3B atlas modeli, kas görünümü (kişiye ait değil)', { w: 720, h: 1280, cls: 'figure-img' }));
    for (const [rid, r] of Object.entries(ev.regions)) {
      const p = pts[rid];
      if (!p) continue;
      const b = h('button', { class: `mark ${r.status}`, dataset: { region: rid, x: p[0], y: p[1] }, 'aria-label': `${r.tr}: ${STATUS[r.status].tr}. Açıklama için dokun.`, onclick: () => open(rid) },
        h('span', { class: 'mark-dot' }));
      wrap.append(b);
    }
    return wrap;
  }

  async function render() {
    applyLargeText(store);
    const ev = evaluate(store.state);
    dbg.regions = Object.fromEntries(Object.values(ev.regions).map((r) => [r.id, r.status]));
    const regions = Object.values(ev.regions).sort((a, b) => STATUS[b.status].rank - STATUS[a.status].rank);
    const sm = bodySummary(ev);
    const pts = await loadPoints(view);
    const count = (k) => regions.filter((r) => r.status === k).length;
    page.replaceChildren(h('div', { class: 'insight' },
      h('header', { class: 'page-head' },
        h('div', {}, h('p', { class: 'eyebrow' }, 'Bana Anlat'), h('h1', { class: 'display' }, 'Vücudumun Özeti'),
          h('p', { class: 'sub' }, sm.empty ? 'Henüz ölçüm yok' : `${dateTr(sm.date)} · kamera ölçümü, yaklaşık`)),
        h('div', { class: 'seg small', role: 'group', 'aria-label': 'Görünüm' },
          [['front', 'Ön'], ['back', 'Arka']].map(([k, t]) => h('button', { type: 'button', 'aria-pressed': String(view === k), onclick: () => { view = k; render(); } }, t)))),
      h('section', { class: 'card body-card' },
        h('div', { class: 'body-grid' },
          bodyFigure(ev, pts),
          h('ul', { class: 'legend big-legend', 'aria-label': 'Renklerin anlamı' }, LEGEND.map(([k, t]) => h('li', {},
            h('span', { class: `swatch ${k}` }), h('span', {}, h('strong', {}, t), h('small', { class: 'muted' }, `${count(k)} bölge`)))))),
        h('div', { class: 'chips' },
          h('span', { class: 'chip-kind atlas' }, '3B model genel atlas · senin vücudun değil'),
          h('span', { class: 'chip-kind' }, 'Teşhis değildir')),
        h('button', { class: 'btn block', id: 'btn-insight-3d-open', onclick: () => { location.hash = '#/anatomi?anlat'; } }, icon('i-body'), '3B vücutta incele')),
      summaryCard(store),
      sm.attention?.length ? h('section', { class: 'card' },
        h('div', { class: 'row-between' }, h('h3', { class: 'card-title' }, 'Dikkat çeken noktalar'), h('span', { class: 'muted small' }, `${sm.attention.length} madde`)),
        h('ul', { class: 'att-list' }, sm.attention.map((a) => h('li', {},
          h('button', { class: 'att-btn', dataset: { region: a.region }, onclick: () => open(a.region) },
            img(REGION_IMAGE[a.region], `${a.names.join(', ')} (atlas modeli)`, { w: 64, h: 64, cls: 'thumb sm' }),
            h('span', { class: 'grow' }, h('strong', {}, a.names.join(' ve ')), h('small', {}, a.body)),
            icon('i-chevron')),
          a.retest ? h('p', { class: 'rel-note' }, icon('i-camera'), 'Bu fark şimdilik tek ölçüme dayanıyor; kamera açısı veya duruş pozisyonundan etkilenmiş olabilir. Daha doğru sonuç için aynı koşullarda tekrar ölçmeni öneririz.') : null)))) : null,
      sm.positives?.length ? h('section', { class: 'card' }, h('h3', { class: 'card-title' }, 'Olumlu gözlemler'), h('ul', { class: 'ilist ok' }, sm.positives.map((p) => h('li', {}, p)))) : null,
      !sm.empty ? h('section', { class: 'card next-card' }, h('h3', { class: 'card-title' }, 'Önerilen sonraki adım'), h('p', { id: 'insight-next' }, sm.next)) : null,
      h('section', { class: 'card' },
        h('h3', { class: 'card-title' }, 'Tüm bölgeler'),
        h('ul', { class: 'region-list', id: 'insight-regions' }, regions.map((r) => h('li', {},
          h('button', { class: 'region-btn', dataset: { region: r.id, status: r.status }, onclick: () => open(r.id) },
            h('span', { class: `swatch ${r.status}`, 'aria-hidden': 'true' }),
            h('span', {}, h('strong', {}, r.tr), h('small', {}, regionHeadline(r))), icon('i-chevron')))))),
      h('section', { class: 'card' },
        h('h3', { class: 'card-title' }, 'Okuma kolaylığı'),
        h('div', { class: 'actions' },
          h('button', { class: 'btn small', id: 'btn-large-text', 'aria-pressed': String(Boolean(store.state.settings?.largeText)), onclick: () => { store.setSettings({ largeText: !store.state.settings?.largeText }); render(); } }, 'Büyük yazı'),
          h('button', { class: 'btn small', id: 'btn-insight-voice', onclick: (e) => {
            const err = document.getElementById('insight-voice-err');
            if (speaking) { speaking.stop(); speaking = null; e.currentTarget.textContent = 'Özeti sesli dinle'; return; }
            const text = sm.empty ? sm.text : [sm.title, sm.text, ...sm.attention.map((a) => a.text), 'Önerilen sonraki adım:', sm.next].join(' ');
            const r = speak(text, { onEnd: () => { speaking = null; } });
            if (r.error) { err.textContent = r.error; return; }
            speaking = r; e.currentTarget.textContent = 'Sesi durdur';
          } }, icon('i-sound'), 'Özeti sesli dinle')),
        h('p', { class: 'small warnline', id: 'insight-voice-err', role: 'status' }),
        h('p', { class: 'small muted' }, 'Sesli anlatım varsayılan olarak kapalıdır ve yalnızca cihazındaki Türkçe sesle çalışır; metin hiçbir servise gönderilmez. Kırmızı renk bilerek kullanılmaz: kamera verisinden tıbbi risk sınıflandırması yapılmaz. Omurga şekli, disk, kas yırtığı, sinir ve iç organlar kamerayla ölçülemez.')),
      h('a', { class: 'btn ghost block', href: `#/asistan?q=${encodeURIComponent('Vücudumda nerelere dikkat etmeliyim?')}` }, icon('i-chat'), 'Asistana sor')));
    // İşaret konumları (CSP: satır içi stil yerine CSSOM)
    for (const b of page.querySelectorAll('.figure .mark')) { b.style.left = `${b.dataset.x * 100}%`; b.style.top = `${b.dataset.y * 100}%`; }
  }

  return {
    async activate() {
      await render();
      const rid = new URLSearchParams(location.hash.split('?')[1] ?? '').get('bolge');
      if (rid && BODY_REGIONS[rid]) open(rid);
    },
    deactivate() { speaking?.stop(); speaking = null; },
  };
}
