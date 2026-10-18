# Mimari ve Teknik Kararlar (v0.6)

## Temel ilke: üç veri sınıfı, hiç karıştırılmaz

| Sınıf | Kaynak | Ne gösterir | Arayüzdeki işaret |
|---|---|---|---|
| **Atlas** | BodyParts3D referans vücudu | Genel anatomi; kişiye ait değil | Mavi rozet "Atlas modeli · kişiye ait tarama değil" |
| **Takip** | Kamera + MediaPipe (omuz/kalça + dirsek/bilek/diz/ayak bileği) | Atlasın kişinin dış hattına *yaklaşık* yerleşimi | Sarı rozet "Yaklaşık hizalama …" |
| **Tıbbi görüntü** | DICOM dosyası (BT/MR); ileride onaylı ultrason | Gerçek cihaz verisi, tanı amaçlı değil | Yeşil rozet; sentetik fantomda turuncu "gerçek hasta verisi değil" |

`src/imaging/sources.js` bu sınıfları ve kaynak türlerini modeller. Gelecekteki **ultrason cihazı**
(`ultrasound-device`) tanımlıdır ancak devre dışıdır: `canUseSource` doğrulanmış düzenleyici onayı
(`regulatoryClearance.verified`) olmadan cihaz akışına izin vermez. Bir üretici SDK'sı veya DICOM-US
bağdaştırıcısı bu arayüze takılır; görüntüleyici (`src/dicom/viewer.js`) hacim/kare arayüzü üzerinden çalışır.

## Modüller

```
index.html                 Uygulama kabuğu (3 ekran, CSP)        legacy.html  WebGL2'siz yedek (v0.2)
src/main.js                Hash yönlendirme, ekranların isteğe bağlı yüklenmesi, Hakkında/lisanslar
src/ui/anatomy-screen.js   Katmanlar, yapı listesi/arama, detay paneli, etiketler
src/ui/styles.css          Tasarım sistemi (mobil öncelikli; ≥900px sol menü + sağ panel)
src/three/anatomy-viewer.js  three.js görüntüleyici: 6 katman (3'ü tembel), PBR, seçim, odak, tek başına,
                           4D simülasyonlar, görünür yüzey etiketleri, görüş kaydırma
src/three/rig.js           Rijit uzuv segmentleri için eklem zinciri (omuz→dirsek, kalça→diz)
src/three/animations.js    4D eğri fonksiyonları (saf): kalp evreleri, solunum, kol kaldırma, yürüme
src/three/ar-overlay.js    Kamera üstü saydam 3B katman (ortografik, 1 birim = 1 px)
src/three/{assets,materials,palette,lod}.js  Tembel yükleme+önbellek, malzemeler, LOD seçimi (saf)
src/camera/ar-fit.js       Video→ekran eşleme, afin uydurma, sanal kalça, poz kalitesi, uzuv açıları (saf)
src/camera/pose-tracker.js MediaPipe Pose Landmarker (yerel dosyalar, GPU→CPU yedeği)
src/camera/camera-screen.js İzin akışı, takip döngüsü, One Euro yumuşatma, elle hizalama
src/analysis/              Ölçüm (saf): geometry, quality (kalite kapısı), posture (duruş göstergeleri),
                           movement (hareket testleri), compare (30/60/90, MDC), proportions, silhouette,
                           atlas-silhouette (üretilir)
src/scan/                  Tarama ekranı: scan-screen (akış), report, store (yerel, rızalı), voice, tilt, dom
server/                    Yerel sunucu (v0.6): app.mjs statik + /api; ai/ config, limits (hız/kota/bütçe),
                           safety (acil/kriz/teşhis/ilaç), prompt, openai (Responses API), mock (demo), chat
src/today/                 Bugün ekranı
src/fitness/               exercises (38 egzersiz), planner (ön değerlendirme, plan, geri bildirim güvenliği; saf),
                           coach (çevrimiçi tekrar/açı/tempo; saf), coach-ui (kamera katmanı), trainer-screen
src/assistant/             context (paylaşım özeti + önizleme; saf), assistant-screen
src/activity/              steps (uyarlanır hedef; saf), pedometer (ivmeölçer; saf), sources (kaynak durumu), activity-screen
src/notify/                schedule (saf), runtime (uygulama açıkken zamanlayıcı), notify-screen
src/progress/              metrics (dönem karşılaştırma, MDC; saf), progress-screen
src/data/                  Verilerim ekranı
src/anatomy/posture-info.js Gözlem → anatomi vurgusu ve genel biyomekanik metinleri (teşhis dili yok)
src/imaging/               Görüntüleme kaynak mimarisi + DICOM ekranı
src/dicom/                 Bağımsız DICOM ayrıştırıcı, hacim/MPR/MIP, sentetik fantom
src/anatomy/organ-info.js  Eğitim içeriği (Türkçe)
scripts/anatomy/           Varlık hattı: kaynak indir+doğrula → birleştir → Z-Anatomy kaydı (ICP) → doğrula
                           → eklem merkezleri → LOD → AO pişirme → GLB  (zanatomy-export.py: Blender/bpy)
manifest.webmanifest, sw.js, icons/  PWA (iPhone "Ana Ekrana Ekle", çevrimdışı önbellek)
scripts/test-browser.mjs   Tarayıcı test paketi (CDP), scripts/lib/{cdp,png}.mjs
vendor/                    three.js 0.186.1 (MIT), MediaPipe Tasks Vision 1.1.1 + poz modeli (Apache-2.0)
assets/anatomy/            high/low × skin/muscles/skeleton/organs/vessels/nerves .glb, manifest.json, provenance.json, LICENSE.md
```

## Kararlar ve gerekçeleri

1. **Model kaynağı: BodyParts3D 4.3 (tek vücut).** İskelet (kaburga, sternum, kafatası dahil), mide ve
   tüm organlar aynı referans vücuttan gelir → organlar arası konumlar tutarlı. HRA (Visible Human)
   modellerinde mide, kaburga ve kafatası yok; iki vücudu karıştırmak hizalama hatası getirirdi.
   HRA bu yüzden **bağımsız doğrulama** için kullanılır (aşağıda).
2. **Lisans ihtiyatı.** BodyParts3D'nin güncel resmi lisansı CC BY 4.0 (2025-02-27), eski dağıtımlar
   CC BY-SA 2.1 JP. Türev modeller CC BY-SA 4.0 ile yayınlanır → iki yorumla da uyumlu.
3. **Yeniden üretilebilir hat.** Kaynaklar commit SHA'sına sabitlenir; her OBJ, LFS işaretçisindeki
   SHA-256 ile doğrulanır; parça kökeni `provenance.json`'da.
4. **Veri kusurları ve çözümleri.** 4.3'te karıncık duvarı kalp kavram ağacında değil (adla eklendi);
   akciğer parankimi ayrı temsil serisinde (FJ65xx, adla seçildi); "Bony part of …" ve ad farklı ama
   geometrisi aynı temsiller ayıklandı; içe dönük sarım kontrolü (işaretli hacim) eklendi.
5. **LOD.** meshoptimizer ile high (~342 bin üçgen, 2,3 MB) ve low (~111 bin, 0,8 MB);
   EXT_meshopt_compression. Mobil, ≤4 GB bellek, ≤4 çekirdek veya veri tasarrufu → low; `?lod=` ile geçersiz
   kılınır. Katmanlar önem sırasıyla yüklenir (organlar → iskelet → deri); kamera ve DICOM kodu ilk ziyarette indirilir.
6. **Derlemesiz vendor.** three.js eklentilerindeki çıplak `'three'` içe aktarmaları göreli yola çevrilir;
   import map (satır içi betik) gerekmez, CSP `script-src 'self'` kalır. `'wasm-unsafe-eval'` yalnızca
   yerel WebAssembly (meshopt çözücü, MediaPipe) içindir; `eval()` izni vermez.
7. **Görüş kaydırma.** Mobil alt sayfa / masaüstü sağ panel açıkken kameranın projeksiyon merkezi kalan
   alanın ortasına kaydırılır (`camera.setViewOffset`); seçilen organ panelin arkasında kalmaz.
8. **Etiketler.** Önem sırasına göre sınırlı (mobil 8, masaüstü 14), iki sütunda çakışmasız yerleşim;
   test paketi DOM'daki etiket kutularının kesişmediğini ölçer.
9. **AR hizalaması.** MediaPipe omuz/kalça (11, 12, 23, 24) → `object-fit: cover` + ayna dönüşümü →
   4 noktadan 2B afin → modelin humerus/femur başı merkezleri. Derinlik ölçeği √|det|; kişinin kameraya
   bakıp bakmadığı noktaların dizilişinden çıkarılır. Kalçalar görünmezse model oranından sanal kalça.
   One Euro filtresi titreşimi azaltır; 600 ms kayıp toleransı.
10. **Kalp simülasyonu.** İki tepeli ("lub-dub") ölçek eğrisi, 70 atım/dk; ekranda sürekli
    "SİMÜLASYON — gerçek kalp hareketi değil" rozeti.

### v0.4 kararları

11. **Kaslar: Z-Anatomy (CC BY-SA 4.0).** BodyParts3D 4.3'te kas ağları eksik/parçalı. Z-Anatomy aynı
    vücuttan türetilmiş, uzmanlarca düzenlenmiş bir Blender atlası. Ancak iskeleti yeniden pozlanmış
    (humerus/femur merkezleri 113–121 mm kaymış, kemik boyları ~%3 farklı). Çözüm: 12 bölgede (baş-boyun,
    göğüs, bel, pelvis + 8 uzuv segmenti) Z iskeletinden BodyParts3D iskeletine kırpılmış afin ICP; her kas
    en yakın Z kemiğinin bölgesinin dönüşümünü alır. Kapı: bölge medyanı < 2,5 mm ve p90 < 6 mm, yoksa derleme
    durur. Sonuç: medyan ≤ 1,53 mm, p90 ≤ 5,17 mm; femur/humerus merkezleri 0,34–0,74 mm.
12. **Yinelenen temsiller.** BodyParts3D'de sağ el/ayak parmak kemiklerinin iki farklı pozdaki kopyaları
    bulundu (v0.3'te de vardı). Karşı taraftaki aynalı eşine en yakın kopya tutulur; 28 kopya ayıklandı.
13. **Damarlar ve sinirler** BodyParts3D'den (aort, vena kava, arter/ven ağaçları, omurilik, periferik
    sinirler); kas, damar ve sinir katmanları **tembel** yüklenir (ilk açılışta indirilmez).
14. **Pişirilmiş ortam kapanması (AO).** Her tepe noktası için yarım küre ışın izleme (three-mesh-bvh),
    sonuç COLOR_0 olarak GLB'ye yazılır. Çalışma anında ek maliyet yok (ek shader geçişi/SSAO yok → ısınma
    ve pil için güvenli). A/B ölçümü aşağıda.
15. **Eklem donanımı ve 4D.** Uzuv segmentleri rijit döner (ağ deformasyonu yok); bu yüzden hareket
    sırasında deri gizlenir ve omuz kaslarında küçük boşluklar oluşabilir — bilinen sınırlama. Kalp: önce
    kulakçıklar, sonra karıncıklar (70/dk); solunum: akciğer tepeden sabit genişler, diyafram ve karın
    organları iner, kaburgalar genişler (14/dk). Hepsi "SİMÜLASYON — … (gerçek ölçüm değil)" rozetiyle.
16. **Uzuv takibi.** Gövde afininin tersiyle ekran noktaları model düzlemine taşınır; her segmentin düzlem
    içi açısı bulunur. Ön kol açısı, modelin bileği takip edilen bileğe otursun diye hesaplanır. Derinlik
    (kameraya doğru bükülme) tek kameradan güvenilir çıkmadığı için modellenmez.
17. **Isınma/pil.** İstek üzerine çizim (hareket yokken kare çizilmez); tespit süresi 20 ms'yi aşarsa takip
    30 → 15 Hz'e iner; AR her zaman düşük LOD; sayfa gizlenince kamera durur.
18. **Etiketler v2.** Opak katmanlarda (kas/iskelet) etiket, yapının kameraya bakan dış yüzeyine bağlanır;
    arka yüzdeki yapı etiketlenmez (önden "Sırt kasları" yok). Etiketler araç çubuğunun altına girmez.

## Doğrulama ve ölçümler

### Anatomik konum (otomatik, `test/anatomy-assets.test.js`)
Sağ/sol yerleşim (karaciğer, safra kesesi sağda; mide, dalak, kalp ağırlık merkezi solda), dikey sıra,
retroperitoneal böbrekler (sağ böbrek daha aşağıda), kapsama (beyin kafatasında, kalp/akciğer göğüs
kafesinde, mesane pelviste, tümü deri içinde).

### Bağımsız atlasla çapraz kontrol
HRA ile 31 ortak yapının (C1–L5, sakrum, böbrekler, kalp, karaciğer, dalak, mesane) merkezlerinden afin
kayıt: **RMS 15,8 mm**. Kayıttan sonra iki bağımsız atlasın akciğer merkezleri arasındaki fark:
**sağ 21,4 mm, sol 16,0 mm** (kutu IoU 0,53 / 0,58). Farklı iki insan vücudu için beklenen düzeyde.

### Kamera hizalama doğruluğu (sahte kamera, yer gerçeğiyle)
Deri modeli önden çizilip Y4M sahte kamera videosuna çevrilir; eklem merkezlerinin gerçek ekran
konumu bilinir. MediaPipe noktalarının hatası: kalçalar **~2 px (omuz genişliğinin %2'si)**, omuzlar
**8–11 px (%7–8)**, omuzlarda sistematik olarak aşağı. Afin kalıntı < 1 px. Sentetik figürde ölçülmüştür;
gerçek kişilerde hata daha büyük olabilir (giysi, duruş, ışık).

### Tarayıcı testleri (`npm run test:browser`)
20 senaryo; iPhone 390×844, Android 412×915 ve masaüstü 1280×800 profilleri: yükleme, LOD, çizilen
üçgen, etiket çakışması, dokunarak seçim, detay paneli, tek başına inceleme, panel görünürlüğü,
simülasyon rozeti, katman/arama, DICOM yükleme, fantom, izin reddi, Hakkında/lisans, eski sayfa,
CSP/konsol hataları, yatay taşma, AR doğruluğu. Görsel regresyon: 12 temel görüntü, kanal eşiği 4,
sınır %0,5 (yazılım GPU'su deterministik; değişmeyen kodda fark %0,00; kasıtlı malzeme değişikliği
%0,74–7,29 farkla yakalandı).

**Sınır:** Bu ortamda yalnızca Chromium var. iPhone profili ekran/dokunma/kullanıcı aracısı
emülasyonudur, **gerçek Safari/WebKit değildir**. Gerçek cihaz testi yapılmadı.

### v0.5 kararları

19. **Ölçüm önce doğrulanır.** `test/fixtures/figure.js` atlas ağlarını bilinen pozla (rig, gövde eğilmesi,
    omuz yükseltme, bacak dönmesi, baş-öne, gövde ölçeği) çizer; yer gerçeği eklemler ve ağ kesitleridir.
    Her gösterge ve her hata payı (`U_SYS`, `uSys`, `SIL_CAL`) bu kıyaslardan gelir (`docs/bench/`).
20. **Poz modeli:** tarama `full` (p90 açı hatası 12,8°, lite 16,5°), canlı AR `lite` (hız/ısı). heavy:
    2,4× yavaş, 30 MB, küçük kazanç → kullanılmadı. MediaPipe 3B "world" açıları 17–22° hatalı → kullanılmaz.
21. **2B ölçüm sınırları:** açılar görüntü düzleminde; segment kameraya doğruysa (görünür boy < %80) kare
    dışlanır. Taraflar ekran konumundan + görünüşten çıkarılır (arka görünümde MediaPipe sol/sağ karışabilir).
22. **Belirsizlik ve karar:** u = √(istatistik² + sistematik² + kamera eğimi²); eğim sensörü yoksa açı payı 4°.
    Gözlem yalnızca |sapma| > 2u ise bildirilir. Nötr değeri kişiden kişiye değişen göstergelerde (baş-öne,
    diz hizası, ayak yönelimi) nötr karşılaştırması yapılmaz; yalnızca kişinin kendi geçmişiyle.
23. **Sahte ilerleme engeli:** karşılaştırma yalnızca aynı görünüş + bakış yönü + model + benzer kadraj
    oranı (±%12) + aynı düzlük durumunda; değişim MDC95 = 1,96·√(u₁²+u₂²) aşılırsa "olası değişim".
24. **Siluet ve ikiz (deneysel):** bölütleme maskesi yalnızca son 3 karede okunur, hemen serbest bırakılır.
    Atlas referansı deri ağının kesitinden (kapalı halka ayrıştırması: gövdeye yaslı kollar ayrı halka).
    Göğüs düzeyi 0,4 (atlas derisinde kollar yukarıda gövdeyle kaynaşık); uyluk çıkarıldı (bacaklar birleşiyor).
25. **Gizlilik:** görüntü cihazda işlenir, hiçbir kare saklanmaz; depoya yalnızca sayılar ve yalnızca
    saklama onayıyla yazılır; dışa aktarma ve tümünü sil her zaman açık. MediaPipe'ın 60 sn'de bir kullanım
    istatistiği gönderme denemesi vendor aşamasında kapatıldı (CSP zaten engelliyordu; v0.3'ten beri vardı,
    testler 60 sn'den kısa olduğu için görülmemişti).
26. **Güvenlik:** denge testinde tarama soruları ("evet" → test önerilmez), ön koşul onayları, büyük Durdur,
    test sonrası rahatsızlık sorusu; rahatsızlık bildirilirse rapor profesyonel değerlendirme önerir.

### Kalite A/B (`node scripts/ab-quality.mjs`, aynı görüş, yüksek LOD)
Ölçüt: model piksellerinde yerel kontrast (3×3 Laplace mutlak ortalaması; yüzey ayrıntısının görünürlüğü).

| Teknik | Kapalı | Açık | Fark | Maliyet | Karar |
|---|---|---|---|---|---|
| Pişirilmiş AO — organlar | 10,37 | 11,11 | **+%7,1** (bağırsak kıvrımları, organ sınırları belirgin) | çalışma anında 0 ek geçiş; +1 MB tepe rengi verisi (toplam 5,5 MB) | tutuldu |
| Pişirilmiş AO — kaslar | 8,35 | 8,57 | +%2,6 | aynı | tutuldu |
| Kas clearcoat | 8,19 | 8,57 | +%4,6 (ıslak doku parlaması) | ek shader terimi; yazılım GPU'sunda ölçülemedi | tutuldu, gerçek cihazda ölçülecek |

Ekran görüntüleri: `.cache/ab/*-yanyana.png` (sol kapalı, sağ açık). Ekran-uzayı AO (SSAO) ve gölge
haritaları **eklenmedi**: her karede ek tam ekran geçiş = mobilde ısınma/pil maliyeti; pişirilmiş AO aynı
görsel kazancın çoğunu sıfır çalışma maliyetiyle verir. Not: yazılım GPU'sunda (SwiftShader) kare süresi
GPU maliyetini temsil etmez; gerçek cihaz kare süresi ölçümü yapılmadı.

### Bellek ve yükleme (Chromium emülasyonu, yerel sunucu)
Düşük LOD ilk açılış: 115 668 üçgen, 35 çizim çağrısı; kas katmanı eklenince 155–169 bin üçgen, 52–53 çağrı.
JS yığını ~17–22 MB. Kas katmanının tembel yüklenmesi ~160 ms (yerel ağ; mobil ağda daha uzun).

### Uzuv takibi (kolları kaldırılmış sahte figür, yer gerçeğiyle)
Kas+iskelet katmanları ten rengiyle çizilip Rig ile pozlanır (sol omuz 57°, sol dirsek 34°, sağ omuz −40°).
Bilek noktası hatası omuz genişliğinin %0,3–2,7'si; omuz açısı hatası 7–8°, sağ dirsek 9°, sol dirsek 16–17°
(MediaPipe dirsek noktası %8 kayık; ön kol bileğe oturtulduğu için bu açıya yansır). Eşik 20°.

### v0.5 ölçüm doğrulaması
Ayrıntılı tablo ve gerçek kişi protokolü: [`VALIDATION.md`](VALIDATION.md). Kıyas çıktıları: `docs/bench/*.json`.

### v0.6 kararları

- **AI anahtarı yalnızca sunucuda.** İstemci `fetch('api/chat')` ile aynı kökene konuşur; CSP değişmedi. Ücretli
  çağrı üç ortam değişkeni birlikte verilmedikçe kapalı; hata/bütçe dolumunda demo yanıta düşülür (docs/AI.md).
- **Acil durumda model çağrılmaz:** kural tabanlı sınıflama sabit 112 yanıtı döndürür (gecikme ve model
  hatası riski yok).
- **Demo sağlayıcı = kişisel planlayıcı.** Program sorularına gerçek `buildSession/buildPlan` çıktısıyla yanıt
  verilir; sunucu yokken aynı modüller cihazda çalışır.
- **Paylaşım varsayılan kapalı**, kategori bazında açılır, önizleme gönderilen metinle aynı biçimdedir.
- **Antrenman güvenliği kural tabanlıdır** (PAR-Q benzeri 7 soru, ağrıda yük artmaz, baş dönmesi/nefes darlığında
  plan duraklar). Klinik doğrulaması yoktur; fizyoterapi reçetesi değildir.
- **Kamera koçu** hareket testleriyle aynı ölçüm kurallarını kullanır (görünürlük ≥ 0,6, kısalma kapısı, uSys 6°);
  güvenilirlik kapısı geçilmezse yalnızca yaklaşık tekrar sayısı gösterilir. Yandan görünüşte sağ–sol
  karşılaştırması yapılmaz (uzak taraf gizli).
- **Adım kaynakları bağdaştırıcı listesi**; HealthKit/Health Connect web'den erişilemez → "kullanılamaz".
- **Hatırlatmalar yalnızca uygulama açıkken.** Web Push sunucusu yok; ekranda açıkça yazılır.
- **Gelişimde "belirsiz" durumu:** adımda ±1,96·SE, koçta MDC95 içinde kalan fark iyileşme sayılmaz.
- `.warnline` görüntüleme ekranına özgü mutlak konumdan arındırıldı (`#dicom-warnings`), genel uyarı sınıfı oldu.

## Yol haritası

1. Gerçek cihaz testleri (iPhone Safari, Android Chrome) — yerel ağ HTTPS hazır (`--cert/--key`, docs/DEVICE-TEST.md).
1b. Gerçek AI etkinleştirme (onayla): resmi fiyat doğrulaması, KVKK aydınlatma/yurt dışı aktarım rızası.
1c. Uygulama kapalıyken hatırlatma (Web Push sunucusu) ve HealthKit/Health Connect için yerel kabuk (onayla).
1a. Gerçek gönüllü doğrulaması (etik kurul + açık rıza; `scripts/eval-recording.mjs` hazır).
2. Deri ağının iskelete bağlanması (skinning, ağırlık boyama) — hareket sırasında deri ve omuz kasları.
3. Omuz noktası kalibrasyonu — açık lisanslı, yer gerçekli poz veri kümesiyle (insan deneyi değil).
4. DICOM'dan yüzey çıkarma (marching cubes) ve WebGL hacim görüntüleme; Web Worker'da yükleme.
5. Sıkıştırılmış DICOM (JPEG-LS/JPEG2000) için açık kaynak WASM çözücü.
6. Daha ayrıntılı organ alt yapıları (kalp odacıkları, karaciğer segmentleri) için katman içi gezinme.
7. Ultrason cihaz bağdaştırıcısı: yalnızca düzenleyici onaylı cihazlar, `sources.js` sözleşmesiyle.
