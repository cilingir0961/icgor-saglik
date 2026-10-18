// getUserMedia sarmalayıcısı. Görüntü yalnızca cihazda işlenir; hiçbir yere gönderilmez.

export const CAMERA_ERRORS_TR = {
  unsupported: 'Bu tarayıcı kamera erişimini desteklemiyor.',
  insecure: 'Kamera için HTTPS veya localhost gerekir.',
  NotAllowedError: 'Kamera izni reddedildi. Tarayıcı ayarlarından izin verebilirsiniz.',
  NotFoundError: 'Kamera bulunamadı.',
  NotReadableError: 'Kamera başka bir uygulama tarafından kullanılıyor olabilir.',
  OverconstrainedError: 'İstenen kamera ayarları desteklenmiyor.',
};

export class CameraSource {
  constructor(videoEl) {
    this.video = videoEl;
    this.stream = null;
    this.facingMode = 'user';
  }

  get active() {
    return Boolean(this.stream);
  }

  /** Ön kamera (user) görüntüsü ayna olarak gösterilir. */
  get mirrored() {
    return this.facingMode === 'user';
  }

  async start(facingMode = this.facingMode) {
    if (!globalThis.isSecureContext) throw codedError('insecure');
    if (!navigator.mediaDevices?.getUserMedia) throw codedError('unsupported');
    this.stop();
    this.facingMode = facingMode;
    this.stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode, width: { ideal: 1280 }, height: { ideal: 720 } },
      audio: false,
    });
    this.video.srcObject = this.stream;
    await this.video.play();
  }

  async flip() {
    return this.start(this.facingMode === 'user' ? 'environment' : 'user');
  }

  stop() {
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    this.video.srcObject = null;
  }
}

function codedError(code) {
  const e = new Error(code);
  e.name = code;
  return e;
}

export const describeCameraError = (e) => CAMERA_ERRORS_TR[e?.name] ?? `Kamera açılamadı (${e?.name ?? 'bilinmeyen hata'}).`;
