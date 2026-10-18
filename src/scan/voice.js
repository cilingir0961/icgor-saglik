// Türkçe sesli yönlendirme (Web Speech API, cihaz üzerinde). Kapatılabilir; aynı cümleyi kısa sürede tekrarlamaz.
// Ses yoksa veya desteklenmiyorsa yönergeler yalnızca ekranda görünür.

export class Voice {
  constructor({ enabled = true, minRepeatMs = 4000 } = {}) {
    this.enabled = enabled;
    this.minRepeatMs = minRepeatMs;
    this.last = { text: '', at: 0 };
    this.log = []; // test ve erişilebilirlik için söylenenler
    this.synth = globalThis.speechSynthesis ?? null;
    this.voice = null;
    const pick = () => { this.voice = this.synth?.getVoices().find((v) => /^tr/i.test(v.lang)) ?? null; };
    if (this.synth) { pick(); this.synth.addEventListener?.('voiceschanged', pick); }
  }

  get supported() { return Boolean(this.synth); }

  setEnabled(on) {
    this.enabled = on;
    if (!on) this.synth?.cancel();
  }

  /**
   * @param {string} text
   * @param {{interrupt?:boolean, force?:boolean}} o interrupt: kuyruktakini kes; force: tekrar sınırını yok say
   */
  say(text, { interrupt = false, force = false } = {}) {
    if (!text) return false;
    const now = Date.now();
    if (!force && text === this.last.text && now - this.last.at < this.minRepeatMs) return false;
    this.last = { text, at: now };
    this.log.push({ text, at: now, spoken: this.enabled && this.supported });
    if (!this.enabled || !this.synth) return false;
    if (interrupt) this.synth.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'tr-TR';
    if (this.voice) u.voice = this.voice;
    u.rate = 1;
    this.synth.speak(u);
    return true;
  }

  stop() { this.synth?.cancel(); }
}
