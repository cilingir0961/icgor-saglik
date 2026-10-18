// Kişisel veri deposu: YALNIZCA bu cihazda (localStorage). Görüntü ve video ASLA saklanmaz; yalnızca sayısal
// ölçüm sonuçları, profil (boy/kilo/yaş) ve ayarlar. Saklama açık rızaya bağlıdır; rıza yoksa veriler yalnızca
// oturum belleğinde tutulur ve sayfa kapanınca silinir. Dışa aktarma (JSON) ve tümünü silme her zaman açıktır.

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

const empty = () => ({ consent: null, profile: null, scans: [], settings: { voice: true, mode: 'helper' } });

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
      const n = (x, lo, hi) => (Number.isFinite(+x) && +x >= lo && +x <= hi ? +x : null);
      state.profile = { heightCm: n(p.heightCm, 100, 230), weightKg: n(p.weightKg, 25, 300), age: n(p.age, 10, 110) };
      persist();
      return state.profile;
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
