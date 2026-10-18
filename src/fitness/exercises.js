// Egzersiz kütüphanesi (Türkçe, saf veri). Genel fitness eğitimi içindir; tedavi/rehabilitasyon programı DEĞİLDİR.
// muscles: 3B atlas yapı kimlikleri (assets/anatomy/manifest.json) — hedef kas grupları vurgusu için.
// avoid: bu bölgelerde kısıtlaması/ağrısı olan kullanıcıya önerilmez (diz, omuz, bel, boyun, denge, bilek).
// camera: kamera koçunun güvenilir izleyebildiği hareket türü (src/fitness/coach.js); motion: 3B rig animasyonu.

export const TYPES = { kuvvet: 'Kuvvet', hareketlilik: 'Hareketlilik', kardiyo: 'Kardiyo', denge: 'Denge', durus: 'Duruş farkındalığı', nefes: 'Nefes / soğuma' };
export const EQUIPMENT = { sandalye: 'Sandalye', mat: 'Mat', 'direnc-bandi': 'Direnç bandı', dambil: 'Dambıl', makine: 'Spor salonu makineleri', bisiklet: 'Sabit bisiklet', duvar: 'Duvar' };
export const REGIONS = { diz: 'Diz', omuz: 'Omuz', bel: 'Bel', boyun: 'Boyun', denge: 'Denge', bilek: 'El bileği' };

const E = (o) => ({ equipment: [], location: ['ev', 'salon'], avoid: [], cues: [], safety: [], camera: null, motion: null, tempo: null, ...o });

export const EXERCISES = [
  // ---- Isınma / hareketlilik ----
  E({ id: 'yerinde-yuruyus', tr: 'Yerinde yürüyüş', type: 'kardiyo', level: 1, muscles: ['mus-hip-thigh', 'mus-leg-foot'],
    desc: 'Kollarınızı doğal sallayarak yerinde yürüyün.', cues: ['Dik durun', 'Rahat nefes alın'], dose: { sets: 1, seconds: 90, restS: 0 }, warmup: true, harder: 'diz-kaldirma' }),
  E({ id: 'diz-kaldirma', tr: 'Yerinde diz kaldırma (düşük etki)', type: 'kardiyo', level: 2, muscles: ['mus-hip-thigh', 'mus-abdomen'], avoid: ['diz', 'denge'],
    desc: 'Dizleri sırayla kalça hizasına doğru kaldırın; zıplamadan.', dose: { sets: 2, seconds: 40, restS: 30 }, easier: 'yerinde-yuruyus' }),
  E({ id: 'kol-cevirme', tr: 'Kol çevirme', type: 'hareketlilik', level: 1, muscles: ['mus-shoulder-arm', 'mus-back'], avoid: ['omuz'],
    desc: 'Kollar yanda, küçükten büyüğe daireler çizin; ileri ve geri.', dose: { sets: 1, seconds: 40, restS: 0 }, warmup: true }),
  E({ id: 'kalca-cevirme', tr: 'Kalça çevirme', type: 'hareketlilik', level: 1, muscles: ['mus-hip-thigh', 'mus-pelvic', 'mus-abdomen'],
    desc: 'Eller belde, kalçayla yavaş daireler çizin; iki yöne.', dose: { sets: 1, seconds: 40, restS: 0 }, warmup: true }),
  E({ id: 'kedi-deve', tr: 'Kedi–deve', type: 'hareketlilik', level: 1, equipment: ['mat'], muscles: ['mus-back', 'mus-abdomen', 'spine'], avoid: ['bilek'],
    desc: 'Dört ayak üstünde sırtınızı yavaşça yuvarlayıp sonra çukurlaştırın.', cues: ['Hareketi nefesle eşleştirin', 'Ağrısız aralıkta kalın'], dose: { sets: 1, reps: 8, restS: 0 }, warmup: true }),
  E({ id: 'kol-kaldirma', tr: 'Kolları yandan kaldırma', type: 'hareketlilik', level: 1, muscles: ['mus-shoulder-arm', 'mus-back'], avoid: ['omuz'],
    desc: 'Kollar yanda, dirsekler düz, rahat olduğunuz kadar yandan kaldırıp indirin.', cues: ['Omuzları kulağa çekmeyin', 'Yavaş ve kontrollü'],
    dose: { sets: 2, reps: 10, restS: 30 }, camera: 'arm-raise', motion: 'kol-kaldirma', warmup: true }),
  // ---- Duruş farkındalığı ----
  E({ id: 'cene-ice', tr: 'Çene içe alma', type: 'durus', level: 1, muscles: ['mus-head-neck'], avoid: [],
    desc: 'Başınızı eğmeden, çenenizi geriye doğru kaydırıp "çift çene" yapın, 3 saniye tutun.', cues: ['Karşıya bakın', 'Boyun arkası uzar'], safety: ['Baş dönmesi veya kola yayılan uyuşma olursa bırakın'],
    dose: { sets: 2, reps: 8, restS: 20 } }),
  E({ id: 'duvar-melek', tr: 'Duvar meleği', type: 'durus', level: 1, equipment: ['duvar'], muscles: ['mus-back', 'mus-shoulder-arm'], avoid: ['omuz'],
    desc: 'Sırtınız duvarda, kollar "kaktüs" pozisyonunda duvara değerek yavaşça yukarı kaydırın ve indirin.', dose: { sets: 2, reps: 8, restS: 30 } }),
  E({ id: 'bant-acma', tr: 'Bantla göğüs açma', type: 'durus', level: 1, equipment: ['direnc-bandi'], muscles: ['mus-back', 'mus-shoulder-arm'], avoid: ['omuz'],
    desc: 'Bant göğüs hizasında, kollar düz; kürek kemiklerini yaklaştırarak bandı yanlara açın.', dose: { sets: 2, reps: 12, restS: 40 }, harder: 'bant-kurek' }),
  E({ id: 'gogus-esneme', tr: 'Kapı aralığında göğüs esnetme', type: 'hareketlilik', level: 1, muscles: ['mus-chest', 'mus-shoulder-arm'], avoid: ['omuz'],
    desc: 'Ön kollar kapı kasasında, bir adım öne geçip göğüste hafif gerilme hissedin.', safety: ['Ağrı değil, hafif gerilme hissedilmeli'], dose: { sets: 2, seconds: 30, restS: 15 }, cooldown: true }),
  // ---- Kuvvet: alt beden ----
  E({ id: 'otur-kalk', tr: 'Sandalyeden oturup kalkma', type: 'kuvvet', level: 1, equipment: ['sandalye'], muscles: ['mus-hip-thigh', 'mus-leg-foot', 'mus-abdomen'],
    desc: 'Sağlam bir sandalyeye kontrollü oturun ve elleri kullanmadan kalkın.', cues: ['Dizler ayak uçlarıyla aynı yöne', 'Ağırlık topuklarda'], safety: ['Sandalye kaymamalı (duvara dayalı)'],
    dose: { sets: 2, reps: 10, restS: 60 }, camera: 'sit-to-stand', motion: 'squat', harder: 'squat' }),
  E({ id: 'squat', tr: 'Squat (vücut ağırlığı)', type: 'kuvvet', level: 2, muscles: ['mus-hip-thigh', 'mus-leg-foot', 'mus-back', 'mus-abdomen'], avoid: ['diz'],
    desc: 'Ayaklar kalça genişliğinde, kalçayı geriye vererek rahat olduğunuz derinliğe inin ve kalkın.', cues: ['Göğüs açık', 'Dizler içe çökmesin', 'Topuklar yerde'],
    dose: { sets: 3, reps: 10, restS: 60 }, camera: 'squat', motion: 'squat', easier: 'otur-kalk', harder: 'goblet-squat', tempo: '2-0-2' }),
  E({ id: 'duvar-oturma', tr: 'Duvarda oturma', type: 'kuvvet', level: 2, equipment: ['duvar'], muscles: ['mus-hip-thigh'], avoid: ['diz'],
    desc: 'Sırt duvarda, dizler en fazla 90° olacak şekilde aşağı kayın ve tutun.', dose: { sets: 2, seconds: 25, restS: 45 }, easier: 'otur-kalk' }),
  E({ id: 'geri-hamle', tr: 'Geriye adım hamle', type: 'kuvvet', level: 2, muscles: ['mus-hip-thigh', 'mus-leg-foot'], avoid: ['diz', 'denge'],
    desc: 'Bir ayağınızla geri adım atıp iki dizi bükün, öndeki topuktan iterek dönün.', safety: ['Dengeniz için bir desteğin yanında yapın'], dose: { sets: 2, reps: 8, restS: 60 }, easier: 'otur-kalk' }),
  E({ id: 'kopru', tr: 'Kalça köprüsü', type: 'kuvvet', level: 1, equipment: ['mat'], muscles: ['mus-hip-thigh', 'mus-pelvic', 'mus-back'],
    desc: 'Sırtüstü, dizler bükülü; kalçayı omuz–diz hizasına kaldırın, 2 saniye tutup indirin.', dose: { sets: 2, reps: 12, restS: 45 }, harder: 'tek-bacak-kopru' }),
  E({ id: 'tek-bacak-kopru', tr: 'Tek bacak kalça köprüsü', type: 'kuvvet', level: 3, equipment: ['mat'], muscles: ['mus-hip-thigh', 'mus-pelvic'], avoid: ['bel'],
    desc: 'Köprüyü bir bacak düz uzatılmışken yapın; iki tarafa eşit.', dose: { sets: 2, reps: 8, restS: 60 }, easier: 'kopru' }),
  E({ id: 'topuk-yukselt', tr: 'Topuk yükseltme', type: 'kuvvet', level: 1, muscles: ['mus-leg-foot'], avoid: [],
    desc: 'Bir desteğe hafifçe tutunarak parmak uçlarına yükselin ve yavaşça inin.', dose: { sets: 2, reps: 15, restS: 30 } }),
  E({ id: 'goblet-squat', tr: 'Dambılla goblet squat', type: 'kuvvet', level: 3, equipment: ['dambil'], muscles: ['mus-hip-thigh', 'mus-leg-foot', 'mus-abdomen'], avoid: ['diz', 'bel'],
    desc: 'Dambılı göğüs önünde tutarak squat yapın.', dose: { sets: 3, reps: 10, restS: 75 }, camera: 'squat', motion: 'squat', easier: 'squat' }),
  E({ id: 'bacak-pres', tr: 'Bacak pres (makine)', type: 'kuvvet', level: 1, equipment: ['makine'], location: ['salon'], muscles: ['mus-hip-thigh', 'mus-leg-foot'], avoid: ['diz'],
    desc: 'Sırt pedde, ayaklar platformda omuz genişliğinde; dizleri kilitlemeden itin.', safety: ['Ağırlığı salon görevlisiyle ayarlayın'], dose: { sets: 3, reps: 12, restS: 75 } }),
  // ---- Kuvvet: üst beden ----
  E({ id: 'duvar-sinav', tr: 'Duvar şınavı', type: 'kuvvet', level: 1, equipment: ['duvar'], muscles: ['mus-chest', 'mus-shoulder-arm'], avoid: ['bilek'],
    desc: 'Eller omuz hizasında duvarda, gövde düz; dirsekleri bükerek göğsü duvara yaklaştırın.', dose: { sets: 2, reps: 10, restS: 45 }, harder: 'egik-sinav' }),
  E({ id: 'egik-sinav', tr: 'Eğik şınav (masa/tezgâh)', type: 'kuvvet', level: 2, muscles: ['mus-chest', 'mus-shoulder-arm', 'mus-abdomen'], avoid: ['bilek', 'omuz'],
    desc: 'Eller sağlam bir yüzeyde, gövde düz bir çizgide şınav.', dose: { sets: 3, reps: 8, restS: 60 }, easier: 'duvar-sinav', harder: 'sinav' }),
  E({ id: 'sinav', tr: 'Şınav', type: 'kuvvet', level: 3, equipment: ['mat'], muscles: ['mus-chest', 'mus-shoulder-arm', 'mus-abdomen'], avoid: ['bilek', 'omuz'],
    desc: 'Yerde, gövde düz; göğsü yere yaklaştırıp itin. Gerekirse dizler yerde.', dose: { sets: 3, reps: 8, restS: 75 }, easier: 'egik-sinav' }),
  E({ id: 'bant-kurek', tr: 'Bantla kürek çekiş', type: 'kuvvet', level: 1, equipment: ['direnc-bandi'], muscles: ['mus-back', 'mus-shoulder-arm'],
    desc: 'Bant sabit bir noktada; dirsekleri geriye çekerek kürek kemiklerini yaklaştırın.', dose: { sets: 3, reps: 12, restS: 45 }, easier: 'bant-acma' }),
  E({ id: 'dambil-kurek', tr: 'Tek kol dambıl çekiş', type: 'kuvvet', level: 2, equipment: ['dambil'], muscles: ['mus-back', 'mus-shoulder-arm'], avoid: ['bel'],
    desc: 'Bir el ve diz bankta/sandalyede, sırt düz; dambılı kalçaya doğru çekin.', dose: { sets: 3, reps: 10, restS: 60 } }),
  E({ id: 'omuz-pres', tr: 'Dambılla omuz pres', type: 'kuvvet', level: 2, equipment: ['dambil'], muscles: ['mus-shoulder-arm'], avoid: ['omuz', 'boyun'],
    desc: 'Oturarak dambılları omuz hizasından yukarı itin, kontrollü indirin.', dose: { sets: 3, reps: 10, restS: 60 } }),
  E({ id: 'lat-cekis', tr: 'Lat çekiş (makine)', type: 'kuvvet', level: 1, equipment: ['makine'], location: ['salon'], muscles: ['mus-back', 'mus-shoulder-arm'], avoid: ['omuz'],
    desc: 'Barı göğsün üst kısmına doğru çekin; boyun arkasına değil.', dose: { sets: 3, reps: 12, restS: 60 } }),
  E({ id: 'gogus-pres', tr: 'Göğüs pres (makine)', type: 'kuvvet', level: 1, equipment: ['makine'], location: ['salon'], muscles: ['mus-chest', 'mus-shoulder-arm'], avoid: ['omuz'],
    desc: 'Sırt pedde, kolları öne itin; dirsekleri kilitlemeyin.', dose: { sets: 3, reps: 12, restS: 60 } }),
  E({ id: 'oturarak-kurek', tr: 'Oturarak kürek (makine/kablo)', type: 'kuvvet', level: 1, equipment: ['makine'], location: ['salon'], muscles: ['mus-back', 'mus-shoulder-arm'],
    desc: 'Gövde dik, tutacağı karna doğru çekin, kürek kemiklerini yaklaştırın.', dose: { sets: 3, reps: 12, restS: 60 } }),
  // ---- Gövde ----
  E({ id: 'kus-kopek', tr: 'Kuş–köpek', type: 'kuvvet', level: 1, equipment: ['mat'], muscles: ['mus-back', 'mus-abdomen', 'mus-hip-thigh'], avoid: ['bilek'],
    desc: 'Dört ayak üstünde karşı kol ve bacağı uzatıp 2 saniye tutun; beli çukurlaştırmadan.', dose: { sets: 2, reps: 8, restS: 30 } }),
  E({ id: 'olu-bocek', tr: 'Ölü böcek', type: 'kuvvet', level: 2, equipment: ['mat'], muscles: ['mus-abdomen', 'mus-hip-thigh'],
    desc: 'Sırtüstü, kollar yukarı, dizler 90°; karşı kol ve bacağı yavaşça uzatın, bel yerde kalsın.', dose: { sets: 2, reps: 8, restS: 30 } }),
  E({ id: 'diz-plank', tr: 'Dizüstü plank', type: 'kuvvet', level: 1, equipment: ['mat'], muscles: ['mus-abdomen', 'mus-shoulder-arm'], avoid: ['omuz'],
    desc: 'Ön kollar ve dizler yerde, omuzdan dize düz çizgi; tutun.', dose: { sets: 2, seconds: 20, restS: 30 }, harder: 'plank' }),
  E({ id: 'plank', tr: 'Plank', type: 'kuvvet', level: 2, equipment: ['mat'], muscles: ['mus-abdomen', 'mus-shoulder-arm', 'mus-back'], avoid: ['omuz', 'bel'],
    desc: 'Ön kollar ve ayak uçları yerde, gövde düz; tutun. Nefesi tutmayın.', dose: { sets: 2, seconds: 30, restS: 40 }, easier: 'diz-plank' }),
  // ---- Kardiyo, denge, soğuma ----
  E({ id: 'tempolu-yuruyus', tr: 'Tempolu yürüyüş', type: 'kardiyo', level: 1, muscles: ['mus-hip-thigh', 'mus-leg-foot'],
    desc: 'Konuşabileceğiniz ama şarkı söyleyemeyeceğiniz bir tempoda yürüyün.', dose: { sets: 1, seconds: 600, restS: 0 }, camera: 'walk' }),
  E({ id: 'bisiklet', tr: 'Sabit bisiklet', type: 'kardiyo', level: 1, equipment: ['bisiklet'], location: ['salon', 'ev'], muscles: ['mus-hip-thigh', 'mus-leg-foot'],
    desc: 'Orta dirençte, rahat konuşabileceğiniz tempoda pedal çevirin.', dose: { sets: 1, seconds: 600, restS: 0 } }),
  E({ id: 'tek-ayak-denge', tr: 'Destekli tek ayak denge', type: 'denge', level: 2, muscles: ['mus-leg-foot', 'mus-hip-thigh'], avoid: ['denge'],
    desc: 'Bir eliniz sağlam bir desteğin yakınında, tek ayak üzerinde durun; iki tarafa.', safety: ['Daima destek yanında', 'Baş dönmesinde hemen bırakın'], dose: { sets: 2, seconds: 20, restS: 20 } }),
  E({ id: 'hamstring-esneme', tr: 'Arka bacak esnetme', type: 'hareketlilik', level: 1, muscles: ['mus-hip-thigh'], avoid: ['bel'],
    desc: 'Topuk önde alçak bir basamakta, sırt düz; kalçadan hafifçe öne eğilin.', dose: { sets: 1, seconds: 30, restS: 10 }, cooldown: true }),
  E({ id: 'kalca-on-esneme', tr: 'Kalça ön esnetme', type: 'hareketlilik', level: 1, muscles: ['mus-hip-thigh', 'mus-pelvic'], avoid: ['diz'],
    desc: 'Yarım diz çökme pozisyonunda kalçayı hafifçe öne itin; iki tarafa.', dose: { sets: 1, seconds: 30, restS: 10 }, cooldown: true }),
  E({ id: 'diyafram-nefes', tr: 'Diyafram nefesi', type: 'nefes', level: 1, muscles: ['diaphragm', 'mus-abdomen'],
    desc: 'Bir el göğüste bir el karında; burundan alıp karnı şişirin, yavaşça verin.', dose: { sets: 1, seconds: 60, restS: 0 }, cooldown: true }),
];

export const BY_ID = Object.fromEntries(EXERCISES.map((e) => [e.id, e]));

/** Bir setin yaklaşık süresi (sn): tekrar başına ~3 sn (tempo 2-0-1) veya süre. */
export const setSeconds = (dose) => (dose.seconds ?? (dose.reps ?? 10) * 3);

/** Egzersizin toplam süresi (sn): setler + setler arası dinlenme + geçiş. */
export function exerciseSeconds(dose) {
  return dose.sets * setSeconds(dose) + Math.max(0, dose.sets - 1) * dose.restS + 20;
}

/** Görüntülenecek doz metni. */
export function doseText(dose) {
  const work = dose.seconds ? (dose.seconds >= 120 ? `${Math.round(dose.seconds / 60)} dk` : `${dose.seconds} sn`) : `${dose.reps} tekrar`;
  return `${dose.sets > 1 ? `${dose.sets} × ` : ''}${work}${dose.restS ? ` · dinlenme ${dose.restS} sn` : ''}`;
}
