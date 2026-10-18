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
function scan(date, { shoulder = 0.5, trunk = 0.3, armL = 150, armR = 148, armU = 3, level = 'known', squat = true, uS = 1.2 } = {}) {
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

test('sağ–sol kol farkı tek ölçümde sarı; aynı yönde iki ölçümde turuncu; ters yönde sarı kalır', () => {
  const now = new Date('2026-10-18');
  const one = evaluate({ scans: [scan('10-17', { armL: 152, armR: 128 })] }, now);
  assert.equal(one.regions['omuz-R'].status, 'sari');
  const f = one.regions['omuz-R'].flagged[0];
  const text = observationText(f);
  assert.match(text, /sol taraf 24° daha fazla/); assert.match(text, /sol 152°, sağ 128°/); assert.match(text, /± 4,2°/);
  const two = evaluate({ scans: [scan('10-03', { armL: 150, armR: 130 }), scan('10-17', { armL: 152, armR: 128 })] }, now);
  assert.equal(two.regions['omuz-R'].status, 'turuncu');
  assert.match(explainRegion(two.regions['omuz-R']).findings[0].history, /3 Ekim: 20° ± 4,2° · Son: 24° ± 4,2°/);
  const flip = evaluate({ scans: [scan('10-03', { armL: 128, armR: 152 }), scan('10-17', { armL: 152, armR: 128 })] }, now);
  assert.equal(flip.regions['omuz-R'].status, 'sari');
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
  const s = scan('10-17', { squat: false });
  s.movements['kol-kaldirma'].metrics = { abductionL: mm('Sol', null, null, 'ölçülemedi'), abductionR: mm('Sağ', 140, 15, 'düşük'), abductionAsym: { tr: 'fark', unit: '°', value: null, u: null, grade: 'ölçülemedi' } };
  delete s.captures.front;
  const ev = evaluate({ scans: [s] }, new Date('2026-10-18'));
  assert.equal(ev.regions['omuz-R'].status, 'gri');
  assert.match(ev.regions['omuz-R'].reason, /güvenilirliği düşük/);
  assert.equal(ev.regions['omuz-L'].status, 'gri');
});

test('kamera koçu: düşük fps oturumu (güvenilmez) kullanılmaz; güvenilir iki oturumda süren fark turuncu değil (deneysel → en fazla sarı)', () => {
  const now = new Date('2026-10-18');
  const log = [
    { date: '2026-10-10', kind: 'arm-raise', reliable: false, asym: { value: 30, u: 5 } },
  ];
  assert.equal(evaluate({ scans: [], trainer: { coachLog: log } }, now).regions['omuz-L'].status, 'gri');
  log.push({ date: '2026-10-12', kind: 'arm-raise', reliable: true, asym: { value: 25, u: 9 }, extreme: { value: 150, u: 7 } },
    { date: '2026-10-15', kind: 'arm-raise', reliable: true, asym: { value: 24, u: 9 }, extreme: { value: 151, u: 7 } });
  const ev = evaluate({ scans: [], trainer: { coachLog: log } }, now);
  assert.equal(ev.regions['omuz-L'].status, 'sari');
  assert.match(ev.regions['omuz-L'].reason, /deneysel/);
});

test('açıklama kartı: ne/hangi ölçüm/güvenilirlik/olası nedenler/ne yapmalı; teşhis dili yok', () => {
  const ev = evaluate({ scans: [scan('10-17', { armL: 152, armR: 128 })] }, new Date('2026-10-18'));
  const c = explainRegion(ev.regions['omuz-R']);
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
  const ev = evaluate({ scans: [scan('10-17', { armL: 152, armR: 128 })] }, new Date('2026-10-18'));
  const s = bodySummary(ev);
  assert.equal(s.text, "3 ölçümün 3'ü yeterli görüntü kalitesiyle değerlendirildi.");
  assert.equal(s.attention.length, 1, 'aynı ölçüme dayanan iki omuz tek cümlede');
  assert.ok(s.attention[0].regions.includes('omuz-R') && s.attention[0].retest);
  assert.match(s.attention[0].text, /^Sol omuz ve Sağ omuz: Kolları yandan kaldırma sırasında/);
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
  const st = { scans: [scan('10-17', { armL: 152, armR: 128, squat: false })], profile: { level: 'baslangic', location: 'ev', equipment: [] }, trainer: {} };
  assert.equal(buildContext(st, {}), null, 'varsayılan: hiçbir şey paylaşılmaz');
  const ctx = buildContext(st, { findings: true }, new Date('2026-10-18'));
  assert.ok(ctx.findings.regions.length === 8 && !ctx.profile);
  assert.ok(previewLines(ctx).some((l) => /Bölge Sağ omuz \[Tekrar ölçüm/.test(l)));
  assert.match(contextToText(ctx), /Bana Anlat bulguları/);
  const ask = (q, c = ctx) => mockReply({ messages: [{ role: 'user', content: q }], context: c, level: 'normal' });
  assert.match(ask('Vücudumda nerelere dikkat etmeliyim?'), /Ölçümüne göre dikkat çeken[\s\S]*Ölçülmeyen bölgeler: [^\n]*Sol diz/);
  assert.match(ask('Sağ omzum neden sarı?'), /Sağ omuz \(Tekrar ölçüm[\s\S]*sol taraf 24° daha fazla[\s\S]*Genel bilgi:/);
  assert.match(ask('Dizlerimde ne fark gördün?'), /ölçülmedi[\s\S]*bir şey söyleyemem/);
  assert.match(ask('Hangi egzersizleri deneyebilirim?'), /Kolları yandan kaldırma|Kol çevirme/);
  assert.match(ask('Bugün hareketlerimi nasıl yaptım?'), /yeterli görüntü kalitesiyle/);
  assert.match(ask('Geçen haftaya göre ne değişti?'), /göremiyorum/);
  assert.match(ask('Vücudumda nerelere dikkat etmeliyim?', null), /göremiyorum[\s\S]*bir şey söyleyemem/);
  for (const q of ['Vücudumda nerelere dikkat etmeliyim?', 'Sağ omzum neden sarı?', 'Dizlerimde ne fark gördün?']) {
    assert.doesNotMatch(ask(q), /hastalığın var|fıtığın|skolyozun|kas yırtığın|tanı:|risk puanı/i);
  }
});
