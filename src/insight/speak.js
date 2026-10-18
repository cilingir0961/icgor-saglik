// Sesli "Bana Anlat" (isteğe bağlı, varsayılan KAPALI). Yalnızca cihaz üzerindeki (localService) Türkçe ses
// kullanılır: bazı tarayıcıların çevrim içi sesleri metni üçüncü taraf sunucuya gönderir; bunlar SEÇİLMEZ.

/** @returns {{ok:boolean, why?:string, voice?:SpeechSynthesisVoice}} */
export function pickVoice(synth = globalThis.speechSynthesis) {
  if (!synth || typeof globalThis.SpeechSynthesisUtterance !== 'function') return { ok: false, why: 'Bu tarayıcı sesli okumayı desteklemiyor. Yazılı açıklamalar aynen kullanılabilir.' };
  const voices = synth.getVoices?.() ?? [];
  const tr = voices.filter((v) => /^tr(-|_|$)/i.test(v.lang));
  const local = tr.find((v) => v.localService !== false);
  if (local) return { ok: true, voice: local };
  if (tr.length) return { ok: false, why: 'Bu cihazdaki Türkçe ses yalnızca çevrim içi bir hizmetle çalışıyor; metin dışarı gönderilmesin diye kullanılmadı. Cihaz ayarlarından çevrimdışı Türkçe ses indirebilirsin.' };
  return { ok: false, why: voices.length ? 'Bu cihazda Türkçe ses bulunamadı. Cihaz ayarlarından Türkçe ses ekleyebilirsin; yazılı açıklamalar aynen kullanılabilir.' : 'Sesler henüz yüklenmedi veya bu cihazda ses yok. Biraz sonra yeniden dene.' };
}

/** Metni cümlelere bölüp okur. @returns {{stop:()=>void}|{error:string}} */
export function speak(text, { synth = globalThis.speechSynthesis, onEnd } = {}) {
  const p = pickVoice(synth);
  if (!p.ok) return { error: p.why };
  synth.cancel();
  const parts = String(text).replace(/\s+/g, ' ').split(/(?<=[.!?])\s+/).filter(Boolean);
  parts.forEach((t, i) => {
    const u = new SpeechSynthesisUtterance(t);
    u.lang = 'tr-TR';
    u.voice = p.voice;
    if (i === parts.length - 1) u.onend = () => onEnd?.();
    synth.speak(u);
  });
  return { stop: () => synth.cancel() };
}
