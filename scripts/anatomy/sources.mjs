// Sabitlenmiş (pinned) kaynaklar + önbellekli, bütünlüğü doğrulanan indirme.
// Her kaynak belirli bir git commit'ine sabitlenir; böylece derleme yeniden üretilebilir.

import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile, stat } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { inflateRawSync } from 'node:zlib';

export const SOURCES = {
  bodyparts3d: {
    title: 'BodyParts3D 4.3',
    copyright: 'BodyParts3D, © The Database Center for Life Science licensed under CC Attribution 4.0 International',
    licenseNote:
      'Resmi lisans sayfası (2025-02-27) CC BY 4.0 belirtir; kaynak OBJ yorumları ve ayna depo eski CC BY-SA 2.1 JP der. '
      + 'İhtiyaten bu projedeki türev model dosyaları CC BY-SA 4.0 altında yayınlanır (her iki lisansla uyumlu).',
    licenseUrl: 'https://dbarchive.biosciencedbc.jp/en/bodyparts3d/lic.html',
    citation: 'Mitsuhashi N, et al. BodyParts3D: 3D structure database for anatomical concepts. Nucleic Acids Res. 2009;37:D782–5. doi:10.1093/nar/gkn613',
    mirror: 'https://github.com/olivercase/body_parts_3d_api',
    mirrorDoi: 'https://doi.org/10.5281/zenodo.22727172',
    commit: 'fd527e6f4daf732fd814314d9257df5877b844bc',
  },
  zanatomy: {
    title: 'Z-Anatomy (Blender şablonu)',
    copyright: 'Z-Anatomy — Gauthier Kervyn (tasarım, 3B, anatomi), Marcin Zielinski (Python); BodyParts3D (DBCLS) türevi',
    licenseNote: 'Tüm Z-Anatomy içeriği CC BY-SA 4.0. Bu projede kas ve tendon modelleri için kullanılır.',
    licenseUrl: 'https://creativecommons.org/licenses/by-sa/4.0/',
    repo: 'https://github.com/Z-Anatomy/Models-of-human-anatomy',
    commit: '0fee499c81db03fcbafecbe7ace68d5d5a18aa92',
    path: 'Z-Anatomy.zip',
    zipSha256: 'e029688545627bd0214b269e1063143abb580aad72b2c2445d6d8a9a0d9da736',
  },
  hra: {
    title: 'Human Reference Atlas — 3D Reference Organ Set, Male (united), v2.0',
    copyright: 'Human Reference Atlas (HuBMAP), medical illustration: Kristen Browne, Heidi Schlehlein; Visible Human Male data, U.S. National Library of Medicine',
    licenseNote: 'HRA 3D Reference Object Library: tüm 3B referans nesneleri CC BY 4.0.',
    licenseUrl: 'https://humanatlas.io/3d-reference-library',
    citation: 'Börner K, et al. Anatomical structures, cell types and biomarkers of the Human Reference Atlas. Nat Cell Biol. 2021;23:1117–1128. doi:10.1038/s41556-021-00788-6',
    repo: 'https://github.com/hubmapconsortium/ccf-releases',
    commit: 'b036a91aaf7234f462b1249d4a5f4fb0e982f412',
    path: 'v2.0/models/3d-vh-m-united.glb.zip',
  },
};

const CACHE = join(import.meta.dirname, '../../.cache/anatomy');

const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');
const exists = (p) => stat(p).then(() => true, () => false);

async function fetchBuffer(url, tries = 4) {
  for (let i = 0; ; i++) {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`${res.status} ${url}`);
      return Buffer.from(await res.arrayBuffer());
    } catch (e) {
      if (i >= tries - 1) throw e;
      await new Promise((r) => setTimeout(r, 2000 * 2 ** i));
    }
  }
}

/** Önbellekten oku, yoksa indir. expectedSha verilirse doğrula. */
export async function cached(key, url, expectedSha) {
  const path = join(CACHE, key);
  if (await exists(path)) {
    const buf = await readFile(path);
    if (!expectedSha || sha256(buf) === expectedSha) return buf;
  }
  const buf = await fetchBuffer(url);
  if (expectedSha && sha256(buf) !== expectedSha) throw new Error(`SHA-256 uyuşmuyor: ${key}`);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, buf);
  return buf;
}

const BP = SOURCES.bodyparts3d;
const bpRaw = (p) => `https://raw.githubusercontent.com/olivercase/body_parts_3d_api/${BP.commit}/${p}`;
const bpMedia = (p) => `https://media.githubusercontent.com/media/olivercase/body_parts_3d_api/${BP.commit}/${p}`;

export async function loadBp3dMetadata() {
  const fma = (await cached('bp3d/FMA2Obj.txt', bpRaw('metadata/FMA2Obj.txt'))).toString('utf8').replace(/\r/g, '\n');
  const concepts = new Map();
  for (const line of fma.split('\n')) {
    const [id, rel, comp] = line.split('\t');
    if (!id?.startsWith('FMA') || !comp) continue;
    if (!concepts.has(id)) concepts.set(id, {});
    concepts.get(id)[rel] = comp.split('+');
  }
  const csv = (await cached('bp3d/MANIFEST.csv', bpRaw('MANIFEST.csv'))).toString('utf8').trim().split('\n');
  const head = csv.shift().split(',');
  const parts = new Map();
  for (const line of csv) {
    // ad alanı virgül içermiyor (doğrulandı); yine de sondan say
    const cells = line.split(',');
    const row = {};
    head.forEach((h, i) => { row[h] = cells[i]; });
    row.name = cells.slice(3, cells.length - 4).join(',');
    row.faces = Number(cells[cells.length - 4]);
    parts.set(row.fj_id, row);
  }
  return { concepts, parts };
}

// Ayna deposundaki gerçek dosya adları (commit ${BP.commit} için `git ls-tree` çıktısı).
// Dosya adındaki BP/FMA kimlikleri MANIFEST sütunlarıyla her zaman aynı olmadığından listeye bakılır.
let fileIndex = null;
async function partPath(part) {
  if (!fileIndex) {
    const lines = (await readFile(join(import.meta.dirname, 'bp3d-file-index.txt'), 'utf8')).trim().split('\n');
    fileIndex = new Map(lines.map((l) => [l.slice(7).split('_')[0], l]));
  }
  const p = fileIndex.get(part.fj_id);
  if (!p) throw new Error(`dosya dizininde yok: ${part.fj_id}`);
  return p;
}

/** LFS işaretçisini okuyup asıl OBJ'yi indirir ve SHA-256 ile doğrular. */
export async function loadBp3dObj(part) {
  const p = await partPath(part);
  const url = (base) => base(p.split('/').map(encodeURIComponent).join('/'));
  const pointer = (await cached(`bp3d/ptr/${part.fj_id}.txt`, url(bpRaw))).toString('utf8');
  const oid = pointer.match(/oid sha256:([0-9a-f]{64})/)?.[1];
  if (!oid) throw new Error(`LFS işaretçisi okunamadı: ${p}`);
  const buf = await cached(`bp3d/obj/${part.fj_id}.obj`, url(bpMedia), oid);
  return { text: buf.toString('utf8'), sha256: oid, path: p };
}

/** HRA birleşik erkek GLB'sini (zip içinde) indirip açar. */
export async function loadHraUnitedMale() {
  const H = SOURCES.hra;
  const zip = await cached('hra/3d-vh-m-united.glb.zip', `https://raw.githubusercontent.com/hubmapconsortium/ccf-releases/${H.commit}/${H.path}`);
  return { glb: unzipEntry(zip, (n) => n.endsWith('.glb') && !n.startsWith('__MACOSX')), zipSha256: sha256(zip) };
}

/** En küçük zip okuyucu: merkez dizinden girdiyi bulur, deflate/store açar. */
export function unzipEntry(zip, match) {
  const eocd = zip.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  if (eocd < 0) throw new Error('zip sonu bulunamadı');
  const count = zip.readUInt16LE(eocd + 10);
  let p = zip.readUInt32LE(eocd + 16);
  for (let i = 0; i < count; i++) {
    const method = zip.readUInt16LE(p + 10);
    const csize = zip.readUInt32LE(p + 20);
    const nameLen = zip.readUInt16LE(p + 28), extraLen = zip.readUInt16LE(p + 30), commentLen = zip.readUInt16LE(p + 32);
    const local = zip.readUInt32LE(p + 42);
    const name = zip.toString('utf8', p + 46, p + 46 + nameLen);
    if (match(name)) {
      const lNameLen = zip.readUInt16LE(local + 26), lExtraLen = zip.readUInt16LE(local + 28);
      const data = zip.subarray(local + 30 + lNameLen + lExtraLen, local + 30 + lNameLen + lExtraLen + csize);
      if (method === 0) return Buffer.from(data);
      if (method === 8) return inflateRawSync(data);
      throw new Error(`desteklenmeyen zip yöntemi ${method}`);
    }
    p += 46 + nameLen + extraLen + commentLen;
  }
  throw new Error('zip girdisi bulunamadı');
}

/** Z-Anatomy arşivini indirir (SHA-256 doğrulamalı). Kas ağları bpy ile ayrıca dışa aktarılır (zanatomy-export.py). */
export async function loadZanatomyZip() {
  const Z = SOURCES.zanatomy;
  return cached('zanat/Z-Anatomy.zip', `https://raw.githubusercontent.com/Z-Anatomy/Models-of-human-anatomy/${Z.commit}/${Z.path}`, Z.zipSha256);
}

/** zanatomy-export.py çıktısını okur: { objects: [{name, collection, positions(m), indices}] } */
export function readZanatomyBin(buf) {
  const len = buf.readUInt32LE(0);
  const header = JSON.parse(buf.subarray(4, 4 + len).toString('utf8'));
  const total = header.objects.reduce((a, o) => a + o.v[1], 0);
  const posBytes = buf.subarray(4 + len, 4 + len + total * 12);
  const positions = new Float32Array(posBytes.buffer.slice(posBytes.byteOffset, posBytes.byteOffset + posBytes.byteLength));
  const idxBytes = buf.subarray(4 + len + total * 12);
  const indices = new Uint32Array(idxBytes.buffer.slice(idxBytes.byteOffset, idxBytes.byteOffset + idxBytes.byteLength));
  return header.objects.map((o) => ({
    name: o.name,
    collection: o.collection,
    positions: positions.subarray(o.v[0] * 3, (o.v[0] + o.v[1]) * 3),
    indices: indices.subarray(o.i[0], o.i[0] + o.i[1]),
  }));
}
