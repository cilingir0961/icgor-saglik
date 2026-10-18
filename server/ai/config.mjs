// AI yapılandırması (yalnızca sunucu tarafı). API anahtarı ORTAM DEĞİŞKENİNDEN okunur; istemciye, günlüğe,
// hata mesajına veya depoya asla yazılmaz.
//
// Ücretli OpenAI çağrıları ÜÇ koşul birlikte sağlanmadıkça kapalıdır:
//   ICGOR_AI_PROVIDER=openai  +  OPENAI_API_KEY=…  +  ICGOR_AI_ENABLE_PAID=1  (kullanıcının açık onayıyla)
// Aksi hâlde anahtarsız "demo" (kural tabanlı) sağlayıcı çalışır.

export function loadConfig(env = process.env) {
  const wantsOpenAI = env.ICGOR_AI_PROVIDER === 'openai';
  const hasKey = typeof env.OPENAI_API_KEY === 'string' && env.OPENAI_API_KEY.length > 20;
  const paidApproved = env.ICGOR_AI_ENABLE_PAID === '1';
  const provider = wantsOpenAI && hasKey && paidApproved ? 'openai' : 'mock';
  const num = (v, d) => (Number.isFinite(Number(v)) && v !== '' && v != null ? Number(v) : d);
  return {
    provider,
    mockReason: provider === 'openai' ? null
      : !wantsOpenAI ? 'Demo modu (varsayılan)'
        : !hasKey ? 'OpenAI anahtarı tanımlı değil'
          : 'Ücretli kullanım onayı yok (ICGOR_AI_ENABLE_PAID=1 değil)',
    // Model ve fiyatlar yapılandırılabilir; fiyatları OpenAI'nin resmi fiyat sayfasından doğrulayın.
    model: env.OPENAI_MODEL ?? 'gpt-5.4-mini',
    priceInPerM: num(env.ICGOR_PRICE_IN_PER_M, 0.75),
    priceOutPerM: num(env.ICGOR_PRICE_OUT_PER_M, 4.5),
    maxOutputTokens: num(env.ICGOR_MAX_OUTPUT_TOKENS, 600),
    dailyBudgetUsd: num(env.ICGOR_DAILY_BUDGET_USD, 1),
    perDeviceDailyMessages: num(env.ICGOR_DEVICE_DAILY_MESSAGES, 30),
    perDeviceDailyTokens: num(env.ICGOR_DEVICE_DAILY_TOKENS, 40000),
    rate: { capacity: num(env.ICGOR_RATE_BURST, 5), refillPerMin: num(env.ICGOR_RATE_PER_MIN, 6) },
    timeoutMs: num(env.ICGOR_AI_TIMEOUT_MS, 25000),
    usageFile: env.ICGOR_USAGE_FILE ?? null,
    limits: { bodyBytes: 24000, messages: 20, messageChars: 1200, contextChars: 5000 },
  };
}

/** İstemciye gösterilebilir durum (anahtar veya gizli bilgi içermez). */
export function publicStatus(cfg) {
  return {
    provider: cfg.provider,
    demo: cfg.provider === 'mock',
    reason: cfg.mockReason,
    model: cfg.provider === 'openai' ? cfg.model : null,
    limits: { dailyMessages: cfg.perDeviceDailyMessages, maxChars: cfg.limits.messageChars },
  };
}
