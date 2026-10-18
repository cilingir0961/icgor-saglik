# İçGör (icgor-saglik)

Mobil öncelikli **3B anatomi ve sağlık görüntüleme araştırma prototipi**.

> **Araştırma ve eğitim prototipidir. Tıbbi cihaz değildir, tanı koymaz.**
> Kamera vücudun yalnızca dış yüzeyini görür. Gösterilen organlar genel bir referans anatomi modelidir
> (atlas). Bir kişinin gerçek organ görüntüsü yalnızca uygun tıbbi görüntüleme donanımıyla (BT, MR,
> ultrason vb.) elde edilebilir.

## Ekranlar

| Ekran | Ne yapar | Veri sınıfı |
|---|---|---|
| **Anatomi** | Tam vücut atlası, 6 katman: deri, kaslar ve tendonlar (9 bölge), iskelet, organlar, damarlar (aort, vena kava, arterler, venler), sinirler (omurilik, periferik). Döndürme, yakınlaştırma, katman saydamlığı, yapı arama/seçme, tek başına inceleme, Türkçe bilgi kartları, tam ekran. **4D eğitim simülasyonları**: iki evreli kalp atımı, solunum, kol kaldırma, yürüme | Atlas modeli |
| **Kamera** | MediaPipe vücut takibiyle atlası kamera görüntüsüne **yaklaşık** yerleştirir; kollar ve bacaklar (dirsek/bilek/diz/ayak bileği) takip edilir; organ/kas/iskelet/damar katmanları; uyarlanabilir tespit hızı; elle hizalama yedeği, izin reddi ekranı | Kamera takibi + atlas |
| **Görüntü** | DICOM (BT/MR) kesitleri, MPR, MIP, pencereleme, HU okuma; sentetik fantom | Tıbbi görüntü / sentetik |

**4D** burada yalnızca "zaman içinde değişen 3B animasyon" anlamındadır; animasyonlar eğitim amaçlı
simülasyondur, gerçek fizyolojik ölçüm değildir ve ekranda öyle işaretlenir.

Görüntü ve dosyalar cihazdan çıkmaz. İçerik Güvenlik Politikası (CSP) sayfanın dış adreslere
bağlanmasını engeller. WebGL2 olmayan cihazlar için eski şematik görünüm: `legacy.html`.

## Çalıştırma

```bash
npm install                 # yalnızca geliştirme araçları (test/derleme); uygulama vendor/ ile çalışır
npm run serve               # http://localhost:8000
npm test                    # birim testleri (node:test)
npm run test:browser        # Chromium: iPhone/Android/masaüstü profilleri, görsel regresyon, AR ve uzuv doğruluğu
                            #   (--only=kaslar,4d gibi süzgeç; --update-baselines temel görüntüleri yeniler)
node scripts/ab-quality.mjs # kalite A/B: pişirilmiş AO ve clearcoat açık/kapalı görüntü + kare süresi
npm run build:anatomy       # 3B modelleri sabitlenmiş kaynaklardan yeniden üret (~5 dk; AO pişirme dahil)
npm run vendor              # three.js / MediaPipe dosyalarını vendor/ altına kopyala
```

Bağlantılar: `#/anatomi`, `#/kamera`, `#/goruntu`, `#/goruntu?fantom`; kalite: `?lod=high|low`.

**iPhone:** Safari'de açıp Paylaş → "Ana Ekrana Ekle" ile tam ekran uygulama gibi çalışır (PWA: manifest,
simge, çevrimdışı önbellek). Kamera için HTTPS gerekir. App Store yayını için yerel sarmalayıcı (ör. Capacitor)
ve ücretli Apple geliştirici hesabı gerekir — kullanıcı onayı olmadan yapılmaz.

## 3B model kaynakları

- **BodyParts3D 4.3** — BodyParts3D, © The Database Center for Life Science licensed under CC Attribution 4.0
  International. Bu depodaki türev modeller ihtiyaten **CC BY-SA 4.0** (ayrıntı: `assets/anatomy/LICENSE.md`).
- **Z-Anatomy** (CC BY-SA 4.0, Gauthier Kervyn & Marcin Zielinski; BodyParts3D türevi) — kaslar ve tendonlar.
  Blender şablonundan dışa aktarılır, BodyParts3D iskeletine 12 bölgede afin ICP ile kaydedilir
  (bölge medyan hatası ≤ 1,53 mm). Ticari kullanım: CC BY-SA 4.0 atıf + aynı lisansla paylaşım şartıyla serbest.
- **Human Reference Atlas** (CC BY 4.0) — yalnızca derleme sırasında bağımsız konum doğrulaması için; dağıtılmaz.

Mimari, kararlar ve ölçümler: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)
