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
import * as THREE from '../../vendor/three/build/three.module.js';
import { GLTFLoader } from '../../vendor/three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from '../../vendor/three/examples/jsm/libs/meshopt_decoder.module.js';
import { Rig, SEGMENTS } from '../../src/three/rig.js';

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
    meshes.push({ o, seg: SEGMENTS.includes(seg) ? seg : 'trunk', base: o.matrix.clone(), restParent, restParentInv: restParent.clone().invert(), pos0: o.geometry.attributes.position.array.slice() });
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
        const pos = m.o.geometry.attributes.position;
        const a = pos.array;
        const w = new THREE.Vector3();
        const toWorld = m.restParent.clone().multiply(m.base);
        const toLocal = toWorld.clone().invert();
        for (let i = 0; i < a.length; i += 3) {
          w.set(m.pos0[i], m.pos0[i + 1], m.pos0[i + 2]).applyMatrix4(toWorld);
          const k = Math.min(1, Math.max(0, (w.y - neckY) / 0.12));
          w.z += hf * k * k * (3 - 2 * k);
          w.applyMatrix4(toLocal);
          a[i] = w.x; a[i + 1] = w.y; a[i + 2] = w.z;
        }
        pos.needsUpdate = true;
        m.o.geometry.computeBoundingSphere();
      }
    }
    body.position.set(p.x ?? 0, 0, 0);
    body.rotation.set(0, p.yaw ?? 0, 0);
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

  return { render, renderer, canvas: renderer.domElement, manifest };
}
