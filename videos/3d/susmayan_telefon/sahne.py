"""HİKÂYE · YA TELEFONUN HİÇ SUSMASAYDI?  (29 sn, 870 kare) — karakter v2, POV anlatım.

  blender -b -P susmayan_telefon/sahne.py -- --kareler 40,150 --cikti <klasor> [--ornek 32] [--yuzde 50] [--kadraj]
  blender -b -P susmayan_telefon/sahne.py -- --hepsi [--bas N --bit M]

PLANLAR (saniye)
  A 0.0–3.3   sabah: usta dükkânı süpürür, tezgâhtaki telefon titremeye başlar          (kanca + soru başlığı)
  B 3.3–7.0   öğlen: koltuk dolu, bankta bekleyenler, telefon titriyor
  C 7.1–10.5  aynadan: koltuktaki müşteri surat asar, usta telefona eğilmiş
  D 10.5–13.5 telefon: "Tamam, başka yere bakarım."
  E 13.5–15.6 usta kameraya bakar (dönüm): "Peki cevabı başkası verseydi?"
  F 15.6–21.6 telefon: SıraGO cevaplar, hepsi cevaplanmış, sayaç sıfır
  G 21.6–25.5 akşam: usta rahat, müşteriyle gülüşür
  H 25.5–29.0 geniş plan + kapanış
"""
import bpy, sys, os, math
BURA = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(BURA, "..", "ortak"))
import importlib, temel, karakter as K1, karakter2 as K2, objeler as O, mekan_berber
for m in (temel, K1, K2, O, mekan_berber):
    importlib.reload(m)
from temel import *

arg = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
al = lambda ad, vars=None: arg[arg.index(ad) + 1] if ad in arg else vars
s = sn
TOPLAM = 870
sc = sahne_hazirla(TOPLAM, ornek=int(al("--ornek", 48)), gorunum="Khronos PBR Neutral", bakis="None")
sc.render.resolution_percentage = int(al("--yuzde", 100))
dunya("#1c1d1f", 0.2, sis=0.003, sis_renk="#fff0de")

M = mekan_berber.kur(BURA, TOPLAM, insan_berber=False)
tel, TZ = M.tel, M.TZ
mekan_berber.kapi_ekle()
mekan_berber.duvar_saati((2.95, 2.62, 2.3), [(1, "09:58"), (s(3.3), "11:40"), (s(7.1), "12:15"), (s(10.6), "12:22"),
                                             (s(21.6), "18:30")], yon=0)
for fc in list(egriler(bpy.data.objects["dsaat_akrep"])) + list(egriler(bpy.data.objects["dsaat_yelkovan"])):
    for k in fc.keyframe_points:
        k.interpolation = "CONSTANT"   # plan kesmelerinde saat zıplar
for k_ in (M.bek1, M.bek2, M.musteri):
    gorunur(k_.kok, [(1, False)])


def sabit(id_data):
    for fc in egriler(id_data):
        for k in fc.keyframe_points:
            k.interpolation = "CONSTANT"


# ------------------------------------------------------------------ GÜNÜN IŞIĞI: sabah → öğlen → akşam
gok_em = [n for n in bpy.data.materials["dis_gok"].node_tree.nodes if n.type == "EMISSION"][0]
for f, rot, renk, guc, gok, gok_g in ((1, (-40, 0, 30), "#f3f6ff", 4.5, "#dfeeff", 2.4),
                                      (s(3.3), (-55, 0, 25), "#fff1dc", 5.0, "#e4efff", 2.6),
                                      (s(21.6), (-68, 0, 25), "#ffa860", 5.0, "#ffb27a", 3.0)):
    M.gunes.rotation_euler = [R(a) for a in rot]
    M.gunes.keyframe_insert("rotation_euler", frame=f)
    M.gunes.data.color, M.gunes.data.energy = lin(renk)[:3], guc
    M.gunes.data.keyframe_insert("color", frame=f)
    M.gunes.data.keyframe_insert("energy", frame=f)
    gok_em.inputs[0].default_value, gok_em.inputs[1].default_value = lin(gok), gok_g
    gok_em.inputs[0].keyframe_insert("default_value", frame=f)
    gok_em.inputs[1].keyframe_insert("default_value", frame=f)
for idd in (M.gunes, M.gunes.data, bpy.data.materials["dis_gok"].node_tree):
    sabit(idd)

# ------------------------------------------------------------------ KARAKTERLER (v2)
usta = K2.karakter("usta", (0.62, 0.42, 0), yon=-30, ten="#c98d68", sac="#1d1510", biyik=True, sakal=True,
                   gomlek="#f1ede6", onluk=RENK["yesil_koyu"], pantolon="#2a2d33")
mk = O.makas("makas", usta.el["R"], (0, 0, -0.1), (180, 0, 0), olcek=0.8)
O.tarak("tarak", usta.el["L"], (0, 0, -0.08), (180, 0, 0))
# Süpürge (A): sap + fırça, usta'nın sağ elinde
supurge = bos("supurge", (0, 0, -0.06), usta.el["R"], rot=(180, 0, 0))
silindir("supurge_sap", 0.014, 1.15, (0, 0, -0.55), mat("supurge_sap", "#a07a4c", 0.6), 10, supurge)
kutu("supurge_firca", (0.32, 0.06, 0.12), (0, 0, 0.62), mat("supurge_firca", "#2b2420", 0.9), 0.02, ebeveyn=supurge)
gorunur(supurge, [(1, True), (s(3.3), False)])
gorunur(mk, [(1, False), (s(3.3), True)])

musteri = K2.karakter("musteri", (0, -0.02, -0.22), oturan=True, ten="#d7a27d", sac="#3a2516", gomlek="#5b6b7a",
                      pantolon="#2d3138")
for t in ("L", "R"):
    musteri.omuz[t].scale = (0.0001,) * 3
pelerin, yaka = bpy.data.objects["pelerin"], bpy.data.objects["pelerin_yaka"]
pelerin.scale = (0.85, 0.85, 0.95)
for o in (musteri.kok, pelerin, yaka):
    gorunur(o, [(1, False), (s(3.3), True)])
bek1 = K2.karakter("bek1", (1.6, 2.25, -0.325), yon=8, oturan=True, ten="#b47a55", sac="#1c1410", gomlek="#3d5a80",
                   pantolon="#2a2a2a", biyik=True)
bek2 = K2.karakter("bek2", (2.25, 2.25, -0.325), yon=-6, oturan=True, ten="#e2b08c", sac="#6b4a2a", gomlek="#b5523b",
                   pantolon="#39404a", gozluk=True)
for b in (bek1, bek2):
    gorunur(b.kok, [(1, False), (s(3.3), True)])

bpy.context.view_layer.update()
sc.frame_set(1)
UK0 = usta.kafa.matrix_world.translation.copy()
sc.frame_set(s(4))
MK0 = musteri.kafa.matrix_world.translation.copy()
KES_MAKAS = MK0 + Vector((0.2, -0.05, 0.05))
KES_TARAK = MK0 + Vector((0.02, 0.15, 0.17))
BEKLE = UK0 + Vector((0.08, -0.35, -0.45))

# A: süpürür (iki el aşağıda, gövde hafif öne; süpürge ileri-geri)
K1.kol_poz(usta, 1, (-25, 0, -10, -40), (-30, 0, 15, -50))
K1.egil(usta, 1, ileri=10, gecis=1)
om = usta.omuz["R"]
for i, f in enumerate(range(1, s(1.2), 10)):
    om.rotation_euler.x = R(-25 + (10 if i % 2 else -6))
    om.keyframe_insert("rotation_euler", index=0, frame=f)
K1.ifade(usta, 1, "gulumse")
K1.bak_yon(usta, 1, sag=0, asagi=25)
K1.bak_yon(usta, s(1.4), sag=28, asagi=20, gecis=8)        # telefona döner
K1.ifade(usta, s(1.6), "sasir", gecis=5)
K1.kirp(usta, s(2.5))
# B: tıraş eder; telefon titredikçe göz kayar
K1.egil(usta, s(3.3), ileri=4, gecis=1)
K1.kol_hedef(usta, s(3.3), "R", KES_MAKAS, dirsek=-35, gecis=1)
K1.kol_hedef(usta, s(3.3), "L", KES_TARAK, dirsek=-35, gecis=1)
K1.bak_yon(usta, s(3.3), sag=-8, asagi=22, gecis=1)
K1.ifade(usta, s(3.3), "normal", gecis=1)
O.makas_kes(mk, s(3.3), s(5.2))
K1.bak_yon(usta, s(5.6), sag=26, asagi=24, gecis=7)
K1.ifade(usta, s(5.8), "endise", gecis=6)
K1.bak_yon(usta, s(6.5), sag=-8, asagi=22, gecis=7)
# C: telefona eğilir, makas havada; müşteri aynadan surat asar
K1.egil(usta, s(7.4), ileri=18, gecis=10)
K1.bak_yon(usta, s(7.4), sag=30, asagi=35, gecis=8)
K1.kol_hedef(usta, s(7.5), "R", BEKLE, dirsek=-60, gecis=8)
K1.ifade(usta, s(7.6), "stres", gecis=6)
# E: doğrulur, kameraya bakar (dönüm)
K1.egil(usta, s(13.5), ileri=2, gecis=1)
K1.bak_yon(usta, s(13.5), sag=12, asagi=-2, gecis=1)
K1.ifade(usta, s(13.5), "stres", gecis=1)
K1.kirp(usta, s(14.3))
K1.ifade(usta, s(15.0), "endise", gecis=6)
# G: akşam, rahat; müşteriyle gülüşür
K1.kol_hedef(usta, s(21.6), "R", KES_MAKAS, dirsek=-35, gecis=1)
K1.bak_yon(usta, s(21.6), sag=-8, asagi=18, gecis=1)
K1.ifade(usta, s(21.6), "gulumse", gecis=1)
O.makas_kes(mk, s(21.6), s(23.0))
K1.ifade(usta, s(23.3), "kahkaha", gecis=6)
K1.bak_yon(usta, s(23.3), sag=-20, asagi=10, gecis=8)
K1.ifade(usta, s(24.6), "gulumse", gecis=6)
O.makas_kes(mk, s(25.0), TOPLAM)

K1.ifade(musteri, s(3.3), "normal", gecis=1)
K1.bak_yon(musteri, s(3.3), asagi=4, gecis=1)
K1.ifade(musteri, s(7.8), "endise", gecis=6)
K1.bak_yon(musteri, s(8.2), sag=6, asagi=-6, gecis=8)
K1.kirp(musteri, s(9.3))
K1.ifade(musteri, s(21.6), "gulumse", gecis=1)
K1.ifade(musteri, s(23.4), "kahkaha", gecis=6)
for t in (4.6, 19.0, 26.5):
    K1.kirp(musteri, s(t))
for b, sag in ((bek1, 10), (bek2, -12)):
    K1.ifade(b, s(3.3), "normal", gecis=1)
    K1.bak_yon(b, s(3.3), sag=sag, asagi=20, gecis=1)
    K1.ifade(b, s(5.0), "endise", gecis=8)
    K1.ifade(b, s(21.6), "gulumse", gecis=1)
K1.kol_poz(bek1, s(3.3), (-70, 0, 20, -60), None, gecis=1)

# Telefon titreşimi + ekran ışığı
for t in (1.2, 2.2, 3.6, 4.4, 5.2, 6.0, 7.8, 8.6, 9.6, 10.8, 11.5, 12.3):
    titret(tel, s(t), s(t) + 9, genlik=0.003, aci=1.5, tohum=int(t * 10))
tel_isik = isik("tel_isik", "AREA", (0.4, -1.06, TZ + 0.06), guc=0.0, renk="#e8f2ff", boyut=0.12)
tel_isik.rotation_euler = (R(180), 0, 0)
for f, e in ((1, 0.0), (s(1.2), 0.0), (s(1.25), 3.0), (TOPLAM, 3.0)):
    tel_isik.data.energy = e
    tel_isik.data.keyframe_insert("energy", frame=f)

# ------------------------------------------------------------------ IŞIK (iç mekân)
isik("ana", "AREA", (-1.2, -2.2, 2.6), (0.2, 0.2, 1.4), 250, "#ffe2c4", 1.8)
isik("kenar", "AREA", (1.6, 1.9, 2.6), (0.3, 0.4, 1.5), 300, "#ffc08a", 0.9)
isik("dolgu", "AREA", (0.6, -3.2, 1.3), (0.2, 0.2, 1.3), 45, "#c4d4ff", 3.0)
isik("tezgah_ust", "AREA", (0.2, -1.25, 2.0), (0.2, -1.2, TZ), 12, "#fff0dc", 1.2)

# ------------------------------------------------------------------ KAMERALAR
bpy.context.view_layer.update()
sc.frame_set(s(14.0))
UK = usta.kafa.matrix_world.translation.copy()
TEL = Vector((0.4, -1.06, TZ))
THEDEF = TEL + Vector((0, -0.045, 0))

pA = Vector((1.05, -2.15, 1.55))
kamA = kamera("A_sabah", pA, Vector((0.35, 0.5, 1.05)), lens=26, fstop=2.8)
kamA.data.dof.focus_distance = (pA - UK0).length
anahtar(kamA, "location", [(1, pA), (s(3.3), pA + Vector((-0.1, 0.2, -0.03)))])

pB = Vector((1.55, -1.95, 1.6))
kamB = kamera("B_oglen", pB, Vector((0.6, 0.9, 1.15)), lens=24, fstop=3.2)
kamB.data.dof.focus_distance = (pB - MK0).length
anahtar(kamB, "location", [(s(3.3), pB), (s(7.0), pB + Vector((-0.12, 0.2, 0)))])

pC = Vector((MK0.x + 0.05, -1.32, MK0.z + 0.12))
kamC = kamera("C_ayna", pC, MK0 * 0.55 + UK0 * 0.45 + Vector((0, 0, -0.05)), lens=36, fstop=2.2)
kamC.data.dof.focus_distance = (pC - MK0).length - 0.1
anahtar(kamC, "location", [(s(7.0), pC), (s(10.5), pC + Vector((0.03, 0.12, 0)))])

pD = TEL + Vector((0.015, -0.1, 0.54))
kamD = kamera("D_telefon", pD, THEDEF, lens=50, fstop=7.0)
anahtar(kamD, "location", [(s(10.5), pD), (s(13.5), pD + Vector((0, 0.01, -0.03)))])

pE = UK + Vector((-0.55, -1.25, 0.05))
kamE = kamera("E_donum", pE, UK + Vector((0, 0, -0.12)), lens=50, fstop=2.4)
kamE.data.dof.focus_distance = (pE - UK).length - 0.12
anahtar(kamE, "location", [(s(13.5), pE), (s(15.6), pE + (UK - pE).normalized() * 0.2)])

kamF = kamera("F_sirago", pD, THEDEF, lens=50, fstop=8.0)
anahtar(kamF, "location", [(s(15.6), pD), (s(21.6), pD + Vector((0.005, 0.01, -0.03)))])

pG = Vector((0.75, -1.55, 1.75))
kamG = kamera("G_aksam", pG, MK0 * 0.5 + UK0 * 0.5 + Vector((0, 0, -0.08)), lens=38, fstop=2.4)
kamG.data.dof.focus_distance = (pG - MK0).length
anahtar(kamG, "location", [(s(21.6), pG), (s(25.5), pG + Vector((0.05, 0.15, 0)))])

kamH = kamera("H_genis", (1.5, -2.2, 1.65), (0.3, 0.9, 1.3), lens=24, fstop=2.8)
anahtar(kamH, "location", [(s(25.5), (1.25, -1.85, 1.6)), (TOPLAM, (1.7, -2.65, 1.75))])

for kam, t in ((kamA, 0), (kamB, 3.3), (kamC, 7.0), (kamD, 10.5), (kamE, 13.5), (kamF, 15.6), (kamG, 21.6),
               (kamH, 25.5)):
    plan(kam, s(t))

# ------------------------------------------------------------------ ÇIKTI
cikti = os.path.abspath(al("--cikti", os.path.join(BURA, "kareler")))
os.makedirs(cikti, exist_ok=True)
if "--kadraj" in arg:
    from bpy_extras.object_utils import world_to_camera_view
    for kam, t in ((kamA, 1.5), (kamB, 5.0), (kamC, 9.0), (kamE, 14.5), (kamG, 23.5), (kamH, 27.0)):
        sc.frame_set(s(t))
        nk = {"tel": tel, "usta": usta.kafa, "musteri": musteri.kafa, "bek1": bek1.kafa}
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
