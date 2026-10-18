# Fikirler: değerlendirme ve durum (v0.5 – v0.6)

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

## v0.6 — Kişisel asistan, antrenman ve aktivite fikirleri

Değerlendirme: Yarar · Uygulanabilirlik · Gerekli donanım · Doğruluk · Maliyet · Gizlilik/güvenlik riski.

| # | Fikir | Yarar | Uygulanabilirlik | Donanım | Doğruluk | Maliyet | Gizlilik/güvenlik riski | Durum |
|---|---|---|---|---|---|---|---|---|
| 1 | **Anahtarsız cihaz içi demo asistan** (sunucu yoksa aynı güvenlik sınıflaması + kural tabanlı yanıt) | Çevrimdışı ve ücretsiz çalışır | yüksek | yok | kural tabanlı, sınırlı | 0 | yok (veri çıkmaz) | ✅ |
| 2 | **Paylaşım önizlemesi**: gönderilecek metnin aynısı + her yanıtta "paylaşılan: …" etiketi | Bilinçli rıza | yüksek | yok | — | 0 | riski azaltır | ✅ |
| 3 | **Ağrı/baş dönmesi geri bildirimine göre yük kilidi** (ağrıda artış yok, bölge plandan çıkar, göğüs ağrısında 112) | Güvenlik | yüksek | yok | kural; klinik doğrulama yok | 0 | düşük | ✅ |
| 4 | **Kamera koçu güvenilirlik kapısı**: görünürlük < %70, < 2 tekrar veya dağınık açıda açı/tempo yorumu gizlenir | Yanlış yönlendirmeyi önler | yüksek | kamera | sentetik ölçüldü | düşük | görüntü cihazda | ✅ |
| 5 | **Koç ROM eğilimi MDC95 ile**: değişim yalnızca en küçük saptanabilir değişimi aşarsa "olası" | Sahte iyileşme yok | yüksek | kamera | belirsizlik ölçümden | 0 | düşük | ✅ |
| 6 | **Adım ortalamalarında dalgalanma payı** (iki dönem ortalaması farkı ±1,96·SE) | Günlük gürültüyü "artış" saymaz | yüksek | yok | istatistik | 0 | yok | ✅ |
| 7 | **Uyarlanır adım hedefi** (son 14 günün ortancası +%10, 3.000–12.000) | Gerçekçi hedef | yüksek | yok | kanıtla uyumlu kademeli artış; kişiye özel doğrulama yok | 0 | yok | ✅ |
| 8 | **Ön plan yürüyüş sayacı** (DeviceMotion, uygulama açıkken) | HealthKit yokken gerçek ölçüm | orta | ivmeölçer | yalnızca sentetik; gerçek yürüyüşte bilinmiyor | düşük (ekran açık → pil) | düşük | 🧪 |
| 9 | **Sessiz saat + günlük üst sınır + genel bildirim metni** | Bildirim yorgunluğu ve kilit ekranı gizliliği | yüksek | yok | — | 0 | riski azaltır | ✅ |
| 10 | **Sesli tekrar sayımı** (Türkçe, cihaz üzerinde) | Telefona bakmadan antrenman | yüksek | hoparlör | sayım koça bağlı | 0 | yok | ✅ |
| 11 | **Yerel HTTPS (`--cert/--key`)** ile kendi telefonda test | Gerçek cihaz testi yayın olmadan | yüksek | Wi-Fi | — | 0 | düşük (yalnızca LAN) | ✅ |
| 12 | Web Push sunucusu (uygulama kapalıyken hatırlatma) | Gerçek hatırlatma | orta | sunucu | — | barındırma | push servisine meta veri gider | 📝 onay gerekir |
| 13 | Yerel kabuk (Capacitor) + HealthKit/Health Connect | Otomatik adım | orta | telefon | işletim sistemi verisi | geliştirici hesapları (ücretli) | sağlık verisi izinleri, mağaza incelemesi | 📝 onay gerekir |
| 14 | Kamerayla **tempo metronomu** (ör. 2 sn iniş için sesli "in… kalk") | Kontrollü hareket | yüksek | kamera/hoparlör | koç tempo ölçümüne bağlı | düşük | yok | 📝 |
| 15 | Gerçek AI ile **haftalık değerlendirme** (yalnızca seçili özetler) | Kişisel yorum | yüksek (altyapı hazır) | yok | model yanıtı denetlenmeli | ≈ $0,0025/mesaj | yurt dışı aktarım (KVKK m.9) | 📝 onay gerekir |
| 16 | Antrenman sırasında **kalp hızı tahmini (kamera rPPG)** | — | düşük | kamera | hareket halinde güvenilmez | — | sağlık iddiası riski | ⛔ |
| 17 | Kilo/yağ oranı "fotoğraftan tahmin" | — | düşük | kamera | doğrulanamaz | — | yanlış yönlendirme | ⛔ (CLAUDE.md: iç yağ gösterilmez) |
| 18 | Takviye/beslenme planı önerisi | — | — | — | kanıt ve kişiye özgü değerlendirme gerekir | — | sağlık riski | ⛔ (uzmana yönlendirme) |
