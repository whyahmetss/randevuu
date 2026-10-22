"""Berber dükkânı mekânı (KUZEY BERBER): duvarlar, akşam güneşi, raflar, direk, bekleyenler, koltuk + müşteri,
tezgâh + telefon, berber (makas/tarak). berber ve cumartesi videoları ortak kullanır.

kur(BURA, TOPLAM) → isimli alanlarla nesne döner (tel, berber, musteri, bek1, bek2, mk, TZ, gunes …).
Telefon ekranı dokusu: <BURA>/katmanlar/ekran/kare_####.png
"""
import bpy, os, math, random
from types import SimpleNamespace
import karakter as K, objeler as O
from temel import *


def kur(BURA, TOPLAM, insan_berber=True):
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
    berber = mk = None
    if insan_berber:   # Fiko'lu mizah videolarında berberi Fiko oynar
        berber = K.karakter("berber", (0.72, 0.45, 0), yon=-35, sakal=True, onluk=RENK["yesil_koyu"], gomlek="#ece6dc",
                            ten=RENK["ten"], sac="#2a1c14")
        berber.kok.scale = (1.18,) * 3
        mk = O.makas("makas", berber.el["R"], (0, 0, -0.12), (180, 0, 0), olcek=1.25)
        O.tarak("tarak", berber.el["L"], (0, 0, -0.1), (180, 0, 0))
    return SimpleNamespace(**{k: v for k, v in locals().items() if not k.startswith('_')})


def kapi_ekle():
    """Sağ duvar + sokağa açılan kapı (içe açık kanat), aydınlık sokak, kaldırım. kur()'dan sonra çağrılır."""
    m_siva = bpy.data.materials["siva"]
    m_pervaz = bpy.data.materials["pervaz"]
    dy0, dy1, dz1 = 0.7, 1.7, 2.3
    for ad, y0, y1, z0, z1 in (("sag_on", -1.6, dy0, 0, 3.4), ("sag_arka", dy1, 2.85, 0, 3.4),
                               ("sag_ust", dy0, dy1, dz1, 3.4)):
        kutu(ad, (0.2, y1 - y0, z1 - z0), (3.4, (y0 + y1) / 2, (z0 + z1) / 2), m_siva, 0)
    for dy, sy, sz, z in ((dy0, 0.08, dz1, dz1 / 2), (dy1, 0.08, dz1, dz1 / 2), ((dy0 + dy1) / 2, 1.08, 0.08, dz1)):
        kutu("kapi_kasa", (0.26, sy, sz), (3.32, dy, z), m_pervaz, 0.01)
    kapi = bos("kapi_mentese", (3.32, dy1 - 0.04, 0))
    kapi.rotation_euler.z = R(-75)
    kutu("kapi_kanat", (0.05, 0.9, 2.2), (0, -0.46, 1.1), mat("kapi_ahsap", "#4a2c1c", 0.45, coat=0.3), 0.01, ebeveyn=kapi)
    kutu("kapi_cam", (0.06, 0.6, 1.1), (0, -0.46, 1.45), mat("kapi_cam", "#cfe3ee", 0.05, transmisyon=0.8), 0.005,
         ebeveyn=kapi)
    sokak = kutu("sokak", (0.02, 3.5, 3.0), (4.6, 1.2, 1.5), isik_mat("sokak_isik", "#e9f1f7", 2.4), 0)
    sokak.visible_shadow = False
    kutu("kaldirim", (1.4, 3.5, 0.12), (4.0, 1.2, 0.0), mat("kaldirim", "#a49a8c", 0.8), 0.01)
    isik("kapi_isik", "AREA", (4.1, 1.2, 1.4), (2.5, 1.0, 1.0), 120, "#f2f6ff", 1.0, boyut_y=2.0)
    return kapi


def duvar_saati(loc, saatler, yon=0):
    """Duvar saati. yon: 0 → yüzü −Y'ye (arka duvar), -90 → yüzü −X'e (sağ duvar).
    saatler: [(kare, "16:59"), ...] → ibreler o karelerde o saati gösterir (aralarda akar)."""
    kok = bos("dsaat", loc, rot=(0, 0, yon))
    m_kasa = mat("saat_kasa_m", "#3a2619", 0.4, coat=0.3)
    silindir("dsaat_kasa", 0.22, 0.05, (0, 0, 0), m_kasa, 40, kok, rot=(90, 0, 0))
    silindir("dsaat_yuz", 0.195, 0.055, (0, -0.005, 0), mat("dsaat_yuz", "#f6efe2", 0.5), 40, kok, rot=(90, 0, 0))
    for i in range(12):
        a = 2 * math.pi * i / 12
        kutu("dsaat_cizgi", (0.012, 0.01, 0.03), (math.sin(a) * 0.165, -0.06, math.cos(a) * 0.165),
             mat("dsaat_c", "#2a2420", 0.5), 0, ebeveyn=kok, rot=(0, math.degrees(a), 0))
    ibreler = []
    for ad, boy, kal in (("akrep", 0.1, 0.02), ("yelkovan", 0.15, 0.012)):
        p = bos(f"dsaat_{ad}", (0, -0.065, 0), kok)
        kutu(f"dsaat_{ad}_m", (kal, 0.008, boy), (0, 0, boy / 2 - 0.02), mat("dsaat_ibre", "#1d1a17", 0.4), 0.003,
             ebeveyn=p)
        ibreler.append(p)
    for kare, metin in saatler:
        sa, dk = map(int, metin.split(":"))
        top = sa * 60 + dk   # sürekli açı: 16:59 → 17:00 geçişinde ibre geri dönmez
        ibreler[0].rotation_euler = (0, R(top * 0.5), 0)
        ibreler[1].rotation_euler = (0, R(top * 6), 0)
        for p in ibreler:
            p.keyframe_insert("rotation_euler", frame=kare)
    return kok
