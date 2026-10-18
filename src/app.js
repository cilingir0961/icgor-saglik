// Uygulama denetleyicisi: DOM, olaylar ve çizim döngüsü.
// Hesaplama mantığı saf modüllerde (anatomy/, render/scene.js) durur; burası yalnızca bağlar.

import { ORGANS } from './anatomy/atlas.js';
import { computeBodyFrame, FRAME_ERROR_MESSAGES_TR } from './anatomy/body-frame.js';
import { buildOrganMeshes, buildDrawList, orbitTransform } from './render/scene.js';
import { paintDrawList, paintLabels } from './render/canvas-renderer.js';
import { CameraSource, describeCameraError } from './camera/camera-source.js';
import { DicomViewer, loadDicomFiles, PLANES } from './dicom/viewer.js';
import { makePhantom } from './dicom/phantom.js';

const $ = (sel) => document.querySelector(sel);
const canvas = $('#stage');
const ctx = canvas.getContext('2d');
const video = $('#video');
const statusEl = $('#status');
const camera = new CameraSource(video);
const meshes = buildOrganMeshes(ORGANS);
const viewer = new DicomViewer();

const LANDMARKS = [
  { key: 'rightShoulder', label: 'Sağ omuz' },
  { key: 'leftShoulder', label: 'Sol omuz' },
  { key: 'rightHip', label: 'Sağ kalça' },
  { key: 'leftHip', label: 'Sol kalça' },
];

const state = {
  mode: 'camera', // 'camera' | 'orbit' | 'dicom'
  notice: null, // geçici uyarı: {text, until}
  visible: new Set(ORGANS.map((o) => o.id)),
  labels: true,
  alpha: 0.8,
  landmarks: null, // CSS piksel cinsinden, ekranda görüldüğü haliyle
  orbit: { yaw: 0.5, pitch: -0.15, zoom: 1 },
  width: 0,
  height: 0,
  dirty: true,
};

// ---------- Yerleşim ----------

function defaultLandmarks(w, h, mirrored) {
  // Ayna görüntüde kişinin solu ekranın solunda görünür.
  const s = mirrored ? -1 : 1;
  const cx = w / 2, sw = Math.min(w * 0.36, h * 0.3);
  const top = h * 0.3, bottom = top + sw * 1.35;
  return {
    leftShoulder: [cx + (s * sw) / 2, top],
    rightShoulder: [cx - (s * sw) / 2, top],
    leftHip: [cx + (s * sw) / 2.6, bottom],
    rightHip: [cx - (s * sw) / 2.6, bottom],
  };
}

function resize() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const r = canvas.getBoundingClientRect();
  state.width = r.width;
  state.height = r.height;
  canvas.width = Math.round(r.width * dpr);
  canvas.height = Math.round(r.height * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  if (!state.landmarks) state.landmarks = defaultLandmarks(r.width, r.height, mirroredView());
  state.dirty = true;
}

const mirroredView = () => camera.active && camera.mirrored;

// ---------- Çizim ----------

function drawVideoCover() {
  const vw = video.videoWidth, vh = video.videoHeight;
  if (!vw || !vh) return;
  const s = Math.max(state.width / vw, state.height / vh);
  const dw = vw * s, dh = vh * s;
  ctx.save();
  if (mirroredView()) {
    ctx.translate(state.width, 0);
    ctx.scale(-1, 1);
  }
  ctx.drawImage(video, (state.width - dw) / 2, (state.height - dh) / 2, dw, dh);
  ctx.restore();
}

function drawPlaceholderBody() {
  const lm = state.landmarks;
  ctx.fillStyle = '#1d2630';
  ctx.fillRect(0, 0, state.width, state.height);
  ctx.fillStyle = '#2c3a48';
  ctx.beginPath();
  ctx.moveTo(...lm.rightShoulder);
  ctx.lineTo(...lm.leftShoulder);
  ctx.lineTo(...lm.leftHip);
  ctx.lineTo(...lm.rightHip);
  ctx.closePath();
  ctx.fill();
}

function drawHandles() {
  ctx.font = '600 11px system-ui, sans-serif';
  ctx.textAlign = 'center';
  for (const { key, label } of LANDMARKS) {
    const [x, y] = state.landmarks[key];
    ctx.beginPath();
    ctx.arc(x, y, 11, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(64,170,255,0.35)';
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#40aaff';
    ctx.stroke();
    ctx.fillStyle = '#fff';
    ctx.fillText(label, x, y - 18);
  }
}

function render() {
  ctx.clearRect(0, 0, state.width, state.height);
  if (state.mode === 'camera') {
    if (camera.active) drawVideoCover();
    else drawPlaceholderBody();
    const res = computeBodyFrame(state.landmarks, { mirrored: mirroredView() });
    if (res.ok) {
      const toScreen = res.frame.toScreen;
      paintDrawList(ctx, buildDrawList(meshes, toScreen, { visible: state.visible, alpha: state.alpha }));
      if (state.labels) paintLabels(ctx, ORGANS, toScreen, state.visible, { width: state.width, height: state.height });
      setStatus(res.frame.view === 'anterior' ? 'Önden görünüm (şematik)' : 'Arkadan görünüm (şematik)');
    } else {
      setStatus(FRAME_ERROR_MESSAGES_TR[res.reason] ?? res.reason, true);
    }
    drawHandles();
  } else if (state.mode === 'dicom') {
    viewer.draw(ctx, state.width, state.height);
    setStatus(viewer.vol ? 'Kaydırarak/tekerle kesit değiştirin, dokunarak değer okuyun' : 'DICOM aç veya Fantom ile başlayın');
    syncDicomControls();
  } else {
    ctx.fillStyle = '#10161c';
    ctx.fillRect(0, 0, state.width, state.height);
    const toScreen = orbitTransform({ ...state.orbit, width: state.width, height: state.height });
    paintDrawList(ctx, buildDrawList(meshes, toScreen, { visible: state.visible, alpha: state.alpha }));
    if (state.labels) paintLabels(ctx, ORGANS, toScreen, state.visible, { width: state.width, height: state.height });
    setStatus('Serbest 3B görünüm: sürükleyerek döndürün, iki parmakla/tekerle yakınlaştırın');
  }
}

function setStatus(text, warn = false) {
  // Geçici uyarı (ör. kamera izni reddedildi) süresi dolana kadar normal durumu bastırır.
  if (state.notice && performance.now() < state.notice.until) ({ text, warn } = { text: state.notice.text, warn: true });
  if (statusEl.textContent !== text) statusEl.textContent = text;
  statusEl.classList.toggle('warn', warn);
}

function notify(text, ms = 6000) {
  state.notice = { text, until: performance.now() + ms };
  state.dirty = true;
  setTimeout(() => { state.dirty = true; }, ms + 50);
}

function loop() {
  if (state.dirty || (state.mode === 'camera' && camera.active)) {
    render();
    state.dirty = false;
  }
  requestAnimationFrame(loop);
}

// ---------- Etkileşim (fare + dokunmatik için Pointer Events) ----------

const pointers = new Map();
let dragKey = null;
let pinchStart = null;
let dicomDrag = null;

canvas.addEventListener('pointerdown', (e) => {
  canvas.setPointerCapture(e.pointerId);
  pointers.set(e.pointerId, [e.offsetX, e.offsetY]);
  if (state.mode === 'camera') {
    dragKey = nearestHandle(e.offsetX, e.offsetY);
  } else if (state.mode === 'dicom') {
    dicomDrag = { y: e.offsetY, start: viewer.sliceIndex, moved: false };
  } else if (pointers.size === 2) {
    pinchStart = { dist: pointerDistance(), zoom: state.orbit.zoom };
  }
});

canvas.addEventListener('pointermove', (e) => {
  const prev = pointers.get(e.pointerId);
  if (!prev) return;
  const cur = [e.offsetX, e.offsetY];
  pointers.set(e.pointerId, cur);
  if (state.mode === 'camera') {
    if (dragKey) state.landmarks[dragKey] = clampToStage(cur);
  } else if (state.mode === 'dicom') {
    if (dicomDrag && Math.abs(cur[1] - dicomDrag.y) > 6) dicomDrag.moved = true;
    if (dicomDrag?.moved) viewer.setSlice(dicomDrag.start + (cur[1] - dicomDrag.y) / 4);
  } else if (pointers.size === 2 && pinchStart) {
    state.orbit.zoom = clamp(pinchStart.zoom * (pointerDistance() / pinchStart.dist), 0.4, 4);
  } else if (pointers.size === 1) {
    state.orbit.yaw += (cur[0] - prev[0]) * 0.01;
    state.orbit.pitch = clamp(state.orbit.pitch + (cur[1] - prev[1]) * 0.01, -1.4, 1.4);
  }
  state.dirty = true;
});

const endPointer = (e) => {
  pointers.delete(e.pointerId);
  if (state.mode === 'dicom' && dicomDrag && !dicomDrag.moved && e.type === 'pointerup') {
    viewer.probeAt(e.offsetX, e.offsetY); // dokunma = değer okuma
    state.dirty = true;
  }
  if (pointers.size === 0) dicomDrag = null;
  if (pointers.size < 2) pinchStart = null;
  if (pointers.size === 0) dragKey = null;
};
canvas.addEventListener('pointerup', endPointer);
canvas.addEventListener('pointercancel', endPointer);

canvas.addEventListener('wheel', (e) => {
  if (state.mode === 'dicom') {
    e.preventDefault();
    viewer.setSlice(viewer.sliceIndex + Math.sign(e.deltaY));
    state.dirty = true;
    return;
  }
  if (state.mode !== 'orbit') return;
  e.preventDefault();
  state.orbit.zoom = clamp(state.orbit.zoom * Math.exp(-e.deltaY * 0.001), 0.4, 4);
  state.dirty = true;
}, { passive: false });

function nearestHandle(x, y) {
  let best = null, bestD = 36; // dokunmatik için cömert yakalama yarıçapı
  for (const { key } of LANDMARKS) {
    const [hx, hy] = state.landmarks[key];
    const d = Math.hypot(hx - x, hy - y);
    if (d < bestD) { best = key; bestD = d; }
  }
  return best;
}

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const clampToStage = ([x, y]) => [clamp(x, 0, state.width), clamp(y, 0, state.height)];
const pointerDistance = () => {
  const [a, b] = [...pointers.values()];
  return Math.hypot(a[0] - b[0], a[1] - b[1]) || 1;
};

// ---------- Kontroller ----------

function setMode(mode) {
  if (mode !== 'camera' && camera.active) $('#btn-camera').click(); // pil ve gizlilik
  state.mode = mode;
  document.querySelectorAll('[data-mode]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.mode === mode)));
  document.body.dataset.mode = mode;
  state.dirty = true;
}
document.querySelectorAll('[data-mode]').forEach((b) => b.addEventListener('click', () => setMode(b.dataset.mode)));

async function withCamera(action) {
  try {
    await action();
    state.landmarks = defaultLandmarks(state.width, state.height, mirroredView());
    $('#btn-camera').textContent = 'Kamerayı kapat';
    $('#btn-flip').disabled = false;
  } catch (e) {
    notify(describeCameraError(e));
  }
  state.dirty = true;
}

$('#btn-camera').addEventListener('click', () => {
  if (camera.active) {
    camera.stop();
    $('#btn-camera').textContent = 'Kamerayı aç';
    $('#btn-flip').disabled = true;
    state.landmarks = defaultLandmarks(state.width, state.height, false);
    state.dirty = true;
  } else {
    withCamera(() => camera.start());
  }
});
$('#btn-flip').addEventListener('click', () => withCamera(() => camera.flip()));
$('#btn-reset').addEventListener('click', () => {
  state.landmarks = defaultLandmarks(state.width, state.height, mirroredView());
  state.orbit = { yaw: 0.5, pitch: -0.15, zoom: 1 };
  state.dirty = true;
});
$('#chk-labels').addEventListener('change', (e) => { state.labels = e.target.checked; state.dirty = true; });
$('#rng-alpha').addEventListener('input', (e) => { state.alpha = Number(e.target.value); state.dirty = true; });

const organList = $('#organ-list');
for (const o of ORGANS) {
  const label = document.createElement('label');
  label.innerHTML = '<input type="checkbox" checked> <span class="swatch"></span> ';
  label.querySelector('.swatch').style.background = o.color; // CSP: satır içi style özniteliği yok
  label.append(o.tr);
  label.querySelector('input').addEventListener('change', (e) => {
    if (e.target.checked) state.visible.add(o.id);
    else state.visible.delete(o.id);
    state.dirty = true;
  });
  organList.append(label);
}

// ---------- DICOM kontrolleri ----------

const planeSel = $('#sel-plane');
for (const [id, label] of Object.entries(PLANES)) planeSel.append(new Option(label, id));
planeSel.addEventListener('change', () => { viewer.plane = planeSel.value; state.dirty = true; });
$('#sel-window').addEventListener('change', (e) => { viewer.setPreset(e.target.value); state.dirty = true; });
const sliceRange = $('#rng-slice');
sliceRange.addEventListener('input', () => { viewer.setSlice(Number(sliceRange.value)); state.dirty = true; });

function syncDicomControls() {
  const n = viewer.sliceCount;
  sliceRange.disabled = n <= 1;
  sliceRange.max = String(Math.max(0, n - 1));
  sliceRange.value = String(viewer.sliceIndex);
  $('#dicom-warnings').textContent = viewer.vol?.warnings.join(' ') ?? '';
}

$('#btn-dicom-open').addEventListener('click', () => $('#file-dicom').click());
$('#file-dicom').addEventListener('change', async (e) => {
  const files = [...e.target.files];
  if (files.length === 0) return;
  try {
    const vol = await loadDicomFiles(files, (d, n) => { statusEl.textContent = `Okunuyor ${d}/${n}…`; });
    viewer.setVolume(vol);
  } catch (err) {
    notify(err.message);
  }
  e.target.value = '';
  state.dirty = true;
});
$('#btn-phantom').addEventListener('click', loadPhantom);
function loadPhantom() {
  viewer.setVolume(makePhantom());
  state.dirty = true;
}

document.addEventListener('visibilitychange', () => {
  // Arka plana geçince kamerayı kapat: pil ve gizlilik.
  if (document.hidden && camera.active) $('#btn-camera').click();
});

new ResizeObserver(resize).observe(canvas);
resize();
// Paylaşılabilir/test edilebilir başlangıç durumu: #orbit veya #camera (kamerayı hemen açar).
const hash = location.hash.slice(1);
setMode(['orbit', 'dicom'].includes(hash) ? hash : 'camera');
if (hash === 'camera') withCamera(() => camera.start());
if (hash === 'dicom-fantom') { setMode('dicom'); loadPhantom(); }
requestAnimationFrame(loop);
