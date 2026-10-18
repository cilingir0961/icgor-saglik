// Test ve örnek veri üretimi için minimal DICOM yazıcı (yalnızca geliştirme aracı).
// Üretilen dosyalar SENTETİKTİR; hasta kimlik etiketi içermez.

const IMPLICIT = '1.2.840.10008.1.2';
const EXPLICIT = '1.2.840.10008.1.2.1';
const LONG_VR = new Set(['OB', 'OD', 'OF', 'OL', 'OV', 'OW', 'SQ', 'SV', 'UC', 'UN', 'UR', 'UT', 'UV']);

const enc = (s, pad = ' ') => {
  const b = [...s].map((c) => c.charCodeAt(0));
  if (b.length % 2) b.push(pad.charCodeAt(0));
  return Uint8Array.from(b);
};
const u16 = (v) => new Uint8Array(new Uint16Array([v]).buffer);
const u32 = (v) => new Uint8Array(new Uint32Array([v]).buffer);

function element(group, elem, vr, value, explicit) {
  const head = [u16(group), u16(elem)];
  if (explicit) {
    head.push(enc(vr));
    if (LONG_VR.has(vr)) head.push(new Uint8Array(2), u32(value.length));
    else head.push(u16(value.length));
  } else {
    head.push(u32(value.length));
  }
  return [...head, value];
}

const value = (vr, v) => {
  if (v instanceof Uint8Array) return v;
  if (ArrayBuffer.isView(v)) return new Uint8Array(v.buffer, v.byteOffset, v.byteLength);
  if (vr === 'US') return u16(v);
  if (vr === 'UI') return enc(String(v), '\0');
  return enc(Array.isArray(v) ? v.join('\\') : String(v));
};

/**
 * @param {object} img
 * @param {{implicit?:boolean, preamble?:boolean, withSequence?:boolean,
 *          transferSyntax?:string, extra?:Array}} [opts]
 */
export function writeDicom(img, opts = {}) {
  const ts = opts.transferSyntax ?? (opts.implicit ? IMPLICIT : EXPLICIT);
  const explicit = ts !== IMPLICIT;
  const parts = [];
  if (opts.preamble !== false) parts.push(new Uint8Array(128), enc('DICM'));
  parts.push(...element(0x0002, 0x0010, 'UI', value('UI', ts), true));

  const ds = [
    [0x0008, 0x0060, 'CS', img.modality ?? 'CT'],
    [0x0008, 0x103e, 'LO', img.seriesDescription ?? 'SENTETIK'],
    [0x0018, 0x0050, 'DS', img.sliceThickness ?? 1],
    [0x0020, 0x000e, 'UI', img.seriesUID ?? '1.2.3.4'],
    [0x0020, 0x0013, 'IS', img.instanceNumber ?? 1],
    [0x0020, 0x0032, 'DS', img.position ?? [0, 0, 0]],
    [0x0020, 0x0037, 'DS', img.orientation ?? [1, 0, 0, 0, 1, 0]],
    [0x0028, 0x0002, 'US', 1],
    [0x0028, 0x0004, 'CS', img.photometric ?? 'MONOCHROME2'],
    [0x0028, 0x0010, 'US', img.rows],
    [0x0028, 0x0011, 'US', img.columns],
    [0x0028, 0x0030, 'DS', img.pixelSpacing ?? [1, 1]],
    [0x0028, 0x0100, 'US', img.bitsAllocated ?? 16],
    [0x0028, 0x0101, 'US', img.bitsStored ?? 16],
    [0x0028, 0x0103, 'US', img.signed === false ? 0 : 1],
    [0x0028, 0x1052, 'DS', img.intercept ?? 0],
    [0x0028, 0x1053, 'DS', img.slope ?? 1],
    ...(opts.extra ?? []),
  ];
  if (img.numberOfFrames) ds.push([0x0028, 0x0008, 'IS', img.numberOfFrames]);
  ds.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  for (const [g, e, vr, v] of ds) {
    if (opts.withSequence && g === 0x0018) parts.push(...undefinedLengthSequence(explicit));
    parts.push(...element(g, e, vr, value(vr, v), explicit));
  }
  parts.push(...element(0x7fe0, 0x0010, 'OW', value('OW', img.pixels), explicit));

  const total = parts.reduce((s, p) => s + p.length, 0);
  const out = new Uint8Array(total);
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out.buffer;
}

// (0008,1140) Referenced Image Sequence: tanımsız uzunluklu dizi + tanımsız uzunluklu öğe.
function undefinedLengthSequence(explicit) {
  const inner = element(0x0008, 0x1150, 'UI', value('UI', '1.2.840.10008.5.1.4.1.1.2'), explicit);
  return [
    u16(0x0008), u16(0x1140), ...(explicit ? [enc('SQ'), new Uint8Array(2)] : []), u32(0xffffffff),
    u16(0xfffe), u16(0xe000), u32(0xffffffff), ...inner,
    u16(0xfffe), u16(0xe00d), u32(0),
    u16(0xfffe), u16(0xe0dd), u32(0),
  ];
}
