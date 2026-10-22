"""AYNI SAATE ÜÇ KİŞİ (mizah, Fiko) — "Sen makasına bak. Randevuyu SıraGO yazsın."  (16.5 sn, 495 kare)
Takvim: Gün 17 · 11 Kasım Çarşamba. Mekân: ortak/mekan_berber.py (akşam ışığı) + kapı + duvar saati.
Marka kuralı: Fiko konuşmaz (balon yok); telefon (ürün) planlarında ve kapanışta görünmez.

  blender -b -P ayni_saat/sahne.py -- --kareler 30,120 --cikti <klasor> [--ornek 32] [--yuzde 50] [--kadraj]
  blender -b -P ayni_saat/sahne.py -- --hepsi [--bas N --bit M]

PLANLAR (saniye)
  A 0.0–2.6   kanca: Fiko keyifli, duvar saati 16:59 → 17:00
  B 2.6–5.2   kapıdan üç müşteri sırayla girer
  C 5.2–7.6   Fiko'nun omzunun üstünden: üçü birden saatini gösterir
  D 7.6–9.8   Fiko kameraya bakar (sessiz an, ter)
  E 9.8–16.5  telefon: "Maalesef 17:00 dolu. 17:30 uygun mu?" → randevu; 13.7'den sonra kapanış kartı
"""
import bpy, sys, os, math
BURA = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(BURA, "..", "ortak"))
import importlib, temel, karakter as K, objeler as O, mekan_berber, fiko as F
for m in (temel, K, O, mekan_berber, F):
    importlib.reload(m)
from temel import *

arg = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
al = lambda ad, vars=None: arg[arg.index(ad) + 1] if ad in arg else vars
s = sn
TOPLAM = 495
sc = sahne_hazirla(TOPLAM, ornek=int(al("--ornek", 48)), gorunum="Khronos PBR Neutral", bakis="None")
sc.render.resolution_percentage = int(al("--yuzde", 100))
dunya("#1c1d1f", 0.2, sis=0.0035, sis_renk="#ffe6cc")

M = mekan_berber.kur(BURA, TOPLAM, insan_berber=False)
tel, TZ = M.tel, M.TZ
mekan_berber.kapi_ekle()
mekan_berber.duvar_saati((2.95, 2.62, 2.3), [(1, "16:59"), (s(2.7), "16:59"), (s(3.1), "17:00")], yon=0)

# Bekleyenler ve koltuktaki müşteri bu videoda yok: dükkân 17:00 randevusunu bekliyor
for k_ in (M.bek1, M.bek2, M.musteri):
    gorunur(k_.kok, [(1, False)])
for ad in ("pelerin", "pelerin_yaka"):
    gorunur(bpy.data.objects[ad], [(1, False)])

# ------------------------------------------------------------------ FİKO (berber)
fiko = F.fiko("fiko", (0.55, 0.25, 0), yon=-8, olcek=1.12)   # kancada kameraya dönük; kapı açılınca kapıya döner
mk = O.makas("makas", fiko.el["R"], (0, 0, -0.12), (180, 0, 0), olcek=1.25)
O.tarak("tarak", fiko.el["L"], (0, 0, -0.1), (180, 0, 0))

# ------------------------------------------------------------------ ÜÇ MÜŞTERİ (kapıdan girer)
musteriler = []
for i, (hedef, renk, ten, sac, giris, ekstra) in enumerate((
        ((2.75, 0.45), "#3d5a80", RENK["ten_esmer"], "#1c1410", 1.7, dict(sakal=True)),
        ((2.95, 1.1), "#b5523b", RENK["ten_acik"], "#6b4a2a", 2.5, {}),
        ((2.8, 1.75), "#6d8a6e", RENK["ten"], "#2a1c14", 3.3, dict(sac_tip="kabarik")))):
    k_ = K.karakter(f"gelen{i}", (4.4, 1.2, 0), yon=-90, ten=ten, sac=sac, gomlek=renk, pantolon="#2d3138", **ekstra)
    k_.kok.scale = (1.05,) * 3
    # yürüyüş: sokak → kapı → yer; hafif zıplama
    yol = [(1, (4.4, 1.2, 0)), (s(giris), (4.4, 1.2, 0)), (s(giris + 0.5), (3.3, 1.2, 0)),
           (s(giris + 1.0), (hedef[0], hedef[1], 0))]
    anahtar(k_.kok, "location", yol)
    for f in range(s(giris), s(giris + 1.0), 4):
        k_.kok.location.z = 0.035 if (f // 4) % 2 else 0
        k_.kok.keyframe_insert("location", index=2, frame=f)
    k_.kok.location.z = 0
    k_.kok.keyframe_insert("location", index=2, frame=s(giris + 1.0))
    anahtar(k_.kok, "rotation_euler", [(s(giris + 0.7), (0, 0, -90)), (s(giris + 1.1), (0, 0, -72))])
    musteriler.append(k_)

bpy.context.view_layer.update()
sc.frame_set(s(5.0))
FK = fiko.kafa.matrix_world.translation.copy()
for i, k_ in enumerate(musteriler):
    K.ifade(k_, 1, "normal")
    K.bak_yon(k_, 1, sag=0, asagi=0)
    K.ifade(k_, s(4.6 + i * 0.1), "gulumse", gecis=6)
    # C: üçü birden saatini gösterir / Fiko'yu işaret eder, şaşkın
    sc.frame_set(s(5.3))
    KK = k_.kafa.matrix_world.translation.copy()
    yuz = (FK - KK).normalized()
    if i == 1:
        K.kol_hedef(k_, s(5.4), "R", KK + yuz * 0.55 + Vector((0, 0, -0.3)), dirsek=-15, gecis=6)   # Fiko'yu gösterir
    else:
        bilek = KK + yuz * 0.3 + Vector((0, 0, -0.55))
        K.kol_hedef(k_, s(5.4 + i * 0.05), "L", bilek, dirsek=-95, gecis=6)                          # saatini gösterir
    K.ifade(k_, s(5.5 + i * 0.08), "sasir", gecis=4)
    K.kirp(k_, s(6.6 + i * 0.2))

# Fiko: keyifli → saate bakar → kapıya döner, sırıtır → üçünü görünce donar → kameraya bakar (ter)
bpy.context.view_layer.update()
sc.frame_set(1)
FK0 = fiko.kafa.matrix_world.translation.copy()
K.kol_hedef(fiko, 1, "R", FK0 + Vector((0.25, -0.35, -0.55)), dirsek=-60, gecis=1)
K.kol_hedef(fiko, 1, "L", FK0 + Vector((0.15, -0.2, -0.75)), dirsek=-30, gecis=1)
K.ifade(fiko, 1, "gulumse")
K.bak_yon(fiko, 1, sag=0, asagi=10)
K.kirp(fiko, s(1.0))
K.ifade(fiko, s(1.7), "kahkaha", gecis=5)                      # 17:00 oldu, ilk randevu geliyor
anahtar(fiko.kok, "rotation_euler", [(s(2.2), (0, 0, -8)), (s(2.75), (0, 0, 62))])   # kapıya döner
K.bak_yon(fiko, s(2.4), sag=20, asagi=0, gecis=8)
K.ifade(fiko, s(3.6), "gulumse", gecis=4)
K.ifade(fiko, s(4.4), "sasir", gecis=5)                        # ikinci kişi
K.ifade(fiko, s(5.2), "endise", gecis=6)                       # üçüncü
K.kirp(fiko, s(6.8))
anahtar(fiko.kok, "rotation_euler", [(s(7.6), (0, 0, 62)), (s(8.15), (0, 0, -20))])   # yavaşça kameraya döner
K.bak_yon(fiko, s(7.9), sag=0, asagi=-2, gecis=8)
K.ifade(fiko, s(7.9), "stres", gecis=6)
K.kirp(fiko, s(8.9))
O.makas_kes(mk, 1, s(0.6), aralik=8)

# ------------------------------------------------------------------ IŞIK
isik("ana", "AREA", (-1.4, -2.2, 2.7), (0.6, 0.4, 1.5), 260, "#ffdcbc", 1.8)
isik("kenar", "AREA", (1.6, 1.9, 2.6), (0.6, 0.4, 1.6), 300, "#ffb067", 0.9)
isik("dolgu", "AREA", (0.6, -3.2, 1.3), (0.6, 0.2, 1.3), 45, "#b4caff", 3.0)
isik("tezgah_ust", "AREA", (0.2, -1.25, 2.0), (0.2, -1.2, TZ), 12, "#ffd7ad", 1.2)
tel_isik = isik("tel_isik", "AREA", (0.4, -1.06, TZ + 0.06), guc=3.0, renk="#e8f2ff", boyut=0.12)
tel_isik.rotation_euler = (R(180), 0, 0)
titret(tel, s(10.0), s(10.0) + 9, genlik=0.003, aci=1.5, tohum=8)

# ------------------------------------------------------------------ KAMERALAR
bpy.context.view_layer.update()
sc.frame_set(s(6.0))
G = sum((k_.kafa.matrix_world.translation for k_ in musteriler), Vector()) / 3
sc.frame_set(1)
FK = fiko.kafa.matrix_world.translation.copy()
TEL = Vector((0.4, -1.06, TZ))

pA = Vector((0.15, -1.75, 1.8))
kamA = kamera("A_kanca", pA, FK + Vector((0.3, 0.25, -0.15)), lens=30, fstop=2.2)
kamA.data.dof.focus_distance = (pA - FK).length - 0.3
anahtar(kamA, "location", [(1, pA), (s(2.6), pA + Vector((0.1, 0.18, 0)))])

pB = Vector((0.75, -0.55, 1.6))
kamB = kamera("B_kapi", pB, Vector((2.95, 1.45, 1.55)), lens=28, fstop=2.8)
kamB.data.dof.focus_distance = (pB - Vector((2.8, 1.1, 1.4))).length
anahtar(kamB, "location", [(s(2.6), pB), (s(5.2), pB + Vector((0.12, 0.1, 0)))])

yuzF = Vector((math.sin(R(62)), -math.cos(R(62)), 0))
pC = FK - yuzF * 1.05 + Vector((0, 0.15, 0.15))
kamC = kamera("C_omuz", pC, G, lens=32, fstop=2.2)
kamC.data.dof.focus_distance = (pC - G).length
anahtar(kamC, "location", [(s(5.2), pC), (s(7.6), pC + (G - pC).normalized() * 0.15)])

sc.frame_set(s(8.5))
FK2 = fiko.kafa.matrix_world.translation.copy()
pD = FK2 + Vector((-0.6, -1.65, 0.0))
kamD = kamera("D_fiko", pD, FK2 + Vector((0, 0, -0.12)), lens=40, fstop=2.0)
kamD.data.dof.focus_distance = (pD - FK2).length - 0.3
anahtar(kamD, "location", [(s(7.6), pD), (s(9.8), pD + (FK2 - pD).normalized() * 0.18)])

THEDEF = TEL + Vector((0, -0.045, 0))
pE = TEL + Vector((0.015, -0.1, 0.54))
kamE = kamera("E_telefon", pE, THEDEF, lens=50, fstop=8.0)
anahtar(kamE, "location", [(s(9.8), pE), (TOPLAM, pE + Vector((0.005, 0.0, 0.06)))])

for kam, t in ((kamA, 0), (kamB, 2.6), (kamC, 5.2), (kamD, 7.6), (kamE, 9.8)):
    plan(kam, s(t))

# ------------------------------------------------------------------ ÇIKTI
cikti = os.path.abspath(al("--cikti", os.path.join(BURA, "kareler")))
os.makedirs(cikti, exist_ok=True)
if "--kadraj" in arg:
    from bpy_extras.object_utils import world_to_camera_view
    saat = bpy.data.objects["dsaat"]
    for kam, t in ((kamA, 1.2), (kamB, 4.6), (kamC, 6.0), (kamD, 8.5), (kamE, 11.0)):
        sc.frame_set(s(t))
        nk = {"tel": tel, "fiko": fiko.kafa, "saat": saat, **{f"m{i}": k_.kafa for i, k_ in enumerate(musteriler)}}
        print("KADRAJ", kam.name, " ".join(
            f"{a}=({v.x:.2f},{1 - v.y:.2f},{v.z:.2f}m)" for a, o in nk.items()
            for v in [world_to_camera_view(sc, kam, o.matrix_world.translation.copy())]))
if al("--kaydet"):
    bpy.ops.wm.save_as_mainfile(filepath=os.path.abspath(al("--kaydet")))
if "--hepsi" in arg:
    sc.render.filepath = os.path.join(cikti, "kare_")
    sc.frame_start, sc.frame_end = int(al("--bas", 1)), int(al("--bit", TOPLAM))
    sc.render.use_overwrite = False   # yarıda kalırsa yeniden çalıştırınca var olan kareler atlanır
    bpy.ops.render.render(animation=True)
elif al("--kareler"):
    import time
    for f in [int(x) for x in al("--kareler").split(",")]:
        sc.frame_set(f)
        sc.render.filepath = os.path.join(cikti, f"kare_{f:04d}.png")
        t = time.perf_counter()
        bpy.ops.render.render(write_still=True)
        print(f"KARE {f}: {time.perf_counter() - t:.1f} sn")
