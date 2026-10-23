"""Arapça Mesaj — kafe akordeon üçlüsü havası (3/4, 132 BPM): akordeon (klarinet + celesta katmanı), pizzicato (ukulele kısa),
bas. Kalem hışırtısı; renk gelince çarşı ambiyansı; kapı zili. Whoosh yok."""
import json, os, sys
import numpy as np
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, 'ortak'))
from muzik import *  # noqa: F401,F403

E = json.load(open(os.path.join(HERE, 'events.json'), encoding='utf-8'))
DUR, EV = E['dur'], E['ev']
N = int(DUR * SR) + SR
muz, fol, amb = np.zeros((N, 2)), np.zeros((N, 2)), np.zeros((N, 2))
B = 60 / 132; BAR = 3 * B
AKOR = [([57, 60, 64], 45), ([62, 65, 69], 50), ([64, 68, 71], 52), ([57, 60, 64], 45)]   # Am Dm E Am
def akordeon(m, d, v): return klarinet(m, d, v * .7) + klarinet(m + 12, d, v * .25, vib=.008)
def vals(t0, t1, v=1.0):
    t, i = t0, 0
    while t < t1 - .05:
        n, k = AKOR[i % 4]
        add(muz, klarinet(k - 12, B * .8, .2 * v), t, pan=-.3)
        for j in (1, 2):
            if t + j * B < t1: [add(muz, ukulele(m, .35, .1 * v), t + j * B + q * .01, pan=.25) for q, m in enumerate(n)]
        t += BAR; i += 1
MEL = [(69, 1), (71, 1), (72, 1), (74, 2), (72, 1), (71, 1), (69, 1), (68, 1), (69, 3), (76, 1), (74, 1), (72, 1), (71, 2), (69, 1), (68, 3)]
def mel(t0, v=.2):
    t = t0
    for m, b in MEL: add(muz, akordeon(m, b * B * .95, v), t, pan=.1); t += b * B
vals(1.0, 28.0, .9); mel(4.4, .16); mel(12.6, .14); mel(18.2, .2); mel(23.6, .2)
efekt = lambda ad: yukle(os.path.join(HERE, 'out', ad))
zil = efekt('zil.wav')
for e in EV:
    t, ty = e['t'], e['type']
    if ty == 'kalem': add(fol, pastel(max(.06, e['d']), .045, 4.0, int(t * 100)), t, pan=-.1)
    elif ty == 'adim': add(fol, tahta(.03, 420), t, pan=-.2)
    elif ty == 'yaz': add(fol, pit(.08), t, pan=-.2)
    elif ty == 'yaz_bot': add(fol, glok(84, .9, .12), t, pan=.2)
    elif ty == 'soru': add(fol, klarinet(55, .5, .2), t)
    elif ty == 'renk': add(fol, islak_firca(e['d'] + .6, .14), t)
    elif ty == 'panel': [add(fol, celesta(m, 1.2, .12), t + k * .2) for k, m in enumerate([84, 88, 91])]
    elif ty == 'zil' and zil is not None: add(fol, zil[:int(1.2 * SR)] * .25, t, pan=.4)
serit(amb, efekt('amb_dukkan.wav'), 17.0, DUR, .08)
bitir(muz, fol, amb, DUR, os.path.join(HERE, 'out', 'mix.wav'), .7)
json.dump([{'t0': e['t'], 't1': e['t1'], 'text': e['text']} for e in EV if e['type'] == 'altyazi'], open(os.path.join(HERE, 'out', 'cues.json'), 'w', encoding='utf-8'), ensure_ascii=False)
