import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createPedometer } from '../src/activity/pedometer.js';
import { SOURCES, motionSupport } from '../src/activity/sources.js';
import { adaptiveGoal, demoDays, weekStats, dayKey } from '../src/activity/steps.js';

function rng(seed) { let x = seed; return () => { x = (x * 16807) % 2147483647; return x / 2147483647 - 0.5; }; }
/** Sentetik ivme: yürüme frekansı f (adım/s), genlik A (m/s²), gürültü n; telefon eğik tutuluyor. */
function signal({ seconds, f = 0, A = 0, noise = 0.2, hz = 50, seed = 3, jitter = 0.05 }) {
  const r = rng(seed), out = [];
  let phase = 0;
  for (let i = 0; i < seconds * hz; i++) {
    const t = i / hz;
    phase += 2 * Math.PI * f * (1 + jitter * r()) / hz;
    const v = A * Math.sin(phase) + 0.4 * A * Math.sin(2 * phase + 0.7);
    out.push([t, [0.3 * v + noise * r(), 9.81 * 0.8 + 0.8 * v + noise * r(), 9.81 * 0.6 + 0.5 * v + noise * r()]]);
  }
  return out;
}
const count = (sig) => { const p = createPedometer(); for (const [t, a] of sig) p.push(t, a); return p.steps; };

test('adım sayacı (sentetik): yavaş/normal/hızlı yürüyüşte hata ≤ %5', () => {
  for (const [f, A] of [[1.4, 1.5], [1.8, 2.5], [2.4, 4]]) {
    const truth = Math.round(60 * f);
    const n = count(signal({ seconds: 60, f, A, seed: Math.round(f * 10) }));
    assert.ok(Math.abs(n - truth) / truth <= 0.05, `f=${f}: ${n} / ${truth}`);
  }
});

test('adım sayacı: durağan telefon ve tek sarsıntılar adım sayılmaz', () => {
  assert.equal(count(signal({ seconds: 30, noise: 0.3 })), 0);
  const bumps = signal({ seconds: 30, noise: 0.2 }).map(([t, a]) => [t, Math.abs(t % 7 - 3) < 0.05 ? a.map((v) => v + 6) : a]);
  assert.equal(count(bumps), 0);
});

test('kaynaklar: HealthKit/Health Connect kullanılamaz olarak bildirilir; algılayıcı desteği dürüst', () => {
  assert.equal(SOURCES.healthkit.kind, 'yok');
  assert.equal(SOURCES.healthconnect.kind, 'yok');
  assert.equal(SOURCES.demo.kind, 'demo');
  assert.equal(motionSupport({}).ok, false);
  assert.equal(motionSupport({ DeviceMotionEvent: {}, isSecureContext: false }).ok, false);
  assert.deepEqual(motionSupport({ DeviceMotionEvent: { requestPermission() {} }, isSecureContext: true }), { ok: true, needsPermission: true });
});

test('uyarlanır hedef sabit 10.000 değil; demo veri etiketli', () => {
  const now = new Date(2026, 9, 18);
  assert.equal(adaptiveGoal({}, now).goal, 5000);
  const d = demoDays(21, now);
  assert.ok(Object.values(d).every((x) => x.source === 'demo'));
  assert.equal(d[dayKey(now)], undefined, 'bugün için demo üretilmez');
  const g = adaptiveGoal(d, now);
  assert.ok(g.goal >= 3000 && g.goal <= 12000 && g.goal !== 10000, String(g.goal));
  assert.ok(weekStats(d, now).avg > 0);
});

import { defaults, eventsForDay, dueEvents, nextEvent, inQuiet, message } from '../src/notify/schedule.js';

test('bildirim zamanlaması: kapalıyken hiçbir olay yok; sessiz saat ve günlük sınır uygulanır', () => {
  const d = new Date(2026, 9, 18, 7, 0); // Pazar
  const s = defaults();
  assert.deepEqual(eventsForDay(s, d), [], 'izin/açma olmadan bildirim yok');
  s.enabled = true;
  const ev = eventsForDay(s, d, { planDays: [6] });
  assert.deepEqual(ev.map((e) => e.type), ['sabah', 'yuruyus', 'antrenman', 'haftalik']);
  s.types.hareket.on = true; s.maxPerDay = 3;
  assert.equal(eventsForDay(s, d, { planDays: [6] }).length, 3);
  s.quiet = { from: '08:00', to: '17:00' }; s.maxPerDay = 12;
  assert.ok(eventsForDay(s, d).every((e) => e.at.getHours() >= 17 || e.at.getHours() < 8));
  assert.equal(inQuiet(23 * 60, { from: '22:00', to: '08:00' }), true);
  assert.equal(inQuiet(12 * 60, { from: '22:00', to: '08:00' }), false);
});

test('bildirim: zamanı gelen olay bir kez; 30 dk\'dan eski olay toplu gösterilmez; metin sağlık ayrıntısı içermez', () => {
  const s = { ...defaults(), enabled: true };
  const now = new Date(2026, 9, 19, 8, 40);
  const due = dueEvents(s, [], now);
  assert.deepEqual(due.map((e) => e.type), ['sabah']);
  assert.deepEqual(dueEvents(s, [due[0].id], now), []);
  assert.deepEqual(dueEvents(s, [], new Date(2026, 9, 19, 9, 30)), []);
  assert.equal(nextEvent(s, now).type, 'yuruyus');
  const m = message('yuruyus', { remaining: 1500 });
  assert.match(m.body, /1\.500 adım/);
  assert.doesNotMatch(JSON.stringify(Object.keys(defaults().types).map((t) => message(t))), /ağrı skor|duruş|tarama sonuc/i);
});

import { stepPeriod, weeklyWorkouts, coachChanges } from '../src/progress/metrics.js';
import { lastDays } from '../src/activity/steps.js';

test('gelişim: gürültü içindeki adım farkı "belirsiz"; gerçek artış "artis"; az kayıtla karşılaştırma yok', () => {
  const now = new Date(2026, 9, 18);
  const r = rng(5);
  const mk = (f) => Object.fromEntries(lastDays(60, now).map((k, i) => [k, { steps: Math.round(f(i) + 1500 * r()), source: 'manuel' }]));
  assert.equal(stepPeriod(mk(() => 6000), 30, now).status, 'belirsiz');
  const up = stepPeriod(mk((i) => (i >= 30 ? 8000 : 5000)), 30, now);
  assert.equal(up.status, 'artis'); assert.ok(up.delta > 2500 && up.margin < 800);
  assert.equal(stepPeriod({ [lastDays(1, now)[0]]: { steps: 9000 } }, 30, now).status, 'yok');
});

test('gelişim: haftalık antrenman sayısı ve koç ölçümlerinde MDC kuralı', () => {
  const now = new Date(2026, 9, 18, 12);
  const w = weeklyWorkouts([{ date: new Date(2026, 9, 17).toISOString(), done: 6 }, { date: new Date(2026, 9, 6).toISOString(), done: 4 }], 3, now);
  assert.deepEqual(w.map((x) => x.count), [0, 1, 1]);
  const ch = coachChanges([
    { date: '2026-09-01', kind: 'squat', tr: 'Squat', reliable: true, extreme: { value: 100, u: 6.5 } },
    { date: '2026-10-01', kind: 'squat', tr: 'Squat', reliable: true, extreme: { value: 92, u: 6.5 } },
    { date: '2026-10-02', kind: 'arm-raise', tr: 'Kol', reliable: false, extreme: { value: 120, u: 20 } },
  ]);
  assert.equal(ch.length, 1);
  assert.equal(ch[0].status, 'belirsiz', '8° fark, ±18° MDC içinde: iyileşme denmez');
});
