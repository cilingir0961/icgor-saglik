// "Bugün" — kişisel günlük kontrol paneli (İçGör Studio, açık tema). Tek birincil eylem: günün antrenmanı.
// Tüm veriler yerel depodan; tıbbi değerlendirme içermez. Görseller projenin 3B atlasından (assets/ui).

import { getStore } from '../scan/store.js';
import { h, s, icon, fmt } from '../scan/dom.js';
import { dayKey, adaptiveGoal, weekStats, lastDays } from '../activity/steps.js';
import { BY_ID, doseText } from '../fitness/exercises.js';
import { DAY_NAMES } from '../fitness/planner.js';
import { evaluate, regionHeadline } from '../insight/evaluate.js';
import { STATUS } from '../insight/regions.js';
import { exerciseImage, BODY_FRONT, img } from '../ui/visuals.js';

const QUICK = ['Evde ekipmansız 20 dakikalık program hazırla', 'Omuzlarım öne doğru duruyor, hangi hareketleri yapabilirim?', 'Uyku düzenim için ne önerirsin?'];
const SHORT_DAYS = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'];

/** İlerleme halkası (SVG; CSP uyumlu: öznitelikler, satır içi stil yok). */
export function ring(pct, { size = 64, stroke = 7, cls = '' } = {}) {
  const r = (size - stroke) / 2, c = 2 * Math.PI * r, p = Math.max(0, Math.min(100, pct));
  return s('svg', { viewBox: `0 0 ${size} ${size}`, class: `ring ${cls}`, width: size, height: size, 'aria-hidden': 'true' },
    s('circle', { cx: size / 2, cy: size / 2, r, class: 'ring-track', 'stroke-width': stroke }),
    s('circle', { cx: size / 2, cy: size / 2, r, class: 'ring-value', 'stroke-width': stroke, 'stroke-dasharray': `${(c * p) / 100} ${c}`, transform: `rotate(-90 ${size / 2} ${size / 2})` }));
}

function greeting(d) {
  const hh = d.getHours();
  return hh < 5 ? 'İyi geceler' : hh < 12 ? 'Günaydın' : hh < 18 ? 'İyi günler' : 'İyi akşamlar';
}

export async function createTodayScreen() {
  const store = getStore();
  const page = document.getElementById('today-page');

  function render() {
    const st = store.state;
    const now = new Date();
    const todayDow = (now.getDay() + 6) % 7; // Pazartesi = 0
    const plan = st.trainer?.plan;
    const session = plan?.sessions.find((x) => x.dow === todayDow) ?? null;
    const next = plan?.sessions.find((x) => x.dow > todayDow) ?? plan?.sessions[0] ?? null;
    const days = st.activity?.days ?? {};
    const today = days[dayKey(now)]?.steps ?? 0;
    const goalInfo = st.activity?.goalMode === 'manual' && st.activity?.goal ? { goal: st.activity.goal, basis: 'Kendi belirlediğin hedef.' } : adaptiveGoal(days, now, { goalType: st.profile?.goal });
    const pct = Math.min(100, Math.round((today / goalInfo.goal) * 100));
    const ws = weekStats(days, now);
    const demo = Object.values(days).some((d) => d.source === 'demo');
    const hb = st.activity?.habits?.[dayKey(now)] ?? { water: 0, sleepH: null, breaks: 0 };
    const lastScan = st.scans?.at(-1);
    const hist = st.trainer?.history ?? [];
    const doneThisWeek = hist.filter((x) => Date.now() - new Date(x.date).getTime() < 7 * 86400000).length;
    const doneDays = new Set(hist.map((x) => dayKey(new Date(x.date))));

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

    // Hafta şeridi: bu haftanın günleri, planlı antrenman noktası, tamamlanan gün işareti
    const monday = new Date(now); monday.setHours(0, 0, 0, 0); monday.setDate(monday.getDate() - todayDow);
    const planned = new Set((plan?.sessions ?? []).map((x) => x.dow));
    const week = h('ol', { class: 'week', 'aria-label': 'Bu hafta' }, SHORT_DAYS.map((d, i) => {
      const dt = new Date(monday); dt.setDate(monday.getDate() + i);
      const done = doneDays.has(dayKey(dt));
      return h('li', { class: `${i === todayDow ? 'today' : ''} ${done ? 'done' : ''}`, 'aria-current': i === todayDow ? 'date' : null,
        'aria-label': `${DAY_NAMES[i]} ${dt.getDate()}${planned.has(i) ? ', antrenman günü' : ''}${done ? ', tamamlandı' : ''}` },
      h('span', { class: 'wd' }, d), h('span', { class: 'dn' }, String(dt.getDate())), h('i', { class: planned.has(i) ? 'dot' : 'dot none' }));
    }));

    const mainEx = session?.items.filter((x) => x.role === 'ana') ?? [];
    const nextItem = session?.items.find((x) => !x.done) ?? null;
    const sessDone = session ? session.items.filter((x) => x.done).length : 0;
    const sessPct = session ? Math.round((sessDone / session.items.length) * 100) : 0;
    const sessIdx = session ? plan.sessions.indexOf(session) : -1;

    const hero = h('section', { class: 'card hero', id: 'today-workout' },
      !plan ? [
        h('p', { class: 'eyebrow' }, 'Kişisel plan'),
        h('h2', { class: 'hero-title' }, 'Sana uygun haftalık planı oluşturalım'),
        h('p', { class: 'sub' }, 'Seviyen, zamanın ve ekipmanına göre birkaç soru. Ağrıyan bölgeleri zorlayan hareketler plana eklenmez.'),
        h('a', { class: 'btn primary block', href: '#/antrenman' }, 'Plan oluştur')]
        : st.trainer.paused ? [
          h('p', { class: 'eyebrow warn' }, 'Plan duraklatıldı'),
          h('h2', { class: 'hero-title' }, 'Önce kendini iyi hisset'),
          h('p', { class: 'sub' }, 'Son geri bildirimin nedeniyle plan durduruldu. Belirtiler geçince devam edebilirsin.'),
          h('a', { class: 'btn block', href: '#/antrenman' }, 'Ayrıntılar')]
          : session ? [
            h('div', { class: 'row-between' }, h('p', { class: 'eyebrow' }, 'Bugünkü planın'), h('span', { class: 'hero-pct' }, `%${sessPct}`)),
            h('h2', { class: 'hero-title' }, `${session.items.length} hareket · ~${session.estMinutes} dk`),
            h('p', { class: 'sub' }, `${sessDone} / ${session.items.length} tamamlandı${session.status === 'tamamlandi' ? ' · bugün bitti ✓' : ''}`),
            h('div', { class: 'meter teal', role: 'progressbar', 'aria-valuemin': 0, 'aria-valuemax': 100, 'aria-valuenow': sessPct, 'aria-label': 'Bugünkü antrenman ilerlemesi' }, h('span', { dataset: { w: sessPct } })),
            h('a', { class: 'btn primary block', id: 'btn-today-start', href: `#/antrenman?oturum=${sessIdx}` }, session.status === 'tamamlandi' ? 'Tekrar göz at' : sessDone ? 'Şimdi devam et' : 'Antrenmanı başlat')]
            : [
              h('p', { class: 'eyebrow' }, 'Bugün dinlenme günü'),
              h('h2', { class: 'hero-title' }, 'Toparlanma da antrenmanın parçası'),
              h('p', { class: 'sub' }, plan.restTip),
              next ? h('p', { class: 'sub' }, `Sıradaki antrenman: ${DAY_NAMES[next.dow]} · ~${next.estMinutes} dk`) : null,
              h('a', { class: 'btn block', href: '#/antrenman' }, 'Haftalık planım')]);

    const nextCard = nextItem ? h('a', { class: 'card row-card', id: 'today-next', href: `#/antrenman?oturum=${sessIdx}` },
      img(exerciseImage(BY_ID[nextItem.id]), `${BY_ID[nextItem.id].tr} (atlas modeli, SİMÜLASYON pozu)`, { w: 72, h: 72, cls: 'thumb' }),
      h('span', { class: 'grow' }, h('small', { class: 'muted' }, 'Sıradaki egzersiz'), h('strong', {}, BY_ID[nextItem.id].tr),
        h('small', {}, `${doseText(nextItem.dose)} · ${['', 'Kolay', 'Orta', 'Zor'][BY_ID[nextItem.id].level]} seviye`)),
      icon('i-chevron')) : null;

    page.replaceChildren(h('div', { class: 'today' },
      h('header', { class: 'page-head' },
        h('div', {}, h('h1', { class: 'display' }, greeting(now)),
          h('p', { class: 'sub' }, now.toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', weekday: 'long' }))),
        h('a', { class: 'icon-btn round', href: '#/bildirimler', 'aria-label': 'Hatırlatmalar' }, icon('i-bell'))),
      week,
      hero,
      nextCard,
      h('div', { class: 'grid2 stats' },
        h('section', { class: 'card stat', id: 'today-steps' },
          h('div', { class: 'stat-head' }, h('span', { class: 'stat-ico' }, icon('i-walk')), h('span', {}, 'Adım'), demo ? h('span', { class: 'badge' }, 'demo') : null),
          h('div', { class: 'stat-body' }, ring(pct, { cls: 'teal' }),
            h('div', {}, h('strong', { class: 'big', id: 'today-steps-n' }, fmt(today)), h('small', { class: 'muted' }, `hedef ${fmt(goalInfo.goal)}`))),
          h('div', { class: 'chips tight' },
            h('button', { class: 'chip-btn', id: 'btn-steps-500', onclick: () => addSteps(500), 'aria-label': '500 adım ekle' }, '+500'),
            h('button', { class: 'chip-btn', onclick: () => addSteps(1000), 'aria-label': '1000 adım ekle' }, '+1.000'))),
        h('section', { class: 'card stat', id: 'today-week' },
          h('div', { class: 'stat-head' }, h('span', { class: 'stat-ico' }, icon('i-dumbbell')), h('span', {}, 'Bu hafta')),
          h('div', { class: 'stat-body' }, ring(plan ? (doneThisWeek / plan.sessions.length) * 100 : 0),
            h('div', {}, h('strong', { class: 'big' }, plan ? `${doneThisWeek}/${plan.sessions.length}` : '—'), h('small', { class: 'muted' }, 'antrenman'))),
          h('small', { class: 'muted' }, ws.avg != null ? `7 gün ort. ${fmt(ws.avg)} adım` : 'Adım kaydı yok'))),
      insightCard(st),
      h('section', { class: 'card', id: 'today-habits' },
        h('h3', { class: 'card-title' }, 'Günlük alışkanlıklar'),
        counter('Su', 'bardak', hb.water ?? 0, (d) => habit('water', d), 'water'),
        counter('Uyku', 'saat', hb.sleepH ?? '—', (d) => habit('sleepH', d), 'sleep'),
        counter('Hareket molası', 'kez', hb.breaks ?? 0, (d) => habit('breaks', d), 'breaks')),
      h('section', { class: 'card', id: 'today-ai' },
        h('h3', { class: 'card-title' }, icon('i-chat'), 'Asistana sor'),
        h('div', { class: 'chips' }, QUICK.map((q) => h('a', { class: 'chip-btn', href: `#/asistan?q=${encodeURIComponent(q)}` }, q)))),
      h('a', { class: 'card row-card', id: 'today-scan', href: '#/tarama' },
        h('span', { class: 'stat-ico' }, icon('i-ruler')),
        h('span', { class: 'grow' }, h('strong', {}, 'Duruş ve hareket taraması'),
          h('small', {}, lastScan ? `Son tarama: ${new Date(lastScan.date).toLocaleDateString('tr-TR')}` : 'Kameranla 2 dakikalık farkındalık taraması')),
        icon('i-chevron')),
      st.notify?.enabled ? null : h('a', { class: 'card row-card', id: 'today-notify', href: '#/bildirimler' },
        h('span', { class: 'stat-ico' }, icon('i-bell')),
        h('span', { class: 'grow' }, h('strong', {}, 'Hatırlatmalar'), h('small', {}, 'Saatleri sen seç; izin vermeden bildirim gönderilmez.')),
        icon('i-chevron')),
      h('p', { class: 'foot-note' }, 'İçGör eğitim amaçlı bir hareket ve farkındalık uygulamasıdır; tıbbi değerlendirme veya teşhis yapmaz.')));
    for (const el of page.querySelectorAll('[data-w]')) el.style.width = `${el.dataset.w}%`;
  }

  /** "Bana Anlat" kartı: küçük vücut görseli, renk dağılımı ve en önemli tek cümle (yalnızca ölçülmüş veri). */
  function insightCard(st) {
    const ev = evaluate(st);
    const regs = Object.values(ev.regions);
    const top = [...regs].sort((a, b) => STATUS[b.status].rank - STATUS[a.status].rank)[0];
    const any = regs.some((r) => r.status !== 'gri');
    const count = (k) => regs.filter((r) => r.status === k).length;
    return h('section', { class: 'card insight-card', id: 'today-insight' },
      h('div', { class: 'ic-body' },
        img(BODY_FRONT, 'Genel atlas modeli (kişiye ait değil)', { w: 64, h: 114, cls: 'ic-figure' }),
        h('div', { class: 'grow' },
          h('div', { class: 'row-between' }, h('h3', { class: 'card-title' }, icon('i-explain'), 'Bana Anlat'), any ? h('span', { class: `istatus ${top.status}` }, STATUS[top.status].tr) : null),
          h('p', {}, any ? (top.status === 'sari' || top.status === 'turuncu' ? regionHeadline(top) : 'Ölçülen bölgelerde belirgin bir fark görülmedi.') : 'Vücudunda nerelere dikkat etmen gerektiğini anlatabilmemiz için önce kısa bir duruş/hareket taraması yap.'),
          any ? h('ul', { class: 'ic-counts', 'aria-label': 'Bölge dağılımı' }, ['yesil', 'sari', 'turuncu', 'gri'].filter((k) => count(k)).map((k) => h('li', {}, h('span', { class: `swatch ${k}` }), `${count(k)}`))) : null)),
      h('a', { class: 'btn primary block', id: 'btn-today-insight', href: any ? '#/anlat' : '#/tarama' }, any ? 'Vücudumda nerelere dikkat etmeliyim?' : 'Taramaya başla'));
  }

  function counter(label, unit, value, onDelta, id) {
    return h('div', { class: 'habit-row' }, h('span', {}, h('strong', {}, label), h('small', { class: 'muted' }, ` ${unit}`)),
      h('span', { class: 'counter' },
        h('button', { 'aria-label': `${label} azalt`, onclick: () => onDelta(-1), dataset: { habit: `${id}-` } }, '−'),
        h('output', { id: `habit-${id}` }, String(value)),
        h('button', { 'aria-label': `${label} artır`, onclick: () => onDelta(1), dataset: { habit: `${id}+` } }, '+')));
  }

  store.onChange(() => { if (document.body.dataset.screen === 'today') render(); });
  render();
  return { activate: render };
}
