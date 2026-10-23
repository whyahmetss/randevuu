"""Anne–Kız Salonu — müzik + foley + ambiyans → out/mix.wav. 88 BPM 3/4 sallanan vals: ukulele + klarinet + celesta.
'Hıh' anında tek klarinet notası; boyama sesleri; akşam suluboya + müzik kutusu; liste belirirken celesta. Whoosh yok."""
import json, os, sys
import numpy as np
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, 'ortak'))
from muzik import *  # noqa: F401,F403

E = json.load(open(os.path.join(HERE, 'events.json'), encoding='utf-8'))
DUR, EV = E['dur'], E['ev']
N = int(DUR * SR) + SR
muz, fol, amb = np.zeros((N, 2)), np.zeros((N, 2)), np.zeros((N, 2))
B = 60 / 88; BAR = 3 * B
AKOR = [([62, 65, 69, 74], 50), ([60, 64, 67, 72], 48), ([58, 62, 65, 70], 46), ([57, 61, 64, 69], 45)]   # Dm C Bb A
def vals(t0, t1, v=1.0):
    t, i = t0, 0
    while t < t1 - .05:
        n, k = AKOR[i % 4]
        add(muz, klarinet(k, B * .9, .22 * v), t, pan=-.25)
        for j in (1, 2):
            if t + j * B < t1: add(muz, strum(n, B * 1.1, .15 * v), t + j * B, pan=.2)
        t += BAR; i += 1
TEMA = [(74, 1), (76, 1), (77, 1), (76, 2), (74, 1), (72, 1), (74, 1), (69, 1), (70, 3)]
def tema(t0, enst, v):
    t = t0
    for m, b in TEMA: add(muz, enst(m, b * B * 1.3, v), t, pan=.15); t += b * B
tema(0.4, muzik_kutusu, .2)
vals(3.6, 7.4, .9)
add(muz, klarinet(43, 1.2, .28), 7.6)                 # "hıh"
vals(8.6, 17.4, 1.0); tema(10.0, celesta, .12); tema(13.4, celesta, .12)
tema(17.4, muzik_kutusu, .18)
vals(19.4, 27.8, .85)
tema(27.8, flut, .2)
for j, m in enumerate([50, 62, 65, 69, 74]): add(muz, klarinet(m, 2.8, .18) if m < 55 else ukulele(m, 3.0, .22), 30.8 + j * .03)

efekt = lambda ad: yukle(os.path.join(HERE, 'out', ad))
zil = efekt('zil.wav')
for e in EV:
    t, ty = e['t'], e['type']
    if ty == 'cizim': add(fol, pastel(e['d'], .13, 1.4, 5), t)
    elif ty == 'pit': add(fol, pit(.1), t, pan=-.2)
    elif ty == 'glok': add(fol, glok([84, 88, 91][e.get('n', 0) % 3], 1.0, .14), t, pan=.2)
    elif ty == 'zil' and zil is not None: add(fol, zil[:int(1.2 * SR)] * .22, t, pan=.4)
    elif ty == 'boya': add(fol, pastel(e['d'], .1, 2.6, int(t * 9)), t, pan=-.3)
    elif ty == 'firca': add(fol, islak_firca(e['d'] + .6, .15), t)
    elif ty == 'celesta': add(fol, celesta([84, 86, 88, 91][e.get('n', 0) % 4], 1.6, .16), t, pan=.15)
    elif ty == 'raf': add(fol, tahta(.1, 260), t + .6)
    elif ty == 'goz': add(fol, glok(96, .6, .12), t)
serit(amb, efekt('amb_sabah.wav'), 0, 18.4, .05)
bitir(muz, fol, amb, DUR, os.path.join(HERE, 'out', 'mix.wav'), .7)
json.dump([{'t0': e['t'], 't1': e['t1'], 'text': e['text']} for e in EV if e['type'] == 'altyazi'], open(os.path.join(HERE, 'out', 'cues.json'), 'w', encoding='utf-8'), ensure_ascii=False)
