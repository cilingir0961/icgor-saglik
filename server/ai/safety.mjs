// Mesaj güvenliği (saf). Acil ve kriz belirtilerinde model ÇAĞRILMAZ; sabit, güvenli yönlendirme döner.
// Teşhis/ilaç/takviye istekleri işaretlenir: modele ek uyarı verilir, demo sağlayıcı yönlendirme yanıtı üretir.
// Türkiye acil çağrı numarası: 112.

const norm = (s) => String(s ?? '').toLocaleLowerCase('tr').replace(/\s+/g, ' ');

const ACIL = [
  /göğ(üs|süm|sümde|süme)\w* (ağrı|sıkış|bask|yan)/, /göğ(üs|süm)\w* .{0,20}(ağrı|sıkış|bask)/,
  /nefes (alam|darlığı ani|alamıyorum)|nefesim (kesil|daral)/, /bayıl(dım|ıyorum|acak)/,
  /yüzüm(ün)? (bir taraf|kay|uyuş)|konuşam(ıyorum|ıyor)|kolum(u)? kaldıram/, /(ani|şiddetli|çok kötü) baş ağrı/,
  /kan (kus|tükür)/, /bilincim|kalp krizi|inme geçir/,
];
const KRIZ = [/intihar/, /kendimi (öldür|asmak|yok etmek)/, /kendime zarar/, /yaşamak istemiyorum/, /ölmek istiyorum/];
const TANI = [/teşhis koy/, /(hangi|ne) hastalı/, /fıtı(k|ğ)/, /skolyoz/, /kanser/, /tümör/, /disk kayma/, /kireçlenme mi/, /tanı koy/];
const ILAC = [/ilaç/, /doz/, /antibiyotik/, /ağrı kesici/, /takviye/, /vitamin (al|kullan)/, /protein tozu/, /steroid/, /zayıflama hapı/];

/** @returns {{level:'acil'|'kriz'|'tani'|'ilac'|'normal', reply:string|null}} */
export function classify(text) {
  const t = norm(text);
  if (KRIZ.some((r) => r.test(t))) {
    return { level: 'kriz', reply: 'Bunu paylaştığınız için teşekkür ederim; şu an zor bir durumda olduğunuzu duyduğuma üzüldüm. Kendinize zarar verme düşünceleriniz varsa lütfen hemen 112\'yi arayın veya en yakın acil servise gidin. Güvendiğiniz biriyle şimdi konuşmanız da çok önemli. Yalnız değilsiniz ve yardım almak mümkün.' };
  }
  if (ACIL.some((r) => r.test(t))) {
    return { level: 'acil', reply: 'Anlattığınız belirtiler acil bir durumun işareti olabilir. Lütfen egzersizi veya etkinliği hemen bırakın ve 112\'yi arayın ya da en yakın acil servise başvurun. İçGör bu durumda değerlendirme yapamaz.' };
  }
  if (TANI.some((r) => r.test(t))) return { level: 'tani', reply: null };
  if (ILAC.some((r) => r.test(t))) return { level: 'ilac', reply: null };
  return { level: 'normal', reply: null };
}

/** Kullanıcı metnini temizler: denetim karakterleri, aşırı uzunluk. */
export function sanitize(text, max) {
  return String(text ?? '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').slice(0, max).trim();
}

/** Yanıt ekleri: teşhis/ilaç konularında her durumda eklenecek yönlendirme. */
export const REFERRAL = {
  tani: 'Kamera ve İçGör ölçümleri hastalık teşhisi koyamaz; fıtık, skolyoz, disk sorunu gibi durumlar ancak muayene ve uygun tıbbi görüntülemeyle değerlendirilebilir. Lütfen bir hekime başvurun.',
  ilac: 'İlaç, doz ve takviye konusunda öneride bulunamam; bu kararlar hekiminize veya eczacınıza aittir.',
};
