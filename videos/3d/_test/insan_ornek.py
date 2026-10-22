"""Tarz örneği: aynı berber dükkânında gerçekçi ve Pixar tarzı berber, iki ifade.
  blender -b -P _test/insan_ornek.py -- <cikti> <gercekci|pixar>"""
import bpy, sys, os
BURA = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(BURA, "..", "ortak"))
import importlib, temel, objeler as O, mekan_berber, insan as I
for m in (temel, O, mekan_berber, I):
    importlib.reload(m)
from temel import *

arg = sys.argv[sys.argv.index("--") + 1:]
OUT, TARZ = arg[0], arg[1]
os.makedirs(OUT, exist_ok=True)
sc = sahne_hazirla(30, ornek=48, gorunum="Khronos PBR Neutral", bakis="None")
dunya("#1c1d1f", 0.2, sis=0.0035, sis_renk="#ffe6cc")
M = mekan_berber.kur(os.path.join(BURA, "..", "berber"), 30, insan_berber=False)
for k_ in (M.bek1, M.bek2, M.musteri):
    gorunur(k_.kok, [(1, False)])
for ad in ("pelerin", "pelerin_yaka"):
    gorunur(bpy.data.objects[ad], [(1, False)])

govde, kok = I.insan("berber", (0.55, 0.35, 0), yon=-20, tarz=TARZ)
I.ifade(govde, 1, "gulumse")
I.ifade(govde, 10, "endise")
# Yeşil önlük rengi: iş kıyafetinin rengini koyu yeşile çek (marka)
for o in bpy.data.objects:
    if "worksuit" in o.name.lower():
        for m in o.data.materials:
            if m and m.node_tree:
                for n in m.node_tree.nodes:
                    if n.type == "BSDF_PRINCIPLED":
                        n.inputs["Base Color"].default_value = lin("#1f6f4a")
                        for l in list(m.node_tree.links):
                            if l.to_socket == n.inputs["Base Color"]:
                                m.node_tree.links.remove(l)

isik("ana", "AREA", (-1.0, -1.8, 2.4), (0.55, 0.35, 1.6), 220, "#ffdcbc", 1.6)
isik("kenar", "AREA", (1.6, 1.6, 2.4), (0.55, 0.35, 1.6), 300, "#ffb067", 0.8)
isik("dolgu", "AREA", (0.6, -2.8, 1.4), (0.55, 0.35, 1.5), 40, "#b4caff", 2.5)
bpy.context.view_layer.update()
bas = [o for o in bpy.data.objects if o.type == "MESH" and o.parent == kok or o == govde]
# Kafa yüksekliği: gövdenin en üst noktasından tahmin
zmax = max((govde.matrix_world @ v.co).z for v in govde.data.vertices)
hedef = Vector((0.55, 0.35, zmax - 0.13))
sc.camera = kamera("kam", hedef + Vector((-0.25, -1.25, 0.05)), hedef + Vector((0, 0, -0.08)), lens=55, fstop=2.4)
for kare in (1, 10):
    sc.frame_set(kare)
    sc.render.filepath = os.path.join(OUT, f"{TARZ}_{kare:02d}.png")
    bpy.ops.render.render(write_still=True)
print("TAMAM", zmax, [k.name for k in govde.data.shape_keys.key_blocks] if govde.data.shape_keys else None)
