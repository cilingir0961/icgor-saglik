// DICOM görüntüleyici denetleyicisi: hacim durumu + Canvas çizimi.
// Dosyalar yalnızca tarayıcı belleğinde işlenir; hiçbir ağ isteği yapılmaz (CSP de bunu engeller).

import { parseDicom, DicomError, DICOM_ERRORS_TR } from './parser.js';
import {
  groupSeries, buildVolume, extractPlane, mipCoronal, applyWindow, autoWindow,
  orientationLetter, ORIENTATION_TR, planeLength, WINDOW_PRESETS,
} from './volume.js';

const OPPOSITE = { R: 'L', L: 'R', A: 'P', P: 'A', S: 'I', I: 'S' };
export const PLANES = { axial: 'Aksiyel', coronal: 'Koronal', sagittal: 'Sajital', mip: 'MIP' };

/** Dosya listesini okuyup en büyük seriden hacim kurar. */
export async function loadDicomFiles(files, onProgress = () => {}) {
  const images = [];
  const errors = new Map();
  let done = 0;
  for (const f of files) {
    try {
      images.push(parseDicom(await f.arrayBuffer()));
    } catch (e) {
      const code = e instanceof DicomError ? e.code : 'malformed';
      errors.set(code, (errors.get(code) ?? 0) + 1);
    }
    onProgress(++done, files.length);
  }
  if (images.length === 0) {
    const [code] = [...errors.keys()];
    throw new Error(DICOM_ERRORS_TR[code] ?? 'Okunabilir DICOM görüntüsü bulunamadı.');
  }
  const series = groupSeries(images);
  const vol = buildVolume(series[0]);
  if (series.length > 1) vol.warnings.push(`${series.length} seri bulundu; en çok kesitli seri gösteriliyor.`);
  for (const [code, n] of errors) vol.warnings.push(`${n} dosya okunamadı: ${DICOM_ERRORS_TR[code] ?? code}`);
  return vol;
}

export class DicomViewer {
  constructor() {
    this.vol = null;
    this.plane = 'axial';
    this.index = { axial: 0, coronal: 0, sagittal: 0 };
    this.win = { center: 40, width: 400 };
    this.cache = { key: null, canvas: null, image: null };
    this.mip = null;
    this.layout = null; // son çizimde görüntünün ekrandaki yeri
    this.probe = null; // {x, y, value}
  }

  setVolume(vol) {
    this.vol = vol;
    this.mip = null;
    this.index = { axial: vol.nz >> 1, coronal: vol.ny >> 1, sagittal: vol.nx >> 1 };
    if (vol.window) this.win = { center: vol.window[0], width: vol.window[1] };
    else if (vol.modality === 'CT') this.win = { ...WINDOW_PRESETS['yumusak-doku'] };
    else this.win = autoWindow(vol.data);
    this.probe = null;
    this.cache.key = null;
  }

  setPreset(id) {
    if (!this.vol) return;
    this.win = id === 'otomatik' ? autoWindow(this.vol.data) : { center: WINDOW_PRESETS[id].center, width: WINDOW_PRESETS[id].width };
  }

  get sliceCount() {
    return this.vol && this.plane !== 'mip' ? planeLength(this.vol, this.plane) : 0;
  }

  get sliceIndex() {
    return this.plane === 'mip' ? 0 : this.index[this.plane];
  }

  setSlice(i) {
    if (this.plane === 'mip' || !this.vol) return;
    this.index[this.plane] = Math.max(0, Math.min(this.sliceCount - 1, Math.round(i)));
  }

  currentImage() {
    if (this.plane === 'mip') return (this.mip ??= mipCoronal(this.vol));
    return extractPlane(this.vol, this.plane, this.index[this.plane]);
  }

  draw(ctx, width, height) {
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, width, height);
    if (!this.vol) {
      drawCentered(ctx, width, height, ['DICOM serisi açın veya sentetik fantomu yükleyin.', 'Dosyalar cihazınızdan çıkmaz.']);
      return;
    }
    const key = `${this.plane}:${this.sliceIndex}:${this.win.center}:${this.win.width}`;
    if (this.cache.key !== key) {
      const img = this.currentImage();
      const c = this.cache.canvas ?? (this.cache.canvas = document.createElement('canvas'));
      c.width = img.width;
      c.height = img.height;
      const id = new ImageData(applyWindow(img.data, this.win.center, this.win.width), img.width, img.height);
      c.getContext('2d').putImageData(id, 0, 0);
      this.cache = { key, canvas: c, image: img };
    }
    const img = this.cache.image;
    // Fiziksel en-boy oranını koru (piksel aralıkları farklı olabilir).
    const physW = img.width * img.pixelW, physH = img.height * img.pixelH;
    const pad = 28;
    const s = Math.min((width - 2 * pad) / physW, (height - 2 * pad) / physH);
    const dw = physW * s, dh = physH * s;
    const dx = (width - dw) / 2, dy = (height - dh) / 2;
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(this.cache.canvas, dx, dy, dw, dh);
    this.layout = { dx, dy, dw, dh, img };

    // Kenar yön etiketleri
    const r = orientationLetter(img.right), d = orientationLetter(img.down);
    ctx.font = '600 13px system-ui, sans-serif';
    ctx.fillStyle = '#ffd34d';
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'right';
    ctx.fillText(ORIENTATION_TR[r], dx + dw - 4, dy + dh / 2);
    ctx.textAlign = 'left';
    ctx.fillText(ORIENTATION_TR[OPPOSITE[r]], dx + 4, dy + dh / 2);
    ctx.textAlign = 'center';
    ctx.fillText(ORIENTATION_TR[OPPOSITE[d]], dx + dw / 2, dy + 12);
    ctx.fillText(ORIENTATION_TR[d], dx + dw / 2, dy + dh - 12);

    // Bilgi satırı
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.font = '12px system-ui, sans-serif';
    ctx.fillStyle = '#e8eef3';
    const sliceInfo = this.plane === 'mip' ? 'MIP (ön-arka)' : `${PLANES[this.plane]} ${this.sliceIndex + 1}/${this.sliceCount}`;
    ctx.fillText(`${this.vol.modality || '?'} · ${sliceInfo} · P ${Math.round(this.win.center)}/${Math.round(this.win.width)}`, 8, 8);

    if (this.vol.synthetic) {
      ctx.font = '700 12px system-ui, sans-serif';
      ctx.fillStyle = '#ffb347';
      ctx.fillText('SENTETİK FANTOM — gerçek hasta verisi değil', 8, 26);
    }
    if (this.probe) {
      ctx.textBaseline = 'bottom';
      ctx.font = '12px system-ui, sans-serif';
      ctx.fillStyle = '#9fe0ff';
      const unit = this.vol.modality === 'CT' ? ' HU' : '';
      ctx.fillText(`Değer: ${Math.round(this.probe.value)}${unit}`, 8, height - 36);
      ctx.strokeStyle = '#9fe0ff';
      ctx.beginPath();
      ctx.arc(this.probe.x, this.probe.y, 5, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  /** Ekran noktasındaki voksel değerini okur; görüntü dışındaysa null. */
  probeAt(x, y) {
    const L = this.layout;
    if (!L) return null;
    const u = (x - L.dx) / L.dw, v = (y - L.dy) / L.dh;
    if (u < 0 || u >= 1 || v < 0 || v >= 1) return (this.probe = null);
    const i = Math.floor(u * L.img.width), j = Math.floor(v * L.img.height);
    this.probe = { x, y, value: L.img.data[j * L.img.width + i] };
    return this.probe;
  }
}

function drawCentered(ctx, w, h, lines) {
  ctx.fillStyle = '#9fb0bf';
  ctx.font = '14px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  lines.forEach((l, i) => ctx.fillText(l, w / 2, h / 2 + (i - (lines.length - 1) / 2) * 22));
}
