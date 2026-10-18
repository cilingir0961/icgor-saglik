// Ön plan adım sayacı (saf, DENEYSEL). Girdi: ivmeölçer örnekleri (m/s², yerçekimi dahil). Yöntem: büyüklük →
// hareketli ortalama ile yerçekimi çıkarılır → yumuşatılır → uyarlanır eşikli tepe bulma; iki adım arası
// 0,25–2 s. Yalnızca art arda en az 4 adımlık yürüyüş dizileri sayılır (el sallama, tek sarsıntı sayılmaz).
// Doğruluk: test/activity.test.js sentetik sinyallerle ölçer; gerçek yürüyüşte doğrulanmadı.

export function createPedometer({ minInterval = 0.25, maxInterval = 2, minRun = 4, minPeak = 0.6 } = {}) {
  let mean = null, smooth = 0, prev = 0, prev2 = 0, lastPeakT = null, run = [], steps = 0, amp = 1.5;
  return {
    /** @param {number} t saniye @param {[number,number,number]} a ivme */
    push(t, [x, y, z]) {
      const m = Math.hypot(x, y, z);
      mean = mean == null ? m : mean + 0.02 * (m - mean); // ~1 s zaman sabiti (50 Hz)
      const d = m - mean;
      smooth = smooth + 0.35 * (d - smooth);
      // tepe: bir önceki örnek komşularından büyük ve eşik üstünde
      if (prev > prev2 && prev >= smooth && prev > Math.max(minPeak, amp * 0.45)) {
        const gap = lastPeakT == null ? null : t - lastPeakT;
        if (gap == null || gap >= minInterval) {
          amp = amp + 0.2 * (prev - amp);
          if (gap != null && gap > maxInterval) run = [];
          run.push(t);
          lastPeakT = t;
          if (run.length === minRun) steps += minRun; // dizi yürüyüş olarak kabul edildi
          else if (run.length > minRun) steps += 1;
        }
      }
      if (lastPeakT != null && t - lastPeakT > maxInterval) run = [];
      prev2 = prev; prev = smooth;
      return steps;
    },
    get steps() { return steps; },
  };
}
