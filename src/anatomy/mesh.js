// Elipsoit ağı (mesh) üretimi: enlem/boylam (UV) küre, yarıçaplarla ölçeklenir.
// Üçgenler dışa bakan yönde (saat yönünün tersi, dış normalle uyumlu) sıralanır.

export function ellipsoidMesh(center, radii, latSegments = 12, lonSegments = 18) {
  const vertices = [];
  for (let i = 0; i <= latSegments; i++) {
    const theta = (i / latSegments) * Math.PI; // 0 = üst kutup (-y), PI = alt kutup
    for (let j = 0; j < lonSegments; j++) {
      const phi = (j / lonSegments) * 2 * Math.PI;
      const ux = Math.sin(theta) * Math.cos(phi);
      const uy = -Math.cos(theta);
      const uz = Math.sin(theta) * Math.sin(phi);
      vertices.push([
        center[0] + radii[0] * ux,
        center[1] + radii[1] * uy,
        center[2] + radii[2] * uz,
      ]);
    }
  }
  const idx = (i, j) => i * lonSegments + (j % lonSegments);
  const triangles = [];
  for (let i = 0; i < latSegments; i++) {
    for (let j = 0; j < lonSegments; j++) {
      const a = idx(i, j), b = idx(i, j + 1), c = idx(i + 1, j), d = idx(i + 1, j + 1);
      if (i !== 0) triangles.push([a, b, c]); // kutupta dejenere üçgeni atla
      if (i !== latSegments - 1) triangles.push([b, d, c]);
    }
  }
  return { vertices, triangles };
}
