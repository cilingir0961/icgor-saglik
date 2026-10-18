import { test } from 'node:test';
import assert from 'node:assert/strict';
import { evaluate, observationText } from '../src/insight/evaluate.js';
import { explainRegion } from '../src/insight/explain.js';
import { recommend, warningSigns } from '../src/insight/recommend.js';
import { bodySummary } from '../src/insight/summary.js';
import { BODY_REGIONS } from '../src/insight/regions.js';

const cond = (view, extra = {}) => ({ view, model: 'full', heightFrac: 0.8, level: 'known', facing: view === 'side' ? 'right' : null, mode: 'helper', ...extra });
const pm = (tr, value, u, { neutral = 0, sense = null, grade = 'iyi', experimental = false, unit = '°' } = {}) => ({
  tr, unit, value, u, grade, experimental, neutral,
  distinguishable: value == null || neutral === null ? null : Math.abs(value - neutral) > 2 * u, sense,
});
const mm = (tr, value, u, grade = 'iyi', experimental = false) => ({ tr, unit: '°', value, u, grade, experimental });
const asym = (L, R) => ({ tr: 'Sağ–sol fark (kol kaldırma)', unit: '°', value: +(L.value - R.value).toFixed(1), u: +Math.hypot(L.u, R.u).toFixed(1), grade: 'iyi', experimental: false });
function scan(date, { shoulder = 0.5, trunk = 0.3, armL = 150, armR = 148, armU = 3, level = 'known', squat = true, uS = 1.2, neckL = null, neckR = null, neckGrade = 'iyi' } = {}) {
  const nL = mm('Başı sola yatırma', neckL, 2, neckGrade), nR = mm('Başı sağa yatırma', neckR, 2, neckGrade);
  const aL = mm('Sol kol kaldırma açısı (en yüksek)', armL, armU), aR = mm('Sağ kol kaldırma açısı (en yüksek)', armR, armU);
  return {
    id: `s${date}`, date: `2026-${date}T10:00:00.000Z`,
    captures: {
      front: { conditions: cond('front', { level }), metrics: {
        shoulderLevel: pm('Omuz seviyesi', shoulder, uS, { sense: shoulder > 0 ? 'sol omuz daha yüksek' : 'sağ omuz daha yüksek' }),
        trunkLateral: pm('Gövdenin yana eğilimi', trunk, 1.3, { sense: 'gövde kişinin soluna eğik' }),
        headTilt: pm('Başın yana eğimi', 0.4, 1.5),
        hipLevel: pm('Kalça seviyesi', null, null, { grade: 'ölçülemedi', experimental: true }),
      } },
    },
    movements: {
      ...(neckL != null ? { boyun: { tr: 'Baş ve boyun hareket açıklığı', conditions: cond('front', { level }), reps: {}, metrics: { latFlexL: nL, latFlexR: nR,
        latAsym: { tr: 'Sağ–sol fark (yana yatırma)', unit: '°', value: neckL - neckR, u: +Math.hypot(2, 2).toFixed(1), grade: neckGrade, experimental: false } } } } : {}),
      'kol-kaldirma': { tr: 'Kolları yandan kaldırma', conditions: cond('front', { level }), reps: { L: 3, R: 3 }, metrics: { abductionL: aL, abductionR: aR, abductionAsym: asym(aL, aR) } },
      ...(squat ? { comelme: { tr: 'Kontrollü çömelme', conditions: cond('side'), reps: { n: 3 }, metrics: {
        kneeMin: mm('En küçük diz açısı (en derin an)', 92, 6.5), hipMin: mm('En küçük kalça açısı', 80, 6.5),
        trunkLean: mm('Gövdenin öne eğimi (en derin an)', 30, 3.2), depthConsistency: mm('Tekrarlar arası derinlik farkı', 4, 6, 'orta', true),
      } } } : {}),
    },
  };
}

test('simetrik ve belirsizlik içindeki farklar: ölçülen bölgeler yeşil, ölçülmeyenler gri', () => {
  const ev = evaluate({ scans: [scan('10-10')] }, new Date('2026-10-18'));
  const st = Object.fromEntries(Object.values(ev.regions).map((r) => [r.id, r.status]));
  assert.equal(st['omuz-L'], 'yesil'); assert.equal(st['omuz-R'], 'yesil');
  assert.equal(st.govde, 'yesil'); assert.equal(st['bas-boyun'], 'yesil');
  assert.equal(st['diz-L'], 'yesil', 'squat ölçüldü, fark kuralı yok');
  assert.equal(st.kalca, 'yesil', 'kalça açısı squatta ölçüldü');
  assert.equal(st.denge, 'gri', 'denge testi yapılmadı → yeşil DEĞİL');
  const noSquat = evaluate({ scans: [scan('10-10', { squat: false })] }, new Date('2026-10-18'));
  assert.equal(noSquat.regions['diz-L'].status, 'gri');
  assert.equal(noSquat.regions.kalca.status, 'gri', 'kalça seviyesi ölçülemedi → gri');
});

test('sağ–sol fark (baş yana yatırma) tek ölçümde sarı; aynı yönde iki ölçümde turuncu; ters yönde sarı kalır', () => {
  const now = new Date('2026-10-18');
  const one = evaluate({ scans: [scan('10-17', { neckL: 30, neckR: 18 })] }, now);
  assert.equal(one.regions['bas-boyun'].status, 'sari');
  const text = observationText(one.regions['bas-boyun'].flagged[0]);
  assert.equal(text, 'Başını sağa yatırırken sola yatırmaya göre 12° daha az hareket ölçüldü (sağ 18°, sol 30°; fark ± 2,8°).');
  const two = evaluate({ scans: [scan('10-03', { neckL: 29, neckR: 19 }), scan('10-17', { neckL: 30, neckR: 18 })] }, now);
  assert.equal(two.regions['bas-boyun'].status, 'turuncu');
  assert.match(explainRegion(two.regions['bas-boyun']).findings[0].history, /3 Ekim: 10° ± 2,8° · Son: 12° ± 2,8°/);
  const flip = evaluate({ scans: [scan('10-03', { neckL: 18, neckR: 30 }), scan('10-17', { neckL: 30, neckR: 18 })] }, now);
  assert.equal(flip.regions['bas-boyun'].status, 'sari');
});

test('KOL KALDIRMA (yalnızca sentetik doğrulandı → deneysel): 24° fark sarı olur, iki ölçümde bile turuncu olmaz', () => {
  const now = new Date('2026-10-18');
  const one = evaluate({ scans: [scan('10-17', { armL: 152, armR: 128, squat: false })] }, now);
  assert.equal(one.regions['omuz-R'].status, 'sari');
  const two = evaluate({ scans: [scan('10-03', { armL: 150, armR: 128, squat: false }), scan('10-17', { armL: 152, armR: 128, squat: false })] }, now);
  assert.equal(two.regions['omuz-R'].status, 'sari', 'deneysel gösterge turuncu olamaz');
  const card = explainRegion(two.regions['omuz-R']);
  assert.equal(card.findings[0].text, 'Sağ kolunu kaldırırken sol koluna göre 24° daha az hareket ölçüldü (sağ 128°, sol 152°; fark ± 4,2°).');
  assert.ok(card.findings[0].caveats.some((c) => /deneysel/i.test(c)));
  // Kamera koçu da aynı kural (deneysel): iki güvenilir oturumda süren fark → sarı, turuncu değil
  const coach = evaluate({ scans: [], trainer: { coachLog: [
    { date: '2026-10-12', kind: 'arm-raise', reliable: true, asym: { value: 25, u: 9 }, extreme: { value: 150, u: 7 } },
    { date: '2026-10-15', kind: 'arm-raise', reliable: true, asym: { value: 24, u: 9 }, extreme: { value: 151, u: 7 } }] } }, now);
  assert.equal(coach.regions['omuz-L'].status, 'sari');
});

test('"güvenilmez" durumundaki gösterge renk üretmez; "Ölçüm güvenilir değil, tekrar deneyin" (doğrulama listesi kuralı)', async () => {
  const vs = await import('../src/analysis/validation-status.js');
  const saved = vs.METRIC_STATUS['boyun:latAsym'];
  vs.METRIC_STATUS['boyun:latAsym'] = { status: 'guvenilmez', why: 'test' };
  try {
    const s = scan('10-17', { neckL: 30, neckR: 18, squat: false });
    delete s.captures.front;
    const ev = evaluate({ scans: [s] }, new Date('2026-10-18'));
    assert.notEqual(ev.regions['bas-boyun'].status, 'sari');
    assert.equal(ev.regions['bas-boyun'].flagged.length, 0);
    assert.match(explainRegion(ev.regions['bas-boyun']).unreliable[0], /Ölçüm güvenilir değil, tekrar deneyin/);
  } finally { if (saved) vs.METRIC_STATUS['boyun:latAsym'] = saved; else delete vs.METRIC_STATUS['boyun:latAsym']; }
});

test('kötü kamera açısı (eğim bilinmiyor) → büyük belirsizlik, fark belirgin sayılmaz; açıklamada eğim uyarısı', () => {
  const ev = evaluate({ scans: [scan('10-17', { shoulder: 3.5, uS: 4.5, level: 'unknown' })] }, new Date('2026-10-18'));
  assert.equal(ev.regions['omuz-L'].status, 'yesil');
  const strong = evaluate({ scans: [scan('10-17', { shoulder: 9.5, uS: 4.5, level: 'unknown' })] }, new Date('2026-10-18'));
  const card = explainRegion(strong.regions['omuz-L']);
  assert.equal(card.status, 'sari');
  assert.ok(card.findings[0].caveats.some((c) => /telefon/i.test(c)));
});

test('düşük güvenilirlik ve eksik eklem: sonuç gösterilmez (gri)', () => {
  const s = scan('10-17', { squat: false, neckL: 30, neckR: 18, neckGrade: 'düşük' });
  delete s.captures.front;
  s.movements.boyun.metrics.latFlexR = mm('Başı sağa yatırma', null, null, 'ölçülemedi');
  const ev = evaluate({ scans: [s] }, new Date('2026-10-18'));
  assert.equal(ev.regions['bas-boyun'].status, 'gri');
  assert.match(ev.regions['bas-boyun'].reason, /güvenilirliği düşük/);
});

test('deneysel gösterge iki ölçümde aynı yönde fark gösterse bile en fazla sarı (turuncu değil)', () => {
  const hip = (d) => { const x = scan(d, { squat: false }); x.captures.front.metrics.hipLevel = pm('Kalça seviyesi', 6, 1.5, { experimental: true, sense: 'sol kalça daha yüksek' }); return x; };
  const ev = evaluate({ scans: [hip('10-03'), hip('10-17')] }, new Date('2026-10-18'));
  assert.equal(ev.regions.kalca.status, 'sari');
  assert.match(ev.regions.kalca.reason, /deneysel/);
});

test('açıklama kartı: ne/hangi ölçüm/güvenilirlik/olası nedenler/ne yapmalı; teşhis dili yok', () => {
  const ev = evaluate({ scans: [scan('10-17', { neckL: 30, neckR: 18 })] }, new Date('2026-10-18'));
  const c = explainRegion(ev.regions['bas-boyun']);
  const f = c.findings[0];
  assert.ok(f.text && f.meaning && f.basis && f.reliability && f.caveats.length);
  assert.match(c.whatIs, /sağlık sorunu olduğunu göstermez/);
  assert.match(f.reliability, /tek ölçüme/);
  assert.ok(c.next.some((n) => /tekrar/.test(n)));
  const all = JSON.stringify(c);
  assert.doesNotMatch(all, /hastalığınız|tanı(nız)? (konuldu|var)|risk puanı|tedavi eder|yırtığınız/i);
  for (const r of Object.values(ev.regions)) assert.ok(BODY_REGIONS[r.id], r.id);
});

test('öneriler: seviye/ekipman süzgeci; ağrı, uyuşma, baş dönmesi ve kısıtlı bölgede öneri yok', () => {
  const base = { profile: { level: 'baslangic', location: 'ev', equipment: [], limitations: [], clearance: true }, trainer: { history: [] } };
  const r = recommend('omuz-R', base, new Date('2026-10-18'));
  assert.equal(r.blocked, false);
  assert.ok(r.exercises.length >= 2 && r.exercises.every((e) => e.level === 1));
  assert.ok(!r.exercises.some((e) => e.id === 'bant-kurek'), 'bandı olmayana bant egzersizi yok');
  assert.match(r.message, /tedavi değildir/);
  const pain = { ...base, trainer: { history: [{ date: '2026-10-17T09:00:00Z', feedback: { numbness: true } }] } };
  assert.equal(recommend('diz-L', pain, new Date('2026-10-18')).blocked, true);
  assert.deepEqual(warningSigns(pain, null, new Date('2026-10-18')), ['uyuşma']);
  const sym = { ...base, insight: { symptoms: { 'omuz-R': { on: true, date: '2026-10-16T00:00:00Z', kinds: ['ağrı'] } } } };
  assert.equal(recommend('omuz-R', sym, new Date('2026-10-18')).blocked, true);
  assert.equal(recommend('diz-L', sym, new Date('2026-10-18')).blocked, false, 'başka bölge etkilenmez');
  const lim = { ...base, profile: { ...base.profile, limitations: ['diz'] } };
  assert.match(recommend('diz-R', lim).message, /kısıtlı/);
});

test('Vücudumun Özeti: yalnızca hesaplanan ölçümlerden; veri yoksa boş durum', () => {
  assert.equal(bodySummary(evaluate({ scans: [] })).empty, true);
  const ev = evaluate({ scans: [scan('10-17', { neckL: 30, neckR: 18 })] }, new Date('2026-10-18'));
  const s = bodySummary(ev);
  assert.equal(s.text, "4 ölçümün 4'ü yeterli görüntü kalitesiyle değerlendirildi.");
  assert.equal(s.attention.length, 1, 'kol farkı (2°) belirsizlik içinde');
  assert.ok(s.attention[0].regions.includes('bas-boyun') && s.attention[0].retest);
  assert.match(s.attention[0].text, /^Baş ve boyun: Başını sağa yatırırken sola yatırmaya göre 12° daha az hareket ölçüldü/);
  assert.ok(s.positives.some((p) => /sol tarafla 3, sağ tarafla 3 tekrarı tamamladın/.test(p)));
  assert.ok(s.positives.some((p) => /derinlik tutarlıydı/.test(p)));
  assert.match(s.next, /tekrar edelim/);
  assert.ok(s.gray.includes('Denge'));
});

import { pickVoice } from '../src/insight/speak.js';

test('sesli anlatım: yalnızca cihaz içi Türkçe ses; yoksa anlaşılır hata', () => {
  globalThis.SpeechSynthesisUtterance ??= function U() {};
  const synth = (voices) => ({ getVoices: () => voices, cancel() {}, speak() {} });
  assert.equal(pickVoice(undefined).ok, false);
  assert.match(pickVoice(synth([{ lang: 'en-US', localService: true }])).why, /Türkçe ses bulunamadı/);
  assert.match(pickVoice(synth([{ lang: 'tr-TR', localService: false, name: 'Google Türkçe' }])).why, /çevrim içi/);
  assert.equal(pickVoice(synth([{ lang: 'tr-TR', localService: false }, { lang: 'tr-TR', localService: true, name: 'Yelda' }])).voice.name, 'Yelda');
});

import { mockReply } from '../server/ai/mock.mjs';
import { contextToText } from '../server/ai/chat.mjs';
import { buildContext, previewLines } from '../src/assistant/context.js';

test('asistan: Bana Anlat bulguları yalnızca izinle; veri yoksa açıkça söylenir; teşhis dili yok', () => {
  const st = { scans: [scan('10-17', { armL: 152, armR: 128, squat: false, neckL: 30, neckR: 18 })], profile: { level: 'baslangic', location: 'ev', equipment: [] }, trainer: {} };
  assert.equal(buildContext(st, {}), null, 'varsayılan: hiçbir şey paylaşılmaz');
  const ctx = buildContext(st, { findings: true }, new Date('2026-10-18'));
  assert.ok(ctx.findings.regions.length === 8 && !ctx.profile);
  assert.ok(previewLines(ctx).some((l) => /Bölge Baş ve boyun \[Tekrar ölçüm/.test(l)));
  assert.ok(previewLines(ctx).some((l) => /Bölge Sağ omuz \[Tekrar ölçüm[^\]]*\]: Sağ omuz: Sağ kolunu kaldırırken sol koluna göre 24° daha az/.test(l)));
  assert.match(contextToText(ctx), /Bana Anlat bulguları/);
  const ask = (q, c = ctx) => mockReply({ messages: [{ role: 'user', content: q }], context: c, level: 'normal' });
  assert.match(ask('Vücudumda nerelere dikkat etmeliyim?'), /Ölçümüne göre dikkat çeken[\s\S]*Ölçülmeyen bölgeler: [^\n]*Sol diz/);
  const shoulder = ask('Sağ omzum neden sarı?');
  assert.match(shoulder, /Sağ omuz \(Tekrar ölçüm[\s\S]*Sağ kolunu kaldırırken sol koluna göre 24° daha az hareket ölçüldü[\s\S]*tek ölçümde[\s\S]*Genel bilgi:/);
  assert.match(ask('Boynum neden sarı?'), /Baş ve boyun \(Tekrar ölçüm[\s\S]*12° daha az hareket ölçüldü[\s\S]*Genel bilgi:/);
  assert.match(ask('Dizlerimde ne fark gördün?'), /ölçülmedi[\s\S]*bir şey söyleyemem/);
  assert.match(ask('Hangi egzersizleri deneyebilirim?'), /Baş ve boyun: Çene içe alma/);
  assert.match(ask('Bugün hareketlerimi nasıl yaptım?'), /yeterli görüntü kalitesiyle/);
  assert.match(ask('Geçen haftaya göre ne değişti?'), /göremiyorum/);
  assert.match(ask('Vücudumda nerelere dikkat etmeliyim?', null), /göremiyorum[\s\S]*bir şey söyleyemem/);
  for (const q of ['Vücudumda nerelere dikkat etmeliyim?', 'Sağ omzum neden sarı?', 'Dizlerimde ne fark gördün?']) {
    assert.doesNotMatch(ask(q), /hastalığın var|fıtığın|skolyozun|kas yırtığın|tanı:|risk puanı/i);
  }
});

test('taraf kalıbı: sağ bölge kartı "Sağ kolunu kaldırırken sol koluna göre X° daha az"; sol kart "daha fazla"', () => {
  const f = { id: 'kol-kaldirma:abductionAsym', kind: 'asym', unit: '°', value: 8, u: 3.1, sides: { L: { value: 140 }, R: { value: 132 } } };
  assert.equal(observationText(f, 'R'), 'Sağ kolunu kaldırırken sol koluna göre 8° daha az hareket ölçüldü (sağ 132°, sol 140°; fark ± 3,1°).');
  assert.equal(observationText(f, 'L'), 'Sol kolunu kaldırırken sağ koluna göre 8° daha fazla hareket ölçüldü (sol 140°, sağ 132°; fark ± 3,1°).');
});
