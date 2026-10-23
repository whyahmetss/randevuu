"""Dalgın Müşteri — müzik + foley + ambiyans → out/mix.wav. 100 BPM 4/4, komik ukulele + klarinet bas + tahta blok;
her hatırlatmada aynı glockenspiel motifi (her seferinde bir ton yukarı). Yağmur panelinde müzik kısılır. Whoosh yok."""
import json, os, sys
import numpy as np
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, 'ortak'))
from muzik import *  # noqa: F401,F403

E = json.load(open(os.path.join(HERE, 'events.json'), encoding='utf-8'))
DUR, EV = E['dur'], E['ev']
N = int(DUR * SR) + SR
muz, fol, amb = np.zeros((N, 2)), np.zeros((N, 2)), np.zeros((N, 2))
B = 60 / 100; BAR = 4 * B
AKOR = [([60, 64, 67, 72], 48), ([57, 60, 65, 69], 41), ([55, 59, 62, 67], 43), ([60, 64, 67, 72], 48)]

def grup(t0, t1, v=1.0, blok=True):
    t, i = t0, 0
    while t < t1 - .05:
        notalar, kok = AKOR[i % 4]
        for k, m in enumerate([kok, kok + 7, kok + 12, kok + 7]):           # komik "yürüyen" klarinet bas
            if t + k * B < t1: add(muz, klarinet(m, B * .7, .22 * v), t + k * B, pan=-.25)
        for k in (1, 3):
            if t + k * B < t1: add(muz, strum(notalar, B * 1.2, .18 * v), t + k * B, pan=.2)
        if blok:
            for k in range(4):
                if t + k * B + B / 2 < t1: add(muz, tahta(.06 * v, 1100 if k % 2 else 800), t + k * B + B / 2, pan=.35)
        t += BAR; i += 1

grup(0.2, 18.2, 1.0)
grup(18.2, 23.6, .45, blok=False)       # yağmur: müzik kısık
grup(24.0, 28.6, 1.0)
# son: tema melodisi oyuncak piyanoda + son akor
for k, m in enumerate([72, 74, 76, 79, 76, 72, 74, 72]): add(muz, oyuncak_piyano(m, .5, .2), 28.6 + k * B / 2, pan=.15)
for j, m in enumerate([48, 60, 64, 67, 72]): add(muz, klarinet(m, 2.0, .2) if m < 55 else ukulele(m, 2.2, .24), 30.6 + j * .03)

efekt = lambda ad: yukle(os.path.join(HERE, 'out', ad))
zil = efekt('zil.wav')
MOTIF = [[79, 84, 88], [81, 86, 89], [83, 88, 91]]
for e in EV:
    t, ty = e['t'], e['type']
    if ty == 'cizim': add(fol, pastel(e['d'], .12, 1.5, int(t * 10)), t)
    elif ty == 'gag': add(fol, glok([84, 88, 91][e['n']], .7, .14), t, pan=.3)
    elif ty == 'yuru': [add(fol, tahta(.05, 500), t + k * .2) for k in range(int(e['d'] / .2))]
    elif ty == 'hatir': [add(fol, glok(m, 1.3, .2), t + k * .14, pan=.15) for k, m in enumerate(MOTIF[e['n']])]
    elif ty == 'tamam': add(fol, pit(.1), t)
    elif ty == 'pit': add(fol, pit(.1), t, pan=-.2)
    elif ty == 'glok': add(fol, glok(91, 1.0, .16), t)
    elif ty == 'firca': add(fol, islak_firca(e['d'] + .6, .14), t)
    elif ty == 'yagmur':
        d = e['d']; tt = t_(d); y = hp(noise(d), 2500) * .05 * np.minimum(1, tt / .8) * np.minimum(1, (d - tt) / .8)
        add(amb, y, t, .9)
    elif ty == 'araba':
        d = e['d']; tt = t_(d); y = lp(np.sin(2 * np.pi * 70 * tt) * (1 + .3 * np.sin(2 * np.pi * 9 * tt)), 300) * .08 * np.minimum(1, (d - tt) / .4)
        add(fol, y, t)
    elif ty == 'zil' and zil is not None: add(fol, zil[:int(1.2 * SR)] * .25, t, pan=.4)
    elif ty == 'oturur': add(fol, tahta(.08, 300), t)
    elif ty == 'havlu': add(fol, bp(noise(.4), 400, 2000) * env_exp(.4, .12) * .12, t)
serit(amb, efekt('amb_sabah.wav'), 0, 6.8, .06)
bitir(muz, fol, amb, DUR, os.path.join(HERE, 'out', 'mix.wav'), .7)
json.dump([{'t0': e['t'], 't1': e['t1'], 'text': e['text']} for e in EV if e['type'] == 'altyazi'], open(os.path.join(HERE, 'out', 'cues.json'), 'w', encoding='utf-8'), ensure_ascii=False)
