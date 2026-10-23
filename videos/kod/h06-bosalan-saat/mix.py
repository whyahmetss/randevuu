"""Boşalan Saat — müzik + foley + ambiyans → out/mix.wav. 96 BPM 4/4: celesta + ukulele + klarinet.
İptalde klarinet iner (komik hüzün) + sessizlik vuruşu; Zeynep'in mesajında glockenspiel yükselir; 15:00'te çözülme. Whoosh yok."""
import json, os, sys
import numpy as np
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, 'ortak'))
from muzik import *  # noqa: F401,F403

E = json.load(open(os.path.join(HERE, 'events.json'), encoding='utf-8'))
DUR, EV = E['dur'], E['ev']
N = int(DUR * SR) + SR
muz, fol, amb = np.zeros((N, 2)), np.zeros((N, 2)), np.zeros((N, 2))
B = 60 / 96; BAR = 4 * B
AKOR = [([57, 60, 64, 69], 45), ([53, 57, 60, 65], 41), ([60, 64, 67, 72], 48), ([55, 59, 62, 67], 43)]   # Am F C G

def grup(t0, t1, v=1.0, cel=True):
    t, i = t0, 0
    while t < t1 - .05:
        notalar, kok = AKOR[i % 4]
        add(muz, klarinet(kok, B * 1.8, .22 * v), t, pan=-.25); add(muz, klarinet(kok + 7, B * 1.6, .18 * v), t + 2 * B, pan=-.25)
        for k in (1, 2, 3):
            if t + k * B < t1: add(muz, strum(notalar, B * 1.1, .15 * v), t + k * B, pan=.2)
        if cel:
            for k, m in enumerate([notalar[-1] + 12, notalar[1] + 12]): add(muz, celesta(m, 1.2, .1 * v), t + k * 2 * B + B / 2, pan=.3)
        t += BAR; i += 1

grup(0.3, 8.0, 1.0)
# iptal: klarinet iner, sonra bir vuruş sessizlik
for k, m in enumerate([60, 58, 55, 52]): add(muz, klarinet(m, B * .9, .22), 8.0 + k * B * .9, pan=-.1)
grup(11.6, 14.4, .55, cel=False)
grup(14.4, 19.6, 1.0)
# 15:00 çözülme: oyuncak piyano arpej + C majör
for k, m in enumerate([72, 76, 79, 84]): add(muz, oyuncak_piyano(m, .9, .22), 20.4 + k * .12, pan=.15)
grup(20.4, 24.8, .9)
for j, m in enumerate([48, 60, 64, 67, 72]): add(muz, klarinet(m, 3.0, .2) if m < 55 else ukulele(m, 3.2, .24), 24.8 + j * .03)
for k, m in enumerate([79, 76, 72, 76, 79, 84]): add(muz, celesta(m, 1.4, .12), 25.4 + k * B, pan=.2)

efekt = lambda ad: yukle(os.path.join(HERE, 'out', ad))
for e in EV:
    t, ty = e['t'], e['type']
    if ty == 'cizim': add(fol, pastel(e['d'], .13, 1.4, 3), t)
    elif ty == 'hatir': [add(fol, glok(m, 1.2, .18), t + k * .14, pan=.15) for k, m in enumerate([79, 84, 88])]
    elif ty == 'pit': add(fol, pit(.1), t, pan=-.2)
    elif ty == 'iptal': add(fol, tahta(.1, 400), t)
    elif ty == 'karala': add(fol, pastel(.4, .16, 3.0, 9), t)
    elif ty == 'glok': [add(fol, glok(m, 1.0, .16), t + k * .1) for k, m in enumerate([84, 88, 91])]
    elif ty == 'onay': add(fol, celesta(96, 1.4, .16), t)
    elif ty == 'yaz': add(fol, pastel(.7, .12, 2.2, 11), t)
    elif ty == 'oturur': add(fol, tahta(.08, 300), t)
s0, s1 = int(10.6 * SR), int(11.6 * SR); muz[s0:s1] *= .0
serit(amb, efekt('amb_sabah.wav'), 0, DUR, .04)
bitir(muz, fol, amb, DUR, os.path.join(HERE, 'out', 'mix.wav'), .7)
json.dump([{'t0': e['t'], 't1': e['t1'], 'text': e['text']} for e in EV if e['type'] == 'altyazi'], open(os.path.join(HERE, 'out', 'cues.json'), 'w', encoding='utf-8'), ensure_ascii=False)
