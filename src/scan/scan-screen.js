// Kişisel tarama ekranı (#/tarama): rıza → profil → yönlendirmeli çekim (önden/yandan/arkadan) → hareket
// testleri → rapor → geçmiş ve karşılaştırma. Görüntü yalnızca cihazda işlenir; hiçbir kare saklanmaz.
// Kalibrasyon (kadraj, mesafe, ışık, görünüş, kararlılık) yetersizse ölçüm üretilmez.
//
// Test parametreleri: ?kare=N (görünüş başına kare, varsayılan 45), ?model=lite|full (varsayılan full)

import { CameraSource, describeCameraError } from '../camera/camera-source.js';
import { videoToDisplay } from '../camera/ar-fit.js';
import { assessFrame, stability, lumaStats, VIEWS } from '../analysis/quality.js';
import { postureMetrics } from '../analysis/posture.js';
import { MOVEMENT_TESTS } from '../analysis/movement.js';
import { measureSegments, twinScales, bmi } from '../analysis/proportions.js';
import { median } from '../analysis/geometry.js';
import { TOPICS } from '../anatomy/posture-info.js';
import { createStore } from './store.js';
import { Voice } from './voice.js';
import { Tilt } from './tilt.js';
import { renderReport } from './report.js';
import { h, fmt, icon } from './dom.js';

const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);
const FRAMES_PER_VIEW = Math.max(5, Number(params.get('kare') ?? 45));
const MODEL = params.get('model') === 'lite' ? 'lite' : 'full';
const DURATION_X = Math.min(5, Math.max(1, Number(params.get('sure') ?? 1))); // test: yavaş ortamda süre çarpanı
const POSTURE_STEPS = [
  { view: 'front', title: 'Önden', say: 'Yüzünüz kameraya dönük, kollarınız yanda, rahat durun.' },
  { view: 'side', title: 'Yandan', say: 'Şimdi yan dönün. Omzunuz kameraya baksın.' },
  { view: 'back', title: 'Arkadan', say: 'Şimdi arkanızı kameraya dönün.' },
];
const LINKS = [[11, 12], [11, 23], [12, 24], [23, 24], [11, 13], [13, 15], [12, 14], [14, 16], [23, 25], [25, 27], [24, 26], [26, 28], [7, 11], [8, 12]];
const CHECK_TR = { person: 'Kişi', view: 'Görünüş', visible: 'Tüm vücut', framing: 'Kadraj', distance: 'Mesafe', center: 'Ortalama', light: 'Işık', level: 'Telefon düzlüğü', stable: 'Hareketsiz' };
// Atlas vücudunun aynı tanımlarla ölçülen değerleri (cm) — dijital ikiz çarpanları için (manifest eklemlerinden)
const ATLAS_SEG = (j) => {
  const d = (a, b) => Math.hypot(j[a][0] - j[b][0], j[a][1] - j[b][1]) * 100;
  const m = (a, b) => [(j[a][0] + j[b][0]) / 2, (j[a][1] + j[b][1]) / 2];
  return {
    shoulderWidth: d('shoulder-L', 'shoulder-R'), hipWidth: d('hip-L', 'hip-R'),
    upperArm: d('shoulder-L', 'elbow-L'), forearm: d('elbow-L', 'wrist-L'), thigh: d('hip-L', 'knee-L'), shank: d('knee-L', 'ankle-L'),
    torso: Math.hypot(...[0, 1].map((i) => m('shoulder-L', 'shoulder-R')[i] - m('hip-L', 'hip-R')[i])) * 100,
  };
};

export async function createScanScreen() {
  const store = createStore();
  const voice = new Voice({ enabled: store.state.settings.voice !== false });
  const tilt = new Tilt();
  const page = $('scan-page');
  const capture = $('scan-capture');
  const video = $('scan-video');
  const overlay = $('scan-overlay');
  const octx = overlay.getContext('2d');
  const camera = new CameraSource(video);
  const lumaCanvas = document.createElement('canvas');
  lumaCanvas.width = 32; lumaCanvas.height = 24;
  const lctx = lumaCanvas.getContext('2d', { willReadFrequently: true });
  let tracker = null, run = null, current = null; // current: devam eden tarama kaydı
  const dbg = (window.__icgorScan = { voice: voice.log, store, state: 'home' });

  // ---------------- Sayfa yönetimi ----------------
  function show(node, state) {
    capture.hidden = true;
    page.hidden = false;
    page.replaceChildren(node);
    page.scrollTop = 0;
    dbg.state = state;
    document.body.dataset.scanState = state;
  }

  const disclaimer = () => h('p', { class: 'notice' }, 'Eğitim amaçlıdır. Kamera vücudun yalnızca dış hatlarını görür; iç organları göremez. Ölçümler deneyseldir, tanı koymaz ve hastalık riski bildirmez.');

  function home() {
    const st = store.state;
    const p = st.profile;
    const last = st.scans.at(-1);
    show(h('div', { class: 'scan-home' },
      h('h2', {}, 'Kişisel duruş ve hareket taraması'),
      disclaimer(),
      h('div', { class: 'card-row' },
        h('div', { class: 'info-card' },
          h('h3', {}, 'Profil'),
          p ? h('p', {}, `Boy ${p.heightCm} cm${p.weightKg ? ` · Kilo ${p.weightKg} kg` : ''}${p.age ? ` · Yaş ${p.age}` : ''}`) : h('p', { class: 'sub' }, 'Henüz girilmedi. Ölçek için boy gereklidir.'),
          h('button', { class: 'btn small', id: 'btn-scan-profile', onclick: profile }, p ? 'Düzenle' : 'Profil oluştur')),
        h('div', { class: 'info-card' },
          h('h3', {}, 'Çekim düzeni'),
          h('div', { class: 'seg small', role: 'group', 'aria-label': 'Çekim düzeni' },
            ...[['helper', 'Biri tutuyor'], ['self', 'Telefon sabit']].map(([k, t]) => h('button', {
              'aria-pressed': String(st.settings.mode === k), dataset: { mode: k },
              onclick: () => { store.setSettings({ mode: k }); home(); },
            }, t))),
          h('p', { class: 'sub' }, st.settings.mode === 'self' ? 'Ön kamera; her adımdan önce 10 saniyelik geri sayım.' : 'Arka kamera; telefonu tutan kişi ekrandaki yönergeleri izler.'),
          h('label', { class: 'row' }, 'Sesli yönlendirme', h('input', {
            type: 'checkbox', role: 'switch', id: 'chk-scan-voice', checked: st.settings.voice !== false,
            onchange: (e) => { store.setSettings({ voice: e.target.checked }); voice.setEnabled(e.target.checked); },
          })))),
      h('div', { class: 'scan-actions' },
        h('button', { class: 'btn primary', id: 'btn-scan-posture', onclick: () => guard(startPosture) }, icon('i-body'), 'Duruş taraması (3 adım)'),
        h('button', { class: 'btn', id: 'btn-scan-moves', onclick: () => guard(movementList) }, icon('i-pulse'), 'Hareket testleri'),
        h('button', { class: 'btn', id: 'btn-scan-history', onclick: history, disabled: !st.scans.length }, `Geçmiş ve karşılaştırma (${st.scans.length})`),
        last ? h('button', { class: 'btn ghost', onclick: () => report(last) }, 'Son raporu aç') : null,
        h('button', { class: 'btn ghost', id: 'btn-scan-data', onclick: dataControls }, 'Verilerim ve gizlilik'))), 'home');
  }

  /** Rıza ve profil olmadan tarama başlamaz. */
  function guard(next) {
    if (!store.state.consent) return consent(() => guard(next));
    if (!store.state.profile?.heightCm) return profile(() => guard(next));
    next();
  }

  function consent(then) {
    const chk = (id, text) => h('label', { class: 'check' }, h('input', { type: 'checkbox', id }), h('span', {}, text));
    const node = h('div', { class: 'scan-form', id: 'scan-consent' },
      h('h2', {}, 'Bilgilendirme ve onay'),
      disclaimer(),
      chk('c-understand', 'İçGör\'ün eğitim amaçlı olduğunu, tanı koymadığını ve ölçümlerin deneysel olduğunu anladım.'),
      chk('c-device', 'Kamera görüntüsünün yalnızca bu cihazda işlendiğini, kaydedilmediğini ve gönderilmediğini anladım.'),
      chk('c-store', 'Ölçüm sonuçlarımın (yalnızca sayılar, görüntü değil) gelişim takibi için bu cihazda saklanmasına izin veriyorum. (İsteğe bağlı; istediğim zaman silebilirim.)'),
      h('p', { class: 'sub' }, 'Ölçüm sırasında bir kişi telefonu tutabilir. Yalnızca kendiniz veya açık izni olan bir yetişkin için kullanın.'),
      h('div', { class: 'actions' },
        h('button', { class: 'btn primary', id: 'btn-consent-ok', onclick: () => {
          if (!$('c-understand').checked || !$('c-device').checked) { $('consent-err').hidden = false; return; }
          store.setConsent({ store: $('c-store').checked });
          then?.();
        } }, 'Onaylıyorum'),
        h('button', { class: 'btn ghost', onclick: home }, 'Vazgeç')),
      h('p', { class: 'warnline', id: 'consent-err', hidden: true }, 'Devam etmek için ilk iki maddeyi onaylayın.'));
    show(node, 'consent');
  }

  function profile(then) {
    const p = store.state.profile ?? {};
    const field = (id, label, value, attrs) => h('label', { class: 'field' }, h('span', {}, label), h('input', { id, type: 'number', inputmode: 'decimal', value: value ?? '', ...attrs }));
    show(h('form', { class: 'scan-form', id: 'scan-profile', onsubmit: (e) => {
      e.preventDefault();
      const saved = store.setProfile({ heightCm: $('p-height').value, weightKg: $('p-weight').value, age: $('p-age').value });
      if (!saved.heightCm) { $('profile-err').hidden = false; return; }
      (then ?? home)();
    } },
    h('h2', {}, 'Profil'),
    h('p', { class: 'sub' }, 'Boy, kamera görüntüsündeki uzaklıkları santimetreye çevirmek için kullanılır. Kilo ve yaş isteğe bağlıdır; ölçümleri değiştirmez.'),
    field('p-height', 'Boy (cm) *', p.heightCm, { min: 100, max: 230, required: true }),
    field('p-weight', 'Kilo (kg, isteğe bağlı)', p.weightKg, { min: 25, max: 300 }),
    field('p-age', 'Yaş (isteğe bağlı)', p.age, { min: 10, max: 110 }),
    h('p', { class: 'sub' }, store.persistent ? 'Bu bilgiler yalnızca bu cihazda saklanır.' : 'Saklama izni vermediğiniz için bu bilgiler sayfa kapanınca silinir.'),
    h('p', { class: 'warnline', id: 'profile-err', hidden: true }, 'Geçerli bir boy girin (100–230 cm).'),
    h('div', { class: 'actions' }, h('button', { class: 'btn primary', type: 'submit', id: 'btn-profile-save' }, 'Kaydet'), h('button', { class: 'btn ghost', type: 'button', onclick: home }, 'Vazgeç'))), 'profile');
  }

  // ---------------- Kamera ve takip ----------------
  async function openCamera() {
    capture.hidden = false;
    page.hidden = true;
    dbg.state = 'capture';
    document.body.dataset.scanState = 'capture';
    const self = store.state.settings.mode === 'self';
    hud({ title: 'Kamera açılıyor…', text: '' });
    await camera.start(self ? 'user' : 'environment');
    video.classList.toggle('mirrored', camera.mirrored);
    if (tilt.state === 'unknown') await tilt.start();
    if (!tracker) {
      hud({ title: 'Vücut takibi hazırlanıyor…', text: `Model: ${MODEL === 'full' ? 'tam (doğruluk öncelikli)' : 'hafif'}` });
      const mod = await import('../camera/pose-tracker.js');
      tracker = await mod.PoseTracker.create({ model: MODEL });
    }
  }

  function closeCamera() {
    run?.cancel();
    run = null;
    camera.stop();
    voice.stop();
  }

  /** Bir kare: noktalar, kalite, ışık. */
  function sample(expectedView, now) {
    const det = tracker.detect(video, now);
    const vw = video.videoWidth, vh = video.videoHeight;
    let light = null;
    if (!sample.n || sample.n++ % 10 === 0) {
      lctx.drawImage(video, 0, 0, 32, 24);
      sample.light = lumaStats(lctx.getImageData(0, 0, 32, 24).data);
      sample.n = sample.n || 1;
    }
    light = sample.light;
    const t = tilt.current();
    const q = assessFrame(det?.all ?? null, { expectedView, width: vw, height: vh, light, tilt: t });
    return { lm: det?.all ?? null, q, vw, vh, tilt: t };
  }

  function drawOverlay(lm, ok) {
    const r = overlay.getBoundingClientRect();
    const dpr = devicePixelRatio || 1;
    if (overlay.width !== Math.round(r.width * dpr)) { overlay.width = Math.round(r.width * dpr); overlay.height = Math.round(r.height * dpr); }
    octx.setTransform(dpr, 0, 0, dpr, 0, 0);
    octx.clearRect(0, 0, r.width, r.height);
    // Kadraj kılavuzu: vücudun sığması gereken bölge
    octx.setLineDash([6, 6]);
    octx.strokeStyle = 'rgba(148,163,184,0.6)';
    octx.lineWidth = 1.5;
    // Üstte yönerge paneli, altta Durdur düğmesi var; kılavuz aradaki alanı gösterir
    octx.strokeRect(r.width * 0.15, r.height * 0.2, r.width * 0.7, r.height * 0.68);
    octx.setLineDash([]);
    if (!lm) return;
    const P = lm.map((p) => videoToDisplay([p[0], p[1]], { width: video.videoWidth, height: video.videoHeight }, { width: r.width, height: r.height }, camera.mirrored));
    octx.strokeStyle = ok ? '#34d399' : '#fbbf24';
    octx.lineWidth = 3;
    for (const [a, b] of LINKS) {
      if (lm[a][3] < 0.4 || lm[b][3] < 0.4) continue;
      octx.beginPath(); octx.moveTo(...P[a]); octx.lineTo(...P[b]); octx.stroke();
    }
  }

  function hud({ title, text, checks, progress, countdown }) {
    $('scan-step').textContent = title ?? '';
    $('scan-text').textContent = text ?? '';
    const list = $('scan-checks');
    list.replaceChildren(...(checks ?? []).filter((c) => c.ok !== null || c.id === 'level').map((c) => h('li', {
      class: c.ok === true ? 'ok' : c.ok === false ? 'bad' : 'unknown',
      title: c.msg || '',
    }, `${c.ok === true ? '✓' : c.ok === false ? '✗' : '?'} ${CHECK_TR[c.id] ?? c.id}`)));
    const bar = $('scan-progress');
    bar.hidden = progress == null;
    if (progress != null) bar.value = progress;
    $('scan-countdown').hidden = !countdown;
    $('scan-countdown').textContent = countdown ? String(countdown) : '';
  }

  /** Geri sayım (telefon sabit düzeni). */
  async function countdown(seconds, text) {
    voice.say(`${text} ${seconds} saniye içinde başlıyoruz.`, { force: true });
    for (let i = seconds; i > 0; i--) {
      if (run?.cancelled) return;
      hud({ title: 'Hazırlanın', text, countdown: i });
      await new Promise((r) => setTimeout(r, 1000));
    }
  }

  /**
   * Bir görünüşü çeker: kalite kapısı + kararlılık sağlanınca kareler toplanır.
   * @returns {Promise<{frames:number[][][], conditions:object}|null>}
   */
  function captureView(step, index, total) {
    return new Promise((resolve) => {
      const frames = [], recent = [], heights = [], tilts = [];
      let lastMsg = '', msgSince = 0, lastDetect = 0, started = false;
      voice.say(step.say, { force: true, interrupt: true });
      const loop = (now) => {
        if (run.cancelled) return resolve(null);
        run.raf = requestAnimationFrame(loop);
        if (video.readyState < 2 || now - lastDetect < 66) return;
        lastDetect = now;
        const { lm, q, vw, vh, tilt: t } = sample(step.view, now);
        if (lm) { recent.push(lm); if (recent.length > 8) recent.shift(); }
        const st = lm ? stability(recent) : { ok: false };
        const checks = [...q.checks, { id: 'stable', ok: q.ok ? st.ok : null, msg: 'Kıpırdamadan durun.' }];
        const good = q.ok && st.ok && recent.length >= 4;
        drawOverlay(lm, good);
        dbg.quality = { ok: q.ok, stable: st.ok, message: q.message, view: q.view?.view, heightFrac: q.heightFrac };
        const msg = q.message ?? (q.ok && !st.ok ? 'Kıpırdamadan durun.' : '');
        if (msg !== lastMsg) { lastMsg = msg; msgSince = now; }
        if (msg && now - msgSince > 1200) voice.say(msg);
        if (good) {
          if (!started) { started = true; voice.say('Harika. Kıpırdamadan durun.'); }
          frames.push(lm); heights.push(q.heightFrac); if (t) tilts.push(t);
        }
        hud({
          title: `${index + 1}/${total} · ${step.title}`,
          text: good ? 'Ölçülüyor — kıpırdamadan durun.' : msg || step.say,
          checks, progress: frames.length / FRAMES_PER_VIEW,
        });
        if (frames.length >= FRAMES_PER_VIEW) {
          cancelAnimationFrame(run.raf);
          voice.say('Tamam.', { force: true });
          const view = step.view;
          resolve({
            frames,
            conditions: {
              view, model: MODEL, width: vw, height: vh, heightFrac: +median(heights).toFixed(3),
              level: tilts.length > frames.length * 0.8 ? 'known' : 'unknown',
              facing: view === 'side' ? (q.view?.facing ?? null) : null,
              mode: store.state.settings.mode,
            },
          });
        }
      };
      run.raf = requestAnimationFrame(loop);
    });
  }

  function newRun() {
    run = { cancelled: false, raf: 0, cancel() { this.cancelled = true; cancelAnimationFrame(this.raf); } };
    return run;
  }

  function ensureScan() {
    current ??= { id: `t${Date.now().toString(36)}`, date: new Date().toISOString(), model: MODEL, profile: { ...store.state.profile }, captures: {}, movements: {} };
    return current;
  }

  // ---------------- Duruş taraması ----------------
  async function startPosture() {
    newRun();
    try { await openCamera(); } catch (e) { return cameraError(e); }
    const scan = ensureScan();
    const self = store.state.settings.mode === 'self';
    for (const [i, step] of POSTURE_STEPS.entries()) {
      if (self) await countdown(10, step.say);
      if (run.cancelled) break;
      const res = await captureView(step, i, POSTURE_STEPS.length);
      if (!res) break;
      const metrics = postureMetrics(res.frames, { ...res.conditions, userHeightCm: store.state.profile.heightCm });
      const skeleton = res.frames[0].map((_, k) => [0, 1, 2, 3].map((c) => median(res.frames.map((f) => f[k][c]))));
      scan.captures[step.view] = { conditions: res.conditions, metrics, frames: res.frames.length, skeleton };
      if (step.view === 'front') {
        const segments = measureSegments(res.frames, { ...res.conditions, userHeightCm: store.state.profile.heightCm });
        scan.proportions = { segments, bmi: bmi(store.state.profile.heightCm, store.state.profile.weightKg) };
      }
    }
    const cancelled = run.cancelled;
    closeCamera();
    if (cancelled && !Object.keys(scan.captures).length) { current = null; return home(); }
    finish(scan);
  }

  function finish(scan) {
    if (!store.state.scans.some((x) => x.id === scan.id)) store.addScan(scan);
    else store.setSettings({}); // değişikliği kaydet
    voice.say('Tarama tamamlandı. Raporunuz hazır.', { force: true });
    report(scan);
  }

  // ---------------- Hareket testleri ----------------
  function movementList() {
    show(h('div', { class: 'scan-home' },
      h('h2', {}, 'Hareket testleri'),
      disclaimer(),
      h('p', { class: 'sub' }, 'Her hareketi yavaş ve rahat olduğunuz aralıkta yapın. Ağrı, baş dönmesi veya dengesizlik olursa hemen durun.'),
      h('div', { class: 'move-list' }, Object.entries(MOVEMENT_TESTS).map(([id, T]) => h('button', {
        class: 'move-item', dataset: { test: id }, onclick: () => safety(id),
      }, h('strong', {}, T.tr), h('span', {}, `${VIEWS[T.view]} · ~${T.durationS} s${T.safety === 'denge' ? ' · denge testi: güvenlik soruları' : ''}`)))),
      h('button', { class: 'btn ghost', onclick: home }, 'Geri')), 'moves');
  }

  function safety(id) {
    const T = MOVEMENT_TESTS[id];
    const node = h('div', { class: 'scan-form', id: 'scan-safety', dataset: { test: id } },
      h('h2', {}, T.tr),
      T.safety === 'denge' ? h('p', { class: 'notice' }, 'Bu bir denge testidir. Düşme riskini azaltmak için aşağıdaki soruları yanıtlayın.') : null,
      ...(T.screening ?? []).map((q, i) => h('fieldset', { class: 'yn' }, h('legend', {}, q),
        h('label', {}, h('input', { type: 'radio', name: `sq${i}`, value: 'evet' }), 'Evet'),
        h('label', {}, h('input', { type: 'radio', name: `sq${i}`, value: 'hayir' }), 'Hayır'))),
      ...(T.preconditions ?? []).map((p, i) => h('label', { class: 'check' }, h('input', { type: 'checkbox', id: `pc${i}` }), h('span', {}, p))),
      h('h3', {}, 'Nasıl yapılır'),
      h('ol', {}, T.steps.map((x) => h('li', {}, x))),
      h('p', { class: 'sub' }, 'Ekrandaki büyük "Durdur" düğmesi testi her an bitirir.'),
      h('p', { class: 'warnline', id: 'safety-err', hidden: true }),
      h('div', { class: 'actions' },
        h('button', { class: 'btn primary', id: 'btn-move-start', onclick: () => {
          const answers = (T.screening ?? []).map((_, i) => document.querySelector(`input[name="sq${i}"]:checked`)?.value);
          const err = $('safety-err');
          if (answers.some((a) => !a)) { err.hidden = false; err.textContent = 'Lütfen tüm soruları yanıtlayın.'; return; }
          if (answers.includes('evet')) {
            err.hidden = false;
            err.textContent = 'Güvenliğiniz için bu testi önermiyoruz. Denge değerlendirmesi için bir sağlık profesyoneline başvurabilirsiniz.';
            dbg.blocked = id;
            $('btn-move-start').disabled = true;
            return;
          }
          if ((T.preconditions ?? []).some((_, i) => !$(`pc${i}`).checked)) { err.hidden = false; err.textContent = 'Başlamadan önce güvenlik koşullarını onaylayın.'; return; }
          startMovement(id);
        } }, 'Başla'),
        h('button', { class: 'btn ghost', onclick: movementList }, 'Geri')));
    show(node, 'safety');
  }

  async function startMovement(id) {
    const T = MOVEMENT_TESTS[id];
    newRun();
    try { await openCamera(); } catch (e) { return cameraError(e); }
    const scan = ensureScan();
    const self = store.state.settings.mode === 'self';
    if (self) await countdown(10, T.steps[0]);
    // 1) Hazırlık: görünüş ve kadraj doğru olana kadar bekle
    const ready = await new Promise((resolve) => {
      let okSince = 0, lastDetect = 0;
      const loop = (now) => {
        if (run.cancelled) return resolve(null);
        run.raf = requestAnimationFrame(loop);
        if (video.readyState < 2 || now - lastDetect < 66) return;
        lastDetect = now;
        const { lm, q, vw, vh } = sample(T.view, now);
        drawOverlay(lm, q.ok);
        dbg.quality = { ok: q.ok, message: q.message, view: q.view?.view };
        if (q.message) voice.say(q.message);
        hud({ title: `${T.tr} · hazırlık`, text: q.message ?? 'Hazırsınız.', checks: q.checks });
        if (q.ok) { okSince ||= now; if (now - okSince > 800) { cancelAnimationFrame(run.raf); resolve({ vw, vh, heightFrac: q.heightFrac, facing: q.view?.facing ?? null }); } }
        else okSince = 0;
      };
      run.raf = requestAnimationFrame(loop);
    });
    if (!ready) { closeCamera(); return movementList(); }
    // 2) Kayıt: yönergeler sırayla okunur
    const samples = [];
    const tilts = [];
    const t0 = performance.now();
    const spoken = new Set();
    const durMs = T.durationS * 1000 * DURATION_X;
    const stepGap = durMs / (T.steps.length + 1);
    await new Promise((resolve) => {
      let lastDetect = 0;
      const loop = (now) => {
        if (run.cancelled) return resolve();
        run.raf = requestAnimationFrame(loop);
        const el = now - t0;
        const si = Math.min(T.steps.length - 1, Math.floor(el / stepGap));
        if (!spoken.has(si)) { spoken.add(si); voice.say(T.steps[si], { force: true }); }
        if (video.readyState >= 2 && now - lastDetect >= 66) {
          lastDetect = now;
          const det = tracker.detect(video, now);
          const t = tilt.current();
          if (t) tilts.push(t);
          if (det) samples.push({ t: el / 1000, lm: det.all });
          drawOverlay(det?.all, Boolean(det));
        }
        hud({ title: T.tr, text: T.steps[si], progress: Math.min(1, el / durMs) });
        if (el >= durMs) { cancelAnimationFrame(run.raf); resolve(); }
      };
      run.raf = requestAnimationFrame(loop);
    });
    const stopped = run.cancelled;
    voice.say(stopped ? 'Test durduruldu.' : 'Hareketi tamamladınız.', { force: true, interrupt: true });
    closeCamera();
    const res = T.analyze(samples, { width: ready.vw, height: ready.vh, userHeightCm: store.state.profile.heightCm, maxHoldS: T.maxHoldS });
    scan.movements[id] = {
      tr: T.tr, metrics: res.metrics, issues: res.issues, reps: res.reps, samples: samples.length, stopped,
      conditions: { view: T.view, model: MODEL, heightFrac: ready.heightFrac, level: tilts.length > samples.length * 0.8 ? 'known' : 'unknown', facing: ready.facing },
    };
    afterMovement(id, scan);
  }

  function afterMovement(id, scan) {
    show(h('div', { class: 'scan-form', id: 'scan-after' },
      h('h2', {}, MOVEMENT_TESTS[id].tr),
      h('p', {}, 'Test sırasında ağrı, baş dönmesi veya rahatsızlık hissettiniz mi?'),
      h('div', { class: 'actions' },
        h('button', { class: 'btn', id: 'btn-discomfort-no', onclick: () => { scan.movements[id].discomfort = false; finish(scan); } }, 'Hayır'),
        h('button', { class: 'btn', id: 'btn-discomfort-yes', onclick: () => { scan.movements[id].discomfort = true; finish(scan); } }, 'Evet'))), 'after');
  }

  function cameraError(e) {
    closeCamera();
    show(h('div', { class: 'scan-form' },
      h('h2', {}, 'Kamera açılamadı'),
      h('p', {}, describeCameraError(e)),
      h('button', { class: 'btn', onclick: home }, 'Geri')), 'camera-error');
  }

  // ---------------- Rapor, geçmiş, veri ----------------
  function show3D(topic) {
    const T = TOPICS[topic];
    const scan = current ?? store.state.scans.at(-1);
    const seg = scan?.proportions?.segments;
    let twin = null;
    if (seg && scan.profile?.heightCm) {
      const atlasJ = window.__icgorManifest?.joints;
      if (atlasJ) twin = twinScales(seg, ATLAS_SEG(atlasJ), scan.profile.heightCm, window.__icgorManifest.bodyHeight * 100);
    }
    try { sessionStorage.setItem('icgor.highlight', JSON.stringify({ topic, title: T.tr, ids: T.highlight, anatomy: T.anatomy, twin })); } catch { /* özel mod */ }
    location.hash = '#/anatomi?ikiz';
  }

  function report(scan) {
    const node = h('div', { class: 'scan-report-page' },
      renderReport(scan, {
        history: store.state.scans, onShow3D: show3D,
        onExport: () => download(`icgor-tarama-${scan.date.slice(0, 10)}.json`, JSON.stringify(scan, null, 2)),
      }),
      h('div', { class: 'actions' },
        h('button', { class: 'btn primary', id: 'btn-report-more', onclick: () => { current = scan; movementList(); } }, 'Bu taramaya hareket testi ekle'),
        h('button', { class: 'btn ghost', id: 'btn-report-home', onclick: () => { current = null; home(); } }, 'Ana sayfa')),
      store.persistent ? null : h('p', { class: 'sub' }, 'Saklama izni vermediğiniz için bu rapor sayfa kapanınca silinecek. Dışa aktararak saklayabilirsiniz.'));
    show(node, 'report');
  }

  function history() {
    const scans = [...store.state.scans].reverse();
    show(h('div', { class: 'scan-home' },
      h('h2', {}, 'Geçmiş taramalar'),
      h('p', { class: 'sub' }, 'Karşılaştırmalar yalnızca benzer koşullarda (aynı görünüş, bakış yönü, model ve kamera uzaklığı) yapılır; fark, ölçüm belirsizliğini aşmıyorsa değişim gösterilmez.'),
      h('ul', { class: 'history' }, scans.map((sc) => h('li', {},
        h('button', { class: 'linklike', onclick: () => { current = null; report(sc); } }, new Date(sc.date).toLocaleString('tr-TR')),
        h('span', { class: 'sub' }, ` ${Object.keys(sc.captures ?? {}).map((v) => VIEWS[v]).join(', ')}${Object.keys(sc.movements ?? {}).length ? ` · ${Object.keys(sc.movements).length} hareket testi` : ''}`),
        h('button', { class: 'btn small ghost', onclick: () => { if (confirm('Bu tarama silinsin mi?')) { store.deleteScan(sc.id); history(); } } }, 'Sil')))),
      trend(),
      h('button', { class: 'btn ghost', onclick: home }, 'Geri')), 'history');
  }

  /** Seçili göstergelerin zaman içindeki değeri ± belirsizlik (basit SVG). */
  function trend() {
    const keys = [['front', 'shoulderLevel'], ['front', 'trunkLateral'], ['side', 'headForwardCm'], ['side', 'trunkForward']];
    const box = h('div', { class: 'trends' });
    for (const [view, k] of keys) {
      const pts = store.state.scans.map((sc) => ({ d: new Date(sc.date), m: sc.captures?.[view]?.metrics?.[k] })).filter((p) => p.m?.value != null);
      if (pts.length < 2) continue;
      const W = 300, H = 90, pad = 8;
      const t0 = pts[0].d.getTime(), t1 = pts.at(-1).d.getTime() || t0 + 1;
      const lo = Math.min(...pts.map((p) => p.m.value - p.m.u)), hi = Math.max(...pts.map((p) => p.m.value + p.m.u));
      const X = (d) => pad + ((d.getTime() - t0) / Math.max(1, t1 - t0)) * (W - 2 * pad);
      const Y = (v) => H - pad - ((v - lo) / Math.max(1e-6, hi - lo)) * (H - 2 * pad);
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
      svg.setAttribute('class', 'trend');
      svg.setAttribute('role', 'img');
      svg.setAttribute('aria-label', `${pts[0].m.tr} zaman içinde`);
      for (const p of pts) {
        const l = document.createElementNS(svg.namespaceURI, 'line');
        Object.entries({ x1: X(p.d), x2: X(p.d), y1: Y(p.m.value - p.m.u), y2: Y(p.m.value + p.m.u), class: 'err' }).forEach(([a, v]) => l.setAttribute(a, v));
        const c = document.createElementNS(svg.namespaceURI, 'circle');
        Object.entries({ cx: X(p.d), cy: Y(p.m.value), r: 3.5, class: 'pt' }).forEach(([a, v]) => c.setAttribute(a, v));
        svg.append(l, c);
      }
      box.append(h('figure', {}, svg, h('figcaption', {}, `${pts[0].m.tr} (${pts[0].m.unit}) — çubuklar ölçüm belirsizliği`)));
    }
    return box;
  }

  function dataControls() {
    const st = store.state;
    show(h('div', { class: 'scan-form', id: 'scan-data' },
      h('h2', {}, 'Verilerim ve gizlilik'),
      h('ul', { class: 'facts' },
        h('li', {}, 'Kamera görüntüsü yalnızca bu cihazda işlenir; hiçbir kare kaydedilmez veya gönderilmez.'),
        h('li', {}, `Saklanan: ${st.scans.length} tarama (yalnızca sayısal sonuçlar), profil ve ayarlar.`),
        h('li', {}, store.persistent ? 'Saklama izni: verildi (bu cihaz, tarayıcı deposu).' : 'Saklama izni: yok — veriler sayfa kapanınca silinir.')),
      h('div', { class: 'actions' },
        h('button', { class: 'btn', id: 'btn-data-export', onclick: () => download('icgor-verilerim.json', store.exportJSON()) }, 'Tüm verileri dışa aktar (JSON)'),
        h('button', { class: 'btn', id: 'btn-data-delete', onclick: () => {
          if (!confirm('Tüm profil, tarama ve onay kayıtlarınız bu cihazdan kalıcı olarak silinsin mi?')) return;
          store.clearAll(); current = null; home();
        } }, 'Tüm verilerimi sil')),
      h('button', { class: 'btn ghost', onclick: home }, 'Geri')), 'data');
  }

  function download(name, text) {
    const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
    const a = h('a', { href: url, download: name });
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  $('btn-scan-stop').addEventListener('click', () => {
    if (!run) return;
    run.cancel();
    voice.say('Durduruldu.', { force: true, interrupt: true });
  });
  document.addEventListener('visibilitychange', () => { if (document.hidden && run) run.cancel(); });

  // Atlas eklemleri (ikiz çarpanları için)
  import('../three/assets.js').then((m) => m.loadManifest()).then((m) => { window.__icgorManifest = m; }).catch(() => {});

  home();
  dbg.api = { home, consent, profile, startPosture, startMovement, report, history, dataControls, movementList, safety };
  return {
    activate() {},
    deactivate() { if (run) run.cancel(); closeCamera(); },
  };
}
