"""Ortak sahne yardımcıları: EEVEE ayarı, malzeme, köşeli geometri, ışık, kamera, animasyon.

Tüm SıraGO 3D sahneleri bu modülü kullanır. Birimler metre, kare hızı 30.
"""
import bpy, bmesh, math, random
from mathutils import Vector

FPS = 30
R = math.radians

# Marka + sahne paleti (sRGB hex)
RENK = {
    "yesil_koyu": "#1f6f4a",
    "yesil": "#2bd36a",
    "krem": "#f6efe4",
    "murekkep": "#14211a",
    "ten_acik": "#f1c7a5",
    "ten": "#d9a07a",
    "ten_esmer": "#b47a55",
    "sac_koyu": "#2a1c14",
    "sac_kahve": "#5a3622",
    "krom": "#c9ccd1",
    "ahsap": "#8a5a3b",
    "ahsap_koyu": "#5b3a26",
    "deri_bordo": "#6e2228",
    "beyaz": "#f4f1ec",
}


def lin(hex_or_rgb):
    """sRGB hex/tuple → lineer RGBA (Principled Base Color lineer ister)."""
    if isinstance(hex_or_rgb, str):
        h = hex_or_rgb.lstrip("#")
        rgb = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    else:
        rgb = list(hex_or_rgb)[:3]
    f = lambda c: c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4
    return (*[f(c) for c in rgb], 1.0)


# ---------------------------------------------------------------- sahne

def sahne_hazirla(kare_sayisi, ornek=64, gorunum="AgX", bakis="AgX - Medium High Contrast"):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    sc = bpy.context.scene
    motorlar = {e.identifier for e in bpy.types.RenderSettings.bl_rna.properties["engine"].enum_items}
    sc.render.engine = "BLENDER_EEVEE" if "BLENDER_EEVEE" in motorlar else "BLENDER_EEVEE_NEXT"
    sc.render.resolution_x, sc.render.resolution_y = 1080, 1920
    sc.render.resolution_percentage = 100
    sc.render.fps = FPS
    sc.frame_start, sc.frame_end = 1, kare_sayisi
    sc.render.image_settings.file_format = "PNG"
    sc.render.image_settings.color_mode = "RGB"
    ee = sc.eevee
    ee.taa_render_samples = ornek
    for ad, deger in (("use_shadows", True), ("shadow_ray_count", 2), ("shadow_step_count", 8),
                      ("use_raytracing", True), ("ray_tracing_method", "SCREEN"),
                      ("use_fast_gi", True), ("fast_gi_method", "GLOBAL_ILLUMINATION"),
                      ("volumetric_tile_size", "8"), ("volumetric_samples", 48),
                      ("use_volumetric_shadows", True)):
        if hasattr(ee, ad):
            try:
                setattr(ee, ad, deger)
            except Exception:
                pass
    if hasattr(ee, "ray_tracing_options"):
        ee.ray_tracing_options.resolution_scale = "2"
    sc.view_settings.view_transform = gorunum
    try:
        sc.view_settings.look = bakis
    except TypeError:
        pass
    sc.render.film_transparent = False
    return sc


def dunya(renk="#1a120c", guc=0.35, sis=0.0, sis_renk="#ffd9b0"):
    w = bpy.data.worlds.new("dunya")
    bpy.context.scene.world = w
    w.use_nodes = True
    nt = w.node_tree
    bg = nt.nodes["Background"]
    bg.inputs[0].default_value = lin(renk)
    bg.inputs[1].default_value = guc
    if sis > 0:  # hafif hacimsel pus: pencere ışığında ışık hüzmesi
        vol = nt.nodes.new("ShaderNodeVolumePrincipled")
        vol.inputs["Density"].default_value = sis
        vol.inputs["Color"].default_value = lin(sis_renk)
        vol.inputs["Anisotropy"].default_value = 0.6
        nt.links.new(vol.outputs[0], nt.nodes["World Output"].inputs["Volume"])
    return w


# ---------------------------------------------------------------- malzeme

_MAT = {}


def mat(ad, renk, rough=0.55, metal=0.0, emis=None, emis_guc=0.0, coat=0.0, sheen=0.0, alfa=1.0,
        transmisyon=0.0, ior=1.45):
    if ad in _MAT:
        return _MAT[ad]
    m = bpy.data.materials.new(ad)
    m.use_nodes = True
    b = m.node_tree.nodes["Principled BSDF"]
    b.inputs["Base Color"].default_value = lin(renk)
    b.inputs["Roughness"].default_value = rough
    b.inputs["Metallic"].default_value = metal
    if coat:
        b.inputs["Coat Weight"].default_value = coat
    if sheen:
        b.inputs["Sheen Weight"].default_value = sheen
    if transmisyon:
        b.inputs["Transmission Weight"].default_value = transmisyon
        b.inputs["IOR"].default_value = ior
    if emis:
        b.inputs["Emission Color"].default_value = lin(emis)
        b.inputs["Emission Strength"].default_value = emis_guc
    if alfa < 1:
        b.inputs["Alpha"].default_value = alfa
        if hasattr(m, "surface_render_method"):
            m.surface_render_method = "BLENDED"
    _MAT[ad] = m
    return m


def isik_mat(ad, renk, guc):
    """Saf emisyon (ampul, ekran ışığı, bokeh kaynakları)."""
    if ad in _MAT:
        return _MAT[ad]
    m = bpy.data.materials.new(ad)
    m.use_nodes = True
    nt = m.node_tree
    nt.nodes.clear()
    e = nt.nodes.new("ShaderNodeEmission")
    e.inputs[0].default_value = lin(renk)
    e.inputs[1].default_value = guc
    o = nt.nodes.new("ShaderNodeOutputMaterial")
    nt.links.new(e.outputs[0], o.inputs[0])
    _MAT[ad] = m
    return m


def dama_mat(ad, renk1, renk2, olcek=8.0, rough=0.35):
    """Damalı zemin (berber klasiği)."""
    m = bpy.data.materials.new(ad)
    m.use_nodes = True
    nt = m.node_tree
    b = nt.nodes["Principled BSDF"]
    tc = nt.nodes.new("ShaderNodeTexCoord")
    ch = nt.nodes.new("ShaderNodeTexChecker")
    ch.inputs["Scale"].default_value = olcek
    ch.inputs["Color1"].default_value = lin(renk1)
    ch.inputs["Color2"].default_value = lin(renk2)
    nt.links.new(tc.outputs["Object"], ch.inputs["Vector"])
    nt.links.new(ch.outputs["Color"], b.inputs["Base Color"])
    b.inputs["Roughness"].default_value = rough
    return m


def resim_mat(ad, yol, emisyon=1.0, dizi=None, rough=0.25, isik=True):
    """Görsel dokulu malzeme. dizi=(kare_sayisi, baslangic) → PNG dizisi (telefon ekranı).

    isik=True: ekran gibi kendi ışığını yayar (emisyon), üstüne ince cam yansıması eklenir.
    """
    m = bpy.data.materials.new(ad)
    m.use_nodes = True
    nt = m.node_tree
    nt.nodes.clear()
    tex = nt.nodes.new("ShaderNodeTexImage")
    img = bpy.data.images.load(yol, check_existing=True)
    tex.image = img
    tex.interpolation = "Cubic"
    tex.extension = "CLIP"
    if dizi:
        img.source = "SEQUENCE"
        u = tex.image_user
        u.frame_duration, u.frame_start, u.frame_offset = dizi[0], dizi[1], 0
        u.use_auto_refresh = True
        u.use_cyclic = False
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    if isik:
        em = nt.nodes.new("ShaderNodeEmission")
        em.inputs[1].default_value = emisyon
        nt.links.new(tex.outputs["Color"], em.inputs[0])
        cam = nt.nodes.new("ShaderNodeBsdfGlossy")
        cam.inputs["Roughness"].default_value = 0.08
        fr = nt.nodes.new("ShaderNodeFresnel")
        fr.inputs[0].default_value = 1.5
        mix = nt.nodes.new("ShaderNodeMixShader")
        nt.links.new(fr.outputs[0], mix.inputs[0])
        nt.links.new(em.outputs[0], mix.inputs[1])
        nt.links.new(cam.outputs[0], mix.inputs[2])
        nt.links.new(mix.outputs[0], out.inputs[0])
    else:
        b = nt.nodes.new("ShaderNodeBsdfPrincipled")
        b.inputs["Roughness"].default_value = rough
        nt.links.new(tex.outputs["Color"], b.inputs["Base Color"])
        nt.links.new(tex.outputs["Alpha"], b.inputs["Alpha"])
        nt.links.new(b.outputs[0], out.inputs[0])
        if hasattr(m, "surface_render_method"):
            m.surface_render_method = "BLENDED"
    return m


# ---------------------------------------------------------------- geometri

def _bagla(o, ebeveyn=None, koleksiyon=None):
    (koleksiyon or bpy.context.scene.collection).objects.link(o)
    if ebeveyn is not None:
        o.parent = ebeveyn
    return o


def bos(ad, loc=(0, 0, 0), ebeveyn=None, rot=(0, 0, 0)):
    o = bpy.data.objects.new(ad, None)
    o.empty_display_size = 0.1
    o.location = loc
    o.rotation_euler = [R(a) for a in rot]
    return _bagla(o, ebeveyn)


def kutu(ad, boyut, loc=(0, 0, 0), m=None, bevel=0.02, seg=3, ebeveyn=None, rot=(0, 0, 0), koken=(0, 0, 0)):
    """Köşeleri yumuşatılmış kutu. boyut = tam (x, y, z). koken: -1..1, mesh'in pivot'a göre kayması
    (ör. koken=(0,0,-1) → pivot kutunun alt yüzünde)."""
    me = bpy.data.meshes.new(ad)
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    sx, sy, sz = boyut
    for v in bm.verts:
        v.co.x = v.co.x * sx - koken[0] * sx / 2
        v.co.y = v.co.y * sy - koken[1] * sy / 2
        v.co.z = v.co.z * sz - koken[2] * sz / 2
    bm.to_mesh(me)
    bm.free()
    o = bpy.data.objects.new(ad, me)
    o.location = loc
    o.rotation_euler = [R(a) for a in rot]
    _bagla(o, ebeveyn)
    if bevel > 0:
        md = o.modifiers.new("bevel", "BEVEL")
        md.width = min(bevel, min(boyut) * 0.49)
        md.segments = seg
        md.limit_method = "NONE"
        md.harden_normals = False
    if m:
        me.materials.append(m)
    for p in me.polygons:
        p.use_smooth = bevel > 0 and seg > 1
    return o


def silindir(ad, r, h, loc=(0, 0, 0), m=None, kenar=16, ebeveyn=None, rot=(0, 0, 0), bevel=0.0, r2=None,
             yumusak=True):
    """Silindir/koni. Taban z=0, tepe z=h (pivot tabanda)."""
    me = bpy.data.meshes.new(ad)
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, segments=kenar, radius1=r, radius2=r if r2 is None else r2,
                          depth=h)
    bmesh.ops.translate(bm, verts=bm.verts, vec=(0, 0, h / 2))
    bm.to_mesh(me)
    bm.free()
    o = bpy.data.objects.new(ad, me)
    o.location = loc
    o.rotation_euler = [R(a) for a in rot]
    _bagla(o, ebeveyn)
    if bevel:
        md = o.modifiers.new("bevel", "BEVEL")
        md.width, md.segments, md.limit_method = bevel, 2, "ANGLE"
    if m:
        me.materials.append(m)
    for p in me.polygons:
        p.use_smooth = yumusak
    if yumusak and hasattr(me, "set_sharp_from_angle"):
        me.set_sharp_from_angle(angle=R(40))
    return o


def kure(ad, r, loc=(0, 0, 0), m=None, seg=16, ebeveyn=None, olcek=(1, 1, 1), yumusak=True):
    me = bpy.data.meshes.new(ad)
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=seg, v_segments=max(4, seg // 2), radius=r)
    bm.to_mesh(me)
    bm.free()
    o = bpy.data.objects.new(ad, me)
    o.location, o.scale = loc, olcek
    _bagla(o, ebeveyn)
    if m:
        me.materials.append(m)
    for p in me.polygons:
        p.use_smooth = yumusak
    return o


def yay(ad, yaricap, aci, kalinlik, derinlik, loc=(0, 0, 0), m=None, ebeveyn=None, ters=False, seg=12):
    """Ön yüze (−Y) bakan yay şeridi: gülümseme/kaş/ağız. aci derece, ters=True → aşağı dönük."""
    me = bpy.data.meshes.new(ad)
    bm = bmesh.new()
    a0 = R(-90 - aci / 2)
    on, arka = [], []
    for i in range(seg + 1):
        a = a0 + R(aci) * i / seg
        for rr, liste in ((yaricap + kalinlik / 2, on), (yaricap - kalinlik / 2, arka)):
            x, z = rr * math.cos(a), rr * math.sin(a) + yaricap
            if ters:
                z = -z
            liste.append((x, z))
    vs = []
    for (x, z) in on + arka:
        vs.append(bm.verts.new((x, -derinlik / 2, z)))
    for (x, z) in on + arka:
        vs.append(bm.verts.new((x, derinlik / 2, z)))
    n = seg + 1
    F = lambda i, j: vs[i + j]
    for i in range(seg):
        for off in (0, 2 * n):  # ön/arka yüz
            q = [F(i, off), F(i + 1, off), F(n + i + 1, off), F(n + i, off)]
            bm.faces.new(q if off == 0 else q[::-1])
        bm.faces.new([F(i, 0), F(i, 2 * n), F(i + 1, 2 * n), F(i + 1, 0)])
        bm.faces.new([F(n + i, 0), F(n + i + 1, 0), F(n + i + 1, 2 * n), F(n + i, 2 * n)])
    bm.faces.new([F(0, 0), F(n, 0), F(n, 2 * n), F(0, 2 * n)])
    bm.faces.new([F(seg, 0), F(seg, 2 * n), F(n + seg, 2 * n), F(n + seg, 0)])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(me)
    bm.free()
    o = bpy.data.objects.new(ad, me)
    o.location = loc
    _bagla(o, ebeveyn)
    if m:
        me.materials.append(m)
    md = o.modifiers.new("bevel", "BEVEL")
    md.width, md.segments = min(kalinlik, derinlik) * 0.3, 2
    return o


def birlestir_mat(o, m):
    o.data.materials.clear()
    o.data.materials.append(m)


# ---------------------------------------------------------------- ışık + kamera

def isik(ad, tip, loc, hedef=None, guc=100, renk="#ffffff", boyut=1.0, boyut_y=None, rot=None, aci=45,
         yumusaklik=0.1):
    d = bpy.data.lights.new(ad, tip)
    d.energy = guc
    d.color = lin(renk)[:3]
    if tip == "AREA":
        d.size = boyut
        if boyut_y:
            d.shape, d.size_y = "RECTANGLE", boyut_y
    elif tip in ("POINT", "SPOT"):
        d.shadow_soft_size = yumusaklik
        if tip == "SPOT":
            d.spot_size, d.spot_blend = R(aci), 0.6
    elif tip == "SUN":
        d.angle = R(2)
    o = bpy.data.objects.new(ad, d)
    o.location = loc
    _bagla(o)
    if rot:
        o.rotation_euler = [R(a) for a in rot]
    if hedef is not None:
        bak(o, hedef)
    return o


def bak(o, hedef, yukari=None):
    """Nesneyi hedef noktaya çevirir (−Z ekseni hedefe). yukari: görüntünün üst yönü (dünya vektörü);
    tepeden bakan telefon planlarında telefonun üst ucu verilir, yoksa kadraj yan yatabilir."""
    v = Vector(hedef) - Vector(o.location)
    if yukari is None:
        o.rotation_euler = v.to_track_quat("-Z", "Y").to_euler()
        return
    from mathutils import Matrix
    z = -v.normalized()
    y = (Vector(yukari) - z * Vector(yukari).dot(z)).normalized()
    x = y.cross(z)
    o.rotation_euler = Matrix((x, y, z)).transposed().to_euler()


def kamera(ad, loc, hedef, lens=50, fstop=2.0, odak=None, sensor=36, yukari=None):
    c = bpy.data.cameras.new(ad)
    c.lens, c.sensor_width = lens, sensor
    c.sensor_fit = "AUTO"
    c.dof.use_dof = True
    c.dof.aperture_fstop = fstop
    c.dof.aperture_blades = 7
    c.dof.aperture_rotation = R(15)
    c.clip_start, c.clip_end = 0.02, 60
    o = bpy.data.objects.new(ad, c)
    o.location = loc
    _bagla(o)
    bak(o, hedef, yukari)
    c.dof.focus_distance = odak if odak else (Vector(hedef) - Vector(loc)).length
    return o


def plan(kamera_obj, kare):
    """Zaman çizelgesi işareti: bu kareden itibaren bu kamera."""
    sc = bpy.context.scene
    mk = sc.timeline_markers.new(kamera_obj.name, frame=kare)
    mk.camera = kamera_obj
    if kare <= sc.frame_start:
        sc.camera = kamera_obj


# ---------------------------------------------------------------- animasyon

def egriler(id_data):
    ad = id_data.animation_data
    if not ad or not ad.action:
        return []
    act = ad.action
    if hasattr(act, "fcurves") and not hasattr(act, "layers"):
        return act.fcurves
    try:
        from bpy_extras import anim_utils
        cb = anim_utils.action_get_channelbag_for_slot(act, ad.action_slot)
        return cb.fcurves if cb else []
    except Exception:
        return getattr(act, "fcurves", [])


def anahtar(o, yol, kareler, ara="BEZIER", indeks=-1):
    """kareler: [(kare, değer), ...]. Rotasyonlar derece verilir (rotation_euler)."""
    for kare, deger in kareler:
        if yol == "rotation_euler":
            deger = [R(a) for a in deger] if isinstance(deger, (tuple, list)) else R(deger)
        if indeks >= 0:
            getattr(o, yol)[indeks] = deger
        else:
            setattr(o, yol, deger)
        o.keyframe_insert(yol, index=indeks, frame=kare)
    for fc in egriler(o if not hasattr(o, "id_data") else o.id_data):
        if fc.data_path.endswith(yol.split(".")[-1]):
            for k in fc.keyframe_points:
                if ara != "BEZIER" or k.interpolation != "CONSTANT":
                    k.interpolation = ara
                if ara == "BEZIER":
                    k.handle_left_type = k.handle_right_type = "AUTO_CLAMPED"


def gorunur(o, kareler):
    """[(kare, True/False)] → ani görünme/kaybolma (ölçek 0 ile; render gizleme yerine)."""
    if not hasattr(o, "_tam"):
        pass
    tam = tuple(o.scale)
    for kare, acik in kareler:
        o.scale = tam if acik else (0.0001, 0.0001, 0.0001)
        o.keyframe_insert("scale", frame=kare)
    for fc in egriler(o):
        if fc.data_path == "scale":
            for k in fc.keyframe_points:
                k.interpolation = "CONSTANT"
    o.scale = tam


def titret(o, bas, bit, genlik=0.004, aci=1.2, adim=1, tohum=1):
    """Telefon titreşimi: [bas, bit] arası kareye kare küçük sarsıntı."""
    rnd = random.Random(tohum)
    loc0, rot0 = Vector(o.location), Vector(o.rotation_euler)
    for f in range(bas, bit + 1, adim):
        o.location = loc0 + Vector((rnd.uniform(-genlik, genlik), rnd.uniform(-genlik, genlik), 0))
        o.rotation_euler = rot0 + Vector((0, 0, R(rnd.uniform(-aci, aci))))
        o.keyframe_insert("location", frame=f)
        o.keyframe_insert("rotation_euler", frame=f)
    for f in (bas - 1, bit + 1):
        o.location, o.rotation_euler = loc0, rot0
        o.keyframe_insert("location", frame=f)
        o.keyframe_insert("rotation_euler", frame=f)
    for fc in egriler(o):
        for k in fc.keyframe_points:
            if bas - 1 <= k.co.x <= bit + 1:
                k.interpolation = "LINEAR"


def sn(saniye):
    """Saniye → kare (1 tabanlı)."""
    return int(round(saniye * FPS)) + 1
