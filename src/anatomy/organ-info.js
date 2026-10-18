// Eğitim amaçlı organ bilgi kataloğu (Türkçe). Kimlikler assets/anatomy/manifest.json ile eşleşir.
// İçerik genel anatomi/fizyoloji bilgisidir; kişiye özgü tıbbi bilgi veya tanı içermez.

export const SYSTEMS = {
  integumentary: 'Örtü sistemi',
  skeletal: 'İskelet sistemi',
  nervous: 'Sinir sistemi',
  circulatory: 'Dolaşım sistemi',
  respiratory: 'Solunum sistemi',
  digestive: 'Sindirim sistemi',
  lymphatic: 'Lenfatik sistem',
  urinary: 'Üriner sistem',
  muscular: 'Kas sistemi',
};

export const LAYERS = {
  skin: { tr: 'Deri', defaultOpacity: 0.18 },
  muscles: { tr: 'Kaslar', defaultOpacity: 1, lazy: true },
  skeleton: { tr: 'İskelet', defaultOpacity: 1 },
  organs: { tr: 'Organlar', defaultOpacity: 1 },
  vessels: { tr: 'Damarlar', defaultOpacity: 1, lazy: true },
  nerves: { tr: 'Sinirler', defaultOpacity: 1, lazy: true },
};

/** @type {Record<string, {tr:string, system:keyof SYSTEMS, location:string, function:string, facts?:string[]}>} */
export const ORGAN_INFO = {
  skin: {
    tr: 'Deri', system: 'integumentary',
    location: 'Tüm vücudu örten en dış katman; epidermis, dermis ve deri altı dokudan oluşur.',
    function: 'Vücudu mikroorganizmalara, ultraviyole ışınlara ve sıvı kaybına karşı korur; ısı düzenlemesine ve dokunma, basınç, sıcaklık duyusuna katılır; güneş ışığıyla D vitamini yapımını başlatır.',
    facts: ['Yetişkinde yüzey alanı yaklaşık 1,5–2 m²’dir.'],
  },
  skull: {
    tr: 'Kafatası', system: 'skeletal',
    location: 'Başın iskeleti; beyni saran nörokranyum ve yüz iskeleti (viserokranyum) bölümlerinden oluşur.',
    function: 'Beyni ve duyu organlarını korur, yüzün şeklini ve çiğneme kaslarının tutunma yerlerini sağlar.',
    facts: ['Alt çene kemiği (mandibula) kafatasının hareketli tek büyük kemiğidir.'],
  },
  spine: {
    tr: 'Omurga', system: 'skeletal',
    location: 'Gövdenin arka orta hattında; 7 boyun, 12 sırt, 5 bel omuru ile sakrum ve kuyruk sokumundan oluşur. Omurlar arasında diskler bulunur.',
    function: 'Gövdeyi taşır, omuriliği korur, hareket ve esnekliği sağlar; disklerle yükü dağıtır.',
    facts: ['Yandan bakıldığında boyun ve belde öne, sırtta arkaya doğru doğal eğrilikleri vardır.'],
  },
  ribcage: {
    tr: 'Göğüs kafesi', system: 'skeletal',
    location: '12 çift kaburga, kaburga kıkırdakları ve önde göğüs kemiğinden (sternum) oluşur; arkada sırt omurlarına eklemlenir.',
    function: 'Kalbi, akciğerleri ve üst karın organlarını korur; solunum kaslarıyla birlikte göğüs boşluğunun genişlemesini sağlar.',
    facts: ['11. ve 12. kaburgalar önde sternuma bağlanmaz (“yüzen kaburgalar”).'],
  },
  pelvis: {
    tr: 'Leğen kemikleri (kalça kemikleri)', system: 'skeletal',
    location: 'Gövdenin alt kısmında; iki kalça kemiği önde birleşir, arkada sakrumla eklem yapar.',
    function: 'Gövde ağırlığını bacaklara aktarır, pelvis organlarını korur, kas ve bağlara tutunma yeri sağlar.',
  },
  'upper-limb-bones': {
    tr: 'Üst ekstremite ve omuz kemerinin kemikleri', system: 'skeletal',
    location: 'Köprücük kemiği, kürek kemiği, kol (humerus), ön kol (radius, ulna), el bileği, el tarağı ve parmak kemikleri.',
    function: 'Kolun geniş hareket açıklığını ve elin ince becerilerini mümkün kılar.',
  },
  'lower-limb-bones': {
    tr: 'Alt ekstremite kemikleri', system: 'skeletal',
    location: 'Uyluk (femur), diz kapağı, bacak (tibia, fibula), ayak bileği, ayak tarağı ve parmak kemikleri.',
    function: 'Vücut ağırlığını taşır, ayakta durma, yürüme ve koşmayı sağlar.',
    facts: ['Femur vücudun en uzun ve en güçlü kemiğidir.'],
  },
  brain: {
    tr: 'Beyin', system: 'nervous',
    location: 'Kafatası boşluğunda; beyin yarıküreleri, beyincik ve beyin sapından oluşur.',
    function: 'Duyusal bilgiyi işler, hareketi, düşünmeyi, belleği, dili ve vücudun otonom işlevlerini yönetir.',
    facts: ['Modelde yalnızca ana yüzey yapıları gösterilir; iç ventriküller çıkarılmıştır.'],
  },
  heart: {
    tr: 'Kalp', system: 'circulatory',
    location: 'Göğüs boşluğunun ortasında (orta mediasten), iki akciğer arasında; tepesi (apeks) sola-öne-aşağı bakar. Kütlesinin yaklaşık üçte ikisi orta hattın solundadır.',
    function: 'Dört odacıklı kas pompası: sağ taraf kanı akciğerlere, sol taraf vücuda pompalar. Kapakçıklar kanın tek yönde akmasını sağlar; koroner damarlar kalp kasını besler.',
    facts: ['Dinlenme hâlinde yetişkinde dakikada yaklaşık 60–100 kez kasılır.', 'Modelde koroner atardamarlar kırmızı, toplardamarlar mavi gösterilir.'],
  },
  'lung-right': {
    tr: 'Sağ akciğer', system: 'respiratory',
    location: 'Göğüs boşluğunun sağ yarısında; üç lobludur (üst, orta, alt). Tabanı diyaframın sağ kubbesine oturur.',
    function: 'Solunan havadaki oksijeni kana geçirir, kandaki karbondioksiti dışarı verir (gaz alışverişi alveollerde olur).',
    facts: ['Karaciğer altta yer aldığından sağ akciğer soldakinden biraz daha kısa ama daha geniştir.', 'Model, bronkopulmoner segmentlerin birleştirilmesiyle oluşturuldu.'],
  },
  'lung-left': {
    tr: 'Sol akciğer', system: 'respiratory',
    location: 'Göğüs boşluğunun sol yarısında; iki lobludur (üst ve alt). Ön yüzünde kalbe yer açan kardiyak çentik bulunur.',
    function: 'Sağ akciğerle birlikte gaz alışverişini sağlar.',
    facts: ['Model, bronkopulmoner segmentlerin birleştirilmesiyle oluşturuldu.'],
  },
  airways: {
    tr: 'Soluk borusu ve bronş ağacı', system: 'respiratory',
    location: 'Gırtlağın altından başlayan soluk borusu (trakea) göğüste sağ ve sol ana bronşlara ayrılır; bronşlar akciğer içinde dallanır.',
    function: 'Havayı akciğerlere iletir; mukus ve tüylü hücrelerle yabancı parçacıkları temizler.',
  },
  esophagus: {
    tr: 'Yemek borusu', system: 'digestive',
    location: 'Yutaktan mideye uzanan kas borusu; soluk borusunun arkasında, omurganın önünde ilerler ve diyaframdan geçer.',
    function: 'Yutulan besinleri dalga benzeri kasılmalarla (peristaltizm) mideye taşır.',
  },
  diaphragm: {
    tr: 'Diyafram', system: 'muscular',
    location: 'Göğüs ve karın boşluklarını ayıran kubbe şeklindeki kas; sağ kubbe karaciğer nedeniyle genellikle biraz daha yüksektir.',
    function: 'Ana solunum kasıdır: kasıldığında düzleşir, göğüs boşluğu genişler ve hava akciğerlere dolar.',
  },
  liver: {
    tr: 'Karaciğer', system: 'digestive',
    location: 'Karın boşluğunun sağ üst bölümünde, diyaframın altında; büyük kısmı sağ kaburgaların koruması altındadır.',
    function: 'Safra üretir; besin maddelerini işler ve depolar (ör. glikojen); kan proteinlerini üretir; birçok ilacı ve zararlı maddeyi metabolize eder.',
    facts: ['Vücudun en büyük iç organıdır.', 'Modelde karaciğer, fonksiyonel segmentlerinden birleştirilmiştir.'],
  },
  gallbladder: {
    tr: 'Safra kesesi', system: 'digestive',
    location: 'Karaciğerin alt yüzündeki çukurda, sağ üst karında.',
    function: 'Karaciğerin ürettiği safrayı depolar ve yoğunlaştırır; yağlı yemekten sonra safrayı ince bağırsağa verir.',
  },
  stomach: {
    tr: 'Mide', system: 'digestive',
    location: 'Karın boşluğunun sol üst bölümünde, diyaframın altında; yemek borusu ile on iki parmak bağırsağı arasında.',
    function: 'Besinleri depolar, asit ve enzimlerle sindirimi başlatır ve karıştırarak ince bağırsağa kontrollü olarak iletir.',
  },
  spleen: {
    tr: 'Dalak', system: 'lymphatic',
    location: 'Karnın sol üst bölümünde, midenin arkasında ve sol diyafram kubbesinin altında; 9–11. kaburgalar hizasında.',
    function: 'Yaşlanmış kırmızı kan hücrelerini ayıklar, kanı süzer ve bağışıklık yanıtına katılır.',
  },
  pancreas: {
    tr: 'Pankreas', system: 'digestive',
    location: 'Midenin arkasında, karın arka duvarında yatay uzanır; başı on iki parmak bağırsağının kıvrımında, kuyruğu dalağa doğrudur.',
    function: 'Sindirim enzimleri salgılar (ekzokrin) ve insülin, glukagon gibi kan şekerini düzenleyen hormonlar üretir (endokrin).',
  },
  'kidney-right': {
    tr: 'Sağ böbrek', system: 'urinary',
    location: 'Karın arka duvarında, omurganın sağında (retroperitoneal); karaciğer nedeniyle genellikle soldakinden biraz daha aşağıdadır.',
    function: 'Kanı süzerek idrar oluşturur; sıvı-elektrolit ve asit-baz dengesini, kan basıncını ve kırmızı kan hücresi yapımını düzenlemeye katılır.',
  },
  'kidney-left': {
    tr: 'Sol böbrek', system: 'urinary',
    location: 'Karın arka duvarında, omurganın solunda (retroperitoneal); yaklaşık 11. kaburga–3. bel omuru hizasında.',
    function: 'Sağ böbrekle birlikte kanı süzer ve idrar üretir.',
  },
  'small-intestine': {
    tr: 'İnce bağırsak', system: 'digestive',
    location: 'Mideden kalın bağırsağa uzanır: on iki parmak bağırsağı (duodenum), jejunum ve ileum. Karnın orta ve alt kısmını doldurur.',
    function: 'Sindirimin büyük kısmı ve besinlerin emilimi burada gerçekleşir.',
    facts: ['Yetişkinde uzunluğu birkaç metredir; yüzeyi villuslarla büyük ölçüde genişler.'],
  },
  'large-intestine': {
    tr: 'Kalın bağırsak', system: 'digestive',
    location: 'İnce bağırsağın etrafında çerçeve gibi uzanır: çekum, çıkan, enine, inen ve sigmoid kolon, rektum.',
    function: 'Su ve elektrolitleri geri emer, dışkıyı oluşturur ve depolar; bağırsak florasına ev sahipliği yapar.',
  },
  bladder: {
    tr: 'İdrar kesesi (mesane)', system: 'urinary',
    location: 'Pelvis boşluğunda, kasık kemiğinin (simfizis pubis) arkasında.',
    function: 'Böbreklerden gelen idrarı depolar ve işeme sırasında boşaltır.',
  },
  // ---------- Kas grupları (Z-Anatomy) ----------
  'mus-head-neck': {
    tr: 'Baş ve boyun kasları', system: 'muscular',
    location: 'Yüz ifade kasları, çiğneme kasları (masseter, temporal kas), boyun kasları (sternokleidomastoid, skalen kaslar), dil altı kasları ve göz kasları.',
    function: 'Yüz ifadesi, çiğneme, yutma, konuşma, başın hareketi ve göz hareketleri.',
    facts: ['Masseter, vücut ağırlığına oranla en güçlü kaslardan biridir.'],
  },
  'mus-chest': {
    tr: 'Göğüs kasları', system: 'muscular',
    location: 'Büyük ve küçük göğüs kası (pektoral kaslar), serratus anterior ve kaburgalar arasındaki interkostal kaslar.',
    function: 'Kolun öne ve içe hareketi, kürek kemiğinin sabitlenmesi; interkostal kaslar solunuma yardım eder.',
  },
  'mus-abdomen': {
    tr: 'Karın kasları', system: 'muscular',
    location: 'Karın düz kası (rektus abdominis), dış ve iç eğik kaslar, karın enine kası ve kuadratus lumborum.',
    function: 'Gövdeyi öne büker ve döndürür, karın içi organları destekler, zorlu soluk vermeye ve öksürmeye katılır.',
  },
  'mus-back': {
    tr: 'Sırt kasları', system: 'muscular',
    location: 'Yüzeyde trapez ve geniş sırt kası (latissimus dorsi), derinde omurga boyunca uzanan dikleştirici kaslar (erector spinae) ve rombik kaslar.',
    function: 'Omurgayı dik tutar ve geriye büker; kürek kemiğini ve kolu hareket ettirir.',
  },
  'mus-shoulder-arm': {
    tr: 'Omuz ve kol kasları', system: 'muscular',
    location: 'Deltoid, rotator manşet kasları (supraspinatus, infraspinatus, teres minör, subskapularis), kolun önünde biseps ve brakialis, arkasında triseps.',
    function: 'Omuz eklemini hareket ettirir ve sabitler; dirseği büker (biseps, brakialis) ve açar (triseps).',
  },
  'mus-forearm-hand': {
    tr: 'Ön kol ve el kasları', system: 'muscular',
    location: 'Ön kolun ön yüzünde bükücü, arka yüzünde açıcı kaslar; elde başparmak ve serçe parmak tümsek kasları, lumbrikal ve interosseöz kaslar.',
    function: 'El bileği ve parmak hareketleri, kavrama, ön kolun içe-dışa dönmesi.',
  },
  'mus-hip-thigh': {
    tr: 'Kalça ve uyluk kasları', system: 'muscular',
    location: 'Kalçada gluteal kaslar, uyluk önünde kuadriseps ve sartorius, içte adduktorlar, arkada hamstring kasları.',
    function: 'Ayakta durma, yürüme ve koşma; dizi açar (kuadriseps), büker (hamstring), bacağı içe çeker (adduktorlar).',
    facts: ['Sartorius vücudun en uzun kasıdır.'],
  },
  'mus-leg-foot': {
    tr: 'Bacak ve ayak kasları', system: 'muscular',
    location: 'Baldırda gastroknemius ve soleus (Aşil tendonuyla topuğa yapışır), önde tibialis anterior, yanda fibular kaslar; ayak tabanı kasları.',
    function: 'Ayak bileğini ve parmakları hareket ettirir, yürürken itiş gücü sağlar, ayak kemerini destekler.',
  },
  'mus-pelvic': {
    tr: 'Pelvis tabanı kasları', system: 'muscular',
    location: 'Pelvis çıkışını kapatan levator ani ve koksigeus kasları ile perine kasları.',
    function: 'Pelvis organlarını destekler, idrar ve dışkı tutmaya katılır.',
  },

  // ---------- Damarlar (BodyParts3D) ----------
  aorta: {
    tr: 'Aort', system: 'circulatory',
    location: 'Sol karıncıktan çıkar (çıkan aort), sola-arkaya kıvrılır (aort kavsi), omurganın önünde ve hafif solunda göğüs ve karından aşağı iner.',
    function: 'Vücudun ana atardamarıdır; oksijenli kanı tüm vücuda dağıtan dalları verir.',
  },
  'vena-cava': {
    tr: 'Üst ve alt ana toplardamar (vena kava)', system: 'circulatory',
    location: 'Üst vena kava baş, boyun ve kollardan; alt vena kava gövde ve bacaklardan gelen kanı sağ kulakçığa taşır. Alt vena kava omurganın sağında yer alır.',
    function: 'Oksijeni azalmış kanı kalbe geri döndürür.',
  },
  arteries: {
    tr: 'Atardamarlar', system: 'circulatory',
    location: 'Şah damarları, kol ve bacak atardamarları, böbrek ve bağırsak atardamarları gibi ana sistemik dallar ve akciğer atardamarları.',
    function: 'Kanı kalpten dokulara taşır. Modelde kırmızı gösterilir; organ içindeki ince dallar sadeleştirme için çıkarılmıştır.',
  },
  veins: {
    tr: 'Toplardamarlar', system: 'circulatory',
    location: 'Boyun (juguler), kol, bacak ve gövde toplardamarları; deri altı ve derin toplardamarlar.',
    function: 'Kanı dokulardan kalbe geri taşır. Modelde mavi gösterilir; bu renk geleneksel bir gösterimdir, kanın gerçek rengi değildir.',
  },

  // ---------- Sinir sistemi (BodyParts3D) ----------
  'spinal-cord': {
    tr: 'Omurilik', system: 'nervous',
    location: 'Omurga kanalı içinde, beyin sapından yaklaşık birinci-ikinci bel omuru hizasına kadar; aşağıda sinir kökleri (kauda ekina) devam eder.',
    function: 'Beyin ile vücut arasındaki sinir iletimini sağlar; refleks devrelerini içerir.',
  },
  nerves: {
    tr: 'Periferik sinirler', system: 'nervous',
    location: 'Omurilik ve beyinden çıkan sinirler: kol sinir ağı (brakiyal pleksus), interkostal sinirler, bel-sağrı ağı, yüz ve kafa sinirleri.',
    function: 'Hareket komutlarını kaslara iletir, duyuları beyne taşır. Modelde sarı gösterilir.',
  },
};

export const organName = (id) => ORGAN_INFO[id]?.tr ?? id;
/** Dar ekranda etiket metni: kas gruplarında "kasları" eki atılır (katman zaten kas katmanıdır). */
export const labelName = (id, narrow) => (narrow && id.startsWith('mus-') ? organName(id).replace(/ kasları$/, '') : organName(id));
