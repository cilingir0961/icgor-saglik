import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { loadConfig, publicStatus } from '../server/ai/config.mjs';
import { classify, sanitize } from '../server/ai/safety.mjs';
import { RateLimiter, Ledger, estimateTokens, costUsd } from '../server/ai/limits.mjs';
import { openaiReply } from '../server/ai/openai.mjs';
import { createChat, validate, contextToText } from '../server/ai/chat.mjs';
import { createApp } from '../server/app.mjs';

const FAKE_KEY = 'sk-test-0123456789abcdefghijklmnopqrstuvwxyz';
const dev = 'cihaz-12345678';
const msg = (t) => ({ deviceId: dev, messages: [{ role: 'user', content: t }] });

test('yapılandırma: varsayılan demo; ücretli için anahtar + sağlayıcı + açık onay gerekir; durum gizli bilgi içermez', () => {
  assert.equal(loadConfig({}).provider, 'mock');
  assert.equal(loadConfig({ ICGOR_AI_PROVIDER: 'openai', OPENAI_API_KEY: FAKE_KEY }).provider, 'mock', 'onaysız ücretli kapalı');
  assert.equal(loadConfig({ ICGOR_AI_PROVIDER: 'openai', ICGOR_AI_ENABLE_PAID: '1' }).provider, 'mock', 'anahtarsız kapalı');
  const on = loadConfig({ ICGOR_AI_PROVIDER: 'openai', OPENAI_API_KEY: FAKE_KEY, ICGOR_AI_ENABLE_PAID: '1' });
  assert.equal(on.provider, 'openai');
  assert.ok(!JSON.stringify(on).includes(FAKE_KEY), 'yapılandırma nesnesi anahtarı tutmaz');
  assert.ok(!JSON.stringify(publicStatus(on)).includes('sk-'));
});

test('güvenlik sınıflaması: acil ve kriz sabit yanıt (112); teşhis/ilaç işaretlenir', () => {
  assert.equal(classify('Antrenman sırasında göğsümde ağrı ve sıkışma var').level, 'acil');
  assert.match(classify('nefes alamıyorum').reply, /112/);
  assert.equal(classify('Bazen yaşamak istemiyorum').level, 'kriz');
  assert.equal(classify('Bende fıtık var mı, teşhis koyar mısın?').level, 'tani');
  assert.equal(classify('Hangi takviyeyi almalıyım?').level, 'ilac');
  assert.equal(classify('Evde 20 dakikalık program hazırla').level, 'normal');
  assert.equal(sanitize('a\u0000b\u0007c  ', 10), 'abc');
});

test('hız sınırı ve günlük kota/bütçe', () => {
  let t = 0;
  const rl = new RateLimiter({ capacity: 2, refillPerMin: 6 }, () => t);
  assert.ok(rl.take('a').ok && rl.take('a').ok);
  const r = rl.take('a');
  assert.equal(r.ok, false); assert.ok(r.retryAfterS > 0);
  t += 10000; assert.ok(rl.take('a').ok, '10 sn sonra 1 jeton dolar');
  const cfg = loadConfig({ ICGOR_DEVICE_DAILY_MESSAGES: '2', ICGOR_DAILY_BUDGET_USD: '0.001' });
  const L = new Ledger(cfg);
  assert.ok(L.check('x', 100, 100, false).ok);
  L.record('x', 100, 100, false); L.record('x', 100, 100, false);
  assert.equal(L.check('x', 1, 1, false).code, 'kota');
  assert.equal(L.check('y', 1000, 1000, true).code, 'butce', '0,001 USD bütçe aşılır');
  assert.equal(estimateTokens('abcdefg'), 3);
  assert.ok(Math.abs(costUsd(1e6, 1e6, cfg) - (cfg.priceInPerM + cfg.priceOutPerM)) < 1e-9);
});

function fakeFetch(handler) {
  const calls = [];
  const f = async (url, init) => { calls.push({ url, init, body: JSON.parse(init.body) }); return handler(calls.length); };
  f.calls = calls;
  return f;
}
const okResponse = (text = 'Merhaba!') => ({
  ok: true, status: 200,
  json: async () => ({ status: 'completed', output: [{ type: 'reasoning' }, { type: 'message', content: [{ type: 'output_text', text }] }], usage: { input_tokens: 120, output_tokens: 40 } }),
});

test('OpenAI Responses isteği: resmi şema alanları, store:false, özetlenmiş kimlik; yanıt ayrıştırma', async () => {
  const cfg = loadConfig({ ICGOR_AI_PROVIDER: 'openai', OPENAI_API_KEY: FAKE_KEY, ICGOR_AI_ENABLE_PAID: '1' });
  const f = fakeFetch(() => okResponse('Selam'));
  const r = await openaiReply({ instructions: 'X', input: [{ role: 'user', content: 'Y' }] }, { cfg, deviceId: dev, fetchImpl: f, apiKey: FAKE_KEY });
  assert.equal(r.text, 'Selam');
  assert.deepEqual(r.usage, { inputTokens: 120, outputTokens: 40 });
  const c = f.calls[0];
  assert.equal(c.url, 'https://api.openai.com/v1/responses');
  assert.equal(c.init.headers.authorization, `Bearer ${FAKE_KEY}`);
  assert.equal(c.body.store, false);
  assert.equal(c.body.max_output_tokens, cfg.maxOutputTokens);
  assert.match(c.body.safety_identifier, /^[0-9a-f]{64}$/);
  assert.ok(!c.body.safety_identifier.includes(dev), 'ham cihaz kimliği gönderilmez');
});

test('OpenAI hataları: anahtar sızmaz; 429 bir kez yeniden denenir', async () => {
  const cfg = loadConfig({ ICGOR_AI_PROVIDER: 'openai', OPENAI_API_KEY: FAKE_KEY, ICGOR_AI_ENABLE_PAID: '1' });
  const f401 = fakeFetch(() => ({ ok: false, status: 401, json: async () => ({ error: { message: `bad key ${FAKE_KEY}` } }) }));
  await assert.rejects(openaiReply({ instructions: '', input: [] }, { cfg, deviceId: dev, fetchImpl: f401, apiKey: FAKE_KEY }), (e) => e.code === 'yetki' && !e.message.includes('sk-'));
  const f429 = fakeFetch((n) => (n === 1 ? { ok: false, status: 429 } : okResponse('ikinci')));
  const r = await openaiReply({ instructions: '', input: [] }, { cfg, deviceId: dev, fetchImpl: f429, apiKey: FAKE_KEY });
  assert.equal(r.text, 'ikinci'); assert.equal(f429.calls.length, 2);
});

test('sohbet: kullanıcının 7 örnek sorusu demo modda anlamlı Türkçe yanıt alır', async () => {
  const chat = createChat(loadConfig({ ICGOR_RATE_BURST: '50' }));
  const cases = [
    ['Boyum 175 cm, kilom 90 kg. Nereden başlamalıyım?', /BKİ.*29,4|Başlangıç/],
    ['Omuzlarım öne doğru duruyor, hangi hareketleri yapabilirim?', /Çene içe alma|Duvar meleği/],
    ['Evde ekipmansız 20 dakikalık program hazırla', /Ekipmansız 20 dakikalık/],
    ['Bugün 4.000 adım attım, hedefime ulaşmak için ne yapabilirim?', /4\.000 adım/],
    ['Fitness salonuna başladım, haftalık program oluştur.', /haftalık taslak[\s\S]*makine|Lat çekiş|Göğüs pres/i],
    ['Duruş raporumda gövde eğimi görülüyor, bunun anlamı nedir?', /duruş gözlemlerinin paylaşılmasına izin/],
    ['Bugünkü antrenmanımı tamamladım, yarın ne yapmalıyım?', /Tebrikler/],
  ];
  for (const [q, re] of cases) {
    const r = await chat.handle(msg(q));
    assert.equal(r.status, 200, q);
    assert.equal(r.body.demo, true);
    assert.match(r.body.reply, re, q);
    assert.ok(!/teşhis ediyorum|tanınız/.test(r.body.reply));
  }
});

test('sohbet: acil mesajda model/kota kullanılmaz; teşhis isteğinde yönlendirme; bağlam belirsizlikle yorumlanır', async () => {
  const chat = createChat(loadConfig({}));
  const a = await chat.handle(msg('Koşarken göğsümde baskı ve ağrı oldu'));
  assert.equal(a.body.provider, 'guvenlik'); assert.match(a.body.reply, /112/); assert.equal(a.body.usage, null);
  const t = await chat.handle(msg('Boyun fıtığım var mı?'));
  assert.match(t.body.reply, /teşhis koyamaz|hekime/);
  const ctx = { posture: [{ tr: 'Gövdenin yana eğilimi', value: 6.1, u: 1.9, unit: '°', distinguishable: true, sense: 'gövde kişinin soluna eğik', experimental: false }] };
  const r = await chat.handle({ ...msg('Duruş raporumda gövde eğimi görülüyor, bunun anlamı nedir?'), context: ctx });
  assert.match(r.body.reply, /6\.1° ± 1\.9/);
  assert.match(r.body.reply, /Omurganın şeklini ölçmez/);
  assert.match(r.body.reply, /tanı koymaz/);
});

test('sohbet: ücretli yol (sahte fetch) maliyet hesaplar; bütçe dolunca ve hata olunca demo yanıta düşer', async () => {
  const env = { ICGOR_AI_PROVIDER: 'openai', OPENAI_API_KEY: FAKE_KEY, ICGOR_AI_ENABLE_PAID: '1' };
  process.env.OPENAI_API_KEY = FAKE_KEY;
  try {
    const ok = createChat(loadConfig(env), { fetchImpl: fakeFetch(() => okResponse('Gerçek yanıt')) });
    const r = await ok.handle(msg('Merhaba'));
    assert.equal(r.body.provider, 'openai'); assert.equal(r.body.demo, false);
    assert.ok(r.body.usage.costUsd > 0);
    const broke = createChat(loadConfig({ ...env, ICGOR_DAILY_BUDGET_USD: '0' }), { fetchImpl: fakeFetch(() => okResponse()) });
    const b = await broke.handle(msg('Merhaba'));
    assert.equal(b.body.provider, 'mock'); assert.match(b.body.notice, /bütçe/);
    const down = createChat(loadConfig(env), { fetchImpl: fakeFetch(() => ({ ok: false, status: 500 })) });
    const d = await down.handle(msg('Merhaba'));
    assert.equal(d.body.provider, 'mock'); assert.match(d.body.notice, /ulaşılamadı/);
  } finally { delete process.env.OPENAI_API_KEY; }
});

test('istek doğrulama ve bağlam metni', () => {
  const cfg = loadConfig({});
  assert.match(validate({ deviceId: 'x', messages: [] }, cfg).error, /cihaz/);
  assert.match(validate({ deviceId: dev, messages: [{ role: 'system', content: 'x' }] }, cfg).error, /biçimi/);
  assert.match(validate({ deviceId: dev, messages: [{ role: 'user', content: 'a'.repeat(1300) }] }, cfg).error, /1200/);
  assert.match(validate({ ...msg('a'), context: { x: 'b'.repeat(6000) } }, cfg).error, /büyük/);
  const t = contextToText({ profile: { age: 40, heightCm: 175, goal: 'kondisyon' }, activity: { today: 4000, weekAvg: 5200, goal: 6000, demo: true }, posture: [{ tr: 'Omuz', value: 1, u: 2, unit: '°', distinguishable: false, experimental: true }] });
  assert.match(t, /40 yaş/); assert.match(t, /demo veri/); assert.match(t, /\[deneysel\]/); assert.match(t, /ayırt edilemez/);
});

async function withServer(env, fn) {
  const app = createApp({ root: process.cwd(), cfg: loadConfig(env) });
  const srv = createServer(app);
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${srv.address().port}`;
  try { await fn(base); } finally { srv.close(); }
}

test('HTTP: aynı köken, içerik türü, boyut sınırı; gizli dosyalar ve dizin dışı erişim engellenir; durum anahtar içermez', async () => {
  await withServer({ ICGOR_AI_PROVIDER: 'openai', OPENAI_API_KEY: FAKE_KEY, ICGOR_AI_ENABLE_PAID: '1' }, async (base) => {
    const st = await (await fetch(`${base}/api/ai/status`)).text();
    assert.ok(!st.includes(FAKE_KEY) && !st.includes('sk-'));
    const post = (body, headers = {}) => fetch(`${base}/api/chat`, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body });
    assert.equal((await post('{}', { origin: 'https://saldirgan.example' })).status, 403);
    assert.equal((await fetch(`${base}/api/chat`, { method: 'POST', headers: { 'content-type': 'text/plain' }, body: '{}' })).status, 415);
    assert.equal((await post('x'.repeat(30000))).status, 413);
    assert.equal((await post('{bozuk')).status, 400);
    assert.equal((await fetch(`${base}/api/chat`)).status, 405);
    for (const p of ['/.git/config', '/.env', '/node_modules/.package-lock.json', '/server/data/usage.json']) assert.equal((await fetch(base + p)).status, 404, p);
    assert.equal((await fetch(`${base}/..%2f..%2fetc%2fpasswd`)).status, 403);
    assert.equal((await fetch(`${base}/index.html`)).status, 200);
  });
});

test('güvenlik: istemci kodunda API anahtarı veya doğrudan OpenAI çağrısı yok; depoda anahtar biçiminde dize yok', async () => {
  const files = [];
  const walk = async (d) => {
    for (const e of await readdir(d, { withFileTypes: true })) {
      if (['node_modules', '.git', '.cache', 'vendor', 'assets'].includes(e.name)) continue;
      const p = join(d, e.name);
      if (e.isDirectory()) await walk(p); else if (/\.(m?js|html|json|md)$/.test(e.name)) files.push(p);
    }
  };
  await walk(process.cwd());
  for (const f of files) {
    const s = await readFile(f, 'utf8');
    if (!f.includes('/test/')) assert.ok(!/sk-[A-Za-z0-9]{20,}/.test(s), `anahtar biçiminde dize: ${f}`);
    if (f.includes('/src/') || f.endsWith('index.html') || f.endsWith('sw.js')) {
      assert.ok(!s.includes('api.openai.com'), `istemci doğrudan OpenAI çağırmamalı: ${f}`);
      assert.ok(!s.includes('OPENAI_API_KEY'), `istemci anahtar değişkenine erişmemeli: ${f}`);
    }
  }
  const html = await readFile('index.html', 'utf8');
  assert.match(html, /connect-src 'self' blob: data:;/, 'CSP gevşetilmedi');
});
