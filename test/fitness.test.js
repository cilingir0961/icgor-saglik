import { test } from 'node:test';
import assert from 'node:assert/strict';
import { screen, eligible, buildSession, buildPlan, applyFeedback, adjustExercise, postpone, SCREENING, withAvoidedRegions } from '../src/fitness/planner.js';
import { EXERCISES, BY_ID, exerciseSeconds } from '../src/fitness/exercises.js';

const base = { goal: 'kondisyon', level: 'baslangic', location: 'ev', equipment: [], limitations: [], minutesPerDay: 20, daysPerWeek: 3, clearance: true };
const no = Object.fromEntries(SCREENING.map((s) => [s.id, false]));

test('kütüphane: her egzersizin açıklaması, dozu, kası, geçerli varyant bağlantıları var', () => {
  for (const e of EXERCISES) {
    assert.ok(e.tr && e.desc && e.dose?.sets >= 1 && e.muscles.length, e.id);
    for (const k of ['easier', 'harder']) if (e[k]) assert.ok(BY_ID[e[k]], `${e.id}.${k}`);
  }
});

test('ön değerlendirme: tüm sorular yanıtlanmalı; "evet" → hekime danışma ve düşük yoğunluk', () => {
  assert.equal(screen({}).clearance, false);
  assert.equal(screen(no).clearance, true);
  const r = screen({ ...no, gogus: true });
  assert.equal(r.clearance, false); assert.deepEqual(r.flags, ['gogus']); assert.match(r.message, /hekime/);
  const pool = eligible({ ...base, clearance: false, level: 'ileri' });
  assert.ok(pool.every((e) => ['hareketlilik', 'kardiyo', 'nefes', 'durus'].includes(e.type) && e.level === 1));
});

test('kısıtlanan bölgelerin egzersizleri önerilmez; salon/ev ve ekipman süzgeci', () => {
  const p = buildPlan({ ...base, limitations: ['diz', 'omuz'], goal: 'kuvvet', level: 'ileri' });
  for (const s of p.sessions) for (const it of s.items) assert.ok(!BY_ID[it.id].avoid.some((r) => ['diz', 'omuz'].includes(r)), it.id);
  assert.ok(eligible({ ...base, location: 'ev' }).every((e) => !e.equipment.includes('makine')));
  assert.ok(eligible({ ...base, location: 'salon', level: 'orta' }).some((e) => e.equipment.includes('makine')));
  assert.ok(!eligible(base).some((e) => e.equipment.includes('dambil')), 'dambılı olmayana dambıl yok');
  assert.ok(eligible({ ...base, equipment: ['dambil'], level: 'orta' }).some((e) => e.equipment.includes('dambil')));
});

test('oturum süresi bütçeye sığar ve %60\'ından kısa kalmaz; ısınma ve soğuma içerir', () => {
  for (const goal of ['kondisyon', 'kuvvet', 'kilo', 'aktivite', 'aliskanlik']) for (const minutes of [15, 30, 45]) {
    const s = buildSession({ ...base, goal, minutesPerDay: minutes }, 0);
    const sec = s.items.reduce((a, it) => a + exerciseSeconds(it.dose), 0);
    assert.ok(sec <= minutes * 60 + 1, `${goal} ${minutes}: ${sec}`);
    assert.ok(sec >= minutes * 60 * 0.6, `${goal} ${minutes} çok kısa: ${sec}`);
    assert.equal(s.items[0].role, 'isinma'); assert.equal(s.items.at(-1).role, 'soguma');
  }
});

test('haftalık plan: gün sayısı, aralıklı günler, oturum çeşitliliği', () => {
  const p = buildPlan({ ...base, daysPerWeek: 3 });
  assert.deepEqual(p.sessions.map((s) => s.day), ['Pazartesi', 'Çarşamba', 'Cuma']);
  assert.notDeepEqual(p.sessions[0].items.map((i) => i.id), p.sessions[1].items.map((i) => i.id));
});

test('geri bildirim güvenliği: ağrı/baş dönmesi/göğüs ağrısında yük ARTMAZ', () => {
  const ids = ['squat', 'duvar-sinav'];
  const pain = applyFeedback({}, { feeling: 'kolay', pain: ['diz'] }, ids);
  assert.equal(pain.increased.length, 0); assert.deepEqual(pain.avoid, ['diz']);
  assert.equal(pain.progress.squat.avoid, true, 'dizi zorlayan squat işaretlenir');
  assert.match(pain.messages[0], /sağlık profesyoneline/);
  const dz = applyFeedback({}, { feeling: 'kolay', dizziness: true }, ids);
  assert.equal(dz.paused, true); assert.equal(dz.increased.length, 0);
  const cp = applyFeedback({}, { feeling: 'uygun', chestPain: true }, ids);
  assert.equal(cp.urgent, true); assert.match(cp.messages[0], /112/);
  assert.deepEqual(withAvoidedRegions(base, ['diz']).limitations, ['diz']);
});

test('ilerleme: kolay → artış, zor → azaltma, uygun → iki oturumda bir artış', () => {
  const ids = ['duvar-sinav'];
  assert.equal(applyFeedback({}, { feeling: 'kolay' }, ids).progress['duvar-sinav'].step, 1);
  assert.equal(applyFeedback({}, { feeling: 'zor' }, ids).progress['duvar-sinav'].step, -1);
  const u1 = applyFeedback({}, { feeling: 'uygun' }, ids);
  assert.equal(u1.increased.length, 0);
  const u2 = applyFeedback(u1.progress, { feeling: 'uygun' }, ids);
  assert.equal(u2.progress['duvar-sinav'].step, 1);
});

test('egzersizi kolaylaştır/zorlaştır/değiştir ve oturumu ertele', () => {
  let plan = buildPlan({ ...base, level: 'orta', goal: 'kuvvet' });
  const sIdx = 0;
  const iIdx = plan.sessions[0].items.findIndex((i) => BY_ID[i.id].easier || BY_ID[i.id].harder);
  const id0 = plan.sessions[0].items[iIdx].id;
  const easier = adjustExercise(plan, sIdx, iIdx, BY_ID[id0].easier ? 'easier' : 'harder').plan;
  assert.notEqual(easier.sessions[0].items[iIdx].id, id0);
  const rep = adjustExercise(plan, sIdx, iIdx, 'replace').plan;
  assert.notEqual(rep.sessions[0].items[iIdx].id, id0);
  const pp = postpone(plan, 0);
  assert.equal(pp.ok, true); assert.equal(pp.plan.sessions[0].day, 'Salı'); assert.equal(pp.plan.sessions[0].status, 'ertelendi');
  plan = buildPlan({ ...base, daysPerWeek: 6 });
  const sun = postpone(plan, 5);
  assert.equal(sun.plan.sessions[5].day, 'Pazar', 'cumartesi oturumu boş pazara kayar');
  assert.equal(postpone(sun.plan, 5).ok, false, 'hafta içinde boş gün kalmadıysa ertelenemez');
});
