# icgor-saglik — çalışma kuralları

- Bu depo bağımsızdır. Kullanıcının diğer projelerine (ÇilingirApp, İlhamla, Sansiro vb.) dokunma.
- İletişim Türkçe. Teknik kararları gerekçelendir, testleri çalıştırıp sonucu raporla.
- Kullanıcının kalıcı yetkisi (2026-10-18): kod yazma/silme, dosya oluşturma, açık kaynak paket
  kurma, test çalıştırma, commit ve YALNIZCA `cilingir0061/icgor-saglik` deposuna push, yeni özellik,
  arayüz/performans iyileştirme ve güvenli ücretsiz araçlar onay beklemeden yapılabilir.
  Değişiklikler ve test sonuçları her seferinde raporlanır.
- Sınırlar (onaysız ASLA): diğer projelere dokunmak; ücretli hizmet/abonelik; gerçek sağlık
  verisini dış servise göndermek; doğrulanmamış cihazı insan üzerinde test etmeye yönelik iş;
  projeyi teşhis koyan onaylı cihaz gibi sunmak; üretim ortamına yayınlamak; güvenlik
  ayarlarını zayıflatmak.
- Tıbbi dürüstlük: Kamera iç organları göremez. Şematik atlası asla kişinin gerçek anatomisi
  gibi sunma; uyarı metnini kaldırma. Gerçek organ görüntüsü yalnızca tıbbi görüntüleme
  donanımından (DICOM) gelir.
- Kod: bağımlılıksız ES modülleri; hesaplama saf fonksiyonlarda (`src/core`, `src/anatomy`,
  `src/render/scene.js`), DOM yalnızca `src/app.js` ve çizicide.
- Doğrulama: `npm test` ve `npm run smoke` her değişiklikten sonra geçmeli.
