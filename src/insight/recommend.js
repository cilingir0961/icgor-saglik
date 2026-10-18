// Bölgeye uygun egzersiz önerileri (saf). Egzersizler tedavi DEĞİLDİR; genel, kontrollü hareketlerdir.
// Süzgeç: kişinin seviyesi, yeri, ekipmanı, güvenlik ön değerlendirmesi ve kısıtlı/ağrılı bölgeleri
// (planner.eligible). Ağrı, uyuşma, güç kaybı veya baş dönmesi bildirildiyse öneri YAPILMAZ.

import { eligible } from '../fitness/planner.js';
import { BY_ID, doseText } from '../fitness/exercises.js';
import { BODY_REGIONS } from './regions.js';

const DAY = 86400000;

/** Bölge → aday egzersizler (öncelik sırasıyla; hafif ve kontrollü olanlar önde). */
export const REGION_EXERCISES = {
  'bas-boyun': ['cene-ice', 'duvar-melek', 'gogus-esneme', 'bant-acma'],
  'omuz-L': ['kol-kaldirma', 'kol-cevirme', 'duvar-melek', 'bant-kurek', 'gogus-esneme'],
  'omuz-R': ['kol-kaldirma', 'kol-cevirme', 'duvar-melek', 'bant-kurek', 'gogus-esneme'],
  govde: ['kus-kopek', 'olu-bocek', 'diz-plank', 'kedi-deve', 'tek-ayak-denge'],
  kalca: ['kopru', 'kalca-cevirme', 'kalca-on-esneme', 'tek-ayak-denge'],
  'diz-L': ['otur-kalk', 'kopru', 'topuk-yukselt', 'duvar-oturma', 'squat'],
  'diz-R': ['otur-kalk', 'kopru', 'topuk-yukselt', 'duvar-oturma', 'squat'],
  denge: ['tek-ayak-denge', 'topuk-yukselt', 'yerinde-yuruyus'],
};

const DEFAULT_PROFILE = { level: 'baslangic', location: 'ev', equipment: [], limitations: [], clearance: true };

/** Son günlerde bildirilen uyarı belirtileri (antrenman geri bildirimi veya Bana Anlat'taki belirti kaydı). */
export function warningSigns(state, regionId = null, now = new Date()) {
  const out = [];
  const recent = (iso, days) => iso && now - new Date(iso) < days * DAY;
  const fb = state.trainer?.history?.at(-1);
  if (fb && recent(fb.date, 7)) {
    const f = fb.feedback ?? {};
    if (f.chestPain) out.push('göğüs ağrısı');
    if (f.dizziness) out.push('baş dönmesi');
    if (f.breathless) out.push('olağan dışı nefes darlığı');
    if (f.numbness) out.push('uyuşma');
    if (f.weakness) out.push('güç kaybı');
  }
  if (state.trainer?.paused) out.push('antrenman planı duraklatıldı');
  const sym = state.insight?.symptoms ?? {};
  for (const [rid, s] of Object.entries(sym)) {
    if (s?.on && recent(s.date, 14) && (!regionId || rid === regionId)) out.push(`${BODY_REGIONS[rid]?.tr ?? rid}: ${s.kinds?.join(', ') || 'ağrı'}`);
  }
  return [...new Set(out)];
}

/**
 * @returns {{blocked:boolean, message:string|null, exercises:{id,tr,desc,dose,camera}[]}}
 */
export function recommend(regionId, state, now = new Date(), max = 3) {
  const R = BODY_REGIONS[regionId];
  const profile = { ...DEFAULT_PROFILE, ...(state.profile ?? {}) };
  const signs = warningSigns(state, regionId, now);
  const limited = (profile.limitations ?? []).includes(R.exRegion);
  if (signs.length) {
    return { blocked: true, exercises: [], message: `Bildirdiğin belirtiler nedeniyle (${signs.join('; ')}) şu an egzersiz önermiyoruz. Ağrı, uyuşma, güç kaybı veya baş dönmesi egzersizle zorlanmamalı; bir hekime veya fizyoterapiste danış. Göğüs ağrısı, ani güç kaybı veya konuşma bozukluğu varsa 112'yi ara.` };
  }
  if (limited) {
    return { blocked: true, exercises: [], message: `Profilinde "${R.exRegion}" bölgesini kısıtlı/ağrılı olarak işaretledin; bu bölgeyi çalıştıran egzersiz önermiyoruz. Bir sağlık profesyonelinin önerdiği hareketlerle devam etmen daha uygun.` };
  }
  const ok = new Set(eligible(profile).map((e) => e.id));
  const exercises = (REGION_EXERCISES[regionId] ?? []).filter((id) => ok.has(id)).slice(0, max)
    .map((id) => { const e = BY_ID[id]; return { id, tr: e.tr, desc: e.desc, dose: doseText(e.dose), camera: e.camera, level: e.level }; });
  return {
    blocked: false, exercises,
    message: exercises.length
      ? 'Bunlar genel ve kontrollü hareketlerdir, bir tedavi değildir. Rahat olduğun aralıkta yap; ağrı olursa dur.'
      : 'Seviyene, ekipmanına ve kısıtlarına uygun bir hareket bulunamadı. Antrenman ekranındaki profilini güncelleyebilirsin.',
  };
}
