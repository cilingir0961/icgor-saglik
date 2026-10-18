// Kişisel veri deposu (tüm uygulama tek örnek: getStore()). YALNIZCA bu cihazda (localStorage). Görüntü ve
// video ASLA saklanmaz; yalnızca sayısal sonuçlar, profil, antrenman/aktivite kayıtları, bildirim ayarları ve
// (isteğe bağlı) sohbet geçmişi. Saklama açık rızaya bağlıdır; rıza yoksa veriler yalnızca oturum belleğinde
// tutulur ve sayfa kapanınca silinir. Dışa aktarma (JSON) ve tümünü silme her zaman açıktır.

export const STORE_KEY = 'icgor.kisisel.v1';
export const CONSENT_VERSION = 1;

function safeStorage() {
  try {
    const s = globalThis.localStorage;
    const k = '__icgor_test__';
    s.setItem(k, '1'); s.removeItem(k);
    return s;
  } catch { return null; }
}

const empty = () => ({
  consent: null, profile: null, scans: [], settings: { voice: true, mode: 'helper' },
  trainer: { plan: null, progress: {}, history: [], paused: false },
  activity: { goalMode: 'auto', goal: null, days: {}, habits: {} },
  notify: null,
  chat: { messages: [], share: {}, keepHistory: true },
  deviceId: null,
});
/** Profil alanları: sayısal olanlar aralık denetiminden geçer, diğerleri olduğu gibi saklanır. */
const NUMERIC = { heightCm: [100, 230], weightKg: [25, 300], age: [10, 110], daysPerWeek: [1, 6], minutesPerDay: [5, 120] };

export function createStore(storage = safeStorage()) {
  let state = empty();
  try {
    const raw = storage?.getItem(STORE_KEY);
    if (raw) state = { ...empty(), ...JSON.parse(raw) };
  } catch { /* bozuk kayıt: yok say */ }
  const listeners = new Set();

  const persist = () => {
    if (state.consent?.store && storage) {
      try { storage.setItem(STORE_KEY, JSON.stringify(state)); } catch { /* kota/özel mod */ }
    }
    for (const fn of listeners) fn(state);
  };

  return {
    get state() { return state; },
    get persistent() { return Boolean(state.consent?.store && storage); },
    onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    /** @param {{store:boolean}} c store: ölçümleri bu cihazda saklamaya izin */
    setConsent(c) {
      state.consent = { version: CONSENT_VERSION, date: new Date().toISOString(), understood: true, store: Boolean(c.store) };
      if (!c.store) storage?.removeItem(STORE_KEY);
      persist();
    },
    withdrawConsent() { this.clearAll(); },
    setProfile(p) {
      const n = (x, lo, hi) => (x !== '' && x != null && Number.isFinite(+x) && +x >= lo && +x <= hi ? +x : null);
      const next = { ...(state.profile ?? {}) };
      for (const [k, v] of Object.entries(p)) next[k] = NUMERIC[k] ? n(v, ...NUMERIC[k]) : v;
      state.profile = next;
      persist();
      return state.profile;
    },
    /** Bir bölümü kısmen günceller (trainer, activity, notify, chat …). */
    update(section, patch) {
      state[section] = typeof patch === 'function' ? patch(state[section]) : { ...(state[section] ?? {}), ...patch };
      persist();
      return state[section];
    },
    /** Kalıcı olmayan rastgele cihaz kimliği (yalnızca AI hız sınırı/kota için; kişisel bilgi içermez). */
    deviceId() {
      if (!state.deviceId) { state.deviceId = (globalThis.crypto?.randomUUID?.() ?? `c${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`).replace(/[^a-z0-9-]/gi, ''); persist(); }
      return state.deviceId;
    },
    setSettings(s) { state.settings = { ...state.settings, ...s }; persist(); },
    addScan(scan) { state.scans.push(scan); state.scans.sort((a, b) => a.date.localeCompare(b.date)); persist(); return scan; },
    deleteScan(id) { state.scans = state.scans.filter((s) => s.id !== id); persist(); },
    /** Tüm kişisel verileri siler (rıza dahil). */
    clearAll() {
      state = empty();
      try { storage?.removeItem(STORE_KEY); } catch { /* yok */ }
      for (const fn of listeners) fn(state);
    },
    exportJSON() {
      return JSON.stringify({
        app: 'İçGör', exported: new Date().toISOString(),
        note: 'Yalnızca sayısal ölçümler; görüntü içermez. Eğitim amaçlıdır, tanı değildir.',
        ...state,
      }, null, 2);
    },
  };
}

let shared = null;
/** Uygulama genelinde tek depo örneği (ekranlar arası tutarlılık). */
export function getStore() {
  shared ??= createStore();
  return shared;
}
