// Tarayıcıda derleme adımı olmadan kullanılacak üçüncü taraf dosyaları vendor/ altına kopyalar.
// - three.js (MIT): çekirdek + kullanılan eklentiler; çıplak 'three' içe aktarımları göreli yola çevrilir
//   (import map gerekmez → CSP'de satır içi betik izni gerekmez).
// - MediaPipe Tasks Vision (Apache-2.0): JS paketi + SIMD WASM.
// - Poz modelleri (pose_landmarker_lite/full.task, Apache-2.0): Google model deposundan indirilir, SHA-256 kaydedilir.
//
// Kullanım: node scripts/vendor.mjs

import { mkdir, readFile, writeFile, copyFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { dirname, join, relative } from 'node:path';

const ROOT = join(import.meta.dirname, '..');
const NM = join(ROOT, 'node_modules');
const V = join(ROOT, 'vendor');

const THREE_FILES = [
  'build/three.module.js',
  'build/three.core.js',
  'examples/jsm/controls/OrbitControls.js',
  'examples/jsm/loaders/GLTFLoader.js',
  'examples/jsm/utils/BufferGeometryUtils.js',
  'examples/jsm/utils/SkeletonUtils.js',
  'examples/jsm/environments/RoomEnvironment.js',
  'examples/jsm/libs/meshopt_decoder.module.js',
];

// lite: canlı AR (hız); full: tarama ölçümleri (doğruluk; seçim gerekçesi docs/ARCHITECTURE.md'de ölçümlüdür)
const POSE_MODELS = ['lite', 'full'].map((m) => ({
  name: `pose_landmarker_${m}`,
  url: `https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_${m}/float16/1/pose_landmarker_${m}.task`,
  out: `mediapipe/models/pose_landmarker_${m}.task`,
}));

async function copy(src, dst, transform) {
  await mkdir(dirname(dst), { recursive: true });
  if (!transform) return copyFile(src, dst);
  await writeFile(dst, transform(await readFile(src, 'utf8')));
}

/** Kopyalanan her dosyanın göreli içe aktarmalarının da kopyalandığını doğrular. */
async function checkImports(base, files) {
  const set = new Set(files);
  for (const f of files) {
    const src = await readFile(join(base, f), 'utf8');
    for (const m of src.matchAll(/^\s*(?:import|export)[^'"]*from\s*['"](\.[^'"]+)['"]/gm)) {
      const target = relative(base, join(base, dirname(f), m[1])).replace(/\\/g, '/');
      if (!set.has(target)) throw new Error(`${f} → ${m[1]} kopyalanmadı`);
    }
  }
}

const sha = (b) => createHash('sha256').update(b).digest('hex');

async function main() {
  const versions = {};
  const threePkg = JSON.parse(await readFile(join(NM, 'three/package.json'), 'utf8'));
  versions.three = threePkg.version;
  for (const f of THREE_FILES) {
    const dst = join(V, 'three', f);
    const toCore = relative(dirname(dst), join(V, 'three/build/three.module.js')).replace(/\\/g, '/');
    await copy(join(NM, 'three', f), dst, (s) => s.replace(/from\s+['"]three['"]/g, `from './${toCore}'`.replace('./../', '../')));
  }
  await copy(join(NM, 'three/LICENSE'), join(V, 'three/LICENSE'));
  await checkImports(join(V, 'three'), THREE_FILES);

  const mp = join(NM, '@mediapipe/tasks-vision');
  versions['@mediapipe/tasks-vision'] = JSON.parse(await readFile(join(mp, 'package.json'), 'utf8')).version;
  await copy(join(mp, 'vision_bundle.mjs'), join(V, 'mediapipe/vision_bundle.mjs'), (s) => s.replace(/\n\/\/# sourceMappingURL=.*$/m, ''));
  for (const f of ['vision_wasm_internal.js', 'vision_wasm_internal.wasm']) await copy(join(mp, 'wasm', f), join(V, 'mediapipe/wasm', f));
  await writeFile(join(V, 'mediapipe/LICENSE'), 'Apache License 2.0 — https://www.apache.org/licenses/LICENSE-2.0\nMediaPipe Tasks Vision, © Google LLC.\n');

  for (const M of POSE_MODELS) {
    const res = await fetch(M.url);
    if (!res.ok) throw new Error(`model indirilemedi: ${res.status}`);
    const model = Buffer.from(await res.arrayBuffer());
    await mkdir(dirname(join(V, M.out)), { recursive: true });
    await writeFile(join(V, M.out), model);
    versions[M.name] = { url: M.url, sha256: sha(model), bytes: model.length };
  }

  await writeFile(join(V, 'VERSIONS.json'), JSON.stringify(versions, null, 2));
  console.log('vendor tamam:', versions);
}

main().catch((e) => { console.error(e); process.exit(1); });
