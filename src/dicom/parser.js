// Bağımlılıksız DICOM (Part 10) ayrıştırıcı — tek kareli, sıkıştırılmamış gri tonlamalı görüntüler.
// Desteklenen aktarım sözdizimleri: Implicit VR LE, Explicit VR LE.
// Diziler (SQ, tanımsız uzunluk dahil) atlanır; görüntü için gereken etiketler okunur.
// Tarayıcıların hepsi little-endian olduğundan tipli diziler doğrudan kullanılır.
//
// Gizlilik: Hasta kimlik etiketleri (ad, kimlik no, doğum tarihi) bilinçli olarak OKUNMAZ.

export class DicomError extends Error {
  constructor(code, detail) {
    super(detail ? `${code}: ${detail}` : code);
    this.name = 'DicomError';
    this.code = code;
    this.detail = detail;
  }
}

export const TS = {
  IMPLICIT_LE: '1.2.840.10008.1.2',
  EXPLICIT_LE: '1.2.840.10008.1.2.1',
  EXPLICIT_BE: '1.2.840.10008.1.2.2',
  DEFLATED: '1.2.840.10008.1.2.1.99',
};
const SUPPORTED_TS = new Set([TS.IMPLICIT_LE, TS.EXPLICIT_LE]);

const tag = (g, e) => ((g << 16) | e) >>> 0;
export const TAGS = {
  TransferSyntaxUID: tag(0x0002, 0x0010),
  Modality: tag(0x0008, 0x0060),
  SeriesDescription: tag(0x0008, 0x103e),
  SliceThickness: tag(0x0018, 0x0050),
  SeriesInstanceUID: tag(0x0020, 0x000e),
  InstanceNumber: tag(0x0020, 0x0013),
  ImagePositionPatient: tag(0x0020, 0x0032),
  ImageOrientationPatient: tag(0x0020, 0x0037),
  SamplesPerPixel: tag(0x0028, 0x0002),
  PhotometricInterpretation: tag(0x0028, 0x0004),
  NumberOfFrames: tag(0x0028, 0x0008),
  Rows: tag(0x0028, 0x0010),
  Columns: tag(0x0028, 0x0011),
  PixelSpacing: tag(0x0028, 0x0030),
  BitsAllocated: tag(0x0028, 0x0100),
  BitsStored: tag(0x0028, 0x0101),
  PixelRepresentation: tag(0x0028, 0x0103),
  WindowCenter: tag(0x0028, 0x1050),
  WindowWidth: tag(0x0028, 0x1051),
  RescaleIntercept: tag(0x0028, 0x1052),
  RescaleSlope: tag(0x0028, 0x1053),
  PixelData: tag(0x7fe0, 0x0010),
};

// Implicit VR'de ikili değerli etiketlerin VR'si sözlükten bilinmeli.
const IMPLICIT_VR = new Map([
  [TAGS.SamplesPerPixel, 'US'], [TAGS.Rows, 'US'], [TAGS.Columns, 'US'],
  [TAGS.BitsAllocated, 'US'], [TAGS.BitsStored, 'US'], [TAGS.PixelRepresentation, 'US'],
  [TAGS.PixelData, 'OW'],
]);
const LONG_VR = new Set(['OB', 'OD', 'OF', 'OL', 'OV', 'OW', 'SQ', 'SV', 'UC', 'UN', 'UR', 'UT', 'UV']);
const ITEM = tag(0xfffe, 0xe000);
const ITEM_DELIM = tag(0xfffe, 0xe00d);
const SEQ_DELIM = tag(0xfffe, 0xe0dd);
const UNDEFINED = 0xffffffff;

const ascii = (bytes) => {
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return s;
};

/** Ham veri kümesini okur: Map<tag, {vr, offset, length}>. */
function readDataset(view, offset, end, explicit, elements, untilItemDelim = false) {
  while (offset + 8 <= end) {
    const t = tag(view.getUint16(offset, true), view.getUint16(offset + 2, true));
    if (t === ITEM_DELIM) {
      if (!untilItemDelim) throw new DicomError('malformed', 'beklenmeyen öğe sonu');
      return offset + 8;
    }
    let vr, length, header;
    if (explicit) {
      vr = String.fromCharCode(view.getUint8(offset + 4), view.getUint8(offset + 5));
      if (LONG_VR.has(vr)) {
        if (offset + 12 > end) throw new DicomError('truncated');
        length = view.getUint32(offset + 8, true);
        header = 12;
      } else {
        length = view.getUint16(offset + 6, true);
        header = 8;
      }
    } else {
      vr = IMPLICIT_VR.get(t) ?? 'UN';
      length = view.getUint32(offset + 4, true);
      header = 8;
    }
    offset += header;
    if (length === UNDEFINED) {
      if (t === TAGS.PixelData) throw new DicomError('compressed', 'kapsüllenmiş piksel verisi');
      offset = skipUndefinedSequence(view, offset, end, explicit);
      continue;
    }
    if (offset + length > end) throw new DicomError('truncated', `etiket ${t.toString(16).padStart(8, '0')}`);
    if (vr !== 'SQ') elements.set(t, { vr, offset, length });
    offset += length;
    if (t === TAGS.PixelData) break; // sonrası (dolgu vb.) gereksiz
  }
  return offset;
}

function skipUndefinedSequence(view, offset, end, explicit) {
  while (offset + 8 <= end) {
    const t = tag(view.getUint16(offset, true), view.getUint16(offset + 2, true));
    const len = view.getUint32(offset + 4, true);
    offset += 8;
    if (t === SEQ_DELIM) return offset;
    if (t !== ITEM) throw new DicomError('malformed', 'dizi öğesi bekleniyordu');
    if (len === UNDEFINED) offset = readDataset(view, offset, end, explicit, new Map(), true);
    else offset += len;
  }
  throw new DicomError('truncated', 'dizi sonu bulunamadı');
}

/** DICOM dosyasını ayrıştırır ve görüntü için gereken alanları döndürür. */
export function parseDicom(buffer) {
  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);
  let offset = 0;
  if (buffer.byteLength >= 132 && ascii(bytes.subarray(128, 132)) === 'DICM') offset = 132;
  else if (buffer.byteLength < 8 || ![0x0002, 0x0008].includes(view.getUint16(0, true))) {
    // Önsözsüz eski dosyalar genellikle 0008 grubuyla başlar; değilse DICOM sayma.
    throw new DicomError('not-dicom');
  }

  // Dosya meta grubu (0002): her zaman Explicit VR LE.
  const elements = new Map();
  let ts = TS.IMPLICIT_LE; // meta yoksa (eski "ham" dosyalar) varsayılan
  if (view.getUint16(offset, true) === 0x0002) {
    const metaEnd = scanMetaEnd(view, offset);
    readDataset(view, offset, metaEnd, true, elements);
    offset = metaEnd;
    const tsEl = elements.get(TAGS.TransferSyntaxUID);
    if (tsEl) ts = readString(bytes, tsEl);
  }
  if (!SUPPORTED_TS.has(ts)) throw new DicomError('unsupported-transfer-syntax', ts);
  readDataset(view, offset, buffer.byteLength, ts === TS.EXPLICIT_LE, elements);

  const get = makeAccessors(view, bytes, elements);
  if (!elements.has(TAGS.PixelData)) throw new DicomError('no-pixel-data');
  return {
    transferSyntax: ts,
    modality: get.str(TAGS.Modality),
    seriesDescription: get.str(TAGS.SeriesDescription),
    seriesUID: get.str(TAGS.SeriesInstanceUID),
    instanceNumber: get.num(TAGS.InstanceNumber),
    position: get.nums(TAGS.ImagePositionPatient),
    orientation: get.nums(TAGS.ImageOrientationPatient),
    pixelSpacing: get.nums(TAGS.PixelSpacing), // [satır aralığı, sütun aralığı] mm
    sliceThickness: get.num(TAGS.SliceThickness),
    windowCenter: get.nums(TAGS.WindowCenter)?.[0],
    windowWidth: get.nums(TAGS.WindowWidth)?.[0],
    rows: get.num(TAGS.Rows),
    columns: get.num(TAGS.Columns),
    pixels: decodePixels(get, elements, buffer),
  };
}

function scanMetaEnd(view, offset) {
  // Meta grubunu, grup 0002 olmayan ilk etikete kadar tara.
  let o = offset;
  while (o + 8 <= view.byteLength && view.getUint16(o, true) === 0x0002) {
    const vr = String.fromCharCode(view.getUint8(o + 4), view.getUint8(o + 5));
    o += LONG_VR.has(vr) ? 12 + view.getUint32(o + 8, true) : 8 + view.getUint16(o + 6, true);
  }
  return o;
}

const readString = (bytes, el) => ascii(bytes.subarray(el.offset, el.offset + el.length)).replace(/[\0 ]+$/, '').trim();

function makeAccessors(view, bytes, elements) {
  const str = (t) => {
    const el = elements.get(t);
    return el ? readString(bytes, el) : undefined;
  };
  const num = (t) => {
    const el = elements.get(t);
    if (!el || el.length === 0) return undefined;
    switch (el.vr) {
      case 'US': return view.getUint16(el.offset, true);
      case 'SS': return view.getInt16(el.offset, true);
      case 'UL': return view.getUint32(el.offset, true);
      case 'SL': return view.getInt32(el.offset, true);
      case 'FL': return view.getFloat32(el.offset, true);
      case 'FD': return view.getFloat64(el.offset, true);
      default: {
        const v = parseFloat(readString(bytes, el).split('\\')[0]);
        return Number.isFinite(v) ? v : undefined;
      }
    }
  };
  const nums = (t) => {
    const s = str(t);
    if (!s) return undefined;
    const v = s.split('\\').map(Number);
    return v.every(Number.isFinite) ? v : undefined;
  };
  return { str, num, nums };
}

/** Piksel verisini Rescale uygulanmış Float32Array olarak çözer (BT için Hounsfield birimi). */
function decodePixels(get, elements, buffer) {
  const rows = get.num(TAGS.Rows), cols = get.num(TAGS.Columns);
  const bitsAllocated = get.num(TAGS.BitsAllocated) ?? 16;
  const bitsStored = get.num(TAGS.BitsStored) ?? bitsAllocated;
  const signed = get.num(TAGS.PixelRepresentation) === 1;
  const spp = get.num(TAGS.SamplesPerPixel) ?? 1;
  const frames = get.num(TAGS.NumberOfFrames) ?? 1;
  const photometric = get.str(TAGS.PhotometricInterpretation) ?? 'MONOCHROME2';
  if (!rows || !cols) throw new DicomError('malformed', 'satır/sütun yok');
  if (spp !== 1 || !photometric.startsWith('MONOCHROME')) throw new DicomError('unsupported-color', photometric);
  if (frames > 1) throw new DicomError('multiframe', String(frames));
  if (bitsAllocated !== 8 && bitsAllocated !== 16) throw new DicomError('unsupported-bits', String(bitsAllocated));

  const el = elements.get(TAGS.PixelData);
  const n = rows * cols;
  const bytesPer = bitsAllocated / 8;
  if (el.length < n * bytesPer) throw new DicomError('truncated', 'piksel verisi eksik');
  const raw = buffer.slice(el.offset, el.offset + n * bytesPer);
  const src = bitsAllocated === 16
    ? (signed ? new Int16Array(raw) : new Uint16Array(raw))
    : (signed ? new Int8Array(raw) : new Uint8Array(raw));

  const slope = get.num(TAGS.RescaleSlope) ?? 1;
  const intercept = get.num(TAGS.RescaleIntercept) ?? 0;
  const out = new Float32Array(n);
  const needsMask = bitsStored < bitsAllocated;
  const mask = (1 << bitsStored) - 1;
  const signBit = 1 << (bitsStored - 1);
  for (let i = 0; i < n; i++) {
    let v = src[i];
    if (needsMask) {
      v &= mask;
      if (signed && v & signBit) v -= 1 << bitsStored;
    }
    out[i] = v * slope + intercept;
  }
  if (photometric === 'MONOCHROME1') {
    // MONOCHROME1: yüksek değer = koyu. MONOCHROME2'ye çevirmek için tersle.
    let min = Infinity, max = -Infinity;
    for (const v of out) { if (v < min) min = v; if (v > max) max = v; }
    for (let i = 0; i < n; i++) out[i] = max + min - out[i];
  }
  return out;
}

export const DICOM_ERRORS_TR = {
  'not-dicom': 'Dosya DICOM biçiminde değil.',
  'unsupported-transfer-syntax': 'Bu aktarım sözdizimi (ör. JPEG/JPEG2000 sıkıştırma) henüz desteklenmiyor.',
  compressed: 'Sıkıştırılmış piksel verisi henüz desteklenmiyor.',
  'unsupported-color': 'Yalnızca gri tonlamalı (MONOCHROME) görüntüler destekleniyor.',
  multiframe: 'Çok kareli (enhanced) DICOM henüz desteklenmiyor.',
  'unsupported-bits': 'Desteklenmeyen piksel bit derinliği.',
  'no-pixel-data': 'Dosyada görüntü verisi yok (rapor/yapılandırılmış belge olabilir).',
  truncated: 'Dosya eksik veya bozuk.',
  malformed: 'Dosya yapısı bozuk.',
};
