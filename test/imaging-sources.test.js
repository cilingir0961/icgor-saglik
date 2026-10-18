import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SOURCE_KINDS, DATA_CLASSES, canUseSource, provenanceBadge } from '../src/imaging/sources.js';

test('hiçbir veri sınıfı tanısal değildir', () => {
  for (const c of Object.values(DATA_CLASSES)) assert.equal(c.diagnostic, false);
});

test('DICOM ve fantom kullanılabilir; ultrason cihazı onaysız kullanılamaz', () => {
  assert.ok(canUseSource(SOURCE_KINDS['dicom-file']).ok);
  assert.ok(canUseSource(SOURCE_KINDS['synthetic-phantom']).ok);
  const us = SOURCE_KINDS['ultrasound-device'];
  assert.equal(canUseSource(us).reason, 'unavailable');
  assert.equal(canUseSource({ ...us, available: true }).reason, 'unapproved-device');
  assert.equal(canUseSource({ ...us, available: true }, { regulatoryClearance: { authority: 'X', id: '1', verified: false } }).reason, 'unapproved-device');
  assert.ok(canUseSource({ ...us, available: true }, { regulatoryClearance: { authority: 'X', id: '1', verified: true } }).ok);
});

test('kaynak rozeti veri sınıfını ve tanısal olmadığını açıkça belirtir', () => {
  const d = provenanceBadge('dicom-file');
  assert.equal(d.kind, 'imaging');
  assert.match(d.text, /tanı amaçlı değil/);
  const s = provenanceBadge('synthetic-phantom');
  assert.equal(s.kind, 'synthetic');
  assert.match(s.text, /gerçek hasta verisi değil/);
  assert.equal(provenanceBadge('yok').kind, 'none');
});
