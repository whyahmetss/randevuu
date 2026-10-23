"""Gece Üçte Diş Ağrısı — müzik + foley + ambiyans → out/mix.wav. Gece: müzik kutusu ninnisi (72 BPM 3/4), cırcır;
mesajlarda glockenspiel; Kerem uyurken müzik kutusu yavaşlar. Sabah: ukulele + oyuncak piyano, kuşlar. Whoosh yok."""
import json, os, sys
import numpy as np
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, 'ortak'))
from muzik import *  # noqa: F401,F403

E = json.load(open(os.path.join(HERE, 'events.json'), encoding='utf-8'))
DUR, EV = E['dur'], E['ev']
N = int(DUR * SR) + SR
muz, fol, amb = np.zeros((N, 2)), np.zeros((N, 2)), np.zeros((N, 2))
B = 60 / 72
NINNI = [(76, 1), (74, 1), (72, 1), (69, 2), (72, 1), (74, 1), (72, 1), (67, 3), (69, 1), (72, 1), (76, 1), (74, 3)]
def ninni(t0, t1, v=.18, adim=1.0, sarkma=0.0):
    t = t0
    while t < t1:
        for m, b in NINNI:
            if t >= t1: break
            add(muz, muzik_kutusu(m, b * B * adim * 1.5, v, sarkma), t, pan=.15); t += b * B * adim
ninni(0.4, 14.6)
for k in range(int(14.6 / (3 * B))): add(muz, klarinet([45, 41, 43, 48][k % 4], 3 * B * .95, .1), 0.4 + k * 3 * B, pan=-.2)
ninni(14.6, 17.6, .16, adim=1.35, sarkma=.02)
# sabah: ukulele + oyuncak piyano, C majör
B2 = 60 / 104
AK = [([60, 64, 67, 72], 48), ([57, 60, 65, 69], 41), ([55, 59, 62, 67], 43), ([60, 64, 67, 72], 48)]
t, i = 18.2, 0
while t < 24.6:
    n, k = AK[i % 4]
    add(muz, klarinet(k, B2 * 1.8, .2), t, pan=-.25)
    for j in (1, 2, 3): add(muz, strum(n, B2 * 1.1, .16), t + j * B2, pan=.2)
    add(muz, oyuncak_piyano(n[-1] + 12, .8, .14), t + B2 / 2, pan=.3)
    t += 4 * B2; i += 1
for j, m in enumerate([48, 60, 64, 67, 72]): add(muz, klarinet(m, 3.4, .18) if m < 55 else ukulele(m, 3.6, .22), 24.6 + j * .03)
for k, m in enumerate([72, 76, 79, 84, 79]): add(muz, celesta(m, 1.6, .12), 25.0 + k * B2, pan=.2)

efekt = lambda ad: yukle(os.path.join(HERE, 'out', ad))
for e in EV:
    t, ty = e['t'], e['type']
    if ty == 'cizim': add(fol, pastel(e['d'], .12, 1.4, int(t * 7)), t)
    elif ty == 'firca': add(fol, islak_firca(e['d'] + .6, .16), t)
    elif ty == 'tik': [add(fol, tahta(.04, 1400), t + k * 1.0) for k in range(3)]
    elif ty == 'yaz': add(fol, pit(.1), t, pan=-.2)
    elif ty == 'glok': [add(fol, glok(m, 1.2, .14), t + k * .12, pan=.2) for k, m in enumerate([84, 88, 91])]
    elif ty == 'onay': add(fol, celesta(96, 1.6, .16), t)
    elif ty == 'oturur': add(fol, tahta(.08, 300), t)
    elif ty == 'cozulme': [add(fol, oyuncak_piyano(m, .9, .18), t + k * .12) for k, m in enumerate([72, 76, 79, 84])]
serit(amb, efekt('amb_circir.wav'), 0.8, 17.8, .07)
serit(amb, efekt('amb_sabah.wav'), 17.4, DUR, .06)
bitir(muz, fol, amb, DUR, os.path.join(HERE, 'out', 'mix.wav'), .7)
json.dump([{'t0': e['t'], 't1': e['t1'], 'text': e['text']} for e in EV if e['type'] == 'altyazi'], open(os.path.join(HERE, 'out', 'cues.json'), 'w', encoding='utf-8'), ensure_ascii=False)
