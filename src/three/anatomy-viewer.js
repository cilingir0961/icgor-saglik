// Etkileşimli 3B anatomi görüntüleyici (three.js / WebGL2).
// Katmanlar: deri, kaslar, iskelet, organlar, damarlar, sinirler (son üçü istenince yüklenir).
// Yapı seçimi, tek başına inceleme, odaklama, saydamlık, görünüm ön ayarları ve AÇIKÇA SİMÜLASYON
// olarak işaretli 4D animasyonlar: iki evreli kalp atımı, solunum, eklem hareketleri.

import * as THREE from '../../vendor/three/build/three.module.js';
import { OrbitControls } from '../../vendor/three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from '../../vendor/three/examples/jsm/environments/RoomEnvironment.js';
import { loadLayer, loadManifest } from './assets.js';
import { createMaterial, applyOpacity } from './materials.js';
import { pixelRatioFor } from './lod.js';
import { Rig } from './rig.js';
import { heartCycle, heartScale, breathCycle, breathEffects, MOTIONS } from './animations.js';

// Solunumda aşağı itilen karın organları ve göreli katsayıları
const ABDOMINAL = { liver: 1, stomach: 1, spleen: 1, gallbladder: 1, pancreas: 0.8, 'kidney-left': 0.6, 'kidney-right': 0.6, 'small-intestine': 0.5, 'large-intestine': 0.5 };

const LAYER_ORDER = ['organs', 'skeleton', 'skin'];
const GHOST = 0.06;
// Diyafram opak bir kubbe olarak karın organlarını örter; isteğe bağlı gösterilir.
export const HIDDEN_BY_DEFAULT = new Set(['diaphragm']);
const ACCENT = new THREE.Color('#38bdf8');

export class AnatomyViewer extends EventTarget {
  /**
   * @param {HTMLElement} container
   * @param {{lod:'high'|'low'}} opts
   */
  constructor(container, { lod }) {
    super();
    this.container = container;
    this.lod = lod;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance', preserveDrawingBuffer: false });
    this.renderer.setPixelRatio(pixelRatioFor(lod, window.devicePixelRatio));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.setClearColor(0x000000, 0);
    container.append(this.renderer.domElement);

    this.scene = new THREE.Scene();
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environmentIntensity = 0.75;
    pmrem.dispose();
    const key = new THREE.DirectionalLight(0xfff1e0, 1.6);
    key.position.set(1.2, 2.6, 2.2);
    const rim = new THREE.DirectionalLight(0x9cc8ff, 0.9);
    rim.position.set(-1.5, 1.8, -2.4);
    this.scene.add(key, rim, new THREE.HemisphereLight(0xdde8ff, 0x1a1410, 0.35));

    this.camera = new THREE.PerspectiveCamera(32, 1, 0.01, 50);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    Object.assign(this.controls, { enableDamping: true, dampingFactor: 0.09, minDistance: 0.12, maxDistance: 6, rotateSpeed: 0.8, zoomSpeed: 0.9 });
    this.controls.touches = { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN };
    this.controls.addEventListener('change', () => this.requestRender());

    this.root = new THREE.Group();
    this.scene.add(this.root);
    /** @type {Map<string, {id, layer, pivot:THREE.Group, meshes:THREE.Mesh[], materials:THREE.Material[], info, visible:boolean, opacity:number|null}>} */
    this.structures = new Map();
    this.layers = {
      organs: { visible: true, opacity: 1, loaded: false },
      skeleton: { visible: true, opacity: 1, loaded: false },
      skin: { visible: true, opacity: 0.18, loaded: false },
      muscles: { visible: false, opacity: 1, loaded: false, lazy: true },
      vessels: { visible: false, opacity: 1, loaded: false, lazy: true },
      nerves: { visible: false, opacity: 1, loaded: false, lazy: true },
    };
    this.segmentMeshes = [];
    this.heartParts = null;
    this.anim = { heart: false, breath: false, motion: null, t0: 0 };
    this.selected = null;
    this.isolated = null;
    this.tween = null;
    this.needsRender = true;
    this.active = true;
    this.raycaster = new THREE.Raycaster();
    this.insets = { bottom: 0, right: 0 };

    this._resize = () => this.resize();
    new ResizeObserver(this._resize).observe(container);
    this.resize();
    this._loop = this._loop.bind(this);
    requestAnimationFrame(this._loop);
  }

  async init(onProgress) {
    this.manifest = await loadManifest();
    this.byId = Object.fromEntries(this.manifest.structures.map((s) => [s.id, s]));
    this.rig = new Rig(this.manifest.joints).setPose({});
    this.setView('front', false);
    // Önce organlar (en önemli içerik), sonra iskelet ve deri — isteğe bağlı yükleme.
    let done = 0;
    for (const layer of LAYER_ORDER) {
      await this.loadLayer(layer, (f) => onProgress?.((done + f) / LAYER_ORDER.length, layer));
      done++;
      onProgress?.(done / LAYER_ORDER.length, layer);
    }
  }

  async loadLayer(layer, onProgress) {
    if (this.layers[layer].loaded) return;
    if (this.layers[layer].loading) return this.layers[layer].loading;
    this.layers[layer].loading = this._loadLayer(layer, onProgress);
    try { await this.layers[layer].loading; } finally { this.layers[layer].loading = null; }
  }

  async _loadLayer(layer, onProgress) {
    const shared = await loadLayer(layer, this.lod, onProgress);
    const scene = shared.clone(true);
    for (const node of [...scene.children]) {
      const id = node.userData.id ?? node.name;
      const info = this.byId[id];
      const pivot = new THREE.Group();
      pivot.name = id;
      const c = info ? new THREE.Vector3(...info.centroid) : new THREE.Vector3();
      pivot.position.copy(c);
      node.position.sub(c);
      pivot.add(node);
      const meshes = [], materials = [];
      node.traverse((o) => {
        if (!o.isMesh) return;
        const cls = o.geometry.userData?.cls ?? o.material?.name ?? 'bone';
        o.material = createMaterial(o.material?.name || cls);
        o.material.vertexColors = Boolean(o.geometry.attributes.color); // pişirilmiş ortam kapatması
        o.userData.structureId = id;
        o.userData.cls = cls;
        o.userData.segment = o.geometry.userData?.segment ?? 'trunk';
        o.geometry.computeBoundingBox();
        o.renderOrder = layer === 'skin' ? 10 : layer === 'skeleton' ? 1 : 0;
        meshes.push(o);
        materials.push(o.material);
      });
      this.root.add(pivot);
      pivot.userData.basePos = pivot.position.clone();
      this.structures.set(id, { id, layer, pivot, meshes, materials, info, visible: !HIDDEN_BY_DEFAULT.has(id), opacity: null });
      // Eklem donanımına bağlı ağlar: dinlenme konumundaki üst dönüşüm saklanır (rig dünya uzayında çalışır).
      pivot.updateMatrixWorld(true);
      for (const m of meshes) {
        if (m.userData.segment === 'trunk') continue;
        m.userData.base = m.matrix.clone();
        m.userData.restParent = m.parent.matrixWorld.clone();
        m.userData.restParentInv = m.parent.matrixWorld.clone().invert();
        m.matrixAutoUpdate = false;
        this.segmentMeshes.push(m);
      }
      if (id === 'heart') this._prepareHeart(meshes);
    }
    this.layers[layer].loaded = true;
    this._applyRig();
    this._applyAll();
    this.dispatchEvent(new CustomEvent('layerloaded', { detail: { layer } }));
  }

  // ---------- Görünürlük ve saydamlık ----------

  setLayerVisible(layer, visible) {
    this.layers[layer].visible = visible;
    if (visible && !this.layers[layer].loaded) {
      this.dispatchEvent(new CustomEvent('layerloading', { detail: { layer } }));
      this.loadLayer(layer).catch((e) => this.dispatchEvent(new CustomEvent('layererror', { detail: { layer, error: e } })));
    }
    this._applyAll();
    this.dispatchEvent(new CustomEvent('layerchange', { detail: { layer } }));
  }
  setLayerOpacity(layer, opacity) {
    this.layers[layer].opacity = opacity;
    this._applyAll();
    this.dispatchEvent(new CustomEvent('layerchange', { detail: { layer } }));
  }
  setStructureVisible(id, visible) { const s = this.structures.get(id); if (s) { s.visible = visible; this._applyAll(); } }
  setStructureOpacity(id, opacity) { const s = this.structures.get(id); if (s) { s.opacity = opacity; this._applyAll(); } }

  /** Bir yapının etkin saydamlığı (katman × yapı × tek başına inceleme). */
  effectiveOpacity(s) {
    const L = this.layers[s.layer];
    if (!L.visible || !s.visible) return 0;
    if (this.anim.motion && s.layer === 'skin') return 0; // deri rijit segmentlerle deforme olamaz
    if (this.isolated && this.isolated !== s.id) return s.layer === 'skin' ? 0 : GHOST;
    if (this.isolated === s.id) return s.opacity ?? 1;
    if (this.highlighted) {
      if (s.layer === 'skin') return Math.min(L.opacity, 0.1);
      return this.highlighted.has(s.id) ? s.opacity ?? 1 : GHOST;
    }
    return s.opacity ?? L.opacity;
  }

  /**
   * Eğitim vurgusu: verilen yapılar belirgin, diğerleri soluk. İlgili tembel katmanlar açılır.
   * @param {string[]|null} ids
   */
  setHighlight(ids) {
    this.highlighted = ids?.length ? new Set(ids) : null;
    if (this.highlighted && this.manifest) {
      for (const id of this.highlighted) {
        const layer = this.byId[id]?.layer;
        if (layer && !this.layers[layer].visible) this.setLayerVisible(layer, true);
      }
    }
    this._applyAll();
  }

  /**
   * Dijital ikiz oranları (görsel yaklaşım): genel ölçek (boy) ve omuz genişliği oranı. İç yapılar atlas
   * referansıdır; bu ölçekleme kişinin organlarını göstermez.
   * @param {{overall:number, shoulderWidth:number}|null} t
   */
  setTwin(t) {
    this.twin = t ?? null;
    const k = t?.overall ?? 1, w = t?.shoulderWidth ?? 1;
    this.root.scale.set(k * w, k, k);
    this.root.updateMatrixWorld(true);
    this.requestRender();
  }

  _applyAll() {
    for (const s of this.structures.values()) {
      const op = this.effectiveOpacity(s);
      s.pivot.visible = op > 0.001;
      const sel = this.selected === s.id;
      const hl = this.highlighted?.has(s.id);
      for (const m of s.materials) {
        applyOpacity(m, op);
        m.emissive?.copy(sel || hl ? ACCENT : new THREE.Color(0));
        if (m.emissive) m.emissiveIntensity = sel ? 0.14 : hl ? 0.07 : 0;
      }
    }
    this.requestRender();
  }

  // ---------- Seçim, tek başına inceleme, odak ----------

  select(id) {
    this.selected = id && this.structures.has(id) ? id : null;
    this._applyAll();
    this.dispatchEvent(new CustomEvent('select', { detail: { id: this.selected } }));
  }

  isolate(id) {
    this.isolated = id;
    this._applyAll();
    if (id) this.focus(id);
    this.dispatchEvent(new CustomEvent('isolate', { detail: { id } }));
  }

  /** Kamerayı bir yapıya veya tüm gövdeye yöneltir (yumuşak geçiş). */
  focus(id, animate = true) {
    const s = id && this.byId[id];
    const min = s ? s.min : [-0.2, 0.85, -0.15];
    const max = s ? s.max : [0.2, 1.55, 0.15];
    const center = new THREE.Vector3((min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2);
    const radius = Math.max(0.05, new THREE.Vector3(max[0] - min[0], max[1] - min[1], max[2] - min[2]).length() / 2);
    const fov = THREE.MathUtils.degToRad(this.camera.fov);
    // Paneller görünür alanı daraltır: sığdırma, kalan alana göre yapılır.
    const visW = Math.max(1, this.width - this.insets.right), visH = Math.max(1, this.height - this.insets.bottom);
    const fovScale = visH / this.height;
    const aspectFit = Math.min(1, visW / visH) * fovScale;
    const dist = (radius / Math.sin(fov / 2)) / aspectFit * 0.95;
    const dir = this.camera.position.clone().sub(this.controls.target).normalize();
    this._moveTo(center, center.clone().add(dir.multiplyScalar(dist)), animate);
  }

  setView(name, animate = true) {
    const target = this.controls.target.lengthSq() ? this.controls.target.clone() : new THREE.Vector3(0, 1.2, 0);
    const d = this.camera.position.distanceTo(this.controls.target) || 2.4;
    const dirs = { front: [0, 0, 1], back: [0, 0, -1], left: [1, 0, 0], right: [-1, 0, 0] };
    const dir = new THREE.Vector3(...dirs[name] ?? dirs.front);
    if (!animate || !this.manifest) {
      this.controls.target.set(0, 1.2, 0);
      this.camera.position.set(0, 1.25, 0).add(dir.multiplyScalar(2.6));
      this.controls.update();
      this.requestRender();
      return;
    }
    this._moveTo(target, target.clone().add(dir.multiplyScalar(d)).add(new THREE.Vector3(0, 0.05, 0)), true);
  }

  resetView() {
    this.isolate(null);
    this.select(null);
    this._moveTo(new THREE.Vector3(0, 1.2, 0), new THREE.Vector3(0, 1.25, 2.6), true);
  }

  _moveTo(target, position, animate) {
    if (!animate) {
      this.controls.target.copy(target);
      this.camera.position.copy(position);
      this.controls.update();
      this.requestRender();
      return;
    }
    this.tween = {
      t0: performance.now(), dur: 650,
      fromT: this.controls.target.clone(), toT: target,
      fromP: this.camera.position.clone(), toP: position,
    };
    this.requestRender();
  }

  // ---------- 4D eğitim simülasyonları (gerçek fizyolojik ölçüm değildir) ----------

  /** @param {{heart?:boolean, breath?:boolean, motion?:string|null}} next */
  setAnimation(next) {
    const prevMotion = this.anim.motion;
    Object.assign(this.anim, next);
    if (!this.anim.t0) this.anim.t0 = performance.now();
    if (!this.anim.heart) this._applyHeart({ atria: 1, ventricles: 1 });
    if (!this.anim.breath) this._applyBreath(0);
    if (!this.anim.motion) { this.rig.setPose({}); this._applyRig(); }
    if (prevMotion !== this.anim.motion) this._applyAll(); // deri görünürlüğü
    this.requestRender();
    this.dispatchEvent(new CustomEvent('animchange', { detail: { ...this.anim } }));
  }

  /** Geriye uyumluluk: yalnızca kalp atımı. */
  setHeartSimulation(on) { this.setAnimation({ heart: on }); }
  get heartSim() { return { on: this.anim.heart }; }
  get animating() { return this.anim.heart || this.anim.breath || Boolean(this.anim.motion); }

  /** Kulakçık ve karıncık ağlarını ayırır; her grup kendi merkezi etrafında ölçeklenir. */
  _prepareHeart(meshes) {
    const centerOf = (list) => {
      const box = new THREE.Box3();
      for (const m of list) { m.geometry.computeBoundingBox(); box.union(m.geometry.boundingBox); }
      return box.getCenter(new THREE.Vector3());
    };
    const atria = meshes.filter((m) => m.userData.cls === 'heart-atrium');
    const ventricles = meshes.filter((m) => m.userData.cls !== 'heart-atrium');
    for (const m of meshes) { m.userData.heartBase = m.matrix.clone(); m.matrixAutoUpdate = false; }
    this.heartParts = { atria, ventricles, ca: centerOf(atria.length ? atria : meshes), cv: centerOf(ventricles) };
  }

  _applyHeart(sc) {
    if (!this.heartParts) return;
    const about = (c, k) => new THREE.Matrix4().makeTranslation(c.x, c.y, c.z)
      .multiply(new THREE.Matrix4().makeScale(k, k, k)).multiply(new THREE.Matrix4().makeTranslation(-c.x, -c.y, -c.z));
    const { atria, ventricles, ca, cv } = this.heartParts;
    for (const m of atria) m.matrix.copy(m.userData.heartBase).multiply(about(ca, sc.atria));
    for (const m of ventricles) m.matrix.copy(m.userData.heartBase).multiply(about(cv, sc.ventricles));
    for (const m of [...atria, ...ventricles]) m.matrixWorldNeedsUpdate = true;
  }

  _applyBreath(inhale) {
    const e = breathEffects(inhale);
    const set = (id, fn) => { const st = this.structures.get(id); if (st) fn(st.pivot, st.info); };
    for (const id of ['lung-left', 'lung-right']) {
      set(id, (p, info) => {
        // Akciğer tepesi sabit kalır, genişleme aşağı-öne-yana olur.
        const c = p.userData.basePos, a = new THREE.Vector3(c.x, info.max[1], c.z);
        const S = new THREE.Vector3(...e.lungScale);
        p.scale.copy(S);
        p.position.copy(a).add(c.clone().sub(a).multiply(S));
      });
    }
    set('diaphragm', (p) => p.position.copy(p.userData.basePos).add(new THREE.Vector3(0, -e.diaphragmDrop, 0)));
    set('heart', (p) => p.position.copy(p.userData.basePos).add(new THREE.Vector3(0, -e.heartDrop, 0)));
    for (const [id, k] of Object.entries(ABDOMINAL)) {
      set(id, (p) => p.position.copy(p.userData.basePos).add(new THREE.Vector3(0, -e.abdominalDrop * k, 0)));
    }
    set('ribcage', (p, info) => {
      // Kaburgalar omurga ekseni etrafında hafifçe genişler (ön-arka ve yanlara).
      const c = p.userData.basePos, a = new THREE.Vector3(0, c.y, info.min[2]);
      const S = new THREE.Vector3(...e.ribScale);
      p.scale.copy(S);
      p.position.copy(a).add(c.clone().sub(a).multiply(S));
    });
  }

  _applyRig() {
    if (!this.rig) return;
    const M = new THREE.Matrix4();
    for (const m of this.segmentMeshes) {
      const T = this.rig.matrices.get(m.userData.segment);
      if (!T) continue;
      // yerel = (üst_dinlenme)⁻¹ · T · üst_dinlenme · taban
      M.copy(m.userData.restParentInv).multiply(T).multiply(m.userData.restParent).multiply(m.userData.base);
      m.matrix.copy(M);
      m.matrixWorldNeedsUpdate = true;
    }
  }

  _tickAnimations(now) {
    // fixedT: belirli bir anı dondurur (test ve ekran görüntüsü için belirlenimci kare)
    const t = this.anim.fixedT ?? (now - this.anim.t0) / 1000;
    if (this.anim.heart) this._applyHeart(heartScale(heartCycle(t)));
    if (this.anim.breath) this._applyBreath(breathCycle(t).inhale);
    if (this.anim.motion && MOTIONS[this.anim.motion]) {
      this.rig.setPose(MOTIONS[this.anim.motion].pose(t));
      this._applyRig();
    }
  }

  // ---------- Seçme (raycast) ve etiketler ----------

  pick(clientX, clientY) {
    const r = this.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.camera);
    const candidates = [];
    for (const s of this.structures.values()) {
      const op = this.effectiveOpacity(s);
      if (op < 0.3 || (s.layer === 'skin' && op < 0.6)) continue;
      candidates.push(...s.meshes);
    }
    const hit = this.raycaster.intersectObjects(candidates, false)[0];
    return hit?.object.userData.structureId ?? null;
  }

  /** Görünür yapıların ekrandaki merkez noktaları (etiket yerleşimi için). */
  labelAnchors() {
    const out = [];
    const w = this.width, h = this.height;
    // Etiketlenecek katman: görünen en dıştaki içerik katmanı (opak kaslar organları örter)
    const L = this.layers;
    const vis = (k) => L[k].visible && L[k].loaded && L[k].opacity > 0.25;
    const labelLayer = vis('muscles') && L.muscles.opacity >= 0.5 ? 'muscles'
      : vis('organs') ? 'organs' : vis('vessels') ? 'vessels' : vis('nerves') ? 'nerves' : vis('muscles') ? 'muscles' : 'skeleton';
    // Opak dış katmanlarda (kas, iskelet) bağlantı yüzeyi kameraya bakmıyorsa etiket gizlenir
    // (ör. önden bakışta "Sırt kasları"). Organlar saydam deri altında her yönden görülebildiği için hariç.
    const facingTest = labelLayer === 'muscles' || labelLayer === 'skeleton';
    for (const s of this.structures.values()) {
      if (s.layer === 'skin' || !s.info) continue;
      if (this.highlighted) { if (!this.highlighted.has(s.id)) continue; }
      else if (!this.isolated && s.layer !== labelLayer) continue;
      const op = this.effectiveOpacity(s);
      if (op < 0.3) continue;
      // Etiket noktası yüzeydeki bağlantı noktası; eklem hareketinde segmentiyle birlikte taşınır
      let a = new THREE.Vector3(...(s.info.anchor ?? s.info.centroid));
      if ((this.highlighted ? s.layer === 'muscles' || s.layer === 'skeleton' : facingTest) && !this.animating) {
        const vis = this._visibleAnchor(s);
        if (vis) a = vis.clone();
        else if (!this.isolated && s.id !== this.selected && this._anchorCandidates(s).length) continue;
      }
      const segMesh = s.meshes.find((mm) => mm.userData.segment !== 'trunk' && mm.geometry.boundingBox?.containsPoint(a));
      if (segMesh) a.applyMatrix4(this.rig.matrices.get(segMesh.userData.segment));
      a.applyMatrix4(this.root.matrixWorld); // dijital ikiz ölçeği
      const v = a.project(this.camera);
      if (v.z > 1 || Math.abs(v.x) > 1.05 || Math.abs(v.y) > 1.05) continue;
      out.push({ id: s.id, anchor: [(v.x + 1) / 2 * w, (1 - v.y) / 2 * h] });
    }
    return out;
  }

  /**
   * Opak katmanlar için bağlantı adayları: manifest noktasına ≤ 8 cm uzaklıktaki tepe noktalarından
   * en fazla 256 tanesi (konum + normal, dinlenme pozunda model uzayında). İlk kullanımda bir kez hesaplanır.
   */
  _anchorCandidates(s) {
    if (s.candidates) return s.candidates;
    const a = new THREE.Vector3(...(s.info.anchor ?? s.info.centroid));
    const all = [];
    const p = new THREE.Vector3(), n = new THREE.Vector3();
    for (const m of s.meshes) {
      const pos = m.geometry.attributes.position, nor = m.geometry.attributes.normal;
      if (!nor) continue;
      m.updateWorldMatrix(true, false);
      const N = new THREE.Matrix3().getNormalMatrix(m.matrixWorld);
      const trunk = !m.userData.segment || m.userData.segment === 'trunk';
      const radial = new THREE.Vector3();
      for (let i = 0; i < pos.count; i++) {
        p.fromBufferAttribute(pos, i).applyMatrix4(m.matrixWorld);
        const d = p.distanceTo(a);
        if (d > 0.08) continue;
        // Gövdede yalnız dış yüzey: normal vücut ekseninden dışarı bakmalı (sırt kaslarının derin ön yüzü elenir)
        if (trunk && n.fromBufferAttribute(nor, i).applyMatrix3(N).dot(radial.set(p.x, 0, p.z).normalize()) < 0.25) continue;
        all.push({ pos: p.clone(), normal: n.fromBufferAttribute(nor, i).applyMatrix3(N).normalize().clone(), d });
      }
    }
    all.sort((x, y) => x.d - y.d);
    const step = Math.max(1, Math.ceil(all.length / 256));
    s.candidates = all.filter((_, i) => i % step === 0);
    return s.candidates;
  }

  /** Kameraya bakan en yakın aday (yoksa null → etiket arka yüzde kalır, gösterilmez). */
  _visibleAnchor(s) {
    let best = null, bestScore = -Infinity;
    const toCam = new THREE.Vector3();
    for (const c of this._anchorCandidates(s)) {
      const facing = c.normal.dot(toCam.copy(this.camera.position).sub(c.pos).normalize());
      if (facing < 0.45) continue;
      const score = facing - c.d * 8; // 8 cm uzaklık ≈ 0,64 yönelim puanı
      if (score > bestScore) { bestScore = score; best = c.pos; }
    }
    return best;
  }

  /**
   * Görünür alanı daraltan paneller (mobil alt sayfa, masaüstü sağ panel).
   * Projeksiyon merkezi kalan alanın ortasına kaydırılır; böylece seçilen yapı panelin arkasında kalmaz.
   */
  setInsets({ bottom = 0, right = 0 } = {}) {
    this.insets = { bottom, right };
    this._applyViewOffset();
  }

  _applyViewOffset() {
    const { bottom, right } = this.insets;
    if (!bottom && !right) this.camera.clearViewOffset();
    else this.camera.setViewOffset(this.width, this.height, right / 2, bottom / 2, this.width, this.height);
    this.camera.updateProjectionMatrix();
    this.requestRender();
  }

  // ---------- Döngü ----------

  setActive(active) {
    this.active = active;
    if (active) { this.resize(); this.requestRender(); }
  }

  requestRender() { this.needsRender = true; }

  resize() {
    const r = this.container.getBoundingClientRect();
    if (!r.width || !r.height) return;
    this.width = r.width;
    this.height = r.height;
    this.renderer.setSize(r.width, r.height, false);
    this.renderer.domElement.style.width = '100%';
    this.renderer.domElement.style.height = '100%';
    this.camera.aspect = r.width / r.height;
    this._applyViewOffset();
  }

  _loop(now) {
    requestAnimationFrame(this._loop);
    if (!this.active) return;
    let animating = false;
    if (this.tween) {
      const k = Math.min(1, (now - this.tween.t0) / this.tween.dur);
      const e = 1 - (1 - k) ** 3;
      this.controls.target.lerpVectors(this.tween.fromT, this.tween.toT, e);
      this.camera.position.lerpVectors(this.tween.fromP, this.tween.toP, e);
      if (k >= 1) this.tween = null;
      animating = true;
    }
    if (this.animating) {
      this._tickAnimations(now);
      animating = true;
    }
    if (this.controls.update()) animating = true;
    if (animating || this.needsRender) {
      this.needsRender = false;
      this.renderer.render(this.scene, this.camera);
      this.dispatchEvent(new Event('render'));
    }
  }

  get stats() {
    const i = this.renderer.info;
    return { calls: i.render.calls, triangles: i.render.triangles, geometries: i.memory.geometries, lod: this.lod };
  }
}
