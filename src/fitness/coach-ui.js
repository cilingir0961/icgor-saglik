// Kamera koçu ekranı (tam ekran katman). Görüntü yalnızca bu cihazda işlenir; hiçbir kare saklanmaz veya
// gönderilmez. Sayım ve açılar src/fitness/coach.js'te (saf); burada yalnızca kamera, çizim ve ses var.
// Doğruluk: sentetik figürle ölçüldü (scripts/coach-bench.mjs). Gerçek kişide doğrulanmadı → "Deneysel".

import { CameraSource, describeCameraError } from '../camera/camera-source.js';
import { videoToDisplay } from '../camera/ar-fit.js';
import { Voice } from '../scan/voice.js';
import { h } from '../scan/dom.js';
import { createCoach, COACH_KINDS } from './coach.js';

const LINKS = [[11, 12], [11, 23], [12, 24], [23, 24], [11, 13], [13, 15], [12, 14], [14, 16], [23, 25], [25, 27], [24, 26], [26, 28]];
const NUM_TR = ['sıfır', 'bir', 'iki', 'üç', 'dört', 'beş', 'altı', 'yedi', 'sekiz', 'dokuz', 'on', 'on bir', 'on iki', 'on üç', 'on dört', 'on beş', 'on altı', 'on yedi', 'on sekiz', 'on dokuz', 'yirmi'];
const MODEL = new URLSearchParams(location.search).get('model') === 'lite' ? 'lite' : 'full';
let tracker = null; // oturumlar arasında yeniden kullanılır (model indirmesi bir kez)

/**
 * @param {{exercise:{tr:string, camera:string, dose?:{reps?:number}}, page?:HTMLElement, onClose:(r:object|null)=>void}} o
 */
export function openCoach({ exercise, onClose }) {
  const K = COACH_KINDS[exercise.camera];
  const target = exercise.dose?.reps ?? null;
  const voice = new Voice({ enabled: true, minRepeatMs: 3000 });
  const dbg = (window.__icgorCoach = { state: 'setup', reps: 0, summary: null, voice: voice.log });
  const video = h('video', { playsinline: true, muted: true, class: 'coach-video' });
  video.muted = true;
  const overlay = h('canvas', { class: 'coach-overlay-canvas' });
  const octx = overlay.getContext('2d');
  const camera = new CameraSource(video);
  const $count = h('div', { class: 'coach-count', id: 'coach-count', 'aria-live': 'polite' }, '0');
  const $msg = h('p', { class: 'coach-msg', id: 'coach-msg' }, K.setup);
  const $angle = h('p', { class: 'coach-angle', id: 'coach-angle' }, '');
  const panel = h('div', { class: 'coach-panel' });
  const root = h('div', { class: 'coach-layer', id: 'coach-layer', role: 'dialog', 'aria-label': `Kamera koçu: ${exercise.tr}` },
    video, overlay,
    h('div', { class: 'coach-hud' },
      h('div', { class: 'coach-head' },
        h('strong', {}, exercise.tr),
        h('span', { class: 'badge warn' }, 'Deneysel · yaklaşık'),
      ),
      h('div', { class: 'coach-row' }, $count, h('div', {}, h('span', { class: 'coach-target' }, target ? `/ ${target} tekrar` : 'tekrar'), $angle)),
      $msg),
    panel);
  document.body.append(root);
  document.body.classList.add('coach-open');
  let raf = 0, closed = false, coach = null, t0 = 0, lastDetect = 0, lastSeen = 0;

  const close = (result) => {
    if (closed) return;
    closed = true;
    cancelAnimationFrame(raf);
    camera.stop();
    voice.stop?.();
    root.remove();
    document.body.classList.remove('coach-open');
    dbg.state = 'closed';
    onClose(result);
  };

  function setPanel(...nodes) { panel.replaceChildren(...nodes); }

  setPanel(
    h('p', { class: 'muted small' }, 'Görüntü yalnızca bu cihazda işlenir ve kaydedilmez. Koç tekrarları sayar ve görünen açıları ölçer; fizyoterapist değildir, hareketinizi değerlendirip düzeltme vermez. Ağrı, baş dönmesi veya nefes darlığında hemen durun.'),
    h('div', { class: 'actions' },
      h('button', { class: 'btn primary', id: 'btn-coach-start', onclick: start }, 'Kamerayı aç ve başla'),
      h('button', { class: 'btn ghost', id: 'btn-coach-cancel', onclick: () => close(null) }, 'Vazgeç')));

  async function start() {
    dbg.state = 'loading';
    setPanel(h('button', { class: 'btn ghost', onclick: () => close(null) }, 'Vazgeç'));
    try {
      $msg.textContent = 'Kamera açılıyor…';
      await camera.start(new URLSearchParams(location.search).get('cam') === 'env' ? 'environment' : 'user');
      video.classList.toggle('mirrored', camera.mirrored);
      if (!tracker) {
        $msg.textContent = 'Vücut takibi hazırlanıyor…';
        const mod = await import('../camera/pose-tracker.js');
        tracker = await mod.PoseTracker.create({ model: MODEL });
      }
    } catch (e) {
      dbg.state = 'error';
      $msg.textContent = e?.name in { NotAllowedError: 1, NotFoundError: 1, insecure: 1, unsupported: 1, NotReadableError: 1 } ? describeCameraError(e) : `Vücut takibi başlatılamadı: ${e?.message ?? e}`;
      setPanel(h('button', { class: 'btn', onclick: () => close(null) }, 'Kapat'));
      return;
    }
    coach = createCoach(exercise.camera, { width: video.videoWidth, height: video.videoHeight });
    t0 = performance.now();
    dbg.state = 'running';
    $msg.textContent = K.setup;
    voice.say(`${K.setup} Hazır olduğunuzda başlayın.`, { force: true });
    setPanel(h('div', { class: 'actions' },
      h('button', { class: 'btn primary', id: 'btn-coach-finish', onclick: finish }, 'Bitir'),
      h('button', { class: 'btn ghost', onclick: () => close(null) }, 'Vazgeç')));
    raf = requestAnimationFrame(loop);
  }

  function loop(now) {
    if (closed) return;
    raf = requestAnimationFrame(loop);
    if (video.readyState < 2 || now - lastDetect < 50) return;
    lastDetect = now;
    const det = tracker.detect(video, now);
    const lm = det?.all ?? null;
    const r = coach.push(lm, (now - t0) / 1000);
    draw(lm, r.visible);
    if (r.visible) lastSeen = now;
    dbg.reps = r.reps;
    dbg.angle = r.angle;
    $count.textContent = String(r.reps);
    const shown = Object.entries(r.angle).filter(([, v]) => v != null).map(([S, v]) => `${S === 'L' ? 'Sol' : 'Sağ'} ${K.joint} ${Math.round(v)}°`);
    $angle.textContent = shown.length ? `${shown.join(' · ')} (±6°, görüntü düzleminde)` : 'Eklemler görünmüyor';
    if (r.newRep) {
      voice.say(NUM_TR[r.reps] ?? String(r.reps), { force: true, interrupt: true });
      if (target && r.reps >= target) {
        $msg.textContent = 'Hedef tekrar tamamlandı. "Bitir"e dokunun.';
        voice.say('Hedef tamam. Dinlenin.', { force: true });
      }
    } else if (!r.visible && now - lastSeen > 1500) {
      $msg.textContent = 'Gerekli eklemler görünmüyor. Kameradan biraz uzaklaşın, baştan ayağa kadrajda olun.';
      voice.say('Kadraja tam girin.');
    } else if (r.visible && $msg.textContent.startsWith('Gerekli')) {
      $msg.textContent = K.setup;
    }
  }

  function draw(lm, ok) {
    const rect = overlay.getBoundingClientRect();
    const dpr = devicePixelRatio || 1;
    if (overlay.width !== Math.round(rect.width * dpr)) { overlay.width = Math.round(rect.width * dpr); overlay.height = Math.round(rect.height * dpr); }
    octx.setTransform(dpr, 0, 0, dpr, 0, 0);
    octx.clearRect(0, 0, rect.width, rect.height);
    if (!lm) return;
    const P = lm.map((p) => videoToDisplay([p[0], p[1]], { width: video.videoWidth, height: video.videoHeight }, { width: rect.width, height: rect.height }, camera.mirrored));
    octx.strokeStyle = ok ? '#34d399' : '#fbbf24';
    octx.lineWidth = 3;
    for (const [a, b] of LINKS) {
      if (lm[a][3] < 0.4 || lm[b][3] < 0.4) continue;
      octx.beginPath(); octx.moveTo(...P[a]); octx.lineTo(...P[b]); octx.stroke();
    }
  }

  function finish() {
    cancelAnimationFrame(raf);
    camera.stop();
    const s = coach.summary();
    dbg.summary = s;
    dbg.state = 'summary';
    voice.say(`${s.reps} tekrar sayıldı.`, { force: true, interrupt: true });
    root.classList.add('done');
    $count.textContent = String(s.reps);
    $angle.textContent = '';
    $msg.textContent = s.reliable ? 'Ölçüm güvenilirlik kapısını geçti.' : 'Ölçüm güvenilirliği yetersiz: yalnızca yaklaşık tekrar sayısı gösteriliyor, açı/tempo yorumu yapılmıyor.';
    setPanel(
      h('div', { class: 'coach-summary', id: 'coach-summary' },
        h('h3', {}, `${s.reps} tekrar ${s.reliable ? '' : '(yaklaşık)'}`),
        s.reliable
          ? h('ul', {}, s.observations.map((o) => h('li', {}, o)))
          : h('ul', { class: 'warnlist' }, s.reasons.map((o) => h('li', {}, o))),
        h('p', { class: 'muted small' }, 'Sentetik figürle doğrulandı; gerçek kişilerde doğruluğu henüz ölçülmedi. Gözlemler tanı veya form değerlendirmesi değildir.'),
        h('div', { class: 'actions' },
          h('button', { class: 'btn primary', id: 'btn-coach-save', onclick: () => close({ reps: s.reps, reliable: s.reliable, summary: s }) }, 'Kaydet ve dön'),
          h('button', { class: 'btn ghost', onclick: () => close(null) }, 'Kaydetmeden kapat'))));
  }

  return { close: () => close(null) };
}
