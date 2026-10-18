import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deflateSync } from 'node:zlib';
import { decodePng, comparePng } from '../scripts/lib/png.mjs';

// 4x4 RGB PNG üretir (filtre 0); pixel(x,y) → [r,g,b]
function makePng(pixel) {
  const crc32 = (buf) => { let c = ~0; for (const b of buf) { c ^= b; for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1)); } return ~c >>> 0; };
  const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td)); return Buffer.concat([len, td, crc]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(4, 0); ihdr.writeUInt32BE(4, 4); ihdr[8] = 8; ihdr[9] = 2;
  const rows = [];
  for (let y = 0; y < 4; y++) { rows.push(0); for (let x = 0; x < 4; x++) rows.push(...pixel(x, y)); }
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(Buffer.from(rows))), chunk('IEND', Buffer.alloc(0))]);
}

test('PNG çözme ve piksel karşılaştırma', () => {
  const a = makePng((x, y) => [x * 60, y * 60, 100]);
  const d = decodePng(a);
  assert.equal(d.w, 4);
  assert.deepEqual([...d.rgb.subarray(3 * 5, 3 * 5 + 3)], [60, 60, 100]);
  assert.equal(comparePng(a, a).diffRatio, 0);
  const b = makePng((x, y) => (x === 2 && y === 1 ? [255, 0, 0] : [x * 60, y * 60, 100]));
  assert.equal(comparePng(a, b).diffRatio, 1 / 16);
  const c = makePng((x, y) => [x * 60 + 3, y * 60, 100]); // eşik altı fark
  assert.equal(comparePng(a, c, 4).diffRatio, 0);
});
