# icgor-saglik — çalışma kuralları

- Bu depo bağımsızdır. Kullanıcının diğer projelerine (ÇilingirApp, İlhamla, Sansiro vb.) dokunma.
- İletişim Türkçe. Teknik kararları gerekçelendir, testleri çalıştırıp sonucu raporla.
- GitHub'a push, PR ve her türlü dış servis/ağ bağlantısı (npm install, CDN, model indirme,
  yayınlama) için önce kullanıcıdan onay al.
- Tıbbi dürüstlük: Kamera iç organları göremez. Şematik atlası asla kişinin gerçek anatomisi
  gibi sunma; uyarı metnini kaldırma. Gerçek organ görüntüsü yalnızca tıbbi görüntüleme
  donanımından (DICOM) gelir.
- Kod: bağımlılıksız ES modülleri; hesaplama saf fonksiyonlarda (`src/core`, `src/anatomy`,
  `src/render/scene.js`), DOM yalnızca `src/app.js` ve çizicide.
- Doğrulama: `npm test` ve `npm run smoke` her değişiklikten sonra geçmeli.
