// Test fikstürü: deri modelini opak çizerek "web kamerası karşısındaki kişi" görüntüsü üretir.
// Sahte kamera videosu (Y4M) üretmek ve vücut takibini uçtan uca test etmek için kullanılır.
import * as THREE from '../../vendor/three/build/three.module.js';
import { GLTFLoader } from '../../vendor/three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from '../../vendor/three/examples/jsm/libs/meshopt_decoder.module.js';
import { Rig } from '../../src/three/rig.js';

const W = 640, H = 480;
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setSize(W, H);
renderer.outputColorSpace = THREE.SRGBColorSpace;
document.body.append(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color('#8a8f96');
scene.add(new THREE.HemisphereLight(0xffffff, 0x444444, 1.2));
const key = new THREE.DirectionalLight(0xffffff, 1.8);
key.position.set(0.5, 2, 2);
scene.add(key);
const camera = new THREE.PerspectiveCamera(50, W / H, 0.1, 10);
const q = new URLSearchParams(location.search);
const manifest = await (await fetch('../../assets/anatomy/manifest.json')).json();
const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
const skinMat = new THREE.MeshStandardMaterial({ color: '#c99a7e', roughness: 0.7 });
// ?pose=arms: kollar kaldırılmış figür (uzuv takibi testi). Deri bölütlenmediğinden kas + iskelet
// katmanları ten rengiyle çizilir ve Rig ile pozlanır; yer gerçeği eklemlerin dönüştürülmüş konumudur.
const POSES = {
  arms: { 'shoulder-L': { plane: 1.0 }, 'elbow-L': { plane: 0.6 }, 'shoulder-R': { plane: -0.7 }, 'elbow-R': { plane: 0 } },
};
const poseName = q.get('pose');
const rig = new Rig(manifest.joints).setPose(POSES[poseName] ?? {});
const gltf = { scene: new THREE.Group() };
for (const layer of poseName ? ['muscles', 'skeleton'] : ['skin']) {
  const g = await loader.loadAsync(`../../assets/anatomy/high/${layer}.glb`);
  gltf.scene.add(g.scene);
}
gltf.scene.updateMatrixWorld(true);
gltf.scene.traverse((o) => {
  if (!o.isMesh) return;
  o.material = skinMat;
  const seg = o.geometry.userData?.segment;
  const T = seg && rig.matrices.get(seg);
  if (T) {
    const restParent = o.parent.matrixWorld.clone();
    o.matrix.copy(restParent.clone().invert().multiply(T).multiply(restParent).multiply(o.matrix));
    o.matrixAutoUpdate = false;
  }
});
scene.add(gltf.scene);
// ?x=…&yaw=… ile kişiyi kaydır/döndür (hareket testi)
gltf.scene.position.x = Number(q.get('x') ?? 0);
gltf.scene.rotation.y = Number(q.get('yaw') ?? 0);
camera.position.set(0, 1.3, 2.35);
camera.lookAt(0, 1.18, 0);
renderer.render(scene, camera);
// Yer gerçeği: eklem merkezlerinin (manifest) video karesindeki normalize konumu.
const truth = {};
for (const [k, p] of Object.entries(manifest.landmarks)) {
  if (!Array.isArray(p)) continue;
  const v = new THREE.Vector3(...p).add(gltf.scene.position).project(camera);
  truth[k] = [(v.x + 1) / 2, (1 - v.y) / 2];
}
const LIMB = { leftElbow: ['elbow-L', 'upperArm-L'], leftWrist: ['wrist-L', 'forearm-L'], rightElbow: ['elbow-R', 'upperArm-R'], rightWrist: ['wrist-R', 'forearm-R'] };
for (const [k, [j, seg]] of Object.entries(LIMB)) {
  const v = new THREE.Vector3(...rig.transformPoint(seg, manifest.joints[j])).add(gltf.scene.position).project(camera);
  truth[k] = [(v.x + 1) / 2, (1 - v.y) / 2];
}
if (POSES[poseName]) truth.pose = Object.fromEntries(Object.entries(POSES[poseName]).map(([k, v]) => [k, v.plane]));
document.body.dataset.truth = JSON.stringify(truth);
document.body.dataset.ready = 'true';
