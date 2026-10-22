"""TANITIM (motion graphics) — 3D tipografi + telefon mock-up + süzülen kartlar + logo animasyonu (15 sn, 450 kare)

  blender -b -P tanitim/sahne.py -- --kareler 30,120 --cikti <klasor> [--ornek 32] [--yuzde 50]
  blender -b -P tanitim/sahne.py -- --hepsi [--bas N --bit M]

ZAMAN ÇİZELGESİ (saniye)
  0.0–2.2   3D tipografi: "Telefon / susmuyor mu?" derinlikten uçarak gelir, yeşil ışık üstünden geçer
  2.2–6.2   telefon dönerek gelir; ekranda SıraGO sohbeti; kartlar: "Bugün · 17:00", "Randevunuz Oluşturuldu!"
  6.2–10.2  telefon bir tur döner (whip) → panel; kartlar: hatırlatma, 3 dil, uygulama indirmek yok
  10.2–12.2 3D tipografi: "Senin WhatsApp'ından / cevaplar."
  12.2–15.0 logo: yeşil döşemede tilki + 3D "SıraGO"; altta slogan (2D katman)
"""
import bpy, sys, os, math, glob, random
BURA = os.path.dirname(os.path.abspath(__file__))
KOK = os.path.join(BURA, "..")
sys.path.insert(0, os.path.join(KOK, "ortak"))
import importlib, temel, objeler as O
for m in (temel, O):
    importlib.reload(m)
from temel import *

arg = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
al = lambda ad, vars=None: arg[arg.index(ad) + 1] if ad in arg else vars
s = sn
TOPLAM = 450
sc = sahne_hazirla(TOPLAM, ornek=int(al("--ornek", 48)), gorunum="Khronos PBR Neutral", bakis="None")
sc.render.resolution_percentage = int(al("--yuzde", 100))
dunya("#05090a", 0.08, sis=0.0025, sis_renk="#dfeee5")
FONT = bpy.data.fonts.load(os.path.join(KOK, "ortak", "font", "BricolageGrotesque-ExtraBold.ttf"))


def kolay(o, yol, kareler, ara="BEZIER", easing="AUTO"):
    anahtar(o, yol, kareler)
    for fc in egriler(o):
        if fc.data_path == yol:
            for k in fc.keyframe_points:
                k.interpolation, k.easing = ara, easing


# ------------------------------------------------------------------ STÜDYO: koyu kıvrımlı fon, yeşil kenar ışıkları, bokeh
m_fon = mat("studyo", "#07100c", 0.7)
bpy.ops.mesh.primitive_plane_add(size=1, location=(0, 4, 0))
fon = bpy.context.object
fon.scale = (14, 10, 1)
fon.data.materials.append(m_fon)
kutu("fon_duvar", (14, 0.1, 9), (0, 6.5, 4.5), m_fon, 0)
kutu("fon_zemin", (14, 12, 0.1), (0, 1, -0.05), m_fon, 0)
rnd = random.Random(7)
for i in range(46):   # derinlikte yeşil ve sıcak bokeh noktaları
    renk = "#2bd36a" if i % 3 else "#ffcf94"
    kure(f"bokeh{i}", rnd.uniform(0.02, 0.05), (rnd.uniform(-3.5, 3.5), rnd.uniform(4.5, 6.2), rnd.uniform(0.3, 4.2)),
         isik_mat(f"bokeh_m{i % 3}", renk, 4.0 if i % 3 else 3.0), 10)
isik("ana", "AREA", (-2.2, -3.0, 3.2), (0, 0, 1.4), 230, "#fff1e2", 2.6)
isik("dolgu", "AREA", (2.4, -3.2, 1.2), (0, 0, 1.4), 90, "#c8dcff", 3.0)
for x in (-2.6, 2.6):
    isik(f"kenar{x}", "AREA", (x, 1.2, 2.2), (0, 0, 1.4), 160, "#2bd36a", 0.6)
isik("tepe", "AREA", (0, 0.5, 4.5), (0, 0, 1.2), 90, "#eef6f0", 3.0)
supur = isik("supurme", "AREA", (-3, -1.2, 2.0), (0, 0, 1.4), 0, "#bff5d2", 0.4, boyut_y=3.0)
for f, x, e in ((s(0.6), -2.6, 0), (s(0.7), -2.6, 900), (s(1.6), 2.6, 900), (s(1.7), 2.6, 0),
                (s(13.0), -2.6, 0), (s(13.1), -2.6, 280), (s(13.9), 2.6, 280), (s(14.0), 2.6, 0)):
    supur.location.x, supur.data.energy = x, e
    supur.keyframe_insert("location", index=0, frame=f)
    supur.data.keyframe_insert("energy", frame=f)

m_krem = mat("yazi_krem", "#ebe3d5", 0.32, coat=0.3)
m_yesil = mat("yazi_yesil", "#2bd36a", 0.32, coat=0.3, emis="#2bd36a", emis_guc=0.3)
m_yesil_k = mat("yazi_yesil_koyu", "#1f6f4a", 0.35, coat=0.5)


def yazi(ad, metin, loc, boyut, m, derinlik=0.08, hiza="CENTER"):
    bpy.ops.object.text_add(location=loc, rotation=(R(90), 0, 0))
    o = bpy.context.object
    o.name = ad
    d = o.data
    d.body, d.font, d.size, d.align_x, d.align_y = metin, FONT, boyut, hiza, "CENTER"
    d.extrude, d.bevel_depth, d.bevel_resolution = derinlik, 0.012, 3
    d.materials.append(m)
    return o


def uc_gel(o, bas, sure=0.6, kaynak=(0, 3.2, 0.4), don=70):
    """Derinlikten dönerek yerine oturur (ölçek + konum + dönüş)."""
    hedef = tuple(o.location)
    kolay(o, "location", [(s(bas), (hedef[0] + kaynak[0], hedef[1] + kaynak[1], hedef[2] + kaynak[2])),
                          (s(bas + sure), hedef)], "BACK", "EASE_OUT")
    kolay(o, "rotation_euler", [(s(bas), (90 + don, 0, 0)), (s(bas + sure), (90, 0, 0))], "BACK", "EASE_OUT")
    gorunur(o, [(1, False), (s(bas), True)])


def uc_git(o, bas, sure=0.35, yon=(0, -3.5, 1.2)):
    hedef = tuple(o.location)
    kolay(o, "location", [(s(bas), hedef), (s(bas + sure), (hedef[0] + yon[0], hedef[1] + yon[1], hedef[2] + yon[2]))],
          "QUAD", "EASE_IN")


# ------------------------------------------------------------------ 1 · Tipografi kancası
t1 = yazi("t_telefon", "Telefon", (0, 0, 1.8), 0.44, m_krem)
t2 = yazi("t_susmuyor", "susmuyor mu?", (0, 0, 1.3), 0.38, m_yesil)
uc_gel(t1, 0.0)
uc_gel(t2, 0.15)
gorunur(t1, [(1, True)])           # ilk karede yazı görünür (kanca)
gorunur(t2, [(1, True)])
for o, b in ((t1, 2.0), (t2, 2.05)):
    uc_git(o, b)
    gorunur(o, [(s(2.5), False)])

# ------------------------------------------------------------------ 2–3 · Telefon mock-up
EK = sorted(glob.glob(os.path.join(BURA, "katmanlar", "ekran", "kare_*.png")))
tel = O.telefon("telefon", (0, 0, 1.38), rot=(90, 0, 0), ekran_yolu=EK[0] if EK else None, dizi=(TOPLAM, 1),
                parlaklik=1.05)
tel.scale = (6.2,) * 3
kolay(tel, "location", [(s(2.2), (0, 0.6, -1.4)), (s(3.0), (0, 0, 1.38))], "BACK", "EASE_OUT")
kolay(tel, "rotation_euler", [(s(2.2), (90, 0, 200)), (s(3.0), (90, 0, -8)), (s(5.8), (90, 0, 6)),
                              (s(6.05), (90, 0, 6)), (s(6.5), (90, 0, -354)), (s(9.8), (90, 0, -364))])
for f in range(s(3.2), s(10.0), 12):   # hafif süzülme
    tel.location.z = 1.38 + 0.025 * math.sin(f / 9)
    tel.keyframe_insert("location", index=2, frame=f)
kolay(tel, "location", [(s(10.1), (0, 0, 1.38)), (s(10.55), (0, 3.5, 0.6))], "QUAD", "EASE_IN")
gorunur(tel, [(1, False), (s(2.2), True), (s(10.6), False)])


def kart_mat(n):
    m = bpy.data.materials.new(f"kart{n}")
    m.use_nodes = True
    nt = m.node_tree
    nt.nodes.clear()
    tex = nt.nodes.new("ShaderNodeTexImage")
    tex.image = bpy.data.images.load(os.path.join(BURA, "katmanlar", f"kart_{n}.png"))
    tex.interpolation = "Cubic"
    em = nt.nodes.new("ShaderNodeEmission")
    em.inputs[1].default_value = 0.95
    sd = nt.nodes.new("ShaderNodeBsdfPrincipled")
    sd.inputs["Roughness"].default_value = 0.2
    sd.inputs["Coat Weight"].default_value = 1.0
    mix = nt.nodes.new("ShaderNodeMixShader")
    mix.inputs[0].default_value = 0.25
    sh = nt.nodes.new("ShaderNodeMixShader")
    sa = nt.nodes.new("ShaderNodeBsdfTransparent")
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    nt.links.new(tex.outputs["Color"], em.inputs[0])
    nt.links.new(tex.outputs["Color"], sd.inputs["Base Color"])
    nt.links.new(em.outputs[0], mix.inputs[1])
    nt.links.new(sd.outputs[0], mix.inputs[2])
    nt.links.new(tex.outputs["Alpha"], sh.inputs[0])
    nt.links.new(sa.outputs[0], sh.inputs[1])
    nt.links.new(mix.outputs[0], sh.inputs[2])
    nt.links.new(sh.outputs[0], out.inputs[0])
    if hasattr(m, "surface_render_method"):
        m.surface_render_method = "BLENDED"
    return m


def kart(n, loc, giris, cikis, yan=-1, egim=6):
    bpy.ops.mesh.primitive_plane_add(size=1, location=loc, rotation=(R(90), 0, R(yan * -egim)))
    p = bpy.context.object
    p.name = f"kart{n}"
    p.scale = (0.72, 0.24, 1)
    p.data.materials.append(kart_mat(n))
    hedef = tuple(p.location)
    kolay(p, "location", [(s(giris), (hedef[0] + yan * 1.2, hedef[1] - 0.6, hedef[2])), (s(giris + 0.45), hedef)],
          "BACK", "EASE_OUT")
    for f in range(s(giris + 0.5), s(cikis), 10):
        p.location.z = hedef[2] + 0.018 * math.sin(f / 7 + n)
        p.keyframe_insert("location", index=2, frame=f)
    kolay(p, "location", [(s(cikis), hedef), (s(cikis + 0.3), (hedef[0] + yan * 2.4, hedef[1] - 1.0, hedef[2]))],
          "QUAD", "EASE_IN")
    gorunur(p, [(1, False), (s(giris), True), (s(cikis + 0.32), False)])
    return p


kart(1, (-0.12, -0.55, 2.14), 3.3, 6.0, yan=-1)       # telefonun üstünde
kart(2, (0.12, -0.6, 0.66), 4.7, 6.0, yan=1)          # telefonun altında
kart(3, (-0.12, -0.55, 2.14), 6.9, 10.0, yan=-1)
kart(4, (0.03, -0.7, 1.12), 7.7, 10.0, yan=1, egim=10)  # yanda, panelin alt boşluğunda
kart(5, (-0.04, -0.6, 0.64), 8.5, 10.0, yan=-1)

# ------------------------------------------------------------------ 4 · Tipografi: "Senin WhatsApp'ından / cevaplar."
t3 = yazi("t_senin", "Senin", (0, 0, 2.15), 0.44, m_krem)
t4 = yazi("t_wa", "WhatsApp'ından", (0, 0, 1.6), 0.35, m_yesil)
t5 = yazi("t_cevaplar", "cevaplar.", (0, 0, 1.05), 0.44, m_krem)
for o, b in ((t3, 10.3), (t4, 10.42), (t5, 10.54)):
    uc_gel(o, b)
    uc_git(o, 12.0, yon=(0, -3.5, -1.0))
    gorunur(o, [(s(12.5), False)])

# ------------------------------------------------------------------ 5 · Logo: yeşil döşeme + tilki + 3D "SıraGO"
logo = bos("logo", (0, 0, 1.62))
kutu("logo_doseme", (0.78, 0.14, 0.78), (0, 0.07, 0), m_yesil_k, 0.18, seg=6, ebeveyn=logo)
bpy.ops.mesh.primitive_plane_add(size=1, location=(0, -0.002, 0), rotation=(R(90), 0, 0))
tilki = bpy.context.object
tilki.scale = (0.62, 0.62, 1)
tilki.data.materials.append(resim_mat("logo_tilki", os.path.join(KOK, "..", "..", "maskot", "tilki-logo-seffaf.png"),
                                      isik=False, rough=0.4))
tilki.parent = logo
kolay(logo, "rotation_euler", [(s(12.3), (0, 0, -180)), (s(12.95), (0, 0, 0))], "BACK", "EASE_OUT")
kolay(logo, "location", [(s(12.3), (0, 1.5, 1.2)), (s(12.95), (0, 0, 1.62))], "BACK", "EASE_OUT")
gorunur(logo, [(1, False), (s(12.3), True)])
isim = yazi("logo_yazi", "SıraGO", (0, 0, 0.9), 0.56, m_krem, derinlik=0.1)
isim.data.materials.append(m_yesil)
for i in (4, 5):                     # "GO" parlak yeşil (koyu zemin logosu)
    isim.data.body_format[i].material_index = 1
uc_gel(isim, 12.6, kaynak=(0, 2.5, -0.3), don=-60)

# ------------------------------------------------------------------ KAMERA: yavaş itme + hafif yörünge
kam = kamera("kamera", (0, -3.9, 1.5), (0, 0, 1.42), lens=38, fstop=3.2)
# telefon bölümünde (2.2–10.2 sn) kamera yaklaşır: mock-up kadrajın yarısını doldurur, odak da onunla gelir
KAM = [(1, (0.0, -3.9, 1.5)), (s(2.2), (0.0, -3.6, 1.48)), (s(3.1), (0.0, -2.85, 1.45)), (s(6.2), (0.1, -2.75, 1.45)),
       (s(10.1), (-0.1, -2.8, 1.45)), (s(10.6), (0.0, -3.55, 1.5)), (s(12.2), (0.0, -3.7, 1.48)), (TOPLAM, (0.0, -3.45, 1.46))]
kolay(kam, "location", KAM)
for f, (x, y, z) in KAM:
    kam.data.dof.focus_distance = -y
    kam.data.dof.keyframe_insert("focus_distance", frame=f)
sc.camera = kam

# ------------------------------------------------------------------ ÇIKTI
cikti = os.path.abspath(al("--cikti", os.path.join(BURA, "kareler")))
os.makedirs(cikti, exist_ok=True)
if al("--kaydet"):
    bpy.ops.wm.save_as_mainfile(filepath=os.path.abspath(al("--kaydet")))
if "--hepsi" in arg:
    sc.render.filepath = os.path.join(cikti, "kare_")
    sc.frame_start, sc.frame_end = int(al("--bas", 1)), int(al("--bit", TOPLAM))
    sc.render.use_overwrite = False
    bpy.ops.render.render(animation=True)
elif al("--kareler"):
    import time
    for f in [int(x) for x in al("--kareler").split(",")]:
        sc.frame_set(f)
        sc.render.filepath = os.path.join(cikti, f"kare_{f:04d}.png")
        t = time.perf_counter()
        bpy.ops.render.render(write_still=True)
        print(f"KARE {f}: {time.perf_counter() - t:.1f} sn")
