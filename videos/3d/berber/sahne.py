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

# ------------------------------------------------------------------ MEKÂN
zemin = kutu("zemin", (9, 9, 0.1), (0, 0.5, -0.05), dama_mat("dama", "#cfc3ae", "#1e1a18", 2.2, 0.3), 0)
m_siva = mat("siva", "#2c4a3b", 0.85)  # koyu yeşil duvar (eski berber; marka yeşiline yakın)
m_lambri = mat("lambri", "#5a3523", 0.45, coat=0.3)
m_pervaz = mat("pervaz", "#3e2418", 0.5)
kutu("lambri", (7, 0.06, 1.05), (0, 2.63, 0.525), m_lambri, 0.01)
kutu("lambri_ust", (7, 0.1, 0.05), (0, 2.6, 1.06), m_pervaz, 0.01)
for x in (-3.0, -2.4, -1.8, -1.2, -0.6, 0, 0.6, 1.2, 1.8, 2.4, 3.0):
    kutu("lambri_cita", (0.03, 0.03, 0.95), (x, 2.59, 0.5), m_pervaz, 0.005)
kutu("sol_duvar", (0.2, 5, 3.4), (-3.3, 0.4, 1.7), m_siva, 0)
kutu("sol_lambri", (0.06, 5, 1.05), (-3.18, 0.4, 0.525), m_lambri, 0.01)

kutu("tavan", (7.5, 6, 0.1), (0, 0.2, 3.45), mat("tavan", "#2a1d16", 0.8), 0)
for x in (-2.4, -1.2, 0, 1.2, 2.4):
    kutu("kiris", (0.14, 6, 0.16), (x, 0.2, 3.32), mat("kiris", "#3a2619", 0.6), 0.01).visible_shadow = False
# Pencere: akşam güneşi
pen_x = -1.75
# Arka duvar pencere boşluğu bırakarak parça parça (güneş içeri girsin)
px0, px1, pz0, pz1 = pen_x - 0.65, pen_x + 0.65, 1.1, 2.6
for ad, x0, x1, z0, z1 in (("duvar_sol", -3.5, px0, 0, 3.4), ("duvar_sag", px1, 3.5, 0, 3.4),
                           ("duvar_alt", px0, px1, 0, pz0), ("duvar_ust", px0, px1, pz1, 3.4)):
    kutu(ad, (x1 - x0, 0.2, z1 - z0), ((x0 + x1) / 2, 2.75, (z0 + z1) / 2), m_siva, 0)
gok = kutu("dis_gok", (3.0, 0.02, 2.4), (pen_x, 3.6, 1.9), isik_mat("dis_gok", "#ffb27a", 3.0), 0)
gok.visible_shadow = False
for i, (x, h) in enumerate(((-2.6, 1.4), (-2.0, 2.1), (-1.3, 1.7), (-0.9, 2.4))):  # karşı binalar (siluet)
    b = kutu(f"bina{i}", (0.55, 0.1, h), (x, 3.45, h / 2 + 0.3), mat("bina", "#6b3d2c", 0.9), 0)
    b.visible_shadow = False
for dx, dz, sx, sz in ((0, 0.78, 1.42, 0.08), (0, -0.78, 1.42, 0.1), (-0.68, 0, 0.08, 1.6), (0.68, 0, 0.08, 1.6),
                       (0, 0, 1.3, 0.04), (0, 0, 0.04, 1.5)):
    kutu("pencere_cerceve", (sx, 0.12, sz), (pen_x + dx, 2.66, 1.85 + dz), m_pervaz, 0.01)
gunes = isik("gunes", "SUN", (pen_x, 4, 2.5), rot=(-68, 0, 25), guc=5.0, renk="#ffa860")
gunes.data.angle = R(1.5)

# Tabela: KUZEY BERBER (arkadan ışıklı harfler)
font_yol = "C:/Windows/Fonts/ROCKEB.TTF" if os.path.exists("C:/Windows/Fonts/ROCKEB.TTF") else "C:/Windows/Fonts/georgiab.ttf"
bpy.ops.object.text_add(location=(0.55, 2.6, 2.55), rotation=(R(90), 0, 0))
tabela = bpy.context.object
tabela.data.body = "KUZEY BERBER"
tabela.data.font = bpy.data.fonts.load(font_yol)
tabela.data.align_x = "CENTER"
tabela.data.size = 0.26
tabela.data.extrude = 0.015
tabela.data.bevel_depth = 0.003
tabela.data.materials.append(mat("tabela", "#f2e3c6", 0.3, emis="#ffd9a0", emis_guc=1.4))
kutu("tabela_pano", (2.5, 0.04, 0.5), (0.55, 2.63, 2.64), mat("pano", "#2b1a12", 0.5), 0.02)

# Raf: şişeler, havlu, bitki, tilki figürü (Fiko — küçük, odak dışı)
O.raf("raf1", (0.55, 2.52, 1.72), 2.1)
O.raf("raf2", (0.55, 2.52, 1.32), 2.1)
for i, (x, r, h, renk) in enumerate(((-0.25, 0.035, 0.17, "#7a3b2a"), (-0.15, 0.03, 0.2, "#244a7a"),
                                     (-0.06, 0.04, 0.14, "#d8c7a1"), (0.9, 0.03, 0.19, "#3c5e3a"),
                                     (1.0, 0.035, 0.15, "#8a2a2a"), (1.1, 0.028, 0.21, "#c9a24a"))):
    O.sise(f"sise{i}", (x, 2.5, 1.74), r, h, renk)
O.havlu_yigini("havlu", (0.3, 2.5, 1.74))
O.tilki_figur("fiko", (0.62, 2.48, 1.74), yon=-15, olcek=1.25)
O.bitki("raf_bitki", (1.4, 2.5, 1.335), olcek=0.55, tohum=7)
for i, x in enumerate((-0.2, -0.05, 0.12, 0.85, 1.0)):
    O.sise(f"sise_alt{i}", (x, 2.5, 1.34), 0.03 + 0.005 * (i % 2), 0.13 + 0.03 * (i % 3),
           ("#1f6f4a", "#6b3a2a", "#2c2c2c", "#b58b3a", "#5a2a4a")[i], cam=(i % 2 == 0))

direk, direk_map = O.berber_diregi("direk", (-0.75, 2.56, 1.15))
kutu("direk_tutucu", (0.06, 0.12, 0.04), (-0.75, 2.62, 1.2), mat("krom", RENK["krom"], 0.15, metal=1.0), 0.01)
kutu("direk_tutucu2", (0.06, 0.12, 0.04), (-0.75, 2.62, 1.93), mat("krom", RENK["krom"], 0.15, metal=1.0), 0.01)
direk_map.inputs["Location"].default_value[2] = 0
direk_map.inputs["Location"].keyframe_insert("default_value", index=2, frame=1)
direk_map.inputs["Location"].default_value[2] = -0.9
direk_map.inputs["Location"].keyframe_insert("default_value", index=2, frame=TOPLAM)

# Bekleme bankı + bekleyen müşteriler
m_ah = mat("ahsap", RENK["ahsap"], 0.5)
kutu("bank", (1.5, 0.5, 0.08), (1.95, 2.2, 0.46), m_ah, 0.02)
kutu("bank_sirt", (1.5, 0.08, 0.5), (1.95, 2.45, 0.78), m_ah, 0.02)
for x in (1.3, 2.6):
    kutu("bank_ayak", (0.08, 0.45, 0.42), (x, 2.2, 0.21), mat("bank_demir", "#1d1d1d", 0.4, metal=0.7), 0.01)
bek1 = K.karakter("bekleyen1", (1.55, 2.28, 0.04), yon=8, oturan=True, ten=RENK["ten_esmer"], sac="#1c1410",
                  gomlek="#3d5a80", pantolon="#2a2a2a")
bek2 = K.karakter("bekleyen2", (2.3, 2.28, 0.04), yon=-5, oturan=True, ten=RENK["ten_acik"], sac="#6b4a2a",
                  gomlek="#b5523b", pantolon="#39404a", sakal=True)
for b in (bek1, bek2):
    b.kok.scale = (0.95,) * 3

# Edison ampuller (arka planda bokeh)
for i, (x, y, z) in enumerate(((-1.0, 1.6, 2.55), (0.2, 1.9, 2.75), (1.4, 1.4, 2.6), (2.3, 2.0, 2.8), (-2.2, 1.2, 2.7))):
    O.ampul(f"ampul{i}", (x, y, z), kablo=3.4 - z + 0.3, guc=9, isik_guc=6)

# Duvar lambası / sağ taraf bitkisi
O.bitki("kose_bitki", (2.85, 1.6, 0), olcek=1.6, tohum=11, yaprak_sayisi=12, saksi="#e3d6c2")
O.bitki("pencere_bitki", (-2.6, 2.3, 0), olcek=1.3, tohum=5, saksi="#b9714a")

# Berber koltuğu + müşteri (pelerinli)
O.berber_koltugu("koltuk", (0, 0, 0))
musteri = K.karakter("musteri", (0, -0.03, 0.165), oturan=True, ten=RENK["ten"], sac="#3a2516", gomlek="#5b6b7a")
for t in ("L", "R"):
    musteri.omuz[t].scale = (0.0001,) * 3
pelerin = silindir("pelerin", 0.44, 0.72, (0, -0.06, 0.38), mat("pelerin", "#22272b", 0.6, sheen=0.5), 24, r2=0.17)
pelerin.scale = (1, 0.92, 1)
silindir("pelerin_yaka", 0.18, 0.04, (0, -0.04, 1.1), mat("yaka", "#f4f1ec", 0.8), 20)
# Yerde saç kırpıntıları
rnd = random.Random(4)
m_kirp = mat("kirpinti", "#2a1c14", 0.8)
for i in range(70):
    a, r = rnd.uniform(0, 6.28), rnd.uniform(0.25, 0.9)
    kutu("kirpinti", (rnd.uniform(0.01, 0.04), 0.004, 0.003), (math.cos(a) * r, math.sin(a) * r - 0.1, 0.003),
         m_kirp, 0, rot=(0, 0, rnd.uniform(0, 180)))

# Tezgâh (aynanın altı; kamera tarafı)
m_tez = mat("tezgah", "#3b2519", 0.4, coat=0.5)
m_mermer = mat("mermer", "#3b3734", 0.32, coat=0.25)
kutu("tezgah", (3.2, 0.5, 0.86), (0, -1.2, 0.43), m_tez, 0.02)
kutu("tezgah_ust", (3.3, 0.56, 0.04), (0, -1.2, 0.88), m_mermer, 0.01)
TZ = 0.9  # tezgâh üstü

# Tezgâh üstü: telefon, tıraş makinesi, sprey, dezenfektan kavanozu, tarak
import glob
_ekranlar = sorted(glob.glob(os.path.join(BURA, "katmanlar", "ekran", "kare_*.png")))
EKRAN = _ekranlar[0] if _ekranlar else ""
tel = O.telefon("telefon", (0.4, -1.06, TZ + O.TEL_K / 2), rot=(0, 0, 8),
                ekran_yolu=EKRAN if os.path.exists(EKRAN) else None, dizi=(TOPLAM, 1), parlaklik=1.0)
kutu("makine", (0.07, 0.17, 0.05), (0.72, -1.12, TZ + 0.025), mat("makine", "#202326", 0.3, metal=0.5), 0.02,
     rot=(0, 0, -20))
silindir("kablo_tez", 0.006, 0.4, (0.74, -1.04, TZ + 0.01), mat("kablo", "#111111", 0.5), 6, rot=(90, 0, 70))
m_mavi = mat("barbicide", "#2f8fd0", 0.05, transmisyon=0.7, emis="#2f8fd0", emis_guc=0.15)
silindir("kavanoz", 0.06, 0.2, (-0.25, -1.15, TZ), m_mavi, 24)
silindir("kavanoz_kapak", 0.065, 0.03, (-0.25, -1.15, TZ + 0.2), mat("krom", RENK["krom"], 0.15, metal=1.0), 24)
for i in range(3):
    kutu("kavanoz_tarak", (0.012, 0.03, 0.2), (-0.26 + i * 0.012, -1.15, TZ + 0.17), mat("tarak", "#1b1b1d", 0.35),
         0.003, rot=(0, (i - 1) * 8, 0))
O.sise("sprey", (-0.55, -1.2, TZ), 0.035, 0.18, "#f0efe8", "#1f6f4a")
O.bitki("tezgah_bitki", (-1.1, -1.2, TZ), olcek=0.7, tohum=2, yaprak_sayisi=8, saksi="#efe6da")
O.tarak("tarak_tez", None, (0.15, -1.0, TZ + 0.004), (90, 0, 75))

# ------------------------------------------------------------------ BERBER
berber = K.karakter("berber", (0.72, 0.45, 0), yon=-35, sakal=True, onluk=RENK["yesil_koyu"], gomlek="#ece6dc",
                    ten=RENK["ten"], sac="#2a1c14")
berber.kok.scale = (1.18,) * 3
mk = O.makas("makas", berber.el["L"], (0, 0, -0.1), (180, 0, 0), olcek=1.8)
O.tarak("tarak", berber.el["R"], (0, 0, -0.1), (180, 0, 0))


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


KES_SAG = (-88, 0, -12, -28)     # makas müşterinin başında
KES_SOL = (-50, 0, 15, -55)       # tarak öbür yanda
BEKLE_SAG = (-55, 0, -8, -60)    # makas havada, duraksamış
kol_poz(berber, 1, KES_SAG, KES_SOL)

# Zaman çizelgesi
s = sn
# A: kesiyor → telefona bakar, stres
O.makas_kes(mk, 1, s(1.1))
K.ifade(berber, 1, "normal")
K.bak_yon(berber, 1, sag=-10, asagi=18)
K.bak_yon(berber, s(0.9), sag=25, asagi=30, gecis=7)        # telefona döner
K.ifade(berber, s(1.2), "stres", gecis=6)
kol_poz(berber, s(1.4), BEKLE_SAG, None, gecis=10)
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
kol_poz(berber, s(13.2), KES_SAG, None, gecis=10)
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
kamD = kamera("D_sohbet", TEL + Vector((0.015, -0.06, 0.43)), TEL, lens=50, fstop=8.0)
anahtar(kamD, "location", [(s(5.6), TEL + Vector((0.015, -0.06, 0.43))), (s(10.8), TEL + Vector((0.015, -0.04, 0.39)))])

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
cikti = al("--cikti", os.path.join(BURA, "kareler"))
os.makedirs(cikti, exist_ok=True)
if al("--kaydet"):
    bpy.ops.wm.save_as_mainfile(filepath=os.path.abspath(al("--kaydet")))
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
    bpy.ops.render.render(animation=True)
elif al("--kareler"):
    import time
    for f in [int(x) for x in al("--kareler").split(",")]:
        sc.frame_set(f)
        sc.render.filepath = os.path.join(cikti, f"kare_{f:04d}.png")
        t = time.perf_counter()
        bpy.ops.render.render(write_still=True)
        print(f"KARE {f}: {time.perf_counter() - t:.1f} sn")
