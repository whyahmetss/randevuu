"""Karakter ifade testi: 4 ifade, 4 kare.  blender -b -P portre.py -- <cikti> [karakter]"""
import bpy, sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "ortak"))
import importlib, temel, karakter as K
importlib.reload(temel); importlib.reload(K)
from temel import *

args = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
OUT = args[0]
kim = args[1] if len(args) > 1 else "berber"
os.makedirs(OUT, exist_ok=True)

sc = sahne_hazirla(40, ornek=32)
sc.render.resolution_percentage = 50
dunya("#20160f", 0.4)
kutu("fon", (8, 0.2, 6), (0, 3, 2), mat("fon", "#6b4a35", 0.9), 0)
kutu("zemin", (8, 8, 0.1), (0, 0, -0.05), mat("zemin", "#3b2a20", 0.6), 0)

if kim == "berber":
    k = K.karakter("berber", sakal=True, onluk=RENK["yesil_koyu"], gomlek="#e9e4da", ten=RENK["ten"])
elif kim == "disci":
    k = K.karakter("disci", maske=True, bone="#9ec9e6", gomlek="#f4f6f7", ten=RENK["ten_acik"], sac_tip="kisa")
else:
    k = K.karakter("salon", sac_tip="topuz", sac=RENK["sac_kahve"], onluk=RENK["yesil_koyu"], gomlek="#efe6dc",
                   ten=RENK["ten_acik"], kirpik=True)

for f, ad in ((1, "stres"), (10, "endise"), (20, "rahat"), (30, "goz_kirp")):
    K.ifade(k, f, ad, gecis=2)

isik("ana", "AREA", (-1.6, -2.0, 2.4), (0, 0, 1.4), 260, "#ffc58f", 1.6)
isik("kenar", "AREA", (1.3, 1.4, 2.2), (0, 0, 1.5), 220, "#ffd2a6", 0.7)
isik("dolgu", "AREA", (0.8, -2.6, 1.2), (0, 0, 1.4), 30, "#cfe0ff", 2.5)
cam = kamera("kam", (0.35, -2.6, 1.55), (0, 0, 1.38), lens=55, fstop=2.8)
sc.camera = cam

for f in (1, 10, 20, 30):
    sc.frame_set(f)
    sc.render.filepath = os.path.join(OUT, f"{kim}_{f:02d}.png")
    bpy.ops.render.render(write_still=True)
print("TAMAM")
