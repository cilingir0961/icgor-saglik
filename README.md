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
- Görüntü cihazdan çıkmaz; sunucu, analitik veya dış servis yok.

## Çalıştırma

Bağımlılık yok, derleme adımı yok. Node 20+ ve Python 3 yeterli.

```bash
npm run serve        # http://localhost:8000 (kamera için localhost veya HTTPS gerekir)
npm test             # birim testleri (node:test)
npm run smoke        # headless Chromium ile telefon + masaüstü tarayıcı testi
```

URL sonuna `#orbit` (3B modu) veya `#camera` (kamerayı hemen aç) eklenebilir.

## Telefondan ve bilgisayardan geliştirme

- **Telefon:** Claude uygulamasındaki bulut oturumu bu depoyu klonlayıp üzerinde çalışır.
- **Bilgisayar:** `git clone https://github.com/cilingir0961/icgor-saglik` → `npm run serve`.
- İki taraf aynı GitHub deposu üzerinden senkron kalır. Telefonda kamerayla denemek için
  HTTPS gerekir (ör. GitHub Pages) — bkz. `docs/ARCHITECTURE.md` yol haritası.

Mimari ve teknik kararlar: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)
