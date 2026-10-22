"""TANITIM tarz örnekleri — tek kare stüdyo plakası (yazılar 2D katmanda, stil.html).

  blender -b -P tanitim/stil.py -- --stil A|B|C --sahne kahraman|son --cikti <dosya.png> [--ornek 32]

  A  krem stüdyo  : açık krem kıvrımlı fon, telefonun yumuşak gölgesi duvara düşer (ürün fotoğrafı)
  B  gece cam     : siyaha yakın fon, telefonun arkasında tek büyük yeşil ışık havuzu, koyu buzlu kartlar
  C  marka yeşili : yeşil fon, dev krem tipografi telefonun ARKASINDA (derinlik)
"""
import bpy, sys, os, glob
BURA = os.path.dirname(os.path.abspath(__file__))
KOK = os.path.join(BURA, "..")
sys.path.insert(0, os.path.join(KOK, "ortak"))
import importlib, temel, objeler as O
for m in (temel, O):
    importlib.reload(m)
from temel import *

arg = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
al = lambda ad, vars=None: arg[arg.index(ad) + 1] if ad in arg else vars
STIL, SAHNE = al("--stil", "A"), al("--sahne", "kahraman")
sc = sahne_hazirla(1, ornek=int(al("--ornek", 32)), gorunum="Khronos PBR Neutral", bakis="None")
sc.render.resolution_percentage = int(al("--yuzde", 100))

FON = {"A": "#efe6d8", "B": "#0b0f0d", "C": "#1f6f4a"}[STIL]
dunya({"A": "#fbf4e8", "B": "#050807", "C": "#2a7a55"}[STIL], {"A": 0.55, "B": 0.03, "C": 0.35}[STIL])
m_fon = mat("fon", FON, 0.85 if STIL != "B" else 0.6)


def siklorama(m, duvar_y=1.2, r=0.9):
    """Kıvrımlı sonsuz fon: zemin → çeyrek daire → duvar (ufuk çizgisi yok)."""
    profil = [(y, 0.0) for y in (-8, -2, duvar_y - r)]
    for i in range(1, 12):
        a = math.radians(90 * i / 12)
        profil.append((duvar_y - r + r * math.sin(a), r - r * math.cos(a)))
    profil += [(duvar_y, r), (duvar_y, 4), (duvar_y, 9)]
    v, f = [], []
    for x in (-10, 10):
        v += [(x, y, z) for y, z in profil]
    n = len(profil)
    f = [(i, i + 1, n + i + 1, n + i) for i in range(n - 1)]
    me = bpy.data.meshes.new("siklorama")
    me.from_pydata(v, [], f)
    me.materials.append(m)
    for p in me.polygons:
        p.use_smooth = True
    o = bpy.data.objects.new("siklorama", me)
    sc.collection.objects.link(o)
    return o


siklorama(m_fon)

# ------------------------------------------------------------------ ışık
if STIL == "A":
    isik("ana", "AREA", (-1.8, -2.2, 3.4), (0, 0.4, 1.4), 420, "#fff6ea", 2.4)     # büyük yumuşak softbox
    isik("dolgu", "AREA", (2.2, -2.4, 1.4), (0, 0, 1.4), 90, "#f3f6ff", 2.0)
    isik("kenar", "AREA", (1.4, 0.6, 2.4), (0, 0, 1.4), 60, "#ffffff", 0.5)
elif STIL == "B":
    isik("havuz", "AREA", (0, 0.35, 1.55), (0, 1.2, 1.7), 45, "#2bd36a", 2.2)      # duvarda yeşil ışık havuzu
    isik("ana", "AREA", (-1.6, -2.4, 2.6), (0, 0, 1.4), 120, "#eef4f0", 1.6)
    for x in (-1.2, 1.2):
        isik(f"kenar{x}", "AREA", (x, 0.5, 2.0), (0, 0, 1.4), 70, "#ffffff", 0.3, boyut_y=1.8)
else:
    isik("ana", "AREA", (-1.6, -2.4, 3.2), (0, 0.4, 1.4), 300, "#fff4e6", 2.4)
    isik("dolgu", "AREA", (2.2, -2.4, 1.4), (0, 0, 1.4), 70, "#e6fff0", 2.0)

# ------------------------------------------------------------------ telefon + kartlar
EK = os.path.join(BURA, "katmanlar", "ekran", "kare_0160.png")
if SAHNE == "kahraman":
    tel = O.telefon("telefon", (0, 0, 1.38), rot=(90, 0, -16), ekran_yolu=EK, parlaklik=1.0)
    tel.scale = (6.2,) * 3
    koyu = STIL == "B"


    def kart_mat(n, yol):
        """Kart yüzü ışıktan bağımsız okunur (emisyon), üstünde ince parlak kaplama; PNG alfası köşeleri keser."""
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

    def kart(n, loc, yaw):
        yol = os.path.join(BURA, "katmanlar", f"kart_koyu_{n}", "t_0.00.png") if koyu else \
            os.path.join(BURA, "katmanlar", f"kart_{n}.png")
        bpy.ops.mesh.primitive_plane_add(size=1, location=loc, rotation=(R(90), 0, R(yaw)))
        p = bpy.context.object
        p.scale = (0.54, 0.18, 1)
        p.data.materials.append(kart_mat(n, yol))
        return p


    kart(1, (-0.2, -0.42, 2.0 if STIL != "C" else 1.5), 8)
    kart(2, (0.2, -0.5, 0.86), -8)

    if STIL == "C":   # dev tipografi telefonun arkasında, duvara yakın
        yol = os.path.join(BURA, "katmanlar", "stil", "C_arka.png")
        bpy.ops.mesh.primitive_plane_add(size=1, location=(0, 0.75, 2.25), rotation=(R(90), 0, 0))
        p = bpy.context.object
        p.scale = (1.85, 1.156, 1)
        p.data.materials.append(resim_mat("dev_yazi", yol, isik=False, rough=0.8))
        p.visible_shadow = False   # duvara hayalet gölge düşmesin

kam = kamera("kamera", (0.0, -2.75, 1.62), (0, 0, 1.62), lens=40, fstop=2.8, odak=2.75)
sc.camera = kam

cikti = os.path.abspath(al("--cikti", os.path.join(BURA, "stil.png")))
sc.render.filepath = cikti
bpy.ops.render.render(write_still=True)
