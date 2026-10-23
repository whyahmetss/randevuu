"""Çırak — ritim oyunu sesi: 120 BPM; çağrıda bakır stab, "Tamam!"da yüksek stab, yığılmada buzzer; 2. tur parlak pop,
dolu saatte iki nota; süpürge ölçüsü yalnız davul. Whoosh yok."""
import json, os, sys
import numpy as np
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, 'ortak'))
from muzik import yukle, serit, bitir, SR, add, celesta, klarinet
from ses import *  # noqa: F401,F403

E = json.load(open(os.path.join(HERE, 'events.json'), encoding='utf-8'))
DUR, EV = E['dur'], E['ev']
N = int(DUR * SR) + SR
muz, fol, amb = np.zeros((N, 2)), np.zeros((N, 2)), np.zeros((N, 2))
B = .5; BAR = 2.0; at = lambda bar, beat=0: bar * BAR + beat * B
KOK1 = [45, 45, 43, 43]; AK1 = [[57, 60, 64], [57, 60, 64], [55, 59, 62], [55, 59, 62]]
KOK2 = [48, 45, 41, 43]; AK2 = [[60, 64, 67], [57, 60, 64], [53, 57, 60], [55, 59, 62]]
def akor(t0, t1, AK, v=1.0):
    t, i = t0, 0
    while t < t1 - 1e-3:
        for k in (1, 3): add(muz, stab(AK[i % 4], .18, .2 * v), t + k * B, pan=.2)
        t += BAR; i += 1
add(muz, jingle(.45), 0.0)
davul(muz, at(1), at(5), B, .95); bas_hat(muz, at(1), at(5), B, KOK2, 1.0); akor(at(1), at(5), AK2, .9)
add(muz, jingle(.5), at(5))
davul(muz, at(6), at(10), B, 1.0); bas_hat(muz, at(6), at(10), B, KOK2); akor(at(6), at(10), AK2, 1.0)
davul(muz, at(10), at(11), B, .9)
add(muz, jingle(.5), at(11))
davul(muz, at(11), at(14), B, .8); bas_hat(muz, at(11), at(14), B, KOK2, .9); akor(at(11), at(14), AK2, .9)
for k, m in enumerate([72, 76, 79, 76, 77, 76, 74, 72]): add(muz, kare(m, B * .9, .1, vib=.006), at(12) + k * B / 2, pan=.1)
for j, m in enumerate([48, 60, 64, 67, 72]): add(muz, marimba(m, 1.6, .3), at(13, 2) + j * .02)

efekt = lambda ad: yukle(os.path.join(HERE, 'out', ad))
zil = efekt('zil.wav')
for e in EV:
    t, ty = e['t'], e['type']
    if ty == 'gun': add(fol, pop(.2, 700), t)
    elif ty == 'cagri': add(fol, stab([67, 71, 74], .16, .32), t - .02, pan=-.3)
    elif ty == 'saat': add(fol, cowbell(.18), t)
    elif ty == 'buzzer': add(fol, buzzer(.22, .45), t)
    elif ty == 'karar': add(fol, damga(.6), t)
    elif ty == 'teyit': [add(fol, marimba(m, .4, .25), t + k * .12, pan=.3) for k, m in enumerate([79, 84, 88])]
    elif ty == 'bas1': add(fol, damga(.5), t); add(fol, ding(.2), t + .05)
    elif ty == 'bas2': add(fol, damga(.5), t)
    elif ty == 'cevap': add(fol, marimba(84, .5, .3), t, pan=.3); add(fol, pop(.15), t)
    elif ty == 'iptal': add(fol, marimba(76, .3, .28), t, pan=.3); add(fol, marimba(72, .4, .28), t + .15, pan=.3)
    elif ty == 'dus': add(fol, plop(.25), t + .28); add(fol, boing(.14), t + .3)
    elif ty == 'kapi' and zil is not None: add(fol, zil[:int(1.2 * SR)] * .28, t, pan=-.3)
    elif ty == 'fanfar': [add(fol, stab([m, m + 4, m + 7], .3, .45), t + k * .12) for k, m in enumerate([60, 64, 67, 72])]
    elif ty == 'damga': add(fol, damga(.6), t)
    elif ty == 'tamam': add(fol, stab([72, 76, 79], .16, .35), t, pan=.3)
    elif ty == 'dus3': [(add(fol, plop(.22), t + .28 + k * .08), add(fol, boing(.12), t + .3 + k * .08)) for k in range(3)]
    elif ty == 'dolu': add(fol, marimba(76, .3, .28), t, pan=.3); add(fol, marimba(79, .4, .28), t + .15, pan=.3)
    elif ty == 'gel' and zil is not None: add(fol, zil[:int(.8 * SR)] * .22, t, pan=.4)
    elif ty == 'supur': add(fol, bp(noise(.25), 1500, 6000) * env_exp(.25, .08) * .15, t)
    elif ty == 'son': [add(fol, stab([m, m + 4, m + 7], .3, .45), t + k * .12) for k, m in enumerate([60, 64, 67, 72])]
serit(amb, efekt('amb_dukkan.wav'), 2.0, 22.0, .04)
bitir(muz, fol, amb, DUR, os.path.join(HERE, 'out', 'mix.wav'), .55, yumusak=True)
json.dump([{'t0': e['t'], 't1': e['t1'], 'text': e['text']} for e in EV if e['type'] == 'altyazi'], open(os.path.join(HERE, 'out', 'cues.json'), 'w', encoding='utf-8'), ensure_ascii=False)
