// Anatomi varlık hattı: kaynak ağları indir → yapılara birleştir → ikinci bir atlasla (HRA) çapraz doğrula →
// iki ayrıntı düzeyinde (high/low) sadeleştir → meshopt sıkıştırmalı GLB + manifest yaz.
//
// Kullanım: node scripts/anatomy/build.mjs
// Çıktı:   assets/anatomy/{high,low}/{skin,muscles,skeleton,organs,vessels,nerves}.glb, manifest.json, provenance.json, LICENSE.md
// Önkoşul (kaslar): .cache/anatomy/zanat/muscles.bin — scripts/anatomy/zanatomy-export.py ile üretilir (bpy gerekir).

import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { NodeIO, Document } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { meshopt } from '@gltf-transform/functions';
import { MeshoptEncoder } from 'meshoptimizer';
import { SOURCES, loadBp3dMetadata, loadBp3dObj, loadHraUnitedMale, loadZanatomyZip, readZanatomyBin } from './sources.mjs';
import { STRUCTURES, LANDMARKS, MATERIALS, MUSCLE_GROUPS } from './catalog.mjs';
import { bakeAO } from './ao.mjs';
import { icpAffine } from './register.mjs';
import * as THREE from 'three';
import { MeshBVH } from 'three-mesh-bvh';
import {
  parseObj, weld, mergeMeshes, transformMesh, simplify, simplifierReady, computeNormals, measure, triangleCount,
  orientOutward,
} from './mesh-ops.mjs';
import { fitAffine, applyAffine, linearDeterminant } from '../../src/core/affine.js';

const OUT = join(import.meta.dirname, '../../assets/anatomy');
const LODS = ['high', 'low'];
const LAYERS = ['skin', 'muscles', 'skeleton', 'organs', 'vessels', 'nerves'];
const ZANAT_BIN = join(import.meta.dirname, '../../.cache/anatomy/zanat/muscles.bin');
// AO: katmana göre ışın uzunluğu (m) — küçük yapılarda kısa, büyük organlarda uzun
const AO = { muscles: 0.03, skeleton: 0.04, organs: 0.05, vessels: 0.02, nerves: 0.015 };
// Eklem hareketinde uzuvla birlikte dönmesi gereken parçaları içeren yapılar (geometrik segment ataması)
const LIMB_GROUPS = new Set(['mus-shoulder-arm', 'mus-forearm-hand', 'mus-hip-thigh', 'mus-leg-foot', 'arteries', 'veins', 'nerves']);
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

const manifestExtra = {};

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
    find: (re) => [...parts.values()].filter((p) => re.test(p.name)).map((p) => p.fj_id),
  };

  // 1) Parça seçimi
  const selections = STRUCTURES.filter((s) => s.source !== 'zanatomy').map((s) => ({ s, fjs: [...new Set(s.select(ctx))] }));
  const landmarkNames = LANDMARKS.filter(([, t]) => t.name).map(([, t]) => t.name);
  const landmarkFjs = [...parts.values()].filter((p) => landmarkNames.includes(p.name)).map((p) => p.fj_id);
  const allFjs = [...new Set([...selections.flatMap((x) => x.fjs), ...landmarkFjs])];
  log(`${allFjs.length} BodyParts3D parçası indiriliyor/doğrulanıyor…`);

  const loaded = new Map();
  let done = 0, flippedCount = 0;
  await pool(allFjs, 8, async (fj) => {
    const { text, sha256, path } = await loadBp3dObj(parts.get(fj));
    // Bazı kaynak parçalar içe dönük sarımlı; arka yüz elemede kaybolmasınlar diye dışa çevrilir.
    const { mesh, flipped } = orientOutward(weld(parseObj(text), 1e-3));
    if (flipped) flippedCount++;
    loaded.set(fj, { fj, name: ctx.name(fj), mesh, sha256, path, m: measure(mesh), flipped });
    if (++done % 100 === 0) log(`  ${done}/${allFjs.length}`);
  });

  log(`  ${flippedCount} parçanın içe dönük sarımı düzeltildi`);

  // 2) Yapı başına parçalar; aynı adlı ve aynı yerdeki yinelenen temsilleri ayıkla
  const structParts = new Map();
  const removedDuplicates = [];
  for (const { s, fjs } of selections) {
    const list = [];
    for (const fj of fjs.sort()) {
      const p = loaded.get(fj);
      const dist = (q) => Math.hypot(...q.m.centroid.map((c, k) => c - p.m.centroid[k]));
      // Aynı yapının farklı temsilleri: aynı ad + yakın merkez, ya da ad farklı ama geometri neredeyse aynı.
      const dup = list.find((q) => (q.name === p.name && dist(q) < 5)
        || (dist(q) < 1 && Math.abs(triangleCount(q.mesh) - triangleCount(p.mesh)) <= 0.02 * triangleCount(p.mesh)));
      if (dup) {
        if (triangleCount(p.mesh) > triangleCount(dup.mesh)) list.splice(list.indexOf(dup), 1, p);
        continue;
      }
      list.push(p);
    }
    if (list.length === 0) throw new Error(`boş yapı: ${s.id}`);
    // Aynı adlı farklı duruş temsilleri (ör. sağ parmak falanksları iki kez): karşı tarafta tek kopya varsa,
    // onun aynadaki konumuna en yakın temsil tutulur. Gerçekten çift olan yapılar (iki susam kemiği) korunur.
    const counts = new Map();
    for (const p of list) counts.set(p.name, (counts.get(p.name) ?? 0) + 1);
    for (const [name, n] of counts) {
      if (n < 2) continue;
      const other = name.replace(/\b(left|right)\b/i, (w) => (w.toLowerCase() === 'left' ? 'right' : 'left'));
      if (other === name || counts.get(other) !== 1) continue;
      const ref = list.find((p) => p.name === other).m.centroid;
      const mirror = [-ref[0], ref[1], ref[2]];
      const dups = list.filter((p) => p.name === name);
      dups.sort((a, b) => Math.hypot(...a.m.centroid.map((c, k) => c - mirror[k])) - Math.hypot(...b.m.centroid.map((c, k) => c - mirror[k])));
      for (const d of dups.slice(1)) { list.splice(list.indexOf(d), 1); removedDuplicates.push(`${s.id}: ${d.name} (${d.fj})`); }
    }
    structParts.set(s.id, list.map((p) => ({ ...p, cls: s.cls(p.name) })));
    log(`  ${s.id}: ${list.length} parça, ${list.reduce((a, p) => a + triangleCount(p.mesh), 0)} üçgen`);
  }

  if (removedDuplicates.length) log(`  ${removedDuplicates.length} yinelenen duruş temsili çıkarıldı:`, removedDuplicates.join('; '));

  // 2b) Kaslar ve tendonlar: Z-Anatomy (BodyParts3D türevi, ancak iskeleti yeniden düzenlenmiş: ~1 cm kayma, ~%3 boy farkı).
  // Kasları BodyParts3D iskeletine oturtmak için her eklem segmentinde kemik yüzeyleri ICP ile eşlenir.
  await loadZanatomyZip(); // kaynak arşivin bütünlüğü (SHA-256)
  if (!existsSync(ZANAT_BIN)) {
    throw new Error('Z-Anatomy önbelleği yok. Önce: .cache/bpyenv/bin/python scripts/anatomy/zanatomy-export.py <Startup.blend> .cache/anatomy/zanat/muscles.bin');
  }
  const zObjects = readZanatomyBin(await readFile(ZANAT_BIN));
  const zMesh = (o) => orientOutward(weld({ positions: o.positions.map((v) => v * 1000), indices: o.indices }, 1e-3)).mesh;
  const zSide = (n) => (/\.l$/.test(n) ? 'L' : /\.r$/.test(n) ? 'R' : null);
  const zBoneSegment = (n) => {
    const S = zSide(n);
    if (!S) return 'trunk';
    if (/of foot|calcaneus|talus|cuboid|navicular|cuneiform bone|metatarsal|tibia|fibula/i.test(n)) return `leg-${S}`;
    if (/femur|patella/i.test(n)) return `thigh-${S}`;
    if (/humerus/i.test(n)) return `upperArm-${S}`;
    if (/radius|ulna|capitate|hamate|lunate|pisiform|scaphoid|trapez|triquetr|metacarpal|of hand/i.test(n)) return `forearm-${S}`;
    return 'trunk';
  };
  // Gövde kaydı üç alt bölgede yapılır (duruş farkları tek afin dönüşüme sığmaz); eklem animasyonunda hepsi 'trunk'.
  // Adlandırma iki kaynakta farklı: BodyParts3D "Fifth cervical vertebra", Z-Anatomy "Vertebra C5".
  const trunkRegion = (n) => (/frontal|parietal|occipital|temporal bone|sphenoid|ethmoid|maxilla|mandible|zygomatic|nasal bone|lacrimal|palatine|vomer|concha|atlas|axis|cervical|vertebra c\d/i.test(n) ? 'trunk:head-neck'
    : /lumbar|vertebra l\d/i.test(n) ? 'trunk:lumbar'
      : /sacrum|coccyx|hip bone|ilium|ischium|pubis/i.test(n) ? 'trunk:pelvis' : 'trunk:thorax');
  const regKey = (seg, n) => (seg === 'trunk' ? trunkRegion(n) : seg);
  // Kayıtta karşılığı olmayan yapılar (BodyParts3D iskelet setimizde yok): gırtlak kıkırdakları, dişler, burun kıkırdağı, kulak kemikçikleri
  const NOT_SKELETON = /tooth|incisor|canine|molar|septal cartilage|arytenoid|corniculate|cricoid|thyroid cartilage|epiglott|cuneiform cartilage|nasal cartilage|alar cartilage|cells of ethmoid|malleus|incus|stapes|ossicle|hyoid|tracheal|bronch/i;
  const zBones = zObjects.filter((o) => o.collection === '1: Skeletal system' && !NOT_SKELETON.test(o.name))
    .map((o) => ({ name: o.name, segment: regKey(zBoneSegment(o.name), o.name), mesh: zMesh(o) }));
  const bpBones = STRUCTURES.filter((x) => x.layer === 'skeleton').flatMap((x) => structParts.get(x.id)
    .map((p) => ({ name: p.name, segment: regKey(x.segment ? x.segment(p.name) : 'trunk', p.name), mesh: p.mesh })));
  const SEGMENTS = [...new Set(zBones.map((b) => b.segment))].sort();
  const registration = {};
  for (const seg of SEGMENTS) {
    const src = zBones.filter((b) => b.segment === seg).map((b) => b.mesh);
    const dst = bpBones.filter((b) => b.segment === seg).map((b) => b.mesh);
    if (!src.length || !dst.length) throw new Error(`kayıt segmenti eksik: ${seg}`);
    registration[seg] = icpAffine(src, dst);
  }
  log('Z-Anatomy → BodyParts3D segment kaydı (mm):', Object.fromEntries(Object.entries(registration)
    .map(([k, r]) => [k, `RMS ${r.initialRmsMm} → ${r.rmsMm}, medyan ${r.medianMm}, %90 ${r.p90Mm}`])));
  // Ölçüt: medyan < 2,5 mm ve %90 < 6 mm (RMS, iki kaynakta farklı modellenmiş küçük uç kısımlara aşırı duyarlı)
  if (Object.values(registration).some((r) => r.medianMm > 2.5 || r.p90Mm > 6)) throw new Error('Z-Anatomy kaydı yetersiz');

  // Her kas, kendisine en yakın Z-Anatomy kemiğinin segmentine atanır ve o segmentin dönüşümüyle taşınır.
  const segBvh = Object.fromEntries(SEGMENTS.map((seg) => {
    const m = mergeMeshes(zBones.filter((b) => b.segment === seg).map((b) => b.mesh));
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(m.positions, 3));
    g.setIndex(new THREE.BufferAttribute(m.indices, 1));
    return [seg, new MeshBVH(g)];
  }));
  const nearestSegment = (c) => {
    let best = 'trunk', bd = Infinity;
    const hit = { point: new THREE.Vector3(), distance: 0 };
    for (const seg of SEGMENTS) {
      segBvh[seg].closestPointToPoint(new THREE.Vector3(...c), hit);
      if (hit.distance < bd) { bd = hit.distance; best = seg; }
    }
    return best;
  };
  const zByGroup = new Map(MUSCLE_GROUPS.map((g) => [g.id, []]));
  for (const o of zObjects.filter((x) => x.collection !== '1: Skeletal system' && !/^(Femur|Humerus)\.(l|r)$/.test(x.name))) {
    const base = o.name.replace(/\.(l|r)$/, '');
    const g = MUSCLE_GROUPS.find((x) => x.re.test(base));
    if (!g) throw new Error(`kas grubu bulunamadı: ${o.name}`);
    const raw = zMesh(o);
    const seg = nearestSegment(measure(raw).centroid);
    const mesh = transformMesh(raw, (pt) => applyAffine(registration[seg].matrix, pt));
    zByGroup.get(g.id).push({ fj: null, name: o.name, mesh, m: measure(mesh), regSegment: seg.split(':')[0] });
  }
  for (const s of STRUCTURES.filter((x) => x.source === 'zanatomy')) {
    const list = zByGroup.get(s.id);
    structParts.set(s.id, list.map((p) => ({ ...p, cls: s.cls(p.name) })));
    log(`  ${s.id}: ${list.length} parça, ${list.reduce((a, p) => a + triangleCount(p.mesh), 0)} üçgen (Z-Anatomy)`);
  }
  // Kayıt sonrası doğrulama: aynı kemiklerin merkezleri arasındaki uzaklık
  const alignment = [];
  for (const [zn, bn] of [['Femur.r', 'Right femur'], ['Femur.l', 'Left femur'], ['Humerus.r', 'Right humerus'], ['Humerus.l', 'Left humerus']]) {
    const zb = zBones.find((b) => b.name === zn);
    const moved = transformMesh(zb.mesh, (pt) => applyAffine(registration[zb.segment].matrix, pt));
    const bp = [...loaded.values()].find((q) => q.name === bn);
    const before = Math.hypot(...measure(zb.mesh).centroid.map((c, k) => c - bp.m.centroid[k]));
    const after = Math.hypot(...measure(moved).centroid.map((c, k) => c - bp.m.centroid[k]));
    alignment.push({ bone: bn, beforeMm: +before.toFixed(1), distanceMm: +after.toFixed(2) });
  }
  log('Kemik merkezleri, kayıt öncesi → sonrası:', alignment);
  if (alignment.some((a) => a.distanceMm > 5)) throw new Error('Z-Anatomy kaydı sonrası kemikler hâlâ uyuşmuyor');
  manifestExtra.removedDuplicates = removedDuplicates;

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

  // Bağımsız çapraz doğrulama: HRA akciğerleri kayıt sonrası BodyParts3D akciğerleriyle ne kadar örtüşüyor?
  const crossCheck = [];
  for (const s of STRUCTURES.filter((x) => x.hraNode)) {
    const hra = measure(transformMesh(hraSubtree(s.hraNode), (p) => applyAffine(reg.matrix, p)));
    const bp = measure(mergeMeshes(structParts.get(s.id).map((p) => p.mesh)));
    const inter = [0, 1, 2].map((k) => Math.max(0, Math.min(hra.max[k], bp.max[k]) - Math.max(hra.min[k], bp.min[k])));
    const vol = (b) => (b.max[0] - b.min[0]) * (b.max[1] - b.min[1]) * (b.max[2] - b.min[2]);
    const iv = inter[0] * inter[1] * inter[2];
    crossCheck.push({
      id: s.id,
      centroidDistanceMm: +Math.hypot(...hra.centroid.map((c, k) => c - bp.centroid[k])).toFixed(1),
      boxIoU: +(iv / (vol(hra) + vol(bp) - iv)).toFixed(3),
    });
  }
  log('Çapraz doğrulama (HRA ↔ BodyParts3D akciğer):', crossCheck);

  // 4) Çıktı koordinatları: glTF eksenleri, deri kutusuna göre ortala (ayak tabanı y=0)
  const skinOut = transformMesh(mergeMeshes(structParts.get('skin').map((p) => p.mesh)), bpToGltf);
  const sb = measure(skinOut);
  const offset = [-(sb.min[0] + sb.max[0]) / 2, -sb.min[1], -(sb.min[2] + sb.max[2]) / 2];
  const toOut = (p) => { const q = bpToGltf(p); return [q[0] + offset[0], q[1] + offset[1], q[2] + offset[2]]; };

  // Eklem merkezleri: kemiğin uç diliminin (üst/alt) köşe ortalaması, çıktı koordinatlarında.
  const allParts = [...structParts.values()].flat(); // eklem merkezleri için
  const sliceCenter = (names, fraction, end) => {
    const meshes = names.map((n) => {
      const p = allParts.find((q) => q.name === n);
      if (!p) throw new Error(`eklem için parça yok: ${n}`);
      return transformMesh(p.mesh, toOut);
    });
    const all = mergeMeshes(meshes);
    const { min, max } = measure(all);
    const h = max[1] - min[1];
    const keep = (y) => (end === 'top' ? y >= max[1] - h * fraction : y <= min[1] + h * fraction);
    let n = 0; const sum = [0, 0, 0];
    for (let i = 0; i < all.positions.length; i += 3) {
      if (keep(all.positions[i + 1])) { sum[0] += all.positions[i]; sum[1] += all.positions[i + 1]; sum[2] += all.positions[i + 2]; n++; }
    }
    return sum.map((v) => +(v / n).toFixed(4));
  };
  const joints = {};
  for (const [S, side] of [['L', 'Left'], ['R', 'Right']]) {
    joints[`shoulder-${S}`] = sliceCenter([`${side} humerus`], 0.08, 'top');
    joints[`elbow-${S}`] = sliceCenter([`${side} humerus`], 0.06, 'bottom');
    joints[`wrist-${S}`] = sliceCenter([`${side} radius`, `${side} ulna`], 0.05, 'bottom');
    joints[`hip-${S}`] = sliceCenter([`${side} femur`], 0.06, 'top');
    joints[`knee-${S}`] = sliceCenter([`${side} femur`], 0.06, 'bottom');
    joints[`ankle-${S}`] = sliceCenter([`${side} tibia`], 0.05, 'bottom');
  }

  // Kasların eklem segmentine geometrik ataması (uzuv eksenine uzaklık + kısıtlar); gövde kasları 'trunk'.
  const sub = (a, b) => a.map((v, i) => v - b[i]);
  const segDist = (p, a, b) => {
    const ab = sub(b, a), ap = sub(p, a);
    const t = Math.max(0, Math.min(1, ap.reduce((s2, v, i) => s2 + v * ab[i], 0) / ab.reduce((s2, v) => s2 + v * v, 0)));
    return { t, d: Math.hypot(...ap.map((v, i) => v - t * ab[i])) };
  };
  const geometricSegment = (groupId, name, centroidMm) => {
    if (!LIMB_GROUPS.has(groupId)) return 'trunk';
    const c = toOut(centroidMm);
    // Taraf: Z-Anatomy soneki (.l/.r) veya BodyParts3D adı; yoksa konumdan (+x = sol)
    const S = /\.l$|\bleft\b/i.test(name) ? 'L' : /\.r$|\bright\b/i.test(name) ? 'R' : (c[0] >= 0 ? 'L' : 'R');
    const J = (k) => joints[`${k}-${S}`];
    const handTip = J('wrist').map((v, i) => v + (J('wrist')[i] - J('elbow')[i]) * 0.75);
    const toe = J('ankle').map((v, i) => v + [0, -0.05, 0.15][i]);
    const lateral = Math.abs(c[0]) > 0.8 * Math.abs(J('shoulder')[0]);
    const cands = [
      { seg: 'upperArm', ...segDist(c, J('shoulder'), J('elbow')), r: 0.09, ok: lateral },
      { seg: 'forearm', ...segDist(c, J('elbow'), handTip), r: 0.08, ok: lateral },
      { seg: 'thigh', ...segDist(c, J('hip'), J('knee')), r: 0.13, ok: true },
      { seg: 'leg', ...segDist(c, J('knee'), J('ankle')), r: 0.1, ok: true },
      { seg: 'leg', ...segDist(c, J('ankle'), toe), r: 0.08, ok: true },
    ].filter((x) => x.ok && x.d < x.r && !(x.seg === 'thigh' && x.t < 0.08));
    cands.sort((a, b) => a.d - b.d);
    return cands[0] ? `${cands[0].seg}-${S}` : 'trunk';
  };
  const segmentOf = (s, p) => (p.regSegment ?? (typeof s.segment === 'function' ? s.segment(p.name)
    : s.segment === 'geometric' ? geometricSegment(s.id, p.name, p.m.centroid) : 'trunk'));
  const segStats = {};
  for (const s of STRUCTURES) {
    for (const p of structParts.get(s.id)) {
      p.segment = segmentOf(s, p);
      segStats[p.segment] = (segStats[p.segment] ?? 0) + 1;
    }
  }
  log('Segment dağılımı (parça sayısı):', segStats);

  // 5) LOD üretimi
  const manifest = {
    version: 1,
    generated: new Date().toISOString().slice(0, 10),
    units: 'metre',
    axes: '+X hastanın solu, +Y baş, +Z ön (anterior)',
    bodyHeight: sb.max[1] - sb.min[1],
    disclaimer: 'Genel referans anatomi (atlas) modelidir; herhangi bir kişinin taraması değildir.',
    sources: SOURCES,
    validation: {
      description: 'Bağımsız ikinci atlas (HRA, Visible Human Male) ile çapraz kontrol: 31 ortak yapının merkezlerinden afin kayıt, ardından akciğerlerin örtüşmesi.',
      method: 'Afin en küçük kareler (12 parametre), yapı ağırlık merkezleri',
      landmarks: pairs.length,
      rmsMm: +reg.rms.toFixed(2),
      maxMm: +Math.max(...reg.residuals).toFixed(2),
      lungs: crossCheck,
    },
    lods: {},
    structures: [],
  };
  const provenance = {
    bodyparts3d: { commit: SOURCES.bodyparts3d.commit, parts: {} },
    zanatomy: { commit: SOURCES.zanatomy.commit, zipSha256: SOURCES.zanatomy.zipSha256, objects: {} },
    hra: { commit: SOURCES.hra.commit, zipSha256, landmarks: pairs } };

  const perLod = {};
  for (const lod of LODS) {
    perLod[lod] = new Map();
    for (const s of STRUCTURES) {
      const ps = structParts.get(s.id);
      const total = ps.reduce((a, p) => a + triangleCount(p.mesh), 0);
      const ratio = Math.min(1, s.budget[lod] / total);
      const byKey = new Map();
      let maxErr = 0;
      for (const p of ps) {
        const n = triangleCount(p.mesh);
        const target = Math.max(Math.min(n, 12), Math.round(n * ratio));
        const { mesh, error } = simplify(p.mesh, target, 0.05);
        maxErr = Math.max(maxErr, error);
        const key = `${p.cls}|${p.segment}`;
        if (!byKey.has(key)) byKey.set(key, []);
        byKey.get(key).push(mesh);
      }
      const prims = [...byKey].map(([key, list]) => {
        const [cls, segment] = key.split('|');
        const mesh = transformMesh(mergeMeshes(list), toOut);
        return { cls, segment, mesh, normals: computeNormals(mesh) };
      });
      perLod[lod].set(s.id, { prims, tris: prims.reduce((a, p) => a + triangleCount(p.mesh), 0), maxErr });
    }
  }

  // Pişirilmiş ortam kapatması (deri hariç; katman içi kapatma — katman gizlenince yanlış gölge kalmaz)
  for (const lod of LODS) {
    for (const layer of LAYERS.filter((l) => AO[l])) {
      const prims = STRUCTURES.filter((s) => s.layer === layer).flatMap((s) => perLod[lod].get(s.id).prims);
      const t0 = Date.now();
      const aos = bakeAO(prims, { rays: lod === 'high' ? 24 : 16, maxDist: AO[layer] });
      prims.forEach((p, i) => { p.ao = aos[i]; });
      const verts = prims.reduce((a, p) => a + p.ao.length, 0);
      log(`  AO ${lod}/${layer}: ${verts} köşe, ${((Date.now() - t0) / 1000).toFixed(1)} s`);
    }
  }

  manifest.landmarks = {
    note: 'MediaPipe omuz/kalça noktalarına karşılık gelen yaklaşık eklem merkezleri (AR hizalaması için).',
    leftShoulder: joints['shoulder-L'], rightShoulder: joints['shoulder-R'],
    leftHip: joints['hip-L'], rightHip: joints['hip-R'],
  };
  manifest.joints = joints;
  manifest.validation.removedDuplicateRepresentations = manifestExtra.removedDuplicates;
  manifest.validation.zanatomyAlignment = alignment;
  manifest.validation.zanatomyRegistration = Object.fromEntries(Object.entries(registration)
    .map(([k, r]) => [k, { rmsMm: r.rmsMm, medianMm: r.medianMm, p90Mm: r.p90Mm, initialRmsMm: r.initialRmsMm, iterations: r.iterations }]));

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
    if (s.source === 'zanatomy') provenance.zanatomy.objects[s.id] = structParts.get(s.id).map((p) => p.name);
    else provenance.bodyparts3d.parts[s.id] = structParts.get(s.id).map((p) => ({ fj: p.fj, name: p.name, sha256: p.sha256 }));
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
          const prim = doc.createPrimitive().setAttribute('POSITION', pos).setAttribute('NORMAL', nor).setIndices(ind)
            .setMaterial(material(p.cls)).setExtras({ cls: p.cls, segment: p.segment });
          if (p.ao) {
            const col = new Float32Array(p.ao.length * 3);
            for (let i = 0; i < p.ao.length; i++) col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = p.ao[i];
            prim.setAttribute('COLOR_0', doc.createAccessor().setType('VEC3').setArray(col).setBuffer(buffer));
          }
          mesh.addPrimitive(prim);
        }
        scene.addChild(doc.createNode(s.id).setMesh(mesh).setExtras({ id: s.id, layer }));
        tris += data.tris;
      }
      doc.getRoot().getAsset().copyright = layer === 'muscles'
        ? `${SOURCES.zanatomy.copyright}; ${SOURCES.bodyparts3d.copyright}. Adapted by icgor-saglik (CC BY-SA 4.0).`
        : `${SOURCES.bodyparts3d.copyright}. Adapted by icgor-saglik (CC BY-SA 4.0).`;
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

Bu klasördeki model dosyaları (\`*.glb\`) üçüncü taraf açık veriden **türetilmiştir**.
Uygulamanın kaynak kodu bu lisanstan ayrıdır.

> Bu modeller genel referans anatomidir; herhangi bir kişinin tıbbi taraması değildir.

## BodyParts3D (deri, iskelet, organlar, damarlar, sinirler)

- Atıf: **${B.copyright}**
- Kaynak: ${B.licenseUrl} · Ayna: ${B.mirror} (commit \`${B.commit}\`, ${B.mirrorDoi})
- Yayın: ${B.citation}
- Lisans notu: ${B.licenseNote}
- **Bu klasördeki türev dosyalar: CC BY-SA 4.0** — https://creativecommons.org/licenses/by-sa/4.0/

### Yapılan değişiklikler (uyarlama)

- Birim mm → m, eksenler Z-yukarı → Y-yukarı; vücut ayak tabanı y=0 olacak şekilde ortalandı.
- Parçalar anatomik yapılara birleştirildi; yinelenen temsiller ayıklandı.
- meshoptimizer ile iki ayrıntı düzeyine sadeleştirildi (high / low), normaller yeniden hesaplandı,
  EXT_meshopt_compression ile sıkıştırıldı.
- Her parçanın kaynak kimliği ve SHA-256 özeti: \`provenance.json\`.

## Z-Anatomy (kaslar ve tendonlar: \`muscles.glb\`)

- Atıf: **${SOURCES.zanatomy.copyright}**
- Kaynak: ${SOURCES.zanatomy.repo} (commit \`${SOURCES.zanatomy.commit}\`, \`${SOURCES.zanatomy.path}\`, SHA-256 \`${SOURCES.zanatomy.zipSha256}\`)
- Lisans: **CC BY-SA 4.0** — ${SOURCES.zanatomy.licenseUrl}. Türev dosya da CC BY-SA 4.0.
- Uyarlama: Blender değiştiricileri uygulanmış geometri dışa aktarıldı (bpy), fasya/bursa/kılıf gibi ince zarlar
  çıkarıldı, kaslar işlevsel gruplara ayrıldı ve sadeleştirildi.
- Z-Anatomy iskeleti BodyParts3D'ninkinden ~1 cm farklı konumlandırıldığı için kaslar, 12 bölgede (4 gövde + 8 uzuv) kemik
  yüzeylerinin afin ICP kaydıyla BodyParts3D iskeletine taşındı (segment RMS en fazla
  ${Math.max(...Object.values(m.validation.zanatomyRegistration).map((r) => r.rmsMm))} mm; kemik merkezleri
  ${m.validation.zanatomyAlignment.map((a) => `${a.bone} ${a.beforeMm} → ${a.distanceMm} mm`).join(', ')}).

## Doğrulama için kullanılan (dağıtılmayan) veri

- ${H.title} — ${H.copyright}. Lisans: CC BY 4.0 (${H.licenseUrl}). Yayın: ${H.citation}
- Yalnızca derleme sırasında, konumların bağımsız çapraz kontrolü için kullanılır
  (${m.validation.landmarks} ortak yapı, kayıt RMS ${m.validation.rmsMm} mm). Bu klasörde HRA geometrisi yoktur.
`;
}

main().catch((e) => { console.error(e); process.exit(1); });
