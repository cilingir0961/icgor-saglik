// Anatomi varlık hattı: kaynak ağları indir → yapılara birleştir → HRA akciğerlerini kaydet →
// iki ayrıntı düzeyinde (high/low) sadeleştir → meshopt sıkıştırmalı GLB + manifest yaz.
//
// Kullanım: node scripts/anatomy/build.mjs
// Çıktı:   assets/anatomy/{high,low}/{skin,skeleton,organs}.glb, manifest.json, provenance.json, LICENSE.md

import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { NodeIO, Document } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { meshopt } from '@gltf-transform/functions';
import { MeshoptEncoder } from 'meshoptimizer';
import { SOURCES, loadBp3dMetadata, loadBp3dObj, loadHraUnitedMale } from './sources.mjs';
import { STRUCTURES, LANDMARKS, MATERIALS } from './catalog.mjs';
import {
  parseObj, weld, mergeMeshes, transformMesh, simplify, simplifierReady, computeNormals, measure, triangleCount,
} from './mesh-ops.mjs';
import { fitAffine, applyAffine, linearDeterminant } from '../../src/core/affine.js';

const OUT = join(import.meta.dirname, '../../assets/anatomy');
const LODS = ['high', 'low'];
const LAYERS = ['skin', 'skeleton', 'organs'];
const log = (...a) => console.log('[anatomi]', ...a);

// BodyParts3D: mm, +X hastanın solu, +Y arka, +Z yukarı → glTF: m, +X sol, +Y yukarı, +Z ön
const bpToGltf = ([x, y, z]) => [x / 1000, z / 1000, -y / 1000];

async function pool(items, n, fn) {
  const out = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: n }, async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i], i);
    }
  }));
  return out;
}

async function main() {
  await simplifierReady;
  await MeshoptEncoder.ready;
  const { concepts, parts } = await loadBp3dMetadata();
  const ctx = {
    concept(fma, rel = 'part_of') {
      const c = concepts.get(fma);
      if (!c) throw new Error(`FMA kavramı yok: ${fma}`);
      return (c[rel] ?? c.is_a ?? c.part_of).filter((fj) => parts.has(fj));
    },
    name: (fj) => parts.get(fj).name,
  };

  // 1) Parça seçimi
  const selections = STRUCTURES.filter((s) => s.source !== 'hra').map((s) => ({ s, fjs: [...new Set(s.select(ctx))] }));
  const landmarkNames = LANDMARKS.filter(([, t]) => t.name).map(([, t]) => t.name);
  const landmarkFjs = [...parts.values()].filter((p) => landmarkNames.includes(p.name)).map((p) => p.fj_id);
  const allFjs = [...new Set([...selections.flatMap((x) => x.fjs), ...landmarkFjs])];
  log(`${allFjs.length} BodyParts3D parçası indiriliyor/doğrulanıyor…`);

  const loaded = new Map();
  let done = 0;
  await pool(allFjs, 8, async (fj) => {
    const { text, sha256, path } = await loadBp3dObj(parts.get(fj));
    const mesh = weld(parseObj(text), 1e-3);
    loaded.set(fj, { fj, name: ctx.name(fj), mesh, sha256, path, m: measure(mesh) });
    if (++done % 100 === 0) log(`  ${done}/${allFjs.length}`);
  });

  // 2) Yapı başına parçalar; aynı adlı ve aynı yerdeki yinelenen temsilleri ayıkla
  const structParts = new Map();
  for (const { s, fjs } of selections) {
    const list = [];
    for (const fj of fjs.sort()) {
      const p = loaded.get(fj);
      const dup = list.find((q) => q.name === p.name && Math.hypot(...q.m.centroid.map((c, k) => c - p.m.centroid[k])) < 5);
      if (dup) {
        if (triangleCount(p.mesh) > triangleCount(dup.mesh)) list.splice(list.indexOf(dup), 1, p);
        continue;
      }
      list.push(p);
    }
    if (list.length === 0) throw new Error(`boş yapı: ${s.id}`);
    structParts.set(s.id, list.map((p) => ({ ...p, cls: s.cls(p.name) })));
    log(`  ${s.id}: ${list.length} parça, ${list.reduce((a, p) => a + triangleCount(p.mesh), 0)} üçgen`);
  }

  // 3) HRA akciğerleri: ortak işaret noktalarıyla afin kayıt (HRA dünya koordinatı → BodyParts3D mm)
  log('HRA birleşik erkek modeli okunuyor…');
  const { glb, zipSha256 } = await loadHraUnitedMale();
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder });
  const hraDoc = await io.readBinary(new Uint8Array(glb));
  const hraNodes = new Map(hraDoc.getRoot().listNodes().map((n) => [n.getName(), n]));
  const hraSubtree = (name) => {
    const root = hraNodes.get(name);
    if (!root) throw new Error(`HRA düğümü yok: ${name}`);
    const meshes = [];
    root.traverse((node) => {
      const mesh = node.getMesh();
      if (!mesh) return;
      const w = node.getWorldMatrix();
      for (const prim of mesh.listPrimitives()) {
        const pos = prim.getAttribute('POSITION').getArray();
        const out = new Float32Array(pos.length);
        for (let i = 0; i < pos.length; i += 3) {
          const [x, y, z] = [pos[i], pos[i + 1], pos[i + 2]];
          out[i] = w[0] * x + w[4] * y + w[8] * z + w[12];
          out[i + 1] = w[1] * x + w[5] * y + w[9] * z + w[13];
          out[i + 2] = w[2] * x + w[6] * y + w[10] * z + w[14];
        }
        const ind = prim.getIndices()?.getArray() ?? Uint32Array.from({ length: pos.length / 3 }, (_, i) => i);
        meshes.push({ positions: out, indices: Uint32Array.from(ind) });
      }
    });
    return mergeMeshes(meshes);
  };

  const pairs = [];
  for (const [hraName, target] of LANDMARKS) {
    let bpMesh;
    if (target.name) {
      const p = [...loaded.values()].find((q) => q.name === target.name);
      if (!p) { log(`  işaret noktası atlandı (BP3D'de yok): ${target.name}`); continue; }
      bpMesh = p.mesh;
    } else {
      const ps = structParts.get(target.structure).filter((p) => !(target.excludeClasses ?? []).includes(p.cls));
      bpMesh = mergeMeshes(ps.map((p) => p.mesh));
    }
    if (!hraNodes.has(hraName)) { log(`  işaret noktası atlandı (HRA'da yok): ${hraName}`); continue; }
    pairs.push({ hra: hraName, bp: target.name ?? target.structure, hraC: measure(hraSubtree(hraName)).centroid, bpC: measure(bpMesh).centroid });
  }
  const reg = fitAffine(pairs.map((p) => p.hraC), pairs.map((p) => p.bpC));
  const det = linearDeterminant(reg.matrix);
  log(`Kayıt: ${pairs.length} işaret noktası, RMS kalıntı ${reg.rms.toFixed(1)} mm, det ${det.toFixed(3)}`);

  for (const s of STRUCTURES.filter((x) => x.source === 'hra')) {
    let mesh = transformMesh(hraSubtree(s.hraNode), (p) => applyAffine(reg.matrix, p));
    if (det < 0) {
      // Aynalama sarım yönünü ters çevirir; üçgenleri düzelt.
      const idx = Uint32Array.from(mesh.indices);
      for (let t = 0; t < idx.length; t += 3) [idx[t + 1], idx[t + 2]] = [idx[t + 2], idx[t + 1]];
      mesh = { positions: mesh.positions, indices: idx };
    }
    mesh = weld(mesh, 1e-2);
    structParts.set(s.id, [{ fj: null, name: s.en, mesh, cls: s.cls(s.en), m: measure(mesh), hraNode: s.hraNode }]);
    log(`  ${s.id}: HRA ${s.hraNode}, ${triangleCount(mesh)} üçgen`);
  }

  // 4) Çıktı koordinatları: glTF eksenleri, deri kutusuna göre ortala (ayak tabanı y=0)
  const skinOut = transformMesh(mergeMeshes(structParts.get('skin').map((p) => p.mesh)), bpToGltf);
  const sb = measure(skinOut);
  const offset = [-(sb.min[0] + sb.max[0]) / 2, -sb.min[1], -(sb.min[2] + sb.max[2]) / 2];
  const toOut = (p) => { const q = bpToGltf(p); return [q[0] + offset[0], q[1] + offset[1], q[2] + offset[2]]; };

  // 5) LOD üretimi
  const manifest = {
    version: 1,
    generated: new Date().toISOString().slice(0, 10),
    units: 'metre',
    axes: '+X hastanın solu, +Y baş, +Z ön (anterior)',
    bodyHeight: sb.max[1] - sb.min[1],
    disclaimer: 'Genel referans anatomi (atlas) modelidir; herhangi bir kişinin taraması değildir.',
    sources: SOURCES,
    registration: {
      method: 'Afin en küçük kareler (12 parametre), yapı ağırlık merkezleri',
      landmarks: pairs.length,
      rmsMm: +reg.rms.toFixed(2),
      maxMm: +Math.max(...reg.residuals).toFixed(2),
      appliesTo: STRUCTURES.filter((s) => s.source === 'hra').map((s) => s.id),
    },
    lods: {},
    structures: [],
  };
  const provenance = { bodyparts3d: { commit: SOURCES.bodyparts3d.commit, parts: {} }, hra: { commit: SOURCES.hra.commit, zipSha256, landmarks: pairs } };

  const perLod = {};
  for (const lod of LODS) {
    perLod[lod] = new Map();
    for (const s of STRUCTURES) {
      const ps = structParts.get(s.id);
      const total = ps.reduce((a, p) => a + triangleCount(p.mesh), 0);
      const ratio = Math.min(1, s.budget[lod] / total);
      const byCls = new Map();
      let maxErr = 0;
      for (const p of ps) {
        const n = triangleCount(p.mesh);
        const target = Math.max(Math.min(n, 12), Math.round(n * ratio));
        const { mesh, error } = simplify(p.mesh, target, 0.05);
        maxErr = Math.max(maxErr, error);
        if (!byCls.has(p.cls)) byCls.set(p.cls, []);
        byCls.get(p.cls).push(mesh);
      }
      const prims = [...byCls].map(([cls, list]) => {
        const mesh = transformMesh(mergeMeshes(list), toOut);
        return { cls, mesh, normals: computeNormals(mesh) };
      });
      perLod[lod].set(s.id, { prims, tris: prims.reduce((a, p) => a + triangleCount(p.mesh), 0), maxErr });
    }
  }

  for (const s of STRUCTURES) {
    const full = mergeMeshes(structParts.get(s.id).map((p) => p.mesh));
    const m = measure(transformMesh(full, toOut));
    const r = (v) => v.map((x) => +x.toFixed(4));
    manifest.structures.push({
      id: s.id, layer: s.layer, en: s.en, fma: s.fma, source: s.source ?? 'bodyparts3d',
      parts: structParts.get(s.id).length,
      centroid: r(m.centroid), min: r(m.min), max: r(m.max),
      tris: Object.fromEntries(LODS.map((l) => [l, perLod[l].get(s.id).tris])),
      sourceTris: triangleCount(full),
    });
    if (s.source !== 'hra') {
      provenance.bodyparts3d.parts[s.id] = structParts.get(s.id).map((p) => ({ fj: p.fj, name: p.name, sha256: p.sha256 }));
    }
  }

  for (const lod of LODS) {
    manifest.lods[lod] = {};
    await mkdir(join(OUT, lod), { recursive: true });
    for (const layer of LAYERS) {
      const doc = new Document();
      const buffer = doc.createBuffer();
      const scene = doc.createScene(layer);
      const mats = new Map();
      const material = (cls) => {
        if (!mats.has(cls)) {
          const def = MATERIALS[cls];
          const [r, g, b] = [1, 3, 5].map((i) => srgbToLinear(parseInt(def.color.slice(i, i + 2), 16) / 255));
          mats.set(cls, doc.createMaterial(cls).setBaseColorFactor([r, g, b, 1]).setRoughnessFactor(def.roughness).setMetallicFactor(0));
        }
        return mats.get(cls);
      };
      let tris = 0;
      for (const s of STRUCTURES.filter((x) => x.layer === layer)) {
        const data = perLod[lod].get(s.id);
        const mesh = doc.createMesh(s.id);
        for (const p of data.prims) {
          const pos = doc.createAccessor().setType('VEC3').setArray(p.mesh.positions).setBuffer(buffer);
          const nor = doc.createAccessor().setType('VEC3').setArray(p.normals).setBuffer(buffer);
          const ind = doc.createAccessor().setType('SCALAR').setArray(p.mesh.indices).setBuffer(buffer);
          mesh.addPrimitive(doc.createPrimitive().setAttribute('POSITION', pos).setAttribute('NORMAL', nor).setIndices(ind).setMaterial(material(p.cls)).setExtras({ cls: p.cls }));
        }
        scene.addChild(doc.createNode(s.id).setMesh(mesh).setExtras({ id: s.id, layer }));
        tris += data.tris;
      }
      doc.getRoot().getAsset().copyright = layer === 'organs'
        ? `${SOURCES.bodyparts3d.copyright}; lungs: ${SOURCES.hra.copyright} (CC BY 4.0). Adapted by icgor-saglik.`
        : `${SOURCES.bodyparts3d.copyright}. Adapted by icgor-saglik.`;
      await doc.transform(meshopt({ encoder: MeshoptEncoder, level: 'medium' }));
      const bin = await io.writeBinary(doc);
      const rel = `${lod}/${layer}.glb`;
      await writeFile(join(OUT, rel), bin);
      manifest.lods[lod][layer] = { path: rel, bytes: bin.byteLength, tris };
      log(`  ${rel}: ${tris} üçgen, ${(bin.byteLength / 1024).toFixed(0)} KB`);
    }
  }

  await writeFile(join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 2));
  await writeFile(join(OUT, 'provenance.json'), JSON.stringify(provenance));
  await writeFile(join(OUT, 'LICENSE.md'), licenseText(manifest));
  log('bitti.');
}

const srgbToLinear = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);

function licenseText(m) {
  const B = SOURCES.bodyparts3d, H = SOURCES.hra;
  return `# Anatomik 3B model lisansları

Bu klasördeki model dosyaları (\`*.glb\`) üçüncü taraf açık verilerden **türetilmiştir**.
Uygulamanın kaynak kodu bu lisanslardan ayrıdır.

> Bu modeller genel referans anatomidir; herhangi bir kişinin tıbbi taraması değildir.

## BodyParts3D (deri, iskelet, akciğer dışındaki organlar)

- Atıf: **${B.copyright}**
- Kaynak: ${B.licenseUrl} · Ayna: ${B.mirror} (commit \`${B.commit}\`, ${B.mirrorDoi})
- Yayın: ${B.citation}
- Lisans notu: ${B.licenseNote}
- **Bu klasördeki türev dosyalar: CC BY-SA 4.0** — https://creativecommons.org/licenses/by-sa/4.0/

## Human Reference Atlas (akciğerler)

- Atıf: **${H.copyright}**
- Kaynak: ${H.licenseUrl} · Depo: ${H.repo} (commit \`${H.commit}\`, \`${H.path}\`)
- Yayın: ${H.citation}
- Lisans: **CC BY 4.0** — https://creativecommons.org/licenses/by/4.0/

## Yapılan değişiklikler (uyarlama)

- Birim mm → m, eksenler Z-yukarı → Y-yukarı; vücut ayak tabanı y=0 olacak şekilde ortalandı.
- Parçalar anatomik yapılara birleştirildi; yinelenen temsiller ayıklandı.
- meshoptimizer ile iki ayrıntı düzeyine sadeleştirildi (high / low), normaller yeniden hesaplandı,
  EXT_meshopt_compression ile sıkıştırıldı.
- HRA akciğerleri, ${m.registration.landmarks} ortak işaret noktasından uydurulan afin dönüşümle BodyParts3D
  gövdesine yerleştirildi (RMS kalıntı ${m.registration.rmsMm} mm). Bu bir yaklaşık hizalamadır.
- Her parçanın kaynak kimliği ve SHA-256 özeti: \`provenance.json\`.
`;
}

main().catch((e) => { console.error(e); process.exit(1); });
