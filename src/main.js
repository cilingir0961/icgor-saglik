// Uygulama girişi: ekran yönlendirme (hash), ortak diyaloglar ve ekranların isteğe bağlı başlatılması.
// Her ekran ilk ziyaret edildiğinde yüklenir (kamera/MediaPipe ve DICOM kodu gerekmedikçe indirilmez).

import { loadManifest } from './three/assets.js';

const ROUTES = {
  '#/bugun': 'today', '#/antrenman': 'trainer', '#/asistan': 'assistant', '#/tarama': 'scan', '#/anatomi': 'anatomy',
  '#/aktivite': 'activity', '#/gelisim': 'progress', '#/bildirimler': 'notify', '#/verilerim': 'data',
  '#/kamera': 'camera', '#/goruntu': 'imaging',
};
const screens = {};
const loaders = {
  anatomy: () => import('./ui/anatomy-screen.js').then((m) => m.createAnatomyScreen()),
  camera: () => import('./camera/camera-screen.js').then((m) => m.createCameraScreen()),
  scan: () => import('./scan/scan-screen.js').then((m) => m.createScanScreen()),
  today: () => import('./today/today-screen.js').then((m) => m.createTodayScreen()),
  trainer: () => import('./fitness/trainer-screen.js').then((m) => m.createTrainerScreen()),
  assistant: () => import('./assistant/assistant-screen.js').then((m) => m.createAssistantScreen()),
  activity: () => import('./activity/activity-screen.js').then((m) => m.createActivityScreen()),
  progress: () => import('./progress/progress-screen.js').then((m) => m.createProgressScreen()),
  notify: () => import('./notify/notify-screen.js').then((m) => m.createNotifyScreen()),
  data: () => import('./data/data-screen.js').then((m) => m.createDataScreen()),
  imaging: () => import('./imaging/imaging-screen.js').then((m) => m.createImagingScreen()),
};
let current = null;

async function show(name) {
  if (current === name) { (await screens[name])?.activate?.(); return; } // aynı ekran, yeni parametre
  if (current && screens[current]) (await screens[current]).deactivate?.();
  current = name;
  document.body.dataset.screen = name;
  document.getElementById('more-dialog')?.close();
  for (const a of document.querySelectorAll('.tabbar a, .more-list a')) {
    if (a.dataset.tab === name) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  }
  if (name !== 'anatomy') {
    document.getElementById('detail-panel').hidden = true;
    document.getElementById('structures-panel').hidden = true;
    document.body.classList.remove('panel-open');
  }
  screens[name] ??= loaders[name]();
  (await screens[name]).activate?.();
}

function route() {
  const name = ROUTES[location.hash.split('?')[0]] ?? 'today';
  show(name).catch((e) => console.error(e));
}

// "Kamerasız 3B incele" gibi ekranlar arası düğmeler
document.addEventListener('click', (e) => {
  const goto = e.target.closest('[data-goto]');
  if (goto) location.hash = Object.keys(ROUTES).find((k) => ROUTES[k] === goto.dataset.goto);
  const close = e.target.closest('[data-close]');
  if (close) {
    document.getElementById(close.dataset.close).hidden = true;
    document.body.classList.toggle('panel-open', !document.getElementById('detail-panel').hidden || !document.getElementById('structures-panel').hidden);
    document.dispatchEvent(new CustomEvent('panelclosed', { detail: { id: close.dataset.close } }));
  }
  if (e.target.closest('[data-close-dialog]')) e.target.closest('dialog').close();
});

document.getElementById('btn-more').addEventListener('click', () => document.getElementById('more-dialog').showModal());

// Hakkında: kaynaklar ve lisanslar manifest'ten (tek doğruluk kaynağı)
const about = document.getElementById('about-dialog');
document.getElementById('btn-about').addEventListener('click', async () => {
  about.showModal();
  const box = document.getElementById('about-sources');
  if (box.childElementCount) return;
  try {
    const m = await loadManifest();
    const card = (title, rows) => {
      const div = document.createElement('div');
      div.className = 'source-card';
      const h = document.createElement('strong');
      h.textContent = title;
      div.append(h);
      for (const [label, text, href] of rows) {
        const p = document.createElement('p');
        p.append(`${label}: `);
        if (href) {
          const a = document.createElement('a');
          a.href = href; a.textContent = text; a.rel = 'noopener'; a.target = '_blank';
          p.append(a);
        } else p.append(text);
        div.append(p);
      }
      return div;
    };
    const B = m.sources.bodyparts3d, H = m.sources.hra, Z = m.sources.zanatomy;
    box.append(
      card('BodyParts3D 4.3 — deri, iskelet, organlar, damarlar, sinirler', [
        ['Atıf', B.copyright], ['Lisans', B.licenseUrl, B.licenseUrl], ['Not', B.licenseNote], ['Yayın', B.citation],
      ]),
      ...(Z ? [card('Z-Anatomy — kaslar ve tendonlar', [
        ['Atıf', Z.copyright], ['Lisans', 'CC BY-SA 4.0', Z.licenseUrl], ['Not', Z.licenseNote], ['Kaynak', Z.repo, Z.repo],
      ])] : []),
      card('Bağımsız doğrulama (dağıtılmaz)', [
        ['Atlas', `${H.title} — ${H.copyright}`], ['Lisans', 'CC BY 4.0', 'https://creativecommons.org/licenses/by/4.0/'],
        ['Sonuç', `${m.validation.landmarks} ortak yapı, kayıt RMS ${m.validation.rmsMm} mm; akciğer merkezleri ${m.validation.lungs.map((l) => `${l.centroidDistanceMm} mm`).join(' / ')} içinde örtüşüyor.`],
      ]),
    );
  } catch {
    box.textContent = 'Kaynak bilgisi yüklenemedi; ayrıntılar assets/anatomy/LICENSE.md dosyasındadır.';
  }
});

window.addEventListener('hashchange', route);
route();

// Hatırlatmalar: kullanıcı açtıysa (ve izin verdiyse) uygulama açıkken zamanlayıcı çalışır
import('./scan/store.js').then(({ getStore }) => {
  if (getStore().state.notify?.enabled) return import('./notify/runtime.js').then((m) => m.start());
}).catch((e) => console.warn('hatırlatma zamanlayıcısı', e));

// PWA: çevrimdışı önbellek (yalnızca güvenli bağlamda; test için ?nosw ile kapatılabilir)
if ('serviceWorker' in navigator && window.isSecureContext && !location.search.includes('nosw')) {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch((e) => console.warn('SW kaydı başarısız', e)));
}
