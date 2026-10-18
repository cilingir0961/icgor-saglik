// Ortak bilgilendirme ve onay formu (yeni ekranlar için; tarama ekranı kendi eşdeğer formunu kullanır).
import { h } from '../scan/dom.js';

export function consentForm(store, onDone, { intro } = {}) {
  const chk = (id, text) => h('label', { class: 'check' }, h('input', { type: 'checkbox', id }), h('span', {}, text));
  return h('div', { class: 'scan-form', id: 'app-consent' },
    h('h2', {}, 'Bilgilendirme ve onay'),
    h('p', { class: 'notice' }, intro ?? 'İçGör eğitim amaçlıdır: tanı koymaz, tedavi önermez. Egzersiz önerileri geneldir; sağlık sorununuz varsa önce hekiminize danışın.'),
    chk('ac-understand', 'İçGör\'ün eğitim amaçlı olduğunu ve tıbbi değerlendirme yerine geçmediğini anladım.'),
    chk('ac-store', 'Profilimin, antrenman ve aktivite kayıtlarımın bu cihazda saklanmasına izin veriyorum. (İsteğe bağlı; istediğim zaman silebilirim.)'),
    h('p', { class: 'sub' }, 'Verileriniz bu cihazda kalır. Yapay zekâ asistanıyla neyin paylaşılacağını ayrıca siz seçersiniz.'),
    h('p', { class: 'warnline', id: 'ac-err', hidden: true }, 'Devam etmek için ilk maddeyi onaylayın.'),
    h('div', { class: 'actions' }, h('button', { class: 'btn primary', id: 'btn-app-consent', onclick: () => {
      if (!document.getElementById('ac-understand').checked) { document.getElementById('ac-err').hidden = false; return; }
      store.setConsent({ store: document.getElementById('ac-store').checked });
      onDone();
    } }, 'Onaylıyorum')));
}
