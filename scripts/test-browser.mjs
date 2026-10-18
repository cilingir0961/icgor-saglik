// Tarayıcı test paketi (bağımlılıksız, Chromium + DevTools Protokolü).
// Cihaz profilleri: iPhone boyutu, Android boyutu, masaüstü. NOT: Bu ortamda yalnızca Chromium motoru
// vardır; "iPhone" profili ekran boyutu/dokunma/kullanıcı aracısı emülasyonudur, gerçek WebKit/Safari değildir.
//
// Kullanım: node scripts/test-browser.mjs [--update-baselines] [çıktı-klasörü]
// Çıktı: ekran görüntüleri, fark görüntüleri ve rapor.json

import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { serve, launchChrome, sleep, ROOT } from './lib/cdp.mjs';
import { comparePng } from './lib/png.mjs';
import { makeFakeVideo } from './make-fake-video.mjs';
import { writePhantomSeries } from './make-sample-dicom.mjs';

const args = process.argv.slice(2);
const UPDATE = args.includes('--update-baselines');
const OUT = resolve(args.find((a) => !a.startsWith('--')) ?? join(ROOT, '.cache/browser-test'));
const BASELINE = join(ROOT, 'test/visual/baseline');
const CACHE = join(ROOT, '.cache/test');
// Yazılım GPU'su (SwiftShader) deterministik çizer: değişmeyen kodda fark %0,00'dır. Bu yüzden eşik sıkıdır:
// kanal başına 4 birimden büyük fark "farklı piksel" sayılır, piksellerin en fazla %0,5'i farklı olabilir.
// Temel görüntüler bu ortamın Chromium sürümüne aittir; başka makinede ilk çalıştırmada --update-baselines gerekir.
const VISUAL_LIMIT = 0.005;
const VISUAL_CHANNEL = 4;

const DEVICES = {
  iphone: {
    width: 390, height: 844, dpr: 3, mobile: true, lod: 'low',
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
  },
  android: {
    width: 412, height: 915, dpr: 2.625, mobile: true, lod: 'low',
    userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36',
  },
  desktop: { width: 1280, height: 800, dpr: 1, mobile: false, lod: 'high' },
};

const results = [];
let base = '';

async function scenario(name, device, fn, browser) {
  const t0 = Date.now();
  const page = await browser.cdp.page(DEVICES[device]);
  const r = { name: `${device}/${name}`, ok: true, problems: [], metrics: {} };
  try {
    await fn(page, r, DEVICES[device]);
  } catch (e) {
    r.problems.push(`istisna: ${e.message}`);
  }
  const errs = page.errors.filter((e) => !/favicon/.test(e));
  if (errs.length) r.problems.push(...errs.map((e) => `konsol/CSP hatası: ${String(e).slice(0, 200)}`));
  r.ok = r.problems.length === 0;
  r.metrics.durationMs = Date.now() - t0;
  results.push(r);
  console.log(`${r.ok ? 'ok  ' : 'HATA'} ${r.name} (${(r.metrics.durationMs / 1000).toFixed(1)} s)${r.problems.map((p) => `\n     - ${p}`).join('')}`);
  await page.close();
}

async function shot(page, r, name, { visual = true } = {}) {
  const png = await page.screenshot();
  const file = `${r.name.replace('/', '-')}-${name}.png`;
  await writeFile(join(OUT, file), png);
  if (!visual) return;
  const basePath = join(BASELINE, file);
  if (UPDATE || !existsSync(basePath)) {
    await mkdir(BASELINE, { recursive: true });
    await writeFile(basePath, png);
    r.metrics[`visual:${name}`] = 'temel görüntü oluşturuldu';
    return;
  }
  const cmp = comparePng(await readFile(basePath), png, VISUAL_CHANNEL);
  r.metrics[`visual:${name}`] = `%${(cmp.diffRatio * 100).toFixed(2)} farklı piksel`;
  if (!cmp.sameSize || cmp.diffRatio > VISUAL_LIMIT) r.problems.push(`görsel regresyon (${name}): %${(cmp.diffRatio * 100).toFixed(2)} piksel farklı`);
}

const noOverflow = async (page, r) => {
  const o = await page.eval('document.documentElement.scrollWidth - innerWidth');
  if (o > 0) r.problems.push(`yatay taşma ${o}px`);
};

/** DOM'daki etiketlerin birbiriyle çakışıp çakışmadığını ölçer. */
const labelOverlaps = (page) => page.eval(`(()=>{const r=[...document.querySelectorAll('#anatomy-labels .label')].map(e=>e.getBoundingClientRect());let n=0;for(let i=0;i<r.length;i++)for(let j=i+1;j<r.length;j++){const a=r[i],b=r[j];if(a.left<b.right-1&&b.left<a.right-1&&a.top<b.bottom-1&&b.top<a.bottom-1)n++}return {count:r.length,overlaps:n}})()`);

async function openAnatomy(page, r, dev) {
  const t0 = Date.now();
  // Masaüstünde yüksek ayrıntı açıkça istenir (bu konteynerin az çekirdeği otomatik seçimi 'low'a düşürür);
  // mobil profillerde otomatik seçimin kullanıcı aracısından 'low' vermesi doğrulanır.
  await page.goto(`${base}/index.html${dev.mobile ? '' : '?lod=high'}#/anatomi`);
  await page.waitFor("document.body.dataset.anatomyReady==='true'", 90000);
  r.metrics.loadMs = Date.now() - t0;
  await sleep(600);
  const st = await page.eval('window.__icgor.viewer.stats');
  r.metrics.lod = st.lod;
  r.metrics.triangles = st.triangles;
  r.metrics.drawCalls = st.calls;
  if (st.lod !== dev.lod) r.problems.push(`LOD beklenen ${dev.lod}, gelen ${st.lod}`);
  if (!(st.triangles > 10000)) r.problems.push(`çok az üçgen çizildi: ${st.triangles}`);
}

// ---------------- Senaryolar ----------------

const anatomyOverview = async (page, r, dev) => {
  await openAnatomy(page, r, dev);
  await page.eval("document.getElementById('anatomy-hint').hidden = true");
  await sleep(300);
  const lab = await labelOverlaps(page);
  r.metrics.labels = lab.count;
  if (lab.count < 5) r.problems.push(`etiket sayısı az: ${lab.count}`);
  if (lab.overlaps) r.problems.push(`${lab.overlaps} etiket çakışması`);
  await noOverflow(page, r);
  // Kaba kare süresi (yazılım GPU'su; gerçek cihaz performansını temsil etmez, karşılaştırma içindir)
  r.metrics.renderMsSwiftShader = await page.eval(`(()=>{const v=window.__icgor.viewer;const t=performance.now();for(let i=0;i<10;i++)v.renderer.render(v.scene,v.camera);return +((performance.now()-t)/10).toFixed(1)})()`);
  await shot(page, r, 'genel');
};

const anatomyHeart = async (page, r, dev) => {
  await openAnatomy(page, r, dev);
  await page.eval("(()=>{const v=window.__icgor.viewer;v.setLayerVisible('skeleton',false);v.setLayerVisible('skin',false);document.getElementById('anatomy-hint').hidden=true})()");
  await page.waitFor("window.__icgor.viewer.labelAnchors().some(a=>a.id==='heart')");
  const [x, y] = await page.eval("(()=>{const v=window.__icgor.viewer;const a=v.labelAnchors().find(a=>a.id==='heart');const b=v.renderer.domElement.getBoundingClientRect();return [a.anchor[0]+b.left,a.anchor[1]+b.top]})()");
  if (dev.mobile) await page.tap(x, y); else await page.click(x, y);
  await sleep(700);
  const sel = await page.eval("({id: window.__icgor.viewer.selected, panel: !document.getElementById('detail-panel').hidden, name: document.getElementById('detail-name').textContent, loc: document.getElementById('detail-location').textContent.length})");
  if (sel.id !== 'heart' || !sel.panel || sel.name !== 'Kalp' || sel.loc < 20) r.problems.push(`kalp seçimi/paneli başarısız: ${JSON.stringify(sel)}`);
  await page.eval("document.getElementById('btn-detail-isolate').click()");
  await sleep(1200);
  if ((await page.eval('window.__icgor.viewer.isolated')) !== 'heart') r.problems.push('tek başına inceleme etkinleşmedi');
  // Panel açıkken seçili yapı görünür alanda mı? (ekran merkezi panelin üstünde kalmalı)
  const vis = await page.eval(`(()=>{const v=window.__icgor.viewer;const a=v.labelAnchors().find(a=>a.id==='heart');const p=document.getElementById('detail-panel').getBoundingClientRect();const b=v.renderer.domElement.getBoundingClientRect();return {y:a.anchor[1]+b.top, x:a.anchor[0]+b.left, panelTop:p.top, panelLeft:p.left}})()`);
  if (dev.mobile ? vis.y > vis.panelTop - 20 : vis.x > vis.panelLeft - 20) r.problems.push(`seçili organ panelin arkasında kalıyor: ${JSON.stringify(vis)}`);
  await page.eval("(()=>{const c=document.getElementById('chk-heart-sim');c.checked=true;c.dispatchEvent(new Event('change'))})()");
  await sleep(300);
  if (await page.eval("document.getElementById('sim-badge').hidden")) r.problems.push('SİMÜLASYON rozeti görünmüyor');
  const scale = await page.eval("window.__icgor.viewer.structures.get('heart').pivot.scale.x");
  r.metrics.heartScaleSample = +scale.toFixed(4);
  await page.eval("(()=>{const c=document.getElementById('chk-heart-sim');c.checked=false;c.dispatchEvent(new Event('change'))})()");
  await sleep(500);
  await shot(page, r, 'kalp');
};

const anatomyLayers = async (page, r, dev) => {
  await openAnatomy(page, r, dev);
  await page.eval("document.getElementById('btn-layers').click()");
  await sleep(200);
  await page.eval("document.querySelector('[data-layer=skeleton] input[type=checkbox]').click()");
  await page.eval("(()=>{const rg=document.querySelector('[data-layer=skin] input[type=range]');rg.value='0.6';rg.dispatchEvent(new Event('input'))})()");
  await sleep(400);
  const L = await page.eval("JSON.stringify(window.__icgor.viewer.layers)");
  const layers = JSON.parse(L);
  if (layers.skeleton.visible !== false) r.problems.push('iskelet katmanı gizlenemedi');
  if (Math.abs(layers.skin.opacity - 0.6) > 1e-6) r.problems.push('deri saydamlığı uygulanmadı');
  await page.eval("document.getElementById('btn-structures').click()");
  await sleep(300);
  const n = await page.eval("document.querySelectorAll('#structure-list .structure-item').length");
  if (n < 20) r.problems.push(`yapı listesi eksik: ${n}`);
  await page.eval("(()=>{const s=document.getElementById('structure-search');s.value='böbrek';s.dispatchEvent(new Event('input'))})()");
  const found = await page.eval("[...document.querySelectorAll('#structure-list .name')].map(e=>e.textContent)");
  if (found.length !== 2) r.problems.push(`arama sonucu beklenmedik: ${found}`);
  r.metrics.searchBobrek = found.join(', ');
  await noOverflow(page, r);
};

const aboutDialog = async (page, r) => {
  await page.goto(`${base}/index.html#/anatomi`);
  await page.waitFor("document.body.dataset.anatomyReady==='true'", 90000);
  await page.eval("document.getElementById('btn-about').click()");
  await page.waitFor("document.getElementById('about-sources').textContent.includes('BodyParts3D')");
  const txt = await page.eval("document.getElementById('about-sources').textContent");
  if (!/CC Attribution 4\.0|CC BY/.test(txt)) r.problems.push('lisans bilgisi eksik');
};

const imagingPhantom = async (page, r) => {
  await page.goto(`${base}/index.html#/goruntu?fantom`);
  await page.waitFor("document.body.dataset.imagingSource==='synthetic-phantom'", 30000);
  await sleep(500);
  const n = await page.eval("Number(document.getElementById('rng-slice').max)+1");
  r.metrics.slices = n;
  if (n < 50) r.problems.push(`kesit sayısı az: ${n}`);
  const chip = await page.eval("document.getElementById('imaging-source').textContent");
  if (!/Sentetik/.test(chip)) r.problems.push(`kaynak rozeti yanlış: ${chip}`);
  await noOverflow(page, r);
  await shot(page, r, 'fantom');
};

const imagingUpload = async (page, r, dev, files) => {
  await page.goto(`${base}/index.html#/goruntu`);
  await page.waitFor("document.body.dataset.screen==='imaging' && document.getElementById('sel-plane').options.length>0", 30000);
  await page.setFiles('#file-dicom', files);
  await page.waitFor("document.body.dataset.imagingSource==='dicom-file'", 30000);
  await sleep(300);
  const n = await page.eval("Number(document.getElementById('rng-slice').max)+1");
  if (n !== files.length) r.problems.push(`kesit sayısı ${n}, beklenen ${files.length}`);
  const warn = await page.eval("document.getElementById('dicom-warnings').textContent");
  if (warn) r.problems.push(`beklenmeyen uyarı: ${warn}`);
};

const legacy = async (page, r) => {
  for (const hash of ['', 'orbit', 'dicom-fantom']) {
    await page.goto(`${base}/legacy.html#${hash}`);
    await sleep(1500);
    const st = await page.eval("document.getElementById('status').textContent");
    if (!st) r.problems.push(`legacy #${hash}: durum metni yok`);
  }
};

const cameraDenied = async (page, r) => {
  // Kullanıcının "İzin verme" seçimini simüle et (sahte kamera bayrağı izin ayarını yok saydığı için).
  await page.send('Page.addScriptToEvaluateOnNewDocument', {
    source: "navigator.mediaDevices.getUserMedia = () => Promise.reject(new DOMException('Permission denied', 'NotAllowedError'));",
  });
  await page.goto(`${base}/index.html#/kamera`);
  await page.waitFor("!!document.getElementById('btn-cam-start')");
  await sleep(500);
  await page.eval("document.getElementById('btn-cam-start').click()");
  await page.waitFor("!document.getElementById('camera-denied').hidden", 15000);
  const title = await page.eval("document.getElementById('camera-denied-title').textContent");
  r.metrics.deniedTitle = title;
  if (!/izni verilmedi/.test(title)) r.problems.push(`izin reddi başlığı: ${title}`);
  await shot(page, r, 'izin-reddi');
};

const cameraAr = (truth) => async (page, r) => {
  await page.goto(`${base}/index.html#/kamera?baslat`);
  const t0 = Date.now();
  await page.waitFor("/etkin/.test(document.body.dataset.cameraStatus||'')", 60000);
  r.metrics.trackingReadyMs = Date.now() - t0;
  await sleep(2500);
  const res = await page.eval(`(async()=>{const {videoToDisplay}=await import('./src/camera/ar-fit.js');const v=document.getElementById('camera-video');const vp=document.getElementById('camera-viewport');const t=${JSON.stringify(truth)};const out={};let max=0;for(const k in t){const g=videoToDisplay(t[k],{width:v.videoWidth,height:v.videoHeight},{width:vp.clientWidth,height:vp.clientHeight},true);const d=window.__icgorAr.pts[k];out[k]=+Math.hypot(g[0]-d[0],g[1]-d[1]).toFixed(1);max=Math.max(max,out[k])}const sw=Math.hypot(...[0,1].map(i=>videoToDisplay(t.leftShoulder,{width:v.videoWidth,height:v.videoHeight},{width:vp.clientWidth,height:vp.clientHeight},true)[i]-videoToDisplay(t.rightShoulder,{width:v.videoWidth,height:v.videoHeight},{width:vp.clientWidth,height:vp.clientHeight},true)[i]));return {errPx:out,maxPx:max,maxPct:+(max/sw*100).toFixed(1),rms:+window.__icgorAr.fit.rms.toFixed(2),facing:window.__icgorAr.fit.facing}})()`);
  r.metrics.ar = res;
  if (res.maxPct > 15) r.problems.push(`AR nokta hatası yüksek: %${res.maxPct} omuz genişliği`);
  if (res.rms > 5) r.problems.push(`afin uydurma kalıntısı yüksek: ${res.rms}px`);
  if (!res.facing) r.problems.push('kişinin kameraya baktığı algılanmadı');
  await shot(page, r, 'ar', { visual: false });
};

// ---------------- Koşucu ----------------

async function main() {
  await mkdir(OUT, { recursive: true });
  await mkdir(CACHE, { recursive: true });
  const server = await serve();
  base = `http://127.0.0.1:${server.address().port}`;

  const video = join(CACHE, 'person-static.y4m');
  let truth;
  if (existsSync(video) && existsSync(video.replace('.y4m', '.truth.json'))) truth = JSON.parse(await readFile(video.replace('.y4m', '.truth.json'), 'utf8'));
  else truth = await makeFakeVideo(video, 3, 'static');
  const dicomFiles = await writePhantomSeries(join(CACHE, 'dicom'), 8);

  const browser = await launchChrome();
  try {
    for (const dev of Object.keys(DEVICES)) {
      await scenario('anatomi-genel', dev, anatomyOverview, browser);
      await scenario('anatomi-kalp', dev, anatomyHeart, browser);
      await scenario('anatomi-katmanlar', dev, anatomyLayers, browser);
      await scenario('goruntu-fantom', dev, imagingPhantom, browser);
      await scenario('kamera-izin-reddi', dev, cameraDenied, browser);
    }
    await scenario('hakkinda-lisans', 'iphone', aboutDialog, browser);
    await scenario('goruntu-dicom-yukleme', 'android', (p, r, d) => imagingUpload(p, r, d, dicomFiles), browser);
    await scenario('eski-sayfa', 'desktop', legacy, browser);
  } finally {
    browser.close();
  }

  const camBrowser = await launchChrome({ fakeVideo: video });
  try {
    for (const dev of ['iphone', 'desktop']) await scenario('kamera-ar', dev, cameraAr(truth), camBrowser);
  } finally {
    camBrowser.close();
    server.close();
  }

  const passed = results.filter((r) => r.ok).length;
  await writeFile(join(OUT, 'rapor.json'), JSON.stringify({ date: new Date().toISOString(), passed, total: results.length, results }, null, 2));
  console.log(`\n${passed}/${results.length} senaryo geçti. Çıktı: ${OUT}`);
  process.exit(passed === results.length ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
