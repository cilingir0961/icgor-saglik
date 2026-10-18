// Test fikstürü: deri modelini opak çizerek "web kamerası karşısındaki kişi" görüntüsü üretir.
// Sahte kamera videosu (Y4M) üretmek ve vücut takibini uçtan uca test etmek için kullanılır.
import * as THREE from '../../vendor/three/build/three.module.js';
import { GLTFLoader } from '../../vendor/three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from '../../vendor/three/examples/jsm/libs/meshopt_decoder.module.js';

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
const gltf = await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).loadAsync('../../assets/anatomy/high/skin.glb');
gltf.scene.traverse((o) => { if (o.isMesh) o.material = new THREE.MeshStandardMaterial({ color: '#c99a7e', roughness: 0.7 }); });
scene.add(gltf.scene);
// ?x=…&yaw=… ile kişiyi kaydır/döndür (hareket testi)
const q = new URLSearchParams(location.search);
gltf.scene.position.x = Number(q.get('x') ?? 0);
gltf.scene.rotation.y = Number(q.get('yaw') ?? 0);
camera.position.set(0, 1.3, 2.35);
camera.lookAt(0, 1.18, 0);
renderer.render(scene, camera);
// Yer gerçeği: eklem merkezlerinin (manifest) video karesindeki normalize konumu.
const manifest = await (await fetch('../../assets/anatomy/manifest.json')).json();
const truth = {};
for (const [k, p] of Object.entries(manifest.landmarks)) {
  if (!Array.isArray(p)) continue;
  const v = new THREE.Vector3(...p).add(gltf.scene.position).project(camera);
  truth[k] = [(v.x + 1) / 2, (1 - v.y) / 2];
}
document.body.dataset.truth = JSON.stringify(truth);
document.body.dataset.ready = 'true';
