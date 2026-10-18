// Hatırlatma ayarları (#/bildirimler). İzin yalnızca kullanıcı düğmeye dokununca istenir. Gerçek sınırlar
// ekranda açıkça yazılır: bu sürüm uygulama kapalıyken bildirim gönderemez (Web Push sunucusu yok).

import { getStore } from '../scan/store.js';
import { h, icon } from '../scan/dom.js';
import { TYPES, defaults, nextEvent, validTime, message } from './schedule.js';
import { start, stop, notify, planContext } from './runtime.js';
import { pageHead } from '../ui/visuals.js';

const DOW = ['Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi', 'Pazar'];

export function platformInfo(g = globalThis) {
  const ua = g.navigator?.userAgent ?? '';
  const ios = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && (g.navigator?.maxTouchPoints ?? 0) > 1);
  const standalone = Boolean(g.matchMedia?.('(display-mode: standalone)').matches || g.navigator?.standalone);
  const supported = 'Notification' in g;
  return { ios, standalone, supported, permission: supported ? g.Notification.permission : 'unsupported' };
}

export async function createNotifyScreen() {
  const store = getStore();
  const page = document.getElementById('notify-page');
  const N = () => ({ ...defaults(), ...(store.state.notify ?? {}) });
  const save = (patch) => { store.update('notify', { ...N(), ...patch }); };

  function render() {
    const n = N();
    const p = platformInfo();
    const nx = nextEvent(n, new Date(), planContext(store.state));
    page.replaceChildren(h('div', { class: 'studio-page' },
      pageHead('Bildirimler', 'Hatırlatmalar', 'Saatleri sen seçersin; izin vermeden hiçbir bildirim gönderilmez.'),
      h('section', { class: 'tile', id: 'notify-limits' },
        h('h3', {}, icon('i-bell'), 'Nasıl çalışır?'),
        h('ul', { class: 'small plain' },
          h('li', {}, 'Hatırlatmalar yalnızca İçGör açıkken (ön planda veya arka plandaki sekmede) gösterilir. Uygulama tamamen kapalıyken bildirim gelmez; bunun için bir bildirim sunucusu (Web Push) gerekir ve bu sürümde yoktur.'),
          h('li', {}, 'iPhone/iPad: bildirimler yalnızca iOS 16.4 veya üstünde, Safari\'den “Ana Ekrana Ekle” ile kurulan uygulamada desteklenir. Safari sekmesinde desteklenmez.'),
          h('li', {}, 'Android/masaüstü Chrome: izin verirseniz uygulama açıkken çalışır.'),
          h('li', {}, 'Bildirim metinleri genel tutulur; kilit ekranında ölçüm veya sağlık ayrıntısı gösterilmez.'))),
      permissionTile(p, n),
      h('section', { class: 'tile' },
        h('div', { class: 'row' }, h('h3', {}, 'Hatırlatmalar açık'),
          h('label', { class: 'switch' }, h('input', { type: 'checkbox', id: 'notify-enabled', checked: n.enabled, disabled: p.permission !== 'granted' && !n.enabled, onchange: (e) => { save({ enabled: e.target.checked }); if (e.target.checked) start(); else stop(); render(); } }), h('span', {}, n.enabled ? 'Açık' : 'Kapalı'))),
        n.enabled && nx ? h('p', { class: 'sub', id: 'notify-next' }, `Sıradaki: ${TYPES[nx.type].tr} — ${nx.at.toLocaleString('tr-TR', { weekday: 'long', hour: '2-digit', minute: '2-digit' })}`) : null,
        h('div', { class: 'type-list' }, Object.entries(TYPES).map(([k, t]) => typeRow(k, t, n))),
        h('div', { class: 'row' }, h('span', {}, 'Sessiz saatler'),
          h('span', {}, timeInput('quiet-from', n.quiet.from, (v) => save({ quiet: { ...N().quiet, from: v } })), ' – ', timeInput('quiet-to', n.quiet.to, (v) => save({ quiet: { ...N().quiet, to: v } })))),
        h('div', { class: 'row' }, h('label', { for: 'notify-max' }, 'Günde en fazla'),
          h('select', { id: 'notify-max', onchange: (e) => save({ maxPerDay: Number(e.target.value) }) }, [1, 2, 3, 4, 5, 6, 8].map((x) => h('option', { value: x, selected: x === n.maxPerDay }, `${x} bildirim`))))),
      h('div', { class: 'actions' },
        h('button', { class: 'btn ghost', id: 'btn-notify-off', onclick: () => { save({ enabled: false }); stop(); render(); } }, 'Tümünü kapat'))));
  }

  function permissionTile(p, n) {
    let body;
    if (!p.supported) body = h('p', { class: 'warnline', id: 'notify-unsupported' }, p.ios && !p.standalone ? 'Bu tarayıcı sekmesinde bildirim desteklenmiyor. iPhone\'da önce Safari → Paylaş → “Ana Ekrana Ekle” ile kurun (iOS 16.4+).' : 'Bu tarayıcı bildirimleri desteklemiyor.');
    else if (p.permission === 'granted') body = [h('p', { id: 'notify-perm' }, 'İzin verildi.'), h('button', { class: 'btn small', id: 'btn-notify-test', onclick: async () => { const ok = await notify({ ...message('hareket'), tag: 'test' }); document.getElementById('notify-test-res').textContent = ok ? 'Deneme bildirimi gönderildi.' : 'Gösterilemedi.'; } }, 'Deneme bildirimi'), h('span', { class: 'small muted', id: 'notify-test-res' })];
    else if (p.permission === 'denied') body = h('p', { class: 'warnline', id: 'notify-perm' }, 'Bildirim izni reddedilmiş. Açmak için tarayıcı/telefon ayarlarından izin vermeniz gerekir; uygulama tekrar soramaz.');
    else body = [h('p', { id: 'notify-perm' }, 'Hatırlatma göstermek için izniniz gerekir. İzin vermezseniz hiçbir bildirim gönderilmez.'),
      h('button', { class: 'btn primary', id: 'btn-notify-permission', onclick: async () => {
        const r = await Notification.requestPermission();
        save({ permission: r, enabled: r === 'granted' ? true : n.enabled });
        if (r === 'granted') start();
        render();
      } }, 'Bildirim izni ver')];
    return h('section', { class: 'tile', id: 'notify-permission' }, h('h3', {}, 'İzin'), body);
  }

  function typeRow(k, t, n) {
    const cfg = n.types[k] ?? t.default;
    const set = (patch) => save({ types: { ...N().types, [k]: { ...cfg, ...patch } } });
    return h('div', { class: 'type-row', dataset: { type: k } },
      h('label', { class: 'share-item' },
        h('input', { type: 'checkbox', id: `nt-${k}`, checked: cfg.on, onchange: (e) => { set({ on: e.target.checked }); render(); } }),
        h('span', {}, h('strong', {}, t.tr), h('small', {}, t.desc))),
      cfg.on ? h('div', { class: 'type-opts' },
        k === 'hareket'
          ? [timeInput(`nt-${k}-from`, cfg.from, (v) => set({ from: v })), ' – ', timeInput(`nt-${k}-to`, cfg.to, (v) => set({ to: v })),
            h('select', { 'aria-label': 'Aralık', onchange: (e) => set({ intervalMin: Number(e.target.value) }) }, [30, 45, 60, 90, 120].map((m) => h('option', { value: m, selected: m === cfg.intervalMin }, `her ${m} dk`)))]
          : [k === 'haftalik' ? h('select', { 'aria-label': 'Gün', onchange: (e) => set({ dow: Number(e.target.value) }) }, DOW.map((d, i) => h('option', { value: i, selected: i === (cfg.dow ?? 6) }, d))) : null,
            timeInput(`nt-${k}-time`, cfg.time, (v) => set({ time: v }))]) : null);
  }

  function timeInput(id, value, onSet) {
    return h('input', { type: 'time', id, value, 'aria-label': id, onchange: (e) => { if (validTime(e.target.value)) { onSet(e.target.value); render(); } } });
  }

  if (store.state.notify?.enabled) start();
  return { activate: render };
}
