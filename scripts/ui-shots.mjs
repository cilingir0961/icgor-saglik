// Arayüz ekran görüntüleri (önce/sonra karşılaştırması için). Örnek durum TEST VERİSİDİR (gerçek kişi değil).
// Kullanım: node scripts/ui-shots.mjs <çıktı-klasörü> [iphone|android|desktop] [ekran,ekran…]
// PERF=1: ekran görüntüsü yerine 4× CPU yavaşlatmasıyla ekran açılış süresi, DOM boyutu, görsel baytı ve JS belleği
// ölçülür (<çıktı>/perf-<cihaz>.json). Headless Chromium + yazılım GPU'su: gerçek cihaz ölçümü DEĞİLDİR.
import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { serve, launchChrome, sleep } from './lib/cdp.mjs';
import { STORE_KEY } from '../src/scan/store.js';

const OUT = resolve(process.argv[2] ?? '.cache/ui-shots');
const DEV = process.argv[3] ?? 'iphone';
const PERF = process.env.PERF === '1';
const ONLY = process.argv[4] ? new Set(process.argv[4].split(',')) : null;
const DEVICES = {
  iphone: { width: 390, height: 844, dpr: 3, mobile: true, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1' },
  android: { width: 412, height: 915, dpr: 2.625, mobile: true },
  desktop: { width: 1280, height: 800, dpr: 1, mobile: false },
};

const day = (d) => { const x = new Date(Date.now() - d * 86400000); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`; };
function demoState() {
  const c = (view) => ({ view, model: 'full', heightFrac: 0.8, level: 'known', facing: view === 'side' ? 'right' : null, mode: 'helper' });
  const pm = (tr, value, u, sense) => ({ tr, unit: '°', value, u, grade: 'iyi', experimental: false, neutral: 0, distinguishable: Math.abs(value) > 2 * u, sense });
  const m = (tr, value, u) => ({ tr, unit: '°', value, u, grade: 'iyi', experimental: false });
  const scan = (d, neckR) => ({
    id: `t${d}`, date: new Date(Date.now() - d * 86400000).toISOString(), model: 'full', profile: { heightCm: 175 },
    captures: { front: { conditions: c('front'), frames: 30, metrics: {
      shoulderLevel: pm('Omuz seviyesi', 0.6, 1.2, 'sol omuz daha yüksek'), trunkLateral: pm('Gövdenin yana eğilimi', 0.5, 1.3, 'gövde kişinin soluna eğik'), headTilt: pm('Başın yana eğimi', 0.4, 1.5, 'baş sağa eğik') } } },
    movements: {
      boyun: { tr: 'Baş ve boyun hareket açıklığı', conditions: c('front'), reps: {}, samples: 200, metrics: { latFlexL: m('Başı sola yatırma', 30, 2), latFlexR: m('Başı sağa yatırma', neckR, 2), latAsym: { tr: 'Sağ–sol fark (yana yatırma)', unit: '°', value: 30 - neckR, u: 2.8, grade: 'iyi', experimental: false } } },
      comelme: { tr: 'Kontrollü çömelme', conditions: c('side'), reps: { n: 3 }, samples: 200, metrics: { kneeMin: m('En küçük diz açısı (en derin an)', 92, 6.5), hipMin: m('En küçük kalça açısı (en derin an)', 78, 6.5), trunkLean: m('Gövdenin öne eğimi (en derin an)', 32, 3.2), depthConsistency: { ...m('Tekrarlar arası derinlik farkı', 4, 6), experimental: true } } },
    },
  });
  const days = Object.fromEntries(Array.from({ length: 14 }, (_, i) => [day(i + 1), { steps: 5200 + ((i * 731) % 2600), source: 'manuel' }]));
  days[day(0)] = { steps: 4300, source: 'manuel' };
  return {
    consent: { version: 1, date: new Date().toISOString(), understood: true, store: true },
    profile: { heightCm: 175, weightKg: 78, age: 34, level: 'baslangic', goal: 'kondisyon', location: 'ev', equipment: [], limitations: [], daysPerWeek: 3, minutesPerDay: 20, clearance: true, screening: {} },
    scans: [scan(12, 19), scan(1, 18)], settings: { voice: true, mode: 'helper' },
    trainer: { plan: null, progress: {}, history: [], paused: false },
    activity: { goalMode: 'auto', goal: null, days, habits: { [day(0)]: { water: 4, sleepH: 7, breaks: 2 } } },
    notify: null, chat: { messages: [], share: {}, keepHistory: true }, deviceId: 'ui-shots-test-device',
  };
}

const SCREENS = [
  ['bugun', '#/bugun', "document.getElementById('today-workout')"],
  ['antrenman', '#/antrenman', "document.body.dataset.trainerState==='overview'"],
  ['antrenman-oturum', '#/antrenman?oturum=0', "document.body.dataset.trainerState==='session'"],
  ['asistan', '#/asistan', "document.getElementById('ai-badge')"],
  ['tarama', '#/tarama', "document.body.dataset.scanState==='home'"],
  ['bana-anlat', '#/anlat', "document.getElementById('insight-regions')"],
  ['aktivite', '#/aktivite', "document.getElementById('step-chart')"],
  ['gelisim', '#/gelisim', "document.getElementById('pg-steps')"],
  ['bildirimler', '#/bildirimler', "document.getElementById('notify-permission')"],
  ['verilerim', '#/verilerim', "document.getElementById('data-summary')"],
  ['anatomi', '#/anatomi', "document.body.dataset.anatomyReady==='true'"],
  ['anatomi-anlat', '#/anatomi?anlat', "document.querySelectorAll('#insight-markers .imark').length===8"],
  ['anatomi-detay', '#/anatomi?mod=kaslar', "document.body.dataset.anatomyReady==='true'", "(()=>{window.__icgor.viewer.select('mus-shoulder-arm');})()"],
  ['anatomi-egzersiz', '#/anatomi?mod=kaslar', "!document.getElementById('detail-panel').hidden", "document.getElementById('tab-egzersiz').click()"],
];

await mkdir(OUT, { recursive: true });
const server = await serve();
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await launchChrome();
try {
  const page = await browser.cdp.page(DEVICES[DEV]);
  await page.goto(`${base}/index.html?nosw#/bugun`);
  await page.eval(`localStorage.setItem('${STORE_KEY}', ${JSON.stringify(JSON.stringify(demoState()))})`);
  // Plan: uygulamanın kendi planlayıcısıyla
  await page.goto(`${base}/index.html?nosw&s=1#/antrenman`);
  await page.waitFor("document.body.dataset.trainerState==='onboarding'", 30000);
  await page.eval("(()=>{for(const i of document.querySelectorAll('input[value=\"hayir\"]'))i.click();document.getElementById('btn-plan-create').click()})()");
  await page.waitFor("document.body.dataset.trainerState==='overview'", 10000);
  const perf = [];
  if (PERF) await page.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  for (const [name, hash, ready, action] of SCREENS) {
    if (ONLY && !ONLY.has(name)) continue;
    if (PERF) {
      // Her ekran soğuk açılır: sayfa yeniden yüklenir, başka bir ekrandan geçilir (modül ve görseller ilk kez yüklenir)
      await page.send('Network.enable'); await page.send('Network.setCacheDisabled', { cacheDisabled: true });
      const from = name === 'verilerim' ? ['#/bildirimler', "document.getElementById('notify-permission')"] : ['#/verilerim', "document.getElementById('data-summary')"];
      await page.goto(`${base}/index.html?nosw&p=${name}${from[0]}`); await page.waitFor(`!!(${from[1]})`, 30000); await sleep(300);
      const ms = await page.eval(`new Promise((res) => { performance.clearResourceTimings(); const t0 = performance.now(); location.hash = ${JSON.stringify(hash)};
        const tick = () => { let ok = false; try { ok = !!(${ready}); } catch {} ok ? requestAnimationFrame(() => res(performance.now() - t0)) : (performance.now() - t0 > 90000 ? res(-1) : requestAnimationFrame(tick)); }; tick(); })`);
      await sleep(600);
      const m = await page.eval(`({ dom: document.getElementById('screen-' + document.body.dataset.screen)?.querySelectorAll('*').length ?? null,
        imgKB: Math.round(performance.getEntriesByType('resource').filter((e) => /\.(webp|png|jpg)$/.test(e.name)).reduce((a, e) => a + (e.encodedBodySize || 0), 0) / 1024),
        heapMB: performance.memory ? +(performance.memory.usedJSHeapSize / 1048576).toFixed(1) : null })`);
      perf.push({ name, renderMs: Math.round(ms), ...m });
      console.log(name, Math.round(ms), 'ms', m);
      continue;
    }
    await page.eval(`location.hash = ${JSON.stringify(hash)}`);
    await page.waitFor(`!!(${ready})`, 90000).catch(() => console.log('hazır olmadı:', name));
    if (action) { await sleep(800); await page.eval(action); }
    await sleep(name.startsWith('anatomi') ? 1500 : 500);
    await writeFile(join(OUT, `${DEV}-${name}.png`), await page.screenshot());
    console.log('ok', name);
  }
  if (PERF) await writeFile(join(OUT, `perf-${DEV}.json`), JSON.stringify({ note: 'Headless Chromium, SwiftShader, 4x CPU yavaşlatma; gerçek cihaz değil. renderMs: hash değişiminden ekranın hazır olduğu ilk kareye.', screens: perf }, null, 2));
} finally { browser.close(); server.close(); }
