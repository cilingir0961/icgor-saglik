// Sohbet uç noktası mantığı (HTTP'den bağımsız; test edilebilir).
//  1) Girdi doğrulama ve temizleme  2) Hız sınırı  3) Güvenlik sınıflaması (acil/kriz → model çağrılmaz)
//  4) Kota/bütçe ön kontrolü  5) Sağlayıcı (OpenAI yalnızca onaylıysa; hata/bütçede demo yanıta düşer)  6) Kullanım kaydı

import { classify, sanitize } from './safety.mjs';
import { buildRequest } from './prompt.mjs';
import { mockReply } from './mock.mjs';
import { openaiReply } from './openai.mjs';
import { estimateTokens, RateLimiter, Ledger } from './limits.mjs';

export function createChat(cfg, { fetchImpl, now } = {}) {
  const limiter = new RateLimiter(cfg.rate, now);
  const ledger = new Ledger(cfg);

  /** @returns {{status:number, body:object}} */
  async function handle(payload, { ip = '' } = {}) {
    const v = validate(payload, cfg);
    if (v.error) return { status: 400, body: { error: v.error } };
    const { messages, context, deviceId } = v;
    const rl = limiter.take(`${deviceId}|${ip}`);
    if (!rl.ok) return { status: 429, body: { error: 'Çok hızlı mesaj gönderiyorsunuz. Biraz bekleyin.', retryAfterS: rl.retryAfterS } };

    const last = messages.filter((m) => m.role === 'user').at(-1)?.content ?? '';
    const safety = classify(last);
    if (safety.reply) {
      // Acil/kriz: sabit güvenli yanıt; model ve kota kullanılmaz
      return { status: 200, body: { reply: safety.reply, provider: 'guvenlik', demo: false, safety: safety.level, usage: null } };
    }
    const contextText = context ? contextToText(context) : null;
    const req = buildRequest(messages, contextText, safety.level);
    const estIn = estimateTokens(req.instructions) + messages.reduce((s, m) => s + estimateTokens(m.content), 0);
    const paid = cfg.provider === 'openai';
    const q = ledger.check(deviceId, estIn, cfg.maxOutputTokens, paid);
    if (!q.ok && q.code === 'kota') return { status: 429, body: { error: q.message } };

    let reply, provider = 'mock', usage = { inputTokens: 0, outputTokens: 0 }, notice = null;
    if (paid && q.ok) {
      try {
        const r = await openaiReply(req, { cfg, deviceId, fetchImpl });
        reply = r.text; usage = r.usage; provider = 'openai';
      } catch (e) {
        notice = e.code === 'yogunluk' ? 'Yapay zekâ hizmeti şu an yoğun; demo yanıt gösteriliyor.' : 'Yapay zekâ hizmetine ulaşılamadı; demo yanıt gösteriliyor.';
      }
    } else if (paid) notice = q.message; // bütçe doldu
    if (!reply) {
      reply = mockReply({ messages, context, level: safety.level });
      usage = { inputTokens: estIn, outputTokens: estimateTokens(reply) };
    }
    const rec = ledger.record(deviceId, usage.inputTokens, usage.outputTokens, provider === 'openai');
    return {
      status: 200,
      body: { reply, provider, demo: provider !== 'openai', notice, safety: safety.level, usage: { ...usage, costUsd: rec.costUsd }, remainingMessages: rec.remainingMessages },
    };
  }

  return { handle, ledger };
}

/** İstek doğrulama: tür, sayı ve uzunluk sınırları; bilinmeyen alanlar atılır. */
export function validate(p, cfg) {
  if (!p || typeof p !== 'object') return { error: 'Geçersiz istek.' };
  const deviceId = typeof p.deviceId === 'string' && /^[a-z0-9-]{8,64}$/i.test(p.deviceId) ? p.deviceId : null;
  if (!deviceId) return { error: 'Geçersiz cihaz kimliği.' };
  if (!Array.isArray(p.messages) || !p.messages.length || p.messages.length > cfg.limits.messages) return { error: 'Mesaj listesi geçersiz.' };
  const messages = [];
  for (const m of p.messages) {
    if (!m || !['user', 'assistant'].includes(m.role) || typeof m.content !== 'string') return { error: 'Mesaj biçimi geçersiz.' };
    const content = sanitize(m.content, cfg.limits.messageChars * (m.role === 'assistant' ? 3 : 1));
    if (m.role === 'user' && m.content.length > cfg.limits.messageChars) return { error: `Mesaj en fazla ${cfg.limits.messageChars} karakter olabilir.` };
    if (content) messages.push({ role: m.role, content });
  }
  if (messages.at(-1)?.role !== 'user') return { error: 'Son mesaj kullanıcıdan olmalı.' };
  let context = null;
  if (p.context != null) {
    const raw = JSON.stringify(p.context);
    if (raw.length > cfg.limits.contextChars) return { error: 'Paylaşılan özet çok büyük.' };
    context = p.context;
  }
  return { messages, context, deviceId };
}

/** Yapılandırılmış özeti modele verilecek düz metne çevirir (yalnızca bilinen alanlar). */
export function contextToText(c) {
  const out = [];
  const s = (x) => sanitize(x, 200);
  if (c.profile) {
    const p = c.profile;
    out.push(`Profil: ${[p.age && `${p.age} yaş`, p.heightCm && `${p.heightCm} cm`, p.weightKg && `${p.weightKg} kg`, p.level && `seviye ${s(p.level)}`, p.goal && `hedef ${s(p.goal)}`, p.location && `yer ${s(p.location)}`, p.daysPerWeek && `haftada ${p.daysPerWeek} gün`, p.minutesPerDay && `${p.minutesPerDay} dk`, p.limitations?.length && `kısıtlar: ${p.limitations.map(s).join(', ')}`].filter(Boolean).join(', ')}`);
  }
  if (Array.isArray(c.posture)) {
    out.push('Duruş gözlemleri (kamera, yaklaşık; ± belirsizlik; tanı değildir):');
    for (const o of c.posture.slice(0, 12)) out.push(`- ${s(o.tr)}: ${o.value} ${s(o.unit)} ± ${o.u}${o.experimental ? ' [deneysel]' : ''}${o.distinguishable ? ` → belirsizliği aşan sapma: ${s(o.sense)}` : o.distinguishable === false ? ' → nötrden ayırt edilemez' : ''}`);
  }
  if (Array.isArray(c.movements)) {
    out.push('Hareket testleri:');
    for (const m of c.movements.slice(0, 12)) out.push(`- ${s(m.tr)}: ${m.value} ${s(m.unit)} ± ${m.u}${m.experimental ? ' [deneysel]' : ''}`);
  }
  if (c.activity) out.push(`Aktivite: bugün ${c.activity.today ?? '?'} adım, 7 gün ortalaması ${c.activity.weekAvg ?? '?'}, hedef ${c.activity.goal ?? '?'}${c.activity.demo ? ' (demo veri)' : ''}`);
  if (c.workouts) out.push(`Antrenman: bu hafta ${c.workouts.thisWeek} tamamlandı (plan ${c.workouts.planned ?? '?'}), son his: ${s(c.workouts.lastFeeling ?? '?')}${c.workouts.pain ? ', son antrenmanda ağrı bildirildi' : ''}`);
  if (Array.isArray(c.comparisons)) {
    out.push('Karşılaştırmalar (aynı koşullar, MDC95):');
    for (const x of c.comparisons.slice(0, 8)) out.push(`- ${s(x.tr)}: ${s(x.text)}`);
  }
  return out.join('\n');
}
