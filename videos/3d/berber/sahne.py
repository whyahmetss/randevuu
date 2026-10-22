"""BERBER — "Sen kes, randevuyu SıraGO yazsın."  (16.5 sn, 495 kare)

  blender -b -P berber/sahne.py -- --kareler 30,120,200 --cikti <klasor> [--ornek 32] [--yuzde 100]
  blender -b -P berber/sahne.py -- --hepsi --cikti <klasor>          (tüm kareler: kare_0001.png …)
  blender -b -P berber/sahne.py -- --kaydet berber.blend               (incelemek için; Git'e girmez)

Telefon ekranı dokusu: berber/katmanlar/ekran/kare_####.png (ortak/katman.mjs ile berber/ekran.html'den).

PLANLAR (saniye)                      ALT YAZI (altyazi.html)
  A 0.0–2.6  kanca: telefon önde titrer, berber stresle bakar   "Makas elindeyken telefon susmuyorsa…"
  B 2.6–4.4  telefon yakın: mesajlar yağar                      "Bakarsan koltuktaki bekler…"
  C 4.4–5.6  berberin yüzü: ter, gözler telefonda
  D 5.6–10.8 telefon yakın: SıraGO cevaplar, 🎉 Yeni Randevu      "SıraGO senin WhatsApp'ından…"
  E 10.8–13.6 aynadan: rahatlar, göz kırpar, işine döner         "Müşteri uygulama indirmez…"
  F 13.6–16.5 geniş plan + kapanış cümlesi ve logo
"""
import bpy, sys, os, math, random
BURA = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(BURA, "..", "ortak"))
import importlib, temel, karakter as K, objeler as O
for m in (temel, K, O):
    importlib.reload(m)
from temel import *

arg = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
al = lambda ad, vars=None: arg[arg.index(ad) + 1] if ad in arg else vars

TOPLAM = 495
sc = sahne_hazirla(TOPLAM, ornek=int(al("--ornek", 48)), gorunum="Khronos PBR Neutral", bakis="None")
sc.render.resolution_percentage = int(al("--yuzde", 100))
dunya("#1c1d1f", 0.2, sis=0.0035, sis_renk="#ffe6cc")

# ------------------------------------------------------------------ MEKÂN (ortak/mekan_berber.py)
import mekan_berber
importlib.reload(mekan_berber)
M = mekan_berber.kur(BURA, TOPLAM)
tel, berber, musteri, bek1, bek2, mk, TZ = M.tel, M.berber, M.musteri, M.bek1, M.bek2, M.mk, M.TZ

def kol_poz(k, kare, sag=None, sol=None, gecis=8):
    """sag/sol = (omuz_x, omuz_y, omuz_z, dirsek_x) derece. "L" = berberin sağ eli (makas)."""
    for t, poz in (("L", sag), ("R", sol)):
        if poz is None:
            continue
        om, dr = k.omuz[t], k.dirsek[t]
        anah = f"_poz{t}"
        if anah in om:
            o = om[anah]
            om.rotation_euler = [R(o[0]), R(o[1]), R(o[2])]
            dr.rotation_euler.x = R(o[3])
            om.keyframe_insert("rotation_euler", frame=max(1, kare - gecis))
            dr.keyframe_insert("rotation_euler", index=0, frame=max(1, kare - gecis))
        om.rotation_euler = [R(poz[0]), R(poz[1]), R(poz[2])]
        dr.rotation_euler.x = R(poz[3])
        om.keyframe_insert("rotation_euler", frame=kare)
        dr.keyframe_insert("rotation_euler", index=0, frame=kare)
        om[anah] = list(poz)


# Kollar dünya noktalarına bakar (kol_hedef): makas müşterinin kafasının kameraya bakan yanında
bpy.context.view_layer.update()
MK0 = musteri.kafa.matrix_world.translation.copy()
BK0 = berber.kafa.matrix_world.translation.copy()
KES_MAKAS = MK0 + Vector((0.36, -0.1, 0.04))
KES_TARAK = MK0 + Vector((0.02, 0.2, 0.32))
BEKLE_MAKAS = BK0 + Vector((0.1, -0.5, -0.62))
K.kol_hedef(berber, 1, "R", KES_MAKAS, dirsek=-30, gecis=1)
K.kol_hedef(berber, 1, "L", KES_TARAK, dirsek=-30, gecis=1)

# Zaman çizelgesi
s = sn
# A: kesiyor → telefona bakar, stres
O.makas_kes(mk, 1, s(0.7))
K.ifade(berber, 1, "normal")
K.bak_yon(berber, 1, sag=-10, asagi=18)
K.bak_yon(berber, s(0.5), sag=25, asagi=30, gecis=7)        # telefona döner
K.ifade(berber, s(0.8), "stres", gecis=6)
K.kol_hedef(berber, s(1.1), "R", BEKLE_MAKAS, dirsek=-50, gecis=10)
K.kirp(berber, s(2.2))
# C: yüz yakın — gözleri telefonla müşteri arasında
K.ifade(berber, s(4.7), "endise", gecis=5)
# E: aynadan — telefona bakar, rahatlar, kameraya göz kırpar, işine döner
K.ifade(berber, s(10.8), "endise", gecis=2)
K.bak_yon(berber, s(10.8), sag=25, asagi=30, gecis=2)
K.ifade(berber, s(11.5), "rahat", gecis=8)
K.bak_yon(berber, s(12.0), sag=13, asagi=-2, gecis=9)             # kameraya (aynaya) bakar
K.ifade(berber, s(12.3), "gulumse", gecis=5)
K.ifade(berber, s(12.6), "goz_kirp", gecis=3)
K.ifade(berber, s(13.0), "gulumse", gecis=4)
K.bak_yon(berber, s(13.3), sag=-10, asagi=18, gecis=9)
K.kol_hedef(berber, s(13.2), "R", KES_MAKAS, dirsek=-30, gecis=10)
O.makas_kes(mk, s(13.3), TOPLAM)
for t in (7.2, 9.5, 15.2):
    K.kirp(berber, s(t))

# Müşteri: ara sıra göz kırpar, C'de berbere bakar
K.ifade(musteri, 1, "normal")
K.bak_yon(musteri, 1, asagi=6)
K.bak_yon(musteri, s(4.5), sag=4, asagi=-8, gecis=8)
K.bak_yon(musteri, s(10.8), asagi=6, gecis=2)
for t in (1.6, 4.9, 9.0, 12.5, 15.0):
    K.kirp(musteri, s(t))
K.ifade(musteri, s(13.8), "gulumse", gecis=8)

# Bekleyenler: biri saatine bakar, biri telefonunda; sonda rahat
K.ifade(bek1, 1, "normal")
kol_poz(bek1, 1, (-70, 0, 20, -60), None)
K.bak_yon(bek1, 1, sag=10, asagi=25)
K.ifade(bek2, 1, "normal")
K.bak_yon(bek2, 1, sag=-15, asagi=5)
kol_poz(bek2, s(2.0), (-75, 0, 35, -70), None, gecis=10)
K.ifade(bek2, s(2.4), "endise", gecis=6)
K.ifade(bek2, s(13.6), "gulumse", gecis=8)
kol_poz(bek2, s(13.6), (-10, 0, 5, -10), None, gecis=12)
K.bak_yon(bek2, s(13.6), sag=0, asagi=5, gecis=10)

# Telefon titreşimi (bildirim anları) + ekran ışığı
for t in (0.15, 0.95, 1.75, 2.9, 3.7):
    titret(tel, s(t), s(t) + 9, genlik=0.003, aci=1.5, tohum=int(t * 10))
tel_isik = isik("tel_isik", "AREA", (0.4, -1.06, TZ + 0.06), rot=(0, 0, 0), guc=0.0, renk="#e8f2ff", boyut=0.12)
tel_isik.rotation_euler = (R(180), 0, 0)  # yukarı: ekranın yüzlere vurduğu soğuk ışık
tel_isik.data.energy = 0.0
for f, e in ((1, 0.0), (s(0.15), 0.0), (s(0.2), 3.0), (TOPLAM, 3.0)):
    tel_isik.data.energy = e
    tel_isik.data.keyframe_insert("energy", frame=f)

# ------------------------------------------------------------------ IŞIK
isik("ana", "AREA", (-1.4, -2.2, 2.7), (0.1, 0.2, 1.5), 260, "#ffdcbc", 1.8)
isik("kenar", "AREA", (1.6, 1.9, 2.6), (0.2, 0.4, 1.6), 380, "#ffb067", 0.9)
isik("kenar2", "AREA", (-1.5, 2.0, 2.3), (0.2, 0.3, 1.5), 220, "#ffa255", 0.8)
isik("dolgu", "AREA", (0.6, -3.2, 1.3), (0.2, 0.2, 1.3), 45, "#b4caff", 3.0)
isik("tezgah_ust", "AREA", (0.2, -1.25, 2.0), (0.2, -1.2, TZ), 12, "#ffd7ad", 1.2)

# ------------------------------------------------------------------ KAMERALAR
TEL = Vector((0.4, -1.06, TZ))
bpy.context.view_layer.update()
sc.frame_set(1)
BK = berber.kafa.matrix_world.translation.copy()          # berberin kafa merkezi
MK = musteri.kafa.matrix_world.translation.copy()

# A · kanca: telefon önde (geniş açı, alçak), berber arkada; odak telefondan berbere kayar
pA = Vector((0.92, -1.8, 1.6))
kamA = kamera("A_kanca", pA, BK * 0.45 + TEL * 0.55, lens=20, fstop=2.0)
anahtar(kamA, "location", [(1, pA), (s(2.6), pA + Vector((-0.04, 0.12, -0.02)))])
dA = kamA.data.dof
dT, dB = (pA - TEL).length, (pA - BK).length
for f, d in ((1, dT), (s(0.8), dT), (s(1.4), dB), (s(2.6), dB - 0.1)):
    dA.focus_distance = d
    dA.keyframe_insert("focus_distance", frame=f)

# B · telefon yakın: bildirimler
kamB = kamera("B_telefon", TEL + Vector((0.03, -0.15, 0.46)), TEL, lens=50, fstop=7.0)
anahtar(kamB, "location", [(s(2.6), TEL + Vector((0.03, -0.15, 0.46))), (s(4.4), TEL + Vector((0.03, -0.13, 0.41)))])

# C · telefonun gözünden: berber telefona (izleyiciye) stresle bakar
pC = TEL + Vector((0.03, 0.06, 0.1))
kamC = kamera("C_yuz", pC, BK + Vector((0, 0, 0.02)), lens=28, fstop=2.2)
kamC.data.dof.focus_distance = (pC - BK).length - 0.36
anahtar(kamC, "location", [(s(4.4), pC), (s(5.6), pC + Vector((0, 0.06, 0.03)))])

# D · telefon yakın: SıraGO sohbeti
# Telefon kadrajın üst üçte ikisinde: altta alt yazıya yer kalır, balonların üstüne binmez
kamD = kamera("D_sohbet", TEL + Vector((0.015, -0.1, 0.54)), TEL + Vector((0, -0.045, 0)), lens=50, fstop=8.0)
anahtar(kamD, "location", [(s(5.6), TEL + Vector((0.015, -0.1, 0.54))), (s(10.8), TEL + Vector((0.02, -0.09, 0.515)))])

# E · aynadan: berber kameraya (aynaya) göz kırpar
pE = Vector((BK.x - 0.3, -1.38, BK.z + 0.1))
kamE = kamera("E_ayna", pE, BK + Vector((-0.16, 0, -0.22)), lens=42, fstop=2.0)
anahtar(kamE, "location", [(s(10.8), pE), (s(13.6), pE + Vector((0.03, 0.14, 0)))])
kamE.data.dof.focus_distance = (pE - BK).length - 0.36

# F · geniş plan, kapanış
kamF = kamera("F_genis", (1.5, -2.2, 1.65), (0.1, 0.9, 1.35), lens=26, fstop=2.8)
anahtar(kamF, "location", [(s(13.6), (1.2, -1.8, 1.6)), (TOPLAM, (1.65, -2.6, 1.75))])

for kam, t in ((kamA, 0), (kamB, 2.6), (kamC, 4.4), (kamD, 5.6), (kamE, 10.8), (kamF, 13.6)):
    plan(kam, s(t))

# ------------------------------------------------------------------ ÇIKTI
cikti = os.path.abspath(al("--cikti", os.path.join(BURA, "kareler")))
# Hız ayarları (ölçüm için): --sis 0 → hacimsel pus kapalı, --isin 0 → ışın izleme kapalı, --golge N → gölge ışını
if al("--sis") is not None and float(al("--sis")) == 0:
    sc.world.node_tree.links.clear() if False else None
    for l in list(sc.world.node_tree.links):
        if l.to_socket.name == "Volume":
            sc.world.node_tree.links.remove(l)
if al("--isin") is not None:
    sc.eevee.use_raytracing = al("--isin") == "1"
if al("--golge") is not None:
    sc.eevee.shadow_ray_count, sc.eevee.shadow_step_count = int(al("--golge")), 4
os.makedirs(cikti, exist_ok=True)
if al("--kaydet"):
    bpy.ops.wm.save_as_mainfile(filepath=os.path.abspath(al("--kaydet")))
if al("--debug_kamera"):   # x,y,z,hx,hy,hz,lens: geçici bakış (inceleme için)
    v = [float(x) for x in al("--debug_kamera").split(",")]
    dk = kamera("debug", v[0:3], v[3:6], lens=v[6] if len(v) > 6 else 35, fstop=16)
    for mk_ in list(sc.timeline_markers):
        sc.timeline_markers.remove(mk_)
    sc.camera = dk
if "--kadraj" in arg:
    from bpy_extras.object_utils import world_to_camera_view
    noktalar = {"tel": tel.matrix_world.translation, "berber_kafa": berber.kafa.matrix_world.translation,
                "musteri_kafa": musteri.kafa.matrix_world.translation, "makas": mk.matrix_world.translation,
                "fiko": bpy.data.objects["fiko"].matrix_world.translation}
    for kam, t in ((kamA, 1.3), (kamB, 3.5), (kamC, 5.0), (kamD, 8.0), (kamE, 12.4), (kamF, 15.0)):
        sc.frame_set(s(t))
        sat = []
        for ad, p in noktalar.items():
            p = bpy.data.objects[ad if ad in bpy.data.objects else "telefon"].matrix_world.translation if False else p
            v = world_to_camera_view(sc, kam, p.copy())
            sat.append(f"{ad}=({v.x:.2f},{1 - v.y:.2f},{v.z:.2f}m)")
        print("KADRAJ", kam.name, " ".join(sat))
if "--hepsi" in arg:
    sc.render.filepath = os.path.join(cikti, "kare_")
    bas, bit = int(al("--bas", 1)), int(al("--bit", TOPLAM))
    sc.frame_start, sc.frame_end = bas, bit
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
