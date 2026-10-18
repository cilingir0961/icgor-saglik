// Sentetik fantomu bir DICOM serisi olarak diske yazar (gerçek hasta verisi DEĞİL).
// Kullanım: node scripts/make-sample-dicom.mjs <klasör> [voksel-mm]
// Görüntüleyiciyi "DICOM aç" akışıyla, gerçek sağlık verisi olmadan denemek içindir.

import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { makePhantom } from '../src/dicom/phantom.js';
import { writeDicom } from './lib/dicom-writer.mjs';

export async function writePhantomSeries(dir, voxel = 4) {
  await mkdir(dir, { recursive: true });
  const p = makePhantom({ voxel });
  const n = p.nx * p.ny;
  const paths = [];
  for (let k = 0; k < p.nz; k++) {
    const px = new Int16Array(n);
    for (let i = 0; i < n; i++) px[i] = Math.round(p.data[k * n + i] + 1024);
    const buf = writeDicom({
      modality: 'CT', seriesDescription: 'SENTETIK FANTOM', seriesUID: '2.25.1234567890',
      instanceNumber: k + 1, rows: p.ny, columns: p.nx, pixels: px, intercept: -1024, slope: 1,
      position: [p.origin[0], p.origin[1], p.origin[2] + k * voxel], pixelSpacing: [voxel, voxel],
      sliceThickness: voxel,
    });
    const path = join(dir, `fantom-${String(k + 1).padStart(4, '0')}.dcm`);
    await writeFile(path, new Uint8Array(buf));
    paths.push(path);
  }
  return paths;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const dir = process.argv[2] ?? 'ornek-dicom';
  const paths = await writePhantomSeries(dir, Number(process.argv[3] ?? 4));
  console.log(`${paths.length} sentetik kesit yazıldı: ${dir}`);
}
