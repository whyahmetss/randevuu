// İlk Dükkân — zaman çizelgesi ve sayfa çizimi (pastel resimli kitap, dikey). TREATMENT.md'deki vuruşlar.
import { CAM, BOIL, layer, clear, line, fill, dab, text, handCircle, smooth, sx, sy } from './ortak/crayon.js';
import { group, clearGroup, part } from './ortak/rig.js';
import { kisi } from './ortak/kisi.js';
import * as E from './ortak/esya.js';
import { PAL } from './ortak/pal.js';
import { clamp, lerp, ss, eio, eo, hash } from '/core/lib.js';
const K = PAL.crayon, pr = E.pr;

export const DUR = 32.6;
export const EV = [];
const ev = (t, type, o = {}) => EV.push({ t: +t.toFixed(3), type, ...o });

// ───────── sayfa düzeni (dünya)
const SAYFA = [0, 0, 1080, 2000];
const DK = { x: 60, y: 760, W: 960 };
const ZEMIN = DK.y + 1140 - 40;               // 1860
const KOLTUK_X = 300, TEZ = [690, 980], TEL = [835, ZEMIN - 290 - 160];   // telefon tezgâhın üstünde dik
const KAPI_X = DK.x + DK.W - 130;
const PEN = [90, 230, 560, 700];              // annenin evi (x0, y0, x1, y1)
const LAMBA = [560, 930];

// ───────── kamera: [t, x, y, s]
const KAM = [
  [0, 540, 1300, .92], [3.8, 540, 1320, .95], [5.0, 600, 1440, 1.2], [7.4, 600, 1440, 1.22],
  [8.6, 360, 620, 1.35], [11.0, 360, 620, 1.38], [11.8, 470, 1500, 1.55], [13.8, 480, 1500, 1.58],
  [14.8, 640, 1240, 1.3], [18.0, 650, 1240, 1.32], [18.9, 540, 1240, .9], [24.0, 540, 1240, .92],
  [26.4, 540, 1240, .92], [27.6, 800, 1420, 1.55], [28.8, 800, 1420, 1.58], [30.0, 540, 1150, .78], [32.6, 540, 1080, .5],
];
function kam(t) {
  if (t <= KAM[0][0]) return KAM[0].slice(1);
  for (let i = 1; i < KAM.length; i++) if (t < KAM[i][0]) {
    const a = KAM[i - 1], b = KAM[i], k = eio((t - a[0]) / (b[0] - a[0]));
    return [lerp(a[1], b[1], k), lerp(a[2], b[2], k), Math.exp(lerp(Math.log(a[3]), Math.log(b[3]), k))];
  }
  return KAM[KAM.length - 1].slice(1);
}

// ───────── olay zamanları
const MUS = [   // müşteriler: kapıda, koltukta, çıkış
  { t: 18.6, ad: 'Emre', sac: { tip: 'kisa', renk: '#2c2320' }, ust: K.mint, ten: K.peach },
  { t: 20.4, ad: 'Burak', sac: { tip: 'kivircik', renk: K.brown }, ust: K.red, ten: K.tan, biyik: true },
  { t: 22.2, ad: 'Can', sac: { tip: 'kel', renk: '#7a7470' }, ust: K.ochre, ten: K.peach },
];
const BALON = [
  { t: 14.6, x: 300, y: 880, m: "Abi bugün 1'e yer var mı?" },
  { t: 15.6, x: 470, y: 990, m: 'Randevunuz Oluşturuldu!', yesil: true },
  { t: 16.4, x: 300, y: 1100, m: "2'ye sakal?" },
  { t: 17.2, x: 400, y: 1180, m: 'Maalesef 14:00 dolu. 14:20 uygun mu?', yesil: true },
];
// beyaz mum: SıraGO'nun telefona yazdığı randevu listesi (gündüz görünmez, suluboyada belirir)
const LISTE = [{ t: 15.7, m: 'Bugün' }, { t: 15.9, m: '13:00 Emre' }, { t: 17.4, m: '14:20 Burak' }, { t: 18.2, m: '15:40 Can' }, { t: 18.5, m: '17:00 Mehmet' }];
const YIKAMA = [24.2, 26.0];
const SUBS = [
  [4.4, 7.9, 'Yusuf dükkânını yeni açtı.'],
  [8.0, 11.75, 'Annesi sordu: “Müşteri var mı?”'],
  [11.85, 15.2, '“Geliyor anne, geliyor.”'],
  [15.3, 19.45, 'Mesajlar düştü; cevabı SıraGO yazdı.'],
  [19.55, 23.2, 'Müşteriler geldi, saatinde.'],
  [23.9, 28.25, 'Akşam baktı: randevular çoktan yazılmış.'],
  [28.4, DUR, 'Sen işini kur. Randevuyu SıraGO yazsın.'],
];
export const ALTYAZI = SUBS.map(([t0, t1, text]) => ({ t0, t1, text }));
SUBS.forEach(([t0, t1, text]) => ev(t0, 'altyazi', { t1: Math.min(t1, DUR), text }));

// ses olayları
ev(0.3, 'cizim', { d: 3.4 }); ev(5.2, 'titresim'); ev(6.2, 'titresim');
BALON.forEach(b => ev(b.t, b.yesil ? 'glok' : 'pit', { n: BALON.indexOf(b) }));
MUS.forEach((m, i) => { ev(m.t, 'zil'); ev(m.t + .5, 'oturur'); for (let k = 0; k < 4; k++) ev(m.t + .7 + k * .22, 'makas'); ev(m.t + 1.7, 'zil'); ev(m.t + .5, 'piyano', { n: i }); });
ev(YIKAMA[0], 'firca', { d: YIKAMA[1] - YIKAMA[0] });
LISTE.forEach((l, i) => ev(25.0 + i * .28, 'celesta', { n: i }));
ev(29.8, 'bant'); ev(30.4, 'bant');

// ───────── katmanlar
const BG = { f: layer(), l: layer() }, KIS = group(), HAVA = { f: layer(), l: layer() }, WASH = layer(), SUBK = layer(), SUBT = layer(), DIS = { f: layer(), l: layer() };

export function frame(comp, t) {
  [CAM.x, CAM.y, CAM.s] = kam(t);
  BOIL.amp = t > 30 ? .5 : 1;
  [BG.f, BG.l, HAVA.f, HAVA.l, WASH, SUBK, SUBT, DIS.f, DIS.l].forEach(clear); clearGroup(KIS);

  // dış dünya (buzdolabı) yalnız geri çekilmede
  if (t > 29.6) E.buzdolabi(DIS.f, DIS.l, SAYFA);

  // ── sayfa kendini çizer
  const d = k => pr(t, k, k + .9), f = k => pr(t, k, k + 1.2);
  const g = E.dukkan(BG.f, BG.l, { ...DK, d: d(.3), f: f(1.0), yazi: pr(t, 1.4, 2.4) });
  E.ayna(BG.f, BG.l, 300, 1130, d(2.0), f(2.4));
  E.koltuk(BG.f, BG.l, KOLTUK_X, ZEMIN, d(2.2), f(2.6));
  const ust = E.tezgah(BG.f, BG.l, TEZ[0], TEZ[1], ZEMIN, d(2.6), f(3.0));
  E.kapi(BG.f, BG.l, KAPI_X, DK.y + 330, ZEMIN - 160, kapiAcik(t), d(2.8), f(3.2));
  // lamba (sarı, ağır baskı: suluboyaya direnir, gece parlar)
  line(BG.l, [[LAMBA[0], DK.y + 130], [LAMBA[0], LAMBA[1] - 40]], { w: 4, seed: 1200, draw: d(2.4) });
  E.sekil(BG.f, BG.l, smooth([[LAMBA[0] - 60, LAMBA[1]], [LAMBA[0] - 30, LAMBA[1] - 50], [LAMBA[0] + 30, LAMBA[1] - 50], [LAMBA[0] + 60, LAMBA[1]]], 3), K.yellow, d(2.4), f(2.8), 1202, { p: 1 });
  // telefon (dik, ekran kâğıt) + titreşim
  const sars = (t > 5.2 && t < 5.9) || (t > 6.2 && t < 6.9) ? Math.sin(t * 90) * 4 : 0;
  const tel = E.telefonCerceve(BG.f, BG.l, TEL[0] + sars, TEL[1], { d: d(3.0), f: f(3.2) });
  if (sars) for (const k of [-1, 1]) line(HAVA.l, [[TEL[0] + k * 105, TEL[1] - 40], [TEL[0] + k * 120, TEL[1]], [TEL[0] + k * 105, TEL[1] + 40]], { w: 4, seed: 1210 + k });
  if (t > 5.2) E.yaz(BG.l, 'Annem', TEL[0], TEL[1] - 200, 46, { reveal: pr(t, 5.2, 5.6), seed: 1215 });
  // beyaz mum listesi telefonda
  const [e0, e1, e2] = tel.ekran;
  LISTE.forEach((l, i) => { if (t > l.t) E.yaz(BG.l, l.m, (e0 + e2) / 2, e1 + 40 + i * 46, i ? 30 : 34, { col: K.white, p: 1, reveal: pr(t, l.t, l.t + .35), seed: 1220 + i, stroke: 2.5 }); });
  // annenin evi (sol üst)
  E.evPencere(BG.f, BG.l, PEN[0], PEN[1], PEN[2], PEN[3], d(7.6), f(8.0));
  // güneş: soldan sağa, akşam uykulu iner
  const gx = lerp(680, 960, ss(pr(t, 18.6, 23.6))), gy = 330 - Math.sin(Math.PI * ss(pr(t, 18.6, 23.6))) * 120 + pr(t, 23.4, 24.6) * 300;
  if (t > 3.4) E.gunes(BG.f, BG.l, t < 18.6 ? 900 : gx, t < 18.6 ? 330 : gy, { r: 70, d: pr(t, 3.4, 4.2), yuz: t > 23.4 ? 'uyku' : 'mutlu' });

  // ── havadaki mesaj baloncukları
  // gün başlayınca baloncuklar kuş gibi sayfadan uçup gider
  BALON.forEach((b, i) => { if (t > b.t && t < 20.5) { const u = eio(pr(t, 18.0 + i * .15, 19.8 + i * .15)); E.balon(HAVA.f, HAVA.l, b.x + Math.sin(u * 6 + i) * 30 * u, b.y - u * 1300, b.m, { yesil: b.yesil, d: pr(t, b.t, b.t + .45), seed: 1300 + i * 20, size: 34 }); } });

  // ── suluboya (gece): yukarıdan aşağı akan bant, ıslak ön kenar
  if (t > YIKAMA[0]) yikama(WASH, t);

  // ── karakterler (suluboyadan sonra: gecede kaybolmasınlar)
  karakterler(t);

  // ── altyazı (basılı sözler) — kâğıt yaması üstünde
  altyazi(t);

  // ── birleştir
  comp.paperCam(CAM.x * .6, CAM.y * .6, CAM.s / .6);
  comp.begin(PAL.paper);
  if (t > 29.6) { comp.crayon(DIS.f.c, { gain: 1 }); comp.crayon(DIS.l.c); }
  comp.crayon(BG.f.c); comp.crayon(BG.l.c); comp.crayon(HAVA.f.c); comp.crayon(HAVA.l.c);
  if (t > YIKAMA[0]) comp.wash(WASH.c, { color: PAL.wash, resist: .93 });
  comp.group(KIS);
  comp.knock(SUBK.c); comp.crayon(SUBT.c);
  comp.finish({ vig: .28, emb: .55 });
}

function kapiAcik(t) { for (const m of MUS) { if (t > m.t - .15 && t < m.t + .35) return 1; if (t > m.t + 1.55 && t < m.t + 1.95) return 1; } return 0; }

function yikama(W, t) {
  const g = W.g, k = eio(pr(t, YIKAMA[0], YIKAMA[1]));
  // buzdolabı görünene kadar görünen her yer (sayfa kenarı dahil); sonra yalnız sayfa
  const genis = t < 29.6, X0 = genis ? -400 : 0, X1 = genis ? 1480 : SAYFA[2];
  const ust = -60, alt = genis ? 2500 : SAYFA[3], kenar = lerp(ust, alt, k);
  g.save(); g.fillStyle = 'rgba(255,255,255,.9)';
  g.beginPath(); g.moveTo(sx(X0), sy(ust));
  g.lineTo(sx(X1), sy(ust));
  for (let x = X1; x >= X0; x -= 30) g.lineTo(sx(x), sy(kenar + Math.sin(x * .02 + t * 2) * 18 + (hash(Math.floor(x / 30)) - .5) * 14));
  g.closePath(); g.fill();
  // ıslak ön kenar: biraz daha koyu bant
  if (k < 1) { g.fillStyle = 'rgba(255,255,255,.35)'; g.fillRect(0, sy(kenar) - 40 * CAM.s, 1080, 50 * CAM.s); }
  g.restore();
}

function karakterler(t) {
  // anne pencerede (7.6'dan sonra çizilir), ön duvar ve pervaz onu belden aşağı örter
  if (t > 8.2) {
    const [px0, py0, px1, py1] = [PEN[0] + 70, PEN[1] + 70, PEN[2] - 70, PEN[3] - 110];
    const gul = t > 28.6;
    kisi(KIS, { x: (px0 + px1) / 2, y: PEN[3] - 50, s: .9, seed: 200, sac: { tip: 'basortu', renk: K.violet }, ust: K.pink, gozluk: true,
      ifade: gul ? 'gulen' : t > 9.6 && t < 11.2 ? 'saskin' : 'mutlu', kolR: t < 12 ? { el: [86, -238] } : { a: 20 }, tut: t < 12 ? 'telefon' : null });
    part(KIS, [[PEN[0], py1], [PEN[2], py1], [PEN[2], PEN[3]], [PEN[0], PEN[3]]], { col: K.ochre, p: .6, gap: 12, w: 12, seed: 1062 }, null);
    E.pencereCerceve(KIS.f, KIS.l, [px0, py0, px1, py1], 1, 1, pr(t, 24.6, 25.4));
  }
  // Yusuf
  if (t > 3.8) {
    let x = 530, ifade = 'mutlu', kolR = { a: 14 }, kolL = { a: 10 }, tut = null, bak = 0;
    if (t > 5.2 && t < 7.6) { ifade = 'saskin'; bak = .6; }
    if (t > 11.8 && t < 14.6) { ifade = 'endise'; bak = -.7; }            // gözü boş koltukta
    for (const m of MUS) if (t > m.t + .5 && t < m.t + 1.6) { x = KOLTUK_X + 170; tut = 'makas'; kolR = { a: Math.floor(t * 8) % 2 ? 70 : 100, b: 20 }; bak = -.5; }
    if (t > 24.0) { x = 600; }
    if (t > 28.4) { ifade = 'gulen'; kolR = { a: 150, b: 10 }; bak = .4; }   // telefonu gösterir
    if (t > 4.0 && t < 4.4) ifade = 'mutlu-kapali';
    kisi(KIS, { x, y: ZEMIN, s: 1.15, seed: 100, sac: { tip: 'kisa', renk: K.brown }, ust: K.blue, onluk: K.green, ifade, kolR, kolL, tut, bak });
  }
  // müşteriler: kapıda belirir → koltukta → kapıda
  MUS.forEach((m, i) => {
    let poz = null;
    if (t > m.t && t < m.t + .5) poz = { x: KAPI_X + 60, y: ZEMIN - 150, otur: false };
    else if (t >= m.t + .5 && t < m.t + 1.6) poz = { x: KOLTUK_X - 60, y: ZEMIN - 2, otur: true };
    else if (t >= m.t + 1.6 && t < m.t + 2.0) poz = { x: KAPI_X + 60, y: ZEMIN - 150, otur: false };
    if (!poz) return;
    const bitti = t > m.t + 1.45;
    kisi(KIS, { x: poz.x, y: poz.y, s: poz.otur ? 1.0 : .82, seed: 400 + i * 50, sac: m.sac, ust: m.ust, ten: m.ten, biyik: m.biyik,
      oturan: poz.otur, ifade: bitti ? 'gulen' : poz.otur ? 'mutlu-kapali' : 'mutlu', kolR: bitti && !poz.otur ? { a: 160 } : undefined });
  });
}

function altyazi(t) {
  for (const [t0, t1, s] of SUBS) {
    if (t < t0 || t > t1) continue;
    const g = SUBT.g; g.save(); g.font = '400 52px "Patrick Hand"';
    const satirlar = bol(g, s, 900);
    g.restore();
    const y0 = 1920 - 120 - (satirlar.length - 1) * 62;
    // yırtık kâğıt yaması (ekran koordinatı)
    const w = Math.max(...satirlar.map(l => { g.save(); g.font = '400 52px "Patrick Hand"'; const m = g.measureText(l).width; g.restore(); return m; })) + 70;
    const h = satirlar.length * 62 + 44, x0 = 540 - w / 2, yy0 = y0 - 56;
    const kg = SUBK.g; kg.save(); kg.fillStyle = '#000'; kg.beginPath();
    for (let i = 0; i <= 40; i++) { const u = i / 40; kg.lineTo(x0 + u * w, yy0 + (hash(i * 3.1) - .5) * 10); }
    for (let i = 0; i <= 12; i++) { const u = i / 12; kg.lineTo(x0 + w + (hash(i * 5.7) - .5) * 10, yy0 + u * h); }
    for (let i = 40; i >= 0; i--) { const u = i / 40; kg.lineTo(x0 + u * w, yy0 + h + (hash(i * 7.3) - .5) * 10); }
    for (let i = 12; i >= 0; i--) { const u = i / 12; kg.lineTo(x0 + (hash(i * 9.1) - .5) * 10, yy0 + u * h); }
    kg.closePath(); kg.fill(); kg.restore();
    let n = 0; const top = [...s].length;
    satirlar.forEach((l, i) => { const rv = clamp(((t - t0) / .35) * top / [...l].length - n / [...l].length); text(SUBT, l, 540, y0 + i * 62, { size: 52, font: 'Patrick Hand', col: K.ink, reveal: clamp((t - t0) / .35 - n / top), seed: 1500 + i }); n += [...l].length; });
  }
}
function bol(g, s, maxW) {
  const k = s.split(' '); const out = []; let cur = '';
  for (const w of k) { const d = cur ? cur + ' ' + w : w; if (g.measureText(d).width > maxW && cur) { out.push(cur); cur = w; } else cur = d; }
  if (cur) out.push(cur); return out;
}

export const TEXTS = t => SUBS.filter(([a, b]) => t >= a + .4 && t <= b).map(([a, b, s], i) => ({ id: 'sub' + SUBS.findIndex(x => x[2] === s), text: s, x0: 90, y0: 1700, x1: 990, y1: 1880 }));
