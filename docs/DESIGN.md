# İçGör Studio — tasarım sistemi (v0.8)

Referans: kullanıcının paylaştığı beş ekranlı konsept görseli (Bugün, 3D Anatomi, Bölge Detayı, Kamera Koçu,
Bana Anlat). Görsel **birebir kopyalanmaz** ve uygulamaya resim olarak konmaz; kalite seviyesi hedeflenir. Konseptteki
fotoğraf ve hazır 3B görseller kullanılmaz: tüm anatomi görselleri projenin lisanslı 3B atlasından (BodyParts3D
CC BY 4.0, Z-Anatomy CC BY-SA 4.0) üretilir.

## İlkeler

1. **Bir bakışta ne yapacağım belli olsun:** her ekranda tek birincil eylem.
2. **Veri sınıfı her zaman görünür:** atlas (kişiye ait değil) · kamera ölçümü (yaklaşık) · tıbbi görüntü · SİMÜLASYON.
3. **Güvenilirlik tasarımın parçası:** belirsizlik, "deneysel" ve "ölçülmedi" durumları süs değil, bilgi; gizlenmez.
4. **Sakin premium:** az renk, güçlü tipografi, yumuşak gölge; gereksiz parlaklık ve animasyon yok.

## Tema: ekranın amacına göre

| Açık (günlük, okuma) | Koyu (görsel, kamera) |
|---|---|
| Bugün, Bana Anlat, Antrenman, Asistan, Aktivite, Gelişim, Bildirimler, Verilerim, Tarama ana sayfası/rapor | 3B Anatomi, Kamera AR, Kamera Koçu, Tarama çekimi, Tıbbi görüntü |

`body[data-theme]` yönlendiricide ekrana göre ayarlanır; bütün bileşenler aynı belirteçleri (CSS değişkenleri) kullanır.

## Belirteçler

| Belirteç | Koyu | Açık | Kullanım |
|---|---|---|---|
| `--bg` | #070D1C | #F3F6FB | sayfa |
| `--surface-solid` | #0F1A31 | #FFFFFF | kart |
| `--surface-2` | #16233F | #EEF2F8 | iç alan, giriş |
| `--text` | #EAF0FA | #0B1630 | metin |
| `--muted` | #93A3BF | #5A6A85 | ikincil metin |
| `--accent` | #3D8BFF | #1F6BFF | elektrik mavisi: birincil eylem, seçim |
| `--teal` | #2DD4BF | #0FB5A3 | ilerleme, olumlu |
| `--warn` | #FBBF24 | #B7791F | uyarı metni |
| durum renkleri | yeşil #34D399 · sarı #FACC15 · turuncu #FB923C · gri #64748B | aynı | Bana Anlat (kırmızı yok) |

- **Tipografi:** sistem yazı ailesi (iPhone'da SF Pro). Ölçek: Ekran başlığı 28/34 800 · Başlık 20/26 700 · Alt başlık
  16/22 600 · Gövde 15/22 · Açıklama 13/18 · Küçük 11.5/14. Sayılar `tabular-nums`.
- **Boşluk:** 4 pt ızgara (4, 8, 12, 16, 20, 24, 32). Sayfa kenarı 16–20 px.
- **Köşe:** kart 20 px · denetim 14 px · hap 999 px.
- **Gölge:** açık temada iki katmanlı yumuşak gölge; koyu temada ince kenar + çok hafif iç ışık.
- **Hareket:** 160–240 ms, ease-out; yalnızca durum değişiminde. `prefers-reduced-motion` saygılı.
- **İkonlar:** tek aile — projenin kendi 24 px çizgi ikon seti (1,8 px kontur, yuvarlak uç), `index.html` sprite.
- **Dokunma alanı:** en az 44 × 44 px. Kontrast: metin ≥ 4.5:1.

## Bileşenler

Kart (`.card`), kahraman kart (`.hero`), istatistik halkası (`.ring`), hafta şeridi (`.week`), hap etiket (`.pill`),
alt sayfa (`dialog.sheet`), bölümlü seçici (`.seg`), durum çipi (`.istatus`), güvenilirlik çubuğu (`.rel-bar`),
boş durum (`.empty` + özgün SVG çizim).

## Görsel varlıklar

`scripts/render-ui-assets.mjs` → `assets/ui/` (WebP, saydam arka plan): projenin 3B atlasından kas görünümü
renderları ve egzersiz pozları (rig hareketleri). Lisans: kaynak modellerin türevi → **CC BY-SA 4.0**, atıf
`assets/ui/LICENSE.md` ve Hakkında ekranında. Egzersiz pozları basitleştirilmiş **SİMÜLASYON**dur.

## Ekranlar (v0.8)

| Ekran | Birincil eylem | Yapı |
|---|---|---|
| Bugün | Antrenmanı başlat | Selamlama · hafta şeridi · kahraman kart · sıradaki egzersiz · adım/hafta halkaları · Bana Anlat kartı · alışkanlıklar |
| Antrenman | Antrenmanı başlat | Haftalık ilerleme halkası · sıradaki oturum (atlas görselli hareket şeridi) · oturum listesi (gün rozeti, ertele) · son antrenmanlar |
| Antrenman oturumu | Tamamlandı | İlerleme halkası + çubuk · güvenlik notu · görselli egzersiz kartları (doz, ipuçları, güvenlik, kamera ile say) |
| Kamera Koçu (koyu) | Bitir | Halka tekrar sayacı · durum balonu · alt şerit: açı / tempo / takip · kadraj rehberi (eklemler görünmeyince) |
| Asistan | Gönder | Başlık + demo rozeti · paylaşım paneli · boş durum · hızlı sorular · yazma kutusu |
| Tarama | Duruş taramasını başlat | Uyarı · kahraman kart · satır kartlar (hareket testleri, geçmiş, rapor, veriler) · profil ve çekim düzeni |
| Bana Anlat | Bölgeye dokun | Atlas vücut haritası + işaretler · renk açıklaması · özet · dikkat çeken noktalar · tüm bölgeler |
| Aktivite | Kaydet | Halka KPI · 7/30 gün grafiği (bugün vurgulu, hedef çizgisi) · hedef · yürüyüş sayacı (Deneysel) · kaynaklar |
| Gelişim | — (okuma) | Bu hafta KPI halkaları · haftalık grafik veya boş durum · adım dönemleri · koç ve tarama karşılaştırmaları |
| Bildirimler, Verilerim | İzin ver / Dışa aktar | Başlık + açıklama · kartlar |

### Ölçüm dürüstlüğü arayüzde

- Kamera koçunda **takip** göstergesi işlenen kare hızını ve eklemlerin görünmesini gösterir (ölçüm doğruluğu değildir).
  Takip yavaşken (< 8 kare/sn) açı ve tempo "—" olur; özet "Ölçüm güvenilir değil, tekrar deneyin" der.
- Kol kaldırma açısı "deneysel" etiketlidir (yalnızca sentetik doğrulama). Halka sayaç yalnızca hedef tekrar varsa dolar.
- Güvenlik yönlendirmesi balonunda kırmızı değil uyarı (amber) rengi kullanılır.
- Boş grafik yerine açıklamalı boş durum gösterilir; sıfır çubuklar "veri" gibi görünmez.
- Gövde arka plan geçişi yoktur: ilk açılışta koyu→açık parlaması olmaz.

## Mobil performans (sentetik ölçüm)

`PERF=1 node scripts/ui-shots.mjs docs/bench iphone` → `docs/bench/perf-iphone.json`. Headless Chromium, yazılım GPU'su
(SwiftShader), **4× CPU yavaşlatma**, önbellek kapalı, her ekran soğuk açılış. Gerçek cihaz ölçümü **değildir**.

| Ekran | Açılış (ms) | DOM öğesi | Görsel (KB) |
|---|---|---|---|
| Bugün | 298 | 145 | 61 |
| Antrenman | 187 | 64 | 92 |
| Antrenman oturumu | 273 | 199 | 111 |
| Asistan | 138 | 81 | 0 |
| Tarama | 269 | 81 | 0 |
| Bana Anlat | 305 | 167 | 85 |
| Aktivite | 179 | 100 | 0 |
| Gelişim | 104 | 70 | 0 |
| Bildirimler | 239 | 96 | 0 |
| Verilerim | 129 | 39 | 0 |
| 3B Anatomi | 10 439 | 164 | — (GLB modelleri) |

- Açık ekranlar yalnızca DOM + WebP; sürekli animasyon yok (işaret parıltısı yalnızca sarı/turuncu işaretlerde,
  `prefers-reduced-motion` ile kapanır). Isınma/pil açısından ek yük beklenmez, ancak **gerçek iPhone'da ölçülmedi**.
- Görseller `loading="lazy"`, boyutları önceden ayrılmış (kayma yok); `assets/ui` toplamı 532 KB, bir ekranda en çok ~111 KB.
- 3B Anatomi süresi yazılım GPU'suyla model indirme + çizimdir; gerçek GPU'lu cihazda çok daha kısa olması beklenir,
  bu da gerçek cihazda doğrulanmalıdır. JS bellek değerleri aynı sekmede yeniden yüklemeler arasında güvenilir
  ölçülemediği için tabloya konmadı.
