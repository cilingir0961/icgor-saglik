// Kişisel antrenör ekranı (#/antrenman): profil/ön değerlendirme → haftalık plan → oturum → geri bildirim.
// Genel fitness rehberliğidir; fizyoterapi veya tıbbi egzersiz reçetesi değildir.

import { getStore } from '../scan/store.js';
import { h, icon } from '../scan/dom.js';
import { consentForm } from '../ui/consent.js';
import { GOALS, LEVELS, SCREENING, screen, buildPlan, adjustExercise, postpone, applyFeedback, withAvoidedRegions, DAY_NAMES } from './planner.js';
import { BY_ID, TYPES, EQUIPMENT, REGIONS, doseText } from './exercises.js';
import { exerciseImage, img, ring } from '../ui/visuals.js';

const MUSCLE_TR = {
  'mus-head-neck': 'Baş-boyun', 'mus-chest': 'Göğüs', 'mus-abdomen': 'Karın', 'mus-back': 'Sırt', 'mus-leg-foot': 'Bacak-ayak',
  'mus-hip-thigh': 'Kalça-uyluk', 'mus-shoulder-arm': 'Omuz-kol', 'mus-forearm-hand': 'Ön kol', 'mus-pelvic': 'Pelvis tabanı',
  spine: 'Omurga', diaphragm: 'Diyafram',
};
const OPT_EQUIP = ['direnc-bandi', 'dambil', 'bisiklet'];
const SHORT_DAYS = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'];
const FEEL = { kolay: 'kolaydı', uygun: 'uygundu', zor: 'zordu' };

export async function createTrainerScreen() {
  const store = getStore();
  const page = document.getElementById('trainer-page');
  let restTimer = null;
  const dbg = (window.__icgorTrainer = { state: null });

  function show(node, state) {
    clearInterval(restTimer);
    page.replaceChildren(node);
    page.scrollTop = 0;
    dbg.state = state;
    document.body.dataset.trainerState = state;
  }
  const T = () => store.state.trainer;
  const setT = (patch) => store.update('trainer', patch);

  function route() {
    if (!store.state.consent) return show(consentForm(store, route), 'consent');
    const q = new URLSearchParams(location.hash.split('?')[1] ?? '');
    if (!T()?.plan || q.has('profil')) return onboarding();
    if (q.has('oturum')) return session(Number(q.get('oturum')));
    return overview();
  }

  // ---------------- Profil ve ön değerlendirme ----------------
  function onboarding() {
    const p = { level: 'baslangic', goal: 'kondisyon', location: 'ev', equipment: [], limitations: [], daysPerWeek: 3, minutesPerDay: 20, ...(store.state.profile ?? {}) };
    const ans = { ...(p.screening ?? {}) };
    const chipGroup = (name, options, value, multi = false) => h('div', { class: 'chips', role: multi ? 'group' : 'radiogroup', 'aria-label': name, dataset: { group: name } },
      Object.entries(options).map(([k, tr]) => h('button', {
        type: 'button', class: 'chip-btn', dataset: { value: k }, 'aria-pressed': String(multi ? value.includes(k) : value === k),
        onclick: (e) => {
          if (multi) { const on = e.currentTarget.getAttribute('aria-pressed') !== 'true'; e.currentTarget.setAttribute('aria-pressed', String(on)); }
          else for (const b of e.currentTarget.parentElement.children) b.setAttribute('aria-pressed', String(b === e.currentTarget));
        },
      }, tr)));
    const read = (name, multi) => {
      const els = [...page.querySelectorAll(`[data-group="${name}"] [aria-pressed="true"]`)].map((b) => b.dataset.value);
      return multi ? els : els[0];
    };
    const num = (id, label, value, attrs) => h('label', { class: 'field' }, h('span', {}, label), h('input', { id, type: 'number', inputmode: 'numeric', value: value ?? '', ...attrs }));
    show(h('form', { class: 'scan-form', id: 'trainer-onboarding', onsubmit: (e) => {
      e.preventDefault();
      for (const s of SCREENING) ans[s.id] = page.querySelector(`input[name="scr-${s.id}"]:checked`)?.value === 'evet' ? true : page.querySelector(`input[name="scr-${s.id}"]:checked`) ? false : undefined;
      const sc = screen(ans);
      const err = document.getElementById('tr-err');
      if (sc.unanswered) { err.hidden = false; err.textContent = 'Lütfen sağlık sorularının hepsini yanıtlayın.'; return; }
      const prof = store.setProfile({
        age: document.getElementById('tr-age').value, heightCm: document.getElementById('tr-height').value, weightKg: document.getElementById('tr-weight').value,
        level: read('Seviye'), goal: read('Hedef'), location: read('Yer'), equipment: read('Ekipman', true), limitations: read('Kısıtlar', true),
        daysPerWeek: Number(read('Gün')), minutesPerDay: Number(read('Süre')), screening: ans, clearance: sc.clearance,
      });
      setT({ plan: buildPlan(prof, { progress: T()?.progress ?? {} }), paused: false });
      history.replaceState(null, '', '#/antrenman');
      overview(sc.message);
    } },
    h('h2', {}, icon('i-dumbbell'), 'Kişisel antrenman planı'),
    h('p', { class: 'sub' }, 'Yanıtlarınıza göre haftalık bir plan oluşturulur. Plan genel fitness rehberliğidir; tıbbi egzersiz reçetesi değildir.'),
    h('div', { class: 'grid2' },
      num('tr-age', 'Yaş', p.age, { min: 10, max: 110 }), num('tr-height', 'Boy (cm)', p.heightCm, { min: 100, max: 230 }), num('tr-weight', 'Kilo (kg)', p.weightKg, { min: 25, max: 300 })),
    h('h3', {}, 'Fitness seviyesi'), chipGroup('Seviye', LEVELS, p.level),
    h('h3', {}, 'Hedef'), chipGroup('Hedef', GOALS, p.goal),
    h('h3', {}, 'Nerede çalışacaksınız?'), chipGroup('Yer', { ev: 'Evde', salon: 'Spor salonunda' }, p.location),
    h('h3', {}, 'Ekipman (evde)'), chipGroup('Ekipman', Object.fromEntries(OPT_EQUIP.map((k) => [k, EQUIPMENT[k]])), p.equipment ?? [], true),
    h('h3', {}, 'Haftada kaç gün?'), chipGroup('Gün', { 1: '1', 2: '2', 3: '3', 4: '4', 5: '5', 6: '6' }, String(p.daysPerWeek)),
    h('h3', {}, 'Günde ne kadar süre?'), chipGroup('Süre', { 10: '10 dk', 15: '15 dk', 20: '20 dk', 30: '30 dk', 45: '45 dk', 60: '60 dk' }, String(p.minutesPerDay)),
    h('h3', {}, 'Hareket kısıtları / ağrıyan bölgeler'), chipGroup('Kısıtlar', REGIONS, p.limitations ?? [], true),
    h('p', { class: 'sub' }, 'Seçtiğiniz bölgeleri zorlayan hareketler plana hiç eklenmez.'),
    h('h3', {}, 'Sağlık ön soruları'),
    h('p', { class: 'sub' }, 'Genel bir güvenlik taramasıdır, tanı amaçlı değildir. Herhangi biri "evet" ise plan düşük yoğunlukta kalır ve hekime danışmanız önerilir.'),
    SCREENING.map((s) => h('fieldset', { class: 'yn' }, h('legend', {}, s.q),
      h('label', {}, h('input', { type: 'radio', name: `scr-${s.id}`, value: 'evet', checked: ans[s.id] === true }), 'Evet'),
      h('label', {}, h('input', { type: 'radio', name: `scr-${s.id}`, value: 'hayir', checked: ans[s.id] === false }), 'Hayır'))),
    h('p', { class: 'warnline', id: 'tr-err', hidden: true }),
    h('div', { class: 'actions' }, h('button', { class: 'btn primary', type: 'submit', id: 'btn-plan-create' }, 'Planımı oluştur'))), 'onboarding');
  }

  // ---------------- Haftalık plan ----------------
  function overview(notice) {
    const { plan, paused, history: hist } = T();
    const p = plan.profile;
    const todayDow = (new Date().getDay() + 6) % 7;
    // Öne çıkan oturum: bugünkü (tamamlanmamışsa) yoksa haftanın sıradaki tamamlanmamış oturumu
    const open = plan.sessions.map((s, i) => [s, i]).filter(([s]) => s.status !== 'tamamlandi');
    const feat = open.find(([s]) => s.dow === todayDow) ?? open.find(([s]) => s.dow > todayDow) ?? open[0] ?? null;
    const doneN = plan.sessions.filter((s) => s.status === 'tamamlandi').length;
    const mains = (s) => s.items.filter((x) => x.role === 'ana').map((x) => BY_ID[x.id]);
    const hero = feat ? (() => {
      const [s, i] = feat;
      const d = s.items.filter((x) => x.done).length;
      return h('section', { class: 'card hero', id: 'trainer-next' },
        h('div', { class: 'row-between' }, h('p', { class: 'eyebrow' }, s.dow === todayDow ? 'Bugünkü antrenman' : `Sıradaki: ${s.day}`), h('span', { class: 'hero-pct' }, `~${s.estMinutes} dk`)),
        h('h2', { class: 'hero-title' }, `${s.items.length} hareket${d ? ` · ${d} tamamlandı` : ''}`),
        h('ul', { class: 'ex-strip', 'aria-label': 'Ana hareketler' }, mains(s).slice(0, 4).map((e) => h('li', {},
          img(exerciseImage(e), `${e.tr} (atlas modeli)`, { w: 72, h: 72, cls: 'thumb' }), h('span', {}, e.tr)))),
        h('a', { class: `btn primary block${paused ? ' disabled' : ''}`, id: 'btn-trainer-start', href: paused ? '#/antrenman' : `#/antrenman?oturum=${i}`, 'aria-disabled': String(Boolean(paused)) }, d ? 'Devam et' : 'Antrenmanı başlat'));
    })() : h('section', { class: 'card hero' }, h('p', { class: 'eyebrow' }, 'Hafta tamamlandı'), h('h2', { class: 'hero-title' }, 'Bu haftanın bütün oturumlarını bitirdin'),
      h('p', { class: 'sub' }, 'İlerlemene göre yeni hafta planı oluşturabilirsin.'));
    show(h('div', { id: 'trainer-overview', class: 'studio-page' },
      h('header', { class: 'page-head' },
        h('div', {}, h('p', { class: 'eyebrow' }, 'Antrenman'), h('h1', { class: 'display' }, 'Haftalık planım'),
          h('p', { class: 'sub' }, `${GOALS[p.goal]} · ${LEVELS[p.level]} · ${p.location === 'salon' ? 'spor salonu' : 'ev'}`)),
        h('div', { class: 'head-stat', 'aria-label': `Bu hafta ${doneN} / ${plan.sessions.length} oturum tamamlandı` }, ring((doneN / plan.sessions.length) * 100, { size: 52, stroke: 6, cls: 'teal' }), h('span', {}, `${doneN}/${plan.sessions.length}`))),
      notice || plan.note ? h('p', { class: 'notice' }, notice ?? plan.note) : null,
      paused ? h('div', { class: 'card', id: 'trainer-paused' },
        h('p', { class: 'eyebrow warn' }, 'Plan duraklatıldı'),
        h('p', {}, 'Planınız son geri bildiriminiz (baş dönmesi / nefes darlığı / uyuşma / güç kaybı) nedeniyle duraklatıldı. Belirtiler geçtiyse ve gerekirse hekiminize danıştıysanız devam edebilirsiniz.'),
        h('label', { class: 'check' }, h('input', { type: 'checkbox', id: 'chk-resume' }), h('span', {}, 'Kendimi iyi hissediyorum; belirtiler geçti.')),
        h('button', { class: 'btn', id: 'btn-resume', onclick: () => { if (document.getElementById('chk-resume').checked) { setT({ paused: false }); overview(); } } }, 'Plana devam et')) : null,
      hero,
      h('section', { class: 'card' },
        h('div', { class: 'row-between' }, h('h3', { class: 'card-title' }, 'Bu haftanın oturumları'), h('span', { class: 'muted small' }, `haftada ${p.daysPerWeek} gün · ~${p.minutesPerDay} dk`)),
        h('ul', { class: 'sess-list' }, plan.sessions.map((s, i) => {
          const st = s.status === 'tamamlandi' ? 'done' : s.status === 'ertelendi' ? 'later' : s.dow === todayDow ? 'today' : '';
          return h('li', { class: `move-item sess ${st}`, dataset: { session: i } },
            h('span', { class: 'sess-day', 'aria-hidden': 'true' }, SHORT_DAYS[s.dow]),
            h('span', { class: 'grow' },
              h('strong', {}, `${s.day}${s.dow === todayDow ? ' · bugün' : ''}`, s.status === 'tamamlandi' ? h('span', { class: 'badge ok' }, 'tamamlandı') : s.status === 'ertelendi' ? h('span', { class: 'badge' }, 'ertelendi') : null),
              h('small', {}, `~${s.estMinutes} dk · ${mains(s).slice(0, 3).map((e) => e.tr).join(' · ')}${mains(s).length > 3 ? ` +${mains(s).length - 3}` : ''}`)),
            h('span', { class: 'sess-acts' },
              h('a', { class: `chip-btn${paused ? ' disabled' : ''}`, href: paused ? '#/antrenman' : `#/antrenman?oturum=${i}`, 'aria-disabled': String(Boolean(paused)) }, s.status === 'tamamlandi' ? 'Göz at' : 'Başlat'),
              s.status !== 'tamamlandi' ? h('button', { class: 'chip-btn', onclick: () => { const r = postpone(T().plan, i); setT({ plan: r.plan }); overview(r.ok ? `${plan.sessions[i].day} oturumu ertelendi.` : r.message); } }, 'Ertele') : null));
        })),
        h('p', { class: 'small muted' }, plan.restTip)),
      hist?.length ? h('section', { class: 'card' }, h('h3', { class: 'card-title' }, 'Son antrenmanlar'), h('ul', { class: 'history' }, hist.slice(-5).reverse().map((x) => h('li', {},
        h('strong', {}, new Date(x.date).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' })), ` · ${x.done}/${x.total} hareket · ${FEEL[x.feedback.feeling] ?? x.feedback.feeling}${x.feedback.pain?.length ? ` · ağrı: ${x.feedback.pain.map((k) => REGIONS[k] ?? k).join(', ')}` : ''}`)))) : null,
      h('div', { class: 'actions' },
        h('a', { class: 'btn', href: '#/antrenman?profil=1' }, 'Profili / hedefi düzenle'),
        h('button', { class: 'btn ghost', id: 'btn-new-week', onclick: () => { setT({ plan: buildPlan(store.state.profile, { progress: T().progress }) }); overview('Yeni hafta planı ilerlemenize göre oluşturuldu.'); } }, 'Yeni hafta planı')),
      h('p', { class: 'foot-note' }, 'Genel fitness rehberliğidir; fizyoterapi veya tıbbi egzersiz reçetesi değildir. Görseller genel atlas modelidir.'),
    ), 'overview');
  }

  // ---------------- Oturum ----------------
  function session(sIdx) {
    const plan = T().plan;
    const s = plan.sessions[sIdx];
    if (!s || T().paused) return overview();
    const done = s.items.filter((x) => x.done).length;
    const pct = Math.round((done / s.items.length) * 100);
    const set = (fn) => { const p = structuredClone(T().plan); fn(p.sessions[sIdx]); setT({ plan: p }); session(sIdx); };
    show(h('div', { id: 'trainer-session', class: 'studio-page', dataset: { session: sIdx } },
      h('header', { class: 'page-head' },
        h('div', {}, h('a', { class: 'back-link', href: '#/antrenman' }, '‹ Plana dön'), h('h1', { class: 'display' }, `${s.day} antrenmanı`),
          h('p', { class: 'sub' }, `~${s.estMinutes} dk · ${done}/${s.items.length} hareket tamamlandı`)),
        h('div', { class: 'head-stat' }, ring(pct, { size: 52, stroke: 6, cls: 'teal' }), h('span', {}, `%${pct}`))),
      h('div', { class: 'meter teal', role: 'progressbar', 'aria-valuenow': pct, 'aria-valuemin': 0, 'aria-valuemax': 100, 'aria-label': 'Antrenman ilerlemesi' }, h('span', { dataset: { w: pct } })),
      h('p', { class: 'rel-note safety' }, icon('i-info'), 'Ağrı, baş dönmesi, göğüs ağrısı veya olağan dışı nefes darlığında hemen durun.'),
      h('div', { class: 'ex-list' }, s.items.map((it, i) => exerciseCard(it, i, sIdx, set))),
      h('div', { class: 'actions' },
        h('button', { class: 'btn primary block', id: 'btn-session-finish', onclick: () => feedback(sIdx) }, 'Antrenmanı bitir ve değerlendir'),
        h('a', { class: 'btn ghost', href: '#/antrenman' }, 'Plana dön'))), 'session');
    for (const el of page.querySelectorAll('[data-w]')) el.style.width = `${el.dataset.w}%`;
  }

  function exerciseCard(it, i, sIdx, set) {
    const e = BY_ID[it.id];
    const role = { isinma: 'Isınma', ana: TYPES[e.type], soguma: 'Soğuma' }[it.role];
    return h('article', { class: `card ex ${it.done ? 'done' : ''}`, dataset: { ex: it.id, idx: i } },
      h('div', { class: 'ex-head' },
        img(exerciseImage(e), `${e.tr}: çalışan kas grupları (genel atlas modeli${e.motion ? ', SİMÜLASYON pozu' : ''})`, { w: 72, h: 72, cls: 'thumb' }),
        h('div', { class: 'grow' },
          h('div', { class: 'row-between' }, h('span', { class: 'muted small' }, `${i + 1} / ${T().plan.sessions[sIdx].items.length}`), h('span', { class: 'badge info' }, role)),
          h('h3', {}, e.tr),
          h('p', { class: 'big-dose' }, doseText(it.dose)))),
      it.coach ? h('p', { class: 'sub', dataset: { coach: it.coach.reps } }, `Kamera koçu: ${it.coach.reps} tekrar${it.coach.reliable ? '' : ' (yaklaşık)'}`) : null,
      h('p', {}, e.desc),
      e.cues.length ? h('ul', { class: 'cues' }, e.cues.map((c) => h('li', {}, c))) : null,
      e.safety.length ? h('p', { class: 'warnline' }, `Güvenlik: ${e.safety.join(' · ')}`) : null,
      h('p', { class: 'small muted' }, `Hedef kaslar: ${e.muscles.map((m) => MUSCLE_TR[m] ?? m).join(', ')} · Zorluk ${'●'.repeat(e.level)}${'○'.repeat(3 - e.level)}`),
      h('div', { class: 'ex-main' },
        h('button', { class: `btn${it.done ? ' done-btn' : ' primary'}`, 'aria-pressed': String(it.done), dataset: { act: 'done' }, onclick: () => set((ss) => { ss.items[i].done = !ss.items[i].done; }) }, it.done ? 'Tamamlandı ✓' : 'Tamamlandı'),
        e.camera && e.camera !== 'walk' ? h('button', { class: 'btn', dataset: { act: 'coach' }, onclick: () => coach(e, sIdx, i) }, icon('i-camera'), 'Kamerayla say') : null),
      h('div', { class: 'chips tight' },
        it.dose.restS ? h('button', { class: 'chip-btn', onclick: (ev) => rest(ev.currentTarget, it.dose.restS) }, `Dinlenme ${it.dose.restS} sn`) : null,
        h('button', { class: 'chip-btn', dataset: { act: 'easier' }, onclick: () => adjust(sIdx, i, 'easier') }, 'Kolaylaştır'),
        h('button', { class: 'chip-btn', dataset: { act: 'harder' }, onclick: () => adjust(sIdx, i, 'harder') }, 'Zorlaştır'),
        h('button', { class: 'chip-btn', dataset: { act: 'replace' }, onclick: () => adjust(sIdx, i, 'replace') }, 'Değiştir'),
        h('button', { class: 'chip-btn', dataset: { act: '3d' }, onclick: () => show3D(e) }, '3B kaslar')));
  }

  function adjust(sIdx, i, action) {
    const r = adjustExercise(T().plan, sIdx, i, action, T().progress);
    setT({ plan: r.plan });
    session(sIdx);
  }

  function rest(btn, sec) {
    clearInterval(restTimer);
    let left = sec;
    const label = btn.textContent;
    btn.textContent = `Dinlenme: ${left} sn`;
    restTimer = setInterval(() => {
      left -= 1;
      btn.textContent = left > 0 ? `Dinlenme: ${left} sn` : 'Dinlenme bitti';
      if (left <= 0) { clearInterval(restTimer); setTimeout(() => { btn.textContent = label; }, 2000); }
    }, 1000);
  }

  function show3D(e) {
    try {
      sessionStorage.setItem('icgor.highlight', JSON.stringify({
        topic: 'egzersiz', title: e.tr, ids: e.muscles,
        anatomy: `${e.tr}: hedef kas grupları vurgulandı. ${e.motion ? 'Eklem hareketi basitleştirilmiş bir SİMÜLASYONDUR (gövde eğimi ve ayak teması modellenmez).' : ''} Genel atlas modelidir; sizin kaslarınızı göstermez.`,
        motion: e.motion, twin: null,
      }));
    } catch { /* özel mod */ }
    location.hash = '#/anatomi?ikiz';
  }

  async function coach(e, sIdx, i) {
    const mod = await import('./coach-ui.js');
    mod.openCoach({ exercise: e, page, onClose: (result) => {
      if (result?.reps) {
        const p = structuredClone(T().plan);
        const date = new Date().toISOString();
        p.sessions[sIdx].items[i].coach = { reps: result.reps, date, reliable: result.reliable };
        // Gelişim paneli için yalnızca sayısal özet (görüntü yok); karşılaştırma aynı hareket türü içinde
        const sd = result.summary?.sides, lead = sd ? (sd.L.reps >= sd.R.reps ? sd.L : sd.R) : null;
        const entry = { date, id: e.id, kind: e.camera, tr: e.tr, reps: result.reps, reliable: result.reliable, extreme: result.reliable && lead?.extreme.value != null ? lead.extreme : null,
          asym: result.reliable ? result.summary?.asym ?? null : null, fps: result.summary?.fps ?? null,
          sides: result.reliable && sd ? { L: { value: sd.L.extreme.value, u: sd.L.extreme.u }, R: { value: sd.R.extreme.value, u: sd.R.extreme.u } } : null };
        setT({ plan: p, coachLog: [...(T().coachLog ?? []), entry].slice(-200) });
      }
      session(sIdx);
    } });
  }

  // ---------------- Geri bildirim ----------------
  function feedback(sIdx) {
    const s = T().plan.sessions[sIdx];
    show(h('form', { class: 'scan-form', id: 'trainer-feedback', onsubmit: (ev) => {
      ev.preventDefault();
      const fb = {
        feeling: page.querySelector('[data-group="his"] [aria-pressed="true"]')?.dataset.value ?? 'uygun',
        rpe: Number(document.getElementById('fb-rpe').value),
        pain: [...page.querySelectorAll('[data-group="agri"] [aria-pressed="true"]')].map((b) => b.dataset.value),
        dizziness: document.getElementById('fb-dizzy').checked,
        breathless: document.getElementById('fb-breath').checked,
        chestPain: document.getElementById('fb-chest').checked,
        numbness: document.getElementById('fb-numb').checked,
        weakness: document.getElementById('fb-weak').checked,
      };
      const doneIds = s.items.filter((x) => x.done).map((x) => x.id);
      const res = applyFeedback(T().progress, fb, doneIds.length ? doneIds : s.items.map((x) => x.id));
      const plan = structuredClone(T().plan);
      plan.sessions[sIdx].status = 'tamamlandi';
      let profile = store.state.profile;
      if (res.avoid.length) {
        profile = store.setProfile(withAvoidedRegions(profile, res.avoid));
      }
      const entry = { date: new Date().toISOString(), sessionIdx: sIdx, done: doneIds.length, total: s.items.length, feedback: fb, messages: res.messages };
      setT({ progress: res.progress, plan: res.avoid.length ? buildPlan(profile, { progress: res.progress }) : plan, paused: res.paused, history: [...(T().history ?? []), entry] });
      result(res);
    } },
    h('h2', {}, 'Antrenman nasıl geçti?'),
    h('div', { class: 'chips', 'data-group': 'his', role: 'radiogroup', 'aria-label': 'Genel his' },
      [['kolay', 'Kolaydı'], ['uygun', 'Uygundu'], ['zor', 'Zordu']].map(([k, t]) => h('button', { type: 'button', class: 'chip-btn', 'aria-pressed': String(k === 'uygun'), dataset: { value: k }, onclick: (e) => { for (const b of e.currentTarget.parentElement.children) b.setAttribute('aria-pressed', String(b === e.currentTarget)); } }, t))),
    h('label', { class: 'field' }, h('span', {}, 'Zorlanma derecesi (1 çok hafif – 10 en zor)'), h('input', { id: 'fb-rpe', type: 'range', min: 1, max: 10, value: 6 })),
    h('h3', {}, 'Ağrı oldu mu? (bölge seçin)'),
    h('div', { class: 'chips', 'data-group': 'agri', role: 'group', 'aria-label': 'Ağrıyan bölgeler' },
      Object.entries(REGIONS).filter(([k]) => k !== 'denge').map(([k, t]) => h('button', { type: 'button', class: 'chip-btn', 'aria-pressed': 'false', dataset: { value: k }, onclick: (e) => e.currentTarget.setAttribute('aria-pressed', String(e.currentTarget.getAttribute('aria-pressed') !== 'true')) }, t))),
    h('label', { class: 'check' }, h('input', { type: 'checkbox', id: 'fb-dizzy' }), h('span', {}, 'Baş dönmesi oldu')),
    h('label', { class: 'check' }, h('input', { type: 'checkbox', id: 'fb-breath' }), h('span', {}, 'Olağan dışı nefes darlığı oldu')),
    h('label', { class: 'check' }, h('input', { type: 'checkbox', id: 'fb-numb' }), h('span', {}, 'Uyuşma veya karıncalanma oldu')),
    h('label', { class: 'check' }, h('input', { type: 'checkbox', id: 'fb-weak' }), h('span', {}, 'Kolda/bacakta güç kaybı hissettim')),
    h('label', { class: 'check' }, h('input', { type: 'checkbox', id: 'fb-chest' }), h('span', {}, 'Göğüs ağrısı veya baskı hissi oldu')),
    h('div', { class: 'actions' }, h('button', { class: 'btn primary', type: 'submit', id: 'btn-feedback-save' }, 'Kaydet'))), 'feedback');
  }

  function result(res) {
    show(h('div', { class: 'scan-form', id: 'trainer-result' },
      h('h2', {}, res.urgent ? 'Hemen durun' : res.paused ? 'Plan duraklatıldı' : 'Kaydedildi'),
      res.messages.map((m) => h('p', { class: res.urgent || res.paused || res.avoid.length ? 'notice' : '' }, m)),
      res.urgent ? h('a', { class: 'btn danger big', href: 'tel:112' }, '112\'yi ara') : null,
      h('div', { class: 'actions' }, h('a', { class: 'btn primary', href: '#/antrenman' }, 'Plana dön'), h('a', { class: 'btn ghost', href: '#/gelisim' }, 'Gelişimim'))), 'result');
  }

  store.onChange(() => { if (document.body.dataset.screen === 'trainer' && ['overview'].includes(dbg.state)) { /* plan ekranı kendini zaten yeniler */ } });
  route();
  return { activate: route };
}
