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
  skeleton: { tr: 'İskelet', defaultOpacity: 1 },
  organs: { tr: 'Organlar', defaultOpacity: 1 },
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
};

export const organName = (id) => ORGAN_INFO[id]?.tr ?? id;
