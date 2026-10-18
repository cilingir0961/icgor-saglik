# assets/ui — arayüz görselleri

Tüm görseller bu projenin 3B anatomi atlasından `scripts/render-ui-assets.mjs` ile üretilmiş renderlardır
(saydam arka plan, WebP). Fotoğraf, stok görsel veya üçüncü taraf illüstrasyon **kullanılmamıştır**.

## Kaynak ve lisans

Renderlar şu kaynak modellerin türevidir. Z-Anatomy (Paylaşımda aynı lisans) içerdiği için renderlar **CC BY-SA 4.0** ile dağıtılır:

- **BodyParts3D**, © The Database Center for Life Science, lisans: CC BY 4.0
  (https://creativecommons.org/licenses/by/4.0/) — iskelet (ve diğer atlas katmanları).
- **Z-Anatomy** — Gauthier Kervyn, Marcin Zielinski (BodyParts3D türevi), lisans: CC BY-SA 4.0
  (https://creativecommons.org/licenses/by-sa/4.0/) — kaslar ve tendonlar.

Ayrıntılı atıf: `assets/anatomy/LICENSE.md` ve uygulamadaki "Hakkında" ekranı.

## Yapılan değişiklikler

Kamera açısı/kadraj seçimi, katman seçimi (kaslar + iskelet), eğitim amaçlı renk vurgusu (hedef kas grubu
elektrik mavisi, diğerleri soluk) ve basitleştirilmiş eklem pozları (kol kaldırma, yürüme). Pozlar **SİMÜLASYON**dur;
gerçek bir kişinin hareketi veya ölçümü değildir. Görseller genel atlas modelidir; kullanıcının vücudunu göstermez.

## Dosyalar

| Dosya | İçerik |
|---|---|
| `body-front.webp`, `body-back.webp` (+ `.json`) | Tam vücut kas görünümü; `.json` Bana Anlat bölge işaretlerinin görseldeki yeri |
| `region-*.webp` | Bölge yakın planları (omuz, boyun, gövde, sırt, kalça, diz, denge) |
| `ex-kol-kaldirma.webp`, `ex-yurume.webp` | Egzersiz pozları (SİMÜLASYON) |
| `mg-*.webp` | Kas grubu vurguları (bacak, göğüs, sırt, karın, omuz, kalça, boyun) |
