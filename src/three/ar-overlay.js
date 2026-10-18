// Kamera görüntüsü üzerinde saydam 3B katman. Ortografik kamera: 1 birim = 1 CSS pikseli, y yukarı.
// Model matrisi ar-fit.js'deki afin uydurmadan gelir. Mobil performans için her zaman düşük LOD kullanılır.

import * as THREE from '../../vendor/three/build/three.module.js';
import { RoomEnvironment } from '../../vendor/three/examples/jsm/environments/RoomEnvironment.js';
import { loadLayer } from './assets.js';
import { createMaterial, applyOpacity } from './materials.js';
import { pixelRatioFor } from './lod.js';

export class ArOverlay {
  constructor(container) {
    this.container = container;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setPixelRatio(pixelRatioFor('low', window.devicePixelRatio));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.domElement.classList.add('ar-canvas');
    container.append(this.renderer.domElement);
    this.scene = new THREE.Scene();
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environmentIntensity = 0.8;
    pmrem.dispose();
    const key = new THREE.DirectionalLight(0xffffff, 1.4);
    key.position.set(0.3, 1, 1);
    this.scene.add(key, new THREE.HemisphereLight(0xffffff, 0x222222, 0.5));
    this.camera = new THREE.OrthographicCamera(0, 1, 1, 0, -5000, 5000);
    this.body = new THREE.Group();
    this.body.matrixAutoUpdate = false;
    this.body.visible = false;
    this.scene.add(this.body);
    this.layers = {};
    this.opacity = 0.75;
    this.resize();
    new ResizeObserver(() => this.resize()).observe(container);
  }

  async loadLayer(layer) {
    if (this.layers[layer]) return this.layers[layer];
    const scene = (await loadLayer(layer, 'low')).clone(true);
    const materials = [];
    scene.traverse((o) => {
      if (!o.isMesh) return;
      o.material = createMaterial(o.material?.name || 'bone');
      materials.push(o.material);
    });
    // Diyafram karın organlarını örter; AR'da gösterilmez.
    scene.getObjectByName('diaphragm')?.removeFromParent();
    this.layers[layer] = { group: scene, materials };
    this.body.add(scene);
    this.setOpacity(this.opacity);
    return this.layers[layer];
  }

  setLayerVisible(layer, visible) {
    if (this.layers[layer]) this.layers[layer].group.visible = visible;
    this.render();
  }

  setOpacity(opacity) {
    this.opacity = opacity;
    for (const L of Object.values(this.layers)) for (const m of L.materials) applyOpacity(m, opacity);
    this.render();
  }

  /** @param {number[]|null} elements three.js Matrix4 sütun öncelikli; null → gizle */
  setPose(elements) {
    if (!elements) {
      this.body.visible = false;
    } else {
      this.body.matrix.fromArray(elements);
      this.body.matrixWorldNeedsUpdate = true;
      this.body.visible = true;
    }
    this.render();
  }

  resize() {
    const r = this.container.getBoundingClientRect();
    if (!r.width || !r.height) return;
    this.width = r.width;
    this.height = r.height;
    this.renderer.setSize(r.width, r.height, false);
    this.renderer.domElement.style.width = '100%';
    this.renderer.domElement.style.height = '100%';
    Object.assign(this.camera, { left: 0, right: r.width, top: r.height, bottom: 0 });
    this.camera.updateProjectionMatrix();
    this.render();
  }

  render() { this.renderer.render(this.scene, this.camera); }

  dispose() {
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
