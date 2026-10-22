"""Gerçekçi / Pixar tarzı insan karakterler (MakeHuman MPFB eklentisi, CC0 varlıklar).

insan(ad, konum, yon, tarz="gercekci"|"pixar", ...) → (gövde_mesh, kök) döner.
Yüz ifadeleri MPFB'nin ifade birimleri (expression units) şekil anahtarı olarak yüklenir; ifade(...) ile anahtarlanır.
Gereken: Blender'da MPFB eklentisi + makehuman_system_assets_cc0 paketi (bkz. videos/3d/README.md).
"""
import bpy, addon_utils, math
from mathutils import Vector

addon_utils.enable("bl_ext.blender_org.mpfb", default_set=True, persistent=True)
from bl_ext.blender_org.mpfb.services.humanservice import HumanService          # noqa: E402
from bl_ext.blender_org.mpfb.services.targetservice import TargetService        # noqa: E402

R = math.radians

# İfade birimleri (MakeHuman expression units, kafkas varyantı)
BIRIMLER = ["eyebrows-left-inner-up", "eyebrows-right-inner-up", "eyebrows-left-down", "eyebrows-right-down",
            "eyebrows-left-up", "eyebrows-right-up", "eye-left-closure", "eye-right-closure", "eye-left-slit",
            "eye-right-slit", "mouth-corner-puller", "mouth-depression", "mouth-open", "mouth-upward-retraction",
            "mouth-compression"]

IFADE = {
    "normal":   {},
    "gulumse":  {"mouth-corner-puller": 1.0, "mouth-upward-retraction": 0.35, "eye-left-slit": 0.35, "eye-right-slit": 0.35,
                 "eyebrows-left-up": 0.25, "eyebrows-right-up": 0.25},
    "kahkaha":  {"mouth-corner-puller": 1.0, "mouth-open": 0.45, "mouth-upward-retraction": 0.4,
                 "eye-left-slit": 0.5, "eye-right-slit": 0.5},
    "endise":   {"eyebrows-left-inner-up": 1.0, "eyebrows-right-inner-up": 1.0, "eyebrows-left-up": 0.3,
                 "eyebrows-right-up": 0.3, "mouth-depression": 0.9, "mouth-compression": 0.4},
    "stres":    {"eyebrows-left-inner-up": 1.0, "eyebrows-right-inner-up": 1.0, "eyebrows-left-down": 0.2,
                 "eyebrows-right-down": 0.2, "mouth-depression": 0.6, "mouth-open": 0.12, "eye-left-slit": 0.1,
                 "eye-right-slit": 0.1},
    "goz_kirp": {"mouth-corner-puller": 0.7, "eye-right-closure": 1.0, "eyebrows-right-down": 0.3},
}

TARZ = {
    "gercekci": dict(skin="middleage_caucasian_male.mhmat", skin_tipi="ENHANCED_SSS", hedefler=[]),
    # Pixar tarzı: aynı insan; büyük baş ve gözler, yumuşak "toon" cilt
    "pixar": dict(skin="young_caucasian_male.mhmat", skin_tipi="ENHANCED", hedefler=[
        {"target": "head-scale-vert-incr", "value": 1.0}, {"target": "head-scale-horiz-incr", "value": 1.0},
        {"target": "head-scale-depth-incr", "value": 0.8}, {"target": "l-eye-scale-incr", "value": 1.0},
        {"target": "r-eye-scale-incr", "value": 1.0}], goz_buyut=1.35, goz_yuvasi=2.0, oran=0.0, yas=0.42),
}


def insan(ad, konum=(0, 0, 0), yon=0.0, tarz="gercekci", erkek=True, yas=0.6, kilo=0.55, kas=0.55,
          irk=None, sac="short02", kiyafet=("male_worksuit01", "shoes01"), skin=None, goz="brown", kas_tipi="eyebrow001",
          rig=True):
    t = TARZ[tarz]
    info = HumanService._create_default_human_info_dict()
    info["phenotype"].update({"gender": 1.0 if erkek else 0.0, "age": t.get("yas", yas), "weight": kilo, "muscle": kas,
                              "proportions": t.get("oran", 0.6), "height": 0.55,
                              "race": irk or {"caucasian": 0.7, "african": 0.1, "asian": 0.2}})
    info.update({
        "skin_mhmat": f"{skin or t['skin']}", "skin_material_type": t["skin_tipi"],
        "eyes": "high-poly.mhclo", "eyes_material_type": "MAKESKIN",
        "eyebrows": f"{kas_tipi}.mhclo", "eyelashes": "eyelashes01.mhclo",
        "teeth": "teeth_base.mhclo", "tongue": "tongue01.mhclo",
        "hair": f"{sac}.mhclo" if sac else "", "clothes": [f"{k}.mhclo" for k in kiyafet],
        "rig": "default" if rig else "", "targets": list(t["hedefler"]), "alternative_materials": {},
        "eyes_material_settings": {}, "expressions": []})
    ayar = HumanService.get_default_deserialization_settings()
    ayar["subdiv_levels"] = 1
    govde = HumanService.deserialize_from_dict(info, ayar)
    kok = govde.parent if govde.parent else govde
    kok.name = ad
    kok.location = konum
    kok.rotation_euler = (0, 0, R(yon))
    # İfade birimleri şekil anahtarı olarak (0 ağırlıkla) yüklenir
    for b in BIRIMLER:
        yol = TargetService.target_full_path(f"expression-units-caucasian-{b}") or TargetService.target_full_path(b)
        if yol:
            TargetService.load_target(govde, yol, weight=0.0, name=f"ifade_{b}")
    # Pixar tarzı: göz yuvası hedefi 1'in üstüne, göz küreleri büyür
    if t.get("goz_yuvasi") and govde.data.shape_keys:
        for kb in govde.data.shape_keys.key_blocks:
            if kb.name.endswith("eye-scale-incr"):
                kb.slider_max = 3.0
                kb.value = t["goz_yuvasi"]
    if t.get("goz_buyut"):
        bpy.context.view_layer.update()
        for o in [o for o in bpy.data.objects if o.parent in (kok, govde) and o.type == "MESH"]:
            if "eye" in o.name.lower() and not any(k in o.name.lower() for k in ("brow", "lash")):
                me = o.data
                for yan in (1, -1):   # iki göz küresi ayrı ayrı kendi merkezinde büyür
                    vs = [v for v in me.vertices if (v.co.x > 0) == (yan > 0)]
                    if not vs:
                        continue
                    m = sum((v.co for v in vs), Vector()) / len(vs)
                    for v in vs:
                        v.co = m + (v.co - m) * t["goz_buyut"]
    # Kaş ve kirpik ayrı nesne: yüzün şekil anahtarlarını izlemeleri için yüz yüzeyine bağlanır (Surface Deform)
    for o in [o for o in bpy.data.objects if o.parent in (kok, govde) and o.type == "MESH" and o is not govde]:
        if not any(k in o.name.lower() for k in ("eyebrow", "eyelash")):
            continue
        for md in list(o.modifiers):
            if md.type == "ARMATURE":
                o.modifiers.remove(md)
        sd = o.modifiers.new("yuze_bagli", "SURFACE_DEFORM")
        sd.target = govde
        with bpy.context.temp_override(object=o, active_object=o):
            bpy.ops.object.surfacedeform_bind(modifier=sd.name)
    return govde, kok


def ifade(govde, kare, ad, gecis=5, onceki=None):
    """`kare`de `ad` ifadesine geçer (gecis kare önce eski ifade sabitlenir)."""
    sk = govde.data.shape_keys
    if not sk:
        return
    hedef = IFADE[ad]
    for b in BIRIMLER:
        kb = sk.key_blocks.get(f"ifade_{b}")
        if not kb:
            continue
        if onceki is not None:
            kb.value = IFADE[onceki].get(b, 0.0)
            kb.keyframe_insert("value", frame=max(1, kare - gecis))
        kb.value = hedef.get(b, 0.0)
        kb.keyframe_insert("value", frame=kare)
