// Sentetik test figürü (yalnızca test/doğrulama): atlas ağlarını ten rengiyle çizer ve bilinen bir pozla
// konumlar. Yer gerçeği eklem merkezlerinin 3B konumu ve görüntüdeki normalize 2B izdüşümüdür.
// Gerçek insan değildir: giysi, saç, yumuşak doku deformasyonu yok. Sonuçlar ayrıca raporlanır.
//
// Poz parametreleri (hepsi isteğe bağlı):
//   pose            Rig pozu: {'shoulder-L': {plane|abduct|flex}, 'elbow-L': …, 'hip-L': …, 'knee-L': …}
//   trunkFlex       gövdenin kalça merkezinde öne eğilmesi (radyan, + öne)
//   trunkLean       gövdenin yana eğilmesi (radyan, + kişinin soluna)
//   shoulderRaise   {L: m, R: m} omuz yükseltme (kol segmentleri yukarı ötelenir)
//   legYaw          {L: rad, R: rad} bacağın dikey eksende dışa (+) dönmesi (ayak yönelimi)
//   headForward     baş ve boynun öne kayması (m); boyun tabanından yukarı yumuşak geçişle
//   yaw, x          tüm figürün dönmesi ve yana kayması; dist kamera uzaklığı (m); light ışık çarpanı
//   bodyScale       [sx, sy, sz] gövde ölçeği (siluet doğrulaması: daha geniş/derin "kişi")
import * as THREE from '../../vendor/three/build/three.module.js';
import { GLTFLoader } from '../../vendor/three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from '../../vendor/three/examples/jsm/libs/meshopt_decoder.module.js';
import { Rig, SEGMENTS } from '../../src/three/rig.js';
import { LEVELS, torsoSection, largestLoop } from '../../src/analysis/silhouette.js';

export const JOINTS = ['shoulder', 'elbow', 'wrist', 'hip', 'knee', 'ankle'];
const SEG_OF = { shoulder: 'upperArm', elbow: 'upperArm', wrist: 'forearm', hip: 'thigh', knee: 'thigh', ankle: 'leg' };

export async function createFigure({ width = 640, height = 480, layers = ['muscles', 'skeleton'], lod = 'high' } = {}) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  renderer.setSize(width, height);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  document.body.append(renderer.domElement);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#8a8f96');
  const hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 1.2);
  const key = new THREE.DirectionalLight(0xffffff, 1.8);
  key.position.set(0.5, 2, 2);
  scene.add(hemi, key);
  const camera = new THREE.PerspectiveCamera(50, width / height, 0.1, 20);
  const manifest = await (await fetch(new URL('../../assets/anatomy/manifest.json', import.meta.url))).json();
  const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  const skinMat = new THREE.MeshStandardMaterial({ color: '#c99a7e', roughness: 0.7 });
  const body = new THREE.Group();
  for (const layer of layers) {
    const g = await loader.loadAsync(new URL(`../../assets/anatomy/${lod}/${layer}.glb`, import.meta.url).href);
    body.add(g.scene);
  }
  scene.add(body);
  body.updateMatrixWorld(true);
  const meshes = [];
  body.traverse((o) => {
    if (!o.isMesh) return;
    o.material = skinMat;
    o.matrixAutoUpdate = false;
    const seg = o.geometry.userData?.segment;
    const restParent = o.parent.matrixWorld.clone();
    // Nicemlenmiş konumları Float32'ye çöz: deformasyon nicemleme aralığının dışına taşabilir
    const qa = o.geometry.attributes.position;
    if (!(qa.array instanceof Float32Array) || qa.normalized) {
      const f = new Float32Array(qa.count * 3);
      for (let i = 0; i < qa.count; i++) { f[i * 3] = qa.getX(i); f[i * 3 + 1] = qa.getY(i); f[i * 3 + 2] = qa.getZ(i); }
      o.geometry.setAttribute('position', new THREE.BufferAttribute(f, 3));
    }
    meshes.push({ o, seg: SEGMENTS.includes(seg) ? seg : 'trunk', base: o.matrix.clone(), restParent, restParentInv: restParent.clone().invert(), pos0: o.geometry.attributes.position.clone() });
  });
  const J = manifest.joints;
  const v3 = (p) => new THREE.Vector3(...p);
  const hipMid = v3(J['hip-L']).add(v3(J['hip-R'])).multiplyScalar(0.5);
  const neckY = (J['shoulder-L'][1] + J['shoulder-R'][1]) / 2; // boyun tabanı ≈ omuz eklemleri seviyesi
  const about = (c, R) => new THREE.Matrix4().makeTranslation(c.x, c.y, c.z).multiply(R).multiply(new THREE.Matrix4().makeTranslation(-c.x, -c.y, -c.z));

  function segmentMatrices(p) {
    const rig = new Rig(J).setPose(p.pose ?? {});
    const T = new THREE.Matrix4();
    if (p.trunkFlex || p.trunkLean) {
      T.copy(about(hipMid, new THREE.Matrix4().makeRotationX(p.trunkFlex ?? 0).multiply(new THREE.Matrix4().makeRotationZ(p.trunkLean ?? 0))));
    }
    const out = { trunk: T.clone() };
    for (const S of ['L', 'R']) {
      const raise = new THREE.Matrix4().makeTranslation(0, p.shoulderRaise?.[S] ?? 0, 0);
      for (const seg of [`upperArm-${S}`, `forearm-${S}`]) out[seg] = T.clone().multiply(raise).multiply(rig.matrices.get(seg));
      const yawM = about(v3(J[`hip-${S}`]), new THREE.Matrix4().makeRotationY((S === 'L' ? 1 : -1) * (p.legYaw?.[S] ?? 0)));
      for (const seg of [`thigh-${S}`, `leg-${S}`]) out[seg] = yawM.clone().multiply(rig.matrices.get(seg));
    }
    return out;
  }

  /** Bir pozu çizer, yer gerçeğini döndürür. */
  function render(p = {}) {
    const mats = segmentMatrices(p);
    const hf = p.headForward ?? 0;
    for (const m of meshes) {
      m.o.matrix.copy(m.restParentInv).multiply(mats[m.seg]).multiply(m.restParent).multiply(m.base);
      m.o.matrixWorldNeedsUpdate = true;
      if (m.seg === 'trunk') {
        // Baş-öne: boyun tabanından 12 cm yukarıda tam kayma (yerel koordinatlar dünya ile aynı ölçek/eksende)
        // Konumlar nicemlenmiş/normalize olabilir (meshopt): get/set ile çözülmüş değerler kullanılır
        const pos = m.o.geometry.attributes.position;
        const w = new THREE.Vector3();
        const toWorld = m.restParent.clone().multiply(m.base);
        const toLocal = toWorld.clone().invert();
        for (let i = 0; i < pos.count; i++) {
          w.fromBufferAttribute(m.pos0, i).applyMatrix4(toWorld);
          const k = Math.min(1, Math.max(0, (w.y - neckY) / 0.12));
          w.z += hf * k * k * (3 - 2 * k);
          w.applyMatrix4(toLocal);
          pos.setXYZ(i, w.x, w.y, w.z);
        }
        pos.needsUpdate = true;
        m.o.geometry.computeBoundingSphere();
      }
    }
    body.position.set(p.x ?? 0, 0, 0);
    body.rotation.set(0, p.yaw ?? 0, 0);
    body.scale.set(...(p.bodyScale ?? [1, 1, 1]));
    body.updateMatrix();
    body.matrixAutoUpdate = false;
    body.updateMatrixWorld(true);
    hemi.intensity = 1.2 * (p.light ?? 1);
    key.intensity = 1.8 * (p.light ?? 1);
    const dist = p.dist ?? 2.35;
    camera.position.set(0, p.camY ?? 1.3, dist);
    camera.lookAt(0, (p.camY ?? 1.3) - 0.12 * (dist / 2.35), 0);
    camera.updateMatrixWorld(true);
    renderer.render(scene, camera);

    const joints3d = {}, joints2d = {};
    for (const S of ['L', 'R']) for (const j of JOINTS) {
      const seg = `${SEG_OF[j]}-${S}`;
      const w = v3(J[`${j}-${S}`]).applyMatrix4(mats[seg]).applyMatrix4(body.matrixWorld);
      joints3d[`${j}-${S}`] = w.toArray();
      const v = w.clone().project(camera);
      joints2d[`${j}-${S}`] = [(v.x + 1) / 2, (1 - v.y) / 2];
    }
    return { joints3d, joints2d, params: p, camera: { position: camera.position.toArray(), fov: camera.fov, aspect: camera.aspect } };
  }

  /**
   * Yer gerçeği kesitler (metre): son çizilen pozda, figürün kendi ekseninde (dönme/öteleme hariç, ölçek dahil)
   * LEVELS düzeylerinde yatay dilim → gövde kümesinin genişliği, derinliği ve dışbükey zarf çevresi.
   */
  function sections(p = {}) {
    const S = new THREE.Vector3(...(p.bodyScale ?? [1, 1, 1]));
    const mats = segmentMatrices(p);
    const jy = (j, seg) => v3(J[j]).applyMatrix4(mats[seg]).multiply(S);
    const sh = jy('shoulder-L', 'upperArm-L').add(jy('shoulder-R', 'upperArm-R')).multiplyScalar(0.5);
    const hp = jy('hip-L', 'thigh-L').add(jy('hip-R', 'thigh-R')).multiplyScalar(0.5);
    const lh = jy('hip-L', 'thigh-L'), lk = jy('knee-L', 'thigh-L');
    const levels = {};
    for (const [id, L] of Object.entries(p.levelDefs ?? LEVELS)) {
      levels[id] = L.torso != null
        ? { y: sh.y + L.torso * (hp.y - sh.y), cx: sh.x + L.torso * (hp.x - sh.x) }
        : { y: lh.y + L.thigh * (lk.y - lh.y), cx: lh.x + L.thigh * (lk.x - lh.x) };
    }
    const inv = new THREE.Matrix4().makeRotationY(p.yaw ?? 0).premultiply(new THREE.Matrix4().makeTranslation(p.x ?? 0, 0, 0)).invert();
    const pts = Object.fromEntries(Object.keys(levels).map((k) => [k, []]));
    const segs = Object.fromEntries(Object.keys(levels).map((k) => [k, []]));
    const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
    for (const m of meshes) {
      const M = inv.clone().multiply(m.o.matrixWorld);
      const pos = m.o.geometry.attributes.position, idx = m.o.geometry.index;
      const n = idx ? idx.count : pos.count;
      for (let i = 0; i < n; i += 3) {
        const ia = idx ? idx.getX(i) : i, ib = idx ? idx.getX(i + 1) : i + 1, ic = idx ? idx.getX(i + 2) : i + 2;
        a.fromBufferAttribute(pos, ia).applyMatrix4(M); b.fromBufferAttribute(pos, ib).applyMatrix4(M); c.fromBufferAttribute(pos, ic).applyMatrix4(M);
        const lo = Math.min(a.y, b.y, c.y), hi = Math.max(a.y, b.y, c.y);
        for (const [k, L] of Object.entries(levels)) {
          if (L.y < lo || L.y > hi) continue;
          const hit = [];
          for (const [u, v] of [[a, b], [b, c], [c, a]]) {
            if ((u.y - L.y) * (v.y - L.y) > 0 || u.y === v.y) continue;
            // Kenar yönünden bağımsız aynı nokta (komşu üçgenlerde birebir eşleşsin)
            const [p0, p1] = u.y < v.y || (u.y === v.y && u.x < v.x) ? [u, v] : [v, u];
            const t = (L.y - p0.y) / (p1.y - p0.y);
            hit.push([p0.x + t * (p1.x - p0.x), p0.z + t * (p1.z - p0.z)]);
          }
          pts[k].push(...hit);
          if (hit.length === 2) segs[k].push(hit);
        }
      }
    }
    // Tek parça yüzey (deri): en büyük kapalı halka = gövde (yaslı kollar ayrı halka). Çok parçalı figür
    // (kas + kemik): x boşluklu küme + dışbükey zarf.
    return Object.fromEntries(Object.entries(levels).map(([k, L]) => [k, { y: L.y, ...(p.loops ? largestLoop(segs[k]) : torsoSection(pts[k], L.cx)) }]));
  }

  return { render, sections, renderer, canvas: renderer.domElement, manifest };
}
