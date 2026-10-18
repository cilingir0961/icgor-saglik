// Kamera (AR) ekranı: izin akışı → kamera → vücut takibi (MediaPipe) → yumuşatma → afin uydurma → 3B katman.
// Takip yüklenemezse veya kullanıcı isterse elle hizalama (4 sürüklenebilir nokta) yedeği devreye girer.

import { CameraSource, describeCameraError } from './camera-source.js';
import { videoToDisplay, fitModelToScreen, assessPose, virtualHips, KEYS, AR_MESSAGES_TR } from './ar-fit.js';
import { PointFilter } from '../core/one-euro.js';
import { ArOverlay } from '../three/ar-overlay.js';
import { loadManifest, hasWebGL2 } from '../three/assets.js';

const $ = (id) => document.getElementById(id);
const HANDLE_LABELS = { leftShoulder: 'Sol omuz', rightShoulder: 'Sağ omuz', leftHip: 'Sol kalça', rightHip: 'Sağ kalça' };
const LOST_GRACE_MS = 600;

export async function createCameraScreen() {
  const video = $('camera-video');
  const viewport = $('camera-viewport');
  const handles = $('camera-handles');
  const hctx = handles.getContext('2d');
  const camera = new CameraSource(video);
  let overlay = null, tracker = null, model = null;
  let running = false, manual = false, rafId = 0;
  let filters = {}, lastGood = 0, manualPts = null, dragKey = null;

  const status = (text, warn = false) => {
    const el = $('camera-status');
    el.hidden = !text;
    el.textContent = text ?? '';
    el.classList.toggle('warn', warn);
    document.body.dataset.cameraStatus = text ?? '';
  };

  function showCard(which) {
    $('camera-start').hidden = which !== 'start';
    $('camera-denied').hidden = which !== 'denied';
    $('camera-tools').hidden = which !== null;
    $('cam-opacity-wrap').hidden = which !== null;
  }

  async function start() {
    showCard(null);
    status('Kamera açılıyor…');
    try {
      if (!hasWebGL2()) throw Object.assign(new Error('webgl'), { name: 'NoWebGL' });
      await camera.start(camera.facingMode);
    } catch (e) {
      running = false;
      showCard('denied');
      const insecure = e.name === 'insecure';
      $('camera-denied-title').textContent = e.name === 'NotAllowedError' ? 'Kamera izni verilmedi'
        : insecure ? 'Güvenli bağlantı gerekli' : e.name === 'NoWebGL' ? '3B katman desteklenmiyor' : 'Kamera açılamadı';
      $('camera-denied-text').textContent = e.name === 'NoWebGL'
        ? 'Bu cihaz WebGL2 desteklemiyor. Basit görünümü (legacy.html) kullanabilirsiniz.'
        : `${describeCameraError(e)} Kamera olmadan da 3B anatomi modelini inceleyebilirsiniz.`;
      status(null);
      return;
    }
    video.classList.toggle('mirrored', camera.mirrored);
    running = true;
    overlay ??= new ArOverlay(viewport);
    status('Anatomi modeli yükleniyor…');
    const manifest = await loadManifest();
    model = manifest.landmarks;
    await overlay.loadLayer('organs');
    if ($('btn-cam-skeleton').getAttribute('aria-pressed') === 'true') await overlay.loadLayer('skeleton');
    overlay.setOpacity(Number($('cam-opacity').value));
    if (!manual && !tracker) {
      status('Vücut takibi hazırlanıyor…');
      try {
        tracker = await PoseTracker();
      } catch (e) {
        console.warn('vücut takibi yüklenemedi', e);
        setManual(true);
        status('Vücut takibi bu cihazda başlatılamadı — elle hizalama kullanılıyor.', true);
      }
    }
    filters = {};
    loop();
  }

  async function PoseTracker() {
    const mod = await import('./pose-tracker.js');
    return mod.PoseTracker.create();
  }

  function stop() {
    running = false;
    cancelAnimationFrame(rafId);
    camera.stop();
    overlay?.setPose(null);
    drawHandles(false);
    status(null);
    showCard('start');
  }

  // ---------- Döngü ----------

  const display = () => ({ width: viewport.clientWidth, height: viewport.clientHeight });

  function loop() {
    if (!running) return;
    rafId = requestAnimationFrame(loop);
    if (manual) return; // elle modda yalnızca sürüklemede güncellenir
    if (!tracker || video.readyState < 2) return;
    const now = performance.now();
    const det = tracker.detect(video, now);
    const d = display();
    if (!det) return lost(now);
    const pts = {};
    for (const k of KEYS) pts[k] = videoToDisplay(det.points[k], { width: video.videoWidth, height: video.videoHeight }, d, camera.mirrored);
    const q = assessPose(pts, det.visibility);
    if (!q.ok) return lost(now, AR_MESSAGES_TR[q.reason]);
    if (q.partial) Object.assign(pts, virtualHips(pts.leftShoulder, pts.rightShoulder, model, camera.mirrored ? -1 : 1));
    const t = now / 1000;
    for (const k of KEYS) pts[k] = (filters[k] ??= new PointFilter({ minCutoff: 1.2, beta: 0.02 })).filter(pts[k], t);
    apply(pts, d);
    lastGood = now;
    status(q.partial ? AR_MESSAGES_TR.partial : `Vücut takibi etkin (${tracker.delegate === 'GPU' ? 'GPU' : 'CPU'})`, q.partial);
  }

  function lost(now, msg = AR_MESSAGES_TR['no-shoulders']) {
    if (now - lastGood > LOST_GRACE_MS) {
      overlay.setPose(null);
      filters = {};
      status(msg, true);
    }
  }

  function apply(pts, d) {
    const fit = fitModelToScreen(pts, model, { mirrored: camera.mirrored, height: d.height });
    overlay.setPose(fit.elements);
    window.__icgorAr = { fit, pts }; // test/hata ayıklama
  }

  // ---------- Elle hizalama ----------

  function defaultManual(d) {
    const s = camera.mirrored ? -1 : 1;
    const cx = d.width / 2, sw = Math.min(d.width * 0.42, d.height * 0.3), top = d.height * 0.28;
    return {
      leftShoulder: [cx + (s * sw) / 2, top], rightShoulder: [cx - (s * sw) / 2, top],
      leftHip: [cx + (s * sw) / 3.6, top + sw * 1.45], rightHip: [cx - (s * sw) / 3.6, top + sw * 1.45],
    };
  }

  function setManual(on) {
    manual = on;
    $('btn-cam-manual').setAttribute('aria-pressed', String(on));
    handles.style.pointerEvents = on ? 'auto' : 'none';
    if (on) {
      manualPts ??= defaultManual(display());
      apply(manualPts, display());
      status('Elle hizalama: noktaları omuz ve kalçalarınıza sürükleyin');
    } else {
      filters = {};
    }
    drawHandles(on);
  }

  function drawHandles(show) {
    const d = display();
    const dpr = window.devicePixelRatio || 1;
    handles.width = d.width * dpr;
    handles.height = d.height * dpr;
    hctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    hctx.clearRect(0, 0, d.width, d.height);
    if (!show || !manualPts) return;
    hctx.font = '600 12px system-ui, sans-serif';
    hctx.textAlign = 'center';
    for (const k of KEYS) {
      const [x, y] = manualPts[k];
      hctx.beginPath();
      hctx.arc(x, y, 13, 0, Math.PI * 2);
      hctx.fillStyle = 'rgba(56,189,248,0.3)';
      hctx.fill();
      hctx.lineWidth = 2;
      hctx.strokeStyle = '#38bdf8';
      hctx.stroke();
      hctx.fillStyle = '#fff';
      hctx.fillText(HANDLE_LABELS[k], x, y - 20);
    }
  }

  handles.addEventListener('pointerdown', (e) => {
    if (!manual) return;
    let best = null, bd = 40;
    for (const k of KEYS) {
      const dd = Math.hypot(manualPts[k][0] - e.offsetX, manualPts[k][1] - e.offsetY);
      if (dd < bd) { best = k; bd = dd; }
    }
    dragKey = best;
    if (best) handles.setPointerCapture(e.pointerId);
  });
  handles.addEventListener('pointermove', (e) => {
    if (!manual || !dragKey) return;
    manualPts[dragKey] = [e.offsetX, e.offsetY];
    apply(manualPts, display());
    drawHandles(true);
  });
  handles.addEventListener('pointerup', () => { dragKey = null; });

  // ---------- Kontroller ----------

  $('btn-cam-start').addEventListener('click', start);
  $('btn-cam-retry').addEventListener('click', start);
  $('btn-cam-stop').addEventListener('click', stop);
  $('btn-cam-flip').addEventListener('click', async () => {
    try {
      await camera.flip();
      video.classList.toggle('mirrored', camera.mirrored);
      filters = {};
      manualPts = null;
      if (manual) setManual(true);
    } catch (e) {
      status(describeCameraError(e), true);
    }
  });
  $('btn-cam-skeleton').addEventListener('click', async (e) => {
    const on = e.currentTarget.getAttribute('aria-pressed') !== 'true';
    e.currentTarget.setAttribute('aria-pressed', String(on));
    if (on && overlay) await overlay.loadLayer('skeleton');
    overlay?.setLayerVisible('skeleton', on);
  });
  $('btn-cam-manual').addEventListener('click', () => setManual(!manual));
  $('cam-opacity').addEventListener('input', (e) => overlay?.setOpacity(Number(e.target.value)));
  document.addEventListener('visibilitychange', () => { if (document.hidden && running) stop(); });
  window.addEventListener('resize', () => { if (manual) { drawHandles(true); apply(manualPts, display()); } });

  // Otomatik başlatma (test ve paylaşılabilir bağlantı): #/kamera?baslat
  showCard('start');
  if (location.hash.includes('baslat')) start();

  return {
    activate() {},
    deactivate() { if (running) stop(); },
  };
}
