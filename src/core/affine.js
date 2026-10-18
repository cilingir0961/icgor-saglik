// Boyuttan bağımsız afin en küçük kareler uydurma (saf).
// Kullanım alanları:
//   - 3B: iki farklı anatomik modeli ortak işaret noktalarıyla hizalama (akciğer kaydı)
//   - 2B: kamera görüntüsündeki vücut noktalarına 3B modeli oturtma (AR)

/**
 * src[i] (d boyutlu) → dst[i] (d boyutlu) için min Σ|A·[p;1] − q|² çözer.
 * @returns {{matrix:number[][], rms:number, residuals:number[]}} matrix: d × (d+1)
 */
export function fitAffine(src, dst) {
  const n = src.length;
  if (n === 0 || n !== dst.length) throw new Error('nokta sayıları uyuşmuyor');
  const d = src[0].length;
  if (n < d + 1) throw new Error(`${d}B afin için en az ${d + 1} nokta gerekir`);
  // Normal denklemler: (XᵀX) a_k = Xᵀ y_k, X satırları [p, 1]
  const m = d + 1;
  const XtX = Array.from({ length: m }, () => new Array(m).fill(0));
  const XtY = Array.from({ length: d }, () => new Array(m).fill(0));
  for (let i = 0; i < n; i++) {
    const x = [...src[i], 1];
    for (let a = 0; a < m; a++) {
      for (let b = 0; b < m; b++) XtX[a][b] += x[a] * x[b];
      for (let k = 0; k < d; k++) XtY[k][a] += x[a] * dst[i][k];
    }
  }
  const matrix = XtY.map((rhs) => solve(XtX, rhs));
  const residuals = src.map((p, i) => Math.hypot(...applyAffine(matrix, p).map((v, k) => v - dst[i][k])));
  const rms = Math.sqrt(residuals.reduce((s, r) => s + r * r, 0) / n);
  return { matrix, rms, residuals };
}

export function applyAffine(matrix, p) {
  return matrix.map((row) => row.reduce((s, c, j) => s + c * (j < p.length ? p[j] : 1), 0));
}

/** Doğrusal kısmın determinantı (2B/3B). Negatifse dönüşüm aynalama içerir. */
export function linearDeterminant(matrix) {
  const a = matrix;
  if (a.length === 2) return a[0][0] * a[1][1] - a[0][1] * a[1][0];
  if (a.length === 3) {
    return a[0][0] * (a[1][1] * a[2][2] - a[1][2] * a[2][1])
      - a[0][1] * (a[1][0] * a[2][2] - a[1][2] * a[2][0])
      + a[0][2] * (a[1][0] * a[2][1] - a[1][1] * a[2][0]);
  }
  throw new Error('yalnızca 2B/3B');
}

/** Kısmi pivotlamalı Gauss eliminasyonu. */
export function solve(A, b) {
  const n = b.length;
  const M = A.map((row, i) => [...row, b[i]]);
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    if (Math.abs(M[p][c]) < 1e-12) throw new Error('tekil sistem (noktalar doğrusal/düzlemsel olabilir)');
    [M[c], M[p]] = [M[p], M[c]];
    for (let r = c + 1; r < n; r++) {
      const f = M[r][c] / M[c][c];
      for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k];
    }
  }
  const x = new Array(n).fill(0);
  for (let r = n - 1; r >= 0; r--) {
    let s = M[r][n];
    for (let k = r + 1; k < n; k++) s -= M[r][k] * x[k];
    x[r] = s / M[r][r];
  }
  return x;
}
