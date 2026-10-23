"""TANITIM (motion graphics, krem stüdyo) — ürün çekimi gibi telefon + ekrandan fırlayan kartlar + 3D uygulama ikonu
(15 sn, 450 kare). Yazılar 2D katmanda (altyazi.html); burada yazı yok.

  blender -b -P tanitim/sahne.py -- --kareler 30,120 --cikti <klasor> [--ornek 32] [--yuzde 50]
  blender -b -P tanitim/sahne.py -- --hepsi [--bas N --bit M]

ÇEKİMLER (saniye)
  0.0–2.2   tepeden: telefon kıvrımlı krem zeminde yüzüstü değil, ekranı yukarı; bildirimler düştükçe titrer
  2.2–3.0   tek hareket: telefon kalkıp dikilir, kamera tepeden önden ürün kadrajına iner (ekran: sohbet)
  3.0–6.5   ürün kadrajı, yavaş itme; kartlar ekrandan fırlar ("Bugün · 17:00", "Randevunuz Oluşturuldu!")
            6.0–6.45 telefon bir tur döner (ekran: panel)
  6.5–10.2  KESME → sağdan alçak açı; 17:00 Mehmet panele düşer; hatırlatma / 3 dil / uygulama yok kartları
  10.2–12.3 KESME → boş stüdyo, büyük tipografi (2D)
  12.3–15.0 3D uygulama ikonu dönerek gelir, gölgesi fona düşer; isim + slogan (2D)
"""
import bpy, sys, os, math, glob
from mathutils import Vector
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
sc.render.use_motion_blur = True
if hasattr(sc.render, "motion_blur_position"):
    sc.render.motion_blur_position = "START"      # kesme karesi bir önceki çekimle karışmasın
sc.render.motion_blur_shutter = 0.5
dunya("#fbf4e8", 0.3)


def kf(o, yol, liste):
    """liste: (kare, değer[, ara, easing]) — her anahtarın kendi geçişi (ara: BEZIER/EXPO/BACK/CONSTANT…)."""
    for it in liste:
        v = [R(a) for a in it[1]] if yol == "rotation_euler" else it[1]
        setattr(o, yol, v)
        o.keyframe_insert(yol, frame=it[0])
    ayar = {it[0]: (it[2] if len(it) > 2 else "BEZIER", it[3] if len(it) > 3 else "AUTO") for it in liste}
    for fc in egriler(o):
        if fc.data_path == yol:
            for k in fc.keyframe_points:
                a = ayar.get(round(k.co.x))
                if a:
                    k.interpolation, k.easing = a


def goster(o, bas, bit=None):
    """Nesne (ve çocukları) yalnız [bas, bit) karelerinde render'da görünür."""
    for n in [o] + list(o.children_recursive):
        for f, gizli in [(1, bas > 1), (bas, False)] + ([(bit, True)] if bit else []):
            n.hide_render = gizli
            n.keyframe_insert("hide_render", frame=f)


# ------------------------------------------------------------------ STÜDYO: kıvrımlı krem fon (ufuk çizgisi yok)
m_fon = mat("fon", "#efe6d8", 0.85)


def siklorama(m, duvar_y=0.75, r=0.6):
    profil = [(y, 0.0) for y in (-8, -2, duvar_y - r)]
    for i in range(1, 12):
        a = math.radians(90 * i / 12)
        profil.append((duvar_y - r + r * math.sin(a), r - r * math.cos(a)))
    profil += [(duvar_y, r), (duvar_y, 4), (duvar_y, 9)]
    v = [(x, y, z) for x in (-10, 10) for y, z in profil]
    n = len(profil)
    me = bpy.data.meshes.new("siklorama")
    me.from_pydata(v, [], [(i, i + 1, n + i + 1, n + i) for i in range(n - 1)])
    me.materials.append(m)
    for p in me.polygons:
        p.use_smooth = True
    o = bpy.data.objects.new("siklorama", me)
    sc.collection.objects.link(o)


siklorama(m_fon)
isik("ana", "AREA", (-1.9, -2.5, 2.9), (0, 0.4, 1.4), 520, "#fff6ea", 1.1)   # yumuşak softbox, gölge fona düşer
isik("dolgu", "AREA", (2.2, -2.4, 1.4), (0, 0, 1.4), 90, "#f3f6ff", 2.0)
isik("kenar", "AREA", (1.4, 0.6, 2.4), (0, 0, 1.4), 60, "#ffffff", 0.5)
isik("tepe", "AREA", (-1.6, 1.3, 3.0), (0, 0, 0), 220, "#fff6ea", 1.4)      # 1. çekim: yerdeki telefonu aydınlatır

# ------------------------------------------------------------------ TELEFON

EK = sorted(glob.glob(os.path.join(BURA, "katmanlar", "ekran", "kare_*.png")))
OLC = 9.25
YER_Z = O.TEL2_K / 2 * OLC
YER_Y = -0.75                       # yerdeki telefon fonun kıvrımından önde
tel = O.telefon2("telefon", (0, 0, YER_Z), ekran_yolu=EK[0] if EK else None, dizi=(TOPLAM, 1), parlaklik=1.0)
tel.scale = (OLC,) * 3
for n in bpy.data.materials["telefon_ekran_m"].node_tree.nodes:   # cam yansıması yazıyı yakmasın
    if n.type == "FRESNEL":
        n.inputs[0].default_value = 1.18
# 1. çekim: yerde; bildirimlerle titrer
tel.location, tel.rotation_euler = (0, YER_Y, YER_Z), (0, 0, R(-6))
for b in (0.2, 0.85, 1.45):
    titret(tel, s(b), s(b) + 9, genlik=0.012, aci=1.6, tohum=int(b * 10))
# kalkış → ürün kadrajı → tur → 3. çekim duruşu
kf(tel, "location", [(s(2.2), (0, YER_Y, YER_Z), "EXPO", "EASE_IN_OUT"), (s(3.0), (0, 0, 1.38)),
                     (s(4.6), (0, 0, 1.40)), (s(6.0), (0, 0, 1.38)), (s(8.2), (0, 0, 1.40)), (s(10.1), (0, 0, 1.38))])
kf(tel, "rotation_euler", [(s(2.2), (0, 0, -6), "EXPO", "EASE_IN_OUT"), (s(3.0), (90, 0, -16)),
                           (s(6.0), (90, 0, -12), "EXPO", "EASE_IN_OUT"), (s(6.45), (90, 0, 374)),
                           (s(10.2), (90, 0, 380))])
goster(tel, 1, s(10.2))


# ------------------------------------------------------------------ KARTLAR: ekrandan fırlar (gölgesi dokuda)
def kart_mat(n, yol):
    m = bpy.data.materials.new(f"kart{n}")
    m.use_nodes = True
    nt = m.node_tree
    nt.nodes.clear()
    tex = nt.nodes.new("ShaderNodeTexImage")
    tex.image = bpy.data.images.load(yol)
    tex.interpolation = "Cubic"
    em = nt.nodes.new("ShaderNodeEmission")
    em.inputs[1].default_value = 0.92
    sd = nt.nodes.new("ShaderNodeBsdfPrincipled")
    sd.inputs["Roughness"].default_value = 0.2
    sd.inputs["Coat Weight"].default_value = 1.0
    mix = nt.nodes.new("ShaderNodeMixShader")
    mix.inputs[0].default_value = 0.2
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


KART_OLCEK = (0.54 * 980 / 900, 0.18 * 380 / 300, 1)


def kart(n, hedef, yaw, giris, cikis, olcek=1.0):
    """Telefon ekranının önünden küçük başlar, yerine yaylanarak oturur, hafif süzülür; kesmede kaybolur."""
    bpy.ops.mesh.primitive_plane_add(size=1, location=hedef, rotation=(R(90), 0, R(yaw)))
    p = bpy.context.object
    p.name = f"kart{n}"
    p.data.materials.append(kart_mat(n, os.path.join(BURA, "katmanlar", f"kartg_{n}", "t_0.00.png")))
    tam = tuple(k * olcek for k in KART_OLCEK)
    bas = (hedef[0] * 0.3, -0.08, hedef[2] * 0.85 + 1.38 * 0.15)
    kf(p, "location", [(s(giris), bas, "BACK", "EASE_OUT"), (s(giris + 0.55), hedef)]
       + [(f, (hedef[0], hedef[1], hedef[2] + 0.012 * math.sin(f / 8 + n))) for f in range(s(giris + 0.7), cikis, 12)])
    kf(p, "scale", [(s(giris), tuple(k * 0.25 for k in tam), "BACK", "EASE_OUT"), (s(giris + 0.55), tam)])
    goster(p, s(giris), cikis)
    return p


kart(1, (-0.2, -0.42, 2.0), 8, 3.3, s(6.5))
kart(2, (0.2, -0.5, 0.86), -8, 4.7, s(6.5))
kart(3, (-0.13, -0.5, 1.98), 20, 6.9, s(10.2), 0.9)
kart(4, (-0.2, -0.62, 1.38), 22, 7.7, s(10.2), 0.9)
kart(5, (-0.12, -0.55, 0.8), 20, 8.5, s(10.2), 0.9)

# ------------------------------------------------------------------ 3D UYGULAMA İKONU (kapanış)
ikon = bos("ikon", (0, 0, 1.78), None, (90, 0, 0))
IK = 0.5
m_ikon_yan = mat("ikon_yan", "#1cc463", 0.3, coat=0.8)
O._plaka("ikon_govde", IK, IK, IK * 0.225, 0.07, m_ikon_yan, -0.07, ikon, bevel=0.012)
m_yuz = resim_mat("ikon_yuz", os.path.join(KOK, "..", "..", "maskot", "marka", "uygulama-ikonu-1024.png"),
                  emisyon=0.92)   # ikon renkleri ışıkta solmasın
O._plaka("ikon_yuz", IK - 0.006, IK - 0.006, IK * 0.222, 0.0005, m_yuz, 0.0002, ikon, uv=True)
kf(ikon, "location", [(s(12.3), (0, 0.9, 1.5), "BACK", "EASE_OUT"), (s(13.0), (0, 0, 1.78)),
                      (s(15.0), (0, 0, 1.81))])
kf(ikon, "rotation_euler", [(s(12.3), (90, 0, -95), "BACK", "EASE_OUT"), (s(13.0), (90, 0, 0)),
                            (s(14.0), (91.5, 0, 3)), (s(15.0), (90, 0, 1))])
goster(ikon, s(12.3))

# ------------------------------------------------------------------ KAMERA
kam = kamera("kamera", (0, -1.2, 2.45), (0, -0.57, 0), lens=40, fstop=2.8, yukari=(0, 1, 0))
sc.camera = kam
_onceki = [None]


def poz(f, loc, hedef, ara="BEZIER", easing="AUTO", yukari=None):
    kam.location = loc
    bak(kam, hedef, yukari)
    if _onceki[0] is not None:
        e = kam.rotation_euler.copy()
        e.make_compatible(_onceki[0])
        kam.rotation_euler = e
    _onceki[0] = kam.rotation_euler.copy()
    kam.keyframe_insert("location", frame=f)
    kam.keyframe_insert("rotation_euler", frame=f)
    kam.data.dof.focus_distance = (Vector(hedef) - Vector(loc)).length
    kam.data.dof.keyframe_insert("focus_distance", frame=f)
    for fc in egriler(kam):
        if fc.data_path in ("location", "rotation_euler"):
            for k in fc.keyframe_points:
                if round(k.co.x) == f:
                    k.interpolation, k.easing = ara, easing


UST = (0, 1, 0)
poz(1, (0, -1.2, 2.45), (0, -0.57, 0), yukari=UST)
poz(s(2.2), (0.03, -1.15, 2.3), (0, -0.57, 0), "EXPO", "EASE_IN_OUT", yukari=UST)
poz(s(3.0), (0, -2.75, 1.62), (0, 0, 1.62))
poz(s(6.48), (0.05, -2.45, 1.6), (0, 0, 1.6), "CONSTANT")                  # kesme
poz(s(6.5), (0.75, -2.5, 1.3), (-0.17, 0, 1.42))
poz(s(10.18), (0.55, -2.6, 1.36), (-0.17, 0, 1.42), "CONSTANT")                # kesme
poz(s(10.2), (0, -2.9, 1.62), (0, 0.75, 1.62))
poz(s(12.28), (0, -2.75, 1.62), (0, 0.75, 1.62), "CONSTANT")               # kesme
poz(s(12.3), (0, -2.85, 1.62), (0, 0, 1.62))
poz(TOPLAM, (0, -2.6, 1.62), (0, 0, 1.62))

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
    for f in [int(x) for x in al("--kareler").split(",")]:
        sc.frame_set(f)
        sc.render.filepath = os.path.join(cikti, f"kare_{f:04d}.png")
        bpy.ops.render.render(write_still=True)
