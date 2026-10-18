// Demo sohbet sağlayıcısı: anahtarsız, ücretsiz, kural tabanlı ve belirlenimci. Gerçek bir dil modeli DEĞİLDİR;
// arayüzde "Demo yanıt" olarak gösterilir. Program önerileri uygulamanın planlayıcısıyla üretilir.

import { buildSession, buildPlan, GOALS } from '../../src/fitness/planner.js';
import { BY_ID, doseText } from '../../src/fitness/exercises.js';
import { REFERRAL } from './safety.mjs';

const norm = (s) => String(s ?? '').toLocaleLowerCase('tr');
/** Sözcük başı eşleşmesi (ör. "tamamladım" içindeki "adım" sayılmaz). */
const W = (w) => new RegExp(`(^|[^a-zçğıöşü])${w}`);
const has = (t, ...words) => words.some((w) => (w instanceof RegExp ? w.test(t) : t.includes(w)));
const num = (t, re) => { const m = t.match(re); return m ? Number(m[1].replace(/\./g, '').replace(',', '.')) : null; };

const list = (items) => items.map((x) => `• ${x}`).join('\n');
const sessionText = (s) => list(s.items.map((it) => `${BY_ID[it.id].tr} — ${doseText(it.dose)}${it.role === 'isinma' ? ' (ısınma)' : it.role === 'soguma' ? ' (soğuma)' : ''}`));

/** @param {{messages:{role,content}[], context:object|null, level:string}} req */
export function mockReply({ messages, context, level }) {
  const last = norm(messages.filter((m) => m.role === 'user').at(-1)?.content);
  const p = context?.profile ?? {};
  const ref = level === 'tani' ? REFERRAL.tani : level === 'ilac' ? REFERRAL.ilac : null;
  if (ref) {
    return `${ref}\n\nBunun yerine genel hareket alışkanlıkları, egzersiz planı veya duruş farkındalığı hakkında yardımcı olabilirim.`;
  }

  // Bana Anlat: ölçülmüş bölge bulguları (yalnızca paylaşılan veriden; yoksa açıkça söylenir)
  const insightQ = findingsQuestion(last);
  if (insightQ) return findingsReply(insightQ, last, context);

  // Haftalık değerlendirme
  if (has(last, 'haftalık değerlendirme', 'haftamı değerlendir', 'bu hafta nasıl')) {
    const w = context?.workouts, a = context?.activity, c = context?.comparisons ?? [];
    if (!w && !a && !c.length) return 'Haftalık değerlendirme için antrenman ve aktivite verilerinizi paylaşmanız gerekir. Asistan ekranındaki "Paylaşılan veriler" bölümünden izin verebilirsiniz.';
    const parts = [];
    if (w) parts.push(`Bu hafta ${w.thisWeek} antrenman tamamladınız${w.planned ? ` (plan: ${w.planned})` : ''}.${w.lastFeeling ? ` Son antrenman hissiniz: "${w.lastFeeling}".` : ''}`);
    if (a) parts.push(`Günlük ortalama adımınız ${fmt(a.weekAvg)}; hedefiniz ${fmt(a.goal)}.${a.weekAvg >= a.goal ? ' Hedefinizi karşılıyorsunuz.' : ` Hedefe ulaşmak için günde yaklaşık ${fmt(a.goal - a.weekAvg)} adım daha gerekiyor.`}`);
    for (const x of c.slice(0, 3)) parts.push(`${x.tr}: ${x.text}`);
    parts.push('Öneri: tutarlılığı koruyun; bir sonraki hafta yükü yalnızca antrenmanlar "uygun" veya "kolay" hissettirdiyse küçük adımlarla artırın.');
    return parts.join('\n\n');
  }

  // Tarama raporu / ölçüm yorumu
  if (has(last, 'rapor', 'gövde eğim', 'ölçüm', 'tarama', 'belirsizlik', 'omuz seviye', 'baş-öne', 'başın öne')) {
    const obs = context?.posture ?? [];
    if (!obs.length) return 'Tarama sonuçlarınızı yorumlayabilmem için "Paylaşılan veriler" bölümünden duruş gözlemlerinin paylaşılmasına izin vermeniz gerekir. Genel olarak: her ölçüm ± belirsizlikle verilir ve bir sapma ancak belirsizliğin iki katını aşarsa "gözlem" olarak bildirilir. Bu ölçümler deneyseldir ve tanı değildir.';
    const lines = obs.slice(0, 4).map((o) => `• ${o.tr}: ${o.value}${o.unit === '°' ? '°' : ` ${o.unit}`} ± ${o.u}${o.experimental ? ' (deneysel)' : ''} — ${o.distinguishable ? `ölçüm belirsizliğini aşan bir sapma (${o.sense})` : 'nötr referanstan ayırt edilemiyor'}`);
    const trunk = obs.find((o) => /gövde/i.test(o.tr) && o.distinguishable);
    return `Paylaştığınız duruş gözlemleri:\n${lines.join('\n')}\n\n${trunk ? 'Gövde eğimi, omuz ve kalça orta noktalarının dikeyle yaptığı açıdır; o andaki duruşunuzu, ağırlığı hangi bacağa verdiğinizi ve kameranın düzlüğünü yansıtır. Omurganın şeklini ölçmez. ' : ''}Bu değerler kamerayla yapılan yaklaşık ölçümlerdir; tanı koymaz. Ağrı veya şikâyetiniz varsa bir sağlık profesyoneline başvurun. İsterseniz duruş farkındalığı için kısa bir program hazırlayabilirim.`;
  }

  // Duruş: omuzlar önde, baş önde, kambur
  if (has(last, 'omuz', 'kambur', 'duruş', 'boyun öne', 'baş öne', 'dik dur')) {
    const s = buildSession({ goal: 'durus', level: p.level ?? 'baslangic', location: p.location ?? 'ev', equipment: p.equipment ?? [], limitations: p.limitations ?? [], minutesPerDay: 12, clearance: true }, 0);
    const hf = (context?.posture ?? []).find((o) => /baş/i.test(o.tr));
    return `Omuzların öne doğru durması genellikle uzun süre ekrana eğilerek çalışmak gibi alışkanlıklarla ilişkilidir. Göğüs ön kasları kısalırken sırt üst kasları daha az çalışabilir. Duruş farkındalığı için şu kısa programı deneyebilirsiniz:\n${sessionText(s)}\n\nErgonomi: ekranı göz hizasına yaklaştırın, 30–60 dakikada bir kalkıp omuzlarınızı açın.${hf ? `\n\nTaramanızdaki "${hf.tr}" ölçüsü ± ${hf.u} ${hf.unit} belirsizlik içerir; değişimi aynı koşullardaki taramalarla izleyin.` : ''}\n\nBu öneriler geneldir; ağrı, uyuşma veya güç kaybı varsa bir fizyoterapist ya da hekime başvurun.`;
  }

  // Program isteği
  if (has(last, 'program', 'antrenman hazırla', 'plan', 'egzersiz öner', 'rutin')) {
    const minutes = num(last, /(\d+)\s*(?:dk|dakika)/) ?? p.minutesPerDay ?? 20;
    const gym = has(last, 'salon', 'spor salonu', 'fitness salon');
    const loc = gym ? 'salon' : has(last, 'ev', 'ekipmansız') ? 'ev' : p.location ?? 'ev';
    const equipment = has(last, 'ekipmansız') ? [] : p.equipment ?? [];
    const base = { goal: p.goal ?? (gym ? 'kuvvet' : 'kondisyon'), level: p.level ?? 'baslangic', location: loc, equipment, limitations: p.limitations ?? [], minutesPerDay: minutes, clearance: p.clearance ?? true };
    if (has(last, 'haftalık', 'hafta')) {
      const days = num(last, /(\d)\s*gün/) ?? p.daysPerWeek ?? 3;
      const plan = buildPlan({ ...base, daysPerWeek: days });
      return `${GOALS[base.goal]} hedefi için ${days} günlük haftalık taslak (${loc === 'salon' ? 'spor salonu' : 'ev'}, oturum başına ~${minutes} dk):\n\n${plan.sessions.map((s) => `${s.day} (~${s.estMinutes} dk):\n${sessionText(s)}`).join('\n\n')}\n\n${plan.restTip} Planı "Antrenman" ekranından kişiselleştirip takip edebilirsiniz.${gym ? ' Makinelerde ağırlığı ilk günlerde salon görevlisiyle ayarlayın.' : ''}`;
    }
    const s = buildSession(base, 0);
    return `${loc === 'ev' && !equipment.length ? 'Ekipmansız ' : ''}${minutes} dakikalık bir oturum (~${s.estMinutes} dk):\n${sessionText(s)}\n\nHareketleri ağrısız aralıkta yapın; nefesinizi tutmayın. Zor gelirse tekrarları azaltın, kolay gelirse bir sonraki oturumda küçük adımlarla artırın.`;
  }

  // Nereden başlamalı
  if (has(last, 'nereden başla', 'yeni başl', 'başlamak istiyorum', 'nasıl başla')) {
    const h = num(last, /boy(?:um)?\D{0,8}(\d{3})/) ?? p.heightCm;
    const w = num(last, /kilo(?:m)?\D{0,8}(\d{2,3})/) ?? p.weightKg;
    const bmi = h && w ? (w / (h / 100) ** 2).toFixed(1) : null;
    const s = buildSession({ goal: 'aliskanlik', level: 'baslangic', location: 'ev', equipment: [], limitations: p.limitations ?? [], minutesPerDay: 15, clearance: true }, 0);
    return `${bmi ? `Boy–kilo oranınız (BKİ) yaklaşık ${bmi.replace('.', ',')} kg/m²; bu yalnızca boy ve kilonun oranıdır, vücut yağını veya sağlığınızı tek başına göstermez. ` : ''}Başlangıç için öneri:\n${list(['Haftada 2–3 gün, 15–20 dakikalık oturumlar', 'Her gün kısa yürüyüşler; adım hedefini mevcut ortalamanızın biraz üstüne koyun', 'İlk 2 hafta tekniği öğrenmeye odaklanın, yükü sonra artırın'])}\n\nÖrnek ilk oturum:\n${sessionText(s)}\n\nKalp, tansiyon, eklem sorunu veya düzenli ilaç kullanımı varsa başlamadan önce hekiminize danışın. Antrenman ekranındaki kısa sağlık sorularını da yanıtlayabilirsiniz.`;
  }

  // Antrenmanı tamamladım / yarın
  if (has(last, 'tamamladım', 'bitirdim', 'yarın ne', 'yarın')) {
    return `Tebrikler! Yarın için:\n${list(['Aynı kas gruplarını art arda zorlamamak için hafif bir gün: yürüyüş ve esnetme', 'Kas ağrısı olağandır ve 1–3 gün içinde azalır; eklem ağrısı veya keskin ağrı varsa o bölgeyi dinlendirin', 'Uyku ve su tüketimi toparlanmayı destekler'])}\n\nAntrenman ekranında nasıl hissettiğinizi bildirirseniz bir sonraki oturumun yükü buna göre ayarlanır (ağrı veya baş dönmesinde yük artmaz).`;
  }

  // Adım
  if (has(last, W('adım'), W('yürüyüş'), W('yürü'))) {
    const today = num(last, /([\d.]+)\s*adım/) ?? context?.activity?.today ?? null;
    const goal = context?.activity?.goal ?? null;
    const remain = today != null && goal ? goal - today : null;
    return `${today != null ? `Bugün ${fmt(today)} adım atmışsınız. ` : ''}${remain > 0 ? `Hedefinize (${fmt(goal)}) ulaşmak için yaklaşık ${fmt(remain)} adım kaldı — bu, tempolu yürüyüşle kabaca ${Math.round(remain / 110)} dakika eder. ` : goal && remain <= 0 ? 'Bugünkü hedefinize ulaştınız. ' : ''}Öneriler:\n${list(['Yemeklerden sonra 10 dakikalık kısa yürüyüşler', 'Telefon görüşmelerini ayakta/yürüyerek yapma', 'Asansör yerine birkaç kat merdiven', 'Hedefi herkes için 10.000 değil, kendi ortalamanızın biraz üstü olarak belirleyin'])}`;
  }

  // Yaşam alışkanlıkları
  if (has(last, 'uyku', 'uyuyam')) return `Uyku düzeni için genel öneriler:\n${list(['Her gün benzer saatte yatıp kalkın (hafta sonu dahil)', 'Yatmadan önceki 1 saatte ekranı azaltın', 'Akşam saatlerinde kafeini sınırlayın', 'Yoğun egzersizi yatmadan hemen önceye koymayın'])}\n\nUzun süren uykusuzluk, horlama veya gün içi aşırı uyku hâli varsa bir hekime danışın.`;
  if (has(last, 'su ', 'su içm', 'sıvı')) return `Su tüketimi kişiye, havaya ve aktiviteye göre değişir. Genel öneriler:\n${list(['Susamayı beklemeden gün içine yayarak için', 'Egzersiz öncesi, sırası ve sonrası birkaç yudum', 'İdrar renginin açık sarı olması genel bir göstergedir'])}\n\nKalp veya böbrek hastalığı gibi durumlarda sıvı miktarını hekiminizle belirleyin.`;
  if (has(last, 'beslen', 'diyet', 'kilo ver', 'yemek', 'öğün')) return `Dengeli beslenme için genel ilkeler:\n${list(['Tabağın yarısı sebze ve meyve', 'Tam tahıllar ve yeterli protein (baklagil, balık, yumurta, süt ürünleri)', 'Şekerli içecekleri ve işlenmiş gıdaları azaltma', 'Hızlı kilo kaybı vaat eden diyetlerden kaçınma'])}\n\nKişiye özel beslenme planı (diyabet, böbrek hastalığı, gebelik vb.) için bir diyetisyene veya hekime başvurun. Takviye önerisinde bulunamam.`;
  if (has(last, 'masa', 'ergonomi', 'bilgisayar', 'oturarak')) return `Masa başı için:\n${list(['Ekran üst kenarı göz hizasında, kol boyu uzaklıkta', 'Ayaklar yere bassın, dizler ~90°', 'Her 30–60 dakikada 2–3 dakikalık hareket molası: ayağa kalkın, omuzları çevirin, çene içe alma yapın'])}\n\nİsterseniz bildirimlerden masa başı hareket hatırlatması açabilirsiniz.`;
  if (has(last, 'motivasyon', 'üşeniyorum', 'devam edemiyorum', 'bırak')) return `Motivasyon için:\n${list(['Hedefi küçültün: "haftada 2 kez 15 dakika" gibi kolay başlayın', 'Antrenmanı takviminize randevu gibi yazın', 'İlerlemenizi görün: Gelişim ekranındaki haftalık sayılar', 'Kaçırdığınız bir gün planı bozmaz; bir sonrakine devam edin'])}`;
  if (has(last, 'dinlen', 'toparlan', 'yorgun', 'kas ağrı')) return `Toparlanma için:\n${list(['Haftada en az 1–2 dinlenme veya hafif aktivite günü', 'Yeterli uyku ve su', 'Hafif yürüyüş ve esnetme', 'Aşırı yorgunluk sürerse yükü azaltın'])}\n\nGeçmeyen ağrı, şişlik veya halsizlik varsa bir sağlık profesyoneline başvurun.`;

  return `Size şu konularda yardımcı olabilirim:\n${list(['Kişisel antrenman programı ("evde 20 dakikalık program hazırla")', 'Duruş farkındalığı ve ergonomi', 'Adım hedefi ve günlük hareket', 'Tarama raporunuzdaki ölçümlerin anlamı (izin verirseniz)', 'Uyku, su, beslenme ve toparlanma hakkında genel bilgiler'])}\n\nNot: Bu demo modunda yanıtlar kural tabanlıdır; gerçek yapay zekâ henüz etkin değil.`;
}

const fmt = (n) => Number(n).toLocaleString('tr-TR');

// ---------------- Bana Anlat ----------------

const REGION_WORDS = [
  [/sağ omuz|sağ omz/, ['omuz-R']], [/sol omuz|sol omz/, ['omuz-L']], [/omuz|omz/, ['omuz-L', 'omuz-R']],
  [/sağ diz/, ['diz-R']], [/sol diz/, ['diz-L']], [/diz/, ['diz-L', 'diz-R']],
  [/boyn|boyun|baş/, ['bas-boyun']], [/gövde|bel|sırt/, ['govde']], [/kalça|leğen/, ['kalca']], [/denge|ayak bile/, ['denge']],
];

function findingsQuestion(t) {
  if (has(t, 'geçen hafta', 'ne değişti', 'değişim var')) return 'degisim';
  if (has(t, 'nerelere dikkat', 'nereme dikkat', 'dikkat etmeliyim', 'vücudumda ne')) return 'genel';
  if (has(t, 'neden sarı', 'neden turuncu', 'neden gri', 'neden yeşil', 'ne fark gördün', 'ne fark var', 'farkı ne')) return 'bolge';
  if (has(t, 'hareketlerimi nasıl', 'bugün nasıl yaptım', 'nasıl yaptım')) return 'bugun';
  if (has(t, 'hangi egzersizleri deneyebilirim', 'hangi egzersiz', 'hangi hareketleri deneyebilirim')) return 'egzersiz';
  return null;
}

function findingsReply(kind, t, context) {
  const f = context?.findings;
  if (kind === 'degisim') {
    const c = context?.comparisons ?? [];
    if (!c.length) return 'Geçen haftayla karşılaştırma yapabilmem için en az iki karşılaştırılabilir tarama ve "Tarama karşılaştırmaları" paylaşımı gerekir. Şu an bu veriyi göremiyorum, bu yüzden bir değişimden söz edemem.\n\nGenel bilgi: küçük farklar ölçüm belirsizliği içinde kalabilir; İçGör yalnızca en küçük saptanabilir değişimi aşan farkları "olası değişim" olarak gösterir.';
    return `Ölçümlerine göre:\n${list(c.slice(0, 5).map((x) => `${x.tr}: ${x.text}`))}\n\n"Belirsiz" yazanlar ölçüm hatası içinde kalan farklardır; iyileşme veya kötüleşme olarak yorumlanmamalı.`;
  }
  if (!f) return 'Ölçüm sonuçlarını göremiyorum: ya henüz tarama yapılmadı ya da "Bana Anlat bulguları" paylaşımı kapalı. Asistan ekranındaki "Paylaşılan bilgiler" bölümünden açabilir veya Bana Anlat ekranında sonuçlara doğrudan bakabilirsin. Veri olmadan vücudun hakkında bir şey söyleyemem.';
  const regs = f.regions ?? [];
  const att = regs.filter((r) => r.status === 'sari' || r.status === 'turuncu');
  const gray = regs.filter((r) => r.status === 'gri').map((r) => r.tr);
  const note = 'Bunlar kamera ölçümleridir; bir hastalık, kas hasarı veya sağlık sorunu olduğunu göstermez.';
  if (kind === 'bolge') {
    const ids = REGION_WORDS.find(([re]) => re.test(t))?.[1];
    const sel = ids ? regs.filter((r) => ids.includes(r.id)) : att;
    if (!sel.length) return 'Hangi bölgeyi sorduğunu anlayamadım; örneğin "Sağ omzum neden sarı?" diye sorabilirsin.';
    const lines = sel.map((r) => (r.status === 'gri' ? `${r.tr}: bu bölge ölçülmedi veya veri güvenilir değildi; hakkında bir şey söyleyemem.` : `${r.tr} (${r.statusTr}): ${r.text.replace(`${r.tr}: `, '')}`)
      + (r.unreliable?.length ? ` Not: ${r.unreliable.join('; ')}; bu ölçümden sonuç çıkarmıyorum, tekrar deneyebilirsin.` : ''));
    const flagged = sel.some((r) => r.status === 'sari' || r.status === 'turuncu');
    const intro = flagged && /diz/.test(t) ? 'Dizinde bir hastalık olduğunu söyleyemem. Ancak ölçümüne göre:' : 'Ölçümüne göre:';
    const why = sel.some((r) => r.status === 'sari') ? '\n\nSarı, farkın şimdilik tek ölçümde görüldüğü anlamına gelir; aynı koşullarda tekrar ölçmek en iyi sonraki adımdır.' : sel.some((r) => r.status === 'turuncu') ? '\n\nTuruncu, aynı farkın birden fazla güvenilir ölçümde aynı yönde sürdüğü anlamına gelir.' : '';
    return `${intro}\n${list(lines)}${why}\n\nGenel bilgi: kamera açısı, kıyafet, ışık ve o anki duruş bu ölçümleri etkileyebilir. ${note} Ağrı, uyuşma veya güç kaybı varsa bir uzmana danış.`;
  }
  if (kind === 'egzersiz') {
    const ex = Object.entries(f.exercises ?? {});
    if (!ex.length) return 'Ölçümlerinde dikkat çeken bir bölge görünmüyor; genel programına devam edebilirsin. İstersen kısa bir duruş farkındalığı programı hazırlayabilirim.';
    return `Ölçümünde dikkat çeken bölgeler için hafif ve kontrollü hareketler:\n${list(ex.map(([k, v]) => `${k}: ${v.join(', ')}`))}\n\nBunlar tedavi değildir; rahat olduğun aralıkta yap, ağrı olursa dur.`;
  }
  if (kind === 'bugun') {
    const pos = f.positives ?? [];
    return `${f.quality ?? 'Son taramanın kalite bilgisi yok.'}\n${pos.length ? `\nOlumlu gözlemler:\n${list(pos.slice(0, 4))}` : ''}${att.length ? `\n\nDikkat çeken noktalar:\n${list(att.map((r) => r.text))}` : ''}\n\nSonraki adım: ${f.next ?? '—'}`;
  }
  // genel
  const parts = [att.length ? `Ölçümüne göre dikkat çeken noktalar:\n${list(att.map((r) => `${r.text} (${r.statusTr})`))}` : 'Ölçülen bölgelerde belirsizliği aşan belirgin bir fark görülmedi.'];
  if (gray.length) parts.push(`Ölçülmeyen bölgeler: ${gray.join(', ')}. Bu bölgeler hakkında bir şey söyleyemem; ilgili tarama veya hareket testiyle ölçülebilirler.`);
  if (f.next) parts.push(`Önerilen sonraki adım: ${f.next}`);
  parts.push(note);
  if (f.synthetic) parts.unshift('Not: bu sonuçlar demo/sentetik veridir, gerçek ölçüm değildir.');
  return parts.join('\n\n');
}
