"""İlk Dükkân — müzik + foley + ambiyans → out/mix.wav. Olaylar events.json'dan; müzik 92 BPM 3/4 ızgarada.
Tema: müzik kutusunda başlar, sonda flütle bir kez tam duyulur. 13.4–14.0 bir vuruş sessizlik. Geçişlerde whoosh yok."""
import json, os, sys
import numpy as np
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, 'ortak'))
from muzik import *  # noqa: F401,F403

E = json.load(open(os.path.join(HERE, 'events.json'), encoding='utf-8'))
DUR, EV = E['dur'], E['ev']
N = int(DUR * SR) + SR
muz, fol, amb = np.zeros((N, 2)), np.zeros((N, 2)), np.zeros((N, 2))
B = 60 / 92; BAR = 3 * B
AKOR = [([60, 64, 67, 72], 48), ([57, 60, 64, 69], 45), ([57, 60, 65, 69], 41), ([55, 59, 62, 67], 43)]
TEMA = [(76, 1), (79, 1), (84, 1), (83, 2), (79, 1), (81, 1), (79, 1), (76, 1), (74, 3),
        (76, 1), (79, 1), (84, 1), (86, 2), (83, 1), (84, 3)]

def melodi(cal, t0, enst, v, adim=1.0, sarkma=None):
    t = t0
    for m, b in TEMA:
        d = b * B * adim
        sk = sarkma(t) if sarkma else 0
        add(muz, enst(m, d * 1.3, v) if enst is not flut else flut(m, d * .95, v), t, pan=.15) if sk == 0 else add(muz, muzik_kutusu(m, d * 1.4, v, sk), t, pan=.15)
        t += d
        if t > cal: break
    return t

def grup(t0, t1, v=1.0, bas=True, salla=False):
    t, i = t0, 0
    while t < t1 - .05:
        notalar, kok = AKOR[i % 4]
        if bas: add(muz, klarinet(kok, B * .9, .26 * v), t, pan=-.25)
        for k in (1, 2):
            if t + k * B < t1: add(muz, strum(notalar, B * 1.4, .2 * v), t + k * B, pan=.2)
        if salla:
            for k in range(3): add(muz, calkalayici(.05 * v), t + k * B + B / 2, pan=.4)
        t += BAR; i += 1

# 0–4: müzik kutusu temanın başı (sayfa çizilirken)
melodi(4.2, .4, muzik_kutusu, .2)
grup(4.2, 13.4, .9)
# 13.4–14.0 sessizlik ("Geliyor anne, geliyor" sonrası)
grup(14.0, 18.0, .6, bas=False)
grup(18.0, 24.0, 1.0, salla=True)
melodi(23.9, 18.0, glok, .16)
# 24.2–26: müzik kutusu yavaşlar ve pesleşir (gece)
melodi(27.0, 24.2, muzik_kutusu, .2, adim=1.5, sarkma=lambda t: min(.06, max(0.0, (t - 24.2) * .025)))
# 28.4: tema bir kez tam, flütle
grup(28.4, 31.6, .8)
melodi(31.6, 28.4, flut, .22, adim=.62)
for j, m in enumerate([48, 60, 64, 67, 72]): add(muz, (klarinet(m, 2.2, .22) if m < 55 else ukulele(m, 2.4, .26)), 31.6 + j * .03)

# ───────── foley
efekt = lambda ad: yukle(os.path.join(HERE, 'out', ad))
zil, makas = efekt('zil.wav'), efekt('makas.wav')
for e in EV:
    t, ty = e['t'], e['type']
    if ty == 'cizim': add(fol, pastel(e['d'], .14, 1.4, 1), t)
    elif ty == 'titresim': add(fol, titresim(.25), t)
    elif ty == 'pit': add(fol, pit(.1), t, pan=-.2)
    elif ty == 'glok': add(fol, glok([79, 84, 83, 88][e.get('n', 0) % 4], 1.2, .18), t, pan=.2)
    elif ty == 'zil' and zil is not None: add(fol, zil[:int(1.2 * SR)] * .25, t, pan=.4)
    elif ty == 'makas' and makas is not None: add(fol, makas[:int(.25 * SR)] * .3, t, pan=-.1)
    elif ty == 'oturur': add(fol, tahta(.08, 300), t)
    elif ty == 'piyano': add(fol, oyuncak_piyano([72, 76, 79][e.get('n', 0) % 3], .9, .2), t)
    elif ty == 'firca': add(fol, islak_firca(e['d'] + .6, .16), t, pan=-.1)
    elif ty == 'celesta': add(fol, celesta([84, 86, 88, 91, 96][e.get('n', 0) % 5], 1.6, .18), t, pan=.15)
    elif ty == 'bant': add(fol, bant(.14), t)
# boyama sesleri: müşterilerin saçı "boyanırken"
for e in EV:
    if e['type'] == 'oturur': add(fol, pastel(.8, .06, 2.2, int(e['t'] * 10)), e['t'] + .3, pan=-.2)

# ───────── ambiyans: gündüz kuşlar, gece cırcır
serit(amb, efekt('amb_sabah.wav'), 0, 24.8, .06)
serit(amb, efekt('amb_circir.wav'), 24.2, 30.2, .07)

# sessizlik vuruşu: müziği 13.4–14.0 tamamen kes (yumuşak geçişle)
s0, s1, f0 = int(13.4 * SR), int(14.0 * SR), int(.25 * SR)
muz[s0 - f0:s0] *= np.linspace(1, 0, f0)[:, None]; muz[s0:s1] = 0
bitir(muz, fol, amb, DUR, os.path.join(HERE, 'out', 'mix.wav'), .7)
json.dump([{'t0': e['t'], 't1': e['t1'], 'text': e['text']} for e in EV if e['type'] == 'altyazi'], open(os.path.join(HERE, 'out', 'cues.json'), 'w', encoding='utf-8'), ensure_ascii=False)
