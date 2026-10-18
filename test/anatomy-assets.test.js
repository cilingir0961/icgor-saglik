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
  for (const id of ['skin', 'skull', 'spine', 'ribcage', 'pelvis', 'lung-left', 'lung-right', 'heart', 'liver', 'stomach', 'kidney-left', 'kidney-right', 'small-intestine', 'large-intestine']) {
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

test('akciğer kaydı kalıntısı kabul edilebilir (RMS < 25 mm)', () => {
  assert.ok(manifest.registration.landmarks >= 25);
  assert.ok(manifest.registration.rmsMm < 25, `${manifest.registration.rmsMm} mm`);
});

test('mobil (low) dosyalar masaüstü (high) dosyalardan küçük ve bütçe içinde', () => {
  let high = 0, low = 0;
  for (const layer of ['skin', 'skeleton', 'organs']) {
    const h = manifest.lods.high[layer], l = manifest.lods.low[layer];
    assert.ok(l.bytes < h.bytes && l.tris < h.tris, layer);
    assert.equal(statSync(new URL(`../assets/anatomy/${l.path}`, import.meta.url)).size, l.bytes);
    high += h.tris; low += l.tris;
  }
  assert.ok(low <= 150000, `low toplam ${low}`);
  assert.ok(high <= 400000, `high toplam ${high}`);
});

test('lisans ve köken kayıtları mevcut', () => {
  const lic = readFileSync(new URL('../assets/anatomy/LICENSE.md', import.meta.url), 'utf8');
  assert.match(lic, /BodyParts3D, © The Database Center for Life Science/);
  assert.match(lic, /CC BY 4\.0/);
  assert.match(lic, /CC BY-SA 4\.0/);
  const prov = JSON.parse(readFileSync(new URL('../assets/anatomy/provenance.json', import.meta.url)));
  const parts = Object.values(prov.bodyparts3d.parts).flat();
  assert.ok(parts.length > 500 && parts.every((p) => /^[0-9a-f]{64}$/.test(p.sha256)));
});
