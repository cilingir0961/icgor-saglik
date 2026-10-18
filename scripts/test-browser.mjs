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
import { makeScanVideo } from './make-scan-video.mjs';
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

const ONLY = args.find((a) => a.startsWith('--only='))?.slice(7);

async function scenario(name, device, fn, browser) {
  if (ONLY && !ONLY.split(',').some((o) => `${device}/${name}`.includes(o))) return;
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
  // v0.8: varsayılan mod Kaslar; bu senaryolar organ görünümünü test eder → mod açıkça seçilir
  await page.goto(`${base}/index.html${dev.mobile ? '' : '?lod=high'}#/anatomi?mod=organlar`);
  await page.waitFor("document.body.dataset.anatomyReady==='true'", 90000);
  r.metrics.loadMs = Date.now() - t0;
  await sleep(600);
  // renderer.info son çizimi yansıtır; ilk dolu karenin çizilmesini bekle
  await page.waitFor('window.__icgor.viewer.stats.triangles > 10000', 10000).catch(() => {});
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

const anatomyMuscles = async (page, r, dev) => {
  await openAnatomy(page, r, dev);
  await page.eval("document.getElementById('anatomy-hint').hidden = true");
  await page.eval("document.getElementById('btn-layers').click()");
  await sleep(200);
  const before = await page.eval("document.querySelector('[data-layer=muscles] .state')?.textContent ?? ''");
  const t0 = Date.now();
  await page.eval("document.querySelector('[data-layer=muscles] input[type=checkbox]').click()");
  await page.waitFor("window.__icgor.viewer.layers.muscles.loaded===true", 60000);
  r.metrics.muscleLazyLoadMs = Date.now() - t0;
  await sleep(300);
  const after = await page.eval("document.querySelector('[data-layer=muscles] .state')?.textContent ?? ''");
  r.metrics.layerState = `${before} → ${after}`;
  if (!/isteğe/.test(before) || !/yüklendi/.test(after)) r.problems.push(`katman durum metni: ${before} → ${after}`);
  // Deriyi gizle, kasları önden göster; kas grupları etiketlenmeli
  await page.eval("(()=>{window.__icgor.viewer.setLayerVisible('skin',false);document.getElementById('btn-layers').click()})()");
  await sleep(600);
  const st = await page.eval('(()=>{const v=window.__icgor.viewer;v.renderer.render(v.scene,v.camera);return v.stats})()');
  r.metrics.trianglesWithMuscles = st.triangles;
  r.metrics.drawCallsWithMuscles = st.calls;
  const ids = await page.eval("window.__icgor.viewer.labelAnchors().map(a=>a.id)");
  if (!ids.some((i) => i.startsWith('mus-'))) r.problems.push(`kas etiketi yok: ${ids}`);
  const lab = await labelOverlaps(page);
  if (lab.overlaps) r.problems.push(`${lab.overlaps} etiket çakışması`);
  const mem = await page.eval("({heapMB: performance.memory ? +(performance.memory.usedJSHeapSize/1048576).toFixed(1) : null, geometries: window.__icgor.viewer.renderer.info.memory.geometries, textures: window.__icgor.viewer.renderer.info.memory.textures})");
  Object.assign(r.metrics, mem);
  if (ids.includes('mus-back')) r.problems.push('önden bakışta sırt kasları etiketlendi (arka yüz)');
  await noOverflow(page, r);
  await shot(page, r, 'kaslar');
  // Arkadan bakış: sırt kasları etiketlenir, karın kasları (ön yüz) etiketlenmez
  await page.eval("document.querySelector('[data-view=back]').click()");
  await page.waitFor('!window.__icgor.viewer.tween', 15000);
  await sleep(300);
  const back = await page.eval("window.__icgor.viewer.labelAnchors().map(a=>a.id)");
  r.metrics.backLabels = back.join(',');
  if (!back.includes('mus-back') || back.includes('mus-abdomen')) r.problems.push(`arka görünüm etiketleri: ${back}`);
};

const anatomy4d = async (page, r, dev) => {
  await openAnatomy(page, r, dev);
  await page.eval("document.getElementById('anatomy-hint').hidden = true");
  await page.eval("document.getElementById('btn-anim').click()");
  await sleep(200);
  if (await page.eval("document.getElementById('anim-panel').hidden")) r.problems.push('4D paneli açılmadı');
  await page.eval("(()=>{for(const id of ['chk-anim-heart','chk-anim-breath']){const c=document.getElementById(id);c.checked=true;c.dispatchEvent(new Event('change'))}})()");
  // Kalp: kulakçık ve karıncık farklı evrelerde ölçeklenir; solunum akciğeri büyütür
  // Yazılım GPU'sunda kareler yavaş olduğundan zaman örnekleri belirlenimci alınır (fixedT + doğrudan tik).
  const samples = [];
  for (let i = 0; i < 12; i++) {
    samples.push(await page.eval(`(()=>{const v=window.__icgor.viewer;v.anim.fixedT=${(i * 0.37).toFixed(2)};v._tickAnimations(performance.now());const hp=v.heartParts;const sx=(m)=>new v.camera.position.constructor().setFromMatrixScale(m.matrix).x;return {a:sx(hp.atria[0]),v:sx(hp.ventricles[0]),lung:v.structures.get('lung-left').pivot.scale.y}})()`));
  }
  await page.eval("window.__icgor.viewer.anim.fixedT = undefined");
  const range = (k) => Math.max(...samples.map((x) => x[k])) - Math.min(...samples.map((x) => x[k]));
  r.metrics.heartAtriaRange = +range('a').toFixed(4);
  r.metrics.heartVentricleRange = +range('v').toFixed(4);
  r.metrics.lungRange = +range('lung').toFixed(4);
  if (!(range('a') > 0.005 && range('v') > 0.005)) r.problems.push(`kalp evreleri hareket etmiyor: ${JSON.stringify(samples.slice(0, 3))}`);
  if (!(range('lung') > 0.001)) r.problems.push('solunum akciğeri değiştirmiyor');
  const badge = await page.eval("({hidden: document.getElementById('sim-badge').hidden, text: document.getElementById('sim-badge-text').textContent})");
  r.metrics.badge = badge.text;
  if (badge.hidden || !/SİMÜLASYON/.test(badge.text) || !/gerçek ölçüm değil/.test(badge.text)) r.problems.push(`simülasyon rozeti: ${JSON.stringify(badge)}`);
  // Eklem hareketi: kol kaldırma → deri gizlenir, kol segmentleri döner
  await page.eval("document.querySelector('[data-motion=kol-kaldirma]').click()");
  await page.eval("(()=>{const v=window.__icgor.viewer;v.setAnimation({heart:false, breath:false, fixedT:1.0});v._tickAnimations(performance.now());v.requestRender()})()");
  await sleep(800);
  const m = await page.eval("(()=>{const v=window.__icgor.viewer;const seg=v.segmentMeshes.find(x=>x.userData.segment==='upperArm-L');const e=seg?seg.matrix.elements:null;return {skin:v.effectiveOpacity([...v.structures.values()].find(s=>s.layer==='skin')), segs:v.segmentMeshes.length, rotated: e? Math.abs(e[1])+Math.abs(e[4]) : 0, motion:v.anim.motion}})()");
  r.metrics.motion = m;
  if (m.motion !== 'kol-kaldirma') r.problems.push('hareket seçilmedi');
  if (m.skin > 0.01) r.problems.push(`hareket sırasında deri gizlenmedi (${m.skin})`);
  if (!(m.segs > 0 && m.rotated > 0.3)) r.problems.push(`kol segmenti dönmedi: ${JSON.stringify(m)}`);
  await page.eval("document.getElementById('anim-panel').hidden = true");
  await sleep(300);
  await shot(page, r, 'kol-kaldirma');
  // Sıfırla: animasyonlar kapanır
  await page.eval("document.getElementById('btn-reset').click()");
  await sleep(400);
  const off = await page.eval("window.__icgor.viewer.animating");
  if (off) r.problems.push('sıfırla animasyonları durdurmadı');
};

const aboutDialog = async (page, r) => {
  await page.goto(`${base}/index.html#/anatomi`);
  await page.waitFor("document.body.dataset.anatomyReady==='true'", 90000);
  await page.eval("document.getElementById('btn-about').click()");
  await page.waitFor("document.getElementById('about-sources').textContent.includes('BodyParts3D')");
  const txt = await page.eval("document.getElementById('about-sources').textContent");
  if (!/CC Attribution 4\.0|CC BY/.test(txt)) r.problems.push('lisans bilgisi eksik');
  if (!/Z-Anatomy/.test(txt) || !/CC BY-SA 4\.0/.test(txt)) r.problems.push('Z-Anatomy (CC BY-SA) atfı eksik');
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

const cameraLimbs = (truth, model = 'lite') => async (page, r) => {
  await page.goto(`${base}/index.html?model=${model}#/kamera?baslat`);
  await page.waitFor("/etkin/.test(document.body.dataset.cameraStatus||'')", 60000);
  await page.waitFor("(window.__icgorAr?.limbs?.length ?? 0) >= 4", 20000).catch(() => {});
  await sleep(2500);
  const res = await page.eval(`(async()=>{const {videoToDisplay}=await import('./src/camera/ar-fit.js');const v=document.getElementById('camera-video');const vp=document.getElementById('camera-viewport');const t=${JSON.stringify(truth)};const map=(p)=>videoToDisplay(p,{width:v.videoWidth,height:v.videoHeight},{width:vp.clientWidth,height:vp.clientHeight},true);const sw=Math.hypot(map(t.leftShoulder)[0]-map(t.rightShoulder)[0],map(t.leftShoulder)[1]-map(t.rightShoulder)[1]);const err={};for(const k of ['leftElbow','leftWrist','rightElbow','rightWrist']){const g=map(t[k]);const d=window.__icgorAr.pts[k];err[k]=+(Math.hypot(g[0]-d[0],g[1]-d[1])/sw*100).toFixed(1)}const ang={};for(const k in t.pose){const p=window.__icgorAr.pose[k];ang[k]=p?+((p.plane-t.pose[k])*180/Math.PI).toFixed(1):null}return {pointErrPctShoulder:err, angleErrDeg:ang, limbs:window.__icgorAr.limbs, detectMs:window.__icgorAr.detectMs}})()`);
  r.metrics.limbs = res;
  for (const [k, e] of Object.entries(res.angleErrDeg)) {
    if (e === null) r.problems.push(`${k} uzuv açısı üretilmedi`);
    else if (Math.abs(e) > 15) r.problems.push(`${k} açı hatası ${e}°`);
  }
  for (const [k, e] of Object.entries(res.pointErrPctShoulder)) if (e > 25) r.problems.push(`${k} nokta hatası %${e} omuz genişliği`);
  await shot(page, r, 'uzuv', { visual: false });
  // İskelet katmanı: kol segmentleri takip edilen kollarla birlikte dönmeli
  await page.eval("document.querySelector('[data-cam-layer=skeleton]').click()");
  await sleep(3500);
  await shot(page, r, 'uzuv-iskelet', { visual: false });
};

// ---------------- Kişisel tarama ----------------

const STORE_KEY = 'icgor.kisisel.v1';
const seed = (page, state) => page.eval(`localStorage.setItem('${STORE_KEY}', ${JSON.stringify(JSON.stringify(state))})`);
const baseState = (extra = {}) => ({ consent: { version: 1, date: '2026-10-18', understood: true, store: true }, profile: { heightCm: 172, weightKg: 70, age: 40 }, scans: [], settings: { voice: true, mode: 'helper' }, ...extra });

const scanFlow = async (page, r) => {
  await page.goto(`${base}/index.html?nosw&kare=6#/tarama`);
  await page.waitFor("document.body.dataset.scanState==='home'", 30000);
  // Onay ve profil arayüz üzerinden
  await page.eval("document.getElementById('btn-scan-posture').click()");
  await page.waitFor("document.body.dataset.scanState==='consent'");
  await page.eval("document.getElementById('btn-consent-ok').click()");
  if (await page.eval("document.getElementById('consent-err').hidden")) r.problems.push('onaysız devam edilebildi');
  await page.eval("(()=>{for(const id of ['c-understand','c-device','c-store'])document.getElementById(id).checked=true;document.getElementById('btn-consent-ok').click()})()");
  await page.waitFor("document.body.dataset.scanState==='profile'");
  await page.eval("(()=>{document.getElementById('p-height').value='172';document.getElementById('p-weight').value='70';document.getElementById('btn-profile-save').click()})()");
  const t0 = Date.now();
  await page.waitFor("document.body.dataset.scanState==='report'", 420000);
  r.metrics.scanSeconds = Math.round((Date.now() - t0) / 1000);
  const scan = await page.eval(`JSON.parse(localStorage.getItem('${STORE_KEY}')).scans.at(-1)`);
  const raw = await page.eval(`localStorage.getItem('${STORE_KEY}').length`);
  r.metrics.storedBytes = raw;
  if (/data:image|base64/.test(await page.eval(`localStorage.getItem('${STORE_KEY}')`))) r.problems.push('depoda görüntü verisi var');
  for (const v of ['front', 'side', 'back']) if (!scan.captures[v]) r.problems.push(`${v} çekimi yok`);
  // Nötr sentetik figür: önden/arkadan "ayırt edilebilir" yanlış bulgu olmamalı
  const flagged = Object.entries(scan.captures).flatMap(([v, c]) => Object.entries(c.metrics).filter(([, m]) => m.distinguishable).map(([k]) => `${v}.${k}`));
  r.metrics.flagged = flagged.join(',') || 'yok';
  if (flagged.length) r.problems.push(`nötr figürde yanlış bulgu: ${flagged}`);
  const hf = scan.captures.side?.metrics.headForwardCm;
  r.metrics.headForwardCm = hf ? `${hf.value} ± ${hf.u}` : null;
  if (!hf || hf.value == null) r.problems.push('baş-öne ölçülemedi');
  const B = scan.body;
  r.metrics.body = B ? Object.fromEntries(Object.entries(B.levels).map(([k, L]) => [k, L.circCm])) : null;
  r.metrics.twin = B?.twin;
  if (!B || Object.values(B.levels).some((L) => !L.circCm)) r.problems.push('siluet ölçüleri eksik');
  if (!(B?.twin?.sx > 0.8 && B?.twin?.sx < 1.0)) r.problems.push(`ikiz genişlik çarpanı beklenmedik (kas figürü deriden dar olmalı): ${B?.twin?.sx}`);
  const voice = await page.eval('window.__icgorScan.voice.map((v) => v.text)');
  r.metrics.voiceLines = voice.length;
  for (const must of ['Şimdi yan dönün', 'arkanızı kameraya', 'kollarınızı yanlara', 'Tarama tamamlandı']) if (!voice.some((t) => t.includes(must))) r.problems.push(`sesli yönerge eksik: ${must}`);
  const rep = await page.eval("({sections: document.querySelectorAll('.report .rep-sec').length, diagrams: document.querySelectorAll('.posture-diagram').length, exp: document.querySelectorAll('.report .tag.exp').length, care: /sağlık profesyoneline/.test(document.querySelector('.report').textContent), cannot: /ıtık, skolyoz/.test(document.querySelector('.report').textContent)})");
  r.metrics.report = rep;
  if (rep.diagrams !== 3 || !rep.care || !rep.cannot) r.problems.push(`rapor eksik: ${JSON.stringify(rep)}`);
  await noOverflow(page, r);
  await shot(page, r, 'rapor', { visual: false });
  await page.eval("window.scrollTo(0,0);document.getElementById('btn-show-twin').click()");
  await page.waitFor("document.body.dataset.screen==='anatomy' && document.body.dataset.anatomyReady==='true' && !!document.getElementById('twin-chip')", 60000);
  await sleep(1500);
  const sc = await page.eval('window.__icgor.viewer.root.scale.toArray()');
  r.metrics.twinScale = sc.map((x) => +x.toFixed(3));
  if (Math.abs(sc[0] - B.twin.sx * sc[1]) > 0.01) r.problems.push('ikiz ölçeği uygulanmadı');
  await shot(page, r, 'ikiz', { visual: false });
};

const scanCompare = async (page, r) => {
  await page.goto(`${base}/index.html?nosw#/tarama`);
  const cond = { view: 'front', model: 'full', level: 'unknown', heightFrac: 0.7, width: 480, height: 640 };
  const m = (v) => ({ tr: 'Omuz seviyesi', unit: '°', value: v, u: 1.2, grade: 'iyi', neutral: 0, experimental: false, topic: 'shoulder-level', distinguishable: Math.abs(v) > 2.4 });
  const side = (facing, v) => ({ conditions: { ...cond, view: 'side', facing }, frames: 6, metrics: { headForwardCm: { tr: 'Başın öne konumu (kulak–omuz)', unit: 'cm', value: v, u: 1, neutral: null, grade: 'iyi', topic: 'head-forward' } } });
  const d = (n) => new Date(Date.UTC(2026, 9, 18) - n * 86400000).toISOString();
  await seed(page, baseState({ scans: [
    { id: 'a', date: d(34), model: 'full', profile: { heightCm: 172 }, captures: { front: { conditions: cond, frames: 6, metrics: { shoulderLevel: m(5) } }, side: side('right', 6) }, movements: {} },
    { id: 'b', date: d(0), model: 'full', profile: { heightCm: 172 }, captures: { front: { conditions: cond, frames: 6, metrics: { shoulderLevel: m(0.5) } }, side: side('left', 4) }, movements: {} },
  ] }));
  await page.goto(`${base}/index.html?nosw#/tarama`);
  await page.waitFor("document.body.dataset.scanState==='home'", 30000);
  await page.eval("document.getElementById('btn-scan-history').click()");
  await page.waitFor("document.body.dataset.scanState==='history'");
  await page.eval("document.querySelector('.history .linklike').click()");
  await page.waitFor("document.body.dataset.scanState==='report'");
  const txt = await page.eval("document.getElementById('rep-compare').textContent");
  r.metrics.compare = txt.slice(0, 300);
  if (!/30 gün/.test(txt) || !/Olası değişim: -4,5°/.test(txt)) r.problems.push('30 günlük olası değişim gösterilmedi');
  if (!/karşılaştırılamaz — farklı bakış yönü/.test(txt)) r.problems.push('farklı bakış yönü engellenmedi (sahte ilerleme riski)');
  if (!/90 gün: bu aralıkta/.test(txt)) r.problems.push('90 gün boş penceresi belirtilmedi');
  await shot(page, r, 'karsilastirma', { visual: false });
};

const scanSafety = async (page, r) => {
  await page.goto(`${base}/index.html?nosw#/tarama`);
  await seed(page, baseState());
  await page.goto(`${base}/index.html?nosw#/tarama`);
  await page.waitFor("document.body.dataset.scanState==='home'", 30000);
  await page.eval("document.getElementById('btn-scan-moves').click()");
  await page.waitFor("document.body.dataset.scanState==='moves'");
  await page.eval("document.querySelector('[data-test=\"tek-ayak\"]').click()");
  await page.waitFor("document.body.dataset.scanState==='safety'");
  await page.eval("document.getElementById('btn-move-start').click()");
  if (!/tüm soruları/.test(await page.eval("document.getElementById('safety-err').textContent"))) r.problems.push('yanıtsız sorularla başlatılabildi');
  await page.eval("(()=>{document.querySelector('input[name=sq0][value=evet]').click();document.querySelector('input[name=sq1][value=hayir]').click();document.querySelector('input[name=sq2][value=hayir]').click();document.getElementById('btn-move-start').click()})()");
  const st = await page.eval("({msg: document.getElementById('safety-err').textContent, disabled: document.getElementById('btn-move-start').disabled, blocked: window.__icgorScan.blocked, state: document.body.dataset.scanState})");
  r.metrics.safety = st;
  if (!st.disabled || st.blocked !== 'tek-ayak' || !/önermiyoruz/.test(st.msg) || st.state !== 'safety') r.problems.push(`denge testi engellenmedi: ${JSON.stringify(st)}`);
  await shot(page, r, 'guvenlik', { visual: false });
};

const scanData = async (page, r) => {
  await page.goto(`${base}/index.html?nosw#/tarama`);
  await page.eval(`localStorage.removeItem('${STORE_KEY}')`);
  await page.goto(`${base}/index.html?nosw#/tarama`);
  await page.waitFor("document.body.dataset.scanState==='home'", 30000);
  await page.eval("document.getElementById('btn-scan-posture').click()");
  await page.waitFor("document.body.dataset.scanState==='consent'");
  // Saklama izni VERMEDEN onay
  await page.eval("(()=>{for(const id of ['c-understand','c-device'])document.getElementById(id).checked=true;document.getElementById('btn-consent-ok').click()})()");
  await page.waitFor("document.body.dataset.scanState==='profile'");
  await page.eval("(()=>{document.getElementById('p-height').value='180';document.getElementById('btn-profile-save').click()})()");
  await sleep(300);
  if (await page.eval(`localStorage.getItem('${STORE_KEY}')`) !== null) r.problems.push('saklama izni yokken veri yazıldı');
  // İzinli durumda tümünü sil
  await seed(page, baseState({ scans: [{ id: 'x', date: new Date().toISOString(), captures: {}, movements: {} }] }));
  await page.goto(`${base}/index.html?nosw&yeniden=1#/tarama`); // farklı adres: sayfa gerçekten yeniden yüklensin
  await page.waitFor("document.body.dataset.scanState==='home'", 30000);
  await page.eval("window.confirm = () => true; document.getElementById('btn-scan-data').click()");
  await page.waitFor("document.body.dataset.scanState==='data'");
  const txt = await page.eval("document.getElementById('scan-data').textContent");
  if (!/1 tarama/.test(txt)) r.problems.push('veri özeti yanlış');
  await page.eval("document.getElementById('btn-data-delete').click()");
  await sleep(300);
  if (await page.eval(`localStorage.getItem('${STORE_KEY}')`) !== null) r.problems.push('tümünü sil sonrası veri kaldı');
  if (await page.eval('document.body.dataset.scanState') !== 'home') r.problems.push('silme sonrası ana sayfaya dönülmedi');
};

const scanMovement = async (page, r) => {
  await page.goto(`${base}/index.html?nosw#/tarama`);
  await seed(page, baseState());
  await page.goto(`${base}/index.html?nosw&sure=3#/tarama`);
  await page.waitFor("document.body.dataset.scanState==='home'", 30000);
  await page.eval("document.getElementById('btn-scan-moves').click()");
  await page.waitFor("document.body.dataset.scanState==='moves'");
  await page.eval("document.querySelector('[data-test=\"kol-kaldirma\"]').click()");
  await page.waitFor("document.body.dataset.scanState==='safety'");
  await page.eval("document.getElementById('btn-move-start').click()");
  await page.waitFor("document.body.dataset.scanState==='after'", 240000);
  await page.eval("document.getElementById('btn-discomfort-yes').click()");
  await page.waitFor("document.body.dataset.scanState==='report'");
  const mv = await page.eval(`JSON.parse(localStorage.getItem('${STORE_KEY}')).scans.at(-1).movements['kol-kaldirma']`);
  r.metrics.movement = { reps: mv.reps, L: mv.metrics.abductionL.value, R: mv.metrics.abductionR.value, samples: mv.samples };
  if (!(mv.reps.L >= 1 && mv.reps.R >= 1)) r.problems.push('tekrar algılanmadı');
  if (!(mv.metrics.abductionL.value > mv.metrics.abductionR.value)) r.problems.push('sol kol (daha yüksek kaldırıldı) sağdan büyük ölçülmedi');
  if (!/rahatsızlık bildirdiniz/.test(await page.eval("document.querySelector('.report').textContent"))) r.problems.push('rahatsızlık uyarısı gösterilmedi');
  await shot(page, r, 'hareket-rapor', { visual: false });
};

// ---------------- v0.6: kişisel asistan ekranları ----------------

const today = async (page, r) => {
  await page.goto(`${base}/index.html?nosw#/bugun`);
  await page.eval(`localStorage.removeItem('${STORE_KEY}')`);
  await page.goto(`${base}/index.html?nosw&t=1#/bugun`);
  await page.waitFor("document.getElementById('today-workout') !== null", 30000);
  for (const id of ['today-workout', 'today-steps', 'today-habits', 'today-ai']) if (!(await page.eval(`!!document.getElementById('${id}')`))) r.problems.push(`${id} yok`);
  if (!/5\.000/.test(await page.eval("document.getElementById('today-steps').textContent"))) r.problems.push('veri yokken ılımlı başlangıç hedefi (5.000) gösterilmedi');
  await page.eval("document.getElementById('btn-steps-500').click()");
  await sleep(200);
  if (!/500/.test(await page.eval("document.getElementById('today-steps').textContent"))) r.problems.push('+500 adım eklenmedi');
  await page.eval(`localStorage.removeItem('${STORE_KEY}')`); // görsel karşılaştırma için sabit durum
  await page.goto(`${base}/index.html?nosw&t=2#/bugun`);
  await page.waitFor("document.getElementById('today-workout') !== null", 30000);
  await page.eval("document.querySelector('#today-page h2').textContent = 'Bugün'"); // tarih her gün değişir
  await sleep(300);
  await noOverflow(page, r);
  await shot(page, r, 'bugun');
};

const trainerFlow = async (page, r) => {
  await page.goto(`${base}/index.html?nosw#/antrenman`);
  await page.eval(`localStorage.removeItem('${STORE_KEY}')`);
  await page.goto(`${base}/index.html?nosw&t=1#/antrenman`);
  await page.waitFor("document.body.dataset.trainerState==='consent'", 30000);
  await page.eval("(()=>{document.getElementById('ac-understand').checked=true;document.getElementById('ac-store').checked=true;document.getElementById('btn-app-consent').click()})()");
  await page.waitFor("document.body.dataset.trainerState==='onboarding'");
  // Yanıtsız sağlık sorularıyla plan oluşturulamaz
  await page.eval("document.getElementById('btn-plan-create').click()");
  if (await page.eval('document.getElementById("tr-err").hidden')) r.problems.push('yanıtsız ön sorularla plan oluşturuldu');
  await page.eval(`(()=>{const q=(s)=>document.querySelector(s);q('#tr-age').value='35';q('#tr-height').value='175';q('#tr-weight').value='90';
    q('[data-group="Süre"] [data-value="20"]').click();q('[data-group="Gün"] [data-value="3"]').click();
    for(const i of document.querySelectorAll('input[value="hayir"]'))i.click();q('#btn-plan-create').click()})()`);
  await page.waitFor("document.body.dataset.trainerState==='overview'");
  const plan = await page.eval(`JSON.parse(localStorage.getItem('${STORE_KEY}')).trainer.plan`);
  r.metrics.plan = { sessions: plan.sessions.length, minutes: plan.sessions.map((x) => x.estMinutes) };
  if (plan.sessions.length !== 3) r.problems.push(`haftada 3 gün yerine ${plan.sessions.length} oturum`);
  if (plan.sessions.some((x) => x.estMinutes > 21)) r.problems.push('oturum süresi bütçeyi aştı');
  await shot(page, r, 'plan', { visual: false });
  await page.goto(`${base}/index.html?nosw&t=1#/antrenman?oturum=0`);
  await page.waitFor("document.body.dataset.trainerState==='session'");
  const first = await page.eval("document.querySelectorAll('[data-ex]')[1].dataset.ex");
  await page.eval("document.querySelectorAll('[data-ex]')[0].querySelector('[data-act=done]').click()");
  await page.eval("document.querySelectorAll('[data-ex]')[1].querySelector('[data-act=replace]').click()");
  await sleep(200);
  const after = await page.eval("document.querySelectorAll('[data-ex]')[1].dataset.ex");
  if (after === first) r.problems.push('"Değiştir" egzersizi değiştirmedi');
  if (!(await page.eval("document.querySelectorAll('[data-ex]')[0].querySelector('[data-act=done]').getAttribute('aria-pressed')==='true'"))) r.problems.push('tamamlandı işaretlenmedi');
  await page.eval("for(const el of document.querySelectorAll('[data-w]')) el.style.width = el.dataset.w + '%'");
  await noOverflow(page, r);
  await shot(page, r, 'oturum', { visual: false });
  // Geri bildirim: diz ağrısı → yük artmaz, diz zorlayan hareketler plandan çıkar
  await page.eval("document.getElementById('btn-session-finish').click()");
  await page.waitFor("document.body.dataset.trainerState==='feedback'");
  await page.eval("(()=>{document.querySelector('[data-group=his] [data-value=kolay]').click();document.querySelector('[data-group=agri] [data-value=diz]').click();document.getElementById('btn-feedback-save').click()})()");
  await page.waitFor("document.body.dataset.trainerState==='result'");
  const st = await page.eval(`JSON.parse(localStorage.getItem('${STORE_KEY}'))`);
  r.metrics.afterPain = { limitations: st.profile.limitations, progress: st.trainer.progress };
  if (!st.profile.limitations.includes('diz')) r.problems.push('ağrı bölgesi kısıtlara eklenmedi');
  if (Object.values(st.trainer.progress).some((v) => (v.step ?? v) > 0)) r.problems.push('ağrı bildirilmesine rağmen yük artırıldı');
  // Göğüs ağrısı → acil yönlendirme (112)
  await page.goto(`${base}/index.html?nosw&t=1#/antrenman?oturum=1`);
  await page.waitFor("document.body.dataset.trainerState==='session'");
  await page.eval("document.getElementById('btn-session-finish').click()");
  await page.waitFor("document.body.dataset.trainerState==='feedback'");
  await page.eval("(()=>{document.getElementById('fb-chest').checked=true;document.getElementById('btn-feedback-save').click()})()");
  await page.waitFor("document.body.dataset.trainerState==='result'");
  if (!(await page.eval("!!document.querySelector('#trainer-result a[href=\"tel:112\"]')"))) r.problems.push('göğüs ağrısında 112 yönlendirmesi yok');
  await shot(page, r, 'acil', { visual: false });
};

const assistantDemo = async (page, r) => {
  await page.goto(`${base}/index.html?nosw#/asistan`);
  await seed(page, baseState({ activity: { goalMode: 'auto', goal: null, days: {}, habits: {} }, chat: { messages: [], share: {}, keepHistory: true } }));
  await page.goto(`${base}/index.html?nosw&t=1#/asistan`);
  await page.waitFor("document.getElementById('ai-badge') !== null", 30000);
  const badge = await page.eval("document.getElementById('ai-badge').textContent");
  if (!/Demo/.test(badge)) r.problems.push(`anahtarsız sunucuda demo rozeti yok: ${badge}`);
  if (!/Hiçbir kişisel bilgi/.test(await page.eval("document.getElementById('share-preview').textContent"))) r.problems.push('varsayılan paylaşım kapalı değil');
  const ask = async (q) => {
    const n = await page.eval("document.querySelectorAll('.msg.assistant').length");
    await page.eval(`(()=>{const i=document.getElementById('chat-input');i.value=${JSON.stringify(q)};document.getElementById('btn-chat-send').click()})()`);
    await page.waitFor(`document.querySelectorAll('.msg.assistant').length > ${n}`, 15000);
    return page.eval("(()=>{const m=[...document.querySelectorAll('.msg.assistant')].at(-1);return {text:m.textContent, provider:m.dataset.provider}})()");
  };
  const a1 = await ask('Evde ekipmansız 20 dakikalık program hazırla');
  r.metrics.a1 = { provider: a1.provider, len: a1.text.length };
  if (a1.provider !== 'mock' || !/dk|dakika/.test(a1.text)) r.problems.push(`program yanıtı beklenmedik: ${a1.provider}`);
  if (await page.eval('window.__icgorAssistant.sent.at(-1).context') !== null) r.problems.push('izin verilmeden bağlam gönderildi');
  // Profil paylaşımı aç → önizleme ve gönderilen bağlam aynı kategoriyi içerir
  await page.eval("document.getElementById('share-profile').click()");
  await sleep(150);
  if (!/Profil: 40 yaş, 172 cm, 70 kg/.test(await page.eval("document.getElementById('share-preview').textContent"))) r.problems.push('profil önizlemesi yanlış');
  await ask('Nereden başlamalıyım?');
  const ctx = await page.eval('window.__icgorAssistant.sent.at(-1).context');
  if (!ctx?.profile || ctx.posture || ctx.activity) r.problems.push(`gönderilen bağlam seçimle uyuşmuyor: ${JSON.stringify(ctx)}`);
  const a3 = await ask('Göğsümde ağrı var ve nefes alamıyorum');
  if (a3.provider !== 'guvenlik' || !/112/.test(a3.text)) r.problems.push('acil mesajda 112 güvenlik yanıtı yok');
  await noOverflow(page, r);
  await shot(page, r, 'asistan', { visual: false });
  // Geçmişi sakla kapalı → depoya mesaj yazılmaz
  await page.eval("document.getElementById('chat-keep').click()");
  await ask('Uyku düzenim için ne önerirsin?');
  const stored = await page.eval(`JSON.parse(localStorage.getItem('${STORE_KEY}')).chat.messages.length`);
  if (stored !== 0) r.problems.push(`geçmiş saklama kapalıyken ${stored} mesaj depoda`);
};

const assistantOffline = async (page, r) => {
  await page.goto(`${base}/index.html?nosw#/bugun`);
  await page.waitFor("document.getElementById('today-workout') !== null", 30000);
  // Sunucu yok (statik barındırma/çevrimdışı) benzetimi: tüm ağ istekleri başarısız
  await page.eval("window.fetch = () => Promise.reject(new TypeError('ağ yok'))");
  await page.eval("location.hash = '#/asistan?q=' + encodeURIComponent('Bugün 4000 adım attım, hedefimi nasıl artırabilirim?')");
  await page.waitFor("document.querySelectorAll('.msg.assistant').length > 0", 20000);
  const m = await page.eval("(()=>{const m=document.querySelector('.msg.assistant');return {text:m.textContent, provider:m.dataset.provider, badge:document.getElementById('ai-badge').textContent}})()");
  r.metrics.offline = { provider: m.provider, badge: m.badge };
  if (m.provider !== 'cihaz' || !/cihaz içi/.test(m.badge) || !/adım/.test(m.text)) r.problems.push(`çevrimdışı demo çalışmadı: ${JSON.stringify(m).slice(0, 200)}`);
};

const activityScreen = async (page, r) => {
  await page.goto(`${base}/index.html?nosw#/aktivite`);
  await seed(page, baseState());
  await page.goto(`${base}/index.html?nosw&t=1#/aktivite`);
  await page.waitFor("document.getElementById('step-chart') !== null", 30000);
  await page.eval("document.getElementById('btn-demo-add').click()");
  await sleep(200);
  const s = await page.eval("({banner: !!document.getElementById('demo-banner'), bars: document.querySelectorAll('#step-chart .bar.demo').length, hk: document.querySelector('[data-source=healthkit]').textContent, basis: document.getElementById('goal-basis').textContent})");
  r.metrics.activity = s;
  if (!s.banner || s.bars < 5) r.problems.push('demo veri etiketlenmedi');
  if (!/kullanılamaz/.test(s.hk)) r.problems.push('HealthKit kullanılamaz olarak gösterilmedi');
  if (!/ortanca/.test(s.basis)) r.problems.push('uyarlanır hedef gerekçesi yok');
  await page.eval("(()=>{document.getElementById('steps-input').value='6400';document.getElementById('btn-steps-save').click()})()");
  await sleep(150);
  if (!/6\.400/.test(await page.eval("document.getElementById('steps-today').textContent"))) r.problems.push('elle adım girişi kaydedilmedi');
  await page.eval("document.getElementById('btn-demo-remove').click()");
  await sleep(150);
  const left = await page.eval(`Object.values(JSON.parse(localStorage.getItem('${STORE_KEY}')).activity.days).map(d=>d.source)`);
  if (left.includes('demo') || !left.includes('manuel')) r.problems.push(`demo kaldırma hatalı: ${left}`);
  await noOverflow(page, r);
  await shot(page, r, 'aktivite', { visual: false });
};

const notifyFlow = async (page, r) => {
  await page.goto(`${base}/index.html#/bildirimler`); // SW açık (bildirim SW üzerinden gösterilir)
  await seed(page, baseState());
  await page.send('Browser.grantPermissions', { permissions: ['notifications'], origin: base }).catch((e) => r.problems.push(`izin verilemedi: ${e.message}`));
  await page.goto(`${base}/index.html?t=1#/bildirimler`);
  await page.waitFor("document.getElementById('notify-permission') !== null", 30000);
  const before = await page.eval(`JSON.parse(localStorage.getItem('${STORE_KEY}')).notify`);
  if (before?.enabled) r.problems.push('kullanıcı açmadan hatırlatmalar açık');
  const perm = await page.eval('Notification.permission');
  r.metrics.permission = perm;
  if (perm === 'granted') {
    await page.eval("document.getElementById('notify-enabled').click()");
    await sleep(200);
    await page.eval("document.getElementById('btn-notify-test').click()");
    await page.waitFor("document.getElementById('notify-test-res').textContent.length > 0", 10000);
    r.metrics.testResult = await page.eval("document.getElementById('notify-test-res').textContent");
    if (!/gönderildi/.test(r.metrics.testResult)) r.problems.push(`deneme bildirimi gösterilemedi: ${r.metrics.testResult}`);
    r.metrics.next = await page.eval("document.getElementById('notify-next')?.textContent ?? null");
    if (!r.metrics.next) r.problems.push('sıradaki hatırlatma gösterilmedi');
    await page.eval("document.getElementById('btn-notify-off').click()");
    await sleep(150);
    if (await page.eval(`JSON.parse(localStorage.getItem('${STORE_KEY}')).notify.enabled`)) r.problems.push('"Tümünü kapat" çalışmadı');
  }
  await noOverflow(page, r);
  await shot(page, r, 'bildirim', { visual: false });
};

const notifyDenied = async (page, r) => {
  await page.goto(`${base}/index.html?nosw#/bildirimler`);
  await page.send('Browser.setPermission', { permission: { name: 'notifications' }, setting: 'denied', origin: base }).catch(() => {});
  await page.goto(`${base}/index.html?nosw&t=1#/bildirimler`);
  await page.waitFor("document.getElementById('notify-perm') !== null", 30000);
  const t = await page.eval("({perm: Notification.permission, text: document.getElementById('notify-perm').textContent, disabled: document.getElementById('notify-enabled').disabled})");
  r.metrics.denied = t;
  if (t.perm === 'denied' && (!/reddedilmiş/.test(t.text) || !t.disabled)) r.problems.push('izin reddinde hatırlatma açılabiliyor');
};

const progressData = async (page, r) => {
  const now = Date.now(), D = 86400000;
  const key = (d) => { const x = new Date(now - d * D); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`; };
  const days = Object.fromEntries(Array.from({ length: 60 }, (_, i) => [key(i), { steps: 6000 + ((i * 37) % 11) * 150, source: 'manuel' }]));
  await page.goto(`${base}/index.html?nosw#/gelisim`);
  await seed(page, baseState({
    activity: { goalMode: 'auto', goal: null, days, habits: {} },
    trainer: { plan: null, progress: {}, paused: false, history: [{ date: new Date(now - D).toISOString(), done: 5, total: 6, feedback: { feeling: 'uygun', pain: [] } }],
      coachLog: [{ date: '2026-09-01', kind: 'squat', tr: 'Squat', reliable: true, extreme: { value: 100, u: 6.5 } }, { date: '2026-10-01', kind: 'squat', tr: 'Squat', reliable: true, extreme: { value: 94, u: 6.5 } }] },
    chat: { messages: [{ role: 'user', content: 'x' }], share: { profile: true }, keepHistory: true },
  }));
  await page.goto(`${base}/index.html?nosw&t=1#/gelisim`);
  await page.waitFor("document.getElementById('pg-steps') !== null", 30000);
  const p = await page.eval("({steps:[...document.querySelectorAll('[data-period]')].map(e=>e.dataset.status), coach: document.querySelector('#pg-coach [data-status]')?.dataset.status})");
  r.metrics.progress = p;
  if (p.steps[0] !== 'belirsiz') r.problems.push(`sabit adım düzeyi "belirsiz" değil: ${p.steps}`);
  if (p.coach !== 'belirsiz') r.problems.push('MDC içindeki koç farkı iyileşme gibi gösterildi');
  await noOverflow(page, r);
  await shot(page, r, 'gelisim', { visual: false });
  await page.goto(`${base}/index.html?nosw&t=1#/verilerim`);
  await page.waitFor("document.getElementById('data-summary') !== null", 30000);
  await page.eval("window.confirm = () => true; document.getElementById('btn-ai-share-off').click()");
  await sleep(150);
  await page.eval("document.getElementById('btn-del-chat').click()");
  await sleep(150);
  const st = await page.eval(`JSON.parse(localStorage.getItem('${STORE_KEY}')).chat`);
  if (Object.values(st.share).some(Boolean) || st.messages.length) r.problems.push('AI paylaşımı/sohbet silme çalışmadı');
  await noOverflow(page, r);
  await shot(page, r, 'verilerim', { visual: false });
};

const coachCamera = async (page, r) => {
  await page.goto(`${base}/index.html?nosw#/antrenman`);
  await page.eval(`localStorage.removeItem('${STORE_KEY}')`);
  await page.waitFor("document.body.dataset.screen==='trainer'", 30000);
  await page.eval(`import('./src/fitness/coach-ui.js').then(m => m.openCoach({ exercise: { tr: 'Kol kaldırma', camera: 'arm-raise', dose: { reps: 3 } }, onClose: (x) => { window.__coachResult = x; } }))`);
  await page.waitFor("document.getElementById('btn-coach-start') !== null");
  await page.eval("document.getElementById('btn-coach-start').click()");
  await page.waitFor("window.__icgorCoach.state==='running'", 90000);
  await page.waitFor('window.__icgorCoach.reps >= 3', 120000).catch(() => r.problems.push(`3 tekrar sayılmadı (sayılan ${'?'})`));
  r.metrics.liveReps = await page.eval('window.__icgorCoach.reps');
  await shot(page, r, 'koc-canli', { visual: false });
  await page.eval("document.getElementById('btn-coach-finish').click()");
  await page.waitFor("window.__icgorCoach.state==='summary'");
  const s = await page.eval('window.__icgorCoach.summary');
  r.metrics.summary = { reps: s.reps, reliable: s.reliable, reasons: s.reasons, coverage: s.coverage, fps: s.fps, obs: s.observations };
  // Sahte video: 2 kol birlikte, tekrar 4 s. Güvenilir sayıldıysa tempo gerçeğe yakın olmalı
  const lead = s.sides ? (s.sides.L.reps >= s.sides.R.reps ? s.sides.L : s.sides.R) : null;
  if (s.reliable && Math.abs(lead.duration.value - 4) > 1.5) r.problems.push(`güvenilir denilen ölçümde tekrar süresi ${lead.duration.value} s (gerçek 4 s)`);
  if (s.reliable && !s.observations.length) r.problems.push('güvenilir ölçümde gözlem yok');
  if (!s.reliable && s.observations.length) r.problems.push('güvenilmez ölçümde açı/tempo gözlemi gösterildi');
  if (s.observations.some((o) => /yanlış|hatalı|düzeltin/i.test(o))) r.problems.push('koç düzeltme/hüküm cümlesi kurdu');
  await shot(page, r, 'koc-ozet', { visual: false });
  await page.eval("document.getElementById('btn-coach-save').click()");
  if (!(await page.eval('window.__coachResult?.reps >= 1'))) r.problems.push('sonuç geri dönmedi');
  if (await page.eval("!!document.getElementById('coach-layer')")) r.problems.push('katman kapanmadı');
};

// ---------------- v0.7: Bana Anlat ----------------

/** Ölçülmüş gibi kaydedilmiş tarama (test verisi; uygulama akışıyla aynı biçim). */
function insightScan(date, { armL = 152, armR = 128, trunk = 3.6, neckL = 30, neckR = 18 } = {}) {
  const c = (view) => ({ view, model: 'full', heightFrac: 0.8, level: 'known', facing: view === 'side' ? 'right' : null, mode: 'helper' });
  const pm = (tr, value, u, sense) => ({ tr, unit: '°', value, u, grade: 'iyi', experimental: false, neutral: 0, distinguishable: Math.abs(value) > 2 * u, sense });
  const m = (tr, value, u) => ({ tr, unit: '°', value, u, grade: 'iyi', experimental: false });
  const L = m('Sol kol kaldırma açısı (en yüksek)', armL, 3), R = m('Sağ kol kaldırma açısı (en yüksek)', armR, 3);
  return {
    id: `t${date}`, date: `2026-${date}T10:00:00.000Z`, model: 'full', profile: { heightCm: 172 },
    captures: { front: { conditions: c('front'), frames: 30, metrics: {
      shoulderLevel: pm('Omuz seviyesi', 0.6, 1.2, 'sol omuz daha yüksek'),
      trunkLateral: pm('Gövdenin yana eğilimi', trunk, 1.3, 'gövde kişinin soluna eğik'),
      headTilt: pm('Başın yana eğimi', 0.5, 1.5, 'baş sağa eğik'),
    } } },
    movements: {
      boyun: { tr: 'Baş ve boyun hareket açıklığı', conditions: c('front'), reps: {}, samples: 200, metrics: {
        latFlexL: m('Başı sola yatırma', neckL, 2), latFlexR: m('Başı sağa yatırma', neckR, 2),
        latAsym: { tr: 'Sağ–sol fark (yana yatırma)', unit: '°', value: neckL - neckR, u: 2.8, grade: 'iyi', experimental: false },
      } },
      'kol-kaldirma': { tr: 'Kolları yandan kaldırma', conditions: c('front'), reps: { L: 3, R: 3 }, samples: 120, metrics: {
      abductionL: L, abductionR: R, abductionAsym: { tr: 'Sağ–sol fark (kol kaldırma)', unit: '°', value: armL - armR, u: 4.2, grade: 'iyi', experimental: false },
    } } },
  };
}
const insightState = () => baseState({ scans: [insightScan('10-04'), insightScan('10-17', { trunk: 0.4 })], trainer: { plan: null, progress: {}, history: [], paused: false }, activity: { goalMode: 'auto', goal: null, days: {}, habits: {} } });

const insightScreen = async (page, r) => {
  await page.goto(`${base}/index.html?nosw#/anlat`);
  await seed(page, insightState());
  await page.goto(`${base}/index.html?nosw&t=1#/anlat`);
  await page.waitFor("document.getElementById('insight-regions') !== null", 30000);
  const st = await page.eval('window.__icgorInsight.regions');
  r.metrics.regions = st;
  // Kol kaldırma farkı yalnızca sentetik doğrulandı (deneysel) → iki taramada sürse bile en fazla sarı
  const want = { 'bas-boyun': 'turuncu', 'omuz-L': 'sari', 'omuz-R': 'sari', govde: 'yesil', 'diz-L': 'gri', denge: 'gri' };
  for (const [k, v] of Object.entries(want)) if (st[k] !== v) r.problems.push(`${k}: ${st[k]} (beklenen ${v})`);
  const sm = await page.eval("document.getElementById('insight-summary').textContent");
  if (!/3 ölçümün 3'ü yeterli görüntü kalitesiyle/.test(sm)) r.problems.push(`özet kalite cümlesi yanlış: ${sm.slice(0, 160)}`);
  const forbidden = (await page.eval('document.body.innerText')).match(/hastalık riski|teşhis edildi|risk puanı|fıtığınız|skolyozunuz|kas yırtığınız var/i);
  if (forbidden) r.problems.push(`yasak ifade: ${forbidden[0]}`);
  await noOverflow(page, r);
  await shot(page, r, 'ekran');
  // Sağ omuz (deneysel kol ölçümü): somut cümle + deneysel uyarısı; turuncu değil
  await page.eval("document.querySelector('.mark[data-region=\"omuz-R\"]').dispatchEvent(new MouseEvent('click', {bubbles:true}))");
  await page.waitFor("document.getElementById('insight-dialog').open");
  const sh = await page.eval("document.getElementById('insight-card').textContent");
  if (!/Sağ kolunu kaldırırken sol koluna göre 24° daha az hareket ölçüldü \(sağ 128°, sol 152°; fark ± 4,2°\)/.test(sh)) r.problems.push('omuz kartında somut cümle yok');
  if (!/deneysel/i.test(sh)) r.problems.push('omuz kartında deneysel uyarısı yok');
  if (/Birden fazla ölçümde süren fark/.test(sh)) r.problems.push('deneysel gösterge turuncu gösterildi');
  await shot(page, r, 'kart-omuz', { visual: false });
  await page.eval("document.getElementById('insight-dialog').close()");
  // Turuncu baş-boyun → kart: hangi harekette kaç derece, neden kesin sorun değil, ne yapabilirim
  await page.eval("document.querySelector('.mark[data-region=\"bas-boyun\"]').dispatchEvent(new MouseEvent('click', {bubbles:true}))");
  await page.waitFor("document.getElementById('insight-dialog').open");
  const card = await page.eval("document.getElementById('insight-card').textContent"); // kapalı bölümler dahil
  r.metrics.cardExcerpt = card.slice(0, 400);
  for (const re of [/Başını sağa yatırırken sola yatırmaya göre 12° daha az hareket ölçüldü/, /sağ 18°, sol 30°/, /± 2,8°/, /sağlık sorunu olduğunu göstermez/, /Bu ne demek\?/, /Ne yapabilirim\?/, /2 ayrı ölçümde aynı yönde/]) {
    if (!re.test(card)) r.problems.push(`kartta yok: ${re}`);
  }
  await page.eval("document.getElementById('btn-insight-reco').click()");
  const reco = await page.eval("[...document.querySelectorAll('#insight-reco [data-ex]')].map(e => e.dataset.ex)");
  r.metrics.reco = reco;
  if (!reco.length || reco.includes('bant-acma')) r.problems.push(`öneriler süzülmedi (bandı olmayana bant): ${reco}`);
  await shot(page, r, 'kart', { visual: false });
  // Belirti bildirimi → öneri kilitlenir
  await page.eval("document.getElementById('insight-symptom').click()");
  if (!(await page.eval("!!document.getElementById('insight-blocked')"))) r.problems.push('ağrı/uyuşma işaretlenince öneri kilitlenmedi');
  // Sesli anlatım: yalnızca cihaz içi Türkçe ses; yoksa anlaşılır hata (başsız Chromium'da Türkçe ses yok)
  await page.eval("document.getElementById('btn-insight-speak').click()");
  r.metrics.speak = await page.eval("document.getElementById('insight-speak-err').textContent || document.getElementById('btn-insight-speak').textContent");
  await page.eval("document.getElementById('insight-dialog').close()");
  await page.eval("document.getElementById('btn-large-text').click()");
  if (!(await page.eval("document.body.classList.contains('large-text')"))) r.problems.push('büyük yazı uygulanmadı');
  await noOverflow(page, r);
  await page.eval("document.getElementById('btn-large-text').click()");
};

const insightEmpty = async (page, r) => {
  await page.goto(`${base}/index.html?nosw#/anlat`);
  await seed(page, baseState());
  await page.goto(`${base}/index.html?nosw&t=1#/anlat`);
  await page.waitFor("document.getElementById('insight-regions') !== null", 30000);
  const st = await page.eval('window.__icgorInsight.regions');
  if (Object.values(st).some((v) => v !== 'gri')) r.problems.push(`veri yokken gri olmayan bölge: ${JSON.stringify(st)}`);
  if (!/Henüz tarama yok/.test(await page.eval("document.getElementById('insight-summary').textContent"))) r.problems.push('boş durum metni yok');
  await page.goto(`${base}/index.html?nosw&t=2#/bugun`);
  await page.waitFor("document.getElementById('today-insight') !== null", 30000);
  if (!/Taramaya başla/.test(await page.eval("document.getElementById('today-insight').textContent"))) r.problems.push('Bugün kartı veri yokken taramaya yönlendirmiyor');
};

const insight3d = async (page, r, dev) => {
  await page.goto(`${base}/index.html?nosw#/bugun`);
  await seed(page, insightState());
  await page.goto(`${base}/index.html?nosw&t=3#/bugun`);
  await page.waitFor("document.getElementById('today-insight') !== null", 30000);
  if (!/Baş ve boyun/.test(await page.eval("document.getElementById('today-insight').textContent"))) r.problems.push('Bugün kartında dikkat çeken bölge yok');
  await page.eval("location.hash = '#/anatomi?anlat=omuz-R'");
  await page.waitFor("document.body.dataset.anatomyReady==='true'", 90000);
  await page.waitFor("document.querySelectorAll('#insight-markers .imark').length === 8", 20000);
  await page.waitFor("document.getElementById('insight-dialog').open", 10000);
  await sleep(800);
  const m = await page.eval("[...document.querySelectorAll('#insight-markers .imark')].map(b => ({id: b.dataset.region, cls: b.className, hidden: b.hidden, r: b.getBoundingClientRect().toJSON()}))");
  r.metrics.markers = m.map((x) => `${x.id}:${x.cls.split(' ')[1]}`);
  const vp = await page.eval("document.getElementById('anatomy-viewport').getBoundingClientRect().toJSON()");
  for (const x of m) if (x.hidden || x.r.x < vp.x - 30 || x.r.x > vp.x + vp.width) r.problems.push(`işaret görünür alan dışında: ${x.id}`);
  const sh = { L: m.find((x) => x.id === 'omuz-L').r, R: m.find((x) => x.id === 'omuz-R').r };
  if (!(sh.R.x < sh.L.x)) r.problems.push('önden bakışta sağ omuz işareti ekranın solunda değil');
  if (!/Sağ omuz/.test(await page.eval("document.getElementById('insight-card-title').textContent"))) r.problems.push('3B işaretten kart açılmadı');
  await shot(page, r, 'kart-3b', { visual: false });
  await page.eval("document.getElementById('insight-dialog').close()");
  await sleep(300);
  await shot(page, r, 'isaretler', { visual: false });
  await page.eval("document.getElementById('btn-insight').click()");
  if (!(await page.eval("document.getElementById('insight-markers').hidden"))) r.problems.push('Bana Anlat kapatılamadı');
};

// ---------------- v0.8: 3B anatomi modları ve kas ayrıntısı ----------------
const anatomyModes = async (page, r, dev) => {
  await page.goto(`${base}/index.html?nosw${dev.mobile ? '' : '&lod=high'}#/anatomi`);
  await page.waitFor("document.body.dataset.anatomyReady==='true'", 90000);
  await page.waitFor("document.body.dataset.anatomyMode==='kaslar' && window.__icgor.viewer.layers.muscles.loaded===true", 60000);
  const L = await page.eval("(()=>{const l=window.__icgor.viewer.layers;return {m:l.muscles.visible,o:l.organs.visible,s:l.skin.visible}})()");
  if (!L.m || L.o || L.s) r.problems.push(`Kaslar modu katmanları yanlış: ${JSON.stringify(L)}`);
  if (await page.eval("document.body.dataset.theme") !== 'dark') r.problems.push('3B ekran koyu temada değil');
  await sleep(900);
  await noOverflow(page, r);
  await shot(page, r, 'kaslar');
  // Kas seçimi → ayrıntı sayfası: günlük dil, egzersizler sekmesi, Bana Anlat bağlantısı
  await page.eval("window.__icgor.viewer.select('mus-hip-thigh')");
  await page.waitFor("!document.getElementById('detail-panel').hidden");
  const plain = await page.eval("document.getElementById('detail-plain-text').textContent");
  if (!/ayağa kalkmanın/.test(plain)) r.problems.push('kas açıklaması (günlük dil) yok');
  await page.eval("document.getElementById('tab-egzersiz').click()");
  await page.waitFor("document.querySelectorAll('#detail-ex-list li').length > 0", 10000);
  const ex = await page.eval("[...document.querySelectorAll('#detail-ex-list li strong')].map(e=>e.textContent)");
  r.metrics.exercises = ex;
  if (!ex.some((x) => /Sandalyeden oturup kalkma|Kalça köprüsü/.test(x))) r.problems.push(`kalça-uyluk egzersizleri yanlış: ${ex}`);
  if (!/ölçümün yok|görülmedi|Tekrar|Birden/.test(await page.eval("document.getElementById('detail-insight-status').textContent"))) r.problems.push('Bana Anlat durumu yok');
  await shot(page, r, 'kas-detay', { visual: false });
  await page.eval("document.querySelector('[data-close=\"detail-panel\"]').click()");
  // Mod değişimi
  await page.eval("document.querySelector('[data-mode=organlar]').click()");
  await sleep(300);
  if (!(await page.eval("window.__icgor.viewer.layers.organs.visible && !window.__icgor.viewer.layers.muscles.visible"))) r.problems.push('Organlar modu çalışmadı');
  await page.eval("document.querySelector('[data-mode=anlat]').click()");
  await page.waitFor("document.querySelectorAll('#insight-markers .imark').length === 8", 20000).catch(() => r.problems.push('Bana Anlat modu işaretleri yok'));
  await page.eval("document.querySelector('[data-mode=kaslar]').click()");
  await sleep(200);
  if (!(await page.eval("document.getElementById('insight-markers').hidden"))) r.problems.push('Bana Anlat modundan çıkınca işaretler kaldı');
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
      await scenario('anatomi-kaslar', dev, anatomyMuscles, browser);
      await scenario('anatomi-4d', dev, anatomy4d, browser);
      await scenario('goruntu-fantom', dev, imagingPhantom, browser);
      await scenario('kamera-izin-reddi', dev, cameraDenied, browser);
      await scenario('bugun', dev, today, browser);
      await scenario('anatomi-modlar', dev, anatomyModes, browser);
    }
    await scenario('antrenman-akisi', 'iphone', trainerFlow, browser);
    await scenario('asistan-demo', 'iphone', assistantDemo, browser);
    await scenario('asistan-demo', 'desktop', assistantDemo, browser);
    await scenario('asistan-cevrimdisi', 'android', assistantOffline, browser);
    await scenario('aktivite', 'android', activityScreen, browser);
    await scenario('bildirim-izin', 'android', notifyFlow, browser);
    await scenario('bildirim-ret', 'iphone', notifyDenied, browser);
    await scenario('gelisim-verilerim', 'iphone', progressData, browser);
    await scenario('bana-anlat', 'iphone', insightScreen, browser);
    await scenario('bana-anlat', 'desktop', insightScreen, browser);
    await scenario('bana-anlat-bos', 'android', insightEmpty, browser);
    await scenario('bana-anlat-3b', 'iphone', insight3d, browser);
    await scenario('bana-anlat-3b', 'desktop', insight3d, browser);
    await scenario('hakkinda-lisans', 'iphone', aboutDialog, browser);
    await scenario('tarama-karsilastirma', 'iphone', scanCompare, browser);
    await scenario('tarama-guvenlik', 'iphone', scanSafety, browser);
    await scenario('tarama-veri', 'android', scanData, browser);
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
  }

  // Kolları kaldırılmış figür: uzuv takibi (dirsek/bilek açıları yer gerçeğiyle karşılaştırılır)
  const armsVideo = join(CACHE, 'person-arms.y4m');
  const armsTruth = existsSync(armsVideo.replace('.y4m', '.truth.json'))
    ? JSON.parse(await readFile(armsVideo.replace('.y4m', '.truth.json'), 'utf8'))
    : await makeFakeVideo(armsVideo, 3, 'arms');
  const armsBrowser = await launchChrome({ fakeVideo: armsVideo });
  try {
    for (const dev of ['iphone', 'desktop']) await scenario('kamera-uzuv', dev, cameraLimbs(armsTruth), armsBrowser);
    await scenario('kamera-uzuv-full', 'iphone', cameraLimbs(armsTruth, 'full'), armsBrowser);
  } finally {
    armsBrowser.close();
  }

  // Kişisel tarama: dört adımlı sahte video (önden, yandan, arkadan, kollar açık) ve yavaş kol kaldırma
  for (const [kind, sc, name] of [['tarama', scanFlow, 'tarama-akisi'], ['kol', scanMovement, 'tarama-hareket'], ['koc', coachCamera, 'kamera-kocu']]) {
    if (ONLY && !ONLY.split(',').some((o) => `iphone/${name}`.includes(o))) continue;
    const v = join(CACHE, `scan-${kind}.y4m`);
    if (!existsSync(v)) await makeScanVideo(kind, v);
    const b = await launchChrome({ fakeVideo: v });
    try { await scenario(name, 'iphone', sc, b); } finally { b.close(); }
  }
  server.close();

  const passed = results.filter((r) => r.ok).length;
  await writeFile(join(OUT, 'rapor.json'), JSON.stringify({ date: new Date().toISOString(), passed, total: results.length, results }, null, 2));
  console.log(`\n${passed}/${results.length} senaryo geçti. Çıktı: ${OUT}`);
  process.exit(passed === results.length ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
