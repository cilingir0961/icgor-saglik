# Gerçek cihaz testi planı (özel HTTPS, yayın YOK)

Amaç: iPhone (WebKit) ve Android'de kamera, MediaPipe, ses, bildirim, hareket algılayıcısı ve PWA kurulumunu
**geliştiricinin kendi cihazında** denemek. Herkese açık barındırma, üretim dağıtımı, ücretli servis veya App
Store işlemi bu planın parçası değildir. Gerçek gönüllü verisi toplanmaz (etik onay + açık rıza olmadan yok).

## Neden HTTPS?

Kamera (`getUserMedia`), hareket algılayıcısı, servis çalışanı ve bildirimler yalnızca güvenli bağlamda
çalışır. `http://192.168.x.x` güvenli bağlam değildir; telefonda `localhost` da kullanılamaz.

## Seçenek A — Yerel ağ + mkcert (ücretsiz, internete açılmaz) — önerilen

1. Bilgisayarda: `mkcert -install` ve `mkcert 192.168.1.20 icgor.local` (kendi IP'niz).
2. Sunucuyu HTTPS ile başlatın: `node server/index.mjs --lan --port 8443 --cert 192.168.1.20.pem --key 192.168.1.20-key.pem`
   (sunucu yalnızca yerel ağda dinler; internete açmak için modem port yönlendirmesi YAPMAYIN.)
3. mkcert kök sertifikasını iPhone'a yükleyin: Ayarlar → Genel → VPN ve Aygıt Yönetimi → profil; sonra
   Ayarlar → Genel → Hakkında → Sertifika Güven Ayarları → tam güven.
4. iPhone Safari: `https://192.168.1.20:8443` → Paylaş → Ana Ekrana Ekle (bildirim testi için gerekli).
5. Test bitince kök sertifika profilini telefondan silin.

## Seçenek B — Tailscale özel ağ (ücretsiz kişisel plan, dış hesap gerekir → onayınızla)

`tailscale serve` ile yalnızca kendi tailnet cihazlarınızın erişebildiği geçerli bir HTTPS adresi alınır.
**`tailscale funnel` KULLANILMAZ** (herkese açar).

## Test listesi (her madde için: cihaz modeli, iOS/Android sürümü, tarayıcı, sonuç, ekran görüntüsü)

| # | Senaryo | Beklenen | Not |
|---|---|---|---|
| 1 | PWA kurulumu, çevrimdışı açılış | Uygulama açılır, 3B atlas yüklenir | |
| 2 | Kamera izni ver/ret | Ret mesajı Türkçe ve doğru | |
| 3 | AR uzuv takibi (lite) | ≥ 20 fps, ısınma notu | 10 dk sürekli kullanımda sıcaklık/pil |
| 4 | Tarama (full model) | Kalite kapısı yönergeleri, rapor | Kendiniz; gönüllü değil |
| 5 | Kamera koçu: squat, kol kaldırma, otur-kalk | Sayılan tekrar = yaptığınız tekrar | Elle sayımla karşılaştırın, 3 × 10 tekrar |
| 6 | Sesli sayım (tr-TR ses) | Türkçe sayılar okunur | iOS sessiz modu |
| 7 | Bildirim izni (Ana Ekran PWA, iOS 16.4+) | İzin penceresi yalnızca düğmeyle | Sekmede "desteklenmiyor" yazmalı |
| 8 | Deneme bildirimi ve zamanlı hatırlatma (uygulama açık) | Görünür, dokununca uygulama açılır | Uygulama kapalıyken GELMEMESİ beklenir |
| 9 | Yürüyüş sayacı (DeviceMotion izni) | 100 adımda ±%10 | Elle sayım; cep/el konumu ayrı |
| 10 | Asistan (demo) | Yanıtlar, 112 güvenlik yanıtı | Gerçek API kapalı |
| 11 | Veri silme / dışa aktarma | Depo boşalır, JSON iner | |

## Sonuç raporlama

Sentetik, gerçek cihaz (geliştirici) ve gerçek gönüllü sonuçları **ayrı** raporlanır. Kamera koçu ve yürüyüş
sayacı, gerçek cihaz sonuçları gelene kadar "Deneysel" kalır.
