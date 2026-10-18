// Kişisel antrenman planlayıcı (saf, belirlenimci). Genel fitness rehberliğidir; tıbbi egzersiz reçetesi DEĞİLDİR.
//
// Güvenlik kuralları (kodda zorunlu):
//  - Ön değerlendirmede herhangi bir "evet" → yalnızca düşük yoğunluk (hareketlilik + yürüyüş) ve hekime danışma önerisi.
//  - Ağrı, baş dönmesi, olağan dışı nefes darlığı veya göğüs ağrısı bildirilirse yük ARTMAZ; ilgili bölge
//    egzersizleri çıkarılır veya oturumlar durdurulur ve uygun yönlendirme verilir.
//  - Kısıtlanan bölgelerin (diz, omuz, bel, boyun, denge, bilek) egzersizleri hiç önerilmez.

import { EXERCISES, BY_ID, exerciseSeconds } from './exercises.js';

export const GOALS = {
  kondisyon: 'Genel kondisyon',
  kuvvet: 'Kas kuvvetini geliştirme',
  hareketlilik: 'Hareketlilik ve esneklik',
  durus: 'Duruş farkındalığı',
  aktivite: 'Günlük aktiviteyi artırma',
  kilo: 'Sağlıklı kilo yönetimini destekleme',
  aliskanlik: 'Başlangıç seviyesi egzersiz alışkanlığı',
};
export const LEVELS = { baslangic: 'Başlangıç', orta: 'Orta', ileri: 'İleri' };
const LEVEL_MAX = { baslangic: 1, orta: 2, ileri: 3 };
export const DAY_NAMES = ['Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi', 'Pazar'];

/** Egzersize başlamadan önce sağlık soruları (genel tarama; tanı amaçlı değildir). */
export const SCREENING = [
  { id: 'kalp', q: 'Bir hekim size kalp rahatsızlığınız veya yüksek tansiyonunuz olduğunu söyledi mi?' },
  { id: 'gogus', q: 'Dinlenirken ya da fiziksel aktivite sırasında göğüs ağrısı hissediyor musunuz?' },
  { id: 'denge', q: 'Son 12 ayda baş dönmesi nedeniyle dengenizi kaybettiniz ya da bayıldınız mı?' },
  { id: 'kronik', q: 'Kalp hastalığı veya yüksek tansiyon dışında tanı konmuş kronik bir hastalığınız var mı?' },
  { id: 'ilac', q: 'Kronik bir hastalık için düzenli ilaç kullanıyor musunuz?' },
  { id: 'eklem', q: 'Fiziksel aktiviteyle kötüleşebilecek bir kemik, eklem veya yumuşak doku sorununuz var mı?' },
  { id: 'gozetim', q: 'Bir hekim size yalnızca tıbbi gözetim altında egzersiz yapmanızı söyledi mi?' },
];

/** @returns {{clearance:boolean, flags:string[], message:string|null}} clearance: false → hekime danışılmalı */
export function screen(answers = {}) {
  const flags = SCREENING.filter((s) => answers[s.id] === true).map((s) => s.id);
  const unanswered = SCREENING.filter((s) => typeof answers[s.id] !== 'boolean').length;
  if (unanswered) return { clearance: false, flags, unanswered, message: 'Tüm soruları yanıtlayın.' };
  if (!flags.length) return { clearance: true, flags, message: null };
  return {
    clearance: false, flags,
    message: 'Yanıtlarınızdan en az biri "evet". Yoğunluğu artırmadan önce bir hekime danışmanızı öneririz. O zamana kadar plan yalnızca düşük yoğunluklu hareketlilik ve yürüyüş içerir.',
  };
}

/** Kullanıcı profiline uygun egzersizler. */
export function eligible(profile) {
  const lim = new Set(profile.limitations ?? []);
  // Her yerde var sayılan: duvar, sandalye, yerde mat/havlu. Salonda ek olarak makineler, dambıl, bisiklet, bant.
  const have = new Set([...(profile.equipment ?? []), 'duvar', 'sandalye', 'mat',
    ...(profile.location === 'salon' ? ['makine', 'dambil', 'bisiklet', 'direnc-bandi'] : [])]);
  const maxLevel = profile.clearance === false ? 1 : LEVEL_MAX[profile.level ?? 'baslangic'] ?? 1;
  return EXERCISES.filter((e) => e.location.includes(profile.location ?? 'ev')
    && e.equipment.every((x) => have.has(x))
    && e.avoid.every((r) => !lim.has(r))
    && e.level <= maxLevel
    && (profile.clearance !== false || ['hareketlilik', 'kardiyo', 'nefes', 'durus'].includes(e.type)));
}

// Hedefe göre ana bölüm "yuvaları": her yuva bir tür/bölge kategorisidir; sırayla doldurulur.
const SLOTS = {
  kondisyon: ['alt', 'itis', 'cekis', 'govde', 'kardiyo', 'alt', 'itis'],
  kuvvet: ['alt', 'itis', 'cekis', 'govde', 'alt', 'cekis', 'itis'],
  hareketlilik: ['mob', 'mob', 'durus', 'mob', 'govde', 'mob'],
  durus: ['durus', 'cekis', 'durus', 'govde', 'mob', 'durus'],
  aktivite: ['yuruyus', 'alt', 'govde', 'durus'],
  kilo: ['alt', 'itis', 'kardiyo', 'cekis', 'govde', 'kardiyo', 'alt'],
  aliskanlik: ['alt', 'durus', 'govde'],
};
const SLOT_MATCH = {
  alt: (e) => e.type === 'kuvvet' && e.muscles.includes('mus-hip-thigh'),
  itis: (e) => e.type === 'kuvvet' && e.muscles.includes('mus-chest'),
  cekis: (e) => e.type === 'kuvvet' && e.muscles[0] === 'mus-back',
  govde: (e) => e.type === 'kuvvet' && e.muscles.includes('mus-abdomen') && !e.muscles.includes('mus-hip-thigh') || e.id === 'kus-kopek',
  kardiyo: (e) => e.type === 'kardiyo' && !e.warmup,
  yuruyus: (e) => e.id === 'tempolu-yuruyus' || e.id === 'bisiklet',
  mob: (e) => e.type === 'hareketlilik',
  durus: (e) => e.type === 'durus',
};

/** Belirlenimci seçim: tohum + yuva dizini ile döndürerek çeşitlilik. */
function pick(pool, used, seed) {
  const fresh = pool.filter((e) => !used.has(e.id));
  const list = fresh.length ? fresh : pool;
  return list.length ? list[seed % list.length] : null;
}

/**
 * Tek oturum oluşturur (ısınma + ana bölüm + soğuma), süre bütçesine sığdırır.
 * @param {object} profile {goal, level, location, equipment, limitations, minutesPerDay, clearance}
 * @param {number} variant oturum çeşidi (A/B/C dönüşümü)
 */
export function buildSession(profile, variant = 0, progress = {}) {
  const pool = eligible(profile);
  const budget = Math.max(8, Math.min(90, profile.minutesPerDay ?? 20)) * 60;
  const items = [];
  const used = new Set();
  const add = (e, role) => {
    if (!e) return false;
    const dose = scaleDose(e, profile, progress[e.id]);
    items.push({ id: e.id, role, dose, done: false });
    used.add(e.id);
    return true;
  };
  // Isınma (~%15) ve soğuma (~%10)
  const warm = pool.filter((e) => e.warmup);
  const cool = pool.filter((e) => e.cooldown);
  add(pick(warm, used, variant), 'isinma');
  if (budget >= 15 * 60) add(pick(warm, used, variant + 1), 'isinma');
  const coolPick = pick(cool, used, variant);
  const coolSec = coolPick ? exerciseSeconds(coolPick.dose) : 0;
  let spent = items.reduce((s, it) => s + exerciseSeconds(it.dose), 0);
  const slots = profile.clearance === false ? ['mob', 'yuruyus', 'durus', 'mob'] : SLOTS[profile.goal] ?? SLOTS.kondisyon;
  for (let i = 0; i < slots.length * 2; i++) {
    const slot = slots[i % slots.length];
    const candidates = pool.filter((e) => SLOT_MATCH[slot]?.(e) && !e.warmup && !e.cooldown);
    const e = pick(candidates, used, variant + i);
    if (!e || used.has(e.id)) continue;
    let dose = scaleDose(e, profile, progress[e.id]);
    // Uzun kardiyo süresini kalan bütçeye sığdır
    if (e.type === 'kardiyo' && dose.seconds) dose = { ...dose, seconds: Math.max(120, Math.min(dose.seconds, budget - spent - coolSec - 60)) };
    const t = exerciseSeconds(dose);
    if (spent + t + coolSec > budget) continue;
    items.push({ id: e.id, role: 'ana', dose, done: false });
    used.add(e.id);
    spent += t;
  }
  // Bütçe dolmadıysa ana egzersizlere set ekle (kuvvet en çok 4, diğerleri 3 set; kardiyo süre uzatılır)
  for (let guard = 0; guard < 20 && spent + coolSec < budget * 0.85; guard++) {
    let grew = false;
    for (const it of items.filter((x) => x.role === 'ana')) {
      const e = BY_ID[it.id];
      const before = exerciseSeconds(it.dose);
      const d = { ...it.dose };
      if (e.type === 'kardiyo' && d.seconds) d.seconds += 60;
      else if (d.sets < (e.type === 'kuvvet' ? 4 : 3)) d.sets += 1;
      else continue;
      const delta = exerciseSeconds(d) - before;
      if (spent + delta + coolSec > budget) continue;
      it.dose = d; spent += delta; grew = true;
    }
    if (!grew) break;
  }
  // Hâlâ bütçenin altındaysa (küçük ekipmansız havuz) kalan süreyi tempolu yürüyüşle doldur
  const walk = pool.find((e) => e.id === 'tempolu-yuruyus' || e.id === 'bisiklet');
  const remain = budget - spent - coolSec;
  if (walk && remain >= 180 && spent + coolSec < budget * 0.7) {
    const prev = items.find((x) => x.id === walk.id);
    if (prev) { const extra = Math.min(remain - 30, 1800 - prev.dose.seconds); if (extra > 0) { prev.dose = { ...prev.dose, seconds: prev.dose.seconds + extra }; spent += extra; } }
    else { const sec = Math.min(1800, remain - 30); items.push({ id: walk.id, role: 'ana', dose: { ...walk.dose, seconds: sec }, done: false }); used.add(walk.id); spent += sec + 20; }
  }
  if (coolPick && !used.has(coolPick.id)) add(coolPick, 'soguma');
  return { variant, items, estMinutes: Math.round(items.reduce((s, it) => s + exerciseSeconds(it.dose), 0) / 60) };
}

/** Seviye ve kişisel ilerlemeye göre doz. step: + zorlaştırma, − kolaylaştırma adımı. */
export function scaleDose(e, profile, prog = {}) {
  const d = { ...e.dose };
  const lvl = profile.clearance === false ? 'baslangic' : profile.level ?? 'baslangic';
  if (e.type === 'kuvvet') {
    if (lvl === 'baslangic') d.sets = Math.max(1, d.sets - 1);
    if (lvl === 'ileri') d.sets += 1;
  }
  const step = prog.step ?? 0;
  if (d.reps) d.reps = clamp(d.reps + 2 * step, 4, 20);
  if (d.seconds && e.type !== 'kardiyo') d.seconds = clamp(d.seconds + 10 * step, 10, 90);
  if (d.seconds && e.type === 'kardiyo') d.seconds = clamp(d.seconds + 60 * step, 60, 1800);
  return d;
}
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));

/** Haftalık plan: gün dağılımı (arada dinlenme), oturum çeşitleri dönüşümlü. */
export function buildPlan(profile, { weekStart = null, progress = {} } = {}) {
  const days = clamp(profile.daysPerWeek ?? 3, 1, 6);
  const pattern = { 1: [2], 2: [1, 4], 3: [0, 2, 4], 4: [0, 1, 3, 4], 5: [0, 1, 2, 4, 5], 6: [0, 1, 2, 3, 4, 5] }[days];
  const sessions = pattern.map((dow, i) => ({ dow, day: DAY_NAMES[dow], ...buildSession(profile, i, progress), status: 'planli' }));
  const restTip = profile.goal === 'aktivite' || profile.goal === 'kilo' ? 'Dinlenme günlerinde hafif yürüyüş önerilir.' : 'Dinlenme günlerinde hafif hareket ve esnetme yeterlidir.';
  return {
    created: new Date().toISOString(), weekStart, profile: { ...profile }, sessions, restTip,
    note: profile.clearance === false ? 'Hekime danışılana kadar düşük yoğunluklu plan.' : null,
  };
}

/** Bir oturumda egzersizi kolaylaştır / zorlaştır / değiştir. */
export function adjustExercise(plan, sIdx, iIdx, action, progress = {}) {
  const p = structuredClone(plan);
  const it = p.sessions[sIdx].items[iIdx];
  const e = BY_ID[it.id];
  const pool = eligible(p.profile);
  let next = null;
  if (action === 'easier') next = e.easier && pool.some((x) => x.id === e.easier) ? BY_ID[e.easier] : null;
  if (action === 'harder') next = e.harder && pool.some((x) => x.id === e.harder) ? BY_ID[e.harder] : null;
  if (action === 'replace') {
    const usedIds = new Set(p.sessions[sIdx].items.map((x) => x.id));
    next = pool.find((x) => x.type === e.type && x.id !== e.id && !usedIds.has(x.id) && x.muscles[0] === e.muscles[0])
      ?? pool.find((x) => x.type === e.type && x.id !== e.id && !usedIds.has(x.id)) ?? null;
  }
  if (next) p.sessions[sIdx].items[iIdx] = { id: next.id, role: it.role, dose: scaleDose(next, p.profile, progress[next.id]), done: false };
  else if (action === 'easier' || action === 'harder') {
    // Varyant yoksa doz ayarı (±1 adım)
    const step = (progress[e.id]?.step ?? 0) + (action === 'harder' ? 1 : -1);
    p.sessions[sIdx].items[iIdx].dose = scaleDose(e, p.profile, { step });
  }
  return { plan: p, changed: Boolean(next) || action !== 'replace' };
}

/** Oturumu bir sonraki boş güne ertele (hafta içinde). */
export function postpone(plan, sIdx) {
  const p = structuredClone(plan);
  const taken = new Set(p.sessions.map((s) => s.dow));
  const s = p.sessions[sIdx];
  for (let d = s.dow + 1; d < 7; d++) {
    if (!taken.has(d)) { s.dow = d; s.day = DAY_NAMES[d]; s.status = 'ertelendi'; return { plan: p, ok: true }; }
  }
  return { plan: p, ok: false, message: 'Bu hafta içinde boş gün yok; oturumu atlayıp gelecek haftaya geçebilirsiniz.' };
}

/**
 * Antrenman sonrası geri bildirim → ilerleme durumu ve güvenlik yönlendirmesi.
 * @param {Record<string,{step:number, ok?:number}>} progress egzersiz başına ilerleme
 * @param {{feeling:'kolay'|'uygun'|'zor', rpe?:number, pain?:string[]|null, dizziness?:boolean, chestPain?:boolean, breathless?:boolean}} fb
 * @param {string[]} exerciseIds bu oturumda yapılan egzersizler
 */
export function applyFeedback(progress, fb, exerciseIds) {
  const next = structuredClone(progress ?? {});
  const out = { progress: next, increased: [], decreased: [], paused: false, avoid: [], messages: [] };
  if (fb.chestPain) {
    out.paused = true;
    out.urgent = true;
    out.messages.push('Göğüs ağrısı acil bir durumun belirtisi olabilir. Egzersizi hemen bırakın; ağrı sürüyorsa veya nefes darlığı, terleme, kola/çeneye yayılan ağrı varsa 112\'yi arayın.');
    return out;
  }
  if (fb.dizziness || fb.breathless) {
    out.paused = true;
    out.messages.push('Baş dönmesi veya olağan dışı nefes darlığı bildirdiniz. Yük artırılmadı ve sonraki oturumlar durduruldu. Belirtiler geçene kadar dinlenin; tekrarlarsa veya sürerse bir hekime danışın. Kendinizi iyi hissettiğinizde planı yeniden başlatabilirsiniz.');
    return out;
  }
  if (fb.pain?.length) {
    out.avoid = fb.pain;
    for (const id of exerciseIds) {
      const e = BY_ID[id];
      if (e && e.avoid.some((r) => fb.pain.includes(r))) { next[id] = { ...(next[id] ?? {}), avoid: true }; }
    }
    out.messages.push(`Ağrı bildirdiniz (${fb.pain.join(', ')}). Bu hafta hiçbir egzersizin yükü artırılmadı; ilgili bölgeyi zorlayan hareketler plandan çıkarılacak. Ağrı keskinse, şişlik/uyuşma varsa veya birkaç gün içinde geçmezse bir sağlık profesyoneline başvurun.`);
    return out;
  }
  const rpe = fb.rpe ?? { kolay: 4, uygun: 6, zor: 8 }[fb.feeling] ?? 6;
  for (const id of exerciseIds) {
    const cur = next[id] ?? { step: 0, ok: 0 };
    if (rpe >= 8 || fb.feeling === 'zor') { cur.step = Math.max(-3, (cur.step ?? 0) - 1); cur.ok = 0; out.decreased.push(id); }
    else if (rpe <= 4 || fb.feeling === 'kolay') { cur.step = Math.min(5, (cur.step ?? 0) + 1); cur.ok = 0; out.increased.push(id); }
    else {
      // "Uygun": iki uygun oturumda bir küçük artış (kademeli yüklenme)
      cur.ok = (cur.ok ?? 0) + 1;
      if (cur.ok >= 2) { cur.step = Math.min(5, (cur.step ?? 0) + 1); cur.ok = 0; out.increased.push(id); }
    }
    next[id] = cur;
  }
  if (out.decreased.length) out.messages.push('Zorlandığınızı bildirdiniz; sonraki oturumda tekrar/süreler biraz azaltıldı.');
  else if (out.increased.length) out.messages.push('İyi gidiyorsunuz; bazı egzersizlerde tekrar/süre küçük adımlarla artırıldı.');
  else out.messages.push('Mevcut yük korunuyor; bir sonraki uygun oturumda küçük bir artış yapılacak.');
  return out;
}

/** Ağrı nedeniyle kaçınılan egzersizleri profile ekler (sonraki plan bu bölgeleri dışlar). */
export function withAvoidedRegions(profile, regions) {
  return { ...profile, limitations: [...new Set([...(profile.limitations ?? []), ...regions])] };
}
