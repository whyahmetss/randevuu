// Gece Üçte Diş Ağrısı — üstte gece (lacivert suluboya akar; telefondaki yazılar beyaz mum → gecede parlar), altta sabah klinik.
// Bot metinleri: sohbetAsistani.js saatler ("Yarın (1 Kasım) için boş saatler: 09:00–10:00 arası. Size hangisi uygun?"),
// botMesajlar.js "Randevunuz Oluşturuldu!". Tıbbi tavsiye yok: bot yalnız randevu yazar.
import { CAM, BOIL, layer, clear, line, dab, smooth, handCircle } from './ortak/crayon.js';
import { group, clearGroup, part } from './ortak/rig.js';
import { kisi } from './ortak/kisi.js';
import * as E from './ortak/esya.js';
import { kamera, altyazi, yikama, metinler, olaylar } from './ortak/sayfa.js';
import { PAL } from './ortak/pal.js';
import { eio, hash } from '/core/lib.js';
const K = PAL.crayon, pr = E.pr;

export const DUR = 28.6;
export const { EV, ev } = olaylar();
const P1 = [60, 1300], P2 = [1360, 2500];
const GECE = [1.0, 2.6];
const KEREM = { sac: { tip: 'kisa', renk: K.brown }, ust: K.red, ten: K.peach, seed: 900 };
const SELIN = { sac: { tip: 'uzun', renk: '#2c2320' }, ust: K.mint, gozluk: true, seed: 800 };

const kam = kamera([
  [0, 540, 760, 1.0], [4.4, 540, 760, 1.03], [5.2, 600, 820, 1.18], [13.8, 600, 820, 1.22], [14.6, 420, 860, 1.25],
  [17.2, 420, 860, 1.28], [18.2, 540, 1960, 1.0], [23.4, 540, 1960, 1.04], [24.6, 540, 1280, .75], [28.6, 540, 1280, .76],
]);
export const SUBS = [
  [0.7, 4.7, 'Gece üç. Kerem’in dişi zonkluyor.'],
  [5.2, 9.6, 'Klinik kapalı. Ama mesajı cevaplandı.'],
  [10.0, 14.2, 'Sabah dokuza randevusu yazıldı.'],
  [14.6, 18.0, 'Kerem sonunda uyudu.'],
  [18.8, 23.2, 'Sabah dokuzda koltuktaydı.'],
  [24.0, DUR, 'Klinik kapalıyken de randevu yazılır.'],
];
export const TEXTS = metinler(SUBS);
SUBS.forEach(([t0, t1, text]) => ev(t0, 'altyazi', { t1: Math.min(t1, DUR), text }));
ev(0.2, 'cizim', { d: 1.2 }); ev(GECE[0], 'firca', { d: GECE[1] - GECE[0] });
ev(3.0, 'tik'); ev(5.6, 'yaz'); ev(6.8, 'glok'); ev(8.6, 'yaz'); ev(9.4, 'onay');
ev(14.6, 'ninni'); ev(17.4, 'cizim', { d: 1.0 }); ev(18.4, 'sabah'); ev(19.0, 'oturur'); ev(20.0, 'cozulme'); ev(24.6, 'son');

const BG = { f: layer(), l: layer() }, KIS = group(), WASH = layer(), SUBK = layer(), SUBT = layer();

export function frame(comp, t) {
  [CAM.x, CAM.y, CAM.s] = kam(t);
  BOIL.amp = t > 14.6 && t < 17.4 ? .5 : 1;
  [BG.f, BG.l, WASH, SUBK, SUBT].forEach(clear); clearGroup(KIS);
  gece(t); if (t > 17.2) sabah(t);
  if (t > GECE[0]) yikama(WASH, eio(pr(t, GECE[0], GECE[1])), { x0: 44, x1: 1036, ust: P1[0] + 4, alt: P1[1] - 4, t });
  altyazi(SUBK, SUBT, SUBS, t);
  comp.paperCam(CAM.x * .6, CAM.y * .6, CAM.s / .6);
  comp.begin(PAL.paper);
  comp.crayon(BG.f.c); comp.crayon(BG.l.c);
  if (t > GECE[0]) comp.wash(WASH.c, { color: PAL.wash, resist: .93 });
  comp.group(KIS);
  comp.knock(SUBK.c); comp.crayon(SUBT.c);
  comp.finish({ vig: .3, emb: .55 });
}

function gece(t) {
  const [y0, y1] = P1, z = y1 - 80, d = pr(t, .2, 1.1), f = pr(t, .5, 1.6);
  E.panel(BG.l, 40, y0, 1040, y1, d, 1700);
  E.sekil(BG.f, BG.l, E.kutu(44, z, 1036, y1 - 4), K.brown, d, f, 1702, { p: .7, cizgi: false });
  // pencere: ay (sarı, ağır) + beyaz mum yıldızlar (suluboyada belirir)
  E.sekil(BG.f, BG.l, E.kutu(90, y0 + 110, 420, y0 + 430), null, d, 0, 1704);
  E.sekil(BG.f, BG.l, handCircle(320, y0 + 200, 46, 1705, .05, 24), K.yellow, d, f, 1705, { p: 1, cross: true });
  for (let i = 0; i < 9; i++) dab(BG.l, 110 + hash(i * 3.3) * 290, y0 + 130 + hash(i * 7.1) * 280, 5 + hash(i) * 4, { col: K.white, seed: 1710 + i, p: 1 });
  line(BG.l, [[255, y0 + 110], [255, y0 + 430]], { w: 6, seed: 1720, draw: d }); line(BG.l, [[90, y0 + 270], [420, y0 + 270]], { w: 6, seed: 1721, draw: d });
  // komodin + saat (03:07)
  E.sekil(BG.f, BG.l, E.kutu(560, z - 230, 720, z), K.brown, d, f, 1722);
  E.saat(BG.f, BG.l, 640, z - 300, 60, 3 + 7 / 60 + pr(t, 0, 14) * .06, { d, f });
  E.yatak(BG.f, BG.l, 320, z, d, f);
  // telefon: beyaz mumla yazılan mesajlar gece mavisinde parlar
  if (t > 4.6) {
    const ph = [600, y0 + 140, 1000, y0 + 770];
    E.telefonCerceve(BG.f, BG.l, (ph[0] + ph[2]) / 2, (ph[1] + ph[3]) / 2, { w: ph[2] - ph[0], h: ph[3] - ph[1], d: pr(t, 4.6, 5.2), f: pr(t, 4.8, 5.6) });
    const M = [
      { t: 5.6, m: 'Dişim çok ağrıyor,\nyarın gelebilir miyim?', ben: true },
      { t: 6.8, m: 'Yarın (1 Kasım) için\nboş saatler:\n09:00–10:00 arası.\nSize hangisi uygun?' },
      { t: 8.6, m: '09:00', ben: true },
      { t: 9.4, m: 'Randevunuz\nOluşturuldu!' },
    ];
    let y = ph[1] + 50;
    M.forEach((q, i) => {
      if (t < q.t) return;
      const sat = q.m.split('\n'), size = 30, bw = Math.max(...sat.map(l => l.length)) * size * .47 + 30, bh = sat.length * size * 1.18 + 16;
      const bx = q.ben ? ph[2] - 26 - bw : ph[0] + 26;
      line(BG.l, [...E.yuvarlak(bx, y, bx + bw, y + bh, 12), [bx + 12, y]], { w: 4, col: K.white, p: 1, seed: 1730 + i, draw: pr(t, q.t, q.t + .3) });
      sat.forEach((l, j) => E.yaz(BG.l, l, bx + bw / 2, y + 8 + (j + 1) * size * 1.1, size, { col: K.white, p: 1, stroke: 2, reveal: pr(t, q.t + .1, q.t + .5), seed: 1740 + i * 5 + j }));
      y += bh + 14;
    });
  }
  // Kerem: yatakta yatar (yanağı şiş, buz torbası) → oturur, yazar → yatar, uyur
  const otur = t > 3.4 && t < 14.4;
  if (otur) kisi(KIS, { ...KEREM, x: 300, y: z - 60, s: 1.0, oturan: true, ifade: t > 9.4 ? 'gulen' : t > 6.8 ? 'saskin' : 'endise', bak: .6,
    kolR: t > 5.2 && t < 9.0 ? { el: [120, -220] } : { a: 30 }, tut: t > 5.2 && t < 9.0 ? 'telefon' : null, kolL: { el: [-60, -250] } });
  else kisi(KIS, { ...KEREM, x: 470, y: z - 150, s: 1.0, r: -Math.PI / 2, ifade: t > 14.4 ? 'uyku' : 'endise' });
  if (t < 14.4) { const yx = otur ? 245 : 205, yy = otur ? z - 330 : z - 220; dab(KIS.f, yx, yy, 26, { col: K.pink, seed: 1750, sq: .8 }); dab(KIS.l, yx - 20, yy - 6, 18, { col: K.blue, seed: 1751, p: .9 }); }
  E.yorgan(KIS, otur ? 200 : 240, z, K.violet);
  if (t > 14.8) for (let j = 0; j < 3; j++) { const u = ((t - 14.8) * .5 + j / 3) % 1; E.yaz(KIS.l, 'z', 300 + u * 80, z - 300 - u * 160, 50 + u * 30, { col: K.white, p: 1 - u, seed: 1760 + j }); }
}

function sabah(t) {
  const [y0, y1] = P2, z = y1 - 60, d = pr(t, 17.2, 18.2), f = pr(t, 17.6, 18.8);
  E.panel(BG.l, 40, y0, 1040, y1, d, 1770);
  E.sekil(BG.f, BG.l, E.kutu(44, y0 + 4, 1036, z), '#eef3f0', d, f, 1772, { p: .4, gap: 14, cizgi: false });
  E.sekil(BG.f, BG.l, E.kutu(44, z, 1036, y1 - 4), '#c9d9d2', d, f, 1773, { p: .6, cizgi: false });
  E.sekil(BG.f, BG.l, E.kutu(90, y0 + 90, 400, y0 + 380), '#cfe3f1', d, f, 1774, { p: .6 });
  E.gunes(BG.f, BG.l, 250, y0 + 230, { r: 60, d });
  E.saat(BG.f, BG.l, 880, y0 + 160, 80, 9.0, { d, f });
  E.disKoltugu(BG.f, BG.l, 520, z, d, f);
  if (t > 18.6) kisi(KIS, { ...SELIN, x: 860, y: z, s: 1.2, ifade: 'gulen', bak: -.5, kolL: t > 20 ? { a: 150 } : { a: 12 } });
  if (t > 19.0) kisi(KIS, { ...KEREM, x: 400, y: z + 8, s: 1.0, oturan: true, ifade: t > 20 ? 'gulen' : 'mutlu' });
}
