// Kalite A/B ölçümü: pişirilmiş ortam kapanması (AO, COLOR_0) ve kas clearcoat'u açık/kapalı.
// Aynı görüş, aynı cihaz profili; görüntüler + kare süresi (yazılım GPU'su: yalnızca göreli karşılaştırma).
// Kullanım: node scripts/ab-quality.mjs [çıktı-klasörü]
import { writeFile, mkdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { serve, launchChrome, sleep } from './lib/cdp.mjs';
import { decodePng } from './lib/png.mjs';

const OUT = resolve(process.argv[2] ?? '.cache/ab');
await mkdir(OUT, { recursive: true });
const server = await serve();
const browser = await launchChrome();
const base = `http://127.0.0.1:${server.address().port}`;
const page = await browser.cdp.page({ width: 900, height: 900 });
await page.goto(`${base}/index.html?lod=high&nosw#/anatomi`);
await page.waitFor("document.body.dataset.anatomyReady==='true'", 90000);
await page.eval("(async()=>{const v=window.__icgor.viewer;document.getElementById('anatomy-hint').hidden=true;document.getElementById('btn-labels').click();v.setLayerVisible('muscles',true);})()");
await page.waitFor('window.__icgor.viewer.layers.muscles.loaded===true', 60000);

/** Mod ayarla, görüşü kur, kare süresini ölç, görüntü al. */
async function capture(name, { ao, clearcoat, layers, view }) {
  await page.eval(`(()=>{const v=window.__icgor.viewer;
    for (const L of ['skin','muscles','skeleton','organs','vessels','nerves']) v.setLayerVisible(L, ${JSON.stringify(layers)}.includes(L));
    v.scene.traverse((o)=>{ if(!o.isMesh||!o.material) return; const ms=[].concat(o.material);
      for(const m of ms){ if(m.userData.ccBase===undefined) m.userData.ccBase=m.clearcoat??0;
        m.vertexColors = ${ao} && Boolean(o.geometry.attributes.color);
        if('clearcoat' in m) m.clearcoat = ${clearcoat} ? m.userData.ccBase : 0;
        m.needsUpdate = true; } });
    v.controls.target.set(${view.target}); v.camera.position.set(${view.pos}); v.controls.update(); v.requestRender();})()`);
  await page.waitFor('window.__icgor.viewer.layers.vessels.loaded!==false || true');
  await sleep(1500);
  const ms = await page.eval(`(()=>{const v=window.__icgor.viewer;v.renderer.render(v.scene,v.camera);const t=performance.now();for(let i=0;i<10;i++)v.renderer.render(v.scene,v.camera);return +((performance.now()-t)/10).toFixed(1)})()`);
  const png = await page.screenshot();
  await writeFile(join(OUT, `${name}.png`), png);
  return { name, ms, png };
}

/** Yerel kontrast: gri tonda 3x3 Laplace mutlak ortalaması (yalnızca model pikselleri). */
function localContrast(png) {
  const { w, h, rgb } = decodePng(png);
  const g = (x, y) => { const i = (y * w + x) * 3; return 0.299 * rgb[i] + 0.587 * rgb[i + 1] + 0.114 * rgb[i + 2]; };
  let s = 0, n = 0;
  for (let y = 1; y < h - 1; y += 2) for (let x = 1; x < w - 1; x += 2) {
    const c = g(x, y);
    if (c < 40) continue; // arka plan
    s += Math.abs(4 * c - g(x - 1, y) - g(x + 1, y) - g(x, y - 1) - g(x, y + 1)); n++;
  }
  return +(s / n).toFixed(2);
}

const torso = { target: '0, 1.15, 0', pos: '0, 1.2, 0.95' };
const organs = { target: '0, 1.15, 0', pos: '0.25, 1.2, 0.8' };
const results = [];
for (const [scene, layers, view] of [['kas', ['muscles'], torso], ['organ', ['organs', 'skeleton'], organs]]) {
  for (const [mode, ao, cc] of [['ao-acik', true, true], ['ao-kapali', false, true], ['clearcoat-kapali', true, false]]) {
    if (scene === 'organ' && mode === 'clearcoat-kapali') continue;
    const r = await capture(`${scene}-${mode}`, { ao, clearcoat: cc, layers, view });
    results.push({ name: r.name, renderMsSwiftShader: r.ms, localContrast: localContrast(r.png) });
  }
}
const sizes = await page.eval(`(()=>{let colorBytes=0,total=0;window.__icgor.viewer.scene.traverse(o=>{if(!o.isMesh)return;for(const a of Object.values(o.geometry.attributes)){total+=a.array.byteLength;if(a===o.geometry.attributes.color)colorBytes+=a.array.byteLength}});return {gpuAttributeMB:+(total/1048576).toFixed(1), aoColorMB:+(colorBytes/1048576).toFixed(2)}})()`);
await writeFile(join(OUT, 'ab.json'), JSON.stringify({ results, sizes }, null, 2));
console.log(JSON.stringify({ results, sizes }, null, 2));
browser.close(); server.close();
