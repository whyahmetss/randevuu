"""Pastel resimli kitap ses paleti (sentez, örnek kütüphanesi yok): küçük ahşap/metal enstrümanlar, yay ve kuyruklu piyano yok.
ukulele (naylon tel, eklemeli), klarinet (tek harmonikler), müzik kutusu, glockenspiel, celesta, oyuncak piyano, flüt,
çalkalayıcı, tahta blok. Foley: pastel sürtünmesi, ıslak fırça, bant, telefon titreşimi. Hepsi mono float @ SR (48 kHz)."""
import os, sys
import numpy as np
LIB = os.environ['LIB']
sys.path.insert(0, os.path.join(LIB, 'core', 'audio'))
from sfx import SR, t_, env_exp, bp, lp, hp, noise, norm, add, compress, limit  # noqa: F401

hz = lambda m: 440 * 2 ** ((m - 69) / 12)

def _kismi(f, d, kismilar, atak=.004):
    tt = t_(d); x = np.zeros_like(tt)
    for oran, a, tau in kismilar:
        if f * oran < SR / 2.2: x += a * np.sin(2 * np.pi * f * oran * tt + oran) * env_exp(d, tau)
    n = int(atak * SR); x[:n] *= np.linspace(0, 1, n)
    return x

def ukulele(m, d=1.4, v=.35):
    f = hz(m)
    x = _kismi(f, d, [(1, 1, .55), (2.003, .5, .32), (3.01, .3, .2), (4.02, .18, .13), (5.03, .1, .09), (6.05, .06, .06)])
    x += lp(noise(d), 3000) * env_exp(d, .006) * .25          # tırnak
    return x * v

def strum(notalar, d=1.2, v=.28, aralik=.018):
    out = np.zeros(int((d + aralik * len(notalar)) * SR))
    for i, m in enumerate(notalar):
        y = ukulele(m, d, v * (1 - .08 * i)); s = int(i * aralik * SR); out[s:s + len(y)] += y
    return out

def klarinet(m, d=.6, v=.3, vib=.004):
    tt = t_(d); f = hz(m) * (1 + vib * np.sin(2 * np.pi * 5.2 * tt) * np.minimum(1, tt / .25))
    faz = 2 * np.pi * np.cumsum(f) / SR
    x = sum(a * np.sin(k * faz) for k, a in [(1, 1), (3, .45), (5, .22), (7, .1), (9, .05)])
    a = np.minimum(1, tt / .04) * np.minimum(1, (d - tt) / .08)
    return lp(x * a, 2600) * v

def muzik_kutusu(m, d=1.6, v=.22, sarkma=0.0):
    f = hz(m) * (1 - sarkma)
    return _kismi(f, d, [(1, 1, .7), (3.9, .25, .12), (6.8, .1, .05)], .001) * v

def glok(m, d=1.4, v=.22):
    return _kismi(hz(m), d, [(1, 1, .6), (2.76, .35, .18), (5.4, .15, .07)], .001) * v

def celesta(m, d=1.8, v=.2):
    return _kismi(hz(m), d, [(1, 1, .9), (2, .2, .3), (4, .12, .12)], .002) * v

def oyuncak_piyano(m, d=.9, v=.22):
    return _kismi(hz(m), d, [(1, 1, .35), (3.1, .4, .12), (5.2, .2, .05)], .001) * v

def flut(m, d=.8, v=.24):
    tt = t_(d); f = hz(m) * (1 + .005 * np.sin(2 * np.pi * 5 * tt) * np.minimum(1, tt / .3))
    faz = 2 * np.pi * np.cumsum(f) / SR
    x = np.sin(faz) + .18 * np.sin(2 * faz) + .06 * np.sin(3 * faz)
    x += bp(noise(d), 1500, 6000) * .05
    a = np.minimum(1, tt / .07) * np.minimum(1, (d - tt) / .12)
    return x * a * v

def calkalayici(v=.08):
    d = .12; return bp(noise(d), 4000, 11000) * np.sin(np.pi * t_(d) / d) ** 2 * v

def tahta(v=.18, f=900):
    d = .12; tt = t_(d); return (np.sin(2 * np.pi * f * tt) * env_exp(d, .018) + bp(noise(d), 1500, 4000) * env_exp(d, .004) * .4) * v

# ───────── foley
def pastel(d, v=.12, hiz=1.0, tohum=0):
    """pastel sürtünmesi: takılıp kayan bantlı gürültü; hız arttıkça tane sıklaşır"""
    rng = np.random.default_rng(tohum); tt = t_(d)
    tane = (rng.random(len(tt)) < .0025 * hiz).astype(float)
    tane = np.convolve(tane, np.hanning(int(.004 * SR)), 'same')
    x = bp(noise(d), 1800, 6500) * (.35 + .65 * np.clip(tane * 3, 0, 1))
    zarf = .5 + .5 * np.abs(np.sin(2 * np.pi * (1.7 * hiz) * tt + rng.random() * 6))   # ileri-geri boyama
    a = np.minimum(1, tt / .05) * np.minimum(1, (d - tt) / .08)
    return x * zarf * a * v

def islak_firca(d, v=.12):
    tt = t_(d); x = lp(noise(d), 1400) * (.6 + .4 * np.sin(2 * np.pi * .9 * tt))
    a = np.minimum(1, tt / .3) * np.minimum(1, (d - tt) / .5)
    return x * a * v

def bant(v=.12):
    d = .35; tt = t_(d); return bp(noise(d), 2000, 9000) * (1 + np.sin(2 * np.pi * 60 * tt)) * np.minimum(1, (d - tt) / .1) * v

def titresim(v=.22):
    d = .7; tt = t_(d); darbe = ((tt % .25) < .17).astype(float)
    return lp(np.sin(2 * np.pi * 160 * tt) * (1 + .5 * np.sin(2 * np.pi * 33 * tt)), 600) * darbe * v

def pit(v=.12):
    d = .12; tt = t_(d); f = 600 + 900 * tt / d
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * env_exp(d, .035) * v

def yukle(yol, sr=SR):
    import soundfile as sf
    if not os.path.exists(yol): return None
    x, r = sf.read(yol, always_2d=True); x = x.mean(axis=1)
    if r != sr:
        from scipy.signal import resample_poly
        x = resample_poly(x, sr, r)
    return x

def serit(buf, x, t0, t1, g, fade=.5):
    """ambiyansı [t0, t1) arasına döngüyle yayar"""
    if x is None: return
    n = int((t1 - t0) * SR); y = np.resize(x, n).copy(); f = min(int(fade * SR), n // 2)
    y[:f] *= np.linspace(0, 1, f); y[-f:] *= np.linspace(1, 0, f); add(buf, y, t0, g)

def bitir(muz, fol, amb, dur, yol, muz_g=.6, yumusak=False):
    import soundfile as sf
    mix = muz * muz_g + fol + amb
    if yumusak:   # ritim oyunu: sert vuruşları yumuşak kırp (tepe/ses oranı düşer, loudnorm tepeyi aşmaz)
        mix = np.tanh(mix * 2.2) / 2.2
    for c in range(2): mix[:, c] = compress(mix[:, c], .3 if yumusak else .35, 4 if yumusak else 2.5)
    for c in range(2): mix[:, c] = limit(mix[:, c], .9)
    mix = mix[:int(dur * SR)]
    sf.write(yol, mix.astype(np.float32), SR)
    print('mix.wav', round(len(mix) / SR, 2), 's, tepe', round(float(np.abs(mix).max()), 3))

def kare(m, d=.12, v=.25, vib=0.0):
    """chiptune kare dalga (yumuşatılmış), isteğe bağlı vibrato"""
    tt = t_(d); f = hz(m) * (1 + vib * np.sin(2 * np.pi * 5.5 * tt))
    x = np.sign(np.sin(2 * np.pi * np.cumsum(f) / SR))
    x = lp(x, 5200) * np.minimum(1, tt / .004) * np.minimum(1, (d - tt) / .02)
    return x * v
