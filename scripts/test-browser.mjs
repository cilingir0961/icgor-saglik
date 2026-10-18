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
  await page.goto(`${base}/index.html${dev.mobile ? '' : '?lod=high'}#/anatomi`);
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
    server.close();
  }

  const passed = results.filter((r) => r.ok).length;
  await writeFile(join(OUT, 'rapor.json'), JSON.stringify({ date: new Date().toISOString(), passed, total: results.length, results }, null, 2));
  console.log(`\n${passed}/${results.length} senaryo geçti. Çıktı: ${OUT}`);
  process.exit(passed === results.length ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
