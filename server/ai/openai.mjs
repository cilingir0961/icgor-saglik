// OpenAI Responses API sağlayıcısı (POST /v1/responses). Kaynak: openai/openai-openapi resmi şeması
// (2026-10-18 indirildi): `store` varsayılanı true → gizlilik için store:false gönderilir; `output_text`
// yalnızca SDK kolaylığıdır → metin `output[].content[].type === 'output_text'` öğelerinden birleştirilir;
// `usage.input_tokens/output_tokens` maliyet için; `safety_identifier` = cihaz kimliğinin SHA-256 özeti.
// Bu modül yalnızca config.provider === 'openai' iken (anahtar + açık onay) kullanılır.

import { createHash } from 'node:crypto';

export async function openaiReply({ instructions, input }, { cfg, deviceId, fetchImpl = fetch, apiKey = process.env.OPENAI_API_KEY }) {
  const body = {
    model: cfg.model,
    instructions,
    input,
    max_output_tokens: cfg.maxOutputTokens,
    store: false,
    safety_identifier: createHash('sha256').update(`icgor:${deviceId}`).digest('hex'),
  };
  const attempt = async () => {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), cfg.timeoutMs);
    try {
      return await fetchImpl('https://api.openai.com/v1/responses', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
        body: JSON.stringify(body),
        signal: ctl.signal,
      });
    } finally { clearTimeout(timer); }
  };
  let res;
  try {
    res = await attempt();
    // 429/5xx: bir kez, kısa beklemeyle yeniden dene
    if (res.status === 429 || res.status >= 500) { await new Promise((r) => setTimeout(r, 1200)); res = await attempt(); }
  } catch (e) {
    throw providerError(e.name === 'AbortError' ? 'zaman-asimi' : 'ag');
  }
  if (!res.ok) throw providerError(res.status === 429 ? 'yogunluk' : res.status === 401 ? 'yetki' : 'saglayici', res.status);
  const json = await res.json();
  if (json.status && json.status !== 'completed' && json.status !== 'incomplete') throw providerError('saglayici');
  const text = (json.output ?? [])
    .filter((o) => o.type === 'message')
    .flatMap((o) => o.content ?? [])
    .filter((c) => c.type === 'output_text')
    .map((c) => c.text)
    .join('\n').trim();
  if (!text) throw providerError('bos');
  return {
    text: json.status === 'incomplete' ? `${text}\n\n(Yanıt uzunluk sınırında kesildi.)` : text,
    usage: { inputTokens: json.usage?.input_tokens ?? 0, outputTokens: json.usage?.output_tokens ?? 0 },
  };
}

/** Kullanıcıya ayrıntı sızdırmayan hata (anahtar, iç adres veya ham yanıt içermez). */
function providerError(code, status) {
  const e = new Error(`ai:${code}`);
  e.code = code;
  e.status = status;
  return e;
}
