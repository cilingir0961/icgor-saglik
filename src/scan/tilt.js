// Telefon eğimi (DeviceOrientation): kamera düzlüğünü doğrulamak için. iOS 13+ izin ister (kullanıcı dokunuşuyla).
// Sensör yoksa/izin verilmezse "bilinmiyor" döner; açı ölçümlerinin belirsizliği buna göre büyütülür.

export class Tilt {
  constructor() {
    this.value = null; // {beta, gamma, at}
    this.state = 'unknown'; // unknown | granted | denied | unsupported
    this._on = (e) => {
      if (e.beta == null || e.gamma == null) return;
      this.value = { beta: e.beta, gamma: e.gamma, at: performance.now() };
    };
  }

  /** Kullanıcı dokunuşu içinde çağrılmalı (iOS izin penceresi). */
  async start() {
    const DOE = globalThis.DeviceOrientationEvent;
    if (!DOE) { this.state = 'unsupported'; return this.state; }
    try {
      if (typeof DOE.requestPermission === 'function') {
        const r = await DOE.requestPermission();
        if (r !== 'granted') { this.state = 'denied'; return this.state; }
      }
      addEventListener('deviceorientation', this._on);
      this.state = 'granted';
    } catch { this.state = 'denied'; }
    return this.state;
  }

  stop() { removeEventListener('deviceorientation', this._on); }

  /** Son 1 saniyede gelen geçerli okuma (masaüstünde olay hiç gelmez → null). */
  current() {
    return this.value && performance.now() - this.value.at < 1000 ? this.value : null;
  }
}
