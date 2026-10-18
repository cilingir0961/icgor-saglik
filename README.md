# İçGör (icgor-saglik)

Mobil öncelikli **3B anatomi ve sağlık görüntüleme araştırma prototipi**.

> **Araştırma ve eğitim prototipidir. Tıbbi cihaz değildir, tanı koymaz.**
> Kamera vücudun yalnızca dış yüzeyini görür. Gösterilen organlar genel bir referans anatomi modelidir
> (atlas). Bir kişinin gerçek organ görüntüsü yalnızca uygun tıbbi görüntüleme donanımıyla (BT, MR,
> ultrason vb.) elde edilebilir.

## Ekranlar

| Ekran | Ne yapar | Veri sınıfı |
|---|---|---|
| **Anatomi** | Gerçek anatomik biçimli 3B model: deri, iskelet (6 grup), 17 organ. Döndürme, yakınlaştırma, katman saydamlığı, yapı seçme, tek başına inceleme, eğitim bilgi paneli, kalp atımı **simülasyonu** | Atlas modeli |
| **Kamera** | MediaPipe vücut takibiyle organ modelini kamera görüntüsüne **yaklaşık** yerleştirir; elle hizalama yedeği, izin reddi ekranı | Kamera takibi + atlas |
| **Görüntü** | DICOM (BT/MR) kesitleri, MPR, MIP, pencereleme, HU okuma; sentetik fantom | Tıbbi görüntü / sentetik |

Görüntü ve dosyalar cihazdan çıkmaz. İçerik Güvenlik Politikası (CSP) sayfanın dış adreslere
bağlanmasını engeller. WebGL2 olmayan cihazlar için eski şematik görünüm: `legacy.html`.

## Çalıştırma

```bash
npm install                 # yalnızca geliştirme araçları (test/derleme); uygulama vendor/ ile çalışır
npm run serve               # http://localhost:8000
npm test                    # birim testleri (node:test)
npm run test:browser        # Chromium: iPhone/Android/masaüstü profilleri, görsel regresyon, AR doğruluğu
npm run build:anatomy       # 3B modelleri sabitlenmiş kaynaklardan yeniden üret (≈1 dk, ilk sefer ~150 MB indirir)
npm run vendor              # three.js / MediaPipe dosyalarını vendor/ altına kopyala
```

Bağlantılar: `#/anatomi`, `#/kamera`, `#/goruntu`, `#/goruntu?fantom`; kalite: `?lod=high|low`.

## 3B model kaynakları

- **BodyParts3D 4.3** — BodyParts3D, © The Database Center for Life Science licensed under CC Attribution 4.0
  International. Bu depodaki türev modeller ihtiyaten **CC BY-SA 4.0** (ayrıntı: `assets/anatomy/LICENSE.md`).
- **Human Reference Atlas** (CC BY 4.0) — yalnızca derleme sırasında bağımsız konum doğrulaması için; dağıtılmaz.

Mimari, kararlar ve ölçümler: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)
