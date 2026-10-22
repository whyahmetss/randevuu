"""Karakter v2: gerçek insan oranlarında köşeli karakter (kafa ≈ boyun 1/7'si) + okunur yüz.

Referans: neolurdulabs Reels'lerindeki ince, uzun bacaklı köşeli insanlar; farkımız göz (akı + iris + parlama),
kaş, burun ve ağız. v1 (karakter.py) ile aynı arayüz: ifade(), kirp(), bak_yon(), goz_kay(), egil(), kol_poz(),
kol_hedef() bu karakterle de çalışır (yüz ölçeği `yuz_olcek` ile).

Hiyerarşi (kök ayaklarda, yüz −Y):
  kök → kalca_L/R → diz → ayak ;  govde_pivot (kalçada) → bel, göğüs, omuz_L/R → dirsek → el ; kafa_pivot → kafa, yüz
"""
from temel import kutu, kure, yay, bos, mat, isik_mat, silindir, R, RENK
import karakter as K1


class Karakter:
    pass


def karakter(ad, konum=(0, 0, 0), yon=0, ten=RENK["ten"], sac="#2a1c14", sac_tip="kisa", biyik=False, sakal=False,
             gomlek="#e9e4da", uzun_kol=False, pantolon="#2b2f36", ayakkabi="#1c1714", onluk=None, kemer="#2a2016",
             goz_renk="#3a2416", oturan=False, olcek=1.0, kirpik=False, gozluk=False):
    k = Karakter()
    k.ad, k.yuz_olcek, k.maske, k.oturan, k.ifadeler = ad, 0.42, False, oturan, {}
    k.kok = bos(ad, konum, rot=(0, 0, yon))
    k.kok.scale = (olcek,) * 3
    m_ten = mat(f"v2ten_{ten}", ten, 0.5, sheen=0.25)
    m_sac = mat(f"v2sac_{sac}", sac, 0.65)
    m_gom = mat(f"v2gom_{gomlek}", gomlek, 0.72, sheen=0.4)
    m_pan = mat(f"v2pan_{pantolon}", pantolon, 0.78)
    m_ayk = mat(f"v2ayk_{ayakkabi}", ayakkabi, 0.35, coat=0.4)
    m_kem = mat(f"v2kem_{kemer}", kemer, 0.4, coat=0.3)
    m_ak = mat("v2goz_ak", "#f3efe9", 0.25, coat=0.6)
    m_iris = mat(f"v2iris_{goz_renk}", goz_renk, 0.1, coat=1.0)
    m_parla = isik_mat("v2parla", "#ffffff", 5.0)
    m_dudak = mat("v2dudak", "#7e3f38", 0.45)
    m_agiz = mat("v2agiz_ic", "#3b1416", 0.6)
    m_yanak = mat("v2yanak", "#e58b7a", 0.6, alfa=0.7)
    m_ter = mat("ter", "#8fd0ff", 0.05, emis="#bfe6ff", emis_guc=0.6, coat=1)

    # --- Bacaklar: kalça → diz → ayak
    KZ = 0.9
    k.kalca, k.diz, k.ayak = {}, {}, {}
    for t, x in (("L", -0.09), ("R", 0.09)):
        kp = bos(f"{ad}_kalca{t}", (x, 0, KZ), k.kok)
        kutu(f"{ad}_uyluk{t}", (0.145, 0.16, 0.44), (0, 0, 0), m_pan, 0.03, ebeveyn=kp, koken=(0, 0, 1))
        dz = bos(f"{ad}_diz{t}", (0, 0, -0.44), kp)
        kutu(f"{ad}_baldir{t}", (0.125, 0.14, 0.4), (0, 0, 0), m_pan, 0.03, ebeveyn=dz, koken=(0, 0, 1))
        ay = bos(f"{ad}_ayak{t}", (0, 0, -0.4), dz)
        kutu(f"{ad}_ayakkabi{t}", (0.12, 0.27, 0.075), (0, -0.05, -0.03), m_ayk, 0.025, ebeveyn=ay)
        k.kalca[t], k.diz[t], k.ayak[t] = kp, dz, ay
    if oturan:
        for t in ("L", "R"):
            k.kalca[t].rotation_euler.x = R(-88)
            k.diz[t].rotation_euler.x = R(88)

    # --- Gövde (kalçada pivot): leğen, bel, göğüs, kemer, yaka
    k.govde_pivot = bos(f"{ad}_bel", (0, 0, KZ), k.kok)
    gp = k.govde_pivot
    kutu(f"{ad}_legen", (0.34, 0.2, 0.17), (0, 0, 0.06), m_pan, 0.03, ebeveyn=gp)
    kutu(f"{ad}_kemer", (0.345, 0.205, 0.035), (0, 0, 0.15), m_kem, 0.008, ebeveyn=gp)
    kutu(f"{ad}_kemer_toka", (0.05, 0.01, 0.03), (0, -0.105, 0.15), mat("toka", "#b9a26a", 0.25, metal=0.8), 0.004,
         ebeveyn=gp)
    k.govde = kutu(f"{ad}_karin", (0.32, 0.19, 0.22), (0, 0, 0.27), m_gom, 0.035, ebeveyn=gp)
    kutu(f"{ad}_gogus", (0.39, 0.22, 0.27), (0, 0, 0.48), m_gom, 0.045, ebeveyn=gp)
    kutu(f"{ad}_yaka", (0.15, 0.13, 0.03), (0, -0.01, 0.62), m_gom, 0.012, ebeveyn=gp)
    if onluk:
        m_onl = mat(f"v2onl_{onluk}", onluk, 0.7, sheen=0.5)
        kutu(f"{ad}_onluk", (0.3, 0.018, 0.78), (0, -0.118, 0.17), m_onl, 0.012, ebeveyn=gp)
        kutu(f"{ad}_onluk_cep", (0.17, 0.02, 0.09), (0, -0.126, 0.16), m_onl, 0.008, ebeveyn=gp)
        for x in (-0.1, 0.1):
            kutu(f"{ad}_onluk_aski", (0.035, 0.24, 0.015), (x, -0.01, 0.62), m_onl, 0.005, ebeveyn=gp)
        kutu(f"{ad}_onluk_bag", (0.36, 0.2, 0.02), (0, 0.005, 0.2), m_onl, 0.006, ebeveyn=gp)
        k.onluk_mat = m_onl

    # --- Kollar: omuz → dirsek → el (avuç + başparmak)
    k.omuz, k.dirsek, k.el = {}, {}, {}
    m_onkol = m_gom if uzun_kol else m_ten
    for t, x, s in (("L", -0.235, -1), ("R", 0.235, 1)):
        om = bos(f"{ad}_omuz{t}", (x, 0, 0.57), gp)
        kutu(f"{ad}_ustkol{t}", (0.095, 0.105, 0.3), (0, 0, 0.02), m_gom, 0.03, ebeveyn=om, koken=(0, 0, 1))
        dr = bos(f"{ad}_dirsek{t}", (0, 0, -0.29), om)
        kutu(f"{ad}_onkol{t}", (0.08, 0.088, 0.25), (0, 0, 0), m_onkol, 0.028, ebeveyn=dr, koken=(0, 0, 1))
        el = bos(f"{ad}_el{t}", (0, 0, -0.25), dr)
        kutu(f"{ad}_avuc{t}", (0.07, 0.042, 0.1), (0, 0, -0.05), m_ten, 0.016, ebeveyn=el)
        kutu(f"{ad}_basparmak{t}", (0.022, 0.026, 0.05), (-s * 0.035, -0.012, -0.03), m_ten, 0.009, ebeveyn=el,
             rot=(0, s * 20, 0))
        k.omuz[t], k.dirsek[t], k.el[t] = om, dr, el

    # --- Boyun + kafa (yüz −Y)
    k.kafa_pivot = bos(f"{ad}_boyun", (0, 0, 0.62), gp)
    kp = k.kafa_pivot
    kutu(f"{ad}_boyun_m", (0.1, 0.1, 0.09), (0, 0.005, 0.03), m_ten, 0.02, ebeveyn=kp)
    k.kafa = kutu(f"{ad}_kafa", (0.21, 0.23, 0.25), (0, 0, 0.195), m_ten, 0.035, seg=3, ebeveyn=kp)
    kutu(f"{ad}_cene", (0.17, 0.2, 0.05), (0, -0.005, 0.085), m_ten, 0.025, ebeveyn=kp)
    yz, gz = -0.115, 0.205
    for x in (-0.106, 0.106):
        kutu(f"{ad}_kulak", (0.02, 0.045, 0.06), (x, 0.01, 0.19), m_ten, 0.01, ebeveyn=kp)
    kutu(f"{ad}_burun", (0.03, 0.03, 0.046), (0, yz - 0.01, 0.172), m_ten, 0.011, ebeveyn=kp, rot=(-8, 0, 0))

    # Gözler: ak + iris (göz kayması iris'i oynatır) + parlama; pivot ölçeğiyle kırpma; kapalı göz yayı
    k.goz, k.kapak, k.kapali = {}, {}, {}
    for t, x in (("L", -0.047), ("R", 0.047)):
        gpv = bos(f"{ad}_gozp{t}", (x, yz, gz), kp)
        kutu(f"{ad}_gozak{t}", (0.044, 0.008, 0.024), (0, -0.001, 0), m_ak, 0.006, ebeveyn=gpv)
        g = kutu(f"{ad}_iris{t}", (0.021, 0.008, 0.023), (0, -0.004, 0), m_iris, 0.006, ebeveyn=gpv)
        kutu(f"{ad}_parla{t}", (0.006, 0.004, 0.006), (0.005, -0.006, 0.006), m_parla, 0.001, ebeveyn=g)
        kapali = yay(f"{ad}_kapali{t}", 0.022, 120, 0.007, 0.008, (x, yz - 0.005, gz - 0.006), m_iris, kp, ters=True)
        kapali.scale = (0.0001,) * 3
        k.goz[t], k.kapak[t], k.kapali[t] = g, gpv, kapali
        if kirpik:
            dis = -1 if t == "L" else 1
            kutu(f"{ad}_kirpik{t}", (0.018, 0.006, 0.006), (dis * 0.024, -0.005, 0.012), m_sac, 0.002,
                 ebeveyn=gpv, rot=(0, -dis * 30, 0))
    k.kas = {}
    for t, x in (("L", -0.05), ("R", 0.05)):
        k.kas[t] = kutu(f"{ad}_kas{t}", (0.054, 0.012, 0.012), (x, yz - 0.004, gz + 0.03), m_sac, 0.004, ebeveyn=kp)

    # Ağız şekilleri (dudak renginde; aynı yerde ölçekle değişir)
    az = 0.124
    k.agiz = {}
    k.agiz["normal"] = yay(f"{ad}_agiz_n", 0.036, 50, 0.008, 0.008, (0, yz - 0.004, az + 0.004), m_dudak, kp)
    k.agiz["gulumse"] = yay(f"{ad}_agiz_g", 0.03, 105, 0.009, 0.008, (0, yz - 0.004, az + 0.0), m_dudak, kp)
    k.agiz["uzgun"] = yay(f"{ad}_agiz_u", 0.028, 80, 0.009, 0.008, (0, yz - 0.004, az + 0.012), m_dudak, kp, ters=True)
    acik = kutu(f"{ad}_agiz_a", (0.038, 0.008, 0.026), (0, yz - 0.001, az), m_agiz, 0.009, ebeveyn=kp)
    k.agiz["acik"] = acik
    k.agiz["kahkaha"] = yay(f"{ad}_agiz_k", 0.028, 160, 0.022, 0.008, (0, yz - 0.002, az + 0.006), m_agiz, kp)
    k.yanak = [kutu(f"{ad}_yanak{t}", (0.03, 0.004, 0.014), (x, yz - 0.002, 0.165), m_yanak, 0.006, ebeveyn=kp)
               for t, x in (("L", -0.07), ("R", 0.07))]
    k.ter = kure(f"{ad}_ter", 0.014, (0.1, yz + 0.03, 0.25), m_ter, 12, kp, olcek=(0.8, 0.6, 1.3))

    # Saç / yüz kılı / gözlük
    H = 0.32   # kafa üstü
    if sac_tip in ("kisa", "kabarik"):
        kutu(f"{ad}_sac", (0.225, 0.245, 0.05 if sac_tip == "kisa" else 0.08), (0, 0.005, H + 0.012), m_sac, 0.02,
             ebeveyn=kp)
        kutu(f"{ad}_sac_arka", (0.225, 0.06, 0.17), (0, 0.1, 0.25), m_sac, 0.02, ebeveyn=kp)
        for x in (-0.109, 0.109):
            kutu(f"{ad}_favori", (0.014, 0.16, 0.09), (x, 0.03, 0.265), m_sac, 0.006, ebeveyn=kp)
        kutu(f"{ad}_percem", (0.17, 0.05, 0.035), (0.01, -0.105, H + 0.005), m_sac, 0.014, ebeveyn=kp, rot=(8, 0, -4))
    elif sac_tip == "uzun":
        kutu(f"{ad}_sac", (0.23, 0.25, 0.055), (0, 0.005, H + 0.014), m_sac, 0.022, ebeveyn=kp)
        kutu(f"{ad}_sac_arka", (0.24, 0.07, 0.38), (0, 0.1, 0.14), m_sac, 0.022, ebeveyn=kp)
        for x in (-0.115, 0.115):
            kutu(f"{ad}_sac_yan", (0.025, 0.15, 0.27), (x, 0.02, 0.18), m_sac, 0.01, ebeveyn=kp)
        kutu(f"{ad}_kakul", (0.2, 0.03, 0.04), (0.01, -0.112, H - 0.01), m_sac, 0.012, ebeveyn=kp, rot=(0, -6, 0))
    elif sac_tip == "topuz":
        kutu(f"{ad}_sac", (0.23, 0.25, 0.05), (0, 0.005, H + 0.012), m_sac, 0.02, ebeveyn=kp)
        kutu(f"{ad}_sac_arka", (0.23, 0.06, 0.2), (0, 0.1, 0.24), m_sac, 0.02, ebeveyn=kp)
        for x in (-0.112, 0.112):
            kutu(f"{ad}_sac_yan", (0.02, 0.14, 0.12), (x, 0.02, 0.25), m_sac, 0.008, ebeveyn=kp)
        kure(f"{ad}_topuz", 0.055, (0, 0.08, H + 0.05), m_sac, 12, kp)
        kutu(f"{ad}_kakul", (0.2, 0.03, 0.035), (0, -0.112, H - 0.005), m_sac, 0.012, ebeveyn=kp)
    if biyik:
        kutu(f"{ad}_biyik", (0.07, 0.012, 0.013), (0, yz - 0.006, az + 0.027), m_sac, 0.005, ebeveyn=kp)
    if sakal:
        kutu(f"{ad}_sakal", (0.19, 0.13, 0.055), (0, -0.045, 0.085), m_sac, 0.022, ebeveyn=kp)
        for x in (-0.1, 0.1):
            kutu(f"{ad}_sakal_yan", (0.022, 0.13, 0.1), (x, -0.01, 0.13), m_sac, 0.008, ebeveyn=kp)
    if gozluk:
        m_cer = mat("gozluk_cerceve", "#1a1a1a", 0.3, coat=0.5)
        for x in (-0.047, 0.047):
            kutu(f"{ad}_gozluk_ust", (0.056, 0.006, 0.006), (x, yz - 0.016, gz + 0.02), m_cer, 0.002, ebeveyn=kp)
            kutu(f"{ad}_gozluk_alt", (0.056, 0.006, 0.005), (x, yz - 0.016, gz - 0.02), m_cer, 0.002, ebeveyn=kp)
            for dx in (-0.028, 0.028):
                kutu(f"{ad}_gozluk_yan", (0.005, 0.006, 0.045), (x + dx, yz - 0.016, gz), m_cer, 0.002, ebeveyn=kp)
        kutu(f"{ad}_gozluk_kopru", (0.04, 0.006, 0.005), (0, yz - 0.016, gz + 0.012), m_cer, 0.002, ebeveyn=kp)

    K1.ifade(k, 1, "normal")
    return k


def oturt(k, kare, otur=True, gecis=12):
    """Ayakta ↔ oturur geçişi (kalça ve diz)."""
    for t in ("L", "R"):
        for p, aci in ((k.kalca[t], -88), (k.diz[t], 88)):
            p.keyframe_insert("rotation_euler", index=0, frame=max(1, kare - gecis))
            p.rotation_euler.x = R(aci if otur else 0)
            p.keyframe_insert("rotation_euler", index=0, frame=kare)
