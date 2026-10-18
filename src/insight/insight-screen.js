// "Bana Anlat — Vücudumda nerelere dikkat etmeliyim?" ekranı (#/anlat).
// Yalnızca gerçekten ölçülmüş verilerden; ölçülmeyen bölge gri ve "ölçülmedi" yazar. Teşhis yapılmaz.

import { getStore } from '../scan/store.js';
import { h, s, icon } from '../scan/dom.js';
import { evaluate, regionHeadline, dateTr } from './evaluate.js';
import { bodySummary } from './summary.js';
import { BODY_REGIONS, STATUS } from './regions.js';
import { openInsightCard, statusChip } from './card.js';
import { speak } from './speak.js';

/** Önden görünüm şeması üzerindeki işaret yerleri (kişinin solu ekranın sağında). */
const MAP_POS = {
  'bas-boyun': [100, 70], 'omuz-L': [141, 96], 'omuz-R': [59, 96], govde: [100, 150], kalca: [100, 206],
  'diz-L': [119, 300], 'diz-R': [81, 300], denge: [100, 392],
};

export function applyLargeText(store = getStore()) {
  document.body.classList.toggle('large-text', Boolean(store.state.settings?.largeText));
}

/** Vücudumun Özeti kartı (tarama raporunda ve Bana Anlat ekranında ortak). */
export function summaryCard(store, { compact = false } = {}) {
  const ev = evaluate(store.state);
  const sm = bodySummary(ev);
  return h('section', { class: 'tile isummary', id: compact ? 'scan-insight-summary' : 'insight-summary' },
    h('h3', {}, icon('i-explain'), 'Vücudumun Özeti'),
    sm.empty ? [h('p', { class: 'big-line' }, sm.title), h('p', {}, sm.text), h('a', { class: 'btn primary small', href: '#/tarama' }, 'Taramaya başla')] : [
      h('p', { class: 'sub' }, `${sm.title} · ${dateTr(sm.date)}`),
      sm.synthetic ? h('p', { class: 'warnline' }, 'DEMO / SENTETİK VERİ — gerçek ölçüm değildir.') : null,
      h('p', { class: 'big-line', id: 'insight-quality' }, sm.text),
      sm.attention.length ? [h('h4', {}, 'Dikkat çeken noktalar'), h('ul', { class: 'ilist' }, sm.attention.map((a) => h('li', {}, statusChip(a.status), ' ', a.text)))]
        : h('p', {}, 'Ölçülen bölgelerde belirsizliği aşan belirgin bir fark görülmedi.'),
      !compact && sm.positives.length ? [h('h4', {}, 'Olumlu gözlemler'), h('ul', { class: 'ilist ok' }, sm.positives.map((p) => h('li', {}, p)))] : null,
      h('h4', {}, 'Önerilen sonraki adım'), h('p', { id: 'insight-next' }, sm.next),
      compact ? h('a', { class: 'btn primary small', id: 'btn-scan-insight', href: '#/anlat' }, 'Bana Anlat: bölgeleri tek tek gör') : null,
    ]);
}

export async function createInsightScreen() {
  const store = getStore();
  const page = document.getElementById('insight-page');
  let speaking = null;
  const dbg = (window.__icgorInsight = { ...(window.__icgorInsight ?? {}), regions: null });

  const show3D = (rid) => { location.hash = `#/anatomi?anlat=${rid}`; };
  const open = (rid) => openInsightCard(rid, { store, onShow3D: show3D });

  function bodyMap(ev) {
    const svg = s('svg', { viewBox: '0 0 200 420', class: 'body-map', id: 'insight-map', role: 'group', 'aria-label': 'Vücut haritası (önden görünüm). Kişinin solu ekranın sağındadır.' },
      // Basit önden silüet (yalnızca yön bulmak için; anatomik model değildir)
      s('g', { class: 'silhouette' },
        s('circle', { cx: 100, cy: 36, r: 22 }),
        s('path', { d: 'M90 58h20v14H90z' }),
        s('path', { d: 'M62 86q38-14 76 0l6 70-10 60H66l-10-60z' }),
        s('path', { d: 'M62 88 44 150l-8 70M138 88l18 62 8 70', class: 'limb' }),
        s('path', { d: 'M78 214 74 300l2 88M122 214l4 86-2 88', class: 'limb' })),
      s('text', { x: 6, y: 14, class: 'map-note' }, 'Sağ'), s('text', { x: 194, y: 14, class: 'map-note', 'text-anchor': 'end' }, 'Sol'));
    for (const [rid, r] of Object.entries(ev.regions)) {
      const [x, y] = MAP_POS[rid];
      const g = s('g', { class: `mark ${r.status}`, tabindex: 0, role: 'button', 'data-region': rid, 'aria-label': `${r.tr}: ${STATUS[r.status].tr}. Açıklama için dokun.` },
        s('circle', { cx: x, cy: y, r: 13, class: 'halo' }), s('circle', { cx: x, cy: y, r: 8, class: 'dot' }),
        s('title', {}, `${r.tr} — ${STATUS[r.status].tr}`));
      g.addEventListener('click', () => open(rid));
      g.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(rid); } });
      svg.append(g);
    }
    return svg;
  }

  function render() {
    applyLargeText(store);
    const ev = evaluate(store.state);
    dbg.regions = Object.fromEntries(Object.values(ev.regions).map((r) => [r.id, r.status]));
    const regions = Object.values(ev.regions).sort((a, b) => STATUS[b.status].rank - STATUS[a.status].rank);
    const sm = bodySummary(ev);
    page.replaceChildren(h('div', { class: 'insight' },
      h('h2', {}, 'Bana Anlat'),
      h('p', { class: 'sub' }, 'Vücudumda nerelere dikkat etmeliyim? Kameranın ölçebildiği duruş ve hareket farklarını, ne anlama gelebileceklerini ve neler yapabileceğini anlatırız.'),
      h('div', { class: 'chips' },
        h('span', { class: 'chip-kind' }, 'Kamera ölçümü · yaklaşık'),
        h('span', { class: 'chip-kind atlas' }, '3B model genel atlas · senin vücudun değil'),
        h('span', { class: 'chip-kind' }, 'Teşhis değildir')),
      summaryCard(store),
      h('section', { class: 'tile' },
        h('div', { class: 'row-between' }, h('h3', {}, 'Vücut haritası'), h('button', { class: 'btn small', id: 'btn-insight-3d-open', onclick: () => { location.hash = '#/anatomi?anlat'; } }, '3B vücutta göster')),
        h('div', { class: 'map-wrap' }, bodyMap(ev),
          h('ul', { class: 'legend', 'aria-label': 'Renklerin anlamı' }, ['yesil', 'sari', 'turuncu', 'gri'].map((k) => h('li', {}, h('span', { class: `swatch ${k}` }), STATUS[k].tr)))),
        h('p', { class: 'small muted' }, 'Kırmızı renk bilerek kullanılmaz: kamera verisinden tıbbi risk sınıflandırması yapılmaz. Omurga şekli, disk, kas yırtığı, sinir ve iç organlar kamerayla ölçülemediği için haritada yer almaz.')),
      h('section', { class: 'tile' },
        h('h3', {}, 'Bölgeler'),
        h('ul', { class: 'region-list', id: 'insight-regions' }, regions.map((r) => h('li', {},
          h('button', { class: 'region-btn', dataset: { region: r.id, status: r.status }, onclick: () => open(r.id) },
            h('span', { class: `swatch ${r.status}`, 'aria-hidden': 'true' }),
            h('span', {}, h('strong', {}, r.tr), h('small', {}, regionHeadline(r)))))))),
      h('section', { class: 'tile' },
        h('h3', {}, 'Okuma kolaylığı'),
        h('div', { class: 'actions' },
          h('button', { class: 'btn small', id: 'btn-large-text', 'aria-pressed': String(Boolean(store.state.settings?.largeText)), onclick: () => { store.setSettings({ largeText: !store.state.settings?.largeText }); render(); } }, 'Büyük yazı'),
          h('button', { class: 'btn small', id: 'btn-insight-voice', onclick: (e) => {
            const err = document.getElementById('insight-voice-err');
            if (speaking) { speaking.stop(); speaking = null; e.currentTarget.textContent = 'Özeti sesli dinle'; return; }
            const text = sm.empty ? sm.text : [sm.title, sm.text, ...sm.attention.map((a) => a.text), 'Önerilen sonraki adım:', sm.next].join(' ');
            const r = speak(text, { onEnd: () => { speaking = null; } });
            if (r.error) { err.textContent = r.error; return; }
            speaking = r; e.currentTarget.textContent = 'Sesi durdur';
          } }, 'Özeti sesli dinle')),
        h('p', { class: 'small warnline', id: 'insight-voice-err', role: 'status' }),
        h('p', { class: 'small muted' }, 'Sesli anlatım varsayılan olarak kapalıdır ve yalnızca cihazındaki Türkçe sesle çalışır; metin hiçbir servise gönderilmez.')),
      h('a', { class: 'btn ghost', href: `#/asistan?q=${encodeURIComponent('Vücudumda nerelere dikkat etmeliyim?')}` }, 'Asistana sor')));
  }

  return {
    activate() {
      render();
      const rid = new URLSearchParams(location.hash.split('?')[1] ?? '').get('bolge');
      if (rid && BODY_REGIONS[rid]) open(rid);
    },
    deactivate() { speaking?.stop(); speaking = null; },
  };
}
