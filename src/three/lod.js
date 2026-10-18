// Cihaza göre model ayrıntı düzeyi seçimi (saf).
// Düşük (low) ≈ 113 bin üçgen / 0,8 MB; yüksek (high) ≈ 338 bin üçgen / 2,2 MB.

/**
 * @param {{override?:string|null, isMobile?:boolean, deviceMemory?:number, cores?:number, saveData?:boolean}} env
 * @returns {'high'|'low'}
 */
export function chooseLod(env = {}) {
  if (env.override === 'high' || env.override === 'low') return env.override;
  if (env.saveData) return 'low';
  if (env.isMobile) return 'low';
  if (env.deviceMemory !== undefined && env.deviceMemory <= 4) return 'low';
  if (env.cores !== undefined && env.cores <= 4) return 'low';
  return 'high';
}

/** Tarayıcı ortamından girdi toplar (testlerde kullanılmaz). */
export function browserLodEnv(location, navigator) {
  const q = new URLSearchParams(location.search).get('lod');
  let stored = null;
  try { stored = localStorage.getItem('icgor.lod'); } catch { /* özel mod */ }
  const override = q ?? (stored && stored !== 'auto' ? stored : null);
  return {
    override,
    isMobile: navigator.userAgentData?.mobile ?? /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent),
    deviceMemory: navigator.deviceMemory,
    cores: navigator.hardwareConcurrency,
    saveData: navigator.connection?.saveData,
  };
}

/** Piksel oranı üst sınırı: mobilde GPU dolgu maliyetini sınırlar. */
export const pixelRatioFor = (lod, dpr) => Math.min(dpr || 1, lod === 'low' ? 1.5 : 2);
