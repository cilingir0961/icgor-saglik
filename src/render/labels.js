// Çakışmasız etiket yerleşimi (saf): etiketler gövdenin iki yanına sütun halinde dizilir,
// her biri organına ince bir çizgiyle bağlanır. Dikeyde en az `lineHeight` aralık korunur.

/**
 * @param {Array<{id:string, text:string, anchor:number[]}>} items anchor = organ merkezinin ekran konumu
 * @param {{width:number, height:number, lineHeight?:number, margin?:number, gap?:number,
 *          measure?:(text:string)=>number}} opts
 * @returns {Array<{id, text, anchor, x, y, align:'left'|'right'}>}
 *   align='right' → metin x'te biter (sol sütun); 'left' → metin x'te başlar (sağ sütun).
 */
export function layoutLabels(items, opts) {
  const { width, height, lineHeight = 18, margin = 6, gap = 14, measure = (t) => t.length * 7 } = opts;
  if (items.length === 0) return [];
  const xs = items.map((i) => i.anchor[0]);
  const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
  const spread = Math.max(...xs) - Math.min(...xs);
  const left = [], right = [];
  for (const it of items) (it.anchor[0] < cx ? left : right).push(it);

  const out = [];
  const place = (group, side) => {
    group.sort((a, b) => a.anchor[1] - b.anchor[1]);
    const ys = stackVertically(group.map((g) => g.anchor[1]), lineHeight, margin + lineHeight / 2, height - margin - lineHeight / 2);
    group.forEach((g, i) => {
      const w = measure(g.text);
      let x = side === 'left' ? cx - spread / 2 - gap : cx + spread / 2 + gap;
      // Ekran dışına taşmasın.
      x = side === 'left' ? Math.max(x, margin + w) : Math.min(x, width - margin - w);
      out.push({ id: g.id, text: g.text, anchor: g.anchor, x, y: ys[i], align: side === 'left' ? 'right' : 'left' });
    });
  };
  place(left, 'left');
  place(right, 'right');
  return out;
}

/** Sıralı y değerlerini, aralarında en az `step` kalacak ve [lo, hi] içinde olacak şekilde iter. */
export function stackVertically(ys, step, lo, hi) {
  const out = ys.map((y) => Math.min(Math.max(y, lo), hi));
  for (let i = 1; i < out.length; i++) out[i] = Math.max(out[i], out[i - 1] + step);
  // Alt sınırı aştıysa geriye doğru yukarı it.
  if (out.length && out[out.length - 1] > hi) {
    out[out.length - 1] = hi;
    for (let i = out.length - 2; i >= 0; i--) out[i] = Math.min(out[i], out[i + 1] - step);
  }
  return out;
}
