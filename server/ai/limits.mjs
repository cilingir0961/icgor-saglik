// Maliyet ve kötüye kullanım denetimi (saf + isteğe bağlı dosya kalıcılığı).
//  - Hız sınırı: cihaz+IP başına jeton kovası (ani yükleme ve otomasyon koruması)
//  - Günlük kota: cihaz başına mesaj ve jeton
//  - Günlük bütçe: tüm kullanıcılar için USD tavanı (aşılırsa ücretli çağrı yapılmaz, demo yanıta düşülür)

import { readFileSync, writeFileSync, renameSync } from 'node:fs';

/** Türkçe metin için kaba jeton tahmini (≈ 3,2 karakter/jeton); yalnızca ön kontrol içindir. */
export const estimateTokens = (text) => Math.ceil(String(text ?? '').length / 3.2);

export const costUsd = (inTok, outTok, cfg) => (inTok * cfg.priceInPerM + outTok * cfg.priceOutPerM) / 1e6;

export class RateLimiter {
  constructor({ capacity, refillPerMin }, now = () => Date.now()) {
    this.capacity = capacity;
    this.refillPerMs = refillPerMin / 60000;
    this.now = now;
    this.buckets = new Map();
  }

  /** @returns {{ok:boolean, retryAfterS?:number}} */
  take(key) {
    const t = this.now();
    const b = this.buckets.get(key) ?? { tokens: this.capacity, at: t };
    b.tokens = Math.min(this.capacity, b.tokens + (t - b.at) * this.refillPerMs);
    b.at = t;
    this.buckets.set(key, b);
    if (b.tokens >= 1) { b.tokens -= 1; return { ok: true }; }
    return { ok: false, retryAfterS: Math.ceil((1 - b.tokens) / this.refillPerMs / 1000) };
  }
}

export class Ledger {
  constructor(cfg, now = () => new Date()) {
    this.cfg = cfg;
    this.now = now;
    this.state = { day: this.today(), costUsd: 0, devices: {} };
    if (cfg.usageFile) {
      try { const s = JSON.parse(readFileSync(cfg.usageFile, 'utf8')); if (s.day === this.today()) this.state = s; } catch { /* ilk çalışma */ }
    }
  }

  today() { return this.now().toISOString().slice(0, 10); }

  roll() { if (this.state.day !== this.today()) this.state = { day: this.today(), costUsd: 0, devices: {} }; }

  device(id) { this.roll(); return (this.state.devices[id] ??= { messages: 0, tokens: 0 }); }

  /** Ücretli çağrıdan ÖNCE: kota ve bütçe yeterli mi? (tahmini maliyetle) */
  check(id, estIn, estOut, paid) {
    const d = this.device(id);
    if (d.messages >= this.cfg.perDeviceDailyMessages) return { ok: false, code: 'kota', message: `Günlük mesaj sınırına ulaştınız (${this.cfg.perDeviceDailyMessages}). Yarın tekrar deneyin.` };
    if (d.tokens + estIn + estOut > this.cfg.perDeviceDailyTokens) return { ok: false, code: 'kota', message: 'Günlük kullanım sınırına ulaştınız. Yarın tekrar deneyin.' };
    if (paid && this.state.costUsd + costUsd(estIn, estOut, this.cfg) > this.cfg.dailyBudgetUsd) return { ok: false, code: 'butce', message: 'Günlük yapay zekâ bütçesi doldu; bugün demo yanıtlar kullanılacak.' };
    return { ok: true };
  }

  record(id, inTok, outTok, paid) {
    const d = this.device(id);
    d.messages += 1;
    d.tokens += inTok + outTok;
    const c = paid ? costUsd(inTok, outTok, this.cfg) : 0;
    this.state.costUsd += c;
    this.persist();
    return { costUsd: +c.toFixed(6), remainingMessages: Math.max(0, this.cfg.perDeviceDailyMessages - d.messages) };
  }

  persist() {
    if (!this.cfg.usageFile) return;
    const tmp = `${this.cfg.usageFile}.tmp`;
    writeFileSync(tmp, JSON.stringify(this.state));
    renameSync(tmp, this.cfg.usageFile);
  }
}
