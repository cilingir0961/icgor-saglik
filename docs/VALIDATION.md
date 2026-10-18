# Ölçüm doğrulama durumu ve gerçek kişi doğrulama protokolü (v0.5)

İçGör'ün duruş, hareket ve vücut ölçüleri **eğitim amaçlı ve deneyseldir**. Bu belge neyin, hangi veriyle,
ne kadar doğrulandığını ve gerçek kişilerle doğrulamanın nasıl yapılması gerektiğini ayrı ayrı yazar.

## 1. Veri türleri — ayrı raporlanır

| Veri türü | Durum | Nerede |
|---|---|---|
| **Sentetik figür** (atlas kas+iskelet veya deri modeli, bilinen poz/ölçek, yer gerçeği eklem ve kesitleri) | **Yapıldı** | `scripts/pose-bench.mjs`, `posture-bench.mjs`, `movement-bench.mjs`, `silhouette-bench.mjs`; özetler `docs/bench/` |
| **Kayıtlı gerçek gönüllü videoları** (referans ölçümlü) | **Yapılmadı** — veri yok; toplama etik onay ve açık rıza gerektirir | Araç hazır: `scripts/eval-recording.mjs` (bkz. §4) |
| **Gerçek cihaz testleri** (iPhone Safari, Android Chrome) | **Yapılmadı** — bu ortamda yalnızca Chromium var; HTTPS yayını kullanıcı onayı bekliyor | — |

Sentetik figür gerçek insan değildir: giysi, saç, yumuşak doku hareketi, gerçek ışık ve kamera gürültüsü
yoktur. Sentetik hatalar **alt sınır** olarak okunmalıdır; gerçek kişide hata daha büyük olabilir.

## 2. Sentetik doğrulama sonuçları (özet)

| Ölçüm | Yöntem | Sentetik hata | Durum |
|---|---|---|---|
| Ekran düzlemindeki eklem açıları | MediaPipe **full**, 2B | medyan 1,9°, p90 12,8° (lite: p90 16,5°) | full model taramada kullanılır |
| Kameraya doğru bükülmüş uzuv açısı | 2B | 43°'ye kadar | **ölçülmez**: kısalmış segment kareleri dışlanır |
| MediaPipe 3B "world" açıları | 3B | medyan 17–22° | **kullanılmaz** |
| AR sol dirsek (v0.4'te 16–17°) | izlenen yön | lite 12–14°, full 8,9° | yöntem düzeltildi; tolerans gevşetilmedi (15°) |
| Gövdenin yana / öne eğilimi | 2B | RMS 0,9° / 0,8° | ölçülür |
| Omuz seviyesi | 2B | RMS 1,6°, en büyük 3,5°; yükseltmenin ~%65'i görülür | ölçülür, geniş pay |
| Baş-öne konumu (kulak–omuz, cm) | yandan, boyla ölçek | değişimde RMS 0,7 cm; **sola/sağa bakışta 2 cm fark** | yalnızca aynı yön karşılaştırılır |
| Kalça seviyesi, diz hizası, ayak yönelimi | 2B | 2–5° sistematik | deneysel |
| Kol kaldırma (en yüksek açı) | 2B, gövde eksenine göre | +3,2° / −5,9° | ±6° sistematik pay |
| Çömelme diz / kalça açısı | yandan | +2,3° / +1,4° | ölçülür |
| Öne eğilme | yandan | −1,3° | ölçülür |
| Tek ayak süresi / salınım | önden | −0,1 s / 0 cm | ölçülür (salınım deneysel) |
| Yürüyüş kadansı | yandan | +3,4 adım/dk (1 fazla adım) | deneysel |
| Boyun hareketleri | önden | **doğrulanmadı** (figürde baş ekleminde dönme yok) | deneysel |
| Siluet genişliği / derinliği | bölütleme maskesi | +0,8 cm sapma (düzeltilir), derinlik RMS ~2 cm | deneysel |
| Elips çevresi (göğüs altı, bel, kalça) | genişlik + derinlik | RMS %3, en büyük %4,8 | deneysel; giysi eklenir |
| Uyluk çevresi | maske | bacaklar birleşti (15 cm yerine 37 cm) | **çıkarıldı** |
| İkiz çarpanları (genişlik/derinlik) | atlas oranı | 1,099 (beklenen 1,10); 0,942 (0,92); 1,096 (1,10) | deneysel |

Karar kuralı: bir gözlem ancak nötr referanstan sapma **2 × belirsizlik** (≈%95) aşarsa bildirilir.
Nötr sentetik figürde bu kuralla yanlış bulgu çıkmadı (`tarama-akisi` testi); 1× kuralla diz hizası yanlış
bulgu üretiyordu. Klinik eşik kullanılmaz; hastalık adı verilmez.

## 3. Gerçek kişi doğrulama protokolü (öneri — uygulanmadı)

**Ön koşullar (kullanıcı onayı ve kurumsal süreç gerektirir):**
1. Bir üniversite/hastane **etik kurulu** onayı (insan katılımcılı araştırma).
2. **KVKK**: sağlık verisi özel nitelikli kişisel veridir → **açık rıza** (amaç, süre, erişim, silme hakkı),
   aydınlatma metni, veri sorumlusu bilgisi. Görüntüler şifreli depolanır, yüzler araştırma ekibi dışında
   paylaşılmaz, analizden sonra ham video belirlenen sürede silinir. Sunucuya otomatik yükleme yoktur.
3. Katılımcının testi istediği an bırakabilmesi; denge testlerinde yanında gözetmen.

**Referans (yer gerçeği) yöntemleri:**
- Eklem açıları: eğitimli değerlendiricinin gonyometre ölçümü (iki değerlendirici → değerlendiriciler arası
  güvenilirlik) veya işaretçili hareket yakalama sistemi (altın standart).
- Duruş: işaretçili fotogrametri (ör. akromiyon, C7, tragus, ASIS işaretleri) — CVA için C7 gerekir.
- Çevre: standart mezura protokolü (ISO 8559-1 düzeyleri), iki tekrar.

**Örneklem ve koşullar:** en az 30 katılımcı; farklı boy, beden yapısı, cilt tonu, yaş; dar/bol giysi;
iki ışık koşulu; en az iki telefon modeli (bir iPhone, bir Android); iki oturum (test–tekrar test).

**Analiz:** her ölçü için Bland–Altman (sapma, %95 uyum sınırları), ICC(2,1) ve test–tekrar test
SEM → MDC95. Uygulamadaki `U_SYS`, `SIL_CAL` ve hareket `uSys` değerleri bu sonuçlarla güncellenir; uyum
sınırları kabul edilemezse ilgili gösterge "deneysel" kalır veya kaldırılır.

## 4. Kayıt değerlendirme aracı

`node scripts/eval-recording.mjs <klasör>`: klasördeki her `*.webm` videosunu ve aynı adlı `*.json`
referans dosyasını okur, videoyu Chromium'da kare kare oynatıp uygulamanın **aynı** çözümleyicileriyle
(MediaPipe full) ölçer ve referansla karşılaştırır (sapma, uyum sınırları). Referans dosyası biçimi:

```json
{ "kind": "posture", "view": "front", "heightCm": 172,
  "reference": { "shoulderLevel": 1.5, "trunkLateral": 0.0 },
  "consent": { "id": "K-001", "signed": "2026-11-02", "ethics": "Kurul karar no …" } }
```

`consent` alanı olmayan kayıt **değerlendirilmez**. Araç sentetik bir WebM ile sınanmıştır
(`scripts/eval-recording.mjs --selftest`); gerçek gönüllü verisiyle henüz çalıştırılmamıştır.
