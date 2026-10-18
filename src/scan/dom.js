// Küçük DOM yardımcısı (CSP uyumlu: satır içi stil/olay özniteliği yok; metin her zaman textContent ile).

/** h('div', {class:'x', onclick: fn, 'aria-label': '…'}, 'metin', çocukEleman, …) */
export function h(tag, attrs = {}, ...children) {
  const el = document.createElementNS(tag === 'svg' || attrs.svg ? 'http://www.w3.org/2000/svg' : 'http://www.w3.org/1999/xhtml', tag);
  for (const [k, v] of Object.entries(attrs ?? {})) {
    if (v == null || v === false || k === 'svg') continue;
    if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else if (k === 'dataset') Object.assign(el.dataset, v);
    else el.setAttribute(k, v === true ? '' : String(v));
  }
  for (const c of children.flat(Infinity)) {
    if (c == null || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

const SVG = 'http://www.w3.org/2000/svg';
/** SVG öğesi (öznitelikler sayısal olabilir). */
export function s(tag, attrs = {}, ...children) {
  const el = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attrs)) if (v != null) el.setAttribute(k, String(v));
  for (const c of children.flat()) if (c != null) el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  return el;
}

export const icon = (id) => {
  const svg = document.createElementNS(SVG, 'svg');
  const use = document.createElementNS(SVG, 'use');
  use.setAttribute('href', `#${id}`);
  svg.append(use);
  return svg;
};

export const fmt = (x, d = 1) => (x == null ? '—' : Number(x).toLocaleString('tr-TR', { maximumFractionDigits: d, minimumFractionDigits: 0 }));
