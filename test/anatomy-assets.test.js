// Üretilmiş anatomi varlıklarının anatomik konum doğrulaması.
// Eksenler: +X hastanın solu, +Y baş, +Z ön. Kaynak: assets/anatomy/manifest.json
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, statSync } from 'node:fs';
import { ORGAN_INFO } from '../src/anatomy/organ-info.js';

const manifest = JSON.parse(readFileSync(new URL('../assets/anatomy/manifest.json', import.meta.url)));
const S = Object.fromEntries(manifest.structures.map((s) => [s.id, s]));
const c = (id) => S[id].centroid;
const inside = (inner, outer, tol = 0.01) =>
  [0, 1, 2].every((k) => S[inner].min[k] >= S[outer].min[k] - tol && S[inner].max[k] <= S[outer].max[k] + tol);

test('her yapının eğitim bilgisi ve iki LOD üçgen sayısı var', () => {
  for (const s of manifest.structures) {
    assert.ok(ORGAN_INFO[s.id], `bilgi yok: ${s.id}`);
    assert.ok(s.tris.high > 0 && s.tris.low > 0 && s.tris.low <= s.tris.high, s.id);
  }
  for (const id of Object.keys(ORGAN_INFO)) assert.ok(S[id], `modelde yok: ${id}`);
});

test('istenen tüm yapılar mevcut', () => {
  for (const id of ['skin', 'skull', 'spine', 'ribcage', 'pelvis', 'lung-left', 'lung-right', 'heart', 'liver', 'stomach', 'kidney-left', 'kidney-right', 'small-intestine', 'large-intestine', 'brain', 'aorta', 'spinal-cord', 'nerves', 'mus-chest', 'mus-abdomen', 'mus-back', 'mus-shoulder-arm', 'mus-hip-thigh']) {
    assert.ok(S[id], id);
  }
});

test('vücut boyu gerçekçi (1,5–1,95 m) ve ayak tabanı y=0', () => {
  assert.ok(manifest.bodyHeight > 1.5 && manifest.bodyHeight < 1.95);
  assert.ok(Math.abs(S.skin.min[1]) < 1e-3);
});

test('sağ/sol yerleşim (situs solitus)', () => {
  assert.ok(c('liver')[0] < 0, 'karaciğer sağda');
  assert.ok(c('gallbladder')[0] < 0, 'safra kesesi sağda');
  assert.ok(c('stomach')[0] > 0, 'mide solda');
  assert.ok(c('spleen')[0] > 0, 'dalak solda');
  assert.ok(c('heart')[0] > 0, 'kalbin ağırlık merkezi orta hattın solunda');
  assert.ok(c('lung-right')[0] < 0 && c('lung-left')[0] > 0, 'akciğerler doğru tarafta');
  assert.ok(c('kidney-right')[0] < 0 && c('kidney-left')[0] > 0, 'böbrekler doğru tarafta');
});

test('dikey sıra: beyin > akciğer/kalp > karaciğer/mide > böbrek > bağırsak > mesane', () => {
  const y = (id) => c(id)[1];
  assert.ok(y('brain') > y('heart'));
  assert.ok(y('heart') > y('liver') && y('lung-right') > y('liver'));
  assert.ok(y('stomach') > y('small-intestine'));
  assert.ok(y('kidney-left') > y('bladder') && y('small-intestine') > y('bladder'));
  assert.ok(y('kidney-right') < y('kidney-left'), 'sağ böbrek karaciğer nedeniyle daha aşağıda');
  const organs = manifest.structures.filter((s) => s.layer === 'organs' && s.id !== 'brain');
  assert.equal(organs.sort((a, b) => a.centroid[1] - b.centroid[1])[0].id, 'bladder');
});

test('ön-arka ilişkiler: böbrekler ve omurga arkada, sternum önde', () => {
  const z = (id) => c(id)[2];
  assert.ok(z('kidney-left') < z('stomach') && z('kidney-right') < z('liver'), 'böbrekler retroperitoneal');
  assert.ok(z('spine') < z('heart'), 'omurga kalbin arkasında');
  assert.ok(S.ribcage.max[2] > S.heart.max[2], 'göğüs kafesi kalbin önünde');
  assert.ok(z('spleen') < z('stomach'), 'dalak midenin arkasında');
});

test('kapsama: organlar koruyucu yapıların içinde', () => {
  assert.ok(inside('brain', 'skull'), 'beyin kafatası içinde');
  assert.ok(inside('heart', 'ribcage'), 'kalp göğüs kafesi içinde');
  assert.ok(inside('lung-left', 'ribcage', 0.02) && inside('lung-right', 'ribcage', 0.02), 'akciğerler göğüs kafesi içinde');
  assert.ok(inside('bladder', 'pelvis'), 'mesane pelvis içinde');
  for (const s of manifest.structures) if (s.id !== 'skin') assert.ok(inside(s.id, 'skin', 0.005), `${s.id} deri içinde`);
});

test('kalp iki akciğer arasında, akciğer tepeleri ilk kaburga hizasına yakın', () => {
  assert.ok(S['lung-right'].max[0] < c('heart')[0] + 0.02 && S['lung-left'].min[0] > c('heart')[0] - 0.05);
  assert.ok(Math.abs(S['lung-right'].max[1] - S.ribcage.max[1]) < 0.05);
});

test('bağımsız atlasla çapraz doğrulama: kayıt RMS < 25 mm, akciğer merkezleri < 30 mm', () => {
  const v = manifest.validation;
  assert.ok(v.landmarks >= 25);
  assert.ok(v.rmsMm < 25, `${v.rmsMm} mm`);
  for (const l of v.lungs) {
    assert.ok(l.centroidDistanceMm < 30, `${l.id}: ${l.centroidDistanceMm} mm`);
    assert.ok(l.boxIoU > 0.4, `${l.id}: IoU ${l.boxIoU}`);
  }
});

test('mobil (low) dosyalar masaüstü (high) dosyalardan küçük ve bütçe içinde', () => {
  let high = 0, low = 0, lowDefault = 0;
  for (const layer of ['skin', 'muscles', 'skeleton', 'organs', 'vessels', 'nerves']) {
    const h = manifest.lods.high[layer], l = manifest.lods.low[layer];
    assert.ok(l.bytes < h.bytes && l.tris < h.tris, layer);
    assert.equal(statSync(new URL(`../assets/anatomy/${l.path}`, import.meta.url)).size, l.bytes);
    high += h.tris; low += l.tris;
    if (['skin', 'skeleton', 'organs'].includes(layer)) lowDefault += l.tris;
  }
  assert.ok(lowDefault <= 150000, `mobil varsayılan katmanlar ${lowDefault}`);
  assert.ok(low <= 260000, `mobil tüm katmanlar ${low}`);
  assert.ok(high <= 700000, `masaüstü tüm katmanlar ${high}`);
});

test('damar ve sinir konumları', () => {
  assert.ok(c('aorta')[0] > c('vena-cava')[0], 'aort vena kavanın solunda');
  assert.ok(c('vena-cava')[0] < 0, 'vena kava orta hattın sağında');
  assert.ok(c('aorta')[2] < c('heart')[2] + 0.05 && c('aorta')[2] > c('spine')[2], 'aort omurganın önünde');
  assert.ok(inside('spinal-cord', 'spine', 0.005), 'omurilik omurga kanalında');
  for (const id of ['arteries', 'veins', 'nerves']) assert.ok(inside(id, 'skin', 0.01), `${id} deri içinde`);
});

test('kas grupları anatomik konumda (Z-Anatomy, BodyParts3D iskeletine kayıtlı)', () => {
  assert.ok(S['mus-abdomen'].max[2] > S['large-intestine'].max[2], 'karın kasları bağırsakların önünde');
  assert.ok(c('mus-back')[2] < c('spine')[2], 'sırt kasları omurganın arkasında');
  assert.ok(c('mus-chest')[2] > c('spine')[2] && c('mus-chest')[1] > c('mus-abdomen')[1], 'göğüs kasları önde ve karın kaslarının üstünde');
  assert.ok(c('mus-head-neck')[1] > c('mus-chest')[1] && c('mus-leg-foot')[1] < c('mus-hip-thigh')[1]);
  for (const s of manifest.structures.filter((x) => x.layer === 'muscles')) {
    assert.equal(s.source, 'zanatomy');
    assert.ok(inside(s.id, 'skin', 0.012), `${s.id} deri içinde`);
  }
});

test('Z-Anatomy segment kaydı ve yinelenen temsil temizliği', () => {
  const reg = manifest.validation.zanatomyRegistration;
  assert.ok(Object.keys(reg).length >= 12);
  for (const [k, r] of Object.entries(reg)) {
    assert.ok(r.medianMm < 2.5 && r.p90Mm < 6, `${k}: ${JSON.stringify(r)}`);
  }
  for (const a of manifest.validation.zanatomyAlignment) assert.ok(a.distanceMm < 2 && a.beforeMm > 50, `${a.bone}`);
  assert.ok(manifest.validation.removedDuplicateRepresentations.some((x) => /right index finger/.test(x)));
});

test('lisans ve köken kayıtları mevcut', () => {
  const lic = readFileSync(new URL('../assets/anatomy/LICENSE.md', import.meta.url), 'utf8');
  assert.match(lic, /BodyParts3D, © The Database Center for Life Science/);
  assert.match(lic, /CC BY 4\.0/);
  assert.match(lic, /CC BY-SA 4\.0/);
  assert.match(lic, /Z-Anatomy/);
  const prov = JSON.parse(readFileSync(new URL('../assets/anatomy/provenance.json', import.meta.url)));
  const parts = Object.values(prov.bodyparts3d.parts).flat();
  assert.ok(parts.length > 500 && parts.every((p) => /^[0-9a-f]{64}$/.test(p.sha256)));
});
