// Hızlı ekran görüntüsü: node scripts/shot.mjs <yol#hash> <çıktı.png> [telefon|masaustu] [js-ifadesi-bekle] [js-çalıştır]
import { writeFile } from 'node:fs/promises';
import { serve, launchChrome, sleep } from './lib/cdp.mjs';

const [url = 'index.html', out = 'shot.png', device = 'telefon', waitExpr, runExpr] = process.argv.slice(2);
const vp = device === 'masaustu' ? { width: 1280, height: 800 } : { width: 390, height: 844, mobile: true, dpr: 2 };
const server = await serve();
const { cdp, close } = await launchChrome();
try {
  const page = await cdp.page(vp);
  await page.goto(`http://127.0.0.1:${server.address().port}/${url}`);
  if (waitExpr) await page.waitFor(waitExpr, 60000); else await sleep(2500);
  if (runExpr) { await page.eval(runExpr); await sleep(1200); }
  await writeFile(out, await page.screenshot());
  console.log('hatalar:', page.errors.length ? page.errors : 'yok');
  console.log('log:', page.logs.slice(-5));
} finally {
  close();
  server.close();
}
