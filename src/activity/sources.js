// Adım veri kaynakları (bağdaştırıcı mimarisi). Her kaynak, çalışıp çalışmadığını DÜRÜSTÇE bildirir.
// Araştırma özeti (docs/PLATFORM.md): HealthKit yalnızca yerel iOS uygulamalarına açıktır (Safari/PWA'dan erişim
// yok); Health Connect yalnızca yerel Android uygulamalarına açıktır. İkisi de ileride yerel kabuk (ör. Capacitor)
// + eklentiyle eklenebilir; bu sürümde "kullanılamaz" olarak gösterilir, sahte veri üretilmez.

export const SOURCES = {
  manuel: { tr: 'Elle giriş', kind: 'gercek', note: 'Telefonunuzun Sağlık/Fit uygulamasındaki sayıyı buraya yazabilirsiniz.' },
  ivme: { tr: 'Yürüyüş sayacı (uygulama açıkken)', kind: 'deneysel', note: 'Telefonun hareket algılayıcısıyla yalnızca uygulama açık ve ekran açıkken sayar. Arka planda çalışmaz; sentetik sinyalle doğrulandı, gerçek yürüyüşte doğrulanmadı.' },
  demo: { tr: 'Demo veri', kind: 'demo', note: 'Uygulamayı denemek için üretilmiş örnek sayılar. Gerçek ölçüm değildir ve her yerde "demo" olarak işaretlenir.' },
  healthkit: { tr: 'Apple Sağlık (HealthKit)', kind: 'yok', note: 'HealthKit yalnızca App Store\'daki yerel iOS uygulamalarına açıktır; web uygulaması (PWA) erişemez. Yerel iOS kabuğu gerekir (onayınızla, ayrı aşama).' },
  healthconnect: { tr: 'Health Connect (Android)', kind: 'yok', note: 'Health Connect yalnızca yerel Android uygulamalarına açıktır; tarayıcıdan erişilemez. Yerel Android kabuğu gerekir (ayrı aşama).' },
};

/** Tarayıcının hareket algılayıcısı durumu (DOM'a bağlı değil; global nesneler parametreyle verilebilir). */
export function motionSupport(g = globalThis) {
  if (!g.DeviceMotionEvent) return { ok: false, why: 'Bu cihaz/tarayıcı hareket algılayıcısı sağlamıyor.' };
  if (!g.isSecureContext) return { ok: false, why: 'Hareket algılayıcısı için HTTPS gerekir.' };
  const needsPermission = typeof g.DeviceMotionEvent.requestPermission === 'function'; // iOS 13+
  return { ok: true, needsPermission };
}
