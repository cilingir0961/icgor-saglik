// AI asistan ekranı (#/asistan). Sohbet arka uca (/api/chat) gider; API anahtarı yalnızca sunucudadır.
// Sunucu yoksa (statik barındırma, çevrimdışı) aynı demo yanıtlayıcı cihaz içinde çalışır; hiçbir veri çıkmaz.
// Kişisel veri paylaşımı varsayılan KAPALI; açılan her kategori gönderilmeden önce aynen önizlenir.

import { getStore } from '../scan/store.js';
import { h, icon } from '../scan/dom.js';
import { SHARE_CATEGORIES, buildContext, previewLines } from './context.js';
import { pageHead } from '../ui/visuals.js';

const QUICK = [
  'Vücudumda nerelere dikkat etmeliyim?',
  '175 cm ve 90 kg\'ım, nereden başlamalıyım?',
  'Omuzlarım öne doğru duruyor, hangi hareketleri yapabilirim?',
  'Evde ekipmansız 20 dakikalık program hazırla',
  'Bugün 4000 adım attım, hedefimi nasıl artırabilirim?',
  'Spor salonu için haftalık program oluştur',
  'Tarama raporumdaki gövde eğimi ne anlama geliyor?',
  'Bugünkü antrenmanı tamamladım, yarın ne yapmalıyım?',
];
const MAX_SEND = 20;
const MAX_CHARS = 1200;

export async function createAssistantScreen() {
  const store = getStore();
  const page = document.getElementById('assistant-page');
  const dbg = (window.__icgorAssistant = { status: null, sent: [] });
  let status = null, busy = false, offline = null;

  const chat = () => store.state.chat ?? { messages: [], share: {}, keepHistory: true };
  const setChat = (patch) => store.update('chat', (c) => ({ ...(c ?? { messages: [], share: {}, keepHistory: true }), ...patch }));
  // "Geçmişi sakla" kapalıysa mesajlar depoya hiç yazılmaz; yalnızca bu sayfanın belleğinde durur.
  let mem = [];
  const msgs = () => (chat().keepHistory === false ? mem : chat().messages ?? []);
  const setMsgs = (m) => { if (chat().keepHistory === false) mem = m; else setChat({ messages: m }); };

  async function loadStatus() {
    try {
      const r = await fetch('api/ai/status', { cache: 'no-store' });
      if (!r.ok) throw new Error(String(r.status));
      status = await r.json();
    } catch {
      status = { provider: 'cihaz', demo: true, reason: 'Sunucuya ulaşılamadı; cihaz içi demo yanıtlayıcı kullanılıyor.' };
    }
    dbg.status = status;
  }

  function badge() {
    if (!status) return h('span', { class: 'badge' }, '…');
    if (status.provider === 'openai') return h('span', { class: 'badge info', id: 'ai-badge' }, `OpenAI · ${status.model}`);
    return h('span', { class: 'badge', id: 'ai-badge', title: status.reason ?? '' }, status.provider === 'cihaz' ? 'Demo · cihaz içi' : 'Demo mod');
  }

  function render() {
    const c = chat();
    const ctx = buildContext(store.state, c.share);
    const log = h('div', { class: 'chat-log', id: 'chat-log', 'aria-live': 'polite' },
      msgs().length ? msgs().map(bubble) : h('div', { class: 'chat-empty', id: 'chat-empty' }, h('span', { class: 'stat-ico' }, icon('i-chat')), h('strong', {}, 'Bir soru sorarak başla'), h('p', { class: 'muted small' }, 'Antrenman, hareket, adım, uyku, beslenme, su, ergonomi ve motivasyon hakkında soru sorabilirsiniz. Asistan teşhis koymaz ve ilaç önermez.')));
    const input = h('textarea', { id: 'chat-input', rows: 2, maxlength: MAX_CHARS, placeholder: 'Sorunuzu yazın…', 'aria-label': 'Mesaj' });
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(input.value); } });
    page.replaceChildren(h('div', { class: 'assistant' },
      pageHead('Asistan', 'Sana nasıl yardım edebilirim?', null, badge()),
      h('p', { class: 'sub' }, status?.demo
        ? 'Demo modu: yanıtlar sabit kurallarla ve kişisel planlayıcıyla cihazınızda/sunucuda üretilir; gerçek yapay zekâ modeli kullanılmaz ve ücret oluşmaz.'
        : 'Yanıtlar OpenAI modeliyle üretilir. Eğitim amaçlıdır; teşhis, tedavi veya ilaç önerisi değildir.'),
      sharePanel(c, ctx),
      log,
      h('div', { class: 'chips quick', id: 'chat-quick' }, QUICK.map((q) => h('button', { class: 'chip-btn', type: 'button', onclick: () => send(q) }, q))),
      h('form', { class: 'chat-form', onsubmit: (e) => { e.preventDefault(); send(input.value); } },
        input,
        h('button', { class: 'btn primary', id: 'btn-chat-send', type: 'submit', 'aria-label': 'Gönder', disabled: busy }, busy ? '…' : 'Gönder')),
      h('p', { class: 'muted small' }, 'Acil bir durumda (göğüs ağrısı, ani nefes darlığı, bayılma) 112\'yi arayın. Kamera görüntüsü asistana hiçbir zaman gönderilmez.'),
      historyControls(c)));
    log.scrollTop = log.scrollHeight;
  }

  function bubble(m) {
    return h('div', { class: `msg ${m.role}`, dataset: { role: m.role, provider: m.provider ?? '' } },
      h('p', {}, m.content),
      m.role === 'assistant' && m.provider ? h('span', { class: 'msg-meta' },
        { openai: 'OpenAI', mock: 'Demo', cihaz: 'Demo · cihaz içi', guvenlik: 'Güvenlik yönlendirmesi', hata: 'Hata' }[m.provider] ?? m.provider,
        m.shared?.length ? ` · paylaşılan: ${m.shared.map((k) => SHARE_CATEGORIES[k]?.tr ?? k).join(', ')}` : '') : null,
      m.notice ? h('span', { class: 'msg-meta warn' }, m.notice) : null);
  }

  function sharePanel(c, ctx) {
    const on = Object.entries(c.share ?? {}).filter(([, v]) => v).map(([k]) => k);
    return h('details', { class: 'share-panel', id: 'share-panel' },
      h('summary', {}, icon('i-lock'), on.length ? ` Paylaşılan bilgiler: ${on.length} kategori` : ' Kişisel bilgi paylaşılmıyor (önerilen varsayılan)'),
      h('p', { class: 'small' }, `Açtığınız kategoriler yalnızca mesaj gönderdiğinizde ${status?.provider === 'openai' ? 'sunucu üzerinden OpenAI\'ye (kayıt tutmama isteğiyle, store:false)' : 'yerel sunucuya (demo yanıtlayıcı)'} iletilir. Görüntü, iskelet noktaları ve cihaz bilgisi hiçbir zaman eklenmez. 3B organ modeli genel atlastır; sizin organlarınız değildir.`),
      h('div', { class: 'share-list' }, Object.entries(SHARE_CATEGORIES).map(([k, d]) => h('label', { class: 'share-item' },
        h('input', { type: 'checkbox', id: `share-${k}`, checked: Boolean(c.share?.[k]), onchange: (e) => { setChat({ share: { ...chat().share, [k]: e.target.checked } }); render(); document.getElementById('share-panel').open = true; } }),
        h('span', {}, h('strong', {}, d.tr), h('small', {}, d.desc))))),
      h('p', { class: 'small' }, h('strong', {}, 'Gönderilecek metin (önizleme):')),
      h('pre', { class: 'share-preview', id: 'share-preview' }, previewLines(ctx).join('\n')));
  }

  function historyControls(c) {
    return h('div', { class: 'chat-history' },
      h('label', { class: 'share-item' },
        h('input', { type: 'checkbox', id: 'chat-keep', checked: c.keepHistory !== false, onchange: (e) => { const cur = msgs(); if (e.target.checked) { setChat({ keepHistory: true, messages: cur }); mem = []; } else { mem = cur; setChat({ keepHistory: false, messages: [] }); } render(); } }),
        h('span', {}, h('strong', {}, 'Sohbet geçmişini bu cihazda sakla'), h('small', {}, store.persistent ? 'Kapalıyken geçmiş sayfa kapanınca silinir.' : 'Veri saklama izni vermediğiniz için geçmiş zaten yalnızca bu oturumdadır.'))),
      h('div', { class: 'actions' },
        h('button', { class: 'btn small', type: 'button', id: 'btn-chat-export', disabled: !msgs().length, onclick: exportChat }, 'Dışa aktar'),
        h('button', { class: 'btn small ghost', type: 'button', id: 'btn-chat-clear', disabled: !msgs().length, onclick: () => { if (confirm('Sohbet geçmişi silinsin mi?')) { mem = []; setChat({ messages: [] }); render(); } } }, 'Geçmişi sil')));
  }

  function exportChat() {
    const text = msgs().map((m) => `${m.role === 'user' ? 'Siz' : 'Asistan'}: ${m.content}`).join('\n\n');
    const a = h('a', { href: URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' })), download: 'icgor-sohbet.txt' });
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  async function send(text) {
    text = String(text ?? '').trim();
    if (!text || busy) return;
    if (text.length > MAX_CHARS) text = text.slice(0, MAX_CHARS);
    const c = chat();
    const ctx = buildContext(store.state, c.share);
    const shared = Object.entries(c.share ?? {}).filter(([, v]) => v).map(([k]) => k).filter((k) => ctx?.[k]);
    const messages = [...msgs(), { role: 'user', content: text }];
    setMsgs(messages);
    busy = true;
    render();
    const payload = { deviceId: store.deviceId(), messages: messages.slice(-MAX_SEND).map(({ role, content }) => ({ role, content })), context: ctx };
    dbg.sent.push(payload);
    let reply;
    try {
      reply = status?.provider === 'cihaz' ? await localReply(payload) : await remoteReply(payload);
    } catch (e) {
      reply = { reply: e.message || 'Yanıt alınamadı. Bağlantınızı kontrol edip tekrar deneyin.', provider: 'hata' };
    }
    busy = false;
    const msg = { role: 'assistant', content: reply.reply, provider: reply.provider, notice: reply.notice ?? null, shared };
    setMsgs([...msgs(), msg]);
    render();
    document.getElementById('chat-input')?.focus();
  }

  async function remoteReply(payload) {
    let r;
    try {
      r = await fetch('api/chat', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload), cache: 'no-store' });
    } catch {
      status = { provider: 'cihaz', demo: true, reason: 'Sunucuya ulaşılamadı.' };
      return { ...(await localReply(payload)), notice: 'Sunucuya ulaşılamadı; cihaz içi demo yanıt.' };
    }
    const body = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(body.error ?? `Sunucu hatası (${r.status}).`);
    return body;
  }

  /** Çevrimdışı: aynı güvenlik sınıflaması ve demo yanıtlayıcı, cihaz içinde (ağ isteği yok). */
  async function localReply(payload) {
    offline ??= await Promise.all([import('../../server/ai/safety.mjs'), import('../../server/ai/mock.mjs')]);
    const [{ classify }, { mockReply }] = offline;
    const last = payload.messages.at(-1).content;
    const s = classify(last);
    if (s.reply) return { reply: s.reply, provider: 'guvenlik' };
    return { reply: mockReply({ messages: payload.messages, context: payload.context, level: s.level }), provider: 'cihaz' };
  }

  async function activate() {
    if (!status) await loadStatus();
    render();
    const q = new URLSearchParams(location.hash.split('?')[1] ?? '').get('q');
    if (q) {
      history.replaceState(null, '', '#/asistan');
      await send(q.slice(0, MAX_CHARS));
    }
  }

  await loadStatus();
  return { activate }; // main.js ilk yüklemede de activate() çağırır
}
