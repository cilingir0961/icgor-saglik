# icgor-saglik

Kamera tabanlı **şematik** 3B anatomi görüntüleme prototipi.

> **Eğitim amaçlıdır, teşhis aracı değildir.** Kamera vücudun yalnızca dış yüzeyini görür.
> Uygulamanın gösterdiği organlar, kişinin gövde oranlarına hizalanmış genel bir modeldir.
> Bir kişinin gerçek organ görüntüsü yalnızca uygun tıbbi görüntüleme donanımıyla
> (BT, MR, ultrason, röntgen vb.) elde edilebilir.

## Ne yapıyor?

- **Kamera modu:** Telefon veya bilgisayar kamerasının görüntüsü üzerine, omuz ve kalça
  noktalarına hizalanmış şematik organ modeli çizer. Noktalar şimdilik elle sürüklenir.
- **3B modu:** Aynı modeli serbestçe döndürüp yakınlaştırma (dokunmatik ve fare).
- **DICOM modu:** Kendi BT/MR serinizi (sıkıştırılmamış DICOM) açıp aksiyel/koronal/sajital
  kesitleri ve MIP'i görüntüleme; pencere ön ayarları, dokunarak HU okuma. Gerçek veri olmadan
  denemek için **Fantom** düğmesi atlastan sentetik bir BT üretir.
- Görüntü ve dosyalar cihazdan çıkmaz; sunucu, analitik veya dış servis yok. İçerik Güvenlik
  Politikası (CSP) sayfanın dış adrese bağlanmasını tarayıcı düzeyinde engeller.

## Çalıştırma

Bağımlılık yok, derleme adımı yok. Node 20+ ve Python 3 yeterli.

```bash
npm run serve        # http://localhost:8000 (kamera için localhost veya HTTPS gerekir)
npm test             # birim testleri (node:test)
npm run smoke        # headless Chromium ile telefon + masaüstü tarayıcı testi
```

URL sonuna `#orbit`, `#dicom`, `#dicom-fantom` veya `#camera` (kamerayı hemen aç) eklenebilir.
Sentetik DICOM dosyaları üretmek için: `node scripts/make-sample-dicom.mjs ornek-dicom`.

## Telefondan ve bilgisayardan geliştirme

- **Telefon:** Claude uygulamasındaki bulut oturumu bu depoyu klonlayıp üzerinde çalışır.
- **Bilgisayar:** `git clone https://github.com/cilingir0961/icgor-saglik` → `npm run serve`.
- İki taraf aynı GitHub deposu üzerinden senkron kalır. Telefonda kamerayla denemek için
  HTTPS gerekir (ör. GitHub Pages) — bkz. `docs/ARCHITECTURE.md` yol haritası.

Mimari ve teknik kararlar: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)
