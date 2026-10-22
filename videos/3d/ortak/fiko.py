"""Fiko: SıraGO'nun tilki maskotu, köşeli 3D karakter olarak (yalnız mizah Reels'lerinde oynar).

Marka kuralı (tasarim/marka-kitabi/08-maskot): Fiko seyircidir, satıcı değil. Konuşma balonu yok; ürün planlarında
(telefon ekranı) ve kapanış kartında görünmez. Renkler logodaki tilkiden: turuncu, krem, koyu kahve, yeşil atkı.

fiko(ad, konum, yon) → karakter.Karakter (aynı ifade/kol/bakış fonksiyonları çalışır)
"""
import karakter as K
from temel import kutu, mat, R, RENK

TURUNCU = "#d66a0e"
KREM = "#f6e7d3"
KAHVE = "#4a2618"


def fiko(ad, konum=(0, 0, 0), yon=0, onluk=RENK["yesil_koyu"], olcek=1.1):
    k = K.karakter(ad, konum, yon=yon, ten=TURUNCU, sac=KAHVE, sac_tip="yok", gomlek=TURUNCU, pantolon=KAHVE,
                   onluk=onluk, goz_renk="#123a24", eldiven=KAHVE, kol_renk=TURUNCU)
    k.kok.scale = (olcek,) * 3
    import bpy
    for m in bpy.data.materials:   # turuncu yüzeylerde kumaş parlaklığı rengi mercana çekiyordu
        if TURUNCU in m.name and m.node_tree and "Principled BSDF" in m.node_tree.nodes:
            m.node_tree.nodes["Principled BSDF"].inputs["Sheen Weight"].default_value = 0.0
    kp, gp = k.kafa_pivot, k.govde_pivot
    H, yz = 0.56, -0.27
    gz = H * 0.55
    m_tur = mat(f"fiko_tur", TURUNCU, 0.6, sheen=0.25)
    m_krem = mat("fiko_krem", KREM, 0.65, sheen=0.7)
    m_kah = mat("fiko_kahve", KAHVE, 0.6, sheen=0.4)
    m_burun = mat("fiko_burun", "#1a1210", 0.15, coat=1)
    m_atki = mat("fiko_atki", RENK["yesil"], 0.7, sheen=0.6)
    # Ağız-burun bölgesi (krem), yanaklar krem; insan burnu gizlenir, yerine siyah tilki burnu
    burun = [o for o in kp.children if o.name.endswith("_burun")]
    for o in burun:
        o.hide_render = o.hide_viewport = True
    kutu(f"{ad}_agizlik", (0.42, 0.06, 0.2), (0, yz - 0.012, gz - 0.16), m_krem, 0.05, ebeveyn=kp)
    kutu(f"{ad}_tburun", (0.075, 0.06, 0.055), (0, yz - 0.05, gz - 0.085), m_burun, 0.022, ebeveyn=kp)
    for x in (-0.24, 0.24):
        kutu(f"{ad}_yanak_tuy", (0.12, 0.05, 0.16), (x, yz + 0.01, gz - 0.12), m_krem, 0.04, ebeveyn=kp)
    # Ağız şekilleri burunluğun önüne
    for o in k.agiz.values():
        o.location.y -= 0.045
        o.location.z -= 0.03
    # Kulaklar: kafanın üstünde, dışa yatık; uçları kahve, içi krem
    for x, s in ((-0.2, 1), (0.2, -1)):
        kutu(f"{ad}_kulak_d", (0.23, 0.08, 0.21), (x * 1.08, 0.02, H + 0.09), m_tur, 0.05, ebeveyn=kp, rot=(0, 28 * s, 0))
        kutu(f"{ad}_kulak_i", (0.13, 0.03, 0.12), (x * 1.08 + 0.006 * s, -0.025, H + 0.08), m_krem, 0.025, ebeveyn=kp,
             rot=(0, 28 * s, 0))
        kutu(f"{ad}_kulak_uc", (0.12, 0.085, 0.06), (x * 1.08 - 0.05 * s, 0.02, H + 0.18), m_kah, 0.025, ebeveyn=kp,
             rot=(0, 28 * s, 0))
    # Kafa tüyü perçemi
    kutu(f"{ad}_percem", (0.16, 0.12, 0.06), (0.04, -0.12, H + 0.04), m_tur, 0.03, ebeveyn=kp, rot=(14, 0, -10))
    # Atkı (yeşil) + sarkan ucu, göğüs krem
    kutu(f"{ad}_atki", (0.56, 0.38, 0.1), (0, 0, 0.58), m_atki, 0.04, ebeveyn=gp)
    kutu(f"{ad}_atki_uc", (0.12, 0.05, 0.24), (0.14, -0.2, 0.44), m_atki, 0.03, ebeveyn=gp, rot=(0, -10, 0))
    if not onluk:
        kutu(f"{ad}_gogus", (0.26, 0.03, 0.36), (0, -0.165, 0.3), m_krem, 0.04, ebeveyn=gp)
    # Kuyruk: arkadan yana kıvrık, ucu krem
    kuyruk = kutu(f"{ad}_kuyruk", (0.2, 0.42, 0.2), (0.16, 0.3, 0.1), m_tur, 0.08, seg=3, ebeveyn=gp, rot=(20, 0, 28))
    kutu(f"{ad}_kuyruk_uc", (0.19, 0.12, 0.19), (0, 0.24, 0), m_krem, 0.07, seg=3, ebeveyn=kuyruk)
    # Ayaklar kahve
    for o in k.kok.children:
        if "_ayak" in o.name:
            o.data.materials.clear()
            o.data.materials.append(m_kah)
    k.kuyruk = kuyruk
    return k
