// Kayıtlı video değerlendirme: <klasör>/*.webm + aynı adlı *.json (referans ölçüler + rıza kaydı).
// Uygulamanın çözümleyicileriyle ölçer, referansla karşılaştırır: gösterge başına sapma ve Bland–Altman
// %95 uyum sınırları. Rıza (consent) alanı olmayan kayıt değerlendirilmez. Görüntü hiçbir yere gönderilmez.
// Kullanım: node scripts/eval-recording.mjs <klasör> | --selftest
import { readdir, readFile, writeFile, mkdir, copyFile } from 'node:fs/promises';
import { join, basename, resolve } from 'node:path';
import { serve, launchChrome } from './lib/cdp.mjs';

const ROOT = resolve('.');
const TMP = join(ROOT, '.cache/eval');

export async function evaluate(dir) {
  await mkdir(TMP, { recursive: true });
  const files = (await readdir(dir)).filter((f) => f.endsWith('.webm'));
  const server = await serve();
  const browser = await launchChrome();
  const results = [];
  try {
    const page = await browser.cdp.page({ width: 640, height: 480 });
    await page.goto(`http://127.0.0.1:${server.address().port}/test/fixtures/eval.html`);
    await page.waitFor("document.body.dataset.ready==='true'", 120000);
    for (const f of files) {
      const meta = JSON.parse(await readFile(join(dir, f.replace(/\.webm$/, '.json')), 'utf8'));
      if (!meta.consent?.id || !meta.consent?.signed) { results.push({ file: f, skipped: 'rıza kaydı yok — değerlendirilmedi' }); continue; }
      await copyFile(join(dir, f), join(TMP, basename(f)));
      const out = await page.eval(`window.analyze('/.cache/eval/${basename(f)}', ${JSON.stringify({ kind: meta.kind, view: meta.view, heightCm: meta.heightCm })})`);
      const rows = {};
      for (const [k, ref] of Object.entries(meta.reference ?? {})) {
        const m = out.metrics?.[k];
        rows[k] = { measured: m?.value ?? null, u: m?.u ?? null, reference: ref, diff: m?.value != null ? +(m.value - ref).toFixed(2) : null };
      }
      results.push({ file: f, consent: meta.consent.id, frames: out.n, rows });
    }
  } finally { browser.close(); server.close(); }
  // Gösterge başına Bland–Altman
  const by = {};
  for (const r of results) for (const [k, v] of Object.entries(r.rows ?? {})) if (v.diff != null) (by[k] ??= []).push(v.diff);
  const agreement = Object.fromEntries(Object.entries(by).map(([k, d]) => {
    const n = d.length, bias = d.reduce((a, b) => a + b, 0) / n;
    const sd = n > 1 ? Math.sqrt(d.reduce((a, b) => a + (b - bias) ** 2, 0) / (n - 1)) : null;
    return [k, { n, bias: +bias.toFixed(2), sd: sd && +sd.toFixed(2), loa: sd ? [+(bias - 1.96 * sd).toFixed(2), +(bias + 1.96 * sd).toFixed(2)] : null }];
  }));
  return { results, agreement };
}

async function selftest() {
  // Sentetik figürden iki WebM: yana eğilme 6° (önden) ve rızasız bir kayıt (atlanmalı)
  const dir = join(ROOT, '.cache/eval-selftest');
  await mkdir(dir, { recursive: true });
  const server = await serve();
  const browser = await launchChrome();
  try {
    const page = await browser.cdp.page({ width: 480, height: 640 });
    await page.goto(`http://127.0.0.1:${server.address().port}/test/fixtures/bench.html?nomp=1&w=480&h=640`);
    await page.waitFor("document.body.dataset.ready==='true'", 60000);
    const p = { dist: 2.6, camY: 0.95, yaw: 0, trunkLean: 0.105 };
    const truth = await page.eval(`window.run(${JSON.stringify(p)}).truth`);
    const mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    const s = mid(truth.joints2d['shoulder-L'], truth.joints2d['shoulder-R']), h = mid(truth.joints2d['hip-L'], truth.joints2d['hip-R']);
    const ref = Math.atan2((s[0] - h[0]) * 480, (h[1] - s[1]) * 640) * 180 / Math.PI;
    const b64 = await page.eval(`window.record(${JSON.stringify(Array(20).fill(p))}, 10)`);
    await writeFile(join(dir, 'yana-egilme.webm'), Buffer.from(b64, 'base64'));
    await writeFile(join(dir, 'yana-egilme.json'), JSON.stringify({ kind: 'posture', view: 'front', heightCm: 171.9, reference: { trunkLateral: +ref.toFixed(2) }, consent: { id: 'SENTETIK-1', signed: 'yok (sentetik)', ethics: 'gerekmez (insan verisi değil)' } }, null, 2));
    await writeFile(join(dir, 'rizasiz.webm'), Buffer.from(b64, 'base64'));
    await writeFile(join(dir, 'rizasiz.json'), JSON.stringify({ kind: 'posture', view: 'front', heightCm: 171.9, reference: { trunkLateral: 0 } }));
  } finally { browser.close(); server.close(); }
  return evaluate(dir);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const arg = process.argv[2];
  if (!arg) { console.error('Kullanım: node scripts/eval-recording.mjs <klasör> | --selftest'); process.exit(2); }
  const res = arg === '--selftest' ? await selftest() : await evaluate(resolve(arg));
  console.log(JSON.stringify(res, null, 2));
}
