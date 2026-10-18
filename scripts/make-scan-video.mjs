// Tarama testleri için sahte kamera videoları (Y4M, dikey). Sentetik figür; gerçek kişi değildir.
//   tarama: önden → yandan (baş 3 cm önde) → arkadan → önden kollar açık, her biri SEG saniye (durağan)
//   kol: yavaş kol kaldırma, tekrar başına 12 s
// Kullanım: node scripts/make-scan-video.mjs <tarama|kol> <çıktı.y4m>
import { writeFile } from 'node:fs/promises';
import { serve, launchChrome } from './lib/cdp.mjs';
import { decodePng } from './lib/png.mjs';
import { toI420 } from './make-fake-video.mjs';

export const W = 240, H = 320, FPS = 5;
const CAM = { dist: 2.6, camY: 0.95 };

export async function makeScanVideo(kind, out, { seg = 30 } = {}) {
  const server = await serve();
  const { cdp, close } = await launchChrome();
  const plan = kind === 'kol'
    ? Array.from({ length: 3 * 12 * FPS }, (_, i) => { const k = Math.sin(((i / FPS) % 12) / 12 * Math.PI); return { ...CAM, yaw: 0, pose: { 'shoulder-L': { plane: 2.4 * k }, 'shoulder-R': { plane: -2.0 * k } } }; })
    : [{ ...CAM, yaw: 0 }, { ...CAM, yaw: Math.PI / 2, headForward: 0.03 }, { ...CAM, yaw: Math.PI },
      { ...CAM, yaw: 0, pose: { 'shoulder-L': { plane: 0.55 }, 'shoulder-R': { plane: -0.55 } } }].flatMap((p) => Array(seg * FPS).fill(p));
  try {
    const page = await cdp.page({ width: W, height: H });
    await page.goto(`http://127.0.0.1:${server.address().port}/test/fixtures/bench.html?nomp=1&w=${W}&h=${H}`);
    await page.waitFor("document.body.dataset.ready==='true'", 60000);
    const chunks = [];
    let prevKey = '', prev = null, truth = null;
    for (const p of plan) {
      const key = JSON.stringify(p);
      if (key !== prevKey) {
        const r = await page.eval(`window.run(${key})`);
        truth ??= r.truth;
        prev = toI420(decodePng(await page.screenshot()));
        prevKey = key;
      }
      chunks.push(Buffer.from('FRAME\n'), prev);
    }
    await writeFile(out, Buffer.concat([Buffer.from(`YUV4MPEG2 W${W} H${H} F${FPS}:1 Ip A1:1 C420jpeg\n`), ...chunks]));
    console.log(`${plan.length} kare: ${out}`);
  } finally { close(); server.close(); }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [kind = 'tarama', out = `.cache/test/scan-${kind}.y4m`] = process.argv.slice(2);
  await makeScanVideo(kind, out);
}
