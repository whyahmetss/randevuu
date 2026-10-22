"""Fiko ifade testi.  blender -b -P _test/fiko_portre.py -- <cikti>"""
import bpy, sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "ortak"))
import importlib, temel, karakter as K, fiko as F
for m in (temel, K, F):
    importlib.reload(m)
from temel import *

OUT = sys.argv[sys.argv.index("--") + 1]
os.makedirs(OUT, exist_ok=True)
sc = sahne_hazirla(40, ornek=24, gorunum="Khronos PBR Neutral", bakis="None")
sc.render.resolution_percentage = 40
dunya("#20160f", 0.4)
kutu("fon", (8, 0.2, 6), (0, 3, 2), mat("fon", "#2c4a3b", 0.9), 0)
kutu("zemin", (8, 8, 0.1), (0, 0, -0.05), mat("zemin", "#3b2a20", 0.6), 0)
f = F.fiko("fiko", (0, 0, 0), yon=-15)
for kare, ad in ((1, "normal"), (10, "stres"), (20, "gulumse"), (30, "goz_kirp")):
    K.ifade(f, kare, ad, gecis=2)
isik("ana", "AREA", (-1.6, -2.0, 2.4), (0, 0, 1.4), 260, "#ffd9b8", 1.6)
isik("kenar", "AREA", (1.3, 1.4, 2.2), (0, 0, 1.5), 220, "#ffd2a6", 0.7)
isik("dolgu", "AREA", (0.8, -2.6, 1.2), (0, 0, 1.4), 40, "#cfe0ff", 2.5)
sc.camera = kamera("kam", (0.5, -3.2, 1.6), (0, 0, 1.2), lens=45, fstop=4)
for kare in (1, 10, 20, 30):
    sc.frame_set(kare)
    sc.render.filepath = os.path.join(OUT, f"fiko_{kare:02d}.png")
    bpy.ops.render.render(write_still=True)
