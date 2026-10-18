// Çevrimdışı önbellek (PWA). Yalnızca aynı kökenli dosyalar; ağa veri gönderilmez.
// Modeller ve kütüphaneler sürüm adıyla değişmez kabul edilir → önce önbellek.
// HTML/JS/CSS → önce ağ (güncellemeler hemen gelsin), ağ yoksa önbellek.
const VERSION = 'icgor-v0.4.0';
const SHELL = ['./', 'index.html', 'src/ui/styles.css', 'icon.svg', 'manifest.webmanifest', 'assets/anatomy/manifest.json'];

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
