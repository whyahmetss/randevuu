"""DEFTERDE SİLİNTİ — "Sen makasına bak. Randevuyu SıraGO yazsın."  (16.5 sn, 495 kare)
Takvim: Gün 21 · 15 Kasım Pazar. Defteri kullanan esnafla alay yok: dert defterin değil, karışıklığın.
Mekân: ortak/mekan_berber.py. Defter sayfaları: defter/sayfa.html → katmanlar/sayfa_{sol,sag}.png

  blender -b -P defter/sahne.py -- --kareler 30,120 --cikti <klasor> [--ornek 32] [--yuzde 50] [--kadraj]
  blender -b -P defter/sahne.py -- --hepsi [--bas N --bit M]

PLANLAR (saniye)
  A 0.0–2.8   kanca: dağınık defter sayfası, kamera yavaşça 17:00 karmaşasına iner
  B 2.8–5.0   berber aynadan: kafasını kaşır, "kim kaçtaydı?"
  C 5.0–8.6   defter + telefon yan yana: bildirimler düşer; 7.6'da defter kapanır
  E 8.6–13.6  telefon: panelde temiz liste (17:30 · Mehmet · Saç + sakal · Onaylı)
  F 13.6–16.5 geniş plan + kapanış cümlesi ve logo
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
dunya("#1c1d1f", 0.2, sis=0.0035, sis_renk="#ffe6cc")

M = mekan_berber.kur(BURA, TOPLAM)
tel, berber, musteri, mk, TZ = M.tel, M.berber, M.musteri, M.mk, M.TZ
for k_ in (M.bek1, M.bek2):
    gorunur(k_.kok, [(1, False)])
# Defterin yeri açılsın: dezenfektan kavanozu ve sprey bu videoda tezgâhta yok
for o in list(bpy.data.objects):
    if o.name.startswith(("kavanoz", "sprey", "tarak_tez")):
        o.hide_render = o.hide_viewport = True

# ------------------------------------------------------------------ DEFTER (tezgâhta açık; sağ yarı kapanır)
PG, PY = 0.255, 0.34                     # sayfa ölçüsü (doku 1200×1600)
NX, NY = -0.22, -1.13
TX = 0.16                                 # telefon deftere yakın (bu videoda)
tel.location.x = TX
kapak = mat("defter_kapak", "#24452f", 0.55, sheen=0.4)
yaprak = mat("defter_yaprak", "#efe6d2", 0.8)
kok = bos("defter", (NX, NY, TZ), rot=(0, 0, -4))
kutu("defter_sirt", (0.03, PY + 0.02, 0.025), (0, 0, 0.0125), kapak, 0.01, ebeveyn=kok)
kutu("defter_kapak_sol", (PG + 0.02, PY + 0.02, 0.008), (-PG / 2 - 0.005, 0, 0.004), kapak, 0.004, ebeveyn=kok)
kutu("defter_blok_sol", (PG, PY, 0.016), (-PG / 2, 0, 0.016), yaprak, 0.003, ebeveyn=kok)
mentese = bos("defter_mentese", (0, 0, 0.026), kok)   # sayfa üstü hizasında: kapanınca sol yarının üstüne oturur
kutu("defter_kapak_sag", (PG + 0.02, PY + 0.02, 0.008), (PG / 2 + 0.005, 0, -0.022), kapak, 0.004, ebeveyn=mentese)
kutu("defter_blok_sag", (PG, PY, 0.016), (PG / 2, 0, -0.010), yaprak, 0.003, ebeveyn=mentese)
for yan, x, eb in (("sol", -PG / 2, kok), ("sag", PG / 2, mentese)):
    bpy.ops.mesh.primitive_plane_add(size=1, location=(0, 0, 0))
    p = bpy.context.object
    p.name = f"defter_sayfa_{yan}"
    p.scale = (PG * 0.985, PY * 0.985, 1)
    p.data.materials.append(resim_mat(f"sayfa_{yan}", os.path.join(BURA, "katmanlar", f"sayfa_{yan}.png"),
                                      isik=False, rough=0.75))
    p.parent = eb
    p.location = (x, 0, 0.0245 if eb is kok else -0.0015)
# 7.6 sn: sağ yarı menteşe etrafında dönüp sol yarının üstüne kapanır ("pat")
anahtar(mentese, "rotation_euler", [(s(7.55), (0, 0, 0)), (s(8.05), (0, -178, 0))])
for fc in egriler(mentese):
    for k in fc.keyframe_points:
        k.interpolation, k.easing = "BOUNCE", "EASE_OUT"
# Kurşun kalem (sarı, pembe silgili)
kalem = bos("kalem", (NX + 0.2, NY - 0.05, TZ + 0.01), rot=(0, 90, 32))
silindir("kalem_govde", 0.0085, 0.17, (0, 0, 0), mat("kalem_sari", "#e9b928", 0.45), 6, kalem, yumusak=False)
silindir("kalem_uc", 0.0085, 0.025, (0, 0, 0.17), mat("kalem_ahsap", "#e2c08f", 0.6), 6, kalem, r2=0.002, yumusak=False)
silindir("kalem_silgi", 0.0088, 0.02, (0, 0, -0.02), mat("kalem_silgi", "#e48a95", 0.7), 12, kalem)

# ------------------------------------------------------------------ ANİMASYON
bpy.context.view_layer.update()
MK0 = musteri.kafa.matrix_world.translation.copy()
BK0 = berber.kafa.matrix_world.translation.copy()
KES_MAKAS = MK0 + Vector((0.36, -0.1, 0.04))
KES_TARAK = MK0 + Vector((0.02, 0.2, 0.32))
KASI = BK0 + Vector((0.05, 0.12, 0.45))             # eli kafasının üstünde, kaşır
K.kol_hedef(berber, 1, "R", KES_MAKAS, dirsek=-30, gecis=1)
K.kol_hedef(berber, 1, "L", KES_TARAK, dirsek=-30, gecis=1)
O.makas_kes(mk, 1, s(2.6))
K.ifade(berber, 1, "normal")
K.bak_yon(berber, 1, sag=-10, asagi=18)
# B: deftere bakar, şaşkın, kafasını kaşır
K.bak_yon(berber, s(2.9), sag=10, asagi=30, gecis=8)
K.ifade(berber, s(3.1), "endise", gecis=6)
K.kirp(berber, s(4.3))
K.ifade(berber, s(4.6), "stres", gecis=5)
# F: rahat; kameraya (aynaya) bakar, gülümser, işine döner
K.ifade(berber, s(13.4), "gulumse", gecis=8)
K.bak_yon(berber, s(13.5), sag=-10, asagi=18, gecis=8)
O.makas_kes(mk, s(13.6), TOPLAM)
K.ifade(musteri, 1, "normal")
K.bak_yon(musteri, 1, asagi=6)
for t in (1.6, 4.4, 12.0, 15.0):
    K.kirp(musteri, s(t))
K.ifade(musteri, s(13.8), "gulumse", gecis=8)

# Telefon: bildirim titreşimi + ekran ışığı
for t in (5.3, 6.2):
    titret(tel, s(t), s(t) + 9, genlik=0.003, aci=1.5, tohum=int(t * 10) + 7)
tel_isik = isik("tel_isik", "AREA", (TX, -1.06, TZ + 0.06), guc=0.0, renk="#e8f2ff", boyut=0.12)
tel_isik.rotation_euler = (R(180), 0, 0)
for f, e in ((1, 0.0), (s(5.3), 0.0), (s(5.35), 3.0), (TOPLAM, 3.0)):
    tel_isik.data.energy = e
    tel_isik.data.keyframe_insert("energy", frame=f)

# ------------------------------------------------------------------ IŞIK
isik("ana", "AREA", (-1.4, -2.2, 2.7), (0.1, 0.2, 1.5), 260, "#ffdcbc", 1.8)
isik("kenar", "AREA", (1.6, 1.9, 2.6), (0.2, 0.4, 1.6), 380, "#ffb067", 0.9)
isik("kenar2", "AREA", (-1.5, 2.0, 2.3), (0.2, 0.3, 1.5), 220, "#ffa255", 0.8)
isik("dolgu", "AREA", (0.6, -3.2, 1.3), (0.2, 0.2, 1.3), 45, "#b4caff", 3.0)
isik("defter_ust", "AREA", (NX - 0.3, NY - 0.5, TZ + 1.0), (NX, NY, TZ), 8, "#fff0dc", 0.8)

# ------------------------------------------------------------------ KAMERALAR
bpy.context.view_layer.update()
sc.frame_set(1)
BK = berber.kafa.matrix_world.translation.copy()
TEL = Vector((TX, -1.06, TZ))
SOL = Vector((NX - PG / 2, NY, TZ + 0.025))        # sol sayfanın ortası

pA = SOL + Vector((0.0, -0.17, 0.46))
kamA = kamera("A_defter", pA, SOL + Vector((0, 0.02, 0)), lens=36, fstop=5.6, yukari=(0, 1, 0))
anahtar(kamA, "location", [(1, pA), (s(2.8), SOL + Vector((0.02, -0.22, 0.36)))])

pB = Vector((BK.x - 0.3, -1.38, BK.z + 0.1))
kamB = kamera("B_berber", pB, BK + Vector((-0.16, 0, -0.22)), lens=42, fstop=2.0)
kamB.data.dof.focus_distance = (pB - BK).length - 0.36
anahtar(kamB, "location", [(s(2.8), pB), (s(5.0), pB + Vector((0.02, 0.1, 0)))])

ORTA = (SOL + TEL) / 2
pC = ORTA + Vector((0.0, -0.42, 0.78))
kamC = kamera("C_defter_tel", pC, ORTA + Vector((0, 0.03, 0)), lens=20, fstop=5.6, yukari=(0, 1, 0.3))
anahtar(kamC, "location", [(s(5.0), pC), (s(8.6), pC + Vector((0, 0.08, -0.06)))])

THEDEF = TEL + Vector((0, -0.045, 0))
pE = TEL + Vector((0.015, -0.1, 0.54))
kamE = kamera("E_panel", pE, THEDEF, lens=50, fstop=8.0)
anahtar(kamE, "location", [(s(8.6), pE), (s(13.6), pE + Vector((0.005, 0.01, -0.03)))])

kamF = kamera("F_genis", (1.5, -2.2, 1.65), (0.1, 0.9, 1.35), lens=26, fstop=2.8)
anahtar(kamF, "location", [(s(13.6), (1.2, -1.8, 1.6)), (TOPLAM, (1.65, -2.6, 1.75))])

for kam, t in ((kamA, 0), (kamB, 2.8), (kamC, 5.0), (kamE, 8.6), (kamF, 13.6)):
    plan(kam, s(t))

# ------------------------------------------------------------------ ÇIKTI
cikti = os.path.abspath(al("--cikti", os.path.join(BURA, "kareler")))
os.makedirs(cikti, exist_ok=True)
if "--kadraj" in arg:
    from bpy_extras.object_utils import world_to_camera_view
    for kam, t in ((kamA, 1.4), (kamB, 4.0), (kamC, 7.0), (kamE, 11.0)):
        sc.frame_set(s(t))
        nk = {"tel": tel, "berber": berber.kafa, "defter": kok}
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
