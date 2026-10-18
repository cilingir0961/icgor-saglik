import { layoutLabels } from './labels.js';

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

/** Organ adlarını gövdenin iki yanına, çakışmadan ve organa çizgiyle bağlı olarak yazar. */
export function paintLabels(ctx, organs, toScreen, visible, size) {
  ctx.font = '600 12px system-ui, sans-serif';
  ctx.textBaseline = 'middle';
  const items = organs
    .filter((o) => !visible || visible.has(o.id))
    .map((o) => ({ id: o.id, text: o.tr, anchor: toScreen(o.center) }));
  const placed = layoutLabels(items, { ...size, measure: (t) => ctx.measureText(t).width });
  for (const l of placed) {
    const textEdge = l.align === 'right' ? l.x + 4 : l.x - 4;
    ctx.strokeStyle = 'rgba(255,255,255,0.7)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(textEdge, l.y);
    ctx.lineTo(l.anchor[0], l.anchor[1]);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(l.anchor[0], l.anchor[1], 2.5, 0, Math.PI * 2);
    ctx.fillStyle = '#fff';
    ctx.fill();
    ctx.textAlign = l.align;
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(0,0,0,0.75)';
    ctx.strokeText(l.text, l.x, l.y);
    ctx.fillText(l.text, l.x, l.y);
  }
}
