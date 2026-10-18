// Arayüz ekran görüntüleri (önce/sonra karşılaştırması için). Örnek durum TEST VERİSİDİR (gerçek kişi değil).
// Kullanım: node scripts/ui-shots.mjs <çıktı-klasörü> [iphone|android|desktop]
import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { serve, launchChrome, sleep } from './lib/cdp.mjs';
import { STORE_KEY } from '../src/scan/store.js';

const OUT = resolve(process.argv[2] ?? '.cache/ui-shots');
const DEV = process.argv[3] ?? 'iphone';
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
  for (const [name, hash, ready, action] of SCREENS) {
    await page.eval(`location.hash = ${JSON.stringify(hash)}`);
    await page.waitFor(`!!(${ready})`, 90000).catch(() => console.log('hazır olmadı:', name));
    if (action) { await sleep(800); await page.eval(action); }
    await sleep(name.startsWith('anatomi') ? 1500 : 500);
    await writeFile(join(OUT, `${DEV}-${name}.png`), await page.screenshot());
    console.log('ok', name);
  }
} finally { browser.close(); server.close(); }
