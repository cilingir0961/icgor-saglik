// Gelişim takibi (saf). Sahte ilerlemeyi engeller:
//  1) Yalnızca KARŞILAŞTIRILABİLİR çekimler karşılaştırılır: aynı görünüş ve bakış yönü, aynı poz modeli,
//     benzer kamera uzaklığı (kadraj oranı), kamera düzlüğü durumu aynı, iki ölçüm de "ölçülemedi" değil.
//     (Sentetik kıyas: aynı nötr vücut sola/sağa bakarken baş-öne değeri 2 cm farklı okundu.)
//  2) Değişim ancak en küçük saptanabilir değişimi (MDC95 = 1,96 × √(u₁² + u₂²)) aşarsa "olası değişim" sayılır.
//  3) Yön (iyi/kötü) yorumu yapılmaz; yalnızca nötr referansa yaklaşma/uzaklaşma belirtilir.

export const WINDOWS = [30, 60, 90];
const DAY = 86400000;
export const CONDITION_TOLERANCE = { heightFrac: 0.12 }; // kadraj oranı farkı (göreli)

/** İki çekimin koşulları karşılaştırılabilir mi? Değilse nedenleri döner. */
export function comparable(a, b) {
  const why = [];
  if (a.view !== b.view) why.push('farklı görünüş');
  if (a.view === 'side' && a.facing !== b.facing) why.push('farklı bakış yönü (sol/sağ yan)');
  if (a.model !== b.model) why.push('farklı poz modeli');
  if (a.level !== b.level) why.push('kamera düzlüğü bir çekimde doğrulanmamış');
  if (Math.abs(a.heightFrac - b.heightFrac) / Math.max(a.heightFrac, b.heightFrac) > CONDITION_TOLERANCE.heightFrac) why.push('kamera uzaklığı farklı');
  return { ok: why.length === 0, why };
}

/** Tek gösterge için değişim değerlendirmesi. */
export function change(m1, m2) {
  if (m1?.value == null || m2?.value == null) return { status: 'yok', text: 'Bir taramada ölçülemedi.' };
  const delta = m2.value - m1.value;
  const mdc = 1.96 * Math.sqrt(m1.u ** 2 + m2.u ** 2);
  const res = { delta: +delta.toFixed(1), mdc: +mdc.toFixed(1) };
  const sp = m1.unit === '°' ? '' : ' ';
  if (Math.abs(delta) <= mdc) return { ...res, status: 'belirsiz', text: `Fark (${fmt(delta)}${sp}${m1.unit}) ölçüm belirsizliği içinde (±${fmt(mdc)}); değişim gösterilemiyor.` };
  let toward = '';
  if (m1.neutral !== null && m1.neutral !== undefined) {
    const closer = Math.abs(m2.value - m1.neutral) < Math.abs(m1.value - m1.neutral);
    toward = closer ? ' Nötr referansa yaklaşmış.' : ' Nötr referanstan uzaklaşmış.';
  }
  return { ...res, status: 'olasi', text: `Olası değişim: ${fmt(delta)}${sp}${m1.unit} (en küçük saptanabilir değişim ±${fmt(mdc)}).${toward}` };
}

const fmt = (x) => (x > 0 ? '+' : '') + x.toLocaleString('tr-TR', { maximumFractionDigits: 1 });

/**
 * Son taramayı 30/60/90 gün önceki (±%25 pencere) karşılaştırılabilir taramalarla eşleştirir.
 * @param {{date:string, captures:Record<string,{conditions, metrics}>}[]} scans eskiden yeniye
 */
export function windows(scans, now = scans.at(-1)) {
  const out = [];
  if (!now) return out;
  const t = new Date(now.date).getTime();
  for (const days of WINDOWS) {
    const target = t - days * DAY;
    const tol = days * 0.25 * DAY;
    const candidates = scans.filter((s) => s !== now && Math.abs(new Date(s.date).getTime() - target) <= tol);
    const base = candidates.sort((a, b) => Math.abs(new Date(a.date) - target) - Math.abs(new Date(b.date) - target))[0];
    out.push({ days, base: base ?? null });
  }
  return out;
}

/** İki tarama arasında görünüş bazında gösterge karşılaştırması. */
export function compareScans(older, newer) {
  const res = {};
  for (const [view, cap] of Object.entries(newer.captures ?? {})) {
    const old = older.captures?.[view];
    if (!old) { res[view] = { ok: false, why: ['önceki taramada bu görünüş yok'] }; continue; }
    const c = comparable(old.conditions, cap.conditions);
    if (!c.ok) { res[view] = { ok: false, why: c.why }; continue; }
    res[view] = { ok: true, metrics: Object.fromEntries(Object.keys(cap.metrics).map((k) => [k, { tr: cap.metrics[k].tr, ...change(old.metrics[k], cap.metrics[k]) }])) };
  }
  // Hareket testleri: aynı test, karşılaştırılabilir koşullar
  for (const [id, mv] of Object.entries(newer.movements ?? {})) {
    const key = `hareket:${id}`;
    const old = older.movements?.[id];
    if (!old) { res[key] = { ok: false, label: mv.tr, why: ['önceki taramada bu test yok'] }; continue; }
    const c = comparable(old.conditions, mv.conditions);
    if (!c.ok) { res[key] = { ok: false, label: mv.tr, why: c.why }; continue; }
    res[key] = { ok: true, label: mv.tr, metrics: Object.fromEntries(Object.keys(mv.metrics).map((k) => [k, { tr: mv.metrics[k].tr, ...change(old.metrics[k], mv.metrics[k]) }])) };
  }
  return res;
}
