"""Kurulum testi: GPU doğrulama + kare başına EEVEE süresi.

Çalıştır:
  blender -b -P videos/3d/_test/test_sahne.py -- <cikti_klasoru> [kare_sayisi]
"""
import bpy, gpu, sys, time, math, os

args = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
OUT = args[0] if args else os.path.join(os.path.dirname(__file__), "out")
N = int(args[1]) if len(args) > 1 else 6
os.makedirs(OUT, exist_ok=True)


bpy.ops.wm.read_factory_settings(use_empty=True)
sc = bpy.context.scene
engines = {e.identifier for e in bpy.types.RenderSettings.bl_rna.properties["engine"].enum_items}
sc.render.engine = "BLENDER_EEVEE" if "BLENDER_EEVEE" in engines else "BLENDER_EEVEE_NEXT"
sc.render.resolution_x, sc.render.resolution_y = 1080, 1920
sc.render.fps = 30
sc.eevee.taa_render_samples = 64
sc.view_settings.view_transform = "AgX"
sc.view_settings.look = "AgX - Medium High Contrast"


def mat(ad, renk, rough=0.6, emis=None, guc=0.0):
    m = bpy.data.materials.new(ad)
    m.use_nodes = True
    b = m.node_tree.nodes["Principled BSDF"]
    b.inputs["Base Color"].default_value = (*renk, 1)
    b.inputs["Roughness"].default_value = rough
    if emis:
        b.inputs["Emission Color"].default_value = (*emis, 1)
        b.inputs["Emission Strength"].default_value = guc
    return m


def kutu(ad, loc, olcek, m, bevel=0.04):
    bpy.ops.mesh.primitive_cube_add(location=loc)
    o = bpy.context.object
    o.name, o.scale = ad, olcek
    bpy.ops.object.transform_apply(scale=True)
    md = o.modifiers.new("bevel", "BEVEL")
    md.width, md.segments = bevel, 2
    o.data.materials.append(m)
    return o


# Zemin + duvar
kutu("zemin", (0, 0, -0.05), (4, 4, 0.05), mat("zemin", (0.32, 0.2, 0.13), 0.7), 0)
kutu("duvar", (0, 2.5, 2), (4, 0.05, 2), mat("duvar", (0.75, 0.62, 0.48), 0.9), 0)

# Köşeli karakter: gövde (yeşil önlük), kafa, gözler
kutu("govde", (0, 0, 0.9), (0.32, 0.22, 0.42), mat("onluk", (0.02, 0.16, 0.08), 0.55))
kutu("kafa", (0, -0.02, 1.62), (0.24, 0.22, 0.26), mat("ten", (0.8, 0.52, 0.36), 0.5), 0.06)
gz = mat("goz", (0.02, 0.02, 0.02), 0.2)
for x in (-0.09, 0.09):
    kutu("goz", (x, -0.235, 1.66), (0.035, 0.01, 0.05), gz, 0.01)
kutu("sac", (0, -0.0, 1.9), (0.26, 0.24, 0.06), mat("sac", (0.08, 0.05, 0.03), 0.8), 0.03)

# Telefon (parlak yeşil bildirim)
kutu("telefon", (0.55, -0.4, 0.85), (0.08, 0.01, 0.16), mat("tel", (0.02, 0.02, 0.02), 0.3), 0.01)
kutu("ekran", (0.55, -0.412, 0.85), (0.072, 0.002, 0.15),
     mat("ekran", (0.0, 0.0, 0.0), 0.2, (0.06, 0.66, 0.2), 3.0), 0)
kutu("tezgah", (0.55, -0.3, 0.37), (0.3, 0.25, 0.37), mat("tezgah", (0.4, 0.25, 0.15), 0.5))

# Arka plan bokeh noktaları (küçük emisif küreler)
sicak = mat("bokeh", (0, 0, 0), 1, (1.0, 0.6, 0.25), 25)
for i in range(14):
    bpy.ops.mesh.primitive_uv_sphere_add(radius=0.04, segments=12, ring_count=6,
                                         location=(-1.8 + i * 0.28, 2.3, 2.2 + 0.5 * math.sin(i * 1.7)))
    bpy.context.object.data.materials.append(sicak)

# Işık: sıcak ana (alan), soğuk-kenar, dolgu
def isik(ad, tip, loc, rot, guc, renk, boyut=1.0):
    d = bpy.data.lights.new(ad, tip)
    d.energy, d.color = guc, renk
    if tip == "AREA":
        d.size = boyut
    o = bpy.data.objects.new(ad, d)
    o.location, o.rotation_euler = loc, [math.radians(a) for a in rot]
    sc.collection.objects.link(o)

isik("ana", "AREA", (-1.6, -1.8, 2.6), (55, 0, -40), 450, (1.0, 0.72, 0.45), 1.5)
isik("kenar", "AREA", (1.4, 1.2, 2.4), (-60, 0, 140), 300, (0.75, 0.85, 1.0), 0.6)
isik("dolgu", "AREA", (0.5, -3, 1.4), (85, 0, 0), 40, (1.0, 0.9, 0.8), 3)

w = bpy.data.worlds.new("dunya")
w.use_nodes = True
w.node_tree.nodes["Background"].inputs[0].default_value = (0.03, 0.02, 0.015, 1)
sc.world = w

# Kamera: sığ alan derinliği + yavaş dolly
cam = bpy.data.objects.new("kamera", bpy.data.cameras.new("kamera"))
sc.collection.objects.link(cam)
sc.camera = cam
cam.data.lens = 50
cam.data.dof.use_dof = True
cam.data.dof.aperture_fstop = 1.8
hedef = bpy.data.objects.new("hedef", None)
hedef.location = (0, 0, 1.55)
sc.collection.objects.link(hedef)
cam.data.dof.focus_object = hedef
tr = cam.constraints.new("TRACK_TO")
tr.target = hedef
sc.frame_start, sc.frame_end = 1, N
cam.location = (0.6, -3.4, 1.7)
cam.keyframe_insert("location", frame=1)
cam.location = (0.45, -2.9, 1.65)
cam.keyframe_insert("location", frame=N)

# Render: ilk kare ısınma (shader derleme) ayrı ölçülür
sureler = []
for f in range(1, N + 1):
    sc.frame_set(f)
    sc.render.filepath = os.path.join(OUT, f"kare_{f:03d}.png")
    t = time.perf_counter()
    bpy.ops.render.render(write_still=True)
    sureler.append(time.perf_counter() - t)
    if f == 1:
        try:
            print("GPU_RENDERER:", gpu.platform.vendor_get(), "|", gpu.platform.renderer_get(), "|", gpu.platform.backend_type_get())
        except Exception as e:
            print("GPU_RENDERER: okunamadi", e)
    print(f"KARE {f}: {sureler[-1]:.2f} sn")

sicak_ort = sum(sureler[1:]) / max(1, len(sureler) - 1)
print(f"ILK_KARE: {sureler[0]:.2f} sn  ORTALAMA(sonraki): {sicak_ort:.2f} sn/kare")
print(f"TAHMIN 15 sn video (450 kare): {sicak_ort * 450 / 60:.1f} dk")
