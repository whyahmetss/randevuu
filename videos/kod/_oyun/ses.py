"""Ritim oyunu ses paleti (tamamen sentez): sinüs kick (yumuşak doyum), bant geçiren gürültü clap/snare, hat, slap bas,
bakır stab (kapanan filtreli detune testere), kare lead (vibratolu), marimba, müzik kutusu zili, üçgen ped, inek çanı;
oyuncak foley: pop, plop+boing iniş, damga, daktilo tık, buzzer, ding, servo. Parlak majör pop armonisi."""
import numpy as np
from muzik import SR, t_, env_exp, bp, lp, hp, noise, norm, add, hz, kare, glok, celesta  # noqa: F401

def kick(v=.9):
    d = .32; tt = t_(d); f = 50 + 110 * np.exp(-tt / .03)
    return np.tanh(1.6 * np.sin(2 * np.pi * np.cumsum(f) / SR) * env_exp(d, .12)) * v
def clap(v=.4):
    d = .22; x = np.zeros(int(d * SR))
    for o in (0, .012, .024): s = int(o * SR); n = bp(noise(d - o), 900, 4500) * env_exp(d - o, .04); x[s:s + len(n)] += n
    return x * v
def hat(v=.14, acik=False):
    d = .2 if acik else .05; return hp(noise(d), 7500) * env_exp(d, .06 if acik else .012) * v
def slap(m, d=.3, v=.5):
    tt = t_(d); f = hz(m); x = np.sin(2 * np.pi * f * tt) + .5 * np.sin(4 * np.pi * f * tt) * env_exp(d, .04) + .25 * np.sign(np.sin(2 * np.pi * f * tt)) * env_exp(d, .02)
    return lp(x * env_exp(d, .12), 1800) * v
def stab(notalar, d=.25, v=.3):
    tt = t_(d); x = sum(((2 * ((hz(m) * k * tt) % 1)) - 1) for m in notalar for k in (1, 1.006))
    cut = 400 + 5000 * np.exp(-tt / .06)
    y = np.zeros_like(x); a = 0.0
    for i in range(len(x)): c = min(.99, 2 * np.pi * cut[i] / SR); a += c * (x[i] - a); y[i] = a
    return y * env_exp(d, .1) * v / len(notalar)
def marimba(m, d=.5, v=.3):
    tt = t_(d); f = hz(m); return (np.sin(2 * np.pi * f * tt) * env_exp(d, .18) + .4 * np.sin(2 * np.pi * f * 3.9 * tt) * env_exp(d, .03)) * v
def cowbell(v=.2):
    d = .3; tt = t_(d); return bp(np.sign(np.sin(2 * np.pi * 540 * tt)) + np.sign(np.sin(2 * np.pi * 800 * tt)), 600, 3000) * env_exp(d, .08) * v
def pop(v=.3, f0=500):
    d = .12; tt = t_(d); f = f0 + 1500 * tt / d; return np.sin(2 * np.pi * np.cumsum(f) / SR) * env_exp(d, .04) * v
def boing(v=.25):
    d = .45; tt = t_(d); f = 180 + 90 * np.sin(2 * np.pi * 9 * tt) * np.exp(-tt / .15); return np.sin(2 * np.pi * np.cumsum(f) / SR) * env_exp(d, .14) * v
def plop(v=.3):
    d = .15; tt = t_(d); f = 300 * np.exp(-tt / .05) + 90; return np.sin(2 * np.pi * np.cumsum(f) / SR) * env_exp(d, .05) * v
def damga(v=.5):
    d = .25; tt = t_(d); return (np.sin(2 * np.pi * 70 * tt) * env_exp(d, .07) + lp(noise(d), 800) * env_exp(d, .02)) * v
def buzzer(v=.25, d=.6):
    tt = t_(d); return lp(np.sign(np.sin(2 * np.pi * 110 * tt)) + np.sign(np.sin(2 * np.pi * 116 * tt)), 2200) * np.minimum(1, (d - tt) / .05) * v
def ding(v=.3):
    a, b = glok(88, 1.2, v), glok(95, 1.0, v * .5); a[:len(b)] += b; return a
def daktilo(v=.1):
    d = .03; return hp(noise(d), 3000) * env_exp(d, .005) * v
def jingle(v=.4):
    """crash + yükselen bakır + trampet dizisi (1 ölçü öncesi)"""
    d = 1.1; x = np.zeros(int(d * SR)); tt = t_(d)
    cr = hp(noise(d), 4000) * env_exp(d, .5) * .3; x += cr
    for i, m in enumerate([60, 64, 67, 72]): s = int(i * .08 * SR); y = stab([m, m + 4, m + 7], .3, .5); x[s:s + len(y)] += y
    for i in range(10): s = int(i * .05 * SR); y = clap(.15 + i * .02); x[s:s + len(y)] += y[:len(x) - s]
    return x * v

def davul(buf, t0, t1, B, yogun=1.0, sekiz=True):
    t, i = t0, 0
    while t < t1 - 1e-3:
        if i % 2 == 0: add(buf, kick(.85 * yogun), t)
        else: add(buf, clap(.38 * yogun), t, pan=.1)
        for k in ((0, .5) if sekiz else (0,)): add(buf, hat(.12 * yogun), t + k * B, pan=.35)
        t += B; i += 1
def bas_hat(buf, t0, t1, B, kokler, v=1.0):
    t, i = t0, 0
    while t < t1 - 1e-3:
        k = kokler[(i // 4) % len(kokler)]
        for j, o in enumerate([0, 12, 0, 7]):
            if t + j * B / 2 < t1: add(buf, slap(k + o, B * .45, .4 * v), t + j * B / 2, pan=-.15)
        t += B * 2; i += 2
