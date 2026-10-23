// Dalgın Müşteri — dikey çizgi şerit, beş panel. Hatırlatma metinleri services/hatirlatma.js'den (kısaltılmış, kelimeler aynı).
import { CAM, BOIL, layer, clear, line, dab, smooth, handCircle } from './ortak/crayon.js';
import { group, clearGroup, part, erase } from './ortak/rig.js';
import { kisi } from './ortak/kisi.js';
import * as E from './ortak/esya.js';
import { kamera, altyazi, yikama, metinler, olaylar } from './ortak/sayfa.js';
import { PAL } from './ortak/pal.js';
import { lerp, ss, eio } from '/core/lib.js';
const K = PAL.crayon, pr = E.pr;

export const DUR = 31.8;
export const { EV, ev } = olaylar();
const PY = i => 60 + i * 1580, PH = 1480;
const TP = [0, 6.6, 12.4, 18.2, 24.0];          // panelin çizilmeye başladığı an
const RAIN = [18.4, 19.6];

const MURAT = { sac: { tip: 'kivircik', renk: K.brown }, ust: K.yellow, ten: K.tan, seed: 300 };
const KAM = [
  [0, 540, PY(0) + 800, 1.0], [6.2, 540, PY(0) + 800, 1.04], [7.0, 540, PY(1) + 800, 1.0], [12.0, 540, PY(1) + 800, 1.04],
  [12.8, 540, PY(2) + 800, 1.0], [17.8, 540, PY(2) + 800, 1.04], [18.6, 540, PY(3) + 800, 1.0], [23.6, 540, PY(3) + 800, 1.04],
  [24.4, 540, PY(4) + 800, 1.0], [28.4, 540, PY(4) + 800, 1.05], [31.0, 540, 3990, .236], [31.8, 540, 3990, .236],
];
const kam = kamera(KAM);
export const SUBS = [
  [0.6, 4.4, 'Murat her şeyi unuturdu.'],
  [7.6, 11.9, 'Bir gün önce: “Yarınki Randevunuz.”'],
  [13.2, 17.9, 'Bir saat önce: “Gelebilecek misiniz?”'],
  [19.0, 23.4, 'On beş dakika kala: “Yola çıktınız mı?”'],
  [24.5, 28.0, 'Islandı ama geç kalmadı.'],
  [28.2, DUR, 'Hatırlatmayı SıraGO yapar.'],
];
export const TEXTS = metinler(SUBS);
SUBS.forEach(([t0, t1, text]) => ev(t0, 'altyazi', { t1: Math.min(t1, DUR), text }));
TP.forEach(t => ev(t, 'cizim', { d: 1.4 }));
[2.0, 3.0, 4.0].forEach((t, i) => ev(t, 'gag', { n: i }));
ev(4.6, 'yuru', { d: 1.6 });
ev(8.0, 'hatir', { n: 0 }); ev(10.2, 'tamam');
ev(13.4, 'hatir', { n: 1 }); ev(15.0, 'pit'); ev(15.8, 'glok');
ev(RAIN[0], 'firca', { d: 1.4 }); ev(18.4, 'yagmur', { d: 5.4 }); ev(19.6, 'hatir', { n: 2 }); ev(21.0, 'araba', { d: 2.2 });
ev(24.6, 'zil'); ev(25.4, 'oturur'); ev(26.0, 'havlu');
ev(28.6, 'son');

const BG = { f: layer(), l: layer() }, KIS = group(), WASH = layer(), SUBK = layer(), SUBT = layer();

export function frame(comp, t) {
  [CAM.x, CAM.y, CAM.s] = kam(t);
  BOIL.amp = t > 29 ? .5 : 1;
  [BG.f, BG.l, WASH, SUBK, SUBT].forEach(clear); clearGroup(KIS);
  const d = i => pr(t, TP[i], TP[i] + .9), f = i => pr(t, TP[i] + .3, TP[i] + 1.4);
  for (let i = 0; i < 5; i++) if (t > TP[i]) E.panel(BG.l, 40, PY(i), 1040, PY(i) + PH, d(i), 1200 + i * 3);
  panel1(t, d(0), f(0)); if (t > TP[1]) panel2(t, d(1), f(1)); if (t > TP[2]) panel3(t, d(2), f(2));
  if (t > TP[3]) panel4(t, d(3), f(3)); if (t > TP[4]) panel5(t, d(4), f(4));
  if (t > RAIN[0]) yikama(WASH, eio(pr(t, RAIN[0], RAIN[1])), { x0: 44, x1: 1036, ust: PY(3) + 4, alt: PY(3) + PH - 4, t, yogun: .55 });
  altyazi(SUBK, SUBT, SUBS, t);
  comp.paperCam(CAM.x * .6, CAM.y * .6, CAM.s / .6);
  comp.begin(PAL.paper);
  comp.crayon(BG.f.c); comp.crayon(BG.l.c);
  if (t > RAIN[0]) comp.wash(WASH.c, { color: [.42, .52, .68], resist: .9 });
  comp.group(KIS);
  comp.knock(SUBK.c); comp.crayon(SUBT.c);
  comp.finish({ vig: .28, emb: .55 });
}

// ── 1: kapı önü gag'leri (dış mekân: gökyüzü, güneş, ev duvarı, araba)
function panel1(t, d, f) {
  const z = PY(0) + 1360, y0 = PY(0);
  E.sekil(BG.f, BG.l, E.kutu(44, y0 + 4, 1036, y0 + 700), '#cfe3f1', d, f, 1400, { p: .5, gap: 14, cizgi: false });
  E.bulut(BG.f, BG.l, 640, y0 + 200, 1.0, '#f4f7fa', d, 1401); E.gunes(BG.f, BG.l, 900, y0 + 170, { r: 60, d });
  E.sekil(BG.f, BG.l, E.kutu(44, y0 + 380, 470, z), K.ochre, d, f, 1403, { p: .6 });
  E.sekil(BG.f, BG.l, [[24, y0 + 380], [257, y0 + 220], [490, y0 + 380]], K.red, d, f, 1404);
  E.kapi(BG.f, BG.l, 170, y0 + 640, z, 0, d, f);
  E.sekil(BG.f, BG.l, E.kutu(44, z, 1036, y0 + PH - 4), K.mint, d, f, 1402, { p: .6, cizgi: false });
  E.araba(BG.f, BG.l, 820, z, K.red, { d, f, s: 1.15, yon: -1 });
  if (t > 1.6) { line(BG.l, [[275, z - 420], [325, z - 420]], { w: 7, col: K.yellow, seed: 1410 }); dab(BG.f, 330, z - 420, 15, { col: K.yellow, seed: 1411 });
    if (t > 2.0 && t < 2.8) for (let k = 0; k < 4; k++) { const an = k * Math.PI / 2 + t * 3; line(BG.l, [[330 + Math.cos(an) * 26, z - 420 + Math.sin(an) * 26], [330 + Math.cos(an) * 48, z - 420 + Math.sin(an) * 48]], { w: 5, col: K.yellow, seed: 1412 + k }); } }
  if (t > 2.8) { const cx = 850, cy = z - 245; E.sekil(BG.f, BG.l, E.kutu(cx - 30, cy - 54, cx + 30, cy), '#f6efe0', 1, 1, 1420, { p: .5 });
    for (let k = 0; k < 2; k++) line(BG.l, [[cx - 10 + k * 18, cy - 64], [cx - 2 + k * 18, cy - 100], [cx - 12 + k * 18, cy - 130]], { w: 5, col: K.gray, seed: 1422 + k, draw: pr(t, 2.9, 3.4) }); }
  if (t > 3.8) { line(BG.l, [[330, z - 10], [390, z - 330]], { w: 7, seed: 1430 }); E.sekil(BG.f, BG.l, smooth([[390, z - 330], [430, z - 190], [375, z - 50], [355, z - 190]], 3), K.violet, 1, pr(t, 3.8, 4.3), 1432); }
  if (t > 1.0 && t < 6.6) {
    const yur = ss(pr(t, 4.6, 6.2)), mx = lerp(560, 1250, yur), sal = yur > 0 && yur < 1 ? Math.sin(t * 9) * 25 : 0;
    kisi(KIS, { ...MURAT, x: mx, y: z, s: 1.7, ifade: t < 1.6 ? 'mutlu' : 'mutlu-kapali', bak: .4, kolL: { a: 10 + sal }, kolR: { a: 10 - sal } });
    if (t > 1.2) E.yaz(KIS.l, '♪', mx + 110, z - 600 - Math.sin(t * 4) * 14, 80, { seed: 1440 });
  }
}
// ── 2: akşam kanepe, 24 saat hatırlatması
function panel2(t, d, f) {
  const z = PY(1) + 1360, y0 = PY(1);
  E.sekil(BG.f, BG.l, E.kutu(44, y0 + 4, 1036, z), '#e2d4ee', d, f, 1450, { p: .45, gap: 13, cizgi: false });
  E.sekil(BG.f, BG.l, E.kutu(44, z, 1036, y0 + PH - 4), K.brown, d, f, 1452, { p: .5, cizgi: false });
  E.sekil(BG.f, BG.l, E.kutu(90, y0 + 120, 440, y0 + 470), K.violet, d, f, 1454, { p: .75 });
  E.sekil(BG.f, BG.l, handCircle(340, y0 + 220, 40, 1455, .05, 24), K.yellow, d, f, 1455, { p: .95 });
  line(BG.l, [[265, y0 + 120], [265, y0 + 470]], { w: 6, seed: 1456, draw: d }); line(BG.l, [[90, y0 + 295], [440, y0 + 295]], { w: 6, seed: 1457, draw: d });
  E.kanepe(BG.f, BG.l, 330, z, K.green, d, f, 1.4);
  const msj = [{ m: 'Yarınki Randevunuz', yesil: true, op: pr(t, 8.0, 8.4) }, { m: "Yarın saat 17:00'de\nrandevunuz var.", yesil: true, op: pr(t, 8.3, 8.7) }];
  E.ekranTelefon(BG.f, BG.l, 790, y0 + 470, msj, { w: 420, h: 640, d, f, size: 40, seed: 1460 });
  if (t > 8.0 && t < 8.8) for (const k of [-1, 1]) line(BG.l, [[790 + k * 235, y0 + 420], [790 + k * 262, y0 + 470], [790 + k * 235, y0 + 520]], { w: 6, seed: 1470 + k });
  if (t > 7.5) kisi(KIS, { ...MURAT, x: 300, y: z - 6, s: 1.45, oturan: true, ifade: t > 10.2 ? 'gulen' : t > 8.0 ? 'saskin' : 'mutlu-kapali', bak: t > 8.0 ? .7 : 0,
    kolR: t > 10.2 ? { a: 160, b: 10 } : { a: 20 } });
}
// ── 3: toplantı, teyit + "1" + "Harika, sizi bekliyoruz!"
function panel3(t, d, f) {
  const z = PY(2) + 1360, y0 = PY(2);
  E.sekil(BG.f, BG.l, E.kutu(44, y0 + 4, 1036, z), '#d3e4ee', d, f, 1480, { p: .45, gap: 13, cizgi: false });
  const msj = [
    { m: 'Randevu Teyidi\nRandevunuza 1 saat kaldı.\nGelebilecek misiniz?\n1. Geliyorum\n2. İptal Et', yesil: true, op: pr(t, 13.4, 13.9) },
    { m: '1', ben: true, op: pr(t, 15.0, 15.2) },
    { m: 'Harika, sizi bekliyoruz!', yesil: true, op: pr(t, 15.8, 16.2) },
  ];
  E.ekranTelefon(BG.f, BG.l, 540, y0 + 450, msj, { w: 600, h: 760, d, f, size: 40, seed: 1490 });
  if (t < 13.2) return;
  [[200, 400, K.violet, { tip: 'uzun', renk: '#2c2320' }], [880, 500, K.blue, { tip: 'kel', renk: '#7a7470' }]].forEach(([x, sd, ust, sac]) =>
    kisi(KIS, { x, y: z, s: 1.35, seed: sd, ust, sac, ifade: 'duz', bak: x < 540 ? .5 : -.5 }));
  kisi(KIS, { ...MURAT, x: 540, y: z, s: 1.4, ifade: t > 15.8 ? 'gulen' : t > 13.4 ? 'saskin' : 'mutlu', kolR: t > 14.6 && t < 15.4 ? { a: 120, b: 30 } : { a: 15 } });
  part(KIS, E.kutu(60, z - 250, 1020, z - 205), { col: K.brown, p: .9, gap: 8, w: 10, seed: 1500 }, { w: 6, seed: 1501 });
  part(KIS, E.kutu(90, z - 205, 990, z + 2), { col: '#a87a52', p: .8, gap: 9, w: 11, seed: 1502 }, { w: 6, seed: 1503 });
}
// ── 4: yağmurda araba, 15 dakika
function panel4(t, d, f) {
  const z = PY(3) + 1360, y0 = PY(3);
  E.bulut(BG.f, BG.l, 260, y0 + 160, 1.2, '#9aa3ad', d, 1518); E.bulut(BG.f, BG.l, 760, y0 + 120, .9, '#9aa3ad', d, 1519);
  E.sekil(BG.f, BG.l, E.kutu(44, z, 1036, y0 + PH - 4), '#8a8580', d, f, 1520, { p: .6, cizgi: false });
  for (let i = 0; i < 6; i++) { const x = ((i * 220 - (t - 21) * 520 * (t > 21 ? 1 : 0)) % 1100 + 1100) % 1100; line(BG.l, [[x, z + 60], [x + 100, z + 60]], { w: 9, col: K.white, seed: 1530 + i, draw: d }); }
  const msj = [{ m: 'Randevunuza\n15 dakika kaldı!\nYola çıktınız mı?', yesil: true, op: pr(t, 19.6, 20.0) }];
  E.ekranTelefon(BG.f, BG.l, 760, y0 + 520, msj, { w: 440, h: 520, d, f, size: 46, seed: 1540 });
  if (t > 18.4) E.yagmur(BG.l, 50, y0 + 10, 1030, z, t, 1);
  if (t < 18.9) return;
  const ax = 330 + Math.sin(t * 7) * 3 * (t > 21), S = 1.7;
  kisi(KIS, { ...MURAT, x: ax + 20, y: z, s: .95, ifade: t > 20.2 ? 'gulen' : 'mutlu', oturan: true });
  const govde = [[-190, -50], [-180, -120], [-90, -130], [190, -130], [200, -115], [205, -50], [205, 90], [-190, 90]].map(([x, y]) => [ax + x * S, z + y * S]);
  erase(KIS.f, govde); erase(KIS.l, govde); erase(KIS.k, govde);   // kâğıt maskesi de: gövdeden hayalet görünmesin
  E.araba(KIS.f, KIS.l, ax, z, K.blue, { s: S, tekerlek: t * (t > 21 ? 14 : 0) });
}
// ── 5: Kuzey Berber, saat 17:00, havlu
function panel5(t, d, f) {
  const y0 = PY(4), z = y0 + 120 + 1100;
  E.dukkan(BG.f, BG.l, { x: 60, y: y0 + 120, W: 960, d, f, yazi: pr(t, TP[4] + .6, TP[4] + 1.4) });
  E.saat(BG.f, BG.l, 830, y0 + 520, 100, 5.0, { d, f });
  E.ayna(BG.f, BG.l, 260, y0 + 560, d, f);
  E.koltuk(BG.f, BG.l, 330, z, d, f);
  if (t > 25.4) {
    kisi(KIS, { ...MURAT, x: 270, y: z - 2, s: 1.1, oturan: true, ifade: t > 26.4 ? 'gulen' : 'mutlu-kapali' });
    for (let k = 0; k < 3; k++) { const yy = z - 330 + ((t * 120 + k * 40) % 120); dab(KIS.l, 200 + k * 60, yy, 7, { col: K.blue, seed: 1560 + k }); }
  } else if (t > 24.6) kisi(KIS, { ...MURAT, x: 880, y: z - 2, s: 1.2, ifade: 'mutlu', kolR: { a: 150 } });
  kisi(KIS, { x: 680, y: z - 2, s: 1.4, seed: 100, sac: { tip: 'kisa', renk: K.brown }, ust: K.blue, onluk: K.green, ifade: t > 26 ? 'gulen' : 'mutlu',
    kolL: t > 26 ? { el: [-120, -170] } : { a: 12 }, bak: -.5 });
  if (t > 26) E.sekil(KIS.f, KIS.l, E.kutu(480, z - 300, 560, z - 170), K.mint, 1, 1, 1570, { p: .9 });
}
