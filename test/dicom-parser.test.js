import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseDicom, DicomError } from '../src/dicom/parser.js';
import { writeDicom } from '../scripts/lib/dicom-writer.mjs';

const pixels = Int16Array.from({ length: 12 }, (_, i) => i * 100 - 500); // 3x4
const base = { rows: 3, columns: 4, pixels, position: [-10, 20, 30.5], pixelSpacing: [0.7, 0.8] };

for (const implicit of [false, true]) {
  test(`${implicit ? 'implicit' : 'explicit'} VR LE: meta veriler ve pikseller doğru okunur`, () => {
    const d = parseDicom(writeDicom({ ...base, intercept: -1024, slope: 1 }, { implicit }));
    assert.equal(d.modality, 'CT');
    assert.equal(d.rows, 3);
    assert.equal(d.columns, 4);
    assert.deepEqual(d.position, [-10, 20, 30.5]);
    assert.deepEqual(d.orientation, [1, 0, 0, 0, 1, 0]);
    assert.deepEqual(d.pixelSpacing, [0.7, 0.8]);
    assert.equal(d.pixels.length, 12);
    assert.equal(d.pixels[0], -500 - 1024);
    assert.equal(d.pixels[11], 600 - 1024);
  });
}

test('Rescale slope/intercept uygulanır', () => {
  const d = parseDicom(writeDicom({ ...base, slope: 2, intercept: 5 }));
  assert.equal(d.pixels[1], (-400) * 2 + 5);
});

test('tanımsız uzunluklu diziler atlanır (explicit ve implicit)', () => {
  for (const implicit of [false, true]) {
    const d = parseDicom(writeDicom(base, { implicit, withSequence: true }));
    assert.equal(d.pixels[5], 0);
    assert.equal(d.sliceThickness, 1);
  }
});

test('BitsStored < BitsAllocated: işaretli 12 bit değer doğru genişletilir', () => {
  // 12 bit -1 = 0xFFF; üst 4 bit çöp (0xA000) olsa da maskelenmeli.
  const raw = new Uint16Array([0xafff, 0x07ff, 0x0800, 0x0000]);
  const d = parseDicom(writeDicom({ rows: 1, columns: 4, pixels: raw, bitsStored: 12 }));
  assert.deepEqual([...d.pixels], [-1, 2047, -2048, 0]);
});

test('işaretsiz 8 bit görüntü', () => {
  const d = parseDicom(writeDicom({ rows: 2, columns: 2, pixels: new Uint8Array([0, 10, 200, 255]), bitsAllocated: 8, bitsStored: 8, signed: false }));
  assert.deepEqual([...d.pixels], [0, 10, 200, 255]);
});

test('MONOCHROME1 tersine çevrilir', () => {
  const d = parseDicom(writeDicom({ rows: 1, columns: 3, pixels: new Int16Array([0, 10, 100]), photometric: 'MONOCHROME1' }));
  assert.deepEqual([...d.pixels], [100, 90, 0]);
});

test('önsözsüz (preamble yok) dosya okunur', () => {
  const d = parseDicom(writeDicom(base, { implicit: true, preamble: false }));
  assert.equal(d.rows, 3);
});

const code = (fn) => { try { fn(); } catch (e) { assert.ok(e instanceof DicomError, e); return e.code; } return null; };

test('desteklenmeyen girdiler anlamlı hata koduyla reddedilir', () => {
  assert.equal(code(() => parseDicom(new TextEncoder().encode('merhaba dünya, bu bir DICOM değil').buffer)), 'not-dicom');
  assert.equal(code(() => parseDicom(writeDicom(base, { transferSyntax: '1.2.840.10008.1.2.4.50' }))), 'unsupported-transfer-syntax');
  assert.equal(code(() => parseDicom(writeDicom({ ...base, numberOfFrames: 2 }))), 'multiframe');
  assert.equal(code(() => parseDicom(writeDicom({ ...base, photometric: 'RGB' }))), 'unsupported-color');
  const full = writeDicom(base);
  assert.equal(code(() => parseDicom(full.slice(0, full.byteLength - 6))), 'truncated');
});

test('hasta kimlik alanları çıktıda yer almaz', () => {
  const d = parseDicom(writeDicom(base, { extra: [[0x0010, 0x0010, 'PN', 'DENEME^HASTA']] }));
  assert.ok(!JSON.stringify(Object.keys(d)).match(/patient/i));
  assert.ok(!Object.values(d).some((v) => typeof v === 'string' && v.includes('DENEME')));
});
