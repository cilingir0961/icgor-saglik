"""Z-Anatomy (.blend) → ikili ağ önbelleği. Blender'ın Python modülüyle (bpy) çalışır.

Kurulum (bir kez):
    uv venv --python 3.11 .cache/bpyenv && uv pip install --python .cache/bpyenv/bin/python bpy
Kullanım:
    .cache/bpyenv/bin/python scripts/anatomy/zanatomy-export.py <Startup.blend> <çıktı.bin>

Değiştiriciler (alt bölümleme, kalınlaştırma vb.) uygulanmış, dünya koordinatlı geometri yazılır.
Z-Anatomy koordinatları BodyParts3D ile aynıdır (metre, +X sol, +Y arka, +Z yukarı); build.mjs bunu doğrular.

Biçim: [4 bayt JSON uzunluğu][JSON dizini][Float32 köşeler][Uint32 üçgen indisleri]
"""
import json
import re
import struct
import sys

import bpy
import numpy as np

SRC, OUT = sys.argv[-2], sys.argv[-1]

# Kas sistemi koleksiyonundan alınanlar; ince zar yapılar (fasya, bursa, kılıf, septum, retinakulum) hariç.
EXCLUDE = re.compile(r"fascia|bursa|sheath|septum|retinacul|aponeurosis of|annular part|cruciform part", re.I)
# Hizalama doğrulaması için ayrıca bazı kemikler.
CHECK_BONES = {"Femur.r", "Femur.l", "Humerus.r", "Humerus.l"}


def wanted(o):
    if o.type != "MESH":
        return False
    if o.name in CHECK_BONES:
        return True
    cols = [c.name for c in o.users_collection]
    # Kayıt için iskelet kemikleri (sol/sağ ve tek kemikler; işaret/etiket nesneleri hariç)
    if "1: Skeletal system" in cols and not re.search(r"\.(j|i|g|e\d*[lr]?|o\d*[lr]?)$", o.name):
        return True
    if "4: Muscular system" not in cols:
        return False
    if not re.search(r"\.(l|r)$", o.name) and not re.search(r"muscle|tendon", o.name, re.I):
        return False
    return not EXCLUDE.search(o.name)


bpy.ops.wm.open_mainfile(filepath=SRC)
dg = bpy.context.evaluated_depsgraph_get()
index, positions, indices = [], [], []
v_off = i_off = 0
for o in sorted(bpy.data.objects, key=lambda x: x.name):
    if not wanted(o):
        continue
    e = o.evaluated_get(dg)
    me = e.to_mesh()
    me.calc_loop_triangles()
    nv, nt = len(me.vertices), len(me.loop_triangles)
    if nv == 0 or nt == 0:
        e.to_mesh_clear()
        continue
    co = np.empty(nv * 3, dtype=np.float32)
    me.vertices.foreach_get("co", co)
    co = co.reshape(-1, 3)
    m = np.array(e.matrix_world, dtype=np.float64)
    world = (co @ m[:3, :3].T + m[:3, 3]).astype(np.float32)
    tri = np.empty(nt * 3, dtype=np.uint32)
    me.loop_triangles.foreach_get("vertices", tri)
    e.to_mesh_clear()
    index.append({"name": o.name, "collection": o.users_collection[0].name, "v": [v_off, nv], "i": [i_off, nt * 3]})
    positions.append(world.reshape(-1))
    indices.append(tri)
    v_off += nv
    i_off += nt * 3

header = json.dumps({"source": "Z-Anatomy Startup.blend", "units": "metre", "objects": index}).encode("utf-8")
with open(OUT, "wb") as f:
    f.write(struct.pack("<I", len(header)))
    f.write(header)
    f.write(np.concatenate(positions).astype("<f4").tobytes())
    f.write(np.concatenate(indices).astype("<u4").tobytes())
print(f"{len(index)} nesne, {v_off} köşe, {i_off // 3} üçgen → {OUT}")
