// "Bana Anlat" açıklama kartı (DOM). Hem Bana Anlat ekranı hem 3B vücut işaretleri bu kartı açar.

import { h } from '../scan/dom.js';
import { evaluate } from './evaluate.js';
import { explainRegion } from './explain.js';
import { recommend } from './recommend.js';
import { STATUS, BODY_REGIONS } from './regions.js';
import { speak } from './speak.js';

let speaking = null;

export function statusChip(status) {
  return h('span', { class: `istatus ${status}`, dataset: { status } }, STATUS[status].tr);
}

/** Bulgu ve ölçülerden genel güvenilirlik özeti (gösterge çubuğu için 0–3). */
function reliabilityLevel(r) {
  const items = r.flagged.length ? r.flagged : r.items.filter((e) => e.reliable);
  if (!items.length) return { level: 0, tr: 'Veri yok' };
  const best = items.some((e) => e.grade === 'iyi' && !e.experimental) ? 3 : items.some((e) => e.grade === 'orta' || (e.grade === 'iyi' && e.experimental)) ? 2 : 1;
  const n = new Set(items.map((e) => e.scanId ?? e.date)).size + Math.max(0, ...items.map((e) => e.repeats ?? 0));
  return { level: best, tr: `${['', 'düşük', 'orta', 'iyi'][best]} · ${n} ölçüm${items.some((e) => e.experimental) ? ' · deneysel gösterge' : ''}` };
}

/**
 * @param {string} regionId
 * @param {{store:object, onShow3D?:(id:string)=>void, from?:'anatomy'|'insight'}} o
 */
export function openInsightCard(regionId, { store, onShow3D, from = 'insight' }) {
  const dialog = document.getElementById('insight-dialog');
  const box = document.getElementById('insight-card');
  const render = () => {
    const ev = evaluate(store.state);
    const r = ev.regions[regionId];
    const c = explainRegion(r);
    const rec = recommend(regionId, store.state);
    const rel = reliabilityLevel(r);
    document.getElementById('insight-card-title').textContent = r.tr;
    const sym = store.state.insight?.symptoms?.[regionId];
    const showEx = h('div', { class: 'ex-reco', id: 'insight-reco', hidden: true },
      rec.blocked ? h('p', { class: 'notice', id: 'insight-blocked' }, rec.message)
        : [h('p', { class: 'small muted' }, rec.message),
          h('ul', { class: 'reco-list' }, rec.exercises.map((e) => h('li', { dataset: { ex: e.id } },
            h('strong', {}, e.tr), h('span', { class: 'small' }, ` · ${e.dose}`), h('p', { class: 'small' }, e.desc),
            h('button', { class: 'chip-btn', onclick: () => show3DMuscles(e.id) }, '3B kaslar'))))]);
    box.replaceChildren(
      h('div', { class: 'icard', dataset: { region: regionId, status: r.status } },
        h('div', { class: 'row-between' }, statusChip(r.status), h('span', { class: 'chip-kind' }, 'Kamera ölçümü · yaklaşık')),
        h('div', { class: 'rel', 'aria-label': `Ölçüm güvenilirliği: ${rel.tr}` },
          h('span', { class: 'small muted' }, 'Ölçüm güvenilirliği'), h('span', { class: `rel-bar l${rel.level}` }, h('i'), h('i'), h('i')), h('span', { class: 'small' }, rel.tr)),
        h('p', { class: 'ihead' }, c.headline),
        c.unreliable.length ? h('div', { class: 'notice iunrel', id: 'insight-unreliable' }, c.unreliable.map((x) => h('p', { class: 'small' }, x))) : null,
        c.findings.map((f) => h('section', { class: 'ifinding', dataset: { finding: f.id } },
          h('p', { class: 'iobs' }, f.text),
          h('p', { class: 'small muted' }, `Dayandığı ölçüm: ${f.basis}`),
          f.history ? h('p', { class: 'small ihistory' }, f.history) : null,
          h('details', { open: true }, h('summary', {}, 'Bu ne demek?'), h('p', {}, f.meaning), h('p', {}, c.whatIs)),
          h('details', {}, h('summary', {}, 'Ölçüm ne kadar güvenilir?'), h('p', {}, f.reliability),
            h('p', { class: 'small' }, 'Sonucu etkileyebilecek kamera kaynaklı nedenler:'), h('ul', { class: 'small' }, f.caveats.map((x) => h('li', {}, x)))))),
        c.measuredOk.length ? h('details', { open: !c.findings.length }, h('summary', {}, r.status === 'gri' ? 'Ölçülenler' : 'Belirgin fark görülmeyen ölçümler'), h('ul', { class: 'small' }, c.measuredOk.map((x) => h('li', {}, x)))) : null,
        h('details', { open: true, class: 'inext' }, h('summary', {}, 'Ne yapabilirim?'),
          h('ul', {}, c.next.map((x) => h('li', {}, x))),
          h('p', { class: 'small warnline' }, c.safety),
          c.discomfort ? h('p', { class: 'small notice' }, 'Bu ölçüm sırasında rahatsızlık bildirmiştin; hareketi zorlamadan yap ve gerekirse bir uzmana danış.') : null,
          h('label', { class: 'check' },
            h('input', { type: 'checkbox', id: 'insight-symptom', checked: Boolean(sym?.on), onchange: (e) => {
              store.update('insight', (x) => ({ ...(x ?? {}), symptoms: { ...(x?.symptoms ?? {}), [regionId]: { on: e.target.checked, date: new Date().toISOString(), kinds: ['ağrı / uyuşma / güç kaybı'] } } }));
              render();
              document.getElementById('insight-reco').hidden = false;
            } }),
            h('span', {}, 'Bu bölgede ağrı, uyuşma veya güç kaybı var')),
          h('div', { class: 'actions' },
            h('button', { class: 'btn primary small', id: 'btn-insight-reco', onclick: () => { showEx.hidden = !showEx.hidden; } }, 'Bana uygun hareketi göster'),
            h('a', { class: 'btn small', id: 'btn-insight-retest', href: retestHref(regionId) }, 'Ölçümü tekrarla')),
          showEx),
        c.more ? h('details', {}, h('summary', {}, 'Daha fazla bilgi'), h('p', { class: 'small muted' }, 'Genel anatomi bilgisidir; sana özel bir ölçüm değildir.'), h('p', {}, c.more)) : null,
        h('div', { class: 'actions' },
          from !== 'anatomy' ? h('button', { class: 'btn small ghost', id: 'btn-insight-3d', onclick: () => { dialog.close(); onShow3D?.(regionId); } }, '3B vücutta göster') : null,
          h('button', { class: 'btn small ghost', id: 'btn-insight-speak', onclick: (e) => toggleSpeak(e.currentTarget, cardText(r, c)) }, speaking ? 'Sesi durdur' : 'Sesli dinle'),
          h('span', { class: 'small warnline', id: 'insight-speak-err', role: 'status' }))));
  };
  render();
  dialog.addEventListener('close', () => { speaking?.stop(); speaking = null; }, { once: true });
  if (!dialog.open) dialog.showModal();
  window.__icgorInsight = { ...(window.__icgorInsight ?? {}), openRegion: regionId };
}

function cardText(r, c) {
  return [r.tr, c.headline, ...c.findings.flatMap((f) => [f.text, f.meaning]), c.whatIs, ...c.next, c.safety].filter(Boolean).join(' ');
}

function toggleSpeak(btn, text) {
  const err = document.getElementById('insight-speak-err');
  if (speaking) { speaking.stop(); speaking = null; btn.textContent = 'Sesli dinle'; return; }
  const r = speak(text, { onEnd: () => { speaking = null; btn.textContent = 'Sesli dinle'; } });
  if (r.error) { err.textContent = r.error; return; }
  err.textContent = '';
  speaking = r;
  btn.textContent = 'Sesi durdur';
}

function retestHref(regionId) {
  const R = BODY_REGIONS[regionId];
  return R.exRegion === 'omuz' || R.exRegion === 'diz' || R.exRegion === 'denge' ? '#/tarama?hareket' : '#/tarama';
}

function show3DMuscles(exId) {
  import('../fitness/exercises.js').then(({ BY_ID }) => {
    const e = BY_ID[exId];
    try {
      sessionStorage.setItem('icgor.highlight', JSON.stringify({ topic: 'egzersiz', title: e.tr, ids: e.muscles, motion: e.motion,
        anatomy: `${e.tr}: hedef kas grupları vurgulandı. Genel atlas modelidir; senin kaslarını göstermez.${e.motion ? ' Eklem hareketi basitleştirilmiş bir SİMÜLASYONDUR.' : ''}`, twin: null }));
    } catch { /* özel mod */ }
    document.getElementById('insight-dialog').close();
    location.hash = '#/anatomi?ikiz';
  });
}
