"""Köşeli, sevimli karakter + yüz ifadeleri.

Hiyerarşi (kök ayaklarda):
  kök → govde, bacaklar, omuz_L/R → dirsek → el ; kafa_pivot (boyun) → kafa, yüz parçaları

İfadeler `ifade(k, kare, ad)` ile anahtarlanır:
  'normal', 'stres' (kaşlar iç uçtan kalkık, ağız dalgalı-aşağı, ter), 'rahat' (gülümseme, yanak),
  'gulumse', 'sasir' (ağız açık), 'goz_kirp' (sağ göz kapalı + yarım gülüş), 'kirp' (göz kırpma/blink)
"""
import math
from mathutils import Vector
from temel import (kutu, kure, yay, bos, mat, isik_mat, anahtar, gorunur, egriler, R, RENK)


class Karakter:
    pass


def karakter(ad, konum=(0, 0, 0), yon=0, ten=RENK["ten"], sac=RENK["sac_koyu"], sac_tip="kisa",
             sakal=False, gomlek="#e9e4da", pantolon="#2b2f36", onluk=None, maske=False, bone=None,
             oturan=False, olcek=1.0, goz_renk="#1b1410", kirpik=False, eldiven=None, kol_renk=None):
    k = Karakter()
    k.ad = ad
    k.kok = bos(ad, konum, rot=(0, 0, yon))
    k.kok.scale = (olcek,) * 3
    m_ten = mat(f"ten_{ten}", ten, 0.55, sheen=0.3)
    m_sac = mat(f"sac_{sac}", sac, 0.7)
    m_gom = mat(f"gomlek_{gomlek}", gomlek, 0.75, sheen=0.4)
    m_pan = mat(f"pantolon_{pantolon}", pantolon, 0.8)
    m_ayk = mat("ayakkabi", "#1c1714", 0.4)
    m_goz = mat(f"goz_{goz_renk}", goz_renk, 0.12, coat=1.0)
    m_parla = isik_mat("goz_parlama", "#ffffff", 6.0)
    m_kas = mat(f"kas_{sac}", sac, 0.8)
    m_agiz = mat("agiz_ic", "#4a1a1e", 0.6)
    m_dil = mat("dil", "#d9706f", 0.5)
    m_yanak = mat("yanak", "#f08a7a", 0.6, alfa=0.85)
    m_ter = mat("ter", "#8fd0ff", 0.05, emis="#bfe6ff", emis_guc=0.6, coat=1)

    # --- Gövde ve bacaklar
    kalca_z = 0.62
    if oturan:
        for i, x in enumerate((-0.11, 0.11)):
            kutu(f"{ad}_uyluk{i}", (0.17, 0.42, 0.17), (x, -0.18, 0.5), m_pan, 0.05, ebeveyn=k.kok)
            kutu(f"{ad}_baldir{i}", (0.16, 0.17, 0.42), (x, -0.39, 0.25), m_pan, 0.05, ebeveyn=k.kok)
            kutu(f"{ad}_ayak{i}", (0.17, 0.26, 0.09), (x, -0.45, 0.045), m_ayk, 0.04, ebeveyn=k.kok)
        kalca_z = 0.5
    else:
        for i, x in enumerate((-0.11, 0.11)):
            kutu(f"{ad}_bacak{i}", (0.17, 0.19, 0.56), (x, 0, 0.33), m_pan, 0.05, ebeveyn=k.kok)
            kutu(f"{ad}_ayak{i}", (0.18, 0.27, 0.1), (x, -0.04, 0.05), m_ayk, 0.04, ebeveyn=k.kok)
    k.govde_pivot = bos(f"{ad}_bel", (0, 0, kalca_z), k.kok)
    k.govde = kutu(f"{ad}_govde", (0.5, 0.32, 0.6), (0, 0, 0.3), m_gom, 0.08, ebeveyn=k.govde_pivot)
    if onluk:
        m_onl = mat(f"onluk_{onluk}", onluk, 0.7, sheen=0.5)
        kutu(f"{ad}_onluk", (0.44, 0.03, 0.62 if not oturan else 0.5), (0, -0.17, 0.2), m_onl, 0.015,
             ebeveyn=k.govde_pivot)
        kutu(f"{ad}_onluk_cep", (0.2, 0.035, 0.1), (0, -0.18, 0.12), m_onl, 0.012, ebeveyn=k.govde_pivot)
        for x in (-0.13, 0.13):
            kutu(f"{ad}_askı", (0.05, 0.33, 0.02), (x, 0, 0.6), m_onl, 0.008, ebeveyn=k.govde_pivot)
        k.onluk_mat = m_onl

    m_eld = mat(f"eldiven_{eldiven}", eldiven, 0.35, coat=0.3) if eldiven else m_ten
    m_kol = mat(f"kol_{kol_renk}", kol_renk, 0.75, sheen=0.4) if kol_renk else m_ten
    # --- Kollar: omuz → dirsek → el (pivotlar eklemde, kol aşağı sarkar)
    k.omuz, k.dirsek, k.el = {}, {}, {}
    for t, x in (("L", -0.31), ("R", 0.31)):
        om = bos(f"{ad}_omuz{t}", (x, 0, 0.52), k.govde_pivot)
        kutu(f"{ad}_ustkol{t}", (0.14, 0.15, 0.3), (0, 0, 0), m_gom, 0.05, ebeveyn=om, koken=(0, 0, 1))
        dr = bos(f"{ad}_dirsek{t}", (0, 0, -0.28), om)
        kutu(f"{ad}_onkol{t}", (0.125, 0.13, 0.25), (0, 0, 0), m_kol, 0.045, ebeveyn=dr, koken=(0, 0, 1))
        el = bos(f"{ad}_el{t}", (0, 0, -0.26), dr)
        kutu(f"{ad}_elk{t}", (0.13, 0.12, 0.12), (0, 0, -0.04), m_eld, 0.04, ebeveyn=el)
        k.omuz[t], k.dirsek[t], k.el[t] = om, dr, el

    # --- Kafa (pivot boyunda); yüz −Y yönüne bakar
    k.kafa_pivot = bos(f"{ad}_boyun", (0, 0, 0.6), k.govde_pivot)
    H = 0.56  # kafa ölçüsü
    k.kafa = kutu(f"{ad}_kafa", (0.6, 0.54, H), (0, 0, H / 2 + 0.02), m_ten, 0.1, seg=4, ebeveyn=k.kafa_pivot)
    yz = -0.27  # yüz düzlemi
    gz = H * 0.55  # göz yüksekliği
    kp = k.kafa_pivot
    kutu(f"{ad}_burun", (0.07, 0.05, 0.06), (0, yz - 0.015, gz - 0.09), m_ten, 0.025, ebeveyn=kp)
    for x in (-0.31, 0.31):
        kutu(f"{ad}_kulak", (0.06, 0.1, 0.13), (x, 0.02, gz - 0.03), m_ten, 0.03, ebeveyn=kp)

    # Gözler + parlama + göz kapağı (pivot üstte; ölçek z 0→açık, 1→kapalı)
    k.goz, k.kapak, k.kapali = {}, {}, {}
    for t, x in (("L", -0.12), ("R", 0.12)):
        g = kutu(f"{ad}_goz{t}", (0.095, 0.03, 0.13), (x, yz + 0.004, gz), m_goz, 0.032, ebeveyn=kp)
        kutu(f"{ad}_parla{t}", (0.028, 0.01, 0.028), (0.02, -0.016, 0.032), m_parla, 0.008, ebeveyn=g)
        # göz pivotu ortada: ölçek z ile kırpma; parlama da birlikte ezilir
        gp = bos(f"{ad}_gozp{t}", (x, yz, gz), kp)
        g.parent, g.location = gp, (0, 0.004, 0)
        kapali = yay(f"{ad}_kapali{t}", 0.05, 120, 0.022, 0.02, (x, yz - 0.004, gz + (0.025 if maske else -0.02)), m_goz, kp, ters=True)
        kapali.scale = (0.0001,) * 3
        k.goz[t], k.kapak[t], k.kapali[t] = g, gp, kapali
        if kirpik:
            dis = -1 if t == "L" else 1   # dış köşe
            kutu(f"{ad}_kirpik{t}", (0.035, 0.02, 0.016), (dis * 0.05, -0.012, 0.055), m_kas, 0.005, ebeveyn=g,
                 rot=(0, -dis * 35, 0))

    # Kaşlar (z ekseni değil, yüz düzleminde döner: Y ekseni)
    k.kas = {}
    for t, x in (("L", -0.13), ("R", 0.13)):
        k.kas[t] = kutu(f"{ad}_kas{t}", (0.13, 0.035, 0.038), (x, yz - 0.005, gz + 0.115), m_kas, 0.012, ebeveyn=kp)

    # Ağız şekilleri (aynı yerde, ölçekle değişir)
    az = gz - 0.165
    k.agiz = {}
    k.agiz["normal"] = yay(f"{ad}_agiz_n", 0.09, 50, 0.022, 0.02, (0, yz - 0.004, az + 0.012), m_agiz, kp)
    k.agiz["gulumse"] = yay(f"{ad}_agiz_g", 0.075, 110, 0.026, 0.02, (0, yz - 0.004, az + 0.005), m_agiz, kp)
    k.agiz["uzgun"] = yay(f"{ad}_agiz_u", 0.07, 80, 0.024, 0.02, (0, yz - 0.008, az + 0.02), m_agiz, kp, ters=True)
    acik = kutu(f"{ad}_agiz_a", (0.1, 0.02, 0.07), (0, yz, az + 0.01), m_agiz, 0.03, ebeveyn=kp)
    kutu(f"{ad}_dil", (0.06, 0.01, 0.025), (0, -0.012, -0.018), m_dil, 0.01, ebeveyn=acik)
    k.agiz["acik"] = acik
    # Kocaman gülüş: açık ağızlı yarım ay
    k.agiz["kahkaha"] = yay(f"{ad}_agiz_k", 0.07, 160, 0.06, 0.02, (0, yz - 0.002, az + 0.03), m_agiz, kp)

    # Yanaklar (rahatlama) + ter damlası (stres)
    k.yanak = [kutu(f"{ad}_yanak{t}", (0.08, 0.008, 0.04), (x, yz - 0.006, gz - 0.105), m_yanak, 0.018, ebeveyn=kp)
               for t, x in (("L", -0.2), ("R", 0.2))]
    k.ter = kure(f"{ad}_ter", 0.045, (0.33, yz + 0.05, gz + 0.1), m_ter, 14, kp, olcek=(0.8, 0.6, 1.3))
    kure(f"{ad}_ter_uc", 0.026, (0, 0, 0.045), m_ter, 10, k.ter, olcek=(0.7, 0.7, 1.5))

    # Saç / sakal / maske / bone
    if sac_tip in ("kisa", "kabarik"):
        kutu(f"{ad}_sac", (0.64, 0.58, 0.12), (0, 0.01, H + 0.04), m_sac, 0.05, ebeveyn=kp)
        kutu(f"{ad}_sac_arka", (0.64, 0.14, 0.42), (0, 0.22, H * 0.68), m_sac, 0.05, ebeveyn=kp)
        kutu(f"{ad}_favori", (0.63, 0.4, 0.16), (0, 0.06, H * 0.78), m_sac, 0.04, ebeveyn=kp)
        kutu(f"{ad}_perçem", (0.38, 0.2, 0.12 if sac_tip == "kisa" else 0.18), (0.06, -0.17, H + 0.08), m_sac,
             0.05, ebeveyn=kp, rot=(12, 0, -6))
    elif sac_tip == "uzun":
        kutu(f"{ad}_sac", (0.66, 0.6, 0.14), (0, 0.01, H + 0.04), m_sac, 0.06, ebeveyn=kp)
        kutu(f"{ad}_sac_arka", (0.68, 0.2, 0.75), (0, 0.22, H * 0.38), m_sac, 0.06, ebeveyn=kp)
        for x in (-0.33, 0.33):
            kutu(f"{ad}_sac_yan", (0.08, 0.44, 0.62), (x, 0.03, H * 0.45), m_sac, 0.04, ebeveyn=kp)
        kutu(f"{ad}_kakul", (0.6, 0.1, 0.12), (0.04, -0.25, H - 0.02), m_sac, 0.05, ebeveyn=kp, rot=(0, -8, 0))
    elif sac_tip == "topuz":
        kutu(f"{ad}_sac", (0.66, 0.6, 0.14), (0, 0.01, H + 0.04), m_sac, 0.06, ebeveyn=kp)
        kutu(f"{ad}_sac_arka", (0.66, 0.16, 0.48), (0, 0.22, H * 0.62), m_sac, 0.06, ebeveyn=kp)
        for x in (-0.33, 0.33):
            kutu(f"{ad}_sac_yan", (0.07, 0.42, 0.34), (x, 0.03, H * 0.66), m_sac, 0.03, ebeveyn=kp)
        kure(f"{ad}_topuz", 0.15, (0, 0.12, H + 0.17), m_sac, 12, kp)
        kutu(f"{ad}_kakul", (0.62, 0.1, 0.1), (0, -0.25, H - 0.0), m_sac, 0.045, ebeveyn=kp)
    if sakal:
        kutu(f"{ad}_sakal", (0.62, 0.3, 0.17), (0, -0.12, 0.07), m_sac, 0.07, ebeveyn=kp)
        for x in (-0.28, 0.28):
            kutu(f"{ad}_sakal_yan", (0.07, 0.34, 0.26), (x, -0.04, 0.17), m_sac, 0.03, ebeveyn=kp)
        kutu(f"{ad}_biyik", (0.22, 0.04, 0.035), (0, yz - 0.012, az + 0.065), m_sac, 0.015, ebeveyn=kp)
    if maske:
        m_mas = mat("maske", "#9ec9e6", 0.85, sheen=0.4)
        kutu(f"{ad}_maske", (0.54, 0.07, 0.25), (0, yz - 0.02, az + 0.05), m_mas, 0.04, ebeveyn=kp)
        for i in range(3):
            kutu(f"{ad}_maske_pli{i}", (0.5, 0.075, 0.008), (0, yz - 0.022, az + 0.0 + i * 0.05), mat("maske_pli", "#86b6d8", 0.9), 0.003, ebeveyn=kp)
        for x in (-0.3, 0.3):
            kutu(f"{ad}_maske_ip", (0.012, 0.36, 0.012), (x, -0.06, az + 0.08), m_mas, 0.004, ebeveyn=kp)
        for a in k.agiz.values():
            a.hide_render = a.hide_viewport = True
    if bone:
        m_bon = mat(f"bone_{bone}", bone, 0.85, sheen=0.4)
        kutu(f"{ad}_bone", (0.66, 0.6, 0.18), (0, 0.01, H + 0.06), m_bon, 0.07, ebeveyn=kp)

    k.ifadeler = {}
    k.oturan = oturan
    k.maske = maske
    ifade(k, 1, "normal")
    return k


# ---------------------------------------------------------------- ifadeler

IFADE = {
    # kas: iç uç yukarı (+) derece, kas_z: kaş yüksekliği, goz: göz dikey ölçeği (L, R; 0 → kapalı yay)
    "normal":   dict(kas=0, kas_z=0.0, agiz="normal", yanak=False, ter=False, goz=(1, 1)),
    "stres":    dict(kas=24, kas_z=0.025, agiz="uzgun", yanak=False, ter=True, goz=(1.08, 1.08)),
    "endise":   dict(kas=18, kas_z=0.02, agiz="acik", yanak=False, ter=True, goz=(1.1, 1.1)),
    "sasir":    dict(kas=-4, kas_z=0.04, agiz="acik", yanak=False, ter=False, goz=(1.15, 1.15)),
    "rahat":    dict(kas=-6, kas_z=0.0, agiz="gulumse", yanak=True, ter=False, goz=(0.8, 0.8)),
    "gulumse":  dict(kas=-6, kas_z=0.01, agiz="gulumse", yanak=True, ter=False, goz=(1, 1)),
    "mutlu":    dict(kas=-8, kas_z=0.02, agiz="kahkaha", yanak=True, ter=False, goz=(0, 0)),
    "kahkaha":  dict(kas=-8, kas_z=0.02, agiz="kahkaha", yanak=True, ter=False, goz=(0.85, 0.85)),
    "goz_kirp": dict(kas=-10, kas_z=0.0, agiz="gulumse", yanak=True, ter=False, goz=(1, 0)),
    "uykulu":   dict(kas=0, kas_z=-0.01, agiz="normal", yanak=False, ter=False, goz=(0.45, 0.45)),
}


def ifade(k, kare, ad, gecis=4):
    """kare anında ad ifadesine geçer (gecis kare sürede yumuşak)."""
    s = IFADE[ad]
    bas = max(1, kare - gecis)
    onceki = k.ifadeler.get("son")
    for i, t in enumerate(("L", "R")):
        kas, gp = k.kas[t], k.kapak[t]
        if "_z0" not in kas:
            kas["_z0"] = kas.location.z
        isaret = -1 if t == "L" else 1  # iç uç yukarı = pozitif açı
        adimlar = [(kare, s)]
        if onceki is not None and bas < kare:
            adimlar.insert(0, (bas, IFADE[onceki]))
        for f, d in adimlar:
            kas.rotation_euler.y = R(d["kas"]) * isaret
            kas.location.z = kas["_z0"] + d["kas_z"]
            kas.keyframe_insert("rotation_euler", index=1, frame=f)
            kas.keyframe_insert("location", index=2, frame=f)
            gp.scale.z = max(0.0001, d["goz"][i])
            gp.keyframe_insert("scale", index=2, frame=f)
        _olcek_gecis(k.kapali[t], kare, 1.0 if s["goz"][i] == 0 else 0.0001, min(gecis, 2))
    k.ifadeler["son"] = ad
    for adi, o in k.agiz.items():
        hedef = 1.0 if (adi == s["agiz"] and not k.maske) else 0.0001
        _olcek_gecis(o, kare, hedef, gecis)
    for y in k.yanak:
        _olcek_gecis(y, kare, 1.0 if s["yanak"] else 0.0001, gecis)
    _olcek_gecis(k.ter, kare, 1.0 if s["ter"] else 0.0001, gecis + 2)


def _olcek_gecis(o, kare, hedef, gecis):
    if "_s0" not in o:
        o["_s0"] = list(o.scale) if min(o.scale) > 0.001 else [1, 1, 1]
    s0 = Vector(o["_s0"])
    onceki = o.get("_hedef", None)
    if onceki is None:  # ilk anahtar
        o.scale = s0 * hedef
        o.keyframe_insert("scale", frame=max(1, kare))
    else:
        o.scale = s0 * onceki
        o.keyframe_insert("scale", frame=max(1, kare - gecis))
        o.scale = s0 * hedef
        o.keyframe_insert("scale", frame=kare)
    o["_hedef"] = hedef


def kirp(k, kare):
    """Doğal göz kırpma: göz 3 karede ezilir, 3 karede açılır."""
    d = IFADE[k.ifadeler.get("son", "normal")]
    for i, t in enumerate(("L", "R")):
        gp = k.kapak[t]
        acik = max(0.0001, d["goz"][i])
        for f, z in ((kare - 3, acik), (kare, 0.08), (kare + 3, acik)):
            gp.scale.z = z
            gp.keyframe_insert("scale", index=2, frame=f)


def bak_yon(k, kare, sag=0.0, asagi=0.0, egik=0.0, gecis=8):
    """Kafa yönü: sag (+ sağa döner), asagi (+ aşağı bakar), egik (yana yatma) derece."""
    p = k.kafa_pivot
    if "_son" not in p:
        p["_son"] = [0.0, 0.0, 0.0]
        p.rotation_euler = (0, 0, 0)
        p.keyframe_insert("rotation_euler", frame=1)
    son = p["_son"]
    p.rotation_euler = [R(a) for a in son]
    p.keyframe_insert("rotation_euler", frame=max(1, kare - gecis))
    yeni = [asagi, egik, sag]
    p.rotation_euler = [R(a) for a in yeni]
    p.keyframe_insert("rotation_euler", frame=kare)
    p["_son"] = yeni


def kol_poz(k, kare, sag=None, sol=None, gecis=8):
    """sag/sol = (omuz_x, omuz_y, omuz_z, dirsek_x) derece. "L" = karakterin sağ eli (izleyicinin solu)."""
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


def goz_kay(k, kare, x=0.0, z=0.0, gecis=4):
    """Göz bebeklerini kaydırır (x: + izleyicinin sağı, z: + yukarı), metre (±0.025 civarı)."""
    for t in ("L", "R"):
        g = k.goz[t]
        if "_son" not in g:
            g["_son"] = [0.0, 0.0]
            g.location.x, g.location.z = 0, 0
            g.keyframe_insert("location", frame=1)
        g.location.x, g.location.z = g["_son"]
        g.keyframe_insert("location", frame=max(1, kare - gecis))
        g.location.x, g.location.z = x, z
        g.keyframe_insert("location", frame=kare)
        g["_son"] = [x, z]


def egil(k, kare, ileri=0.0, yana=0.0, gecis=10):
    """Gövdeyi belden eğer (ileri + öne), derece."""
    p = k.govde_pivot
    if "_son" not in p:
        p["_son"] = [0.0, 0.0]
        p.rotation_euler = (0, 0, 0)
        p.keyframe_insert("rotation_euler", frame=1)
    a, b = p["_son"]
    p.rotation_euler = (R(a), R(b), 0)
    p.keyframe_insert("rotation_euler", frame=max(1, kare - gecis))
    p.rotation_euler = (R(ileri), R(yana), 0)
    p.keyframe_insert("rotation_euler", frame=kare)
    p["_son"] = [ileri, yana]
