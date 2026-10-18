// Aktivite ekranı (#/aktivite): günlük adım, 7/30 gün grafiği, uyarlanır hedef, alışkanlıklar ve kaynaklar.
// Kaynak durumu dürüsttür: HealthKit/Health Connect web'den erişilemez → "kullanılamaz". Demo veri etiketlidir.

import { getStore } from '../scan/store.js';
import { h, s, icon, fmt } from '../scan/dom.js';
import { dayKey, lastDays, adaptiveGoal, weekStats, streak, demoDays } from './steps.js';
import { SOURCES, motionSupport } from './sources.js';
import { createPedometer } from './pedometer.js';

export async function createActivityScreen() {
  const store = getStore();
  const page = document.getElementById('activity-page');
  let range = 7, walk = null;
  const dbg = (window.__icgorActivity = { walk: null });

  const A = () => store.state.activity ?? { goalMode: 'auto', goal: null, days: {}, habits: {} };
  const setDay = (key, steps, source) => store.update('activity', (a) => ({ ...a, days: { ...a.days, [key]: { steps: Math.max(0, Math.min(100000, Math.round(steps))), source } } }));
  const goalInfo = () => (A().goalMode === 'manual' && A().goal ? { goal: A().goal, basis: 'Kendi belirlediğiniz hedef.' } : adaptiveGoal(A().days, new Date(), { goalType: store.state.profile?.goal }));

  function render() {
    const a = A();
    const days = a.days ?? {};
    const today = dayKey();
    const g = goalInfo();
    const ws = weekStats(days);
    const hasDemo = Object.values(days).some((d) => d.source === 'demo');
    const todaySteps = days[today]?.steps ?? 0;
    const input = h('input', { type: 'number', inputmode: 'numeric', min: 0, max: 100000, id: 'steps-input', placeholder: 'ör. 4200', 'aria-label': 'Bugünkü adım' });
    page.replaceChildren(h('div', {},
      h('h2', {}, 'Aktivite'),
      h('p', { class: 'sub' }, 'Adım hedefiniz herkes için sabit 10.000 değildir; son günlerinize göre kademeli uyarlanır.'),
      hasDemo ? h('p', { class: 'warnline', id: 'demo-banner' }, 'DEMO VERİ: grafikteki geçmiş günler örnek amaçlı üretilmiştir, gerçek ölçüm değildir.') : null,
      h('section', { class: 'tile' },
        h('div', { class: 'row' }, h('h3', {}, icon('i-walk'), 'Bugün'), h('span', { class: 'big', id: 'steps-today' }, fmt(todaySteps, 0))),
        h('div', { class: 'meter', role: 'progressbar', 'aria-valuemin': 0, 'aria-valuemax': g.goal, 'aria-valuenow': todaySteps }, h('span', { dataset: { w: Math.min(100, Math.round((todaySteps / g.goal) * 100)) } })),
        h('p', { class: 'sub', id: 'goal-basis' }, `Hedef ${fmt(g.goal, 0)} adım · ${g.basis}`),
        h('form', { class: 'row', onsubmit: (e) => { e.preventDefault(); const v = Number(input.value); if (Number.isFinite(v) && v >= 0) { setDay(today, v, 'manuel'); render(); } } },
          input, h('button', { class: 'btn primary small', type: 'submit', id: 'btn-steps-save' }, 'Kaydet')),
        h('p', { class: 'muted small' }, SOURCES.manuel.note)),
      h('section', { class: 'tile' },
        h('div', { class: 'row' }, h('h3', {}, icon('i-chart'), 'Geçmiş'),
          h('div', { class: 'seg small', role: 'group', 'aria-label': 'Aralık' }, [7, 30].map((n) => h('button', { type: 'button', 'aria-pressed': String(range === n), onclick: () => { range = n; render(); } }, `${n} gün`)))),
        chart(days, g.goal),
        h('p', { class: 'sub' }, `7 gün ortalaması: ${ws.avg != null ? `${fmt(ws.avg, 0)} adım` : '—'}${ws.change != null ? ` (önceki haftaya göre ${ws.change > 0 ? '+' : ''}${fmt(ws.change, 0)})` : ''} · Hedefe ulaşılan art arda gün: ${streak(days, g.goal)}`)),
      h('section', { class: 'tile' },
        h('h3', {}, 'Hedef'),
        h('div', { class: 'chips' },
          h('button', { class: 'chip-btn', id: 'goal-auto', 'aria-pressed': String(a.goalMode !== 'manual'), onclick: () => { store.update('activity', { goalMode: 'auto' }); render(); } }, 'Uyarlanır (önerilen)'),
          h('button', { class: 'chip-btn', id: 'goal-manual', 'aria-pressed': String(a.goalMode === 'manual'), onclick: () => { store.update('activity', { goalMode: 'manual', goal: a.goal ?? g.goal }); render(); } }, 'Kendim belirleyeceğim')),
        a.goalMode === 'manual' ? h('form', { class: 'row', onsubmit: (e) => { e.preventDefault(); const v = Number(document.getElementById('goal-input').value); if (v >= 1000 && v <= 30000) { store.update('activity', { goal: Math.round(v) }); render(); } } },
          h('input', { type: 'number', id: 'goal-input', min: 1000, max: 30000, step: 500, value: a.goal ?? g.goal, 'aria-label': 'Günlük adım hedefi' }),
          h('button', { class: 'btn small', type: 'submit' }, 'Hedefi kaydet')) : null,
        h('p', { class: 'muted small' }, 'Uyarlanır hedef: son 14 günün ortanca değerinin yaklaşık %10 üstü, 3.000–12.000 arasında. Ağrı veya sağlık sorununuz varsa hedefi hekiminizle belirleyin.')),
      walkTile(),
      h('section', { class: 'tile', id: 'sources' },
        h('h3', {}, 'Veri kaynakları'),
        h('ul', { class: 'source-list' }, Object.entries(SOURCES).map(([k, src]) => h('li', { dataset: { source: k, kind: src.kind } },
          h('strong', {}, src.tr), ' ', h('span', { class: `badge ${src.kind === 'gercek' ? 'ok' : src.kind === 'yok' ? '' : 'info'}` }, { gercek: 'kullanılabilir', deneysel: 'deneysel', demo: 'demo', yok: 'kullanılamaz' }[src.kind]),
          h('br'), h('small', {}, src.note)))),
        h('div', { class: 'actions' },
          hasDemo
            ? h('button', { class: 'btn small ghost', id: 'btn-demo-remove', onclick: () => { store.update('activity', (x) => ({ ...x, days: Object.fromEntries(Object.entries(x.days).filter(([, d]) => d.source !== 'demo')) })); render(); } }, 'Demo veriyi kaldır')
            : h('button', { class: 'btn small', id: 'btn-demo-add', onclick: () => { const d = demoDays(); store.update('activity', (x) => ({ ...x, days: { ...d, ...Object.fromEntries(Object.entries(x.days).filter(([, v]) => v.source !== 'demo')) } })); render(); } }, 'Demo veriyle dene (etiketli)'))),
      h('p', { class: 'muted small' }, 'Kalori ve mesafe tahmini gösterilmez: adım uzunluğu ve enerji harcaması kişiye göre çok değişir ve bu uygulamada doğrulanmadı.')));
    for (const el of page.querySelectorAll('[data-w]')) el.style.width = `${el.dataset.w}%`;
  }

  /** SVG çubuk grafik (CSP uyumlu: satır içi stil yok). Demo günleri taralı, hedef çizgisi kesikli. */
  function chart(days, goal) {
    const keys = lastDays(range);
    const vals = keys.map((k) => days[k]?.steps ?? null);
    const max = Math.max(goal * 1.2, ...vals.filter(Number.isFinite), 1000);
    const W = 320, H = 140, pad = 18, bw = (W - pad) / keys.length;
    const y = (v) => H - pad - (v / max) * (H - pad - 6);
    const svg = s('svg', { viewBox: `0 0 ${W} ${H}`, class: 'step-chart', id: 'step-chart', role: 'img', 'aria-label': `Son ${range} gün adım grafiği, hedef ${goal}` },
      s('line', { x1: pad, x2: W, y1: y(goal), y2: y(goal), class: 'goal-line' }),
      s('text', { x: W - 2, y: y(goal) - 4, class: 'chart-label', 'text-anchor': 'end' }, `hedef ${fmt(goal, 0)}`),
      ...keys.map((k, i) => {
        const v = vals[i];
        if (!Number.isFinite(v)) return null;
        const src = days[k].source;
        return s('rect', { x: pad + i * bw + bw * 0.15, width: bw * 0.7, y: y(v), height: Math.max(1, H - pad - y(v)), rx: 2, class: `bar ${src === 'demo' ? 'demo' : v >= goal ? 'met' : ''}` },
          s('title', {}, `${k}: ${v.toLocaleString('tr-TR')} adım${src === 'demo' ? ' (demo)' : ''}`));
      }),
      ...keys.map((k, i) => (range === 7 || i % 5 === 4 ? s('text', { x: pad + i * bw + bw / 2, y: H - 4, class: 'chart-label', 'text-anchor': 'middle' }, k.slice(8)) : null)));
    return svg;
  }

  function walkTile() {
    const sup = motionSupport();
    return h('section', { class: 'tile', id: 'walk-tile' },
      h('div', { class: 'row' }, h('h3', {}, 'Yürüyüş sayacı'), h('span', { class: 'badge info' }, 'Deneysel')),
      h('p', { class: 'small muted' }, SOURCES.ivme.note),
      !sup.ok ? h('p', { class: 'warnline' }, sup.why)
        : walk ? [h('p', { class: 'big', id: 'walk-steps' }, fmt(walk.ped.steps, 0)), h('button', { class: 'btn', id: 'btn-walk-stop', onclick: stopWalk }, 'Durdur ve bugüne ekle')]
          : h('button', { class: 'btn', id: 'btn-walk-start', onclick: startWalk }, 'Yürüyüşü başlat'));
  }

  async function startWalk() {
    const sup = motionSupport();
    if (sup.needsPermission) {
      try {
        if ((await DeviceMotionEvent.requestPermission()) !== 'granted') { dbg.denied = true; render(); return; }
      } catch { return; }
    }
    const ped = createPedometer();
    const t0 = performance.now();
    const onMotion = (e) => {
      const g = e.accelerationIncludingGravity;
      if (!g || g.x == null) return;
      ped.push((performance.now() - t0) / 1000, [g.x, g.y, g.z]);
      const el = document.getElementById('walk-steps');
      if (el) el.textContent = fmt(ped.steps, 0);
    };
    let lock = null;
    try { lock = await navigator.wakeLock?.request('screen'); } catch { /* yok */ }
    window.addEventListener('devicemotion', onMotion);
    walk = { ped, onMotion, lock };
    dbg.walk = walk;
    render();
  }

  function stopWalk() {
    if (!walk) return;
    window.removeEventListener('devicemotion', walk.onMotion);
    walk.lock?.release?.();
    const n = walk.ped.steps;
    walk = null;
    if (n > 0) { const prev = A().days[dayKey()]; setDay(dayKey(), (prev?.steps ?? 0) + n, !prev || prev.source === 'ivme' ? 'ivme' : 'karma'); }
    render();
  }

  return { activate: render, deactivate: stopWalk };
}
