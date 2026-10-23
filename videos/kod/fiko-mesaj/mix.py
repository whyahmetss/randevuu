"""Müzik + foley + ambiyans → out/mix.wav (48 kHz stereo). Olaylar events.json'dan (film.js EV), müzik aynı zaman ızgarasında.
İki çözünürlük: hi-fi katman (FM elektrik piyano, yuvarlak bas, fırçalı davul) dünya; kare dalga chiptune Fiko.
Kırbaç geçişlerinde ses yok (kullanıcı kuralı: fışt/whoosh yok). Sessizlik: 31.5–33.0 yalnız oda tonu."""
import json, os, sys
import numpy as np
import soundfile as sf
LIB = os.environ['LIB']
sys.path.insert(0, os.path.join(LIB, 'core', 'audio'))
from sfx import SR, t_, env_exp, bp, lp, hp, noise, norm, thump, pop, click, add, compress, limit

HERE = os.path.dirname(os.path.abspath(__file__))
E = json.load(open(os.path.join(HERE, 'events.json'), encoding='utf-8'))
DUR = E['dur']; EV = E['ev']
N = int(DUR * SR) + SR
muz = np.zeros((N, 2)); fol = np.zeros((N, 2)); amb = np.zeros((N, 2))
BPM = 112; B = 60 / BPM; BAR = 4 * B
hz = lambda m: 440 * 2 ** ((m - 69) / 12)

# ───────── enstrümanlar
def ep(m, d=1.6, v=.5):
    """FM elektrik piyano: yumuşak tını, zamanla sönen parlaklık"""
    tt = t_(d); f = hz(m); I = 1.6 * env_exp(d, .35)
    x = np.sin(2 * np.pi * f * tt + I * np.sin(2 * np.pi * f * tt)) * env_exp(d, .9)
    x += .25 * np.sin(2 * np.pi * f * 4 * tt) * env_exp(d, .08)          # tini
    x[:96] *= np.linspace(0, 1, 96)
    return x * v

def bas(m, d=.9, v=.6):
    tt = t_(d); f = hz(m)
    x = np.sin(2 * np.pi * f * tt) + .35 * np.sin(4 * np.pi * f * tt) + .18 * np.sin(6 * np.pi * f * tt)
    x *= np.minimum(1, tt / .01) * env_exp(d, .45)
    return lp(x, 900) * v

def kare(m, d=.12, v=.25, vib=0.0):
    """chiptune kare dalga (yumuşatılmış)"""
    tt = t_(d); f = hz(m) * (1 + vib * np.sin(2 * np.pi * 5.5 * tt))
    x = np.sign(np.sin(2 * np.pi * np.cumsum(np.full(len(tt), 1.0) * f) / SR))
    x = lp(x, 5200) * np.minimum(1, tt / .004) * np.minimum(1, (d - tt) / .02)
    return x * v

def kick(v=.8): return thump(v, 58) * .9
def brush(v=.35):
    d = .22; return bp(noise(d), 1800, 7000) * env_exp(d, .06) * v
def hat(v=.12):
    d = .05; return hp(noise(d), 7000) * env_exp(d, .012) * v
def crash(v=.3):
    d = 2.0; return hp(noise(d), 4000) * env_exp(d, .6) * v
def tom(m, v=.5):
    d = .3; tt = t_(d); return np.sin(2 * np.pi * hz(m) * tt * (1 - .2 * tt)) * env_exp(d, .09) * v

def pad(ms, d, v=.12):
    tt = t_(d); x = sum(np.sin(2 * np.pi * hz(m) * tt + .4 * np.sin(2 * np.pi * .3 * tt)) for m in ms)
    a = np.minimum(1, tt / .5) * np.minimum(1, (d - tt) / .6)
    return lp(x * a, 2400) * v

# ───────── armoni: F maj7 | E m7 | D m7 | C maj7 (yumuşak iniş), bas kökleri
AKOR = [([53, 57, 60, 64], 41), ([52, 55, 59, 62], 40), ([50, 53, 57, 60], 38), ([48, 52, 55, 59], 36)]
def bolge(t0, t1, davul=None, hiz=1, yumusak=1.0, ep_v=.32):
    """[t0, t1) arası grup çalar; davul: None | 'firca' | 'cift' (zaman atlaması: hat 16'lık)"""
    i = 0; t = t0
    while t < t1 - .05:
        notlar, kok = AKOR[i % 4]
        for j, m in enumerate(notlar): add(muz, ep(m, min(BAR * 1.05, t1 - t + .4), ep_v * yumusak), t + j * .012, pan=-.25 + j * .15)
        if t + 2.5 * B < t1:
            for m in notlar[1:]: add(muz, ep(m + 12, 1.0, .11 * yumusak), t + 2.5 * B, pan=.3)
        add(muz, bas(kok, B * 1.8, .55 * yumusak), t);
        if t + 2 * B < t1: add(muz, bas(kok + 7, B * 1.6, .45 * yumusak), t + 2 * B)
        if davul:
            for b in range(4):
                tb = t + b * B
                if tb >= t1: break
                if b in (0, 2): add(muz, kick(.55 * yumusak), tb)
                if b in (1, 3): add(muz, brush(.32 * yumusak), tb, pan=.15)
                bol = 4 if davul == 'cift' else 2
                for k in range(bol): add(muz, hat(.09 * yumusak * (1.2 if k % 2 == 0 else .7)), tb + k * B / bol, pan=.35)
        t += BAR; i += 1

# 0.6: bildirimde tek akor (oda tonu üstünde)
for j, m in enumerate([53, 57, 60, 64, 67]): add(muz, ep(m, 2.6, .2), .62 + j * .03, pan=-.2 + j * .1)
bolge(3.0, 8.6)                              # piyano + bas
bolge(8.6, 14.6, 'firca')                    # davul girer
for k, m in enumerate([50, 47, 43]): add(muz, tom(m, .45), 14.6 + k * B / 2)
add(muz, crash(.22), 15.1, pan=-.3)
bolge(15.1, 18.95, 'firca')
add(muz, crash(.18), 18.95, pan=.3)
bolge(18.95, 24.55, 'cift')                  # zaman atlaması: hızlanma
add(muz, pad([53, 57, 60, 64], 1.7, .1), 24.5)   # spot: yalnız tutulan pad
bolge(26.1, 28.75, 'cift', yumusak=.85)
bolge(28.75, 31.5, None, yumusak=.7)         # davulsuz bekleyiş
# 31.5–33.0 sessizlik
# Geldi ✓: çözülme — büyük Fmaj9 + chiptune arpej (ilk ses sessizlikten sonra)
G = 34.05
for j, m in enumerate([41, 53, 57, 60, 64, 67]): add(muz, (bas(m, 2.4, .6) if m < 48 else ep(m, 3.0, .3)), G + j * .015, pan=-.3 + j * .12)
for k, m in enumerate([72, 76, 79, 84]): add(muz, kare(m, .11, .16), G + .05 + k * .09, pan=.25)
bolge(G + 2 * B, 37.4, 'firca', yumusak=.6)
# ninni: Fiko uyurken yavaş chiptune motif + pad, son akor 41.0
nin = [72, 69, 65, 69, 67, 64, 60, 64, 65]
for k, m in enumerate(nin): add(muz, kare(m, B * .9, .07, vib=.006), 37.4 + k * B, pan=.2)
add(muz, pad([53, 57, 60, 64], 4.0, .09), 37.4)
for j, m in enumerate([41, 53, 57, 60, 64, 67]): add(muz, (bas(m, 1.8, .4) if m < 48 else ep(m, 1.9, .2)), 41.0 + j * .02)

# ───────── foley (8-bit Fiko + arayüz)
def blip(m0, m1, d=.14, v=.2):
    tt = t_(d); f = hz(m0) * (hz(m1) / hz(m0)) ** (tt / d)
    x = np.sign(np.sin(2 * np.pi * np.cumsum(f) / SR)); return lp(x, 5000) * env_exp(d, d / 2.5) * v
def zil8(v=.18):
    d = .7; tt = t_(d); x = np.sign(np.sin(2 * np.pi * hz(91) * tt)) * (0.5 + .5 * np.sign(np.sin(2 * np.pi * 14 * tt)))
    return lp(x, 6000) * env_exp(d, .22) * v
def cinlama(v=.3):
    """bildirim çınlaması (kendi sentezimiz): iki yumuşak çan notası"""
    d = 1.1; tt = t_(d)
    a = sum(np.sin(2 * np.pi * hz(m) * k * tt) * env_exp(d, .5 / k) / k for m in [81] for k in (1, 2.01, 3.02))
    b = np.zeros_like(tt); o = int(.11 * SR)
    b[o:] = sum(np.sin(2 * np.pi * hz(88) * k * tt[:-o]) * env_exp(d, .45 / k)[:-o] / k for k in (1, 2.01, 3.02))
    return norm(a + b) * v
def titresim(v=.25):
    d = .9; tt = t_(d); darbe = ((tt % .3) < .2).astype(float)
    return lp(np.sin(2 * np.pi * 150 * tt) * (1 + .5 * np.sin(2 * np.pi * 37 * tt)), 600) * darbe * v
def ilet(v=.16):   # giden mesaj: küçük yukarı "tık"
    return pop(v) * .8
def al(v=.16):     # gelen mesaj: alçak iki nota
    return norm(np.concatenate([np.sin(2 * np.pi * hz(76) * t_(.07)) * env_exp(.07, .03), np.sin(2 * np.pi * hz(79) * t_(.12)) * env_exp(.12, .05)])) * v
def onay(v=.3):
    d = .5; tt = t_(d); return norm(np.sin(2 * np.pi * hz(84) * tt) * env_exp(d, .15) + .5 * np.sin(2 * np.pi * hz(91) * tt) * env_exp(d, .1)) * v
def parilti(v=.1):
    d = .6; tt = t_(d); return hp(noise(d), 6000) * env_exp(d, .15) * (1 + np.sin(2 * np.pi * 30 * tt)) * v
def horla(v=.09):
    d = .8; tt = t_(d); f = hz(48) * (1 - .15 * tt / d)
    return lp(np.sign(np.sin(2 * np.pi * np.cumsum(f) / SR)), 900) * np.sin(np.pi * tt / d) * v

for e in EV:
    t, ty = e['t'], e['type']
    if ty == 'adim': add(fol, blip(84, 86, .035, .05), t, pan=-.1)
    elif ty == 'zipla': add(fol, blip(72, 84, min(.2, e.get('d', .4) * .45), .12), t)
    elif ty == 'kon': add(fol, blip(60, 52, .08, .1 * e.get('v', .6) / .6), t)
    elif ty == 'dogus': [add(fol, blip(m, m + 5, .06, .1), t + k * .06) for k, m in enumerate([67, 72, 76, 79])]
    elif ty == 'unlem': add(fol, blip(79, 86, .06, .12), t); add(fol, blip(86, 91, .06, .1), t + .07)
    elif ty == 'sevinc': [add(fol, kare(m, .09, .12), t + k * .08, pan=.2) for k, m in enumerate([77, 81, 84, 89])]
    elif ty == 'kalp': add(fol, blip(84, 91, .1, .08), t)
    elif ty == 'zil': add(fol, zil8(.16), t, pan=.2); add(fol, zil8(.1), t + .25, pan=.2)
    elif ty == 'kivilcim': add(fol, parilti(.12), t)
    elif ty == 'horla': add(fol, horla(.08), t)
    elif ty == 'bildirim': add(fol, cinlama(.32), t)
    elif ty == 'push': add(fol, cinlama(.3), t, pan=.15)
    elif ty == 'titresim': add(fol, titresim(.3), t)
    elif ty == 'ac': add(fol, click(1.3, .12), t)
    elif ty == 'giden': add(fol, ilet(.14), t, pan=.2)
    elif ty == 'gelen': add(fol, al(.16), t, pan=-.2)
    elif ty == 'dokun': add(fol, click(1.0, .22), t)
    elif ty == 'geldi': add(fol, onay(.28), t)
    elif ty == 'saat': add(fol, click(.7, .1), t)
    # 'kirbac': bilerek sessiz; 'altyazi': .srt için

# zaman atlaması: hızlı saat tıkırtısı
tk = 19.0
while tk < 28.4: add(fol, click(2.2 if int(tk / .18) % 2 else 1.8, .04), tk, pan=.4); tk += .18

# ───────── ambiyans: gece (kilit/sohbet), dükkân (cumartesi)
def yukle(ad):
    p = os.path.join(HERE, 'out', ad)
    if not os.path.exists(p): return None
    x, sr = sf.read(p, always_2d=True); x = x.mean(axis=1)
    if sr != SR:
        from scipy.signal import resample_poly
        x = resample_poly(x, SR, sr)
    return x
def serit(x, t0, t1, g):
    if x is None: return
    n = int((t1 - t0) * SR); y = np.resize(x, n); f = int(.4 * SR)
    y[:f] *= np.linspace(0, 1, f); y[-f:] *= np.linspace(1, 0, f); add(amb, y, t0, g)
gece, dukkan = yukle('amb_gece.wav'), yukle('amb_dukkan.wav')
serit(gece, 0, 28.9, .07)
serit(dukkan, 28.6, DUR, .09)

# ───────── karışım: müzik foley altında biraz kısılır; sessizlikte müzik tamamen yok
m = muz * .55
s0, s1, f0 = int(31.5 * SR), int(33.0 * SR), int(.35 * SR)
m[s0 - f0:s0] *= np.linspace(1, 0, f0)[:, None]; m[s0:s1] *= 0
mix = m + fol * 1.0 + amb
for c in range(2): mix[:, c] = compress(mix[:, c], .35, 2.5)
for c in range(2): mix[:, c] = limit(mix[:, c], .9)
mix = mix[:int(DUR * SR)]
os.makedirs(os.path.join(HERE, 'out'), exist_ok=True)
sf.write(os.path.join(HERE, 'out', 'mix.wav'), mix.astype(np.float32), SR)
json.dump([{'t0': e['t'], 't1': e['t1'], 'text': e['text']} for e in EV if e['type'] == 'altyazi'], open(os.path.join(HERE, 'out', 'cues.json'), 'w', encoding='utf-8'), ensure_ascii=False)
print('mix.wav', round(len(mix) / SR, 2), 's, tepe', round(float(np.abs(mix).max()), 3))
