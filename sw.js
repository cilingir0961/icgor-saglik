// Çevrimdışı önbellek (PWA). Yalnızca aynı kökenli dosyalar; ağa veri gönderilmez.
// Modeller ve kütüphaneler sürüm adıyla değişmez kabul edilir → önce önbellek.
// HTML/JS/CSS → önce ağ (güncellemeler hemen gelsin), ağ yoksa önbellek.
const VERSION = 'icgor-v0.8.0';
const SHELL = ['./', 'index.html', 'src/ui/styles.css', 'src/ui/studio.css', 'icon.svg', 'manifest.webmanifest', 'assets/anatomy/manifest.json'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin) return;
  if (url.pathname.includes('/api/')) return; // API yanıtları önbelleğe alınmaz
  const immutable = /\/(vendor|icons)\//.test(url.pathname) || /\.(glb|task|wasm)$/.test(url.pathname);
  e.respondWith(immutable ? cacheFirst(req) : networkFirst(req));
});

async function cacheFirst(req) {
  const hit = await caches.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok) (await caches.open(VERSION)).put(req, res.clone());
  return res;
}

async function networkFirst(req) {
  try {
    const res = await fetch(req);
    if (res.ok) (await caches.open(VERSION)).put(req, res.clone());
    return res;
  } catch (err) {
    const hit = await caches.match(req, { ignoreSearch: true });
    if (hit) return hit;
    throw err;
  }
}

// Hatırlatmaya dokunulunca uygulamayı aç (bildirimler yalnızca uygulama içinden, izinle gösterilir)
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const url = new URL(e.notification.data?.url ?? './', self.registration.scope).href;
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
    const c = list.find((x) => x.url.startsWith(self.registration.scope));
    return c ? c.focus().then(() => c.navigate?.(url)) : self.clients.openWindow(url);
  }));
});
