# Platform yetenekleri: adım, bildirim, kamera (v0.6 araştırma notu)

Kural: bir özellik bu PWA mimarisinde gerçekten çalışmıyorsa çalışıyormuş gibi gösterilmez; ekranda
"kullanılamaz" ya da "deneysel" diye yazılır.

## Adım verisi

| Kaynak | Web/PWA'dan erişim | v0.6 durumu |
|---|---|---|
| Apple Sağlık (HealthKit) | **Yok.** Yalnızca yerel iOS uygulamaları (Swift, HealthKit yetkisi, App Store incelemesi). Tarayıcıdan çağrılabilen resmi bir HTTP/JS API'si bulunamadı. | "Kullanılamaz" olarak listelenir |
| Health Connect (Android) | **Yok.** Yalnızca yerel Android uygulamaları (androidx.health.connect). | "Kullanılamaz" |
| Google Fit API | Google, Android Fit API'sini 2026'da kapatıyor; yeni geliştirme için uygun değil. | Kullanılmadı |
| Fitbit Web API → Google Health API | Bulut OAuth API'si; dış hesap ve veri aktarımı gerektirir (onay gerekir). | Öneri olarak bırakıldı |
| Elle giriş | Her yerde | **Çalışıyor** |
| Hareket algılayıcısı (DeviceMotion) | Chrome/Android ve iOS Safari (iOS'ta izin düğmesiyle). Yalnızca sayfa açık ve ön plandayken; arka planda sayım yok. | **Deneysel** "Yürüyüş sayacı"; yalnızca sentetik sinyalle doğrulandı |
| Demo veri | — | Etiketli; grafik ve gelişim ekranında "DEMO" uyarısı |

Mimari: `src/activity/sources.js` bağdaştırıcı listesi. Yerel kabuk (ör. Capacitor + HealthKit/Health Connect
eklentisi) eklendiğinde yalnızca yeni bir kaynak eklenir; hesaplar (`steps.js`, `progress/metrics.js`) değişmez.
Bu, App Store / Play Store işlemi gerektirdiğinden **onayınızla ayrı aşamadır**.

## Bildirimler

| Platform | Uygulama açıkken | Uygulama kapalıyken |
|---|---|---|
| Android / masaüstü Chrome | **Çalışıyor** (izinle; SW `showNotification`) — Chromium'da test edildi | Web Push sunucusu gerekir → **yok** |
| iPhone, Safari sekmesi | Notification API yok | Yok |
| iPhone, Ana Ekrana eklenmiş PWA (iOS 16.4+) | Desteklenmeli; **gerçek cihazda test edilmedi** | Web Push + VAPID sunucusu gerekir → **yok** |

- İzin yalnızca kullanıcı "Bildirim izni ver" düğmesine dokununca istenir (iOS bunu zorunlu kılar).
- Zamanlanmış yerel bildirim (Notification Triggers / `showTrigger`) Chromium deneyiydi, standartlaşmadı;
  kullanılmadı.
- Uygulama kapalıyken hatırlatma için seçenekler (onayınızla): (a) Web Push sunucusu (VAPID anahtarları,
  abonelik saklama, barındırılan sunucu; bildirim içerikleri Apple/Google push servislerinden geçer, bu nedenle
  genel metin); (b) yerel kabukta işletim sistemi yerel bildirimleri.
- Kilit ekranı metinleri genel tutulur (ölçüm/sağlık ayrıntısı yok).

## Kamera koçu

- MediaPipe Pose (full model, cihazda). Görüntü kaydedilmez/gönderilmez.
- Test: Chromium + sahte kamera (sentetik figür videosu). Gerçek iPhone Safari/WebKit'te **test edilmedi**.

## Kaynaklar (araştırma, 2026-10-18)

- Üçüncü taraf geliştirici rehberleri: HealthKit'in web API'si olmadığı, yerel uygulama + arka uç senkronu gerektiği
  (acquaintsoft.com, rapidevelopers.com, docs.tryterra.co "mobile only sources need SDK").
- developer.android.com Health Connect geçiş rehberi (Google Fit Android API'nin 2026'da kapatılması).
- developers.google.com Health & Fitness bülteni (Ağustos 2026): Fitbit Web API'nin 30.09.2026'da kapanıp
  Google Health API'ye geçmesi.
- iOS web push gereksinimleri: OneSignal, Pushpad, MoEngage belgeleri (iOS 16.4+, Ana Ekrana ekleme, `display:
  standalone`, izin için kullanıcı etkileşimi).
- Not: Apple ve Google'ın birincil belgeleri bu ortamdan doğrudan okunamadı; yerel kabuk aşamasından önce
  birincil kaynaklardan yeniden doğrulanmalıdır.
