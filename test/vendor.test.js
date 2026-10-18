import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('MediaPipe paketi: kullanım telemetrisi gönderimi devre dışı', async () => {
  const src = await readFile(new URL('../vendor/mediapipe/vision_bundle.mjs', import.meta.url), 'utf8');
  assert.ok(src.includes('flush(t,e){this.i=[];t?.();return;if(this.error)'), 'telemetri yaması yok — npm run vendor');
  assert.match(await readFile(new URL('../vendor/mediapipe/LICENSE', import.meta.url), 'utf8'), /telemetri/);
});
