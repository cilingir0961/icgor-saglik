# Fikirler: değerlendirme ve durum (v0.5)

Ölçütler: **Uygulanabilirlik** (bu mimaride, web/PWA, cihaz üzerinde), **Doğruluk** (ölçülebilir mi,
nasıl doğrulanır), **Maliyet** (geliştirme + çalışma: pil/ısı/bellek; lisans), **Yarar** (kullanıcıya).
Durum: ✅ geliştirildi ve test edildi · 🧪 prototip/deneysel · 📝 öneri (uygulanmadı) · ⛔ reddedildi.

## Ölçüm güvenilirliği

| Fikir | Uygulanabilirlik | Doğruluk | Maliyet | Yarar | Durum |
|---|---|---|---|---|---|
| Yer gerçekli **sentetik doğrulama ortamı** (atlas figürü, bilinen poz/ölçek, kesitler) | yüksek | her gösterge için ölçülebilir hata | geliştirme | her teknik "körü körüne" değil, ölçülerek eklenir | ✅ |
| **Kanıta dayalı model seçimi** (lite/full/heavy kıyası) | yüksek | full: p90 12,8° (lite 16,5°); heavy 2,4× yavaş, küçük kazanç | full 9,4 MB indirme | taramada daha doğru noktalar | ✅ |
| MediaPipe 3B "world" noktalarıyla açı | yüksek | **17–22° hata** | — | — | ⛔ ölçüldü, kullanılmadı |
| **Belirsizlik bütçesi** (istatistik + sistematik + kamera eğimi) ve **2u karar kuralı** | yüksek | nötr figürde yanlış bulgu 0 | yok | her sayı ± ile; "ayırt edilemez" dürüstçe söylenir | ✅ |
| **Kısalan segment dışlama** (uzuv kameraya doğruysa açı ölçülmez) | yüksek | 2B açının 43°'ye varan hatasını önler | yok | yanlış açı raporlanmaz | ✅ |
| **Telefon eğim sensörü** ile düzlük kontrolü | iOS izin ister | eğim bilinirse açı payı 4°→1,5° | yok | omuz/gövde eğimi güvenilirliği | ✅ (gerçek cihazda sınanmadı) |
| **Koşul eşleştirmeli karşılaştırma + MDC95** | yüksek | sola/sağa bakışta 2 cm sahte fark yakalandı | yok | sahte ilerleme gösterilmez | ✅ |
| Işık/kadraj/mesafe/kararlılık **kalite kapısı** + tek yönerge | yüksek | kalibrasyon yetersizse ölçüm yok | yok | daha tekrarlanabilir çekim | ✅ |
| Kâğıt (A4) veya işaretçi ile **ölçek kalibrasyonu** (boy beyanı yerine) | orta | boy beyanı hatası (±2 cm) kalkar | algılama geliştirme | cm ölçülerinde daha az sapma | 📝 |
| Bulanıklık (Laplace varyansı) kapısı | yüksek | hareket bulanıklığını yakalar | küçük | hızlı harekette yanlış noktaları azaltır | 📝 |
| Kayıt değerlendirme aracı (rıza zorunlu) + gerçek kişi protokolü | yüksek | Bland–Altman, ICC, MDC | etik kurul + katılımcı | bilimsel doğrulamaya hazır | ✅ araç · 📝 veri |

## Kişisel 3B avatar

| Fikir | Uygulanabilirlik | Doğruluk | Maliyet | Yarar | Durum |
|---|---|---|---|---|---|
| **Siluet genişlik/derinlik → elips çevresi** (göğüs altı, bel, kalça) | yüksek (bölütleme maskesi) | sentetik RMS %3; uyluk başarısız → çıkarıldı | maske yalnızca 3 karede | ölçü + ikiz | 🧪 deneysel |
| **İkiz çarpanları** (boy × genişlik × derinlik, atlas derisine göre) | yüksek | oran 1,099/1,10; 0,942/0,92 | yok | kişiye benzeyen oranlar | 🧪 |
| Parametrik beden modeli (SMPL/SMPL-X/STAR) | orta | iyi bilinen yöntem | **lisans ticari kullanıma kapalı** | gerçekçi avatar | ⛔ lisans |
| Açık lisanslı parametrik beden (ör. MakeHuman CC0 tabanlı) + siluete uydurma | orta | doğrulanmalı | büyük geliştirme | daha gerçekçi avatar | 📝 sonraki aşama |
| iPhone LiDAR / derinlik kamerası | Safari'de yok; yerel uygulama gerekir | yüksek olabilir | App Store süreci (onay gerekir) | gerçek 3B tarama | 📝 |
| Uzuv boylarının ikize uygulanması | yüksek | segment hatası ±2,5 cm | deri ağı bölütlenmemiş | küçük | 📝 (deri bağlama sonrası) |

## Hareket kalitesi ve simetri

| Fikir | Uygulanabilirlik | Doğruluk | Maliyet | Yarar | Durum |
|---|---|---|---|---|---|
| Kol kaldırma, çömelme, öne eğilme, tek ayak, boyun, yürüyüş | yüksek | sentetik: 1–6°; boyun doğrulanmadı | yok | yönlendirmeli test | ✅ (boyun/yürüyüş deneysel) |
| Sağ–sol fark (belirsizlik yayılımıyla) | yüksek | u = √(u₁²+u₂²) | yok | asimetri dürüstçe | ✅ |
| Güvenlik soruları, ön koşullar, büyük Durdur, rahatsızlık sorusu | yüksek | — | yok | düşme/ağrı riskini azaltır | ✅ |
| Hareket akıcılığı (jerk), tekrar tutarlılığı | yüksek | doğrulama gerekir | küçük | hareket kalitesi | 📝 |
| Gerçek zamanlı geri bildirim ("biraz daha yavaş") | yüksek | — | küçük | kullanım kalitesi | 📝 |

## Eğitim, gelişim, erişilebilirlik, performans

| Fikir | Durum | Not |
|---|---|---|
| Gözleme bağlı **3B anatomi vurgusu** (ilgili kas/kemik) + genel biyomekanik metni | ✅ | teşhis dili yok; fıtık/skolyoz vb. gösterilmez |
| Ölçülen duruş / nötr referans çizimi | ✅ | raporda her görünüş için |
| 30/60/90 gün karşılaştırma, belirsizlik çubuklu eğilim grafiği | ✅ | koşul eşleşmezse karşılaştırma yapılmaz |
| Duruşa bağlı 4D eğitim animasyonu (ör. baş öne geldikçe boyun kaslarının moment kolu) | 📝 | "SİMÜLASYON" rozetiyle |
| Türkçe sesli yönlendirme (kapatılabilir), aria-live, metinli ✓/✗ (yalnızca renk değil), büyük düğmeler, azaltılmış hareket | ✅ | ses Web Speech API, cihaz üzerinde |
| Telefon sabit modu (ön kamera + geri sayım) / biri tutuyor modu | ✅ | |
| Maske yalnızca son karelerde; tarama 15 Hz; AR lite; hareket yokken çizim yok | ✅ | ısınma/pil için; gerçek cihazda ölçülmedi |
| MediaPipe kullanım telemetrisinin kapatılması | ✅ | CSP zaten engelliyordu |
| WebGPU ile çizim | 📝 | Safari desteği ve ölçüm sonrası |
