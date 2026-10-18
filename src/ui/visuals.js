// Arayüz görselleri (assets/ui, projenin lisanslı 3B atlasından üretilmiş renderlar; CC BY-SA 4.0, assets/ui/LICENSE.md).
// Fotoğraf yok; egzersiz pozları basitleştirilmiş SİMÜLASYON.

import { s } from '../scan/dom.js';

const BASE = 'assets/ui/';

/** Egzersize uygun görsel: önce hareket pozu, yoksa ana kas grubu vurgusu. */
export function exerciseImage(e) {
  if (!e) return `${BASE}body-front.webp`;
  if (e.motion === 'kol-kaldirma') return `${BASE}ex-kol-kaldirma.webp`;
  if (e.type === 'kardiyo') return `${BASE}ex-yurume.webp`;
  const m = e.muscles ?? [];
  if (m.includes('mus-chest')) return `${BASE}mg-gogus.webp`;
  if (m.includes('mus-back')) return `${BASE}mg-sirt.webp`;
  if (m.includes('mus-shoulder-arm')) return `${BASE}mg-omuz.webp`;
  if (m.includes('mus-abdomen')) return `${BASE}mg-karin.webp`;
  if (m.includes('mus-head-neck')) return `${BASE}mg-boyun.webp`;
  if (m.includes('mus-hip-thigh') && !m.includes('mus-leg-foot')) return `${BASE}mg-kalca.webp`;
  return `${BASE}mg-bacak.webp`;
}

/** Bana Anlat bölgesine yakın plan görsel. */
export const REGION_IMAGE = {
  'bas-boyun': `${BASE}region-boyun.webp`, 'omuz-L': `${BASE}region-omuz.webp`, 'omuz-R': `${BASE}region-omuz.webp`,
  govde: `${BASE}region-govde.webp`, kalca: `${BASE}region-kalca.webp`, 'diz-L': `${BASE}region-diz.webp`,
  'diz-R': `${BASE}region-diz.webp`, denge: `${BASE}region-denge.webp`,
};

export const BODY_FRONT = `${BASE}body-front.webp`;
export const BODY_BACK = `${BASE}body-back.webp`;

/** <img> öğesi: tembel yükleme, boyut ayrılmış (kayma yok), boş alt metin yerine açıklama. */
export function img(src, alt, { w = 120, h = 120, cls = '' } = {}) {
  const el = document.createElement('img');
  el.src = src; el.alt = alt; el.width = w; el.height = h; el.loading = 'lazy'; el.decoding = 'async';
  if (cls) el.className = cls;
  return el;
}

/** İlerleme halkası (SVG; CSP uyumlu: öznitelikler, satır içi stil yok). */
export function ring(pct, { size = 64, stroke = 7, cls = '' } = {}) {
  const r = (size - stroke) / 2, c = 2 * Math.PI * r, p = Math.max(0, Math.min(100, pct));
  return s('svg', { viewBox: `0 0 ${size} ${size}`, class: `ring ${cls}`, width: size, height: size, 'aria-hidden': 'true' },
    s('circle', { cx: size / 2, cy: size / 2, r, class: 'ring-track', 'stroke-width': stroke }),
    p > 0 ? s('circle', { cx: size / 2, cy: size / 2, r, class: 'ring-value', 'stroke-width': stroke, 'stroke-dasharray': `${(c * p) / 100} ${c}`, transform: `rotate(-90 ${size / 2} ${size / 2})` }) : null);
}
