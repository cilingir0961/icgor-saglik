// Arayüz görselleri: projenin LİSANSLI 3B atlasından (BodyParts3D CC BY 4.0, Z-Anatomy CC BY-SA 4.0)
// saydam arka planlı WebP renderlar üretir → assets/ui/. Fotoğraf veya üçüncü taraf görsel kullanılmaz.
// Türev oldukları için CC BY-SA 4.0; atıf assets/ui/LICENSE.md. Egzersiz pozları basitleştirilmiş SİMÜLASYONdur.
// Kullanım: node scripts/render-ui-assets.mjs
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { serve, launchChrome, sleep, ROOT } from './lib/cdp.mjs';

const OUT = join(ROOT, 'assets/ui');
const W = 720, H = 1280;
/** id, görünüm, yakınlık (kamera mesafesi), hedef yükseklik, vurgulanan kaslar, hareket + an (saniye; animations.js) */
const SHOTS = [
  { id: 'body-front', view: 'front', dist: 3.05, y: 0.88, w: 720, h: 1280 },
  { id: 'body-back', view: 'back', dist: 3.05, y: 0.88, w: 720, h: 1280 },
  { id: 'region-omuz', view: 'front', dist: 0.95, y: 1.33, x: -0.12, hl: ['mus-shoulder-arm'], w: 640, h: 640 },
  { id: 'region-boyun', view: 'front', dist: 0.8, y: 1.5, hl: ['mus-head-neck'], w: 640, h: 640 },
  { id: 'region-govde', view: 'front', dist: 1.2, y: 1.15, hl: ['mus-abdomen', 'mus-chest'], w: 640, h: 640 },
  { id: 'region-sirt', view: 'back', dist: 1.2, y: 1.2, hl: ['mus-back'], w: 640, h: 640 },
  { id: 'region-kalca', view: 'back', dist: 1.1, y: 0.9, hl: ['mus-hip-thigh'], w: 640, h: 640 },
  { id: 'region-diz', view: 'front', dist: 1.0, y: 0.5, hl: ['mus-hip-thigh', 'mus-leg-foot'], w: 640, h: 640 },
  { id: 'region-denge', view: 'front', dist: 1.0, y: 0.25, hl: ['mus-leg-foot'], w: 640, h: 640 },
  // Egzersiz pozları (rig hareketleri; SİMÜLASYON). Squat bilerek yok: rig kalçayı sabit tuttuğu için bacaklar
  // havada katlanıyor (doğal görünmüyor) → squat kartlarında bacak kası vurgusu kullanılır.
  { id: 'ex-kol-kaldirma', view: 'front', dist: 2.9, y: 0.95, motion: 'kol-kaldirma', t: 2.0, hl: ['mus-shoulder-arm'], w: 640, h: 640 },
  { id: 'ex-yurume', view: 'right', dist: 2.9, y: 0.9, motion: 'yurume', t: 0.3, hl: ['mus-hip-thigh', 'mus-leg-foot'], w: 640, h: 640 },
  // Kas grubu vurguları (egzersiz kartları için)
  { id: 'mg-bacak', view: 'front', dist: 3.0, y: 0.88, hl: ['mus-hip-thigh', 'mus-leg-foot'], w: 480, h: 720 },
  { id: 'mg-gogus', view: 'front', dist: 3.0, y: 0.88, hl: ['mus-chest', 'mus-shoulder-arm'], w: 480, h: 720 },
  { id: 'mg-sirt', view: 'back', dist: 3.0, y: 0.88, hl: ['mus-back'], w: 480, h: 720 },
  { id: 'mg-karin', view: 'front', dist: 3.0, y: 0.88, hl: ['mus-abdomen'], w: 480, h: 720 },
  { id: 'mg-omuz', view: 'front', dist: 3.0, y: 0.88, hl: ['mus-shoulder-arm', 'mus-forearm-hand'], w: 480, h: 720 },
  { id: 'mg-kalca', view: 'back', dist: 3.0, y: 0.88, hl: ['mus-hip-thigh'], w: 480, h: 720 },
  { id: 'mg-boyun', view: 'front', dist: 3.0, y: 0.88, hl: ['mus-head-neck'], w: 480, h: 720 },
];

await mkdir(OUT, { recursive: true });
const server = await serve();
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await launchChrome();
try {
  for (const S of SHOTS) {
    const page = await browser.cdp.page({ width: S.w, height: S.h, dpr: 1 });
    await page.send('Emulation.setDefaultBackgroundColorOverride', { color: { r: 0, g: 0, b: 0, a: 0 } });
    await page.goto(`${base}/index.html?nosw&lod=high#/anatomi`);
    await page.waitFor("document.body.dataset.anatomyReady==='true'", 120000);
    // Yalnızca tuval: arayüz gizlenir, arka plan saydam. CSP satır içi <style>'ı engeller (gevşetilmez) →
    // öğe stilleri CSSOM ile ayarlanır.
    await page.eval(`(()=>{
      for (const el of document.querySelectorAll('.appbar,.tabbar,.float-tools,.chip,.sim-badge,#anatomy-labels,#anatomy-lines,.view-switch,#anatomy-hint,#insight-markers,.panel,dialog,#twin-chip')) el.style.display='none';
      for (const el of [document.documentElement, document.body, document.getElementById('anatomy-viewport')]) el.style.background='transparent';
      document.body.style.display='block';
      const m=document.querySelector('main.screens'); Object.assign(m.style,{position:'fixed',inset:'0'});
      window.dispatchEvent(new Event('resize'));
    })()`);
    await sleep(300);
    await page.eval(`(async()=>{const v=window.__icgor.viewer;
      v.setLayerVisible('muscles',true); v.setLayerOpacity('muscles',1); v.setLayerVisible('skin',false);
      v.setLayerVisible('organs',false); v.setLayerVisible('vessels',false); v.setLayerVisible('nerves',false); v.setLayerVisible('skeleton',true);
    })()`);
    await page.waitFor('window.__icgor.viewer.layers.muscles.loaded===true', 60000);
    await page.eval(`(()=>{const v=window.__icgor.viewer;
      const dirs={front:[0,0,1],back:[0,0,-1],right:[-1,0,0],left:[1,0,0]}; const d=dirs[${JSON.stringify(S.view)}];
      v.resize?.();
      const tx=${S.x ?? 0}, ty=${S.y}, D=${S.dist};
      v.tween=null; v.controls.target.set(tx,ty,0); v.camera.position.set(tx+d[0]*D, ty+0.04, d[2]*D); v.controls.update();
      ${S.motion ? `v.setAnimation({motion:${JSON.stringify(S.motion)}, fixedT:${S.t}});` : ''}
      const hl=new Set(${JSON.stringify(S.hl ?? [])});
      // Vurgu: hedef kas grubu elektrik mavisi; diğer kaslar hafif soldurulur (kontrast). Yalnızca bu renderda.
      const grey={r:0.62,g:0.6,b:0.62};
      for (const s of v.structures.values()) for (const m of s.materials) {
        if (!m.color) continue;
        if (hl.size && s.layer==='muscles') {
          if (hl.has(s.id)) { m.color.setRGB(0.22,0.55,1.0); if (m.emissive) { m.emissive.setRGB(0.05,0.25,0.75); m.emissiveIntensity=0.35; } }
          else { m.color.lerp(grey, 0.45); if (m.emissive) m.emissiveIntensity=0; }
        } else if (m.emissive) m.emissiveIntensity=0;
      }
      v._tickAnimations?.(performance.now()); v.renderer.render(v.scene, v.camera);
    })()`);
    await sleep(600);
    await page.eval('window.__icgor.viewer.renderer.render(window.__icgor.viewer.scene, window.__icgor.viewer.camera)');
    const shot = await page.send('Page.captureScreenshot', { format: 'webp', quality: 86, captureBeyondViewport: false });
    await writeFile(join(OUT, `${S.id}.webp`), Buffer.from(shot.data, 'base64'));
    // Tam vücut renderlarında Bana Anlat bölge noktalarının görseldeki yeri (0–1), aynı kamerayla
    if (S.id === 'body-front' || S.id === 'body-back') {
      const pts = await page.eval(`(async()=>{const { BODY_REGIONS } = await import('./src/insight/regions.js'); const v=window.__icgor.viewer; const j=v.manifest.joints;
        const out={}; for (const [id,R] of Object.entries(BODY_REGIONS)) { const a = R.joint && j[R.joint] ? [j[R.joint][0], j[R.joint][1], j[R.joint][2] + (${JSON.stringify(S.view)}==='back' ? -0.06 : 0.06)] : [R.anchor[0], R.anchor[1], ${JSON.stringify(S.view)}==='back' ? -R.anchor[2] : R.anchor[2]];
          const p=v.projectPoint(a); if (p) out[id]=[+(p.x/v.width).toFixed(4), +(p.y/v.height).toFixed(4)]; } return out; })()`);
      await writeFile(join(OUT, `${S.id}.json`), JSON.stringify({ note: 'Bölge işaretlerinin görsel üzerindeki yeri (0–1); scripts/render-ui-assets.mjs', view: S.view, points: pts }, null, 1));
    }
    console.log('ok', S.id);
    await page.close();
  }
} finally { browser.close(); server.close(); }
