// Zaman çizelgesi: kamera, iki telefonun durumu, Fiko, dokunuş, bilgi katmanları ve ses olayları (tek kaynak).
import { clamp, lerp, seg, ss, eio, eo, back, hash } from '/core/lib.js';

export const DUR = 42.0;
export const BPM = 112, B = 60 / BPM;
export const EV = [];
const ev = (t, type, o = {}) => EV.push({ t: +t.toFixed(3), type, ...o });

// ───────── kamera: [t, cx, cy, z, geçiş] — dünya noktası (cx, cy) kadraj ortasında, z yakınlık (≥ 1)
const KAM = [
  [0.0, 215, 473, 1.9], [2.6, 215, 330, 2.3, 'eio'],
  [3.4, 215, 640, 2.6, 'eio'], [6.2, 245, 660, 2.7, 'ss'], [8.4, 230, 650, 2.55, 'eio'],
  [11.6, 215, 640, 2.4, 'ss'], [14.6, 215, 620, 2.25, 'ss'],
  [15.1, 815, 330, 2.3, 'whip'], [18.4, 815, 300, 2.5, 'ss'],
  [18.95, 215, 600, 2.25, 'whip'], [24.2, 215, 610, 2.25, 'ss'], [25.0, 235, 660, 2.6, 'eio'], [26.2, 235, 660, 2.62, 'ss'],
  [27.0, 215, 610, 2.25, 'eio'], [28.2, 215, 610, 2.25, 'ss'],
  [28.75, 815, 470, 2.05, 'whip'], [31.4, 815, 520, 2.45, 'ss'], [34.6, 815, 540, 2.55, 'ss'],
  [38.2, 815, 500, 1.85, 'eio'], [42.0, 815, 490, 1.92, 'ss'],
];
const EASE = { ss, eio, whip: x => eio(x) };
export function camAt(t) {
  if (t <= KAM[0][0]) return KAM[0].slice(1, 4);
  for (let i = 1; i < KAM.length; i++) {
    const [t1, x1, y1, z1, e] = KAM[i], [t0, x0, y0, z0] = KAM[i - 1];
    if (t < t1) {
      const d = e === 'whip' ? .42 : t1 - t0, a = Math.max(t0, t1 - d);
      const k = EASE[e || 'ss'](seg(t, a, t1));
      // yakınlık logaritmik geçer (itmeler doğal hız)
      return [lerp(x0, x1, k), lerp(y0, y1, k), Math.exp(lerp(Math.log(z0), Math.log(z1), k))];
    }
  }
  return KAM[KAM.length - 1].slice(1, 4);
}

// ───────── A telefonu (esnafın WhatsApp'ı)
export const GIRIS = { m1: 3.0, m2: 8.6, m3: 11.9, m4: 12.5, gun2: 19.45, m5: 19.7, gun3: 21.9, m6: 22.1, m7: 23.7,
  m8: 24.3, m9: 26.4 };
const BANNER = 0.6;
export function durumA(t) {
  const gor = {};
  for (const [id, g] of Object.entries(GIRIS)) {
    const k = seg(t, g, g + .3);
    gor[id] = t < g ? { op: 0, sc: 1 } : g <= 3.0 ? { op: 1, sc: 1 } : { op: clamp(k * 2), sc: lerp(.9, 1, back(k, 2.2)), dy: (1 - eo(k)) * 12 };
  }
  const saat = t < 19.3 ? (t < 11.9 ? '21:40' : '21:41') : t < 21.9 ? '17:00' : t < 23.7 ? '16:00' : t < 26.4 ? '16:02' : '16:45';
  const kb = seg(t, BANNER, BANNER + .5);
  return {
    kilit: { op: 1 - seg(t, 3.0, 3.35), tarih: 'Perşembe 29 Ekim', saat: '21:40',
      ban: { y: lerp(-130, 252, back(kb, 1.4)), op: clamp(kb * 3) } },
    wa: { op: seg(t, 3.0, 3.3), saat, gor, giris: { metin: '' } },
  };
}

// ───────── B telefonu (SıraGO paneli)
export const PUSH = 15.25, ACIK = [32.95, 33.35], GELDI = 34.05;
export function durumB(t) {
  const kp = seg(t, PUSH, PUSH + .5);
  const acik = t < ACIK[0] ? 0 : t < GELDI ? eo(seg(t, ACIK[0], ACIK[1])) : 1 - eio(seg(t, GELDI + .1, GELDI + .4));
  return {
    kilit: { op: 1 - seg(t, 28.5, 28.7), tarih: 'Perşembe 29 Ekim', saat: '21:41',
      push: { y: lerp(-130, 252, back(kp, 1.4)), op: clamp(kp * 3) } },
    pnl: { op: seg(t, 28.5, 28.7), saat: t < 30.6 ? '16:59' : '17:00', acik, mDurum: t < GELDI ? 'onaylandi' : 'tamamlandi',
      basili: t > 33.9 && t < 34.05 },
  };
}

// ───────── Fiko
class Fiko {
  constructor(px = 4) { this.px = px; this.seglar = []; this.ziplar = []; }
  ekle(s) { this.seglar.push(s); return this; }
  dur(t0, t1, at, o = {}) { return this.ekle({ k: 'dur', t0, t1, at, ...o }); }
  yuru(t0, t1, from, to, o = {}) { for (let t = t0 + .05; t < t1 - .04; t += .12) ev(t, 'adim'); return this.ekle({ k: 'yuru', t0, t1, from, to, ...o }); }
  zipla(t0, t1, from, to, h = 70, o = {}) { this.ziplar.push({ t0, t1 }); ev(t0 - .02, 'zipla', { d: t1 - t0 }); ev(t1, 'kon', { v: o.buyuk ? 1 : .6 });
    return this.ekle({ k: 'zipla', t0, t1, from, to, h, ...o }); }
  gizle(t0, t1) { return this.ekle({ k: 'gizle', t0, t1 }); }
  seg(t) { let s = null; for (const x of this.seglar) { if (x.t0 <= t && t < x.t1) return x; if (x.t0 <= t) s = x; } return s; }
  eval(t, A) {
    const s = this.seg(t); if (!s || s.k === 'gizle') return null;
    const px = this.px; let pos, legs = 'stand', flip = s.flip || false, sq = 0, arms = 'down', eyes = 'n';
    const P = f => (typeof f === 'function' ? f(A, t) : f);
    if (s.k === 'dur') pos = P(s.at);
    if (s.k === 'yuru') { const a = P(s.from), b = P(s.to); if (!a || !b) return null; const p = ss(seg(t, s.t0, s.t1));
      pos = { x: lerp(a.x, b.x, p), y: lerp(a.y, b.y, p) }; legs = Math.floor(t * 8.4) % 2 ? 'walkA' : 'walkB'; flip = b.x < a.x; }
    if (s.k === 'zipla') { const a = P(s.from), b = P(s.to); if (!a || !b) return null; const p = seg(t, s.t0, s.t1);
      const tepe = Math.min(a.y, b.y) - s.h, cy = 2 * tepe - (a.y + b.y) / 2;
      pos = { x: lerp(a.x, b.x, p), y: (1 - p) ** 2 * a.y + 2 * (1 - p) * p * cy + p * p * b.y };
      legs = 'tuck'; flip = b.x < a.x - 2 ? true : b.x > a.x + 2 ? false : flip; sq = p < .5 ? -.22 * (1 - p * 2) : -.1 * (p * 2 - 1); arms = 'up'; }
    if (!pos) return null;
    for (const j of this.ziplar) {
      if (t >= j.t0 - .14 && t < j.t0) sq = Math.max(sq, .28 * ss(seg(t, j.t0 - .14, j.t0)));
      if (t >= j.t1 && t < j.t1 + .22) { const k = seg(t, j.t1, j.t1 + .22); sq = .32 * (1 - k) * Math.cos(k * 7); }
    }
    if (s.k === 'dur' && !s.sabit) { const bp = ((t % B) + B) % B; if (bp < .12) sq += .06 * Math.sin(bp / .12 * Math.PI); }
    const bl = Math.floor(t / 2.7), bt = t - bl * 2.7 - hash(bl * 3.1) * 1.8;
    if (bt > 0 && bt < .1) eyes = 'blink';
    if (s.eyes) { const e = typeof s.eyes === 'function' ? s.eyes(t) : s.eyes; if (e && !(eyes === 'blink' && 'nlrd'.includes(e))) eyes = e; }
    if (s.arms) arms = typeof s.arms === 'function' ? s.arms(t) : s.arms;
    if (s.legs) legs = s.legs;
    if (s.sq) sq += s.sq(t);
    let op = 1; if (s.dogus) op = seg(t, s.dogus, s.dogus + .2);
    return { x: Math.round(pos.x / (px / 2)) * (px / 2), y: pos.y, px, flip, sq, legs, arms, eyes, op, shadow: s.k === 'zipla' ? 0 : 1 };
  }
}

// bağlantı noktası: öğe geçici olarak yoksa son bilinen yeri kullanır
const ust = (key, fx = .5, dx = 0, dy = 0) => { let son = null; return A => { const p = A(key, fx, 0); if (p) son = { x: p.x + dx, y: p.y + dy }; return son; }; };
const nk = (x, y) => () => ({ x, y });

export const F = new Fiko(3);
F.gizle(0, 1.15)
  .dur(1.15, 2.95, ust('ban', .2), { dogus: 1.15, eyes: t => (t < 1.5 ? 'happy' : t < 2.55 ? 'r' : 'wide') })
  .zipla(2.95, 3.5, ust('ban', .2), ust('m1', .14), 60)
  .dur(3.5, 3.7, ust('m1', .14), { eyes: 'd' })
  .yuru(3.7, 6.3, ust('m1', .14), ust('m1', .86), { eyes: 'd' })
  .dur(6.3, 8.75, ust('m1', .86), { eyes: t => (t < 6.9 ? 'wide' : t < 8.2 ? 'u' : 'd'), arms: t => (t > 6.9 && t < 8.3 ? 'hold' : 'down') })
  .zipla(8.75, 9.3, ust('m1', .86), ust('m2', .88), 50)
  .dur(9.3, 12.65, ust('m2', .88), { eyes: t => (t < 11.95 ? 'happy' : 'l') })
  .zipla(12.65, 13.15, ust('m2', .88), ust('m4', .88), 60)
  .dur(13.15, 14.55, ust('m4', .88), { eyes: 'happy', arms: t => (t < 14.2 ? 'up' : 'down') })
  .zipla(14.55, 15.0, ust('m4', .88), nk(560, 300), 120)
  .gizle(15.0, 15.7)
  .zipla(15.7, 16.25, nk(560, 120), ust('push', .78), 40, { buyuk: true })
  .dur(16.25, 18.45, ust('push', .78), { eyes: t => (t < 17.2 ? 'happy' : 'd') })
  .zipla(18.45, 18.9, ust('push', .78), nk(560, 120), 80)
  .gizle(18.9, 19.95)
  .zipla(19.95, 20.4, nk(470, 400), ust('m5', .88), 60)
  .dur(20.4, 22.35, ust('m5', .88), { eyes: 'happy', arms: 'hold' })
  .zipla(22.35, 22.8, ust('m5', .88), ust('m6', .88), 60)
  .dur(22.8, 24.45, ust('m6', .88), { eyes: t => (t < 23.7 ? 'happy' : 'l'), arms: t => (t < 23.6 ? 'hold' : 'down') })
  .zipla(24.45, 24.9, ust('m6', .88), ust('m8', .88), 60)
  .dur(24.9, 26.6, ust('m8', .88), { eyes: 'happy' })
  .zipla(26.6, 27.05, ust('m8', .88), ust('m9', .88), 60)
  .dur(27.05, 28.2, ust('m9', .88), { eyes: 'happy', arms: 'hold' })
  .zipla(28.2, 28.6, ust('m9', .88), nk(470, 300), 90)
  .gizle(28.6, 29.0)
  .zipla(29.0, 29.5, nk(560, 380), ust('rM', .62), 70, { buyuk: true })
  .dur(29.5, 34.2, ust('rM', .62), { eyes: t => (t < 30.4 ? 'n' : t < 31.2 ? 'u' : t < 32.5 ? 'l' : t < 34.05 ? 'd' : 'happy') })
  .zipla(34.2, 34.62, ust('rM', .62), ust('rM', .62), 50)
  .dur(34.62, 35.2, ust('rM', .62), { eyes: 'happy', arms: 'up' })
  .yuru(35.2, 36.1, ust('rM', .62), ust('rM', .8))
  .dur(36.1, DUR + 1, ust('rM', .8), { eyes: t => (t < 36.5 ? 'happy' : 'shut'), legs: 'sit', sabit: true,
    sq: t => (t > 36.5 ? .03 * Math.sin((t - 36.5) * 2.4) : 0) });

// Fiko'nun oyunculuk eklentileri (zaman → ne çizilir); main.js çizer
export const EK = {
  dogus: 1.15, unlem: [6.4, 6.9], dusun: [6.95, 8.3], sevinc: [13.2, 14.2], kalp: [16.45, 25.0], zil: [20.45, 22.95, 27.1],
  geldi: GELDI + .15, uyku: 36.6,
};
ev(1.15, 'dogus'); ev(6.42, 'unlem'); ev(13.2, 'sevinc'); ev(16.45, 'kalp'); ev(25.0, 'kalp');
for (const z of EK.zil) ev(z, 'zil');
ev(EK.geldi, 'kivilcim'); ev(36.7, 'horla'); ev(38.6, 'horla'); ev(40.5, 'horla');

// ───────── dokunuş (esnafın parmağı yok: ekran kaydındaki dokunma göstergesi)
export const DOKUN = [
  { t0: 32.35, t1: 32.9, from: 'alt', to: ['rMsat', .45, .5], bas: 32.9 },
  { t0: 33.45, t1: 33.9, from: ['rMsat', .45, .5], to: ['geldi', .5, .5], bas: 33.95 },
];
export const DOKUN_GORUN = [32.3, 34.5];
for (const d of DOKUN) ev(d.bas, 'dokun');
ev(GELDI, 'geldi');

// ───────── UI olayları
ev(BANNER, 'bildirim'); ev(BANNER + .05, 'titresim');
ev(3.0, 'ac');
ev(GIRIS.m2, 'giden'); ev(GIRIS.m3, 'gelen'); ev(GIRIS.m4, 'giden');
ev(PUSH - .15, 'push');
ev(GIRIS.m5, 'giden'); ev(GIRIS.m6, 'giden'); ev(GIRIS.m7, 'gelen'); ev(GIRIS.m8, 'giden'); ev(GIRIS.m9, 'giden');
ev(30.6, 'saat');
for (const t of [15.1, 18.95, 28.75]) ev(t, 'kirbac');

// ───────── bilgi katmanları
export const ALTYAZI = [
  [0.3, 4.65, 'Dükkân kapandı. Mesajlar kapanmadı.'],
  [4.75, 9.25, "<em>SıraGO</em> senin WhatsApp'ından cevap verir."],
  [9.35, 13.4, 'Boş saati bilir, randevuyu yazar.'],
  [15.15, 19.35, 'Randevu panele kendiliğinden düşer.'],
  [19.45, 23.5, 'Randevudan önce hatırlatır.'],
  [23.8, 27.6, "Müşteri “Geliyorum” der."],
  [34.25, 37.8, 'Sen sadece işine bakarsın.'],
  [37.85, DUR + .5, "Sen işine bak.<br>Randevuyu <em>SıraGO</em> yazsın.", 'son'],
];
for (const [t0, t1, m] of ALTYAZI) ev(t0, 'altyazi', { t1, text: m.replace(/<br>/g, ' ').replace(/<[^>]+>/g, '') });
export const BOLUM = [[3.2, 14.6, '01', 'Cevap'], [15.0, 18.6, '02', 'Panel'], [19.0, 28.3, '03', 'Hatırlatma'], [28.8, 35.8, '04', 'Geldi']];
export const HIZ = [[19.2, 21.85, 'Cuma 17:00', '1 gün kala'], [21.85, 26.3, 'Cmt 16:00', '1 saat kala'], [26.3, 28.3, 'Cmt 16:45', '15 dk kala']];
export const SPOT = { anahtar: 'm8', t0: 24.55, t1: 26.1 };
export const SESSIZ = [31.5, 33.0];
