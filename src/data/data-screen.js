// Verilerim (#/verilerim): bu cihazda ne saklandığı, AI paylaşımı, dışa aktarma ve bölüm bölüm silme.
// Tüm kişisel veriler yalnızca bu cihazdadır; sunucuya yalnızca sohbet mesajı ve SEÇİLEN özet gider.

import { getStore } from '../scan/store.js';
import { h, icon } from '../scan/dom.js';
import { consentForm } from '../ui/consent.js';
import { SHARE_CATEGORIES } from '../assistant/context.js';
import { pageHead } from '../ui/visuals.js';

export async function createDataScreen() {
  const store = getStore();
  const page = document.getElementById('data-page');

  function render() {
    const st = store.state;
    const share = Object.entries(st.chat?.share ?? {}).filter(([, v]) => v).map(([k]) => SHARE_CATEGORIES[k]?.tr ?? k);
    const del = (label, fn, id) => h('button', { class: 'btn small ghost', id, onclick: () => { if (confirm(`${label} bu cihazdan silinsin mi?`)) { fn(); render(); } } }, label);
    page.replaceChildren(h('div', { class: 'studio-page' },
      pageHead('Gizlilik', 'Verilerim', 'Her şey bu cihazda; neyin saklandığını görür, dışa aktarır veya silersin.'),
      h('section', { class: 'tile' },
        h('h3', {}, icon('i-lock'), 'Bu cihazda saklananlar'),
        h('ul', { class: 'plain small', id: 'data-summary' },
          h('li', {}, store.persistent ? 'Saklama izni verildi: veriler bu tarayıcının deposunda.' : 'Saklama izni yok: veriler yalnızca bu oturumda, sayfa kapanınca silinir.'),
          h('li', {}, `Profil: ${st.profile ? 'var' : 'yok'} · Taramalar: ${st.scans.length} (yalnızca sayılar, görüntü yok)`),
          h('li', {}, `Antrenman geçmişi: ${st.trainer?.history?.length ?? 0} oturum · Kamera koçu kaydı: ${st.trainer?.coachLog?.length ?? 0}`),
          h('li', {}, `Adım kaydı: ${Object.keys(st.activity?.days ?? {}).length} gün${Object.values(st.activity?.days ?? {}).some((d) => d.source === 'demo') ? ' (demo veri içerir)' : ''}`),
          h('li', {}, `Sohbet geçmişi: ${st.chat?.messages?.length ?? 0} mesaj${st.chat?.keepHistory === false ? ' (saklama kapalı)' : ''}`),
          h('li', {}, `Hatırlatmalar: ${st.notify?.enabled ? 'açık' : 'kapalı'}`)),
        !st.consent ? consentForm(store, render) : null),
      h('section', { class: 'tile', id: 'data-ai' },
        h('h3', {}, icon('i-chat'), 'Yapay zekâ paylaşımı'),
        h('p', { class: 'small' }, share.length ? `Asistana mesajla birlikte gönderilen özetler: ${share.join(', ')}.` : 'Asistana kişisel özet gönderilmiyor; yalnızca yazdığınız mesaj gider.'),
        h('p', { class: 'muted small' }, 'Kamera görüntüsü, iskelet noktaları, adınız veya konumunuz hiçbir zaman gönderilmez. Gerçek yapay zekâ etkinse metin OpenAI\'ye “saklama” kapalı (store:false) istenerek iletilir; demo modda sunucudan dışarı çıkmaz.'),
        h('div', { class: 'actions' },
          h('button', { class: 'btn small', id: 'btn-ai-share-off', disabled: !share.length, onclick: () => { store.update('chat', { share: {} }); render(); } }, 'Tüm AI paylaşımını kapat'),
          del('Sohbet geçmişi', () => store.update('chat', { messages: [] }), 'btn-del-chat'))),
      h('section', { class: 'tile' },
        h('h3', {}, 'Bölüm bölüm sil'),
        h('div', { class: 'actions' },
          del('Antrenman planı ve geçmişi', () => store.update('trainer', () => ({ plan: null, progress: {}, history: [], paused: false, coachLog: [] })), 'btn-del-trainer'),
          del('Adım ve alışkanlık kayıtları', () => store.update('activity', () => ({ goalMode: 'auto', goal: null, days: {}, habits: {} })), 'btn-del-activity'),
          del('Taramalar', () => store.update('scans', () => []), 'btn-del-scans'))),
      h('section', { class: 'tile' },
        h('h3', {}, 'Dışa aktar / tümünü sil'),
        h('div', { class: 'actions' },
          h('button', { class: 'btn', id: 'btn-all-export', onclick: () => download('icgor-verilerim.json', store.exportJSON()) }, 'Tüm verileri dışa aktar (JSON)'),
          h('button', { class: 'btn danger', id: 'btn-all-delete', onclick: () => { if (confirm('Tüm verileriniz (rıza dahil) bu cihazdan kalıcı olarak silinsin mi?')) { store.clearAll(); render(); } } }, 'Tüm verilerimi sil'))),
      h('p', { class: 'muted small' }, 'KVKK: sağlık verisi özel nitelikli kişisel veridir. İçGör bu verileri yalnızca cihazınızda, açık rızanızla tutar; rızayı “Tüm verilerimi sil” ile geri alabilirsiniz. Ayrıntı: docs/AI.md (KVKK değerlendirmesi).')));
  }

  function download(name, text) {
    const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
    const a = h('a', { href: url, download: name });
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return { activate: render };
}
