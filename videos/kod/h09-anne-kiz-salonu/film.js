// Anne–Kız Salonu — Gül Kuaför. Sabah: Elif telefonu gösterir (panelin gerçek boş hâli "Bugün randevu yok", BugunMobil.jsx).
// Gün boyu müşteriler gelir, saç boyanır (boyamak = eylem). Akşam gül rengi suluboya; ortadaki telefonda beyaz mumla yazılmış
// randevu listesi belirir (Geldi ✓ — BugunMobil ETIKET). Defter rafa kalkar.
import { CAM, BOIL, layer, clear, line, dab, smooth } from './ortak/crayon.js';
import { group, clearGroup, part } from './ortak/rig.js';
import { kisi } from './ortak/kisi.js';
import * as E from './ortak/esya.js';
import { kamera, altyazi, yikama, metinler, olaylar } from './ortak/sayfa.js';
import { PAL } from './ortak/pal.js';
import { lerp, ss, eio } from '/core/lib.js';
const K = PAL.crayon, pr = E.pr;

export const DUR = 31.8;
export const { EV, ev } = olaylar();
const DK = { x: 60, y: 760, W: 960 }, ZEMIN = DK.y + 1100;
const AKSAM = [17.4, 19.0];
const FATMA = { sac: { tip: 'topuz', renk: '#9a9590' }, ust: K.violet, gozluk: true, seed: 1000 };
const ELIF = { sac: { tip: 'uzun', renk: K.brown }, ust: K.green, seed: 1100 };
const MUS = [
  { t: 10.2, sac: { tip: 'uzun', renk: '#2c2320' }, yeni: K.red, ust: K.blue },
  { t: 13.4, sac: { tip: 'kivircik', renk: K.brown }, yeni: K.orange, ust: K.yellow },
];
const LISTE = ['Bugün', '10:00 Ayşe  Geldi ✓', '13:00 Merve  Geldi ✓', '15:30 Derya  Geldi ✓'];

const kam = kamera([
  [0, 540, 1250, .92], [3.8, 540, 1300, .95], [4.8, 600, 1150, 1.1], [9.4, 600, 1150, 1.12],
  [10.2, 540, 1300, .95], [17.0, 540, 1300, .97], [18.6, 540, 1000, 1.0], [22.6, 540, 1000, 1.06],
  [23.6, 640, 1350, 1.05], [27.4, 640, 1350, 1.08], [29.0, 540, 1200, .9], [31.8, 540, 1180, .88],
]);
export const SUBS = [
  [0.6, 4.6, 'Fatma Hanım hep defter tutardı.'],
  [5.0, 9.6, 'Elif telefonu gösterdi. Annesi: “Hıh.”'],
  [9.8, 14.6, 'Mesajlar geldi; randevular yazıldı.'],
  [14.8, 18.4, 'Müşteriler saatinde geldi.'],
  [18.8, 23.2, 'Akşam telefona baktı. Hepsi oradaydı.'],
  [23.6, 27.6, 'Defter rafa kalktı.'],
  [27.8, DUR, 'Randevuyu SıraGO yazsın.'],
];
export const TEXTS = metinler(SUBS);
SUBS.forEach(([t0, t1, text]) => ev(t0, 'altyazi', { t1: Math.min(t1, DUR), text }));
ev(0.3, 'cizim', { d: 3.2 }); ev(5.2, 'pit'); ev(7.6, 'hih');
[10.6, 11.4, 12.2, 13.8, 14.6, 15.4].forEach((t, i) => ev(t, i % 2 ? 'glok' : 'pit', { n: i }));
MUS.forEach(m => { ev(m.t, 'zil'); ev(m.t + .6, 'boya', { d: 1.6 }); });
ev(AKSAM[0], 'firca', { d: AKSAM[1] - AKSAM[0] });
LISTE.forEach((l, i) => ev(18.4 + i * .3, 'celesta', { n: i }));
ev(24.4, 'raf'); ev(27.0, 'goz');

const BG = { f: layer(), l: layer() }, HAVA = { f: layer(), l: layer() }, KIS = group(), WASH = layer(), SUBK = layer(), SUBT = layer();

export function frame(comp, t) {
  [CAM.x, CAM.y, CAM.s] = kam(t);
  BOIL.amp = 1;
  [BG.f, BG.l, HAVA.f, HAVA.l, WASH, SUBK, SUBT].forEach(clear); clearGroup(KIS);
  const d = k => pr(t, k, k + .9), f = k => pr(t, k, k + 1.2);
  E.dukkan(BG.f, BG.l, { ...DK, d: d(.3), f: f(.9), tabela: 'Gül Kuaför', yazi: pr(t, 1.2, 2.2), tabelaRenk: K.pink, duvar: '#f2d9d0' });
  E.ayna(BG.f, BG.l, 260, 1130, d(1.6), f(2.0));
  E.koltuk(BG.f, BG.l, 260, ZEMIN, d(1.8), f(2.2));
  // raf (sağ duvar) — defter sonda buraya kalkar
  E.sekil(BG.f, BG.l, E.kutu(700, 1060, 980, 1090), K.brown, d(2.2), f(2.6), 1800, { p: .9 });
  for (const [x, c] of [[730, K.blue], [770, K.red], [805, K.yellow]]) E.sekil(BG.f, BG.l, E.kutu(x, 960, x + 30, 1060), c, d(2.4), f(2.8), 1801 + x);
  if (t > 24.4) { const k = eio(pr(t, 24.4, 25.0)); E.defter(BG.f, BG.l, lerp(560, 900, k), lerp(1500, 1010, k), { w: 150, h: 100, karalama: true }); }
  // sabah: Elif'in telefonu havada (boş panel) — sonra kuş gibi uçar
  if (t > 5.0 && t < 11) { const u = eio(pr(t, 9.6, 10.8));
    E.ekranTelefon(HAVA.f, HAVA.l, 780, 1080 - u * 1500, [{ m: 'Bugün', op: 1 }, { m: 'Bugün randevu yok', op: pr(t, 5.6, 6.0) }], { w: 420, h: 560, d: pr(t, 5.0, 5.5), f: pr(t, 5.2, 5.8), size: 36, seed: 1810 }); }
  // akşam telefonu: ekrana gün boyu beyaz mumla yazılır, gül rengi suluboyada belirir
  const ax = 540, ay = 470;
  // çerçeve akşam çizilir; ekrandaki beyaz mum yazı gün boyu (görünmeden) yazılır
  const T = t > 17.0 ? E.telefonCerceve(BG.f, BG.l, ax, ay, { w: 480, h: 600, d: d(17.0), f: f(17.2) }) : { ekran: [ax - 226, ay - 270, ax + 226, ay + 278] };
  LISTE.forEach((l, i) => { const tt = i ? [10.8, 12.0, 15.2][i - 1] : 10.4; if (t > tt) E.yaz(BG.l, l, ax, T.ekran[1] + 70 + i * 70, i ? 40 : 44, { col: K.white, p: 1, stroke: 2.5, reveal: pr(t, tt, tt + .4), seed: 1820 + i }); });
  // karakterler
  const gece = t > AKSAM[0];
  const fx = t > 23.8 && t < 25.2 ? lerp(420, 560, ss(pr(t, 23.8, 24.4))) : 420;
  const fIfade = t < 4.6 ? 'mutlu-kapali' : t < 9.6 ? (t > 7.4 ? 'duz' : 'saskin') : t < 18.6 ? 'mutlu' : t < 20.4 ? 'saskin' : 'gulen';
  if (t > 1.0) {
    kisi(KIS, { ...FATMA, x: fx, y: ZEMIN, s: 1.25, ifade: fIfade, bak: t > 18.6 && t < 23.6 ? .5 : 0,
      kolL: t < 4.6 ? { el: [40, -190] } : t > 7.4 && t < 9.6 ? { el: [40, -170] } : { a: 12 },
      kolR: t < 4.6 ? { el: [-40, -190] } : t > 7.4 && t < 9.6 ? { el: [-40, -170] } : t > 10.8 && t < 16 ? { a: 120 + Math.sin(t * 8) * 25, b: 20 } : { a: 12 } });
    if (t < 4.6) E.defter(KIS.f, KIS.l, fx + 4, ZEMIN - 260 * 1.25 + 40, { w: 150, h: 100, karalama: true });
    else if (t < 24.4) E.defter(KIS.f, KIS.l, 560, 1500, { w: 150, h: 100, karalama: true });
    if (t > 26.6 && t < 27.4) line(KIS.l, [[fx - 40, ZEMIN - 380], [fx - 16, ZEMIN - 382]], { w: 5, seed: 1830 });   // göz kırpma
  }
  if (t > 3.6) kisi(KIS, { ...ELIF, x: 820, y: ZEMIN, s: 1.15, ifade: t > 7.4 && t < 9.6 ? 'endise' : 'gulen', bak: -.4,
    kolR: t > 5.0 && t < 9.6 ? { a: 150, b: 10 } : t > 26.4 ? { a: 160 } : { a: 14 }, kolL: t > 26.4 ? { a: 150 } : { a: 12 } });
  MUS.forEach((m, i) => {
    if (t < m.t || t > m.t + 3.0) return;
    const boyandi = pr(t, m.t + .6, m.t + 2.2);
    kisi(KIS, { sac: { tip: m.sac.tip, renk: boyandi > .5 ? m.yeni : m.sac.renk }, ust: m.ust, x: 200, y: ZEMIN + 2, s: 1.0, oturan: true, seed: 1200 + i * 40,
      ifade: boyandi > .9 ? 'gulen' : 'mutlu-kapali' });
  });
  if (t > AKSAM[0]) yikama(WASH, eio(pr(t, AKSAM[0], AKSAM[1])), { t, yogun: .7 });
  altyazi(SUBK, SUBT, SUBS, t);
  comp.paperCam(CAM.x * .6, CAM.y * .6, CAM.s / .6);
  comp.begin(PAL.paper);
  comp.crayon(BG.f.c); comp.crayon(BG.l.c); comp.crayon(HAVA.f.c); comp.crayon(HAVA.l.c);
  if (t > AKSAM[0]) comp.wash(WASH.c, { color: [.86, .5, .55], resist: .93 });
  comp.group(KIS);
  comp.knock(SUBK.c); comp.crayon(SUBT.c);
  comp.finish({ vig: .28, emb: .55 });
}
