// Sahte kamera videosu üretir: test/fixtures/person.html'i farklı konumlarda çizip Y4M'e yazar.
// Kullanım: node scripts/make-fake-video.mjs <çıktı.y4m> [kare-sayısı]
import { writeFile } from 'node:fs/promises';
import { serve, launchChrome } from './lib/cdp.mjs';
import { decodePng } from './lib/png.mjs';



/** RGB → YUV 4:2:0 (BT.601, tam aralık — Y4M "C420jpeg"). */
function toI420({ w, h, rgb }) {
  const Y = Buffer.alloc(w * h), U = Buffer.alloc((w / 2) * (h / 2)), V = Buffer.alloc((w / 2) * (h / 2));
  for (let i = 0; i < w * h; i++) {
    const r = rgb[i * 3], g = rgb[i * 3 + 1], b = rgb[i * 3 + 2];
    Y[i] = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
  }
  for (let y = 0; y < h; y += 2) for (let x = 0; x < w; x += 2) {
    let r = 0, g = 0, b = 0;
    for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) { const i = ((y + dy) * w + x + dx) * 3; r += rgb[i]; g += rgb[i + 1]; b += rgb[i + 2]; }
    r /= 4; g /= 4; b /= 4;
    const k = (y / 2) * (w / 2) + x / 2;
    U[k] = Math.max(0, Math.min(255, Math.round(-0.168736 * r - 0.331264 * g + 0.5 * b + 128)));
    V[k] = Math.max(0, Math.min(255, Math.round(0.5 * r - 0.418688 * g - 0.081312 * b + 128)));
  }
  return Buffer.concat([Y, U, V]);
}

export async function makeFakeVideo(out, N = 24, mode = 'sway') {
  const STATIC = mode === 'static' || mode === 'arms';
  const server = await serve();
  const { cdp, close } = await launchChrome();
  try {
    const page = await cdp.page({ width: 640, height: 480 });
    const chunks = [];
    let header, truth;
    for (let i = 0; i < N; i++) {
      const x = STATIC ? 0 : 0.12 * Math.sin((i / N) * 2 * Math.PI); // kişi sağa-sola salınır
      const pose = mode === 'arms' ? '&pose=arms' : '';
      await page.goto(`http://127.0.0.1:${server.address().port}/test/fixtures/person.html?x=${x.toFixed(3)}${pose}`);
      await page.waitFor("document.body.dataset.ready==='true'", 30000);
      const img = decodePng(await page.screenshot());
      if (i === 0) truth = JSON.parse(await page.eval('document.body.dataset.truth'));
      header ??= `YUV4MPEG2 W${img.w} H${img.h} F15:1 Ip A1:1 C420jpeg\n`;
      chunks.push(Buffer.from('FRAME\n'), toI420(img));
    }
    await writeFile(out, Buffer.concat([Buffer.from(header), ...chunks]));
    if (STATIC) await writeFile(out.replace(/\.y4m$/, '.truth.json'), JSON.stringify(truth));
    console.log(`${N} kare yazıldı: ${out}`);
  } finally { close(); server.close(); }
  return STATIC ? JSON.parse(await (await import('node:fs/promises')).readFile(out.replace(/\.y4m$/, '.truth.json'), 'utf8')) : null;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [out = 'person.y4m', frames = '24', mode = 'sway'] = process.argv.slice(2);
  await makeFakeVideo(out, Number(frames), mode);
}
