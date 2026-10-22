"""Karakter v2 örneği.  blender -b -P _test/karakter2_ornek.py -- <cikti>"""
import bpy, sys, os
BURA = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(BURA, "..", "ortak"))
import importlib, temel, karakter as K1, karakter2 as K2, objeler as O, mekan_berber
for m in (temel, K1, K2, O, mekan_berber):
    importlib.reload(m)
from temel import *

OUT = sys.argv[sys.argv.index("--") + 1]
os.makedirs(OUT, exist_ok=True)
sc = sahne_hazirla(40, ornek=48, gorunum="Khronos PBR Neutral", bakis="None")
sc.render.resolution_percentage = 50
dunya("#1c1d1f", 0.2, sis=0.003, sis_renk="#ffe6cc")
M = mekan_berber.kur(os.path.join(BURA, "..", "berber"), 40, insan_berber=False)
for k_ in (M.bek1, M.bek2, M.musteri):
    gorunur(k_.kok, [(1, False)])
bpy.data.objects["pelerin"].scale = (0.85, 0.85, 0.95)

usta = K2.karakter("usta", (0.62, 0.42, 0), yon=-30, ten="#c98d68", sac="#1d1510", biyik=True, sakal=True,
                   gomlek="#f1ede6", onluk=RENK["yesil_koyu"], pantolon="#2a2d33")
mk = O.makas("makas", usta.el["R"], (0, 0, -0.1), (180, 0, 0), olcek=0.8)
musteri = K2.karakter("musteri2", (0, -0.02, -0.22), oturan=True, ten="#d7a27d", sac="#3a2516", gomlek="#5b6b7a",
                      pantolon="#2d3138")
for t in ("L", "R"):
    musteri.omuz[t].scale = (0.0001,) * 3       # kollar pelerinin altında
salon = K2.karakter("salon", (-1.4, 0.6, 0), yon=15, ten="#e2b08c", sac="#4a2c1c", sac_tip="topuz", kirpik=True,
                    gomlek="#efe6dc", onluk=RENK["yesil_koyu"], pantolon="#3b3f4a")

bpy.context.view_layer.update()
MK = musteri.kafa.matrix_world.translation.copy()
K1.kol_hedef(usta, 1, "R", MK + Vector((0.2, -0.05, 0.05)), dirsek=-35, gecis=1)
K1.kol_hedef(usta, 1, "L", MK + Vector((0.02, 0.15, 0.17)), dirsek=-35, gecis=1)
K1.bak_yon(usta, 1, sag=-8, asagi=22)
for kare, ad in ((1, "gulumse"), (10, "gulumse"), (20, "stres"), (30, "goz_kirp")):
    K1.ifade(usta, kare, ad, gecis=2)
K1.ifade(musteri, 1, "gulumse")
K1.ifade(salon, 1, "gulumse")
K1.kol_poz(salon, 1, (-15, 0, 8, -20), (-15, 0, -8, -20))

isik("ana", "AREA", (-1.2, -2.2, 2.6), (0.2, 0.2, 1.4), 260, "#ffdcbc", 1.8)
isik("kenar", "AREA", (1.6, 1.9, 2.6), (0.3, 0.4, 1.5), 330, "#ffb067", 0.9)
isik("dolgu", "AREA", (0.6, -3.2, 1.3), (0.2, 0.2, 1.3), 45, "#b4caff", 3.0)

bpy.context.view_layer.update()
UK = usta.kafa.matrix_world.translation.copy()
SK = salon.kafa.matrix_world.translation.copy()
genis = kamera("genis", (0.35, -2.4, 1.45), (0.25, 0.3, 1.15), lens=30, fstop=4)
yakin = kamera("yakin", UK + Vector((-0.45, -1.25, 0.02)), UK + Vector((0, 0, -0.06)), lens=60, fstop=2.8)
yakin.data.dof.focus_distance = (yakin.location - UK).length - 0.12
salon_k = kamera("salon_k", SK + Vector((0.35, -1.3, 0.02)), SK + Vector((0, 0, -0.1)), lens=60, fstop=2.8)
salon_k.data.dof.focus_distance = (salon_k.location - SK).length - 0.12
for kam, kare, ad in ((genis, 1, "genis"), (yakin, 10, "gulumse"), (yakin, 20, "stres"), (yakin, 30, "kirp"),
                      (salon_k, 1, "salon")):
    sc.camera = kam
    sc.frame_set(kare)
    sc.render.filepath = os.path.join(OUT, f"v2_{ad}.png")
    bpy.ops.render.render(write_still=True)
print("TAMAM")
