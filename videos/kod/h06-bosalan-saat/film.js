// Boşalan Saat — üç bantlı sayfa: ofis (Ahmet) / sokak (Zeynep) / klinik (Dr. Selin). Metinler koddan (TREATMENT.md).
import { CAM, BOIL, layer, clear, line, dab, smooth, handCircle } from './ortak/crayon.js';
import { group, clearGroup, part } from './ortak/rig.js';
import { kisi } from './ortak/kisi.js';
import * as E from './ortak/esya.js';
import { kamera, altyazi, metinler, olaylar } from './ortak/sayfa.js';
import { PAL } from './ortak/pal.js';
const K = PAL.crayon, pr = E.pr;

export const DUR = 28.6;
export const { EV, ev } = olaylar();
const B1 = [60, 1040], B2 = [1100, 1860], B3 = [1920, 2960];      // bantlar (y0, y1)
const AHMET = { sac: { tip: 'kisa', renk: '#2c2320' }, ust: K.blue, seed: 600 };
const ZEYNEP = { sac: { tip: 'topuz', renk: K.brown }, ust: K.pink, ten: K.peach, seed: 700 };
const SELIN = { sac: { tip: 'uzun', renk: '#2c2320' }, ust: K.mint, gozluk: true, seed: 800 };

const kam = kamera([
  [0, 540, 1510, .64], [3.6, 540, 1510, .66], [4.6, 540, 600, 1.12], [9.4, 540, 600, 1.15],
  [10.2, 540, 2380, 1.12], [13.4, 540, 2380, 1.15], [14.2, 540, 1500, 1.12], [18.6, 540, 1500, 1.15],
  [19.4, 540, 2420, 1.0], [23.6, 540, 2420, 1.04], [25.0, 540, 1510, .64], [28.6, 540, 1510, .66],
]);
export const SUBS = [
  [0.6, 4.4, 'Ahmet’in toplantısı uzadı.'],
  [5.0, 9.6, 'Bir saat önce sordu: “Gelebilecek misiniz?”'],
  [9.8, 13.8, 'Ahmet “İptal” dedi; saat boşaldı.'],
  [14.0, 18.6, 'Zeynep yazdı; o saat ona yazıldı.'],
  [19.2, 23.4, 'Koltuk boş kalmadı.'],
  [24.0, DUR, 'Randevuyu SıraGO yazsın.'],
];
export const TEXTS = metinler(SUBS);
SUBS.forEach(([t0, t1, text]) => ev(t0, 'altyazi', { t1: Math.min(t1, DUR), text }));
ev(0.2, 'cizim', { d: 3.2 });
ev(5.4, 'hatir'); ev(7.4, 'pit'); ev(8.0, 'iptal');
ev(10.4, 'karala'); ev(14.6, 'pit'); ev(15.6, 'glok'); ev(16.8, 'pit'); ev(17.4, 'onay'); ev(17.8, 'yaz');
ev(19.8, 'oturur'); ev(20.4, 'cozulme'); ev(25.0, 'son');

const BG = { f: layer(), l: layer() }, KIS = group(), SUBK = layer(), SUBT = layer();

export function frame(comp, t) {
  [CAM.x, CAM.y, CAM.s] = kam(t);
  BOIL.amp = t > 25 ? .6 : 1;
  [BG.f, BG.l, SUBK, SUBT].forEach(clear); clearGroup(KIS);
  const d = pr(t, .2, 1.4), f = pr(t, .8, 2.8);
  [B1, B2, B3].forEach(([a, b], i) => E.panel(BG.l, 40, a, 1040, b, d, 1600 + i * 3));
  ofis(t, d, f); sokak(t, d, f); klinik(t, d, f);
  altyazi(SUBK, SUBT, SUBS, t);
  comp.paperCam(CAM.x * .6, CAM.y * .6, CAM.s / .6);
  comp.begin(PAL.paper);
  comp.crayon(BG.f.c); comp.crayon(BG.l.c);
  comp.group(KIS);
  comp.knock(SUBK.c); comp.crayon(SUBT.c);
  comp.finish({ vig: .28, emb: .55 });
}

function ofis(t, d, f) {
  const [y0, y1] = B1, z = y1 - 60;
  E.sekil(BG.f, BG.l, E.kutu(44, y0 + 4, 1036, z), '#d3e4ee', d, f, 1610, { p: .45, gap: 13, cizgi: false });
  E.saat(BG.f, BG.l, 160, y0 + 170, 80, 2.0 + pr(t, 0, 9) * .05, { d, f });
  const msj = [
    { m: 'Randevu Teyidi\nRandevunuza 1 saat kaldı.\nGelebilecek misiniz?\n1. Geliyorum\n2. İptal Et', yesil: true, op: pr(t, 5.4, 5.9) },
    { m: '2', ben: true, op: pr(t, 7.4, 7.6) },
    { m: 'Randevunuz iptal edildi.', yesil: true, op: pr(t, 8.0, 8.4) },
  ];
  E.ekranTelefon(BG.f, BG.l, 760, y0 + 380, msj, { w: 470, h: 640, d, f, size: 34, seed: 1620 });
  if (t > 1.2) {
    kisi(KIS, { x: 470, y: z, s: 1.0, seed: 610, sac: { tip: 'kel', renk: '#7a7470' }, ust: K.ochre, ifade: 'duz', bak: -.4, kolR: { a: 120 + Math.sin(t * 5) * 20, b: 20 } });
    const ah = t > 26 ? 'gulen' : t > 7.0 && t < 9.6 ? 'uzgun' : t > 5.4 ? 'saskin' : 'endise';
    kisi(KIS, { ...AHMET, x: 200, y: z, s: 1.1, ifade: ah, bak: .5, kolR: t > 7.0 && t < 7.6 ? { a: 110, b: 30 } : t > 26 ? { a: 160 } : { a: 15 } });
    part(KIS, E.kutu(60, z - 200, 640, z - 165), { col: K.brown, p: .9, gap: 8, w: 10, seed: 1630 }, { w: 6, seed: 1631 });
    part(KIS, E.kutu(80, z - 165, 620, z + 2), { col: '#a87a52', p: .8, gap: 9, w: 11, seed: 1632 }, { w: 6, seed: 1633 });
    // masadaki kâğıt yığını
    for (let i = 0; i < 4; i++) part(KIS, E.kutu(300 + i * 6, z - 230 - i * 12, 420 + i * 6, z - 218 - i * 12), { col: '#f3ecdc', p: .5, gap: 6, w: 7, seed: 1634 + i }, { w: 3.5, seed: 1640 + i });
  }
}

function sokak(t, d, f) {
  const [y0, y1] = B2, z = y1 - 80;
  E.sekil(BG.f, BG.l, E.kutu(44, y0 + 4, 1036, z), '#e4f0dc', d, f, 1650, { p: .5, gap: 13, cizgi: false });
  E.sekil(BG.f, BG.l, E.kutu(44, z, 1036, y1 - 4), '#8a8580', d, f, 1651, { p: .6, cizgi: false });
  for (const [x, h] of [[110, 260], [250, 330]]) { E.sekil(BG.f, BG.l, E.kutu(x - 14, z - h, x + 14, z), K.brown, d, f, 1652 + x); E.sekil(BG.f, BG.l, handCircle(x, z - h - 40, 80, 1655 + x, .1, 28), K.green, d, f, 1656 + x); }
  const msj = [
    { m: "Bugün 3'e yer var mı?", ben: true, op: pr(t, 14.6, 14.8) },
    { m: 'Bugün (31 Ekim) için\nboş saatler: 15:00.\nSize hangisi uygun?', yesil: true, op: pr(t, 15.6, 16.0) },
    { m: '15:00', ben: true, op: pr(t, 16.8, 17.0) },
    { m: 'Randevunuz Oluşturuldu!', yesil: true, op: pr(t, 17.4, 17.8) },
  ];
  E.ekranTelefon(BG.f, BG.l, 760, y0 + 360, msj, { w: 470, h: 600, d, f, size: 34, seed: 1660 });
  if (t > 1.6) kisi(KIS, { ...ZEYNEP, x: 400, y: z, s: 1.15, ifade: t > 17.4 ? 'gulen' : t > 14.4 ? 'mutlu' : 'duz', bak: .6, kolR: { el: [80, -230] }, tut: 'telefon' });
}

function klinik(t, d, f) {
  const [y0, y1] = B3, z = y1 - 60;
  E.sekil(BG.f, BG.l, E.kutu(44, y0 + 4, 1036, z), '#eef3f0', d, f, 1670, { p: .4, gap: 14, cizgi: false });
  E.sekil(BG.f, BG.l, E.kutu(44, z, 1036, y1 - 4), '#c9d9d2', d, f, 1671, { p: .6, cizgi: false });
  E.disKoltugu(BG.f, BG.l, 520, z, d, f);
  E.saat(BG.f, BG.l, 890, y0 + 160, 80, t > 19.0 ? 3.0 : 2.0, { d, f });
  // duvardaki randevu kartı
  const kx = 120, ky = y0 + 80;
  E.sekil(BG.f, BG.l, E.kutu(kx, ky, kx + 380, ky + 220), '#fbf3df', d, f, 1680, { p: .5 });
  if (t > 1.8) E.yaz(BG.l, '15:00 Ahmet', kx + 190, ky + 80, 50, { reveal: pr(t, 1.8, 2.4), seed: 1681 });
  if (t > 10.4) line(BG.l, [[kx + 30, ky + 64], [kx + 350, ky + 58]], { w: 9, col: K.red, seed: 1682, draw: pr(t, 10.4, 10.8) });
  if (t > 17.8) E.yaz(BG.l, '15:00 Zeynep', kx + 190, ky + 170, 50, { col: K.green, reveal: pr(t, 17.8, 18.5), seed: 1683 });
  const sel = t > 19.8 ? 'gulen' : t > 10.4 && t < 17.8 ? 'endise' : 'mutlu';
  if (t > 2.0) kisi(KIS, { ...SELIN, x: 840, y: z, s: 1.2, ifade: sel, bak: -.5, kolL: t > 20 ? { a: 150 } : { a: 12 } });
  if (t > 19.8) kisi(KIS, { ...ZEYNEP, x: 400, y: z + 8, s: 1.0, oturan: true, ifade: 'gulen' });
  else if (t > 10.8 && t < 17.8) E.yaz(KIS.l, '?', 520, z - 330, 110, { seed: 1690 });
}
