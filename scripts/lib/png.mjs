// Minimal PNG çözücü ve piksel karşılaştırma (görsel regresyon için; bağımlılıksız).
import { inflateSync } from 'node:zlib';

/** Minimal PNG çözücü (8 bit RGB/RGBA, taramasız) → RGB baytları. */
export function decodePng(buf) {
  let p = 8, w, h, ct, idat = [];
  while (p < buf.length) {
    const len = buf.readUInt32BE(p), type = buf.toString('ascii', p + 4, p + 8), data = buf.subarray(p + 8, p + 8 + len);
    if (type === 'IHDR') { w = data.readUInt32BE(0); h = data.readUInt32BE(4); ct = data[9]; if (data[8] !== 8 || data[12]) throw new Error('desteklenmeyen PNG'); }
    if (type === 'IDAT') idat.push(data);
    p += 12 + len;
  }
  const bpp = ct === 6 ? 4 : 3, stride = w * bpp;
  const raw = inflateSync(Buffer.concat(idat));
  const px = Buffer.alloc(h * stride);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)], src = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? px[y * stride + x - bpp] : 0, b = y ? px[(y - 1) * stride + x] : 0, c = x >= bpp && y ? px[(y - 1) * stride + x - bpp] : 0;
      let v = src[x];
      if (f === 1) v += a; else if (f === 2) v += b; else if (f === 3) v += (a + b) >> 1;
      else if (f === 4) { const pp = a + b - c, pa = Math.abs(pp - a), pb = Math.abs(pp - b), pc = Math.abs(pp - c); v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c; }
      px[y * stride + x] = v & 255;
    }
  }
  const rgb = Buffer.alloc(w * h * 3);
  for (let i = 0, j = 0; i < w * h; i++, j += bpp) { rgb[i * 3] = px[j]; rgb[i * 3 + 1] = px[j + 1]; rgb[i * 3 + 2] = px[j + 2]; }
  return { w, h, rgb };
}


/**
 * İki PNG'yi karşılaştırır. Bir piksel, herhangi bir kanaldaki fark `threshold`'u aşarsa "farklı" sayılır.
 * @returns {{sameSize:boolean, diffRatio:number, meanAbs:number}}
 */
export function comparePng(a, b, threshold = 32) {
  const A = decodePng(a), B = decodePng(b);
  if (A.w !== B.w || A.h !== B.h) return { sameSize: false, diffRatio: 1, meanAbs: 255 };
  let diff = 0, sum = 0;
  for (let i = 0; i < A.w * A.h; i++) {
    let m = 0;
    for (let c = 0; c < 3; c++) {
      const d = Math.abs(A.rgb[i * 3 + c] - B.rgb[i * 3 + c]);
      sum += d;
      if (d > m) m = d;
    }
    if (m > threshold) diff++;
  }
  return { sameSize: true, diffRatio: diff / (A.w * A.h), meanAbs: sum / (A.w * A.h * 3) };
}
