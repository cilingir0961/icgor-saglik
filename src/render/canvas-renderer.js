// Canvas 2D çizici: çizim listesini (scene.js) düz gölgeli üçgenler olarak boyar.
// İlk prototip için bilinçli olarak WebGL/Three.js yerine Canvas 2D seçildi: bağımlılık yok,
// her tarayıcıda çalışır; ~2–3 bin üçgen için telefonlarda yeterince hızlı.

const hexToRgb = (hex) => {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const rgbCache = new Map();
const rgbOf = (hex) => {
  if (!rgbCache.has(hex)) rgbCache.set(hex, hexToRgb(hex));
  return rgbCache.get(hex);
};

export function paintDrawList(ctx, list) {
  for (const t of list) {
    const [r, g, b] = rgbOf(t.color);
    const s = t.shade;
    ctx.fillStyle = `rgba(${(r * s) | 0},${(g * s) | 0},${(b * s) | 0},${t.alpha})`;
    ctx.beginPath();
    ctx.moveTo(t.points[0][0], t.points[0][1]);
    ctx.lineTo(t.points[1][0], t.points[1][1]);
    ctx.lineTo(t.points[2][0], t.points[2][1]);
    ctx.closePath();
    ctx.fill();
    // Komşu üçgenler arasındaki ince boşlukları (anti-alias dikişleri) kapat.
    ctx.strokeStyle = ctx.fillStyle;
    ctx.lineWidth = 0.6;
    ctx.stroke();
  }
}

/** Organ adlarını, organ merkezinin ekran konumuna yazar. */
export function paintLabels(ctx, organs, toScreen, visible) {
  ctx.font = '600 12px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (const o of organs) {
    if (visible && !visible.has(o.id)) continue;
    const [x, y] = toScreen(o.center);
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(0,0,0,0.65)';
    ctx.strokeText(o.tr, x, y);
    ctx.fillStyle = '#fff';
    ctx.fillText(o.tr, x, y);
  }
}
