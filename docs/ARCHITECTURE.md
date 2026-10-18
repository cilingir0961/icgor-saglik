# Mimari ve Teknik Kararlar

## Temel ilke: dürüst görselleştirme

Bir RGB kamera deri altını göremez. Bu nedenle sistem iki ayrı veri yolunu kesin çizgiyle ayırır:

| Yol | Kaynak | Ne gösterir | Durum |
|---|---|---|---|
| **A. Şematik atlas** | Kamera + gövde işaret noktaları | Genel, ortalama bir anatomi modeli; kişiye *hizalanmış*, kişiye *ait değil* | v0.1 (bu sürüm) |
| **B. Gerçek tıbbi görüntü** | BT/MR cihazından DICOM | Kişinin gerçek anatomisi | v0.2: kesit görüntüleyici |

Arayüz, A yolunda üretilen hiçbir şeyi "sizin organınız" gibi sunmaz; uyarı metni kapatılamaz.

## Modüller

```
src/
  core/vec3.js            vektör/matris yardımcıları (saf)
  core/one-euro.js        titreşim filtresi — poz algılayıcı gelince kullanılacak (saf)
  anatomy/atlas.js        şematik organ atlası, gövde koordinatlarında (saf veri)
  anatomy/mesh.js         elipsoit ağ üretimi (saf)
  anatomy/body-frame.js   4 işaret noktası → atlas-ekran afin dönüşümü + doğrulama (saf)
  render/scene.js         çizim listesi: arka yüz eleme, gölgeleme, derinlik sıralama (saf)
  render/labels.js        çakışmasız etiket yerleşimi (saf)
  render/canvas-renderer.js  Canvas 2D boyama
  dicom/parser.js         bağımlılıksız DICOM ayrıştırıcı (saf; hasta kimliğini okumaz)
  dicom/volume.js         seri gruplama, hacim kurma, MPR, MIP, pencereleme, yön harfleri (saf)
  dicom/phantom.js        atlastan sentetik BT fantomu (saf; gerçek veri değil)
  dicom/viewer.js         görüntüleyici durumu + Canvas çizimi
  camera/camera-source.js getUserMedia sarmalayıcısı
  app.js                  DOM/olay bağlama
```

Hesaplamanın tamamı DOM'dan bağımsız saf fonksiyonlarda; bu sayede Node'da tarayıcısız test edilir.

## Kararlar ve gerekçeleri

1. **Bağımlılıksız, derlemesiz ES modülleri.** Telefondan geliştirirken `npm install`/derleme
   zinciri kırılgan; ayrıca dış bağlantılar onaya tabi. Dosyalar tarayıcıda doğrudan çalışır.
   Bedeli: Three.js'in hazır özellikleri (ışıklandırma, GLTF) yok. Model karmaşıklaşınca
   Three.js'e geçiş önerilir (aşağıda).
2. **Canvas 2D + ressam algoritması.** ~2 bin üçgen için yeterli ve her tarayıcıda çalışır.
   Saydam organlarda kusursuz derinlik sıralaması vermez; gerçek mesh'lere geçince WebGL gerekir.
3. **Gövde koordinat sistemi (omuz genişliği birimi).** Atlas, kişinin boyutundan bağımsızdır;
   4 noktadan kurulan afin dönüşüm ölçek, döndürme ve hafif eğikliği karşılar.
4. **Sarım yönünden bağımsız arka yüz eleme.** Dış normal, yüz merkezinin organ merkezine göre
   yönünden bulunur; böylece ayna (selfie) görüntüde de eleme doğru kalır (testle doğrulandı).
5. **Ön/arka görünüm tespiti.** 2B'de "ayna görüntü" ile "arkası dönük kişi" ayırt edilemez;
   bu yüzden ayna bilgisi kamera kaynağından açıkça verilir.
6. **Elle hizalama önce.** Otomatik poz algılama (MediaPipe vb.) model dosyası indirmeyi gerektirir
   (dış bağlantı). Algılama kaynağı `computeBodyFrame` arayüzüne takılacak şekilde tasarlandı.
7. **Kendi DICOM ayrıştırıcımız.** dcmjs/cornerstone büyük ve derleme gerektiriyor. Kapsam bilinçli
   olarak dar: tek kareli, sıkıştırılmamış (Implicit/Explicit VR LE), gri tonlamalı. Desteklenmeyen
   biçimler (JPEG/JPEG2000, çok kareli, renkli) açık Türkçe hata verir. Hasta kimlik etiketleri
   hiç okunmaz → ekranda veya bellekte ad/kimlik no bulunmaz.
8. **Kesit sıralaması konuma göre.** `ImagePositionPatient · normal` ile sıralanır (kesit numarası
   güvenilmez); aralık medyandan hesaplanır, eksik/düzensiz kesitler kullanıcıya bildirilir.
9. **Radyolojik gösterim ve yön etiketleri.** Ekran kenarı etiketleri (Sağ/Sol/Ön/Arka/Üst/Alt)
   sabit değil, DICOM yön kosinüslerinden hesaplanır; eğik çekimlerde de doğru taraf gösterilir.
10. **Sentetik fantom.** Görüntüleyici gerçek hasta verisi olmadan geliştirilir ve test edilir;
    fantom ekranda her zaman "SENTETİK" filigranı taşır.
11. **İçerik Güvenlik Politikası (CSP).** `connect-src 'self'` ve satır içi betik/stil yasağı:
    bir hata veya kötü niyetli kod olsa bile sayfa veriyi dış adrese gönderemez. Tarayıcı testi
    CSP ihlallerini hata sayar.

## Ölçümler (bulut konteyner, Node 22)

| İşlem | Süre |
|---|---|
| Fantom üretimi (147×100×199, 3 mm) | ~270 ms |
| Sajital kesit çıkarma + pencereleme | ~0,8 ms |
| Koronal MIP | ~15 ms |

## Testler

- `npm test` — 49 birim testi: atlas tutarlılığı, ağ geometrisi, afin dönüşüm, One Euro filtresi,
  çizim listesi, etiket yerleşimi, DICOM ayrıştırma (implicit/explicit, diziler, 12 bit işaretli,
  MONOCHROME1, hata kodları, kimlik sızmaması), hacim/MPR/MIP/pencereleme, fantom.
- `npm run smoke` — Chromium'u DevTools Protokolü ile sürer (npm paketi gerekmez); telefon
  (390×844) ve masaüstü için 6 senaryo: konsol/CSP hatası, yatay taşma, sahte kamera, fantom ve
  sentetik `.dcm` dosyalarının gerçek dosya seçiciyle yüklenmesi. Test tarayıcısının arka plan ağ
  trafiği kapalıdır.
- `node scripts/make-sample-dicom.mjs ornek-dicom` — "DICOM aç" ile denemek için sentetik seri üretir.

## Yol haritası

1. **Otomatik poz algılama** (MediaPipe Pose Landmarker veya TF.js MoveNet; cihaz üstü).
   Açık kaynak model dosyası depoya eklenecek (çalışma anında dış bağlantı yok). One Euro filtresi hazır.
2. **HTTPS yayın** (GitHub Pages) — telefonda kamerayla denemek için. Herkese açık yayın olduğundan
   *kullanıcı onayı gerekir* (üretim yayını sınırı).
3. ~~Etiket çakışma çözümü~~ (v0.2'de yapıldı)
4. **Gerçekçi organ mesh'leri** — açık lisanslı atlaslar (ör. BodyParts3D, CC BY-SA) + Three.js.
5. **DICOM görüntüleyici devamı** — ~~kesit/MPR/MIP~~ (v0.2) → WebGL hacim görüntüleme
   (döndürülebilir 3B), yüzey çıkarma (marching cubes; ör. kemik), Web Worker'da yükleme,
   sıkıştırılmış biçimler (JPEG-LS/JPEG2000 için açık kaynak WASM çözücü), pencereyi sürükleyerek ayar.
6. **Derinlik kamerası / LiDAR** ile gövde yüzeyi yakalama — yine yalnızca dış yüzey.
