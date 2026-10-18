# Mimari ve Teknik Kararlar

## Temel ilke: dürüst görselleştirme

Bir RGB kamera deri altını göremez. Bu nedenle sistem iki ayrı veri yolunu kesin çizgiyle ayırır:

| Yol | Kaynak | Ne gösterir | Durum |
|---|---|---|---|
| **A. Şematik atlas** | Kamera + gövde işaret noktaları | Genel, ortalama bir anatomi modeli; kişiye *hizalanmış*, kişiye *ait değil* | v0.1 (bu sürüm) |
| **B. Gerçek tıbbi görüntü** | BT/MR/US cihazından DICOM | Kişinin gerçek anatomisi | Yol haritası |

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
  render/canvas-renderer.js  Canvas 2D boyama
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

## Testler

- `npm test` — 25 birim testi: atlas anatomik tutarlılık (sol/sağ, dikey sıra, retroperitoneal
  böbrekler), ağ geometrisi, afin dönüşüm ve doğrulama, One Euro filtresi, çizim listesi.
- `npm run smoke` — Chromium'u DevTools Protokolü ile sürer (npm paketi gerekmez); telefon
  (390×844) ve masaüstü için 3 mod; konsol hatası, yatay taşma, sahte kamera açılışı kontrol edilir.

## Yol haritası (öneriler — onay bekliyor)

1. **Otomatik poz algılama** (MediaPipe Pose Landmarker veya TF.js MoveNet; cihaz üstü).
   Model dosyası indirilecek → *dış bağlantı onayı gerekir.* One Euro filtresi hazır.
2. **HTTPS yayın** (GitHub Pages) — telefonda kamerayla denemek için. *Onay gerekir.*
3. **Etiket çakışma çözümü** (kenara yaslanmış etiketler + çizgiler).
4. **Gerçekçi organ mesh'leri** — açık lisanslı atlaslar (ör. BodyParts3D, CC BY-SA) + Three.js.
5. **DICOM görüntüleyici (B yolu)** — kullanıcının kendi BT/MR dosyasını cihazda açıp
   kesit + hacim görüntüleme. Gerçek organ görüntüsünün doğru kaynağı budur.
6. **Derinlik kamerası / LiDAR** ile gövde yüzeyi yakalama — yine yalnızca dış yüzey.
