# İçGör (icgor-saglik)

Mobil öncelikli **3B anatomi, duruş/hareket analizi ve kişisel fitness asistanı** araştırma prototipi (v0.7).

> **Araştırma ve eğitim prototipidir. Tıbbi cihaz değildir, tanı koymaz.**
> Kamera vücudun yalnızca dış yüzeyini görür. Gösterilen organlar genel bir referans anatomi modelidir
> (atlas). Bir kişinin gerçek organ görüntüsü yalnızca uygun tıbbi görüntüleme donanımıyla (BT, MR,
> ultrason vb.) elde edilebilir.

## Ekranlar

| Ekran | Ne yapar | Veri sınıfı |
|---|---|---|
| **Bana Anlat** (v0.7) | "Vücudumda nerelere dikkat etmeliyim?" — ölçülen duruş/hareket farkları 3B vücutta ve haritada renkli işaretler (yeşil: belirgin fark yok, sarı: tekrar ölç, turuncu: birden fazla ölçümde süren fark, gri: ölçülmedi). Dokununca: hangi harekette kaç derece, ± belirsizlik, neden kesin sağlık sorunu anlamına gelmediği, kamera kaynaklı nedenler, uygun hafif hareketler. Vücudumun Özeti, isteğe bağlı cihaz içi sesli anlatım. **Teşhis değildir** ([`docs/INSIGHT.md`](docs/INSIGHT.md)) | Kamera ölçümü (yaklaşık) + atlas |
| **Bugün** (v0.6) | Günün antrenmanı, adımlar (uyarlanır hedef), su/uyku/mola alışkanlıkları, son tarama, asistan kısayolları | Kullanıcı kaydı |
| **Antrenman** (v0.6) | Profil + 7 soruluk güvenlik ön değerlendirmesi → haftalık plan (38 egzersiz; ev/salon, ekipman, kısıtlı bölgeler); oturumda tamamla, dinlenme sayacı, kolaylaştır/zorlaştır/değiştir/ertele, 3B hedef kaslar; geri bildirim (ağrı → yük artmaz, göğüs ağrısı → 112). **Kamera koçu** (deneysel): tekrar, açı, tempo, sağ–sol farkı, güvenilirlik kapısı | Genel rehberlik; kamera ölçümü (yaklaşık) |
| **Asistan** (v0.6) | Türkçe sohbet; anahtarsız **demo** sağlayıcı (varsayılan), OpenAI yalnızca sunucu tarafı ve açık onayla; paylaşım varsayılan kapalı, önizlemeli; acil durumda 112 | Metin; seçilen sayısal özetler |
| **Aktivite / Gelişim / Hatırlatmalar / Verilerim** (v0.6, ☰ menü) | Adım girişi, 7/30 gün grafiği, deneysel yürüyüş sayacı, kaynak durumu (HealthKit/Health Connect web'den kullanılamaz); 30/60/90 gün karşılaştırma (belirsizlik içindeki fark "belirsiz"); izinli, sessiz saatli hatırlatmalar (yalnızca uygulama açıkken); dışa aktarma, bölüm bölüm silme, AI paylaşımını kapatma | Kullanıcı kaydı |
| **Anatomi** | Tam vücut atlası, 6 katman: deri, kaslar ve tendonlar (9 bölge), iskelet, organlar, damarlar (aort, vena kava, arterler, venler), sinirler (omurilik, periferik). Döndürme, yakınlaştırma, katman saydamlığı, yapı arama/seçme, tek başına inceleme, Türkçe bilgi kartları, tam ekran. **4D eğitim simülasyonları**: iki evreli kalp atımı, solunum, kol kaldırma, yürüme | Atlas modeli |
| **Kamera** | MediaPipe vücut takibiyle atlası kamera görüntüsüne **yaklaşık** yerleştirir; kollar ve bacaklar (dirsek/bilek/diz/ayak bileği) takip edilir; organ/kas/iskelet/damar katmanları; uyarlanabilir tespit hızı; elle hizalama yedeği, izin reddi ekranı | Kamera takibi + atlas |
| **Tarama** (v0.5) | Kişisel duruş ve hareket analizi: bilgilendirme ve onay, profil (boy/kilo/yaş), önden–yandan–arkadan yönlendirmeli çekim (kalite kapısı, Türkçe sesli rehber), 6 hareket testi (güvenlik soruları), ±belirsizlikli rapor, deneysel vücut ölçüleri ve **dijital ikiz**, 30/60/90 gün karşılaştırma, yerel saklama / dışa aktarma / silme. **Deneyseldir, tanı koymaz.** | Kamera ölçümü (yaklaşık) + atlas |
| **Görüntü** | DICOM (BT/MR) kesitleri, MPR, MIP, pencereleme, HU okuma; sentetik fantom | Tıbbi görüntü / sentetik |

**4D** burada yalnızca "zaman içinde değişen 3B animasyon" anlamındadır; animasyonlar eğitim amaçlı
simülasyondur, gerçek fizyolojik ölçüm değildir ve ekranda öyle işaretlenir.

Görüntü ve dosyalar cihazdan çıkmaz. İçerik Güvenlik Politikası (CSP) sayfanın dış adreslere
bağlanmasını engeller; asistan yalnızca kendi sunucusuyla konuşur, OpenAI anahtarı istemcide değil sunucudadır.
Ayrıntılar: [`docs/AI.md`](docs/AI.md) (maliyet, güvenlik, KVKK), [`docs/PLATFORM.md`](docs/PLATFORM.md)
(adım/bildirim sınırları), [`docs/DEVICE-TEST.md`](docs/DEVICE-TEST.md) (gerçek cihaz test planı). WebGL2 olmayan cihazlar için eski şematik görünüm: `legacy.html`.

## Çalıştırma

```bash
npm install                 # yalnızca geliştirme araçları (test/derleme); uygulama vendor/ ile çalışır
npm run serve               # http://localhost:8000 (AI: anahtarsız demo; gerçek AI için docs/AI.md)
node server/index.mjs --lan --cert c.pem --key k.pem   # kendi telefonunda test: yerel ağ HTTPS (docs/DEVICE-TEST.md)
npm test                    # birim testleri (node:test)
npm run test:browser        # Chromium: iPhone/Android/masaüstü profilleri, görsel regresyon, AR ve uzuv doğruluğu
                            #   (--only=kaslar,4d gibi süzgeç; --update-baselines temel görüntüleri yeniler)
node scripts/ab-quality.mjs # kalite A/B: pişirilmiş AO ve clearcoat açık/kapalı görüntü + kare süresi
node scripts/pose-bench.mjs        # poz modeli kıyası (lite/full/heavy, sentetik yer gerçeği)
node scripts/posture-bench.mjs     # duruş göstergeleri doğrulaması
node scripts/movement-bench.mjs    # hareket testleri doğrulaması
node scripts/silhouette-bench.mjs  # siluet/çevre/ikiz doğrulaması
node scripts/coach-bench.mjs       # kamera koçu doğrulaması (tekrar sayısı, açı; sentetik)
node scripts/eval-recording.mjs <klasör>|--selftest  # kayıtlı video değerlendirme (rıza kaydı zorunlu)
npm run build:anatomy       # 3B modelleri sabitlenmiş kaynaklardan yeniden üret (~5 dk; AO pişirme dahil)
npm run vendor              # three.js / MediaPipe dosyalarını vendor/ altına kopyala
```

Bağlantılar: `#/bugun`, `#/anlat`, `#/anatomi?anlat`, `#/antrenman`, `#/asistan`, `#/aktivite`, `#/gelisim`, `#/bildirimler`, `#/verilerim`, `#/anatomi`, `#/kamera`, `#/tarama`, `#/goruntu`, `#/goruntu?fantom`; kalite: `?lod=high|low`;
poz modeli: `?model=lite|full`.

**Tarama ve ölçüm dürüstlüğü:** Kamera yalnızca dış hatları görür; iç organlar atlas referansıdır. Her ölçüm
± belirsizlik ve güvenilirlik derecesiyle verilir; sapma ancak belirsizliğin iki katını aşarsa bildirilir.
Doğrulama yalnızca sentetik figürle yapıldı; gerçek gönüllü ve gerçek cihaz doğrulaması yapılmadı
(ayrıntı: [`docs/VALIDATION.md`](docs/VALIDATION.md), fikir değerlendirmesi: [`docs/IDEAS.md`](docs/IDEAS.md)).

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
