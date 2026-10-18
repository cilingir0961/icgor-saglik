// Anatomi model dosyalarının isteğe bağlı (lazy) yüklenmesi ve önbelleklenmesi.
// Aynı katman birden fazla ekranda (3B, kamera) kullanılırsa ağ ve çözme işi bir kez yapılır;
// her ekran sahne grafiğini klonlar (geometriler paylaşılır, malzemeler ekrana özeldir).

import { GLTFLoader } from '../../vendor/three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from '../../vendor/three/examples/jsm/libs/meshopt_decoder.module.js';

const BASE = 'assets/anatomy/';
let manifestPromise = null;
const layerCache = new Map();
const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);

export function loadManifest() {
  manifestPromise ??= fetch(`${BASE}manifest.json`).then((r) => {
    if (!r.ok) throw new Error(`manifest ${r.status}`);
    return r.json();
  });
  return manifestPromise;
}

/**
 * @param {'skin'|'skeleton'|'organs'} layer
 * @param {'high'|'low'} lod
 * @param {(fraction:number)=>void} [onProgress]
 * @returns {Promise<import('three').Group>} paylaşılan sahne (klonlayarak kullanın)
 */
export function loadLayer(layer, lod, onProgress) {
  const key = `${lod}/${layer}`;
  if (!layerCache.has(key)) {
    const p = new Promise((resolve, reject) => {
      loader.load(`${BASE}${key}.glb`, (gltf) => resolve(gltf.scene), (e) => {
        if (onProgress && e.total) onProgress(e.loaded / e.total);
      }, reject);
    });
    p.catch(() => layerCache.delete(key)); // hata olursa yeniden denemeye izin ver
    layerCache.set(key, p);
  }
  return layerCache.get(key);
}

/** WebGL2 desteği (three.js r163+ WebGL2 gerektirir). */
export function hasWebGL2() {
  try {
    const c = document.createElement('canvas');
    return Boolean(c.getContext('webgl2'));
  } catch {
    return false;
  }
}
