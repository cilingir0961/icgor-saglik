# icgor-saglik — çalışma kuralları

- Bu depo bağımsızdır. Kullanıcının diğer projelerine (ÇilingirApp, İlhamla, Sansiro vb.) dokunma.
- İletişim Türkçe. Teknik kararları gerekçelendir, testleri çalıştırıp sonucu raporla.
- Kullanıcının kalıcı yetkisi (2026-10-18): kod yazma/silme, dosya oluşturma, açık kaynak paket
  kurma, test çalıştırma, commit ve YALNIZCA `cilingir0961/icgor-saglik` deposuna push, yeni özellik,
  arayüz/performans iyileştirme ve güvenli ücretsiz araçlar onay beklemeden yapılabilir.
  Değişiklikler ve test sonuçları her seferinde raporlanır.
- Sınırlar (onaysız ASLA): diğer projelere dokunmak; ücretli hizmet/abonelik; gerçek sağlık
  verisini dış servise göndermek; doğrulanmamış cihazı insan üzerinde test etmeye yönelik iş;
  projeyi teşhis koyan onaylı cihaz gibi sunmak; üretim ortamına yayınlamak (GitHub Pages dahil);
  güvenlik ayarlarını zayıflatmak (CSP gevşetmek dahil).
- Tıbbi dürüstlük: Kamera iç organları göremez. Üç veri sınıfı her ekranda ayrı etiketlenir:
  atlas modeli (kişiye ait değil), kamera takibi (yaklaşık), tıbbi görüntü (yalnızca cihaz verisi, DICOM).
  Simülasyonlar (ör. kalp atımı) açıkça "SİMÜLASYON" olarak işaretlenir.
- Üçüncü taraf varlık: lisansı birincil kaynaktan doğrulanmadan eklenmez; atıf `assets/anatomy/LICENSE.md`
  ve "Hakkında" ekranında. Modeller `npm run build:anatomy` ile sabitlenmiş kaynaklardan yeniden üretilir.
- Kod: derleme adımı yok; üçüncü taraf kütüphaneler `npm run vendor` ile `vendor/` altına kopyalanır.
  Hesaplama saf modüllerde (`src/core`, `src/anatomy`, `src/camera/ar-fit.js`, `src/imaging/sources.js`,
  `src/three/lod.js`, `src/dicom/*`), DOM/WebGL ekran modüllerinde.
- Doğrulama: `npm test` (birim) ve `npm run test:browser` (Chromium: 3 cihaz profili, görsel regresyon,
  sahte kamerayla AR doğruluğu) her değişiklikten sonra geçmeli. Bilinçli görsel değişiklikte
  `npm run test:visual:update` ile temel görüntüler güncellenir ve nedeni commit mesajına yazılır.
- "4D" yalnızca "zaman içinde değişen 3B animasyon" anlamında kullanılır; "5D" gibi pazarlama terimleri
  kullanılmaz. Tüm animasyonlar "SİMÜLASYON — … (gerçek ölçüm değil)" rozetiyle gösterilir.
- Yeni görsel teknikler körü körüne eklenmez: `scripts/ab-quality.mjs` ile açık/kapalı karşılaştırılır,
  ölçülebilir kazanç ve mobil maliyet (ısınma, pil, bellek) `docs/ARCHITECTURE.md`'ye yazılır.
- Ücretli hizmet, dış hesap, gerçek sağlık verisi yükleme, üretim dağıtımı ve App Store yayını için
  önceden açık onay gerekir.
- Ölçüm dürüstlüğü (v0.5): yeni gösterge eklenmeden önce sentetik kıyasla (scripts/*-bench.mjs) hatası
  ölçülür; belirsizlik payları ölçümden gelir; doğruluğu kanıtlanmayan gösterge "Deneysel" işaretlenir.
  Test toleransı, hatayı gizlemek için gevşetilmez. Sentetik / gerçek gönüllü / gerçek cihaz sonuçları ayrı
  raporlanır. Kamerayla belirlenemeyen durumlar (fıtık, skolyoz, disk, organ, iç yağ) gösterilmez.
- Gerçek kişi verisi yalnızca etik onay + açık rıza ile; eval-recording.mjs rızasız kaydı değerlendirmez.
