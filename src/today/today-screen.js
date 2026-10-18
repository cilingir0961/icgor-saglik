// "Bugün" ana ekranı: günün antrenmanı, adımlar (uyarlanır hedef), alışkanlıklar, son tarama, asistan
// kısayolları ve hatırlatma kurulumu. Tüm veriler yerel depodan; tıbbi değerlendirme içermez.

import { getStore } from '../scan/store.js';
import { h, icon, fmt } from '../scan/dom.js';
import { dayKey, adaptiveGoal, weekStats } from '../activity/steps.js';
import { BY_ID } from '../fitness/exercises.js';
import { DAY_NAMES } from '../fitness/planner.js';
import { evaluate, regionHeadline } from '../insight/evaluate.js';
import { STATUS } from '../insight/regions.js';

const QUICK = ['Evde ekipmansız 20 dakikalık program hazırla', 'Omuzlarım öne doğru duruyor, hangi hareketleri yapabilirim?', 'Uyku düzenim için ne önerirsin?'];

export async function createTodayScreen() {
  const store = getStore();
  const page = document.getElementById('today-page');

  function render() {
    const st = store.state;
    const now = new Date();
    const todayDow = (now.getDay() + 6) % 7; // Pazartesi = 0
    const plan = st.trainer?.plan;
    const session = plan?.sessions.find((s) => s.dow === todayDow) ?? null;
    const next = plan?.sessions.find((s) => s.dow > todayDow) ?? plan?.sessions[0] ?? null;
    const days = st.activity?.days ?? {};
    const today = days[dayKey(now)]?.steps ?? 0;
    const goalInfo = st.activity?.goalMode === 'manual' && st.activity?.goal ? { goal: st.activity.goal, basis: 'Kendi belirlediğiniz hedef.' } : adaptiveGoal(days, now, { goalType: st.profile?.goal });
    const pct = Math.min(100, Math.round((today / goalInfo.goal) * 100));
    const ws = weekStats(days, now);
    const demo = Object.values(days).some((d) => d.source === 'demo');
    const hb = st.activity?.habits?.[dayKey(now)] ?? { water: 0, sleepH: null, breaks: 0 };
    const lastScan = st.scans?.at(-1);
    const doneThisWeek = (st.trainer?.history ?? []).filter((x) => Date.now() - new Date(x.date).getTime() < 7 * 86400000).length;

    const addSteps = (n) => {
      store.update('activity', (a) => ({ ...a, days: { ...a.days, [dayKey()]: { steps: Math.max(0, (a.days[dayKey()]?.steps ?? 0) + n), source: 'manuel' } } }));
      render();
    };
    const habit = (k, d) => {
      store.update('activity', (a) => {
        const cur = a.habits?.[dayKey()] ?? { water: 0, sleepH: null, breaks: 0 };
        const v = k === 'sleepH' ? Math.min(14, Math.max(0, (cur.sleepH ?? 7) + d)) : Math.max(0, (cur[k] ?? 0) + d);
        return { ...a, habits: { ...a.habits, [dayKey()]: { ...cur, [k]: v } } };
      });
      render();
    };

    page.replaceChildren(h('div', {},
      h('h2', {}, `Bugün · ${now.toLocaleDateString('tr-TR', { weekday: 'long', day: 'numeric', month: 'long' })}`),
      h('p', { class: 'sub' }, 'Eğitim amaçlı kişisel sağlık ve hareket asistanı. Tıbbi değerlendirme veya teşhis yapmaz.'),
      insightTile(st),
      h('div', { class: 'grid2' },
        h('section', { class: 'tile', id: 'today-workout' },
          h('h3', {}, icon('i-dumbbell'), 'Antrenman'),
          !plan ? [h('p', {}, 'Henüz kişisel planınız yok. Birkaç soruyla size uygun bir haftalık plan oluşturalım.'), h('a', { class: 'btn primary', href: '#/antrenman' }, 'Plan oluştur')]
            : st.trainer.paused ? [h('p', { class: 'warnline' }, 'Planınız son geri bildiriminiz nedeniyle duraklatıldı.'), h('a', { class: 'btn', href: '#/antrenman' }, 'Ayrıntılar')]
              : session ? [h('p', {}, `Bugün: ${session.items.length} hareket, ~${session.estMinutes} dk${session.status === 'tamamlandi' ? ' — tamamlandı ✓' : ''}`),
                h('p', { class: 'sub' }, session.items.filter((i) => i.role === 'ana').slice(0, 3).map((i) => BY_ID[i.id].tr).join(' · ')),
                h('a', { class: 'btn primary', href: `#/antrenman?oturum=${plan.sessions.indexOf(session)}` }, session.status === 'tamamlandi' ? 'Tekrar göz at' : 'Antrenmanı başlat')]
                : [h('p', {}, `Bugün dinlenme günü. ${plan.restTip}`), next ? h('p', { class: 'sub' }, `Sıradaki: ${DAY_NAMES[next.dow]}, ~${next.estMinutes} dk`) : null],
          plan ? h('p', { class: 'sub' }, `Bu hafta tamamlanan: ${doneThisWeek} / ${plan.sessions.length}`) : null),
        h('section', { class: 'tile', id: 'today-steps' },
          h('h3', {}, icon('i-walk'), 'Adımlar', demo ? h('span', { class: 'badge' }, 'demo veri var') : null),
          h('div', { class: 'row' }, h('span', { class: 'big' }, fmt(today)), h('span', { class: 'sub' }, `hedef ${fmt(goalInfo.goal)}`)),
          h('div', { class: 'meter', role: 'progressbar', 'aria-valuemin': 0, 'aria-valuemax': 100, 'aria-valuenow': pct, 'aria-label': 'Günlük adım hedefi ilerlemesi' }, h('span', { style: null, dataset: { w: pct } })),
          h('p', { class: 'sub' }, `${ws.avg != null ? `7 gün ortalaması ${fmt(ws.avg)}. ` : ''}${goalInfo.basis}`),
          h('div', { class: 'chips' }, h('button', { class: 'chip-btn', id: 'btn-steps-500', onclick: () => addSteps(500) }, '+500'), h('button', { class: 'chip-btn', onclick: () => addSteps(1000) }, '+1.000'), h('a', { class: 'chip-btn', href: '#/aktivite' }, 'Ayrıntı ve giriş'))),
        h('section', { class: 'tile', id: 'today-habits' },
          h('h3', {}, 'Günlük alışkanlıklar'),
          counter('Su (bardak)', hb.water ?? 0, (d) => habit('water', d), 'water'),
          counter('Uyku (saat)', hb.sleepH ?? '—', (d) => habit('sleepH', d), 'sleep'),
          counter('Hareket molası', hb.breaks ?? 0, (d) => habit('breaks', d), 'breaks'),
          h('p', { class: 'sub' }, 'Yalnızca kendi takibiniz içindir; öneriler genel bilgidir.')),
        h('section', { class: 'tile', id: 'today-scan' },
          h('h3', {}, icon('i-ruler'), 'Duruş taraması'),
          lastScan ? h('p', {}, `Son tarama: ${new Date(lastScan.date).toLocaleDateString('tr-TR')} · ${Object.keys(lastScan.captures ?? {}).length} görünüş${Object.keys(lastScan.movements ?? {}).length ? ` · ${Object.keys(lastScan.movements).length} hareket testi` : ''}`) : h('p', {}, 'Henüz tarama yok. Kameranızla duruş ve hareket farkındalığı taraması yapabilirsiniz.'),
          h('a', { class: 'btn', href: '#/tarama' }, lastScan ? 'Taramalara git' : 'Tarama başlat')),
        h('section', { class: 'tile', id: 'today-ai' },
          h('h3', {}, icon('i-chat'), 'Asistana sorun'),
          h('div', { class: 'chips' }, QUICK.map((q) => h('a', { class: 'chip-btn', href: `#/asistan?q=${encodeURIComponent(q)}` }, q)))),
        st.notify?.enabled ? null : h('section', { class: 'tile', id: 'today-notify' },
          h('h3', {}, icon('i-bell'), 'Hatırlatmalar'),
          h('p', {}, 'Antrenman, yürüyüş ve masa başı molası için hatırlatma saatlerini siz seçin. İzniniz olmadan bildirim gönderilmez.'),
          h('a', { class: 'btn', href: '#/bildirimler' }, 'Hatırlatmaları ayarla')))));
    // İlerleme çubuğu genişliği (CSP: satır içi stil yerine CSSOM)
    for (const el of page.querySelectorAll('[data-w]')) el.style.width = `${el.dataset.w}%`;
  }

  /** "Bana Anlat" kısayolu: yalnızca ölçülmüş verilerden en önemli tek cümle. */
  function insightTile(st) {
    const ev = evaluate(st);
    const top = Object.values(ev.regions).sort((a, b) => STATUS[b.status].rank - STATUS[a.status].rank)[0];
    const any = Object.values(ev.regions).some((r) => r.status !== 'gri');
    return h('section', { class: 'tile insight-tile', id: 'today-insight' },
      h('div', { class: 'row-between' }, h('h3', {}, icon('i-explain'), 'Bana Anlat'), any ? h('span', { class: `istatus ${top.status}` }, STATUS[top.status].tr) : null),
      h('p', {}, any ? (top.status === 'sari' || top.status === 'turuncu' ? regionHeadline(top) : 'Ölçülen bölgelerde belirgin bir fark görülmedi.') : 'Vücudunda nerelere dikkat etmen gerektiğini anlatabilmemiz için önce kısa bir duruş/hareket taraması yap.'),
      h('a', { class: 'btn primary', id: 'btn-today-insight', href: any ? '#/anlat' : '#/tarama' }, any ? 'Vücudumda nerelere dikkat etmeliyim?' : 'Taramaya başla'));
  }

  function counter(label, value, onDelta, id) {
    return h('div', { class: 'row' }, h('span', {}, label),
      h('span', { class: 'counter' },
        h('button', { 'aria-label': `${label} azalt`, onclick: () => onDelta(-1), dataset: { habit: `${id}-` } }, '−'),
        h('output', { id: `habit-${id}` }, String(value)),
        h('button', { 'aria-label': `${label} artır`, onclick: () => onDelta(1), dataset: { habit: `${id}+` } }, '+')));
  }

  store.onChange(() => { if (document.body.dataset.screen === 'today') render(); });
  render();
  return { activate: render };
}
