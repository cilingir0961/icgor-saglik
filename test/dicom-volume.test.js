import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseDicom } from '../src/dicom/parser.js';
import {
  groupSeries, buildVolume, extractPlane, mipCoronal, applyWindow, autoWindow, orientationLetter, planeLength,
} from '../src/dicom/volume.js';
import { makePhantom, ORGAN_HU } from '../src/dicom/phantom.js';
import { writeDicom } from '../scripts/lib/dicom-writer.mjs';

// 4x3 piksel, 5 kesit; değer = 1000*k + 10*j + i → indeksler doğrudan doğrulanabilir.
function series({ shuffle = true, gap = 2.5, uid = '1.2.3', drop = [] } = {}) {
  const files = [];
  for (let k = 0; k < 5; k++) {
    if (drop.includes(k)) continue;
    const px = new Int16Array(12);
    for (let j = 0; j < 3; j++) for (let i = 0; i < 4; i++) px[j * 4 + i] = 1000 * k + 10 * j + i;
    files.push(parseDicom(writeDicom({
      rows: 3, columns: 4, pixels: px, seriesUID: uid, instanceNumber: 5 - k, // numara ters: konuma güvenilmeli
      position: [0, 0, -100 + k * gap], pixelSpacing: [0.5, 0.6],
    })));
  }
  if (shuffle) files.reverse().push(files.shift());
  return files;
}
const at = (vol, i, j, k) => vol.data[k * vol.nx * vol.ny + j * vol.nx + i];

test('kesitler konuma göre sıralanır (kesit numarasına değil) ve aralık hesaplanır', () => {
  const vol = buildVolume(series());
  assert.deepEqual([vol.nx, vol.ny, vol.nz], [4, 3, 5]);
  assert.deepEqual(vol.spacing, [0.6, 0.5, 2.5]);
  for (let k = 0; k < 5; k++) assert.equal(at(vol, 2, 1, k), 1000 * k + 12);
  assert.deepEqual(vol.warnings, []);
});

test('eksik kesit düzensiz aralık uyarısı üretir', () => {
  const vol = buildVolume(series({ drop: [2] }));
  assert.ok(vol.warnings.some((w) => w.includes('düzensiz')));
});

test('seriler UID ile gruplanır, en büyük seri önce gelir', () => {
  const g = groupSeries([...series({ uid: 'a', drop: [0, 1] }), ...series({ uid: 'b' })]);
  assert.equal(g.length, 2);
  assert.equal(g[0].length, 5);
  assert.equal(g[0][0].seriesUID, 'b');
});

test('aksiyel, koronal ve sajital düzlemler doğru voksellerden ve doğru boyutta çıkar', () => {
  const vol = buildVolume(series());
  const ax = extractPlane(vol, 'axial', 3);
  assert.deepEqual([ax.width, ax.height, ax.pixelW, ax.pixelH], [4, 3, 0.6, 0.5]);
  assert.equal(ax.data[1 * 4 + 2], 3012);

  const co = extractPlane(vol, 'coronal', 1); // j=1; satır 0 = en üst kesit (k=4)
  assert.deepEqual([co.width, co.height, co.pixelH], [4, 5, 2.5]);
  assert.equal(co.data[0 * 4 + 3], 4013);
  assert.equal(co.data[4 * 4 + 0], 10);

  const sa = extractPlane(vol, 'sagittal', 3); // i=3
  assert.deepEqual([sa.width, sa.height], [3, 5]);
  assert.equal(sa.data[0 * 3 + 2], 4023);
  assert.equal(planeLength(vol, 'sagittal'), 4);
});

test('indeks sınır dışıysa kenara kırpılır', () => {
  const vol = buildVolume(series());
  assert.equal(extractPlane(vol, 'axial', 99).data[0], 4000);
  assert.equal(extractPlane(vol, 'axial', -5).data[0], 0);
});

test('radyolojik yön harfleri: standart aksiyelde ekran sağı = hastanın solu', () => {
  const vol = buildVolume(series());
  const ax = extractPlane(vol, 'axial', 0);
  assert.equal(orientationLetter(ax.right), 'L');
  assert.equal(orientationLetter(ax.down), 'P');
  const co = extractPlane(vol, 'coronal', 0);
  assert.equal(orientationLetter(co.down), 'I');
  assert.equal(orientationLetter([-0.2, 0.9, 0.1]), 'P');
  assert.equal(orientationLetter([0, 0, 1]), 'S');
});

test('MIP her ışın boyunca maksimumu alır', () => {
  const vol = buildVolume(series());
  const m = mipCoronal(vol);
  assert.equal(m.data[0 * 4 + 1], 4000 + 20 + 1); // k=4, j=2 (max), i=1
});

test('pencereleme: alt sınır siyah, üst sınır beyaz, orta gri', () => {
  const rgba = applyWindow(new Float32Array([-1000, 40, 1000]), 40, 400);
  assert.deepEqual([rgba[0], rgba[8], rgba[3]], [0, 255, 255]);
  assert.ok(Math.abs(rgba[4] - 127.5) <= 1, `orta gri: ${rgba[4]}`);
});

test('otomatik pencere veri aralığını kapsar', () => {
  const d = Float32Array.from({ length: 1000 }, (_, i) => i);
  const w = autoWindow(d);
  assert.ok(Math.abs(w.center - 500) < 15 && w.width > 950);
});

test('fantom: organlar beklenen HU değerinde ve anatomik tarafta', () => {
  const p = makePhantom({ voxel: 6, noise: 0 });
  const huAt = (xmm, ymm, zmm) => at(p, Math.round((xmm + 220) / 6), Math.round((ymm + 150) / 6), Math.round(zmm / 6));
  // Atlas → mm: x = ax*380, y_lps = -az*380, z = (1.2 - ay)*520
  assert.equal(huAt(0, -149, 300), -1000, 'gövde dışı hava');
  assert.equal(huAt(-0.2 * 380, 0, (1.2 - 0.26) * 520), ORGAN_HU['lung-right'], 'sağ akciğer hastanın sağında (-x)');
  assert.equal(huAt(-0.14 * 380, -0.04 * 380, (1.2 - 0.56) * 520), ORGAN_HU.liver, 'karaciğer');
  assert.equal(huAt(0, 0.17 * 380, 300), 250, 'omurga iliği arkada');
  assert.ok(p.synthetic);
});
