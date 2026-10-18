// Tıbbi görüntü ekranı: DICOM serisi veya sentetik fantom; kesit/MPR/MIP, pencereleme, HU okuma.
// Dosyalar yalnızca tarayıcı belleğinde işlenir (CSP dış bağlantıyı engeller).

import { DicomViewer, loadDicomFiles, PLANES } from '../dicom/viewer.js';
import { makePhantom } from '../dicom/phantom.js';
import { provenanceBadge } from './sources.js';

const $ = (id) => document.getElementById(id);

export async function createImagingScreen() {
  const canvas = $('imaging-canvas');
  const ctx = canvas.getContext('2d');
  const viewer = new DicomViewer();
  viewer.infoTop = 52; // üstteki kaynak rozetinin altından başla
  let size = { w: 0, h: 0 }, dirty = true, active = true;

  function setSource(kindId, extra) {
    const b = provenanceBadge(kindId, extra);
    const chip = $('imaging-source');
    chip.dataset.kind = b.kind;
    chip.querySelector('span').textContent = b.text;
    document.body.dataset.imagingSource = kindId ?? '';
  }

  function resize() {
    const r = canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    size = { w: r.width, h: r.height };
    canvas.width = Math.round(r.width * dpr);
    canvas.height = Math.round(r.height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    dirty = true;
  }
  new ResizeObserver(resize).observe(canvas);

  function frame() {
    requestAnimationFrame(frame);
    if (!active || !dirty || !size.w) return;
    dirty = false;
    viewer.draw(ctx, size.w, size.h);
    const n = viewer.sliceCount;
    const range = $('rng-slice');
    range.disabled = n <= 1;
    range.max = String(Math.max(0, n - 1));
    range.value = String(viewer.sliceIndex);
    $('dicom-warnings').textContent = viewer.vol?.warnings.join(' ') ?? '';
  }
  requestAnimationFrame(frame);

  const planeSel = $('sel-plane');
  for (const [id, label] of Object.entries(PLANES)) planeSel.append(new Option(label, id));
  planeSel.addEventListener('change', () => { viewer.plane = planeSel.value; dirty = true; });
  $('sel-window').addEventListener('change', (e) => { viewer.setPreset(e.target.value); dirty = true; });
  $('rng-slice').addEventListener('input', (e) => { viewer.setSlice(Number(e.target.value)); dirty = true; });

  $('btn-dicom-open').addEventListener('click', () => $('file-dicom').click());
  $('file-dicom').addEventListener('change', async (e) => {
    const files = [...e.target.files];
    e.target.value = '';
    if (!files.length) return;
    try {
      const vol = await loadDicomFiles(files, (d, n) => { $('dicom-warnings').textContent = `Okunuyor ${d}/${n}…`; });
      viewer.setVolume(vol);
      setSource(vol.synthetic ? 'synthetic-phantom' : 'dicom-file', `${vol.modality || '?'} · ${vol.nz} kesit`);
    } catch (err) {
      $('dicom-warnings').textContent = err.message;
    }
    dirty = true;
  });
  $('btn-phantom').addEventListener('click', () => {
    viewer.setVolume(makePhantom());
    setSource('synthetic-phantom');
    dirty = true;
  });

  // Kaydırma: kesit; dokunma: değer okuma
  let drag = null;
  canvas.addEventListener('pointerdown', (e) => { drag = { y: e.offsetY, start: viewer.sliceIndex, moved: false }; canvas.setPointerCapture(e.pointerId); });
  canvas.addEventListener('pointermove', (e) => {
    if (!drag) return;
    if (Math.abs(e.offsetY - drag.y) > 6) drag.moved = true;
    if (drag.moved) { viewer.setSlice(drag.start + (e.offsetY - drag.y) / 4); dirty = true; }
  });
  canvas.addEventListener('pointerup', (e) => {
    if (drag && !drag.moved) { viewer.probeAt(e.offsetX, e.offsetY); dirty = true; }
    drag = null;
  });
  canvas.addEventListener('wheel', (e) => { e.preventDefault(); viewer.setSlice(viewer.sliceIndex + Math.sign(e.deltaY)); dirty = true; }, { passive: false });

  setSource(null);
  if (location.hash.includes('fantom')) $('btn-phantom').click();
  return {
    viewer,
    activate() { active = true; resize(); },
    deactivate() { active = false; },
  };
}
