// Atlas deri modelinin göğüs/bel/kalça kesitleri (dijital ikiz referansı). Çıktı: src/analysis/atlas-silhouette.js
// Kesitler, siluet ölçüsüyle aynı düzey tanımıyla (manifest eklemleri) alınır; değerler boy başına (cm/m).
// Deri tek parça yüzeydir: kesitte gövde ve gövdeye yaslı kollar ayrı kapalı halkalardır; en büyük halka gövdedir.
import { writeFile } from 'node:fs/promises';
import { serve, launchChrome } from './lib/cdp.mjs';

const server = await serve();
const browser = await launchChrome();
try {
  const page = await browser.cdp.page({ width: 320, height: 240 });
  await page.goto(`http://127.0.0.1:${server.address().port}/test/fixtures/bench.html?nomp=1&layers=skin&w=320&h=240`);
  await page.waitFor("document.body.dataset.ready==='true'", 60000);
  const r = await page.eval('window.run({ sections: true, loops: true })');
  const m = JSON.parse(await (await fetch(`http://127.0.0.1:${server.address().port}/assets/anatomy/manifest.json`)).text());
  const H = m.bodyHeight;
  const ref = Object.fromEntries(Object.entries(r.truth.sections).map(([k, s]) => [k, {
    width: +(s.width * 100 / H).toFixed(2), depth: +(s.depth * 100 / H).toFixed(2), perimeter: +(s.perimeter * 100 / H).toFixed(2),
  }]));
  const src = `// OTOMATİK ÜRETİLDİ: node scripts/atlas-silhouette.mjs — elle düzenlemeyin.
// Atlas deri modelinin (BodyParts3D, boy ${(H * 100).toFixed(1)} cm) kesitleri, vücut boyunun metresi başına cm.
// Dijital ikiz çarpanı = kişinin ölçüsü / (bu değer × kişinin boyu, m). Atlas tek bir referans vücuttur, norm değildir.
export const ATLAS_HEIGHT_CM = ${(H * 100).toFixed(1)};
export const ATLAS_SILHOUETTE = ${JSON.stringify(ref, null, 2)};
`;
  await writeFile('src/analysis/atlas-silhouette.js', src);
  console.log(src);
} finally { browser.close(); server.close(); }
