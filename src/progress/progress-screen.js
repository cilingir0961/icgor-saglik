// Gelişim paneli (#/gelisim): antrenmanlar, adımlar (30/60/90), kamera koçu ve tarama karşılaştırmaları.
// Ölçüm hatası içindeki değişim "iyileşme" olarak gösterilmez; demo veri ayrıca işaretlenir.

import { getStore } from '../scan/store.js';
import { h, s, icon, fmt } from '../scan/dom.js';
import { stepPeriod, weeklyWorkouts, coachChanges } from './metrics.js';
import { compareScans, windows } from '../analysis/compare.js';
import { adaptiveGoal, lastDays } from '../activity/steps.js';

const STATUS = { yok: ['Yetersiz veri', ''], belirsiz: ['Belirsiz', 'info'], artis: ['Artış', 'ok'], azalis: ['Azalış', ''], olasi: ['Olası değişim', 'ok'] };

export async function createProgressScreen() {
  const store = getStore();
  const page = document.getElementById('progress-page');

  function render() {
    const st = store.state;
    const days = st.activity?.days ?? {};
    const plan = st.trainer?.plan;
    const weeks = weeklyWorkouts(st.trainer?.history, 6);
    const periods = [30, 60, 90].map((n) => stepPeriod(days, n));
    const goal = st.activity?.goalMode === 'manual' && st.activity?.goal ? st.activity.goal : adaptiveGoal(days).goal;
    const met7 = lastDays(7).filter((k) => (days[k]?.steps ?? 0) >= goal).length;
    const coach = coachChanges(st.trainer?.coachLog);
    const scans = st.scans ?? [];
    const scanRows = [];
    if (scans.length > 1) {
      for (const w of windows(scans)) {
        if (!w.base) { scanRows.push(h('li', { class: 'muted' }, `${w.days} gün önce: karşılaştırılabilir tarama yok.`)); continue; }
        const res = compareScans(w.base, scans.at(-1));
        for (const r of Object.values(res)) {
          if (!r.ok) { scanRows.push(h('li', { class: 'muted' }, `${w.days} gün · ${r.label ?? 'görünüş'}: karşılaştırılamaz (${r.why.join(', ')}).`)); continue; }
          for (const m of Object.values(r.metrics)) if (m.status !== 'yok') scanRows.push(h('li', { class: m.status }, `${w.days} gün · ${m.tr}: ${m.text}`));
        }
      }
    }
    const lastH = st.trainer?.history?.at(-1);

    page.replaceChildren(h('div', {},
      h('h2', {}, 'Gelişim'),
      h('p', { class: 'sub' }, 'Değişimler ölçüm belirsizliğiyle birlikte gösterilir. Belirsizlik içindeki farklar “Belirsiz” olarak işaretlenir; iyileşme veya kötüleşme diye yorumlanmaz.'),
      h('div', { class: 'grid2' },
        h('section', { class: 'tile', id: 'pg-goals' },
          h('h3', {}, 'Hedefler (bu hafta)'),
          h('p', {}, `Antrenman: ${weeks.at(-1).count} / ${plan?.sessions.length ?? '—'}`),
          h('p', {}, `Adım hedefine ulaşılan gün (son 7): ${met7} / 7`),
          lastH ? h('p', { class: 'sub' }, `Son antrenman hissi: ${{ kolay: 'kolay', uygun: 'uygun', zor: 'zor' }[lastH.feedback?.feeling] ?? '—'}${lastH.feedback?.pain?.length ? ' · ağrı bildirildi' : ''}`) : null),
        h('section', { class: 'tile', id: 'pg-workouts' },
          h('h3', {}, icon('i-dumbbell'), 'Haftalık antrenmanlar'),
          weekChart(weeks, plan?.sessions.length ?? 0),
          h('p', { class: 'sub' }, `Son 6 haftada ${weeks.reduce((a, w) => a + w.count, 0)} antrenman, ${weeks.reduce((a, w) => a + w.exercises, 0)} tamamlanan egzersiz.`)),
        h('section', { class: 'tile', id: 'pg-steps' },
          h('h3', {}, icon('i-walk'), 'Adımlar: 30 / 60 / 90 gün'),
          periods.some((p) => p.demo) ? h('p', { class: 'warnline' }, 'Demo veri içerir — gerçek ölçüm değildir.') : null,
          h('ul', { class: 'pg-list' }, periods.map((p) => h('li', { dataset: { period: p.days, status: p.status } },
            h('strong', {}, `${p.days} gün: `), p.avg != null ? `ort. ${fmt(p.avg, 0)} adım (${p.n} gün kayıt)` : 'kayıt yok', ' ',
            h('span', { class: `badge ${STATUS[p.status][1]}` }, STATUS[p.status][0]),
            p.status === 'yok' ? h('small', {}, ` Önceki ${p.days} günle karşılaştırmak için her iki dönemde en az ${Math.max(3, Math.ceil(p.days / 3))} kayıtlı gün gerekir.`)
              : h('small', {}, ` Önceki döneme göre ${p.delta > 0 ? '+' : ''}${fmt(p.delta, 0)} (günlük dalgalanma payı ±${fmt(p.margin, 0)}).`))))),
        h('section', { class: 'tile', id: 'pg-coach' },
          h('h3', {}, 'Kamera koçu (hareket açıklığı)'),
          coach.length ? h('ul', { class: 'pg-list' }, coach.map((c) => h('li', { dataset: { status: c.status } }, h('strong', {}, `${c.tr}: `), c.text, ' ', h('span', { class: `badge ${STATUS[c.status][1]}` }, STATUS[c.status][0]))))
            : h('p', { class: 'sub' }, 'Henüz güvenilir kamera koçu ölçümü yok. Antrenmanda “Kamerayla say” ile kaydedilir.'),
          h('p', { class: 'muted small' }, 'Deneysel: sentetik figürle doğrulandı, gerçek kişilerde doğrulanmadı.')),
        h('section', { class: 'tile', id: 'pg-scans' },
          h('h3', {}, 'Tarama karşılaştırmaları'),
          scans.length < 2 ? h('p', { class: 'sub' }, 'Karşılaştırma için aynı koşullarda (aynı mesafe, ışık, kıyafet) en az iki tarama gerekir.')
            : h('ul', { class: 'cmp-list' }, scanRows.length ? scanRows : h('li', {}, 'Karşılaştırılabilir gösterge yok.'))),
        h('section', { class: 'tile', id: 'pg-ai' },
          h('h3', {}, icon('i-chat'), 'Haftalık değerlendirme'),
          h('p', { class: 'sub' }, 'Asistan, paylaşmayı seçtiğiniz özetlerle haftanızı değerlendirir. Ne paylaşılacağını asistan ekranındaki “Paylaşılan bilgiler” bölümünde seçersiniz; varsayılan olarak hiçbir şey paylaşılmaz.'),
          h('a', { class: 'btn', id: 'btn-weekly-review', href: `#/asistan?q=${encodeURIComponent('Haftalık değerlendirme yapar mısın?')}` }, 'Haftalık değerlendirme iste')))));
  }

  function weekChart(weeks, planned) {
    const W = 300, H = 110, pad = 16, bw = (W - pad) / weeks.length;
    const max = Math.max(planned, ...weeks.map((w) => w.count), 1);
    const y = (v) => H - pad - (v / max) * (H - pad - 8);
    return s('svg', { viewBox: `0 0 ${W} ${H}`, class: 'step-chart', role: 'img', 'aria-label': 'Haftalık antrenman sayısı' },
      planned ? s('line', { x1: pad, x2: W, y1: y(planned), y2: y(planned), class: 'goal-line' }) : null,
      ...weeks.map((w, i) => s('rect', { x: pad + i * bw + bw * 0.2, width: bw * 0.6, y: y(w.count), height: Math.max(1, H - pad - y(w.count)), rx: 2, class: `bar ${planned && w.count >= planned ? 'met' : ''}` }, s('title', {}, `${w.from.toLocaleDateString('tr-TR')} haftası: ${w.count}`))),
      ...weeks.map((w, i) => s('text', { x: pad + i * bw + bw / 2, y: H - 3, class: 'chart-label', 'text-anchor': 'middle' }, w.from.toLocaleDateString('tr-TR', { day: 'numeric', month: 'numeric' }))));
  }

  return { activate: render };
}
