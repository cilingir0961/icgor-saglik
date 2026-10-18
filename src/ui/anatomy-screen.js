// 3B anatomi ekranı: görüntüleyici + katman paneli + yapı listesi + detay paneli + etiketler.

import { AnatomyViewer, HIDDEN_BY_DEFAULT } from '../three/anatomy-viewer.js';
import { hasWebGL2 } from '../three/assets.js';
import { chooseLod, browserLodEnv } from '../three/lod.js';
import { ORGAN_INFO, SYSTEMS, LAYERS, organName } from '../anatomy/organ-info.js';
import { MATERIALS } from '../three/palette.js';
import { layoutLabels } from '../render/labels.js';

const $ = (id) => document.getElementById(id);
const SVG_NS = 'http://www.w3.org/2000/svg';
const LAYER_IDS = ['organs', 'skeleton', 'skin'];
const SWATCH = { skin: 'skin', skeleton: 'bone' };
const LABEL_PRIORITY = ['heart', 'lung-right', 'lung-left', 'liver', 'stomach', 'brain', 'kidney-right', 'kidney-left',
  'large-intestine', 'small-intestine', 'spleen', 'bladder', 'pancreas', 'gallbladder', 'airways', 'esophagus', 'diaphragm',
  'skull', 'ribcage', 'spine', 'pelvis', 'upper-limb-bones', 'lower-limb-bones'];

export async function createAnatomyScreen() {
  const viewport = $('anatomy-viewport');
  const loading = $('anatomy-loading');
  const errorBox = $('anatomy-error');

  if (!hasWebGL2()) {
    loading.hidden = true;
    errorBox.hidden = false;
    $('anatomy-error-title').textContent = '3B görüntüleme desteklenmiyor';
    $('anatomy-error-text').textContent = 'Bu tarayıcı veya cihaz WebGL2 desteklemiyor. Basit (şematik) görünümü kullanabilirsiniz.';
    $('btn-anatomy-retry').hidden = true;
    $('link-legacy').hidden = false;
    return { activate() {}, deactivate() {} };
  }

  const env = browserLodEnv(location, navigator);
  const lod = chooseLod(env);
  $('sel-quality').value = env.override ?? 'auto';
  $('quality-note').textContent = `Etkin: ${lod === 'high' ? 'yüksek ayrıntı' : 'düşük poligon (mobil)'} model.`;
  const viewer = new AnatomyViewer(viewport, { lod });
  window.__icgor = { viewer }; // test ve hata ayıklama için

  async function load() {
    loading.hidden = false;
    errorBox.hidden = true;
    const names = { organs: 'organlar', skeleton: 'iskelet', skin: 'deri' };
    try {
      await viewer.init((f, layer) => {
        $('anatomy-progress').style.width = `${Math.round(f * 100)}%`;
        $('anatomy-loading-text').textContent = `Anatomik model yükleniyor: ${names[layer] ?? ''}…`;
      });
      loading.hidden = true;
      buildStructureList();
      document.body.dataset.anatomyReady = 'true';
    } catch (e) {
      console.error(e);
      loading.hidden = true;
      errorBox.hidden = false;
      $('anatomy-error-text').textContent = navigator.onLine === false
        ? 'Çevrimdışı görünüyorsunuz. Bağlantınızı kontrol edip tekrar deneyin.'
        : `Model dosyaları alınamadı (${e.message ?? e}).`;
    }
  }
  $('btn-anatomy-retry').addEventListener('click', load);

  // ---------- Katmanlar ----------
  const rows = $('layer-rows');
  for (const id of LAYER_IDS) {
    const row = document.createElement('div');
    row.className = 'layer-row';
    row.innerHTML = '<label><input type="checkbox" checked role="switch"> <span></span></label><output></output><input type="range" min="0.05" max="1" step="0.05">';
    row.querySelector('span').textContent = LAYERS[id].tr;
    const range = row.querySelector('input[type="range"]');
    const out = row.querySelector('output');
    range.value = String(viewer.layers[id].opacity);
    range.setAttribute('aria-label', `${LAYERS[id].tr} saydamlığı`);
    out.textContent = `%${Math.round(viewer.layers[id].opacity * 100)}`;
    row.querySelector('input[type="checkbox"]').addEventListener('change', (e) => viewer.setLayerVisible(id, e.target.checked));
    range.addEventListener('input', () => {
      viewer.setLayerOpacity(id, Number(range.value));
      out.textContent = `%${Math.round(range.value * 100)}`;
    });
    row.dataset.layer = id;
    rows.append(row);
  }
  const layersBtn = $('btn-layers');
  layersBtn.addEventListener('click', () => {
    const open = $('layers-panel').hidden;
    $('layers-panel').hidden = !open;
    layersBtn.setAttribute('aria-expanded', String(open));
  });
  $('sel-quality').addEventListener('change', (e) => {
    try { localStorage.setItem('icgor.lod', e.target.value); } catch { /* özel mod */ }
    location.reload();
  });

  // ---------- Yapı listesi ----------
  function buildStructureList(filter = '') {
    const list = $('structure-list');
    list.textContent = '';
    const q = filter.trim().toLocaleLowerCase('tr');
    for (const layer of LAYER_IDS) {
      const items = viewer.manifest.structures.filter((s) => s.layer === layer
        && (!q || organName(s.id).toLocaleLowerCase('tr').includes(q) || s.en.toLowerCase().includes(q)));
      if (!items.length) continue;
      const h = document.createElement('h4');
      h.textContent = LAYERS[layer].tr;
      list.append(h);
      for (const s of items) {
        const st = viewer.structures.get(s.id);
        const row = document.createElement('div');
        row.className = 'structure-item';
        row.classList.toggle('hidden-struct', st && !st.visible);
        const sw = document.createElement('span');
        sw.className = 'swatch';
        sw.style.background = MATERIALS[SWATCH[layer] ?? clsOf(s.id)]?.color ?? '#888';
        const name = document.createElement('button');
        name.className = 'name';
        name.textContent = organName(s.id);
        name.addEventListener('click', () => { viewer.select(s.id); viewer.focus(s.id); });
        const eye = document.createElement('button');
        eye.className = 'icon-btn';
        const visible = !st || st.visible;
        eye.setAttribute('aria-label', `${organName(s.id)} ${visible ? 'gizle' : 'göster'}`);
        eye.innerHTML = `<svg><use href="#i-${visible ? 'eye' : 'eye-off'}"/></svg>`;
        eye.addEventListener('click', () => {
          viewer.setStructureVisible(s.id, !(viewer.structures.get(s.id)?.visible ?? true));
          buildStructureList($('structure-search').value);
        });
        row.append(sw, name, eye);
        list.append(row);
      }
    }
  }
  const clsOf = (id) => ({ 'lung-left': 'lung', 'lung-right': 'lung', 'kidney-left': 'kidney', 'kidney-right': 'kidney', airways: 'airway' })[id] ?? id;
  $('structure-search').addEventListener('input', (e) => buildStructureList(e.target.value));
  $('btn-structures').addEventListener('click', () => {
    $('detail-panel').hidden = true;
    $('structures-panel').hidden = !$('structures-panel').hidden;
    document.body.classList.toggle('panel-open', !$('structures-panel').hidden);
  });

  // ---------- Seçim ve detay paneli ----------
  let down = null;
  viewport.addEventListener('pointerdown', (e) => { down = { x: e.clientX, y: e.clientY, t: performance.now() }; });
  viewport.addEventListener('pointerup', (e) => {
    if (!down) return;
    const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y);
    down = null;
    if (moved > 6) return;
    viewer.select(viewer.pick(e.clientX, e.clientY));
  });

  viewer.addEventListener('select', (e) => showDetail(e.detail.id));
  function showDetail(id) {
    const panel = $('detail-panel');
    if (!id) {
      panel.hidden = true;
      document.body.classList.toggle('panel-open', !$('structures-panel').hidden);
      return;
    }
    const info = ORGAN_INFO[id];
    const s = viewer.byId[id];
    $('structures-panel').hidden = true;
    $('detail-name').textContent = info?.tr ?? id;
    $('detail-en').textContent = s?.en ?? '';
    $('detail-system').textContent = SYSTEMS[info?.system] ?? '';
    const src = $('detail-source');
    src.className = 'source-line';
    src.textContent = 'Atlas modeli: BodyParts3D (DBCLS) · genel referans anatomi, kişiye ait değil';
    $('detail-location').textContent = info?.location ?? '';
    $('detail-function').textContent = info?.function ?? '';
    const facts = $('detail-facts');
    facts.textContent = '';
    for (const f of info?.facts ?? []) {
      const li = document.createElement('li');
      li.textContent = f;
      facts.append(li);
    }
    $('detail-facts-wrap').hidden = !(info?.facts?.length);
    const st = viewer.structures.get(id);
    $('detail-opacity').value = String(st?.opacity ?? viewer.layers[st?.layer ?? 'organs'].opacity);
    $('btn-detail-isolate').setAttribute('aria-pressed', String(viewer.isolated === id));
    document.querySelector('.heart-only').hidden = id !== 'heart';
    $('chk-heart-sim').checked = viewer.heartSim.on;
    panel.hidden = false;
    panel.scrollTop = 0;
    document.body.classList.add('panel-open');
  }
  $('btn-detail-focus').addEventListener('click', () => viewer.focus(viewer.selected));
  $('btn-detail-isolate').addEventListener('click', () => {
    const id = viewer.selected;
    viewer.isolate(viewer.isolated === id ? null : id);
    $('btn-detail-isolate').setAttribute('aria-pressed', String(viewer.isolated === id));
  });
  $('btn-detail-hide').addEventListener('click', () => {
    const id = viewer.selected;
    viewer.setStructureVisible(id, false);
    viewer.select(null);
    buildStructureList($('structure-search').value);
  });
  $('detail-opacity').addEventListener('input', (e) => viewer.setStructureOpacity(viewer.selected, Number(e.target.value)));
  $('chk-heart-sim').addEventListener('change', (e) => {
    viewer.setHeartSimulation(e.target.checked);
    $('sim-badge').hidden = !e.target.checked;
  });
  document.addEventListener('panelclosed', (e) => { if (e.detail.id === 'detail-panel') viewer.select(null); });

  // ---------- Görünüm, etiketler, sıfırlama ----------
  for (const b of document.querySelectorAll('[data-view]')) {
    b.addEventListener('click', () => {
      viewer.setView(b.dataset.view);
      for (const o of document.querySelectorAll('[data-view]')) o.setAttribute('aria-pressed', String(o === b));
    });
  }
  let labelsOn = true;
  $('btn-labels').addEventListener('click', () => {
    labelsOn = !labelsOn;
    $('btn-labels').setAttribute('aria-pressed', String(labelsOn));
    drawLabels();
  });
  $('btn-reset').addEventListener('click', () => {
    viewer.resetView();
    viewer.setHeartSimulation(false);
    $('sim-badge').hidden = true;
    for (const s of viewer.structures.values()) { s.visible = !HIDDEN_BY_DEFAULT.has(s.id); s.opacity = null; }
    viewer.setLayerVisible('organs', true);
    buildStructureList();
    for (const o of document.querySelectorAll('[data-view]')) o.setAttribute('aria-pressed', String(o.dataset.view === 'front'));
  });

  // Etiketler: her çizimden sonra (throttle) yeniden yerleştirilir; çakışma layoutLabels ile önlenir.
  const labelBox = $('anatomy-labels');
  const lines = $('anatomy-lines');
  let labelQueued = false;
  viewer.addEventListener('render', () => {
    if (labelQueued) return;
    labelQueued = true;
    requestAnimationFrame(() => { labelQueued = false; drawLabels(); });
  });
  const measureCtx = document.createElement('canvas').getContext('2d');
  measureCtx.font = '600 12px system-ui, sans-serif';
  function drawLabels() {
    labelBox.textContent = '';
    lines.textContent = '';
    if (!labelsOn || !viewer.manifest) return;
    const narrow = viewer.width < 520;
    // Önem sırasına göre sınırlı sayıda etiket: küçük ekranda kalabalığı önler; seçili yapı her zaman etiketlenir.
    const max = viewer.isolated ? 1 : narrow ? 8 : 14;
    const rank = (id) => (id === viewer.selected ? -1 : (LABEL_PRIORITY.indexOf(id) + 1 || 99));
    const anchors = viewer.labelAnchors()
      .filter((a) => !viewer.isolated || a.id === viewer.isolated)
      .sort((a, b) => rank(a.id) - rank(b.id)).slice(0, max)
      .map((a) => ({ ...a, text: organName(a.id) }));
    const placed = layoutLabels(anchors, {
      width: viewer.width, height: viewer.height, lineHeight: narrow ? 24 : 22, margin: 8, gap: narrow ? 10 : 28,
      measure: (t) => measureCtx.measureText(t).width + 18,
    });
    for (const l of placed) {
      const el = document.createElement('button');
      el.className = `label${l.align === 'right' ? ' right' : ''}${viewer.selected === l.id ? ' selected' : ''}`;
      el.textContent = l.text;
      el.style.left = `${l.x}px`;
      el.style.top = `${l.y}px`;
      el.addEventListener('click', () => { viewer.select(l.id); });
      labelBox.append(el);
      const line = document.createElementNS(SVG_NS, 'line');
      line.setAttribute('x1', l.x); line.setAttribute('y1', l.y);
      line.setAttribute('x2', l.anchor[0]); line.setAttribute('y2', l.anchor[1]);
      const dot = document.createElementNS(SVG_NS, 'circle');
      dot.setAttribute('cx', l.anchor[0]); dot.setAttribute('cy', l.anchor[1]); dot.setAttribute('r', 2.5);
      lines.append(line, dot);
    }
  }

  // Açık panelin kapladığı alanı görüntüleyiciye bildir (mobil: alt sayfa yüksekliği, masaüstü: sağ panel).
  const desktop = matchMedia('(min-width: 900px)');
  function syncInsets() {
    const open = [$('detail-panel'), $('structures-panel')].find((p) => !p.hidden);
    if (!open) return viewer.setInsets({});
    const r = open.getBoundingClientRect();
    const v = viewport.getBoundingClientRect();
    if (desktop.matches) viewer.setInsets({ right: Math.max(0, v.right - r.left + 12) });
    else viewer.setInsets({ bottom: Math.max(0, v.bottom - r.top) });
  }
  const panelObserver = new ResizeObserver(syncInsets);
  for (const id of ['detail-panel', 'structures-panel']) {
    panelObserver.observe($(id));
    new MutationObserver(() => { syncInsets(); if (viewer.selected && !$('detail-panel').hidden) viewer.focus(viewer.selected); })
      .observe($(id), { attributes: true, attributeFilter: ['hidden'] });
  }
  desktop.addEventListener('change', syncInsets);
  viewport.addEventListener('pointerdown', () => { $('anatomy-hint').hidden = true; }, { once: true });

  await load();
  return {
    viewer,
    activate() { viewer.setActive(true); },
    deactivate() { viewer.setActive(false); $('layers-panel').hidden = true; },
  };
}
