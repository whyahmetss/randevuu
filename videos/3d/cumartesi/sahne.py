"""CUMARTESİ ÖĞLEN — "Sen makasına bak. Randevuyu SıraGO yazsın."  (16.5 sn, 495 kare)
Takvim: Gün 5 · 30 Ekim Cuma (tasarim/icerik/takvim-30-gun.md). Mekân: ortak/mekan_berber.py (öğlen ışığı).

  blender -b -P cumartesi/sahne.py -- --kareler 30,120 --cikti <klasor> [--ornek 32] [--yuzde 50] [--kadraj]
  blender -b -P cumartesi/sahne.py -- --hepsi [--bas N --bit M]

PLANLAR (saniye)
  A 0.0–2.5   kanca: dolu dükkân geniş plan, öğlen ışığı
  B 2.5–4.5   kapıda bekleyen saatine bakar, bankta bekleyenler
  C 4.5–6.3   telefon: mesajlar üst üste
  D 6.3–10.8  telefon: "Maalesef 15:00 dolu. 15:40 uygun mu?" → randevu
  E 10.8–12.6 panel: 15:40 · Can · Yeni
  E2 12.6–13.4 berber aynadan gülümser
  F 13.4–16.5 geniş plan + kapanış cümlesi ve logo
"""
import bpy, sys, os, math
BURA = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(BURA, "..", "ortak"))
import importlib, temel, karakter as K, objeler as O, mekan_berber
for m in (temel, K, O, mekan_berber):
    importlib.reload(m)
from temel import *

arg = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
al = lambda ad, vars=None: arg[arg.index(ad) + 1] if ad in arg else vars
s = sn
TOPLAM = 495
sc = sahne_hazirla(TOPLAM, ornek=int(al("--ornek", 48)), gorunum="Khronos PBR Neutral", bakis="None")
sc.render.resolution_percentage = int(al("--yuzde", 100))
dunya("#1f2224", 0.24, sis=0.003, sis_renk="#fff6ea")

M = mekan_berber.kur(BURA, TOPLAM)
tel, berber, musteri, bek1, bek2, mk, TZ = M.tel, M.berber, M.musteri, M.bek1, M.bek2, M.mk, M.TZ

# ------------------------------------------------------------------ ÖĞLEN IŞIĞI (akşam yerine)
M.gunes.rotation_euler = (R(-50), 0, R(25))
M.gunes.data.color, M.gunes.data.energy = lin("#fff1dc")[:3], 5.5
gok_em = [n for n in bpy.data.materials["dis_gok"].node_tree.nodes if n.type == "EMISSION"][0]
gok_em.inputs[0].default_value, gok_em.inputs[1].default_value = lin("#dcecff"), 2.6
bpy.data.materials["bina"].node_tree.nodes["Principled BSDF"].inputs["Base Color"].default_value = lin("#b9a48c")

# ------------------------------------------------------------------ KAPI (sağ duvar) + kapıda bekleyen
m_siva = bpy.data.materials["siva"]
m_pervaz = bpy.data.materials["pervaz"]
dy0, dy1, dz1 = 0.7, 1.7, 2.3
for ad, y0, y1, z0, z1 in (("sag_on", -1.6, dy0, 0, 3.4), ("sag_arka", dy1, 2.85, 0, 3.4), ("sag_ust", dy0, dy1, dz1, 3.4)):
    kutu(ad, (0.2, y1 - y0, z1 - z0), (3.4, (y0 + y1) / 2, (z0 + z1) / 2), m_siva, 0)
for dy, sy, sz, z in ((dy0, 0.08, dz1, dz1 / 2), (dy1, 0.08, dz1, dz1 / 2), ((dy0 + dy1) / 2, 1.08, 0.08, dz1)):
    kutu("kapi_kasa", (0.26, sy, sz), (3.32, dy, z), m_pervaz, 0.01)
kapi = bos("kapi_mentese", (3.32, dy1 - 0.04, 0))
kapi.rotation_euler.z = R(-75)   # içe açık kapı kanadı
kutu("kapi_kanat", (0.05, 0.9, 2.2), (0, -0.46, 1.1), mat("kapi_ahsap", "#4a2c1c", 0.45, coat=0.3), 0.01, ebeveyn=kapi)
kutu("kapi_cam", (0.06, 0.6, 1.1), (0, -0.46, 1.45), mat("kapi_cam", "#cfe3ee", 0.05, transmisyon=0.8), 0.005,
     ebeveyn=kapi)
sokak = kutu("sokak", (0.02, 3.5, 3.0), (4.6, 1.2, 1.5), isik_mat("sokak_isik", "#e9f1f7", 2.4), 0)
sokak.visible_shadow = False
kutu("kaldirim", (1.4, 3.5, 0.12), (4.0, 1.2, 0.0), mat("kaldirim", "#a49a8c", 0.8), 0.01)
isik("kapi_isik", "AREA", (4.1, 1.2, 1.4), (2.5, 1.0, 1.0), 120, "#f2f6ff", 1.0, boyut_y=2.0)

kapidaki = K.karakter("kapidaki", (2.95, 1.2, 0), yon=-58, ten=RENK["ten_acik"], sac="#3b2a1e", gomlek="#6d8a6e",
                      pantolon="#2d3138")
kapidaki.kok.scale = (1.05,) * 3
kutu("saat_kayis", (0.145, 0.145, 0.035), (0, 0, 0.035), mat("saat_kayis", "#2a211b", 0.5), 0.01, ebeveyn=kapidaki.el["L"])
kutu("saat_kadran", (0.06, 0.02, 0.05), (0, -0.075, 0.035), mat("saat_kadran", "#e9eef2", 0.15, metal=0.6, coat=1), 0.008,
     ebeveyn=kapidaki.el["L"])

# ------------------------------------------------------------------ ANİMASYON
bpy.context.view_layer.update()
MK0 = musteri.kafa.matrix_world.translation.copy()
BK0 = berber.kafa.matrix_world.translation.copy()
KES_MAKAS = MK0 + Vector((0.36, -0.1, 0.04))
KES_TARAK = MK0 + Vector((0.02, 0.2, 0.32))
BEKLE_MAKAS = BK0 + Vector((0.1, -0.5, -0.62))
K.kol_hedef(berber, 1, "R", KES_MAKAS, dirsek=-30, gecis=1)
K.kol_hedef(berber, 1, "L", KES_TARAK, dirsek=-30, gecis=1)

# Berber: kesiyor (A, B) → telefona bakar (C) → panelden sonra rahat, aynadan gülümser (E2) → kesmeye devam
O.makas_kes(mk, 1, s(4.4))
K.ifade(berber, 1, "normal")
K.bak_yon(berber, 1, sag=-10, asagi=18)
K.bak_yon(berber, s(4.6), sag=25, asagi=30, gecis=7)
K.ifade(berber, s(4.8), "stres", gecis=6)
K.kol_hedef(berber, s(4.8), "R", BEKLE_MAKAS, dirsek=-50, gecis=8)
K.ifade(berber, s(12.4), "rahat", gecis=6)
K.bak_yon(berber, s(12.7), sag=13, asagi=-2, gecis=8)
K.ifade(berber, s(12.8), "gulumse", gecis=5)
K.kol_hedef(berber, s(13.3), "R", KES_MAKAS, dirsek=-30, gecis=10)
K.bak_yon(berber, s(13.6), sag=-10, asagi=18, gecis=9)
O.makas_kes(mk, s(13.6), TOPLAM)
for t in (2.0, 9.0, 15.4):
    K.kirp(berber, s(t))

K.ifade(musteri, 1, "normal")
K.bak_yon(musteri, 1, asagi=6)
for t in (1.4, 5.0, 11.0, 14.6):
    K.kirp(musteri, s(t))
K.ifade(musteri, s(13.6), "gulumse", gecis=8)

# Kapıdaki: saatine bakar, of der; sonda rahat
K.ifade(kapidaki, 1, "normal")
K.kol_poz(kapidaki, 1, (-10, 0, 5, -10), None)
bpy.context.view_layer.update()
KK0 = kapidaki.kafa.matrix_world.translation.copy()
SAAT = KK0 + Vector((-math.sin(R(58)), -math.cos(R(58)), 0)) * 0.32 + Vector((0, 0, -0.55))
K.kol_hedef(kapidaki, s(2.3), "L", SAAT, dirsek=-95, gecis=10)   # bileğindeki saate bakar (göğüs hizası)
K.bak_yon(kapidaki, s(2.6), sag=-25, asagi=30, gecis=8)
K.ifade(kapidaki, s(2.9), "endise", gecis=6)
K.bak_yon(kapidaki, s(3.7), sag=0, asagi=0, gecis=8)               # kameraya / berbere bakar
K.ifade(kapidaki, s(3.8), "stres", gecis=5)
K.kirp(kapidaki, s(4.2))
K.ifade(kapidaki, s(13.6), "gulumse", gecis=8)
K.kol_poz(kapidaki, s(13.6), (-10, 0, 5, -10), None, gecis=10)

K.ifade(bek1, 1, "normal")
K.kol_poz(bek1, 1, (-70, 0, 20, -60), None)
K.bak_yon(bek1, 1, sag=10, asagi=25)
K.ifade(bek1, s(3.0), "endise", gecis=6)
K.ifade(bek2, 1, "normal")
K.bak_yon(bek2, 1, sag=-15, asagi=5)
K.bak_yon(bek2, s(2.8), sag=35, asagi=0, gecis=8)                   # kapıdakine bakar
K.ifade(bek2, s(3.2), "sasir", gecis=6)
K.ifade(bek2, s(13.6), "gulumse", gecis=8)

# Telefon: bildirim titreşimi + ekran ışığı
for t in (0.3, 1.3, 4.7, 5.3):
    titret(tel, s(t), s(t) + 9, genlik=0.003, aci=1.5, tohum=int(t * 10) + 5)
tel_isik = isik("tel_isik", "AREA", (0.4, -1.06, TZ + 0.06), guc=0.0, renk="#e8f2ff", boyut=0.12)
tel_isik.rotation_euler = (R(180), 0, 0)
for f, e in ((1, 0.0), (s(0.3), 0.0), (s(0.35), 3.0), (TOPLAM, 3.0)):
    tel_isik.data.energy = e
    tel_isik.data.keyframe_insert("energy", frame=f)

# ------------------------------------------------------------------ IŞIK (öğlen: daha beyaz, daha az turuncu)
isik("ana", "AREA", (-1.4, -2.2, 2.7), (0.1, 0.2, 1.5), 260, "#fff0de", 1.8)
isik("kenar", "AREA", (1.6, 1.9, 2.6), (0.2, 0.4, 1.6), 300, "#ffdcb0", 0.9)
isik("kenar2", "AREA", (-1.5, 2.0, 2.3), (0.2, 0.3, 1.5), 180, "#ffe2c0", 0.8)
isik("dolgu", "AREA", (0.6, -3.2, 1.3), (0.2, 0.2, 1.3), 50, "#c8d8ff", 3.0)
isik("tezgah_ust", "AREA", (0.2, -1.25, 2.0), (0.2, -1.2, TZ), 12, "#fff0dc", 1.2)

# ------------------------------------------------------------------ KAMERALAR
bpy.context.view_layer.update()
sc.frame_set(1)
TEL = Vector((0.4, -1.06, TZ))
BK = berber.kafa.matrix_world.translation.copy()
KK = kapidaki.kafa.matrix_world.translation.copy()
B2 = bek2.kafa.matrix_world.translation.copy()

pA = Vector((-0.75, -2.35, 1.75))
kamA = kamera("A_kanca", pA, Vector((1.25, 1.0, 1.3)), lens=22, fstop=2.8)
anahtar(kamA, "location", [(1, pA), (s(2.5), pA + Vector((0.12, 0.25, -0.03)))])
kamA.data.dof.focus_distance = (pA - BK).length

pB = Vector((1.15, -0.55, 1.6))
kamB = kamera("B_kapi", pB, KK * 0.65 + B2 * 0.35, lens=35, fstop=2.2)
kamB.data.dof.focus_distance = (pB - KK).length - 0.3
anahtar(kamB, "location", [(s(2.5), pB), (s(4.5), pB + Vector((0.08, 0.12, 0)))])

THEDEF = TEL + Vector((0, -0.045, 0))
pC = TEL + Vector((0.015, -0.1, 0.54))
kamC = kamera("C_telefon", pC, THEDEF, lens=50, fstop=7.0)
anahtar(kamC, "location", [(s(4.5), pC), (s(6.3), pC + Vector((0, 0.005, -0.02)))])
kamD = kamera("D_sohbet", pC, THEDEF, lens=50, fstop=8.0)
anahtar(kamD, "location", [(s(6.3), pC), (s(10.8), pC + Vector((0.005, 0.01, -0.025)))])
kamE = kamera("E_panel", pC + Vector((-0.02, 0, 0)), THEDEF, lens=50, fstop=8.0)
anahtar(kamE, "location", [(s(10.8), pC + Vector((-0.02, 0, 0))), (s(12.6), pC + Vector((-0.02, 0.01, -0.02)))])

pE2 = Vector((BK.x - 0.3, -1.38, BK.z + 0.1))
kamE2 = kamera("E2_ayna", pE2, BK + Vector((-0.16, 0, -0.22)), lens=42, fstop=2.0)
kamE2.data.dof.focus_distance = (pE2 - BK).length - 0.36
anahtar(kamE2, "location", [(s(12.6), pE2), (s(13.4), pE2 + Vector((0.01, 0.05, 0)))])

kamF = kamera("F_genis", (1.5, -2.2, 1.65), (0.6, 0.9, 1.3), lens=24, fstop=2.8)
anahtar(kamF, "location", [(s(13.4), (1.3, -1.9, 1.6)), (TOPLAM, (1.75, -2.65, 1.75))])

for kam, t in ((kamA, 0), (kamB, 2.5), (kamC, 4.5), (kamD, 6.3), (kamE, 10.8), (kamE2, 12.6), (kamF, 13.4)):
    plan(kam, s(t))

# ------------------------------------------------------------------ ÇIKTI
cikti = os.path.abspath(al("--cikti", os.path.join(BURA, "kareler")))
os.makedirs(cikti, exist_ok=True)
if "--kadraj" in arg:
    from bpy_extras.object_utils import world_to_camera_view
    for kam, t in ((kamA, 1.2), (kamB, 3.5), (kamC, 5.5), (kamE2, 13.0), (kamF, 15.0)):
        sc.frame_set(s(t))
        nk = {"tel": tel, "berber": berber.kafa, "kapidaki": kapidaki.kafa, "bek2": bek2.kafa,
              "fiko": bpy.data.objects["fiko"]}
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
