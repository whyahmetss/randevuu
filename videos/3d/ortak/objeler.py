"""Sahne objeleri: telefon, makas, tarak, berber koltuğu, tilki figürü, bitki, şişe, ampul, raf, berber direği…"""
import bpy, math, random
from temel import (kutu, silindir, kure, bos, mat, isik_mat, resim_mat, lin, isik, R, RENK, anahtar)

# Telefon: 1080×2340 ekran oranı (0.4615). Karakterlere göre ~%30 büyük (sevimli ölçek).
TEL_G, TEL_Y, TEL_K = 0.105, 0.222, 0.011


def telefon(ad, loc, rot=(0, 0, 0), ekran_yolu=None, dizi=None, ebeveyn=None, parlaklik=1.0):
    """Ekran yukarı (+Z) bakan telefon. Pivot gövde ortasında. ekran_yolu + dizi=(kare_sayisi, 1) → PNG dizisi."""
    kok = bos(ad, loc, ebeveyn, rot)
    m_govde = mat("tel_govde", "#1a1c1f", 0.25, metal=0.6)
    m_cerceve = mat("tel_cerceve", "#3a3d42", 0.2, metal=1.0)
    kutu(f"{ad}_govde", (TEL_G, TEL_Y, TEL_K), (0, 0, 0), m_govde, 0.012, seg=4, ebeveyn=kok)
    kutu(f"{ad}_cerceve", (TEL_G + 0.002, TEL_Y + 0.002, TEL_K * 0.55), (0, 0, 0), m_cerceve, 0.012, seg=4,
         ebeveyn=kok)
    kutu(f"{ad}_kamera", (0.03, 0.03, 0.004), (-0.028, -0.07, -TEL_K / 2 - 0.001), m_govde, 0.008, ebeveyn=kok)
    eg, ey = TEL_G * 0.93, TEL_G * 0.93 / 0.4615
    if ekran_yolu:
        m_ekr = resim_mat(f"{ad}_ekran_m", ekran_yolu, emisyon=parlaklik, dizi=dizi)
    else:
        m_ekr = mat("ekran_kapali", "#050607", 0.08, coat=1)
    bpy.ops.mesh.primitive_plane_add(size=1, location=(0, 0, TEL_K / 2 + 0.0004))
    ekran = bpy.context.object
    ekran.name = f"{ad}_ekran"
    ekran.scale = (eg, ey, 1)
    # Plane UV'si zaten 0-1; telefonun "üstü" +Y
    ekran.data.materials.append(m_ekr)
    ekran.parent = kok
    ekran.location = (0, 0, TEL_K / 2 + 0.0004)
    kok["ekran"] = ekran.name
    return kok


def makas(ad, ebeveyn=None, loc=(0, 0, 0), rot=(0, 0, 0), olcek=1.0):
    kok = bos(ad, loc, ebeveyn, rot)
    kok.scale = (olcek,) * 3
    m_krom = mat("makas_krom", "#dfe3e8", 0.22, metal=1.0, coat=0.5)
    m_sap = mat("makas_sap", "#121212", 0.35, coat=0.4)
    agizlar = []
    for i, s in enumerate((1, -1)):
        p = bos(f"{ad}_bicak{i}", (0, 0, 0), kok)
        kutu(f"{ad}_bicakm{i}", (0.03, 0.008, 0.19), (0.006 * s, 0.005 * s, 0.095), m_krom, 0.004, ebeveyn=p)
        kutu(f"{ad}_uc{i}", (0.018, 0.008, 0.04), (0.003 * s, 0.005 * s, 0.2), m_krom, 0.004, ebeveyn=p)
        kutu(f"{ad}_kol{i}", (0.016, 0.008, 0.07), (0.014 * s, 0.005 * s, -0.035), m_sap, 0.004, ebeveyn=p,
             rot=(0, -15 * s, 0))
        tor = bpy.data.meshes.new(f"{ad}_halka{i}")
        import bmesh
        bm = bmesh.new()
        seg, r1, r2 = 16, 0.03, 0.011
        halka = []
        for a in range(seg):
            t = 2 * math.pi * a / seg
            cx, cz = r1 * math.cos(t), r1 * math.sin(t)
            kes = []
            for b in range(6):
                u = 2 * math.pi * b / 6
                rr = r1 + r2 * math.cos(u)
                kes.append(bm.verts.new((rr * math.cos(t), r2 * math.sin(u), rr * math.sin(t))))
            halka.append(kes)
        for a in range(seg):
            for b in range(6):
                bm.faces.new([halka[a][b], halka[(a + 1) % seg][b], halka[(a + 1) % seg][(b + 1) % 6],
                              halka[a][(b + 1) % 6]])
        bm.to_mesh(tor)
        bm.free()
        ho = bpy.data.objects.new(f"{ad}_halka{i}", tor)
        bpy.context.scene.collection.objects.link(ho)
        ho.parent = p
        ho.location = (0.036 * s, 0.005 * s, -0.09)
        tor.materials.append(m_sap)
        for f in tor.polygons:
            f.use_smooth = True
        p.rotation_euler.y = R(8 * s)
        agizlar.append(p)
    kok["agizlar"] = [a.name for a in agizlar]
    return kok


def makas_kes(m, bas, bit, aralik=7, aci=10):
    """Makas açılıp kapanır (bas..bit kareleri)."""
    agizlar = [bpy.data.objects[n] for n in m["agizlar"]]
    f, acik = bas, True
    while f <= bit:
        for i, p in enumerate(agizlar):
            s = 1 if i == 0 else -1
            p.rotation_euler.y = R((aci if acik else 1) * s)
            p.keyframe_insert("rotation_euler", index=1, frame=f)
        acik = not acik
        f += aralik // 2 if not acik else aralik - aralik // 2


def tarak(ad, ebeveyn=None, loc=(0, 0, 0), rot=(0, 0, 0)):
    kok = bos(ad, loc, ebeveyn, rot)
    m = mat("tarak", "#1b1b1d", 0.35)
    kutu(f"{ad}_sirt", (0.012, 0.006, 0.18), (0, 0, 0), m, 0.003, ebeveyn=kok)
    for i in range(14):
        kutu(f"{ad}_dis{i}", (0.022, 0.003, 0.004), (0.016, 0, -0.08 + i * 0.0123), m, 0, ebeveyn=kok)
    return kok


def berber_koltugu(ad, loc, yon=0):
    kok = bos(ad, loc, rot=(0, 0, yon))
    m_krom = mat("krom", RENK["krom"], 0.15, metal=1.0)
    m_deri = mat("deri", RENK["deri_bordo"], 0.38, coat=0.4, sheen=0.2)
    m_siyah = mat("koltuk_siyah", "#141414", 0.35, metal=0.3)
    silindir(f"{ad}_taban", 0.3, 0.05, (0, 0, 0), m_krom, 32, kok, bevel=0.01)
    silindir(f"{ad}_ayak", 0.07, 0.36, (0, 0, 0.05), m_krom, 20, kok)
    silindir(f"{ad}_pompa", 0.11, 0.08, (0, 0, 0.18), m_siyah, 20, kok)
    kutu(f"{ad}_alt", (0.62, 0.6, 0.06), (0, 0, 0.44), m_krom, 0.02, ebeveyn=kok)
    kutu(f"{ad}_oturak", (0.6, 0.6, 0.14), (0, 0, 0.53), m_deri, 0.05, seg=4, ebeveyn=kok)
    kutu(f"{ad}_sirt", (0.6, 0.14, 0.62), (0, 0.29, 0.92), m_deri, 0.05, seg=4, ebeveyn=kok, rot=(-8, 0, 0))
    kutu(f"{ad}_bas", (0.3, 0.1, 0.16), (0, 0.36, 1.33), m_deri, 0.04, seg=3, ebeveyn=kok, rot=(-8, 0, 0))
    silindir(f"{ad}_bas_cubuk", 0.015, 0.14, (0, 0.36, 1.18), m_krom, 10, kok)
    for x in (-0.36, 0.36):
        kutu(f"{ad}_kol", (0.12, 0.6, 0.07), (x, -0.02, 0.8), m_deri, 0.03, ebeveyn=kok)
        kutu(f"{ad}_kol_ayak", (0.05, 0.05, 0.24), (x, -0.25, 0.66), m_krom, 0.015, ebeveyn=kok)
        kutu(f"{ad}_kol_ayak2", (0.05, 0.05, 0.24), (x, 0.2, 0.66), m_krom, 0.015, ebeveyn=kok)
    kutu(f"{ad}_ayaklik", (0.5, 0.16, 0.03), (0, -0.48, 0.2), m_krom, 0.01, ebeveyn=kok)
    kutu(f"{ad}_ayaklik_bag", (0.06, 0.2, 0.03), (0, -0.37, 0.3), m_krom, 0.01, ebeveyn=kok, rot=(-40, 0, 0))
    return kok


def tilki_figur(ad, loc, yon=0, olcek=1.0, ebeveyn=None):
    """Raftaki küçük tilki (Fiko) figürü: turuncu, krem göğüs, yeşil atkı. ~14 cm."""
    kok = bos(ad, loc, ebeveyn, rot=(0, 0, yon))
    kok.scale = (olcek,) * 3
    tur = mat("tilki_tur", "#e46a1f", 0.55, sheen=0.6)
    krem = mat("tilki_krem", "#f6e7d3", 0.6, sheen=0.6)
    kah = mat("tilki_kah", "#4a2618", 0.6)
    yes = mat("tilki_atki", RENK["yesil"], 0.65, sheen=0.4)
    siyah = mat("tilki_goz", "#101010", 0.1, coat=1)
    kutu(f"{ad}_govde", (0.06, 0.05, 0.065), (0, 0, 0.035), tur, 0.015, ebeveyn=kok)
    kutu(f"{ad}_gogus", (0.035, 0.01, 0.045), (0, -0.026, 0.035), krem, 0.008, ebeveyn=kok)
    kutu(f"{ad}_kafa", (0.075, 0.062, 0.06), (0, -0.004, 0.098), tur, 0.016, ebeveyn=kok)
    kutu(f"{ad}_yuz", (0.05, 0.02, 0.03), (0, -0.032, 0.088), krem, 0.008, ebeveyn=kok)
    kutu(f"{ad}_burun", (0.012, 0.012, 0.01), (0, -0.044, 0.094), siyah, 0.004, ebeveyn=kok)
    for x in (-0.017, 0.017):
        kutu(f"{ad}_goz", (0.01, 0.006, 0.014), (x, -0.035, 0.108), siyah, 0.003, ebeveyn=kok)
    for x, s in ((-0.025, 1), (0.025, -1)):
        kutu(f"{ad}_kulak", (0.026, 0.012, 0.04), (x, 0, 0.138), tur, 0.006, ebeveyn=kok, rot=(0, 15 * s, 0))
        kutu(f"{ad}_kulak_uc", (0.016, 0.013, 0.012), (x + 0.004 * s, 0, 0.155), kah, 0.004, ebeveyn=kok,
             rot=(0, 15 * s, 0))
    kutu(f"{ad}_atki", (0.066, 0.056, 0.014), (0, -0.002, 0.07), yes, 0.006, ebeveyn=kok)
    kutu(f"{ad}_atki_uc", (0.016, 0.008, 0.03), (0.018, -0.03, 0.055), yes, 0.004, ebeveyn=kok)
    kutu(f"{ad}_kuyruk", (0.04, 0.07, 0.04), (0.03, 0.035, 0.03), tur, 0.015, ebeveyn=kok, rot=(0, 0, 30))
    kutu(f"{ad}_kuyruk_uc", (0.04, 0.025, 0.04), (0.045, 0.07, 0.03), krem, 0.012, ebeveyn=kok, rot=(0, 0, 30))
    for x in (-0.018, 0.018):
        kutu(f"{ad}_pati", (0.018, 0.022, 0.012), (x, -0.012, 0.006), kah, 0.004, ebeveyn=kok)
    return kok


def bitki(ad, loc, olcek=1.0, saksi="#c9b8a3", tohum=3, yaprak_sayisi=9, ebeveyn=None):
    """Saksıda köşeli yapraklı bitki (marka yeşilleri)."""
    rnd = random.Random(tohum)
    kok = bos(ad, loc, ebeveyn)
    kok.scale = (olcek,) * 3
    m_s = mat(f"saksi_{saksi}", saksi, 0.7)
    m_t = mat("toprak", "#3a2618", 0.9)
    yesiller = [mat("yaprak1", RENK["yesil_koyu"], 0.55, sheen=0.3), mat("yaprak2", "#2a8a57", 0.5, sheen=0.3),
                mat("yaprak3", "#3aa865", 0.5, sheen=0.3)]
    silindir(f"{ad}_saksi", 0.12, 0.2, (0, 0, 0), m_s, 20, kok, r2=0.15, bevel=0.01)
    silindir(f"{ad}_toprak", 0.14, 0.01, (0, 0, 0.19), m_t, 20, kok)
    for i in range(yaprak_sayisi):
        a = 2 * math.pi * i / yaprak_sayisi + rnd.uniform(-0.3, 0.3)
        boy = rnd.uniform(0.25, 0.42)
        egim = rnd.uniform(25, 55)
        p = bos(f"{ad}_sap{i}", (0, 0, 0.2), kok, rot=(egim, 0, math.degrees(a)))
        kutu(f"{ad}_yaprak{i}", (0.1, 0.012, boy), (0, 0, boy / 2), yesiller[i % 3], 0.02, ebeveyn=p,
             rot=(0, 0, rnd.uniform(-20, 20)))
    return kok


def sise(ad, loc, r=0.035, h=0.18, renk="#7a3b2a", kapak="#1a1a1a", ebeveyn=None, cam=False):
    kok = bos(ad, loc, ebeveyn)
    m = mat(f"sise_{renk}_{cam}", renk, 0.15 if cam else 0.35, coat=0.6, transmisyon=0.5 if cam else 0)
    silindir(f"{ad}_g", r, h, (0, 0, 0), m, 16, kok, bevel=0.006)
    silindir(f"{ad}_boyun", r * 0.45, h * 0.18, (0, 0, h), m, 12, kok)
    silindir(f"{ad}_kapak", r * 0.5, h * 0.12, (0, 0, h * 1.18), mat(f"kapak_{kapak}", kapak, 0.3, metal=0.4), 12,
             kok)
    if not cam:
        silindir(f"{ad}_etiket", r * 1.01, h * 0.35, (0, 0, h * 0.3), mat("etiket", "#efe6d6", 0.7), 16, kok)
    return kok


def ampul(ad, loc, kablo=1.2, guc=6.0, isik_guc=12, renk="#ffb46b"):
    """Tavandan sarkan Edison ampul: emisyon + nokta ışık. Arka planda bokeh kaynağı."""
    kok = bos(ad, loc)
    silindir(f"{ad}_kablo", 0.004, kablo, (0, 0, 0.06), mat("kablo", "#111111", 0.5), 6, kok)
    silindir(f"{ad}_duy", 0.022, 0.06, (0, 0, 0.0), mat("duy", "#2b2b2b", 0.3, metal=0.8), 12, kok)
    kure(f"{ad}_cam", 0.05, (0, 0, -0.045), isik_mat(f"ampul_{guc}", renk, guc), 16, kok, olcek=(1, 1, 1.3))
    d = bpy.data.lights.new(f"{ad}_isik", "POINT")
    d.energy, d.color, d.shadow_soft_size = isik_guc, lin(renk)[:3], 0.05
    o = bpy.data.objects.new(f"{ad}_isik", d)
    bpy.context.scene.collection.objects.link(o)
    o.parent = kok
    o.location = (0, 0, -0.1)
    return kok


def raf(ad, loc, gen=1.4, ebeveyn=None, renk=RENK["ahsap"]):
    kok = bos(ad, loc, ebeveyn)
    m = mat(f"raf_{renk}", renk, 0.55)
    kutu(f"{ad}_tahta", (gen, 0.24, 0.035), (0, 0, 0), m, 0.008, ebeveyn=kok)
    m2 = mat("raf_demir", "#222222", 0.4, metal=0.8)
    for x in (-gen / 2 + 0.15, gen / 2 - 0.15):
        kutu(f"{ad}_destek", (0.02, 0.2, 0.12), (x, 0.01, -0.07), m2, 0.004, ebeveyn=kok)
    return kok


def berber_diregi(ad, loc, h=0.7):
    """Kırmızı-beyaz-mavi spiral direk (dalga dokusu ile, döner)."""
    kok = bos(ad, loc)
    m_krom = mat("krom", RENK["krom"], 0.15, metal=1.0)
    m = bpy.data.materials.new("direk")
    m.use_nodes = True
    nt = m.node_tree
    b = nt.nodes["Principled BSDF"]
    tc = nt.nodes.new("ShaderNodeTexCoord")
    mp = nt.nodes.new("ShaderNodeMapping")
    wv = nt.nodes.new("ShaderNodeTexWave")
    wv.wave_type, wv.bands_direction = "BANDS", "DIAGONAL"
    wv.inputs["Scale"].default_value = 3.0
    wv.inputs["Distortion"].default_value = 0
    cr = nt.nodes.new("ShaderNodeValToRGB")
    e = cr.color_ramp
    e.interpolation = "CONSTANT"
    e.elements[0].position, e.elements[0].color = 0.0, lin("#b3202a")
    e.elements[1].position, e.elements[1].color = 0.34, lin("#f4f1ec")
    el = e.elements.new(0.5)
    el.color = lin("#1f4fa8")
    el2 = e.elements.new(0.84)
    el2.color = lin("#f4f1ec")
    nt.links.new(tc.outputs["Object"], mp.inputs["Vector"])
    nt.links.new(mp.outputs["Vector"], wv.inputs["Vector"])
    nt.links.new(wv.outputs["Fac"], cr.inputs["Fac"])
    nt.links.new(cr.outputs["Color"], b.inputs["Base Color"])
    nt.links.new(cr.outputs["Color"], b.inputs["Emission Color"])
    b.inputs["Emission Strength"].default_value = 0.35
    b.inputs["Roughness"].default_value = 0.25
    b.inputs["Coat Weight"].default_value = 1.0
    silindir(f"{ad}_alt", 0.07, 0.06, (0, 0, 0), m_krom, 20, kok)
    d = silindir(f"{ad}_spiral", 0.055, h, (0, 0, 0.06), m, 24, kok)
    silindir(f"{ad}_ust", 0.07, 0.06, (0, 0, h + 0.06), m_krom, 20, kok)
    kure(f"{ad}_tepe", 0.06, (0, 0, h + 0.14), m_krom, 16, kok)
    kok["spiral"] = d.name
    kok["mapping"] = mp.name
    m["mapping"] = mp.name
    return kok, mp


def havlu_yigini(ad, loc, renkler=("#f4f1ec", "#e8e1d6", RENK["yesil_koyu"]), ebeveyn=None):
    kok = bos(ad, loc, ebeveyn)
    for i, r in enumerate(renkler):
        kutu(f"{ad}_{i}", (0.26, 0.2, 0.06), (0, 0, 0.03 + i * 0.062), mat(f"havlu_{r}", r, 0.95, sheen=1.0), 0.025,
             ebeveyn=kok, rot=(0, 0, (i - 1) * 4))
    return kok
