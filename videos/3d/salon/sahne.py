"""GÜZELLİK SALONU — "Sen uyurken bile randevu alan salon."  (16.5 sn, 495 kare)

  blender -b -P salon/sahne.py -- --kareler 40,120 --cikti <klasor> [--ornek 32] [--yuzde 50] [--kadraj]
  blender -b -P salon/sahne.py -- --hepsi --cikti <klasor>

PLANLAR (saniye)
  A 0.0–2.6   kanca: gece 23:47, kapalı salon karanlık; resepsiyondaki telefon yanar
  B 2.6–4.6   yatak odası: Elif yatakta, telefonun ışığı yüzünde, yazıyor
  C 4.6–8.4   salonun telefonu: SıraGO cevaplar, randevuyu yazar
  D 8.4–9.4   yatak odası: Elif gülümser, lambayı kapatır
  E 9.4–11.4  sabah: salon sahibi kahvesiyle telefona bakar, gülümser
  F 11.4–13.6 telefon: gece yazılan randevular (🎉 Yeni Randevu)
  G 13.6–16.5 sabah geniş plan + kapanış cümlesi ve logo
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
SABAH = s(9.4)
sc = sahne_hazirla(TOPLAM, ornek=int(al("--ornek", 48)), gorunum="Khronos PBR Neutral", bakis="None")
sc.render.resolution_percentage = int(al("--yuzde", 100))
w = dunya("#0c1424", 0.16, sis=0.003, sis_renk="#dfe8ff")
bg = w.node_tree.nodes["Background"]
for f, renk, guc in ((1, "#0c1424", 0.16), (SABAH, "#2a2018", 0.35)):
    bg.inputs[0].default_value, bg.inputs[1].default_value = lin(renk), guc
    bg.inputs[0].keyframe_insert("default_value", frame=f)
    bg.inputs[1].keyframe_insert("default_value", frame=f)


def sabit(id_data):
    for fc in egriler(id_data):
        for k in fc.keyframe_points:
            k.interpolation = "CONSTANT"


sabit(w.node_tree)


def gece_sabah(o, gece, sabah, renk_g=None, renk_s=None):
    """Işığın enerjisi (ve rengi) gece/sabah arasında plan kesmesinde değişir."""
    d = o.data
    for f, e, r in ((1, gece, renk_g), (SABAH, sabah, renk_s)):
        d.energy = e
        d.keyframe_insert("energy", frame=f)
        if r:
            d.color = lin(r)[:3]
            d.keyframe_insert("color", frame=f)
    sabit(d)


# ================================================================== SALON (orijinde)
m_duvar = mat("salon_duvar", "#e6c3b5", 0.9)          # pudra
m_kemer = mat("salon_kemer", RENK["yesil_koyu"], 0.7)  # aynanın arkasında koyu yeşil kemer
m_zemin = mat("salon_zemin", "#cdb8a3", 0.38, coat=0.2)
m_beyaz = mat("salon_beyaz", "#f3eee8", 0.35, coat=0.3)
m_altin = mat("altin", "#c8a25a", 0.25, metal=1.0)
kutu("zemin", (9, 9, 0.1), (0, 0.4, -0.05), m_zemin, 0)
kutu("tavan", (7, 6, 0.1), (0, 0.4, 3.1), mat("salon_tavan", "#efe6dc", 0.9), 0)
kutu("arka_duvar", (7, 0.2, 3.1), (0, 2.3, 1.55), m_duvar, 0)
kutu("sag_duvar", (0.2, 5, 3.1), (3.0, 0.2, 1.55), m_duvar, 0)
# Sol duvar: pencere (gece ay + sokak, sabah güneş)
pz0, pz1, py0, py1 = 0.9, 2.5, -0.6, 1.2
for ad, y0, y1, z0, z1 in (("sd_on", -3, py0, 0, 3.1), ("sd_arka", py1, 2.4, 0, 3.1),
                           ("sd_alt", py0, py1, 0, pz0), ("sd_ust", py0, py1, pz1, 3.1)):
    kutu(ad, (0.2, y1 - y0, z1 - z0), (-2.6, (y0 + y1) / 2, (z0 + z1) / 2), m_duvar, 0)
for dy in (py0, (py0 + py1) / 2, py1):
    kutu("pencere_kayit", (0.12, 0.06, pz1 - pz0), (-2.52, dy, (pz0 + pz1) / 2), m_beyaz, 0.01)
gok_m = isik_mat("salon_gok", "#1b2a4a", 1.0)
gok_em = [n for n in gok_m.node_tree.nodes if n.type == "EMISSION"][0]
for f, renk, guc in ((1, "#1b2a4a", 0.8), (SABAH, "#ffd9a8", 3.0)):
    gok_em.inputs[0].default_value, gok_em.inputs[1].default_value = lin(renk), guc
    gok_em.inputs[0].keyframe_insert("default_value", frame=f)
    gok_em.inputs[1].keyframe_insert("default_value", frame=f)
sabit(gok_m.node_tree)
kutu("dis_gok", (0.02, 3.4, 2.6), (-3.5, 0.3, 1.7), gok_m, 0).visible_shadow = False
gunes = isik("gunes", "SUN", (-4, 0.3, 3), rot=(0, -60, 25), guc=0, renk="#ffb877")
gece_sabah(gunes, 0.0, 5.0)
ay = isik("ay", "AREA", (-3.2, 0.3, 2.0), (0, 0.6, 0.8), 0, "#8fb0ff", 1.6, boyut_y=1.4)
gece_sabah(ay, 140, 0)
sokak = isik("sokak", "SPOT", (-3.6, -0.6, 2.6), (0.4, 0.8, 0.6), 0, "#ffae5c", aci=35, yumusaklik=0.3)
gece_sabah(sokak, 380, 0)

# Kemer + yuvarlak ışıklı ayna + koltuk
kutu("kemer_govde", (1.3, 0.04, 1.6), (-0.5, 2.18, 1.0), m_kemer, 0.01)
silindir("kemer_tepe", 0.65, 0.04, (-0.5, 2.2, 1.8), m_kemer, 48, rot=(90, 0, 0))
silindir("ayna_cerceve", 0.47, 0.05, (-0.5, 2.15, 1.55), m_altin, 48, rot=(90, 0, 0))
silindir("ayna", 0.43, 0.06, (-0.5, 2.14, 1.55), mat("ayna_cam", "#cfd6dc", 0.04, metal=1.0), 48, rot=(90, 0, 0))
ampuller = []
for i in range(14):
    a = 2 * math.pi * i / 14
    o = kure("ayna_ampul", 0.035, (-0.5 + math.cos(a) * 0.53, 2.1, 1.55 + math.sin(a) * 0.53),
             isik_mat("ayna_ampul_m", "#fff1d6", 1.0), 12)
    ampuller.append(o)
am = bpy.data.materials["ayna_ampul_m"]
am_em = [n for n in am.node_tree.nodes if n.type == "EMISSION"][0]
for f, g in ((1, 0.05), (SABAH, 7.0)):
    am_em.inputs[1].default_value = g
    am_em.inputs[1].keyframe_insert("default_value", frame=f)
sabit(am.node_tree)
kutu("konsol", (1.2, 0.4, 0.06), (-0.5, 2.0, 0.85), m_beyaz, 0.015)
for x in (-1.0, 0.0):
    kutu("konsol_ayak", (0.05, 0.05, 0.85), (x, 1.92, 0.42), m_altin, 0.01)
for i, (x, renk) in enumerate(((-0.95, "#e8b4a8"), (-0.85, "#f4f1ec"), (-0.2, "#1f6f4a"), (-0.1, "#d8a35a"))):
    O.sise(f"urun{i}", (x, 2.02, 0.88), 0.03, 0.14 + 0.03 * (i % 2), renk, "#c8a25a", cam=(i % 2 == 1))
m_kadife = mat("kadife", "#c9867a", 0.7, sheen=1.0)
silindir("koltuk_ayak", 0.05, 0.42, (-0.5, 1.25, 0.05), m_altin, 16)
silindir("koltuk_taban", 0.28, 0.05, (-0.5, 1.25, 0), m_altin, 32)
kutu("koltuk_oturak", (0.6, 0.55, 0.16), (-0.5, 1.25, 0.55), m_kadife, 0.07, seg=4)
kutu("koltuk_sirt", (0.62, 0.14, 0.62), (-0.5, 0.98, 0.95), m_kadife, 0.07, seg=4)
for x in (-0.84, -0.16):
    kutu("koltuk_kol", (0.1, 0.5, 0.26), (x, 1.22, 0.72), m_kadife, 0.05, seg=3)
# Manikür köşesi + raf (Fiko burada) + bitkiler
kutu("raf_s", (1.1, 0.25, 0.035), (1.45, 2.12, 1.7), m_beyaz, 0.01)
kutu("raf_s2", (1.1, 0.25, 0.035), (1.45, 2.12, 1.3), m_beyaz, 0.01)
O.tilki_figur("fiko", (1.75, 2.1, 1.72), yon=-25, olcek=1.2)
for i, (x, renk) in enumerate(((1.05, "#f1c9bf"), (1.18, "#e9e2d6"), (1.32, "#c98a7a"), (1.55, "#2a8a57"))):
    O.sise(f"raf_urun{i}", (x, 2.1, 1.72), 0.03, 0.12 + 0.02 * (i % 3), renk, "#c8a25a")
for i, x in enumerate((1.0, 1.15, 1.3, 1.45, 1.6, 1.75, 1.9)):  # oje şişeleri
    O.sise(f"oje{i}", (x, 2.1, 1.32), 0.018, 0.05, ("#c0392b", "#e8a0a8", "#7a2e4a", "#f2d7c9", "#1f6f4a",
                                                     "#b45f3a", "#d9b8e8")[i], "#222222", cam=True)
O.bitki("raf_bitki", (1.95, 2.1, 1.72), olcek=0.45, tohum=4)
O.bitki("kose_bitki", (2.55, 1.85, 0), olcek=1.9, tohum=13, yaprak_sayisi=13, saksi="#efe6da")
O.bitki("pencere_bitki", (-2.2, 1.6, 0), olcek=1.4, tohum=6, saksi="#c98a7a")
O.havlu_yigini("havlu_s", (1.3, 2.1, 1.335), ("#f4f1ec", "#e8c9c0", "#2a8a57"))
# Duvar saati: 23:47 (gece) → 08:52 (sabah)
silindir("saat_kasa", 0.24, 0.05, (0.95, 2.18, 2.45), m_altin, 40, rot=(90, 0, 0))
silindir("saat_yuz", 0.215, 0.055, (0.95, 2.175, 2.45), mat("saat_yuz", "#fbf6ee", 0.5), 40, rot=(90, 0, 0))
for i in range(12):
    a = 2 * math.pi * i / 12
    kutu("saat_cizgi", (0.012, 0.01, 0.035), (0.95 + math.sin(a) * 0.18, 2.12, 2.45 + math.cos(a) * 0.18),
         mat("saat_c", "#2a2420", 0.5), 0, rot=(0, math.degrees(a), 0))


def ibre(ad, boy, kal, aci_g, aci_s):
    p = bos(ad, (0.95, 2.115, 2.45))
    kutu(ad + "_m", (kal, 0.008, boy), (0, 0, boy / 2 - 0.02), mat("ibre", "#1d1a17", 0.4), 0.003, ebeveyn=p)
    for f, a in ((1, aci_g), (SABAH, aci_s)):
        p.rotation_euler = (0, R(a), 0)
        p.keyframe_insert("rotation_euler", frame=f)
    sabit(p)


ibre("akrep", 0.11, 0.02, (11 + 47 / 60) * 30, (8 + 52 / 60) * 30)
ibre("yelkovan", 0.16, 0.012, 47 * 6, 52 * 6)

# Resepsiyon (telefon burada)
kutu("resepsiyon", (1.5, 0.5, 1.0), (1.0, -0.1, 0.5), m_beyaz, 0.02)
kutu("resepsiyon_ust", (1.6, 0.6, 0.04), (1.0, -0.1, 1.02), mat("resepsiyon_ust", "#d9c2a5", 0.3, coat=0.4), 0.01)
for i in range(9):
    kutu("resepsiyon_cita", (0.05, 0.02, 0.9), (0.4 + i * 0.15, -0.36, 0.48), m_altin, 0.005)
RZ = 1.04
EK = sorted(glob.glob(os.path.join(BURA, "katmanlar", "ekran", "kare_*.png")))
tel = O.telefon("telefon", (0.78, -0.12, RZ + O.TEL_K / 2), rot=(0, 0, 10),
                ekran_yolu=EK[0] if EK else None, dizi=(TOPLAM, 1), parlaklik=1.0)
O.bitki("resepsiyon_bitki", (1.55, -0.05, RZ), olcek=0.55, tohum=9, saksi="#f1e7da")
kutu("defter", (0.24, 0.3, 0.025), (1.18, -0.1, RZ + 0.012), mat("defter", "#2a8a57", 0.6), 0.006, rot=(0, 0, -8))
tel_isik = isik("tel_isik", "AREA", (0.78, -0.12, RZ + 0.05), rot=(180, 0, 0), guc=0, renk="#dce8ff", boyut=0.12)
for f, e in ((1, 0.0), (s(0.6), 0.0), (s(0.65), 6.0), (SABAH, 1.5)):
    tel_isik.data.energy = e
    tel_isik.data.keyframe_insert("energy", frame=f)
sabit(tel_isik.data)
titret(tel, s(0.6), s(0.6) + 10, genlik=0.003, aci=1.5, tohum=2)

# Salon sahibi (sabah): topuz, yeşil önlük, elinde kahve
seda = K.karakter("seda", (1.0, 0.45, 0), yon=8, sac_tip="topuz", sac=RENK["sac_kahve"], onluk=RENK["yesil_koyu"],
                  gomlek="#f2e6da", ten=RENK["ten_acik"], kirpik=True)
seda.kok.scale = (1.1,) * 3
fincan = bos("fincan", (0, -0.03, -0.12), seda.el["R"], rot=(90, 0, 0))
silindir("fincan_g", 0.05, 0.11, (0, 0, -0.03), mat("fincan", "#f4f1ec", 0.25, coat=0.6), 20, fincan, rot=(-90, 0, 0))
gorunur(seda.kok, [(1, False), (SABAH, True)])
K.kol_poz(seda, 1, (-20, 0, -8, -45), (-60, 0, 15, -95))
K.ifade(seda, 1, "uykulu")
K.bak_yon(seda, 1, sag=-10, asagi=35)
K.ifade(seda, s(9.9), "sasir", gecis=5)
K.ifade(seda, s(10.4), "gulumse", gecis=6)
K.kirp(seda, s(10.9))
K.ifade(seda, s(13.9), "kahkaha", gecis=8)
K.bak_yon(seda, s(13.9), sag=0, asagi=5, gecis=10)

# Salon ışıkları (sabah)
for ad, loc, hedef, guc, renk, boy in (("ana_s", (-1.4, -1.8, 2.6), (0.5, 0.6, 1.3), 180, "#ffe2c4", 1.8),
                                       ("kenar_s", (2.0, 1.8, 2.4), (0.8, 0.4, 1.5), 220, "#ffc08a", 0.9),
                                       ("dolgu_s", (1.0, -2.6, 1.4), (0.5, 0.5, 1.2), 30, "#cad9ff", 3.0)):
    gece_sabah(isik(ad, "AREA", loc, hedef, 0, renk, boy), 0, guc)
gece_kenar = isik("gece_kenar", "AREA", (1.8, 1.6, 2.6), (0.5, 0.8, 1.2), 0, "#6f8fff", 1.2)
gece_sabah(gece_kenar, 90, 0)

# ================================================================== YATAK ODASI (x = 30)
# Yatak X ekseni boyunca (baş ucu +X). Elif yan yatar, yüzü kameraya (−Y) dönük; telefon yüzünün önünde.
OX = 30.0
m_od = mat("oda_duvar", "#33405a", 0.9)
kutu("oda_zemin", (6, 6, 0.1), (OX, 0, -0.05), mat("oda_zemin", "#5a4636", 0.5), 0)
kutu("oda_duvar", (6, 0.2, 3), (OX, 1.1, 1.5), m_od, 0)
kutu("oda_yan", (0.2, 6, 3), (OX + 2.1, 0, 1.5), m_od, 0)
kutu("yatak_baslik", (0.12, 1.7, 0.95), (OX + 1.18, 0.1, 0.78), mat("baslik", "#8a7f9e", 0.7, sheen=0.8), 0.04, seg=3)
kutu("yatak", (2.2, 1.6, 0.35), (OX, 0.1, 0.3), mat("yatak_cerceve", "#6b513e", 0.5), 0.03)
kutu("yatak_sil", (2.15, 1.55, 0.18), (OX, 0.1, 0.56), mat("carsaf", "#efe8f2", 0.8, sheen=0.5), 0.05, seg=3)
kutu("yastik", (0.42, 0.66, 0.2), (OX + 0.9, -0.05, 0.74), mat("yastik", "#f6f2f8", 0.85, sheen=0.6), 0.08, seg=4)
kutu("yastik2", (0.4, 0.62, 0.18), (OX + 0.92, 0.55, 0.74), mat("yastik", "#f6f2f8", 0.85, sheen=0.6), 0.08, seg=4)
kutu("yorgan", (1.55, 1.45, 0.3), (OX - 0.35, 0.12, 0.78), mat("yorgan", "#b9a7d6", 0.85, sheen=0.7), 0.12, seg=4)
kutu("komodin", (0.5, 0.45, 0.6), (OX + 1.55, -0.35, 0.3), mat("komodin", "#7a5a43", 0.5), 0.02)
silindir("lamba_ayak", 0.07, 0.3, (OX + 1.6, -0.25, 0.6), mat("lamba_ayak", "#d8c7a8", 0.3, coat=0.5), 16)
lamba_m = isik_mat("abajur", "#ffcf94", 2.0)
lamba_em = [n for n in lamba_m.node_tree.nodes if n.type == "EMISSION"][0]
silindir("abajur", 0.16, 0.2, (OX + 1.6, -0.25, 0.9), lamba_m, 20, r2=0.1)
abajur = isik("abajur_isik", "POINT", (OX + 1.6, -0.25, 0.97), guc=35, renk="#ffb874", yumusaklik=0.12)
for f, e, g in ((1, 35, 2.0), (s(9.0), 35, 2.0), (s(9.05), 0, 0.02)):
    abajur.data.energy = e
    abajur.data.keyframe_insert("energy", frame=f)
    lamba_em.inputs[1].default_value = g
    lamba_em.inputs[1].keyframe_insert("default_value", frame=f)
sabit(abajur.data)
sabit(lamba_m.node_tree)
bpy.ops.object.text_add(location=(OX + 1.48, -0.585, 0.635), rotation=(R(90), 0, 0))
saat_y = bpy.context.object
saat_y.data.body = "23:47"
saat_y.data.size = 0.075
saat_y.data.align_x = "CENTER"
saat_y.data.materials.append(isik_mat("dijital", "#ff7a4a", 4.0))
kutu("dijital_kasa", (0.24, 0.08, 0.11), (OX + 1.48, -0.54, 0.655), mat("dijital_kasa", "#151515", 0.3), 0.015)
kutu("oda_pencere", (1.1, 0.04, 1.2), (OX - 0.4, 0.98, 1.75), isik_mat("oda_gece", "#1d2f55", 0.9), 0.01)
for i in range(22):  # uzak şehir ışıkları
    kutu("sehir", (0.025, 0.02, 0.02), (OX - 0.9 + (i * 0.137) % 1.0, 0.95, 1.25 + (i * 0.291) % 0.65),
         isik_mat("sehir_isik", "#ffcf8a", 6.0), 0)
kutu("perde", (0.3, 0.06, 1.5), (OX - 1.1, 0.93, 1.75), mat("perde", "#c9b9d9", 0.9, sheen=1), 0.02)

elif_ = K.karakter("elif", (OX - 0.85, 0.05, 0.98), sac_tip="uzun", sac="#2a1a14", gomlek="#d9c7ea",
                   ten=RENK["ten"], kirpik=True)
elif_.kok.rotation_euler = (0, R(90), 0)       # yan yatış: baş +X, yüz −Y
K.kol_poz(elif_, 1, (-70, 0, 0, -95), (-60, 0, 0, -100))
K.ifade(elif_, 1, "normal")
K.bak_yon(elif_, 1, sag=0, asagi=-8)
K.ifade(elif_, s(3.2), "gulumse", gecis=8)
K.kirp(elif_, s(3.9))
K.ifade(elif_, s(8.6), "rahat", gecis=6)
K.ifade(elif_, s(9.15), "uykulu", gecis=6)   # lamba sönünce gözler kapanır
bpy.context.view_layer.update()
EK0 = elif_.kafa.matrix_world.translation.copy()
pTel = EK0 + Vector((-0.34, -0.36, -0.02))
elif_tel = O.telefon("elif_tel", pTel, rot=(-90, 180, 0))
elif_tel.scale = (1.5,) * 3
# Kameraya sırtı dönük: pastel kılıf + kamera modülü telefon olduğunu okutur, kenarından ekran ışığı taşar
m_kilif = mat("kilif", "#e9b8c8", 0.45, sheen=0.4)
for ad_ in ("elif_tel_govde", "elif_tel_cerceve"):
    birlestir_mat(bpy.data.objects[ad_], m_kilif)
kutu("elif_tel_modul", (0.04, 0.05, 0.006), (-0.025, 0.07, -O.TEL_K / 2 - 0.003), mat("modul", "#1c1c1e", 0.2, coat=1), 0.01,
     ebeveyn=elif_tel)
for dy in (0.083, 0.06):
    silindir("elif_tel_lens", 0.009, 0.004, (-0.025, dy, -O.TEL_K / 2 - 0.01), mat("lens", "#0b0b0d", 0.05, coat=1), 16,
             elif_tel)
kutu("elif_tel_hale", (0.112, 0.232, 0.004), (0, 0, O.TEL_K / 2 - 0.002), isik_mat("hale", "#cfe0ff", 1.6), 0.01,
     ebeveyn=elif_tel)
kutu("elif_tel_ekran", (0.095, 0.2, 0.002), (0, 0, O.TEL_K / 2 + 0.001), isik_mat("elif_ekran", "#eaf2ff", 3.0), 0,
     ebeveyn=elif_tel)
elif_tel.rotation_euler = (R(-90), R(180), R(-15))
anahtar(elif_tel, "location", [(s(8.6), pTel), (s(9.1), pTel + Vector((-0.05, 0.02, -0.28)))])
yuz_isik = isik("yuz_isik", "AREA", pTel + Vector((0, 0.03, 0)), EK0, 10, "#cfe0ff", 0.12)
for f, e in ((1, 10), (s(8.9), 10), (s(9.1), 0)):
    yuz_isik.data.energy = e
    yuz_isik.data.keyframe_insert("energy", frame=f)
isik("oda_ay", "AREA", (OX - 0.2, -0.9, 2.2), (OX + 0.6, 0, 0.9), 70, "#7d9cff", 1.4)
isik("oda_kenar", "AREA", (OX + 1.5, 0.7, 1.6), EK0, 30, "#ffb37a", 0.5)

# ================================================================== KAMERALAR
bpy.context.view_layer.update()
sc.frame_set(1)
TEL = tel.matrix_world.translation.copy()
TUST = Vector((-math.sin(R(10)), math.cos(R(10)), 0))
TALT = -TUST

pA = Vector((1.02, -0.62, 1.22))
kamA = kamera("A_kanca", pA, Vector((0.05, 2.0, 1.75)), lens=22, fstop=1.8)
anahtar(kamA, "location", [(1, pA), (s(2.6), pA + Vector((-0.04, 0.1, -0.02)))])
dA = kamA.data.dof
dT = (pA - TEL).length
for f, d in ((1, 2.9), (s(0.4), 2.9), (s(1.0), dT), (s(2.6), dT)):
    dA.focus_distance = d
    dA.keyframe_insert("focus_distance", frame=f)

sc.frame_set(s(3.5))
EK_ = elif_.kafa.matrix_world.translation.copy()
pB = EK_ + Vector((-0.15, -2.1, 0.62))
kamB = kamera("B_elif", pB, EK_ + Vector((0.05, -0.2, -0.05)), lens=35, fstop=1.8, yukari=(1, 0, 0.3))
kamB.data.dof.focus_distance = (pB - EK_).length - 0.2
anahtar(kamB, "location", [(s(2.6), pB), (s(4.6), pB + Vector((-0.1, 0.03, -0.03)))])

# Telefon planları: telefon kadrajın üst üçte ikisinde, altta alt yazıya yer kalır
THEDEF = TEL + TALT * 0.058
pC = TEL + TALT * 0.1 + Vector((0, 0, 0.54))
kamC = kamera("C_sohbet", pC, THEDEF, lens=50, fstop=8.0, yukari=TUST)
anahtar(kamC, "location", [(s(4.6), pC), (s(8.4), pC + TUST * 0.01 + Vector((0, 0, -0.025)))])

pD = EK_ + Vector((0.0, -1.6, 0.45))
kamD = kamera("D_uyku", pD, EK_ + Vector((-0.12, -0.1, -0.03)), lens=34, fstop=1.8, yukari=(1, 0, 0.3))
kamD.data.dof.focus_distance = (pD - EK_).length - 0.2

sc.frame_set(s(10.5))
SK = seda.kafa.matrix_world.translation.copy()
pE = Vector((0.3, -1.55, 1.65))
kamE = kamera("E_sabah", pE, SK * 0.7 + TEL * 0.3, lens=32, fstop=2.0)
kamE.data.dof.focus_distance = (pE - SK).length - 0.3
anahtar(kamE, "location", [(s(9.4), pE), (s(11.4), pE + Vector((0.05, 0.12, 0)))])

pF = TEL + TALT * 0.1 + Vector((0.02, 0, 0.54))
kamF = kamera("F_bildirim", pF, THEDEF, lens=50, fstop=8.0, yukari=TUST)
anahtar(kamF, "location", [(s(11.4), pF), (s(13.6), pF + TUST * 0.01 + Vector((0, 0, -0.025)))])

pG = Vector((1.9, -1.7, 1.55))
kamG = kamera("G_genis", pG, Vector((0.0, 1.2, 1.25)), lens=24, fstop=2.8)
anahtar(kamG, "location", [(s(13.6), pG), (TOPLAM, pG + Vector((0.25, -0.45, 0.1)))])

for kam, t in ((kamA, 0), (kamB, 2.6), (kamC, 4.6), (kamD, 8.4), (kamE, 9.4), (kamF, 11.4), (kamG, 13.6)):
    plan(kam, s(t))

# ================================================================== ÇIKTI
cikti = os.path.abspath(al("--cikti", os.path.join(BURA, "kareler")))
os.makedirs(cikti, exist_ok=True)
if "--kadraj" in arg:
    from bpy_extras.object_utils import world_to_camera_view
    for kam, t in ((kamA, 1.3), (kamB, 3.5), (kamC, 6.0), (kamD, 9.0), (kamE, 10.5), (kamF, 12.5), (kamG, 15.0)):
        sc.frame_set(s(t))
        nk = {"tel": tel, "seda": seda.kafa, "elif": elif_.kafa, "fiko": bpy.data.objects["fiko"]}
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
