// Duruş ve hareket gözlemleri için eğitim içeriği (Türkçe). Genel biyomekanik bilgidir; tanı, tedavi veya
// kişiye özel risk değerlendirmesi DEĞİLDİR. Kamerayla belirlenemeyen durumlar (fıtık, skolyoz, disk hasarı,
// organ sıkışması, iç yağ birikimi vb.) burada bilerek yer almaz ve görselleştirilmez.
//
// highlight: 3B atlas üzerinde vurgulanacak yapı kimlikleri (assets/anatomy/manifest.json).

export const TOPICS = {
  'head-forward': {
    tr: 'Başın öne konumu',
    highlight: ['mus-head-neck', 'mus-back', 'skull', 'spine'],
    anatomy: 'Baş yaklaşık 4,5–5,5 kg ağırlığındadır ve boyun omurları (C1–C7) üzerinde taşınır. Baş omuz hizasının önüne geldikçe, onu dengede tutmak için boynun arka kasları (ör. trapezius üst lifleri, levator scapulae, boyun ekstansörleri) daha fazla çalışır; boynun önündeki derin fleksör kaslar daha az kullanılır.',
    general: 'Uzun süre ekrana veya telefona eğilerek bakmak başın öne konumunu artırabilir. Ekranı göz hizasına yakın tutmak ve düzenli molalar vermek genel ergonomi önerileridir.',
  },
  'shoulder-level': {
    tr: 'Omuz seviyesi',
    highlight: ['mus-shoulder-arm', 'mus-back', 'mus-head-neck', 'upper-limb-bones', 'ribcage'],
    anatomy: 'Omuz yüksekliği kürek kemiği (skapula) ve köprücük kemiğinin konumuna bağlıdır; trapezius, levator scapulae ve serratus anterior gibi kaslar kürek kemiğini konumlandırır. Baskın el kullanımı, çanta taşıma alışkanlığı ve anlık duruş küçük sağ–sol farklarına yol açabilir; çoğu insanda hafif asimetri olağandır.',
    general: 'Ağır çantayı hep aynı omuzda taşımamak ve masa başında kolları destekli kullanmak genel önerilerdir.',
  },
  'hip-level': {
    tr: 'Kalça seviyesi',
    highlight: ['pelvis', 'mus-hip-thigh', 'lower-limb-bones'],
    anatomy: 'Pelvisin yan eğimi ağırlığın hangi bacağa verildiğine, kalça kaslarına (gluteus medius) ve bacak duruşuna göre anlık değişir. Kameradaki kalça noktaları kalça eklemi merkezini yalnızca yaklaşık gösterir; bu gösterge deneyseldir.',
    general: 'Ağırlığı iki ayağa eşit vererek durmak ölçümün tekrarlanabilirliğini artırır.',
  },
  'head-tilt': {
    tr: 'Başın yana eğimi',
    highlight: ['mus-head-neck', 'skull', 'spine'],
    anatomy: 'Başın yana eğilmesi boynun yan kaslarıyla (sternokleidomastoid, skalen kaslar, trapezius) sağlanır. Ölçüm anındaki küçük eğimler çoğunlukla duruş alışkanlığı veya anlık konumdur.',
    general: 'Ölçüm sırasında karşıya, göz hizasındaki bir noktaya bakmak tekrarlanabilirliği artırır.',
  },
  'trunk-lateral': {
    tr: 'Gövdenin yana eğilimi',
    highlight: ['spine', 'mus-back', 'mus-abdomen', 'pelvis'],
    anatomy: 'Gövdenin yana eğilmesi omurga boyunca uzanan kaslar (erector spinae, quadratus lumborum) ve karın yan kaslarıyla (oblikler) dengelenir. Bu gösterge omurganın şeklini ÖLÇMEZ; yalnızca omuz ve kalça orta noktalarının hizasını gösterir.',
    general: 'Omurga eğriliği gibi durumlar kamerayla belirlenemez; şüphe varsa bir sağlık profesyoneli değerlendirmelidir.',
  },
  'trunk-forward': {
    tr: 'Gövdenin öne eğilimi',
    highlight: ['spine', 'mus-back', 'mus-abdomen', 'mus-hip-thigh', 'pelvis'],
    anatomy: 'Ayakta dururken gövdenin öne/arkaya hizası kalça ve ayak bileği stratejileriyle korunur; karın ve sırt kasları birlikte çalışır.',
    general: 'Uzun süre aynı pozisyonda kalmamak ve düzenli hareket etmek genel önerilerdir.',
  },
  'knee-frontal': {
    tr: 'Diz hizası (önden)',
    highlight: ['lower-limb-bones', 'mus-hip-thigh', 'mus-leg-foot'],
    anatomy: 'Önden bakışta diz, kalça ile ayak bileği arasındaki çizgiye göre içe veya dışa görünebilir. Bu görünüm bacağın dönüşüne ve kameranın açısına çok duyarlıdır; gösterge deneyseldir ve kemik dizilimi hakkında bilgi vermez.',
    general: 'Çömelme gibi hareketlerde dizlerin ayak uçlarıyla aynı yöne bakması genel bir hareket önerisidir.',
  },
  'knee-sagittal': {
    tr: 'Diz hizası (yandan)',
    highlight: ['lower-limb-bones', 'mus-hip-thigh', 'mus-leg-foot'],
    anatomy: 'Yandan bakışta dizin hafif bükülü ya da düz durması ayakta duruş alışkanlığıdır. Gösterge deneyseldir: sentetik doğrulamada yaklaşık 4° sistematik sapma ölçüldü.',
    general: 'Ayakta uzun süre dururken dizleri kilitlememek genel bir öneridir.',
  },
  'foot-angle': {
    tr: 'Ayak yönelimi',
    highlight: ['mus-leg-foot', 'lower-limb-bones'],
    anatomy: 'Ayak uçlarının dışa dönüklüğü kalça ve bacak dönüşünden etkilenir. Önden kamera görüntüsünde bu açı perspektif nedeniyle büyük ölçüde değişir; mutlak değer anlamlı değildir, yalnızca aynı koşullardaki değişim izlenebilir.',
    general: '',
  },
  'arm-raise': {
    tr: 'Kol kaldırma',
    highlight: ['mus-shoulder-arm', 'mus-back', 'upper-limb-bones', 'ribcage'],
    anatomy: 'Kolu yandan kaldırmak (abdüksiyon) deltoid ve supraspinatus kaslarıyla başlar; yaklaşık 90°\'nin üzerinde kürek kemiğinin yukarı dönmesi (trapezius, serratus anterior) gerekir. Omuz eklemi ile kürek kemiği birlikte çalışır.',
    general: 'Hareketi ağrı sınırına kadar zorlamamak gerekir. Ağrılı veya kısıtlı hareket bir sağlık profesyoneli tarafından değerlendirilmelidir.',
  },
  squat: {
    tr: 'Çömelme',
    highlight: ['mus-hip-thigh', 'mus-leg-foot', 'mus-back', 'lower-limb-bones', 'pelvis'],
    anatomy: 'Çömelmede kalça, diz ve ayak bileği birlikte bükülür. Uyluk ön kasları (kuadriseps), kalça kasları (gluteus) ve baldır kasları yükü taşır; gövdenin öne eğimi ağırlık merkezini ayakların üzerinde tutmaya yardım eder.',
    general: 'Derinlik kişiden kişiye değişir; rahat olunan aralıkta yapılmalıdır.',
  },
  'forward-bend': {
    tr: 'Öne eğilme',
    highlight: ['spine', 'mus-back', 'mus-hip-thigh', 'pelvis'],
    anatomy: 'Öne eğilme kalça ekleminde bükülme ve omurganın bükülmesinin birleşimidir; uyluk arka kasları (hamstring) ve sırt kaslarının esnekliği hareketi etkiler. Kamera yalnızca gövde çizgisinin açısını görür; omurganın kendi bükülmesini ayrı ölçemez.',
    general: 'Ani ve yaylanarak eğilmemek, yavaş ve kontrollü hareket etmek genel önerilerdir.',
  },
  'single-leg': {
    tr: 'Tek ayak üzerinde denge',
    highlight: ['mus-hip-thigh', 'mus-leg-foot', 'pelvis', 'lower-limb-bones'],
    anatomy: 'Tek ayak üzerinde durmak kalçanın yan kaslarını (gluteus medius), ayak bileği ve ayak kaslarını, ayrıca denge sistemini (iç kulak, görme, eklem duyusu) birlikte kullanır.',
    general: 'Bu test her zaman bir destek yakınındayken yapılmalıdır. Düşme öyküsü, baş dönmesi veya denge sorunu olan kişiler testi yapmamalıdır.',
  },
  neck: {
    tr: 'Boyun hareket açıklığı',
    highlight: ['mus-head-neck', 'spine', 'skull'],
    anatomy: 'Başı yana yatırma ve çevirme boyun omurları arasındaki eklemlerle ve boyun kaslarıyla yapılır; çevirmenin yaklaşık yarısı en üstteki iki omur (C1–C2) arasında gerçekleşir.',
    general: 'Boyun hareketleri yavaş yapılmalı, ağrı, uyuşma veya baş dönmesi olursa hemen bırakılmalıdır.',
  },
  gait: {
    tr: 'Yürüyüş',
    highlight: ['mus-hip-thigh', 'mus-leg-foot', 'lower-limb-bones', 'pelvis'],
    anatomy: 'Yürüyüş, her bacağın sırayla yük taşıdığı (duruş) ve ileri savrulduğu (salınım) evrelerden oluşur. Adım sıklığı ve sağ–sol adım sürelerinin benzerliği yürüyüşün genel ritmini özetler.',
    general: 'Ölçüm kısa bir kayıttan yapılır ve kamera açısına duyarlıdır; deneysel bir göstergedir.',
  },
};

/** Her raporda gösterilen genel profesyonel değerlendirme yönlendirmesi (ölçüme dayalı eşik yoktur). */
export const SEEK_CARE = 'Ağrı, uyuşma, karıncalanma, güç kaybı, denge kaybı, düşme veya yeni başlayan ya da artan bir şikâyetiniz varsa bu ölçümlerden bağımsız olarak bir sağlık profesyoneline başvurun. İçGör ölçümleri tanı koymaz ve muayenenin yerini tutmaz.';

/** Kamerayla belirlenemeyenler (raporda açıkça belirtilir). */
export const CANNOT_DETECT = 'Kamera yalnızca vücudun dış yüzeyindeki nokta konumlarını görür. Fıtık, skolyoz, disk hasarı, iç organların konumu veya iç yağ dağılımı gibi durumlar bu yöntemle belirlenemez ve İçGör bunları göstermez.';

export const ERGONOMICS = [
  'Ekranı göz hizasına yakın tutun; telefonu kullanırken başınızı eğmek yerine telefonu yükseltin.',
  'Her 30–60 dakikada bir kalkıp birkaç dakika hareket edin.',
  'Oturduğunuzda ayaklarınız yere bassın, sırtınız desteklensin.',
  'Ağır yükleri iki elle ve vücudunuza yakın taşıyın.',
  'Egzersize başlamadan önce sağlık durumunuz hakkında şüpheniz varsa bir uzmana danışın.',
];
