import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ellipseCircumference, hullPerimeter, largestLoop, runAt, silhouetteWidths, bodyMeasures, levelRows } from '../src/analysis/silhouette.js';
import { ATLAS_SILHOUETTE } from '../src/analysis/atlas-silhouette.js';
import { createStore, STORE_KEY } from '../src/scan/store.js';
import { skeleton } from './helpers/skeleton.js';

const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg ?? ''} ${a} ≉ ${b} (±${tol})`);
const W = 480, H = 640;

test('siluet: elips çevresi (daire = 2πr), dışbükey zarf, en büyük halka', () => {
  near(ellipseCircumference(10, 10), 2 * Math.PI * 10, 1e-9);
  near(ellipseCircumference(15, 10), 79.33, 0.02); // Ramanujan II referansı
  near(hullPerimeter([[0, 0], [1, 0], [1, 1], [0, 1], [0.5, 0.5]]), 4, 1e-9);
  // İki halka: 10×10 kare (gövde) ve 2×2 kare (kol) → büyük olan
  const sq = (x0, z0, s) => [[[x0, z0], [x0 + s, z0]], [[x0 + s, z0], [x0 + s, z0 + s]], [[x0 + s, z0 + s], [x0, z0 + s]], [[x0, z0 + s], [x0, z0]]];
  const L = largestLoop([...sq(0, 0, 10), ...sq(11, 4, 2)]);
  near(L.width, 10, 1e-9); near(L.perimeter, 40, 1e-9); assert.equal(L.loops, 2);
});

/** Basit maske: gövde dikdörtgeni + isteğe bağlı kollar (dikey şeritler). */
function maskWith({ torsoHalf = 60, armsTouch = false }) {
  const m = new Float32Array(W * H);
  const lm = skeleton({ abdL: 35, abdR: 35 }); // siluet adımındaki gibi kollar hafif açık
  const rows = levelRows(lm, W, H, 'front');
  const cx = rows.waist.cx;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    let on = Math.abs(x - cx) <= torsoHalf && y > rows.chest.y - 80 && y < rows.hip.y + 60;
    if (armsTouch && Math.abs(Math.abs(x - cx) - (torsoHalf + 15)) <= 15 && y > rows.chest.y - 80 && y < rows.hip.y + 40) on = true;
    m[y * W + x] = on ? 1 : 0;
  }
  return { m, lm, rows };
}

test('siluet: düzey genişliği; kollar gövdeye değiyorsa düzey geçersiz', () => {
  const { m, lm, rows } = maskWith({ torsoHalf: 60 });
  assert.deepEqual(runAt(m, W, rows.waist.y, rows.waist.cx), [Math.ceil(rows.waist.cx - 60), Math.floor(rows.waist.cx + 60) + 1]);
  const w = silhouetteWidths(m, W, H, lm, 'front');
  near(w.waist.px, 121, 1.5);
  // Kollar yanda (skeleton: dirsek gövde kenarına yakın) ve maskede gövdeyle birleşik
  const t = maskWith({ torsoHalf: 60, armsTouch: true });
  const lmArms = t.lm.map((p) => p.slice());
  const wt = silhouetteWidths(t.m, W, H, lmArms, 'front');
  assert.ok(Object.values(wt).some((v) => v.why === 'kollar gövdeye değiyor'), JSON.stringify(wt));
});

test('siluet: vücut ölçüleri cm, kalibrasyon sapması düşülür, ikiz çarpanı atlas referansına göre', () => {
  const { m, lm } = maskWith({ torsoHalf: 60 });
  const sample = { mask: { data: m, width: W, height: H }, lm };
  const height = 161 / 0.936; // skeleton() ölçeği: göz 161 cm
  const B = bodyMeasures([sample], [sample], height);
  const scale = 1 / 2.2; // cm/px (skeleton ölçeği 2,2 px/cm)
  near(B.levels.waist.widthCm, 121 * scale - 0.8, 0.8);
  assert.ok(B.levels.waist.circCm > 0 && B.experimental);
  near(B.twin.sx, Math.min(1.3, Math.max(0.8, B.levels.waist.widthCm / (ATLAS_SILHOUETTE.waist.width * height / 100))), 0.2);
});

function memStorage() {
  const d = new Map();
  return { getItem: (k) => (d.has(k) ? d.get(k) : null), setItem: (k, v) => d.set(k, String(v)), removeItem: (k) => d.delete(k), _d: d };
}

test('depo: saklama izni yoksa diske yazmaz; izinle yazar; tümünü sil iz bırakmaz; görüntü alanı yok', () => {
  const st = memStorage();
  const a = createStore(st);
  a.setConsent({ store: false });
  a.setProfile({ heightCm: 180, weightKg: 'x', age: 300 });
  assert.equal(st.getItem(STORE_KEY), null);
  assert.deepEqual(a.state.profile, { heightCm: 180, weightKg: null, age: null });
  a.setConsent({ store: true });
  a.addScan({ id: '1', date: '2026-10-18T00:00:00Z', captures: {} });
  assert.ok(st.getItem(STORE_KEY).includes('"heightCm":180'));
  const b = createStore(st);
  assert.equal(b.state.scans.length, 1, 'yeniden açılışta geri yüklenir');
  assert.match(b.exportJSON(), /görüntü içermez/);
  b.clearAll();
  assert.equal(st.getItem(STORE_KEY), null);
  assert.equal(b.state.consent, null);
});
