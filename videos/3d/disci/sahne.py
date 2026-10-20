"""DİŞÇİ — "Klinik çalışırken randevular kendiliğinden yazılsın."  (16.5 sn, 495 kare)

  blender -b -P disci/sahne.py -- --kareler 40,120 --cikti <klasor> [--ornek 32] [--yuzde 50] [--kadraj]
  blender -b -P disci/sahne.py -- --hepsi --cikti <klasor>

PLANLAR (saniye)
  A 0.0–2.6   kanca: hasta ağzı açık, hekim eldivenli; yan dolaptaki telefon yanar, hekimin gözü kayar
  B 2.6–4.4   telefon: 3 okunmamış mesaj
  C 4.4–5.4   lambanın gözünden hasta: ağzı açık, gözleri hekimle telefon arasında
  D 5.4–9.7   telefon: SıraGO boş saatleri verir, randevuyu yazar
  E 9.7–10.6  ertesi sabah: boş koltuk
  F 10.6–12.6 telefon: 1 saat önce teyit gider, hasta "1" (Geliyorum) yazar
  G 12.6–14.2 koltuk dolu: Zeynep koltukta, hekim gözleriyle gülümser
  H 14.2–16.5 geniş plan + kapanış cümlesi ve logo
"""
import bpy, sys, os, math, glob
BURA = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(BURA, "..", "ortak"))
import importlib, temel, karakter as K, objeler as O
for m in (temel, K, O):
    importlib.reload(m)
from temel import *

arg = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
al = lambda ad, vars=None: arg[arg.index(ad) + 1] if ad in arg else vars
s = sn
TOPLAM = 495
sc = sahne_hazirla(TOPLAM, ornek=int(al("--ornek", 48)), gorunum="Khronos PBR Neutral", bakis="None")
sc.render.resolution_percentage = int(al("--yuzde", 100))
dunya("#1d1f22", 0.14, sis=0.0025, sis_renk="#fff0de")

# ------------------------------------------------------------------ MEKÂN
m_duvar = mat("klinik_duvar", "#ece2d3", 0.9)
m_alt = mat("klinik_alt", "#7f9f8a", 0.6)          # adaçayı yeşili lambri
m_ahsap = mat("klinik_ahsap", "#9a7556", 0.5)
kutu("zemin", (9, 9, 0.1), (0, 0.4, -0.05), mat("zemin_ahsap", "#a88462", 0.42, coat=0.2), 0)
kutu("tavan", (7, 6, 0.1), (0, 0.4, 3.2), mat("tavan_k", "#e9e1d6", 0.9), 0)
kutu("arka_duvar", (7, 0.2, 3.2), (0, 2.1, 1.6), m_duvar, 0)
kutu("arka_alt", (7, 0.05, 1.0), (0, 1.98, 0.5), m_alt, 0.01)
kutu("arka_pervaz", (7, 0.07, 0.04), (0, 1.97, 1.02), m_ahsap, 0.01)
# Sol duvar: jaluzili pencere (ikindi güneşi çizgi çizgi girer)
pz0, pz1, py0, py1 = 0.95, 2.45, -0.9, 1.1
for ad, y0, y1, z0, z1 in (("sd_on", -3, py0, 0, 3.2), ("sd_arka", py1, 2.2, 0, 3.2),
                           ("sd_alt", py0, py1, 0, pz0), ("sd_ust", py0, py1, pz1, 3.2)):
    kutu(ad, (0.2, y1 - y0, z1 - z0), (-2.5, (y0 + y1) / 2, (z0 + z1) / 2), m_duvar, 0)
kutu("sd_lambri", (0.05, 5.2, 0.9), (-2.38, -0.4, 0.45), m_alt, 0.01)
for i in range(22):
    kutu(f"jaluzi{i}", (0.02, py1 - py0, 0.05), (-2.42, (py0 + py1) / 2, pz0 + 0.04 + i * 0.068), mat("jaluzi", "#f3eee6", 0.5),
         0.004, rot=(0, -35, 0))
kutu("pencere_cerceve", (0.12, py1 - py0 + 0.12, 0.06), (-2.42, (py0 + py1) / 2, pz0), m_ahsap, 0.01)
gok = kutu("dis_gok", (0.02, 3, 2.4), (-3.4, 0.1, 1.7), isik_mat("dis_gok_k", "#ffd2a0", 2.2), 0)
gok.visible_shadow = False
gunes = isik("gunes", "SUN", (-4, 0.2, 3), rot=(0, -62, 18), guc=5.5, renk="#ffae66")
gunes.data.angle = R(1.2)
# Sabah (E planı sonrası): daha beyaz ve yumuşak güneş
for f, renk, guc in ((1, "#ffae66", 5.5), (s(9.7), "#fff0dc", 4.0)):
    gunes.data.color, gunes.data.energy = lin(renk)[:3], guc
    gunes.data.keyframe_insert("color", frame=f)
    gunes.data.keyframe_insert("energy", frame=f)
for fc in egriler(gunes.data):
    for k in fc.keyframe_points:
        k.interpolation = "CONSTANT"

# Arka duvar: üst-alt dolaplar, lavabo, raf (diş maketi, bitki, Fiko), diplomalar, röntgen panosu
m_dolap = mat("dolap", "#f4efe7", 0.35, coat=0.3)
kutu("alt_dolap", (2.2, 0.55, 0.88), (0.9, 1.72, 0.44), m_dolap, 0.015)
kutu("tezgah_k", (2.3, 0.6, 0.04), (0.9, 1.7, 0.9), mat("tezgah_k", "#d9d3ca", 0.25, coat=0.4), 0.01)
for x in (0.0, 0.55, 1.1, 1.65):
    kutu("kulp", (0.14, 0.02, 0.02), (x + 0.15, 1.44, 0.8), mat("krom", RENK["krom"], 0.15, metal=1.0), 0.005)
kutu("lavabo", (0.45, 0.35, 0.05), (1.5, 1.68, 0.905), mat("lavabo", "#ffffff", 0.15, coat=1), 0.03)
silindir("musluk", 0.015, 0.25, (1.5, 1.86, 0.92), mat("krom", RENK["krom"], 0.15, metal=1.0), 10)
kutu("musluk_ag", (0.03, 0.14, 0.025), (1.5, 1.8, 1.16), mat("krom", RENK["krom"], 0.15, metal=1.0), 0.008)
O.raf("raf_k", (-0.4, 1.9, 1.62), 1.2, renk="#9a7556")
m_dis = mat("dis_maket", "#fbf8f2", 0.25, coat=0.6)
kutu("dis_maket", (0.16, 0.13, 0.15), (-0.75, 1.88, 1.73), m_dis, 0.05)
for x in (-0.04, 0.04):
    kutu("dis_kok", (0.055, 0.08, 0.12), (-0.75 + x, 1.88, 1.62), m_dis, 0.025, rot=(0, x * 300, 0))
O.tilki_figur("fiko", (-0.35, 1.86, 1.64), yon=-20, olcek=1.25)
O.bitki("raf_bitki", (-0.05, 1.88, 1.635), olcek=0.5, tohum=8)
O.sise("agiz_suyu", (0.12, 1.88, 1.64), 0.035, 0.16, "#5fb3c9", "#f4f4f4", cam=True)
O.bitki("kose_bitki", (2.3, 1.6, 0), olcek=1.6, tohum=12, yaprak_sayisi=12, saksi="#efe6da")
m_cer = mat("cerceve_k", "#3a2a1f", 0.4)
m_kag = mat("diploma", "#f7f2e8", 0.8)
for i, x in enumerate((0.45, 1.05)):
    kutu("diploma_c", (0.42, 0.03, 0.32), (x, 1.99, 2.05), m_cer, 0.01)
    kutu("diploma", (0.36, 0.035, 0.26), (x, 1.985, 2.05), m_kag, 0.004)
    kutu("diploma_muhur", (0.05, 0.04, 0.05), (x + 0.11, 1.98, 1.97), mat("muhur", "#b8892e", 0.3, metal=0.6), 0.01)
    for j in range(3):
        kutu("diploma_satir", (0.24 - j * 0.05, 0.04, 0.012), (x - 0.02, 1.98, 2.12 - j * 0.04), mat("satir", "#8c8478", 0.8), 0)
kutu("rontgen", (0.7, 0.04, 0.42), (1.75, 1.99, 2.0), isik_mat("rontgen_isik", "#dfeefa", 1.6), 0.01)
for i in range(12):
    a = math.radians(-60 + i * 11)
    kutu("rontgen_dis", (0.035, 0.03, 0.07), (1.75 + math.sin(a) * 0.24, 1.965, 2.06 - (1 - math.cos(a)) * 0.35),
         mat("rontgen_dis", "#8ea0ad", 0.6), 0.01)
    kutu("rontgen_dis", (0.035, 0.03, 0.07), (1.75 + math.sin(a) * 0.24, 1.965, 1.94 + (1 - math.cos(a)) * 0.35),
         mat("rontgen_dis", "#8ea0ad", 0.6), 0.01)
for i, x in enumerate((-1.4, 0.2, 1.6)):
    kutu("tavan_lamba", (0.9, 0.3, 0.04), (x, 0.4, 3.13), isik_mat("tavan_isik", "#fff4e6", 0.7), 0.01)

# Hasta koltuğu (yatar)
m_doseme = mat("doseme", "#efe5d5", 0.45, coat=0.3, sheen=0.3)
m_beyaz = mat("unite_beyaz", "#f5f3ef", 0.3, coat=0.5)
silindir("koltuk_taban", 0.32, 0.06, (0, 0.1, 0), m_beyaz, 32, bevel=0.01)
kutu("koltuk_govde", (0.3, 0.5, 0.42), (0, 0.1, 0.27), m_beyaz, 0.05)
kutu("oturak_k", (0.6, 0.62, 0.12), (0, 0.0, 0.54), m_doseme, 0.05, seg=4)
bacak_p = bos("bacak_p", (0, -0.3, 0.56), rot=(-25, 0, 0))
kutu("bacaklik", (0.56, 0.7, 0.1), (0, -0.35, 0), m_doseme, 0.05, seg=4, ebeveyn=bacak_p)
sirt_p = bos("sirt_p", (0, 0.24, 0.6), rot=(-58, 0, 0))
kutu("sirtlik", (0.6, 0.12, 0.78), (0, 0.13, 0.42), m_doseme, 0.05, seg=4, ebeveyn=sirt_p)
kutu("bas_desteği", (0.32, 0.1, 0.2), (0, 0.13, 0.96), m_doseme, 0.05, seg=4, ebeveyn=sirt_p)
kutu("kol_dayama", (0.1, 0.5, 0.06), (-0.37, 0.05, 0.72), m_doseme, 0.03)
# Alet tepsisi + lamba
kutu("tepsi_kol", (0.05, 0.05, 0.85), (-0.55, 0.35, 0.42), m_beyaz, 0.015)
kutu("tepsi", (0.42, 0.3, 0.03), (-0.5, 0.25, 0.9), m_beyaz, 0.01)
for i in range(5):
    kutu("alet", (0.012, 0.22, 0.012), (-0.65 + i * 0.06, 0.25, 0.925), mat("krom", RENK["krom"], 0.15, metal=1.0), 0.004)
kutu("lamba_direk", (0.07, 0.07, 2.2), (0.95, 0.75, 1.1), m_beyaz, 0.02)
kutu("lamba_kol", (0.5, 0.07, 0.06), (0.72, 0.75, 2.18), m_beyaz, 0.02)
lamba = kutu("lamba_bas", (0.36, 0.16, 0.12), (0.5, 0.72, 2.02), m_beyaz, 0.04, rot=(0, 40, 0))
kutu("lamba_yuz", (0.3, 0.11, 0.02), (0, 0, -0.06), isik_mat("lamba_isik", "#f3f8ff", 6.0), 0.01, ebeveyn=lamba)

# Yan dolap (telefon burada) — kamera tarafında
kutu("yan_dolap", (0.55, 0.5, 0.86), (-0.95, -0.25, 0.43), m_dolap, 0.015)
kutu("yan_dolap_ust", (0.6, 0.55, 0.035), (-0.95, -0.25, 0.875), mat("tezgah_k", "#d9d3ca", 0.25, coat=0.4), 0.01)
TZ = 0.895
EK = sorted(glob.glob(os.path.join(BURA, "katmanlar", "ekran", "kare_*.png")))
tel = O.telefon("telefon", (-0.92, -0.25, TZ + O.TEL_K / 2), rot=(0, 0, -12),
                ekran_yolu=EK[0] if EK else None, dizi=(TOPLAM, 1), parlaklik=1.0)
O.sise("dezenfektan", (-1.12, -0.12, TZ), 0.035, 0.17, "#e9f4f7", "#1f6f4a")
kutu("eldiven_kutu", (0.22, 0.12, 0.1), (-1.0, -0.42, TZ + 0.05), mat("eldiven_kutusu", "#f4f6f8", 0.6), 0.01)
kutu("eldiven_kutu_s", (0.12, 0.125, 0.04), (-1.0, -0.42, TZ + 0.06), mat("eldiven_mavi", "#a9cbe8", 0.4), 0.01)

# ------------------------------------------------------------------ KARAKTERLER
YESIL_FORMA = "#1f6f4a"
hekim = K.karakter("hekim", (0.55, 1.22, 0), yon=-48, maske=True, bone="#2a8a57", gomlek=YESIL_FORMA,
                   pantolon=YESIL_FORMA, ten=RENK["ten_acik"], sac="#3a2516", eldiven="#a9cbe8")
hekim.kok.scale = (1.12,) * 3
ayna = bos("ayna_alet", (0, 0, -0.1), hekim.el["L"], rot=(180, 0, 0))
silindir("ayna_sap", 0.008, 0.2, (0, 0, 0), mat("krom", RENK["krom"], 0.15, metal=1.0), 8, ayna)
silindir("ayna_yuz", 0.022, 0.006, (0, 0, 0.2), mat("ayna_k", "#e9eef2", 0.02, metal=1.0), 16, ayna, rot=(60, 0, 0))

hasta = K.karakter("hasta", (0, 0.02, 0.185), oturan=True, ten=RENK["ten"], sac="#20160f", gomlek="#56708c",
                   pantolon="#2c323a")
K.egil(hasta, 1, ileri=-58, gecis=1)
kutu("onluk_kagit", (0.42, 0.02, 0.3), (0, -0.18, 0.42), mat("kagit_onluk", "#9fd3c0", 0.8), 0.01,
     ebeveyn=hasta.govde_pivot)
zeynep = K.karakter("zeynep", (0, 0.02, 0.185), oturan=True, ten=RENK["ten_acik"], sac=RENK["sac_kahve"],
                    sac_tip="uzun", gomlek="#d98b6a", pantolon="#3b4250", kirpik=True)
K.egil(zeynep, 1, ileri=-58, gecis=1)
kutu("onluk_kagit2", (0.42, 0.02, 0.3), (0, -0.18, 0.42), mat("kagit_onluk", "#9fd3c0", 0.8), 0.01,
     ebeveyn=zeynep.govde_pivot)
for k_ in (hasta, zeynep):  # kollar gövde boyunca, eller karında
    K.kol_poz(k_, 1, (-12, 0, 6, -70), (-12, 0, -6, -70))

gorunur(hasta.kok, [(1, True), (s(9.7), False)])
gorunur(zeynep.kok, [(1, False), (s(12.6), True)])
gorunur(hekim.kok, [(1, True), (s(9.7), False), (s(12.6), True)])

# Hekim: hastaya eğilmiş → gözü telefona kayar (stres) … G'de dik, gözleriyle güler, el sallar
CALIS_SAG = (-48, 0, -14, -38)
CALIS_SOL = (-44, 0, 16, -42)
K.egil(hekim, 1, ileri=18, gecis=1)
K.kol_poz(hekim, 1, CALIS_SAG, CALIS_SOL)
K.ifade(hekim, 1, "normal")
K.bak_yon(hekim, 1, sag=0, asagi=30)
K.goz_kay(hekim, s(0.8), x=0.0, z=-0.01)
K.goz_kay(hekim, s(1.0), x=0.0, z=0.016, gecis=3)            # göz telefona
K.bak_yon(hekim, s(1.4), sag=4, asagi=6, gecis=8)
K.ifade(hekim, s(1.2), "stres", gecis=6)
K.kirp(hekim, s(2.3))
K.kirp(hekim, s(4.9))
# G: dik durur, "mutlu" (^^) gözler, el sallar
K.egil(hekim, s(12.6), ileri=6, gecis=1)
K.bak_yon(hekim, s(12.6), sag=0, asagi=0, gecis=1)
K.goz_kay(hekim, s(12.6), 0, 0, gecis=1)
K.ifade(hekim, s(12.6), "gulumse", gecis=1)
K.ifade(hekim, s(13.1), "mutlu", gecis=4)
K.kol_poz(hekim, s(12.6), CALIS_SAG, (-150, 0, 10, -25), gecis=1)
om = hekim.omuz["R"]
for i, f in enumerate(range(s(12.8), s(14.2), 6)):
    om.rotation_euler = (R(-150), R(0), R(10 + (14 if i % 2 else -6)))
    om.keyframe_insert("rotation_euler", frame=f)

# Hasta (kanca): ağzı açık, gözleri hekim ↔ telefon
K.ifade(hasta, 1, "sasir")
K.bak_yon(hasta, 1, asagi=-6)
K.goz_kay(hasta, s(4.5), x=0.02, z=0.005)
K.goz_kay(hasta, s(5.0), x=-0.02, z=-0.005, gecis=4)
K.kirp(hasta, s(2.0))
# Zeynep (G): gülümser, göz kırpar
K.ifade(zeynep, 1, "gulumse")
K.bak_yon(zeynep, 1, sag=12, asagi=-10)
K.kirp(zeynep, s(13.5))

for t in (0.15, 1.0):  # bildirim titreşimi
    titret(tel, s(t), s(t) + 9, genlik=0.003, aci=1.5, tohum=int(t * 10) + 3)

# ------------------------------------------------------------------ IŞIK
isik("ana", "AREA", (-1.6, -1.8, 2.6), (0, 0.6, 1.3), 150, "#ffe1c2", 1.8)
isik("kenar", "AREA", (1.6, 1.9, 2.4), (0.3, 0.7, 1.4), 260, "#ffc285", 0.9)
isik("dolgu", "AREA", (1.2, -2.6, 1.3), (0, 0.5, 1.2), 22, "#c4d6ff", 3.0)
spot = isik("lamba_spot", "SPOT", (0.46, 0.72, 1.96), (0, 0.72, 1.15), 160, "#f3f8ff", aci=38, yumusaklik=0.12)

# ------------------------------------------------------------------ KAMERALAR
bpy.context.view_layer.update()
sc.frame_set(1)
TEL = tel.matrix_world.translation.copy()
HK = hekim.kafa.matrix_world.translation.copy()
PK = hasta.kafa.matrix_world.translation.copy()
TUST = Vector((math.sin(R(12)), math.cos(R(12)), 0))   # telefonun üst yönü (z dönüşü −12°)
TALT = -TUST

pA = Vector((-0.95, -0.95, 1.9))
kamA = kamera("A_kanca", pA, HK * 0.3 + PK * 0.35 + TEL * 0.35, lens=22, fstop=2.0)
anahtar(kamA, "location", [(1, pA), (s(2.6), pA + Vector((0.1, 0.1, -0.03)))])
dA = kamA.data.dof
dT, dH = (pA - TEL).length, (pA - HK).length - 0.3
for f, d in ((1, dH), (s(0.9), dH), (s(1.3), dT), (s(1.9), dT), (s(2.3), dH)):
    dA.focus_distance = d
    dA.keyframe_insert("focus_distance", frame=f)

pB = TEL + TALT * 0.15 + Vector((0, 0, 0.44))
kamB = kamera("B_telefon", pB, TEL, lens=50, fstop=7.0, yukari=TUST)
anahtar(kamB, "location", [(s(2.6), pB), (s(4.4), pB + TUST * 0.02 + Vector((0, 0, -0.04)))])

yuzH = Vector((0, -0.57, 0.82))   # hastanın yüz yönü (yatar)
pC = PK + yuzH * 1.25 + Vector((0.1, 0, 0))
kamC = kamera("C_hasta", pC, PK, lens=32, fstop=2.4)
kamC.data.dof.focus_distance = (pC - PK).length - 0.3
anahtar(kamC, "location", [(s(4.4), pC), (s(5.4), pC - yuzH * 0.08)])

pD = TEL + TALT * 0.06 + Vector((0, 0, 0.43))
kamD = kamera("D_sohbet", pD, TEL, lens=50, fstop=8.0, yukari=TUST)
anahtar(kamD, "location", [(s(5.4), pD), (s(9.7), pD + TUST * 0.02 + Vector((0, 0, -0.04)))])

pE = Vector((1.55, -1.85, 1.55))
kamE = kamera("E_sabah", pE, Vector((-0.1, 0.6, 0.85)), lens=28, fstop=3.2)
anahtar(kamE, "location", [(s(9.7), pE), (s(10.6), pE + Vector((-0.08, 0.1, 0)))])

pF = TEL + TALT * 0.1 + Vector((-0.03, 0, 0.42))
kamF = kamera("F_teyit", pF, TEL, lens=50, fstop=8.0, yukari=TUST)
anahtar(kamF, "location", [(s(10.6), pF), (s(12.6), pF + TUST * 0.02 + Vector((0, 0, -0.04)))])

ZK = PK
pG = Vector((-0.55, -0.45, 1.75))
kamG = kamera("G_dolu", pG, HK * 0.5 + ZK * 0.5, lens=30, fstop=2.4)
anahtar(kamG, "location", [(s(12.6), pG), (s(14.2), pG + Vector((0, 0.12, 0)))])

pH = Vector((1.35, -1.6, 1.6))
kamH = kamera("H_genis", pH, Vector((-0.1, 0.7, 1.15)), lens=26, fstop=2.8)
anahtar(kamH, "location", [(s(14.2), pH), (TOPLAM, pH + Vector((0.3, -0.5, 0.12)))])

for kam, t in ((kamA, 0), (kamB, 2.6), (kamC, 4.4), (kamD, 5.4), (kamE, 9.7), (kamF, 10.6), (kamG, 12.6),
               (kamH, 14.2)):
    plan(kam, s(t))

# ------------------------------------------------------------------ ÇIKTI
cikti = al("--cikti", os.path.join(BURA, "kareler"))
os.makedirs(cikti, exist_ok=True)
if "--kadraj" in arg:
    from bpy_extras.object_utils import world_to_camera_view
    for kam, t in ((kamA, 1.3), (kamB, 3.5), (kamC, 5.0), (kamD, 8.0), (kamE, 10.0), (kamF, 11.5), (kamG, 13.4),
                   (kamH, 15.5)):
        sc.frame_set(s(t))
        nk = {"tel": tel, "hekim": hekim.kafa, "hasta": hasta.kafa, "fiko": bpy.data.objects["fiko"]}
        print("KADRAJ", kam.name, " ".join(
            f"{a}=({v.x:.2f},{1 - v.y:.2f},{v.z:.2f}m)" for a, o in nk.items()
            for v in [world_to_camera_view(sc, kam, o.matrix_world.translation.copy())]))
if al("--kaydet"):
    bpy.ops.wm.save_as_mainfile(filepath=os.path.abspath(al("--kaydet")))
if "--hepsi" in arg:
    sc.render.filepath = os.path.join(cikti, "kare_")
    sc.frame_start, sc.frame_end = int(al("--bas", 1)), int(al("--bit", TOPLAM))
    bpy.ops.render.render(animation=True)
elif al("--kareler"):
    import time
    for f in [int(x) for x in al("--kareler").split(",")]:
        sc.frame_set(f)
        sc.render.filepath = os.path.join(cikti, f"kare_{f:04d}.png")
        t = time.perf_counter()
        bpy.ops.render.render(write_still=True)
        print(f"KARE {f}: {time.perf_counter() - t:.1f} sn")
