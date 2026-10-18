# Mimari ve Teknik Kararlar (v0.3)

## Temel ilke: üç veri sınıfı, hiç karıştırılmaz

| Sınıf | Kaynak | Ne gösterir | Arayüzdeki işaret |
|---|---|---|---|
| **Atlas** | BodyParts3D referans vücudu | Genel anatomi; kişiye ait değil | Mavi rozet "Atlas modeli · kişiye ait tarama değil" |
| **Takip** | Kamera + MediaPipe (omuz/kalça) | Atlasın kişinin dış hattına *yaklaşık* yerleşimi | Sarı rozet "Yaklaşık hizalama …" |
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
src/three/anatomy-viewer.js  three.js görüntüleyici: PBR, seçim, odak, tek başına, simülasyon, görüş kaydırma
src/three/ar-overlay.js    Kamera üstü saydam 3B katman (ortografik, 1 birim = 1 px)
src/three/{assets,materials,palette,lod}.js  Tembel yükleme+önbellek, malzemeler, LOD seçimi (saf)
src/camera/ar-fit.js       Video→ekran eşleme, afin uydurma, sanal kalça, poz kalitesi (saf)
src/camera/pose-tracker.js MediaPipe Pose Landmarker (yerel dosyalar, GPU→CPU yedeği)
src/camera/camera-screen.js İzin akışı, takip döngüsü, One Euro yumuşatma, elle hizalama
src/imaging/               Görüntüleme kaynak mimarisi + DICOM ekranı
src/dicom/                 Bağımsız DICOM ayrıştırıcı, hacim/MPR/MIP, sentetik fantom
src/anatomy/organ-info.js  Eğitim içeriği (Türkçe)
scripts/anatomy/           Varlık hattı: kaynak indir+doğrula → birleştir → doğrula → LOD → GLB
scripts/test-browser.mjs   Tarayıcı test paketi (CDP), scripts/lib/{cdp,png}.mjs
vendor/                    three.js 0.186.1 (MIT), MediaPipe Tasks Vision 1.1.1 + poz modeli (Apache-2.0)
assets/anatomy/            high/low × skin/skeleton/organs .glb, manifest.json, provenance.json, LICENSE.md
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

## Yol haritası

1. Gerçek cihaz testleri (iPhone Safari, Android Chrome) — HTTPS önizleme gerekir (kullanıcı onayıyla).
2. Omuz noktası kalibrasyonu — açık lisanslı, yer gerçekli poz veri kümesiyle (insan deneyi değil).
3. DICOM'dan yüzey çıkarma (marching cubes) ve WebGL hacim görüntüleme; Web Worker'da yükleme.
4. Sıkıştırılmış DICOM (JPEG-LS/JPEG2000) için açık kaynak WASM çözücü.
5. Daha ayrıntılı organ alt yapıları (kalp odacıkları, karaciğer segmentleri) için katman içi gezinme.
6. Ultrason cihaz bağdaştırıcısı: yalnızca düzenleyici onaylı cihazlar, `sources.js` sözleşmesiyle.
