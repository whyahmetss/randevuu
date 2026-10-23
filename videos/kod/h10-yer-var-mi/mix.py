"""Yer Var mı? — ritim oyunu sesi: 120 BPM, parlak majör pop (C–Am–F–G), tur başına tat (1. tur funk, 2. tur hızlı
elektro, tabela ölçüsü yalnız davul, final jingle + tema). Çağrıda bakır stab, cevapta marimba + ding, düşüşte plop/boing,
kararda damga + crash. Whoosh yok."""
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
KOK = [48, 45, 41, 43]; AK = [[60, 64, 67], [57, 60, 64], [53, 57, 60], [55, 59, 62]]
def akor(t0, t1, v=1.0):
    t, i = t0, 0
    while t < t1 - 1e-3:
        for k in (1, 3): add(muz, stab(AK[i % 4], .18, .22 * v), t + k * B / 2 + B, pan=.2)
        t += BAR; i += 1
# kart (0–2): jingle + pad
add(muz, jingle(.5), 0.0)
davul(muz, at(1), at(5), B, .9); bas_hat(muz, at(1), at(5), B, KOK); akor(at(1), at(5), .8)
add(muz, jingle(.5), at(5))
davul(muz, at(6), at(10), B / 2 * 2, 1.0); bas_hat(muz, at(6), at(10), B, KOK, 1.1); akor(at(6), at(10), 1.0)
davul(muz, at(10), at(11), B, .9, sekiz=True)                       # yalnız davul
add(muz, jingle(.5), at(11))
davul(muz, at(11), at(14), B, .8); bas_hat(muz, at(11), at(14), B, KOK, .9); akor(at(11), at(14), .9)
TEMA = [72, 76, 79, 76, 77, 76, 74, 72]
for k, m in enumerate(TEMA): add(muz, kare(m, B * .9, .1, vib=.006), at(11) + k * B, pan=.1)
for k, m in enumerate(TEMA): add(muz, kare(m + 12, B * .9, .08, vib=.006), at(12, 2) + k * B / 2, pan=-.1)
for j, m in enumerate([48, 60, 64, 67, 72]): add(muz, marimba(m, 1.6, .3), at(13, 2) + j * .02)

for e in EV:
    t, ty = e['t'], e['type']
    if ty == 'dus': add(fol, plop(.22), t + .28)
    elif ty == 'cagri': add(fol, stab([67, 71, 74], .16, .35), t - .02, pan=-.3); add(fol, boing(.12), t)
    elif ty == 'cevap': add(fol, marimba([79, 81, 84, 86][e.get('i', 0) % 4], .4, .3), t, pan=.3); add(fol, pop(.18), t)
    elif ty == 'dolu': add(fol, marimba(72, .3, .3), t, pan=.3); add(fol, marimba(76, .3, .3), t + .12, pan=.3)
    elif ty == 'karar': add(fol, damga(.6), t); add(fol, hat(.25, acik=True), t)
    elif ty == 'tik': add(fol, ding(.14), t, pan=.2)
    elif ty == 'flas': add(fol, damga(.4), t); add(fol, celesta(96, 1.2, .2), t + .05)
serit(amb, yukle(os.path.join(HERE, 'out', 'amb_dukkan.wav')), 2.0, 20.0, .04)
bitir(muz, fol, amb, DUR, os.path.join(HERE, 'out', 'mix.wav'), .55, yumusak=True)
json.dump([{'t0': e['t'], 't1': e['t1'], 'text': e['text']} for e in EV if e['type'] == 'altyazi'], open(os.path.join(HERE, 'out', 'cues.json'), 'w', encoding='utf-8'), ensure_ascii=False)
