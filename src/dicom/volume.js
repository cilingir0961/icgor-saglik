// Kesitlerden 3B hacim kurma ve görüntüleme işlemleri (saf, DOM'suz).
//
// Koordinatlar DICOM hasta sistemi LPS'tir: +x hastanın solu, +y arka, +z baş yönü.
// Hacim indeksleri: i = sütun (satır yönü boyunca), j = satır, k = kesit (normal boyunca artan).

import { cross, dot } from '../core/vec3.js';

/** Ayrıştırılmış görüntüleri seri UID'sine göre gruplar; en çok kesitli seri önce. */
export function groupSeries(images) {
  const map = new Map();
  for (const im of images) {
    const key = im.seriesUID ?? 'bilinmeyen';
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(im);
  }
  return [...map.values()].sort((a, b) => b.length - a.length);
}

/**
 * Tek bir serinin kesitlerinden hacim kurar.
 * @returns {{nx,ny,nz, spacing:number[], data:Float32Array, rowDir, colDir, normal, modality, warnings:string[], window?:number[]}}
 */
export function buildVolume(slices) {
  if (slices.length === 0) throw new Error('boş seri');
  const warnings = [];
  const first = slices[0];
  const { rows, columns } = first;
  const mismatched = slices.filter((s) => s.rows !== rows || s.columns !== columns);
  if (mismatched.length) {
    warnings.push(`${mismatched.length} kesit farklı boyutta olduğu için atlandı.`);
    slices = slices.filter((s) => !mismatched.includes(s));
  }

  const orient = first.orientation?.length === 6 ? first.orientation : [1, 0, 0, 0, 1, 0];
  if (!first.orientation) warnings.push('Kesit yönü bilgisi yok; aksiyel varsayıldı.');
  const rowDir = orient.slice(0, 3); // görüntü satırı boyunca (sütun indeksi i artarken)
  const colDir = orient.slice(3, 6); // görüntü sütunu boyunca (satır indeksi j artarken)
  const normal = cross(rowDir, colDir);

  const hasPos = slices.every((s) => s.position?.length === 3);
  const keyed = slices.map((s, idx) => ({
    s,
    key: hasPos ? dot(s.position, normal) : (s.instanceNumber ?? idx),
  }));
  keyed.sort((a, b) => a.key - b.key);
  if (!hasPos) warnings.push('Kesit konumları yok; sıralama kesit numarasına göre yapıldı, aralık tahminidir.');

  // Aynı konumda yinelenen kesitleri at.
  const uniq = keyed.filter((k, i) => i === 0 || Math.abs(k.key - keyed[i - 1].key) > 1e-4);
  if (uniq.length < keyed.length) warnings.push(`${keyed.length - uniq.length} yinelenen kesit atlandı.`);

  let sz = first.sliceThickness || 1;
  if (hasPos && uniq.length > 1) {
    const gaps = uniq.slice(1).map((k, i) => k.key - uniq[i].key);
    sz = median(gaps);
    const irregular = gaps.some((g) => Math.abs(g - sz) > 0.1 * sz);
    if (irregular) warnings.push('Kesit aralıkları düzensiz; koronal/sajital görüntülerde bozulma olabilir.');
  }
  const [sy, sx] = first.pixelSpacing ?? [1, 1];
  if (!first.pixelSpacing) warnings.push('Piksel aralığı bilgisi yok; 1 mm varsayıldı.');

  const nx = columns, ny = rows, nz = uniq.length;
  const data = new Float32Array(nx * ny * nz);
  uniq.forEach((k, z) => data.set(k.s.pixels, z * nx * ny));

  return {
    nx, ny, nz,
    spacing: [sx, sy, sz],
    data,
    rowDir, colDir, normal,
    modality: first.modality ?? '',
    description: first.seriesDescription ?? '',
    window: first.windowCenter != null && first.windowWidth ? [first.windowCenter, first.windowWidth] : undefined,
    warnings,
  };
}

const median = (a) => {
  const s = [...a].sort((x, y) => x - y);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

/**
 * Bir düzlemi 2B görüntü olarak çıkarır. Ekran yönü radyolojik gelenektir:
 * aksiyelde hastanın sağı ekranın solunda; koronal/sajitalde baş yukarıda (standart aksiyel çekimde).
 * @param {'axial'|'coronal'|'sagittal'} plane
 * @returns {{width, height, data:Float32Array, pixelW:number, pixelH:number, right:number[], down:number[]}}
 *   right/down: ekranın sağına/aşağısına karşılık gelen hasta yönü (LPS birim vektör).
 */
export function extractPlane(vol, plane, index) {
  const { nx, ny, nz, data } = vol;
  const [sx, sy, sz] = vol.spacing;
  const neg = (v) => v.map((c) => -c);
  if (plane === 'axial') {
    const k = clampIdx(index, nz);
    return { width: nx, height: ny, data: data.subarray(k * nx * ny, (k + 1) * nx * ny), pixelW: sx, pixelH: sy, right: vol.rowDir, down: vol.colDir };
  }
  if (plane === 'coronal') {
    const j = clampIdx(index, ny);
    const out = new Float32Array(nx * nz);
    for (let r = 0; r < nz; r++) {
      const k = nz - 1 - r; // üstte en büyük k (standart aksiyelde baş tarafı)
      const src = k * nx * ny + j * nx;
      out.set(data.subarray(src, src + nx), r * nx);
    }
    return { width: nx, height: nz, data: out, pixelW: sx, pixelH: sz, right: vol.rowDir, down: neg(vol.normal) };
  }
  if (plane === 'sagittal') {
    const i = clampIdx(index, nx);
    const out = new Float32Array(ny * nz);
    for (let r = 0; r < nz; r++) {
      const k = nz - 1 - r;
      for (let j = 0; j < ny; j++) out[r * ny + j] = data[k * nx * ny + j * nx + i];
    }
    return { width: ny, height: nz, data: out, pixelW: sy, pixelH: sz, right: vol.colDir, down: neg(vol.normal) };
  }
  throw new Error(`bilinmeyen düzlem: ${plane}`);
}

export const planeLength = (vol, plane) => ({ axial: vol.nz, coronal: vol.ny, sagittal: vol.nx })[plane];
const clampIdx = (i, n) => Math.max(0, Math.min(n - 1, Math.round(i)));

/** Ön-arka (j ekseni) boyunca maksimum yoğunluk izdüşümü (MIP); koronal düzende döner. */
export function mipCoronal(vol) {
  const { nx, ny, nz, data } = vol;
  const out = new Float32Array(nx * nz).fill(-Infinity);
  for (let k = 0; k < nz; k++) {
    const r = nz - 1 - k;
    for (let j = 0; j < ny; j++) {
      const base = k * nx * ny + j * nx;
      for (let i = 0; i < nx; i++) {
        const v = data[base + i];
        if (v > out[r * nx + i]) out[r * nx + i] = v;
      }
    }
  }
  return { width: nx, height: nz, data: out, pixelW: vol.spacing[0], pixelH: vol.spacing[2], right: vol.rowDir, down: vol.normal.map((c) => -c) };
}

/** Pencere/seviye: değerleri 0–255 griye eşler, RGBA döndürür. */
export function applyWindow(values, center, width, out = new Uint8ClampedArray(values.length * 4)) {
  const lo = center - width / 2;
  const scale = 255 / Math.max(width, 1e-6);
  for (let i = 0, o = 0; i < values.length; i++, o += 4) {
    const g = (values[i] - lo) * scale; // Uint8ClampedArray 0–255'e kırpar
    out[o] = out[o + 1] = out[o + 2] = g;
    out[o + 3] = 255;
  }
  return out;
}

export const WINDOW_PRESETS = {
  'yumusak-doku': { label: 'Yumuşak doku', center: 40, width: 400 },
  akciger: { label: 'Akciğer', center: -600, width: 1500 },
  kemik: { label: 'Kemik', center: 400, width: 1800 },
  beyin: { label: 'Beyin', center: 40, width: 80 },
};

/** Örneklenmiş %1–%99 yüzdeliklerinden otomatik pencere (MR gibi birimsiz veriler için). */
export function autoWindow(data, samples = 20000) {
  const step = Math.max(1, Math.floor(data.length / samples));
  const s = [];
  for (let i = 0; i < data.length; i += step) if (Number.isFinite(data[i])) s.push(data[i]);
  s.sort((a, b) => a - b);
  const lo = s[Math.floor(s.length * 0.01)] ?? 0, hi = s[Math.floor(s.length * 0.99)] ?? 1;
  return { center: (lo + hi) / 2, width: Math.max(hi - lo, 1) };
}

/** LPS yön vektörünün baskın bileşenine göre radyolojik yön harfi (R/L, A/P, S/I). */
export function orientationLetter(v) {
  const ax = [Math.abs(v[0]), Math.abs(v[1]), Math.abs(v[2])];
  const m = ax.indexOf(Math.max(...ax));
  return [['R', 'L'], ['A', 'P'], ['I', 'S']][m][v[m] > 0 ? 1 : 0];
}

export const ORIENTATION_TR = { R: 'Sağ', L: 'Sol', A: 'Ön', P: 'Arka', S: 'Üst', I: 'Alt' };
