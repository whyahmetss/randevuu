"""Pazartesi Tatil — caz valsi (3/4, 120 BPM): naylon tel gitar (ukulele sentezi pes) + klarinet + fırçalı hissi (çalkalayıcı).
Kalem darbeleri bant geçiren hışırtı; renk gelince göl ambiyansı (J-cut); titreşimde müzik bir ölçü susar; balıkta sıçrama. Whoosh yok."""
import json, os, sys
import numpy as np
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, 'ortak'))
from muzik import *  # noqa: F401,F403

E = json.load(open(os.path.join(HERE, 'events.json'), encoding='utf-8'))
DUR, EV = E['dur'], E['ev']
N = int(DUR * SR) + SR
muz, fol, amb = np.zeros((N, 2)), np.zeros((N, 2)), np.zeros((N, 2))
B = 60 / 120; BAR = 3 * B
AKOR = [([55, 59, 62, 66], 43), ([52, 55, 59, 62], 40), ([57, 60, 64, 67], 45), ([50, 54, 57, 62], 38)]   # Gmaj7 Em7 Am7 D
def vals(t0, t1, v=1.0):
    t, i = t0, 0
    while t < t1 - .05:
        n, k = AKOR[i % 4]
        add(muz, klarinet(k + 12, B * .9, .16 * v), t, pan=-.3)
        for j in (1, 2):
            if t + j * B < t1: add(muz, strum([m - 12 for m in n], B * 1.0, .17 * v), t + j * B, pan=.15); add(muz, calkalayici(.04 * v), t + j * B, pan=.4)
        t += BAR; i += 1
TEMA = [(74, 1), (71, 1), (67, 1), (69, 2), (71, 1), (72, 1), (74, 1), (76, 1), (74, 3)]
def tema(t0, v=.18, enst=None):
    t = t0
    for m, b in TEMA: add(muz, (enst or flut)(m, b * B * .95, v), t, pan=.2); t += b * B
vals(1.0, 8.2, .8)
vals(10.6, 19.4, .9); tema(11.6, .14, klarinet)
vals(20.4, 28.0, 1.0); tema(21.0, .2); tema(25.2, .16, celesta)

efekt = lambda ad: yukle(os.path.join(HERE, 'out', ad))
for e in EV:
    t, ty = e['t'], e['type']
    if ty == 'kalem': add(fol, pastel(max(.06, e['d']), .05, 4.0, int(t * 100)) , t, pan=-.1)
    elif ty == 'renk': add(fol, islak_firca(e['d'] + .8, .14), t)
    elif ty == 'titresim': add(fol, titresim(.22), t, pan=.1)
    elif ty == 'omuz': add(fol, bp(noise(.3), 300, 1500) * env_exp(.3, .1) * .1, t)
    elif ty == 'yaz': add(fol, pastel(e['d'] + .2, .07, 3.5, int(t * 10)), t, pan=-.3)
    elif ty == 'yaz_bot': add(fol, pastel(e['d'] + .4, .07, 3.5, int(t * 10)), t, pan=.3); add(fol, glok(84, .9, .1), t)
    elif ty == 'samandira': [add(fol, pit(.06), t + k * .27) for k in range(3)]
    elif ty == 'sicrama': d = .7; add(fol, bp(noise(d), 500, 5000) * env_exp(d, .15) * .3, t)
    elif ty == 'balik': [add(fol, glok(m, 1.0, .16), t + k * .1, pan=.2) for k, m in enumerate([79, 83, 86, 91])]
# susma: titreşim anında müzik bir ölçü yok (8.2–10.6 zaten boş)
serit(amb, efekt('amb_sabah.wav'), 5.2, DUR, .07)
bitir(muz, fol, amb, DUR, os.path.join(HERE, 'out', 'mix.wav'), .7)
json.dump([{'t0': e['t'], 't1': e['t1'], 'text': e['text']} for e in EV if e['type'] == 'altyazi'], open(os.path.join(HERE, 'out', 'cues.json'), 'w', encoding='utf-8'), ensure_ascii=False)
