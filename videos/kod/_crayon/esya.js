// Ortak dekor ve eşyalar (dünya koordinatı). Her çizim "çizilme ilerlemesi" (d: 0→1) alır: çizgiler boyunca açılır,
// boyama satır satır gelir. Pastel silinemez; bir şey ancak üstü boyanarak, kamera ayrılarak ya da sayfa çevrilerek gider.
import { line, fill, dab, ellipse, handCircle, xf, smooth, text, sx, sy, CAM } from './crayon.js';
import { part, erase } from './rig.js';
import { PAL } from './pal.js';
import { clamp } from '/core/lib.js';
const K = PAL.crayon;
export const pr = (t, a, b) => clamp((t - a) / (b - a));
const kutu = (x0, y0, x1, y1) => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
const yuvarlak = (x0, y0, x1, y1, r = 14) => smooth([[x0 + r, y0], [x1 - r, y0], [x1, y0 + r], [x1, y1 - r], [x1 - r, y1], [x0 + r, y1], [x0, y1 - r], [x0, y0 + r]], 3);

// dünya koordinatında pastel yazı
export function yaz(L, s, x, y, size, o = {}) { return text(L, s, sx(x), sy(y), { size: size * CAM.s, col: K.ink, p: .95, ...o }); }

// çizgi (d ilerlemesiyle) + boyama (f ilerlemesiyle) kısayolu
export function sekil(F, Lc, poly, col, d, f, seed, o = {}) {
  // arka plan boyaması titremez (dosya boyutu + stil kuralı); çizgiler hafif titrer
  if (f > 0 && col) fill(F, poly, { col, p: o.p ?? .8, gap: o.gap ?? 10, w: o.w ?? 12, ang: o.ang ?? .55, seed, over: o.over ?? 5, draw: f, cross: o.cross, boil: o.boil ?? 0 });
  if (d > 0 && o.cizgi !== false) line(Lc, [...poly, poly[0]], { w: o.lw ?? 6, seed: seed + 1, draw: d, col: o.lc, boil: o.lboil ?? .6 });
}

// ── berber dükkânı (kesit: ön duvar yok). Sol üst köşe (x, y), genişlik W.
export function dukkan(F, Lc, o) {
  const { x = 60, y = 760, W = 960, d = 1, f = 1, tabela = 'Kuzey Berber', yazi = 1, tabelaRenk = K.green, duvar = K.ochre } = o;
  const H = 1140, alt = y + H;
  // tabela bandı
  sekil(F, Lc, kutu(x - 20, y, x + W + 20, y + 130), tabelaRenk, d, f, 900, { p: .9 });
  if (yazi > 0) yaz(Lc, tabela, x + W / 2, y + 92, 84, { font: 'Caveat Brush', col: K.white, reveal: yazi, seed: 31, stroke: 2 });
  // arka duvar + zemin
  sekil(F, Lc, kutu(x, y + 130, x + W, alt - 200), duvar, d, f, 910, { p: .55, gap: 12 });
  sekil(F, Lc, kutu(x, alt - 200, x + W, alt), K.brown, d, f, 920, { p: .55, gap: 11, ang: .15 });
  // döşeme çizgileri
  for (let i = 1; i < 6; i++) line(Lc, [[x + i * W / 6 - 40, alt - 200], [x + i * W / 6 - 90, alt]], { w: 3.5, seed: 930 + i, draw: d, p: .5 });
  return { zemin: alt - 40, duvarUst: y + 130, duvarAlt: alt - 200 };
}
// ayna (oval, açık mavi parıltı)
export function ayna(F, Lc, cx, cy, d = 1, f = 1) {
  sekil(F, Lc, ellipse(cx, cy, 130, 170, 40), K.brown, d, f, 940, { p: .85 });
  sekil(F, Lc, ellipse(cx, cy, 108, 148, 40), K.blue, d, f * .9, 942, { p: .35, gap: 14 });
  if (f > .9) for (const k of [0, 1]) line(Lc, [[cx - 50 + k * 26, cy - 70], [cx - 10 + k * 26, cy - 110]], { w: 6, col: K.white, seed: 944 + k, p: .9 });
}
// berber koltuğu (kırmızı)
export function koltuk(F, Lc, x, zemin, d = 1, f = 1) {
  sekil(F, Lc, kutu(x - 14, zemin - 150, x + 14, zemin), K.gray, d, f, 950, { p: .7 });
  sekil(F, Lc, yuvarlak(x - 110, zemin - 40, x + 110, zemin, 16), K.gray, d, f, 952, { p: .7 });
  sekil(F, Lc, yuvarlak(x - 100, zemin - 210, x + 100, zemin - 140, 20), K.red, d, f, 954);
  sekil(F, Lc, yuvarlak(x - 90, zemin - 400, x + 90, zemin - 200, 26), K.red, d, f, 956);
  sekil(F, Lc, yuvarlak(x - 130, zemin - 250, x - 96, zemin - 160, 12), K.red, d, f, 958);
  sekil(F, Lc, yuvarlak(x + 96, zemin - 250, x + 130, zemin - 160, 12), K.red, d, f, 960);
  return { oturak: [x, zemin - 150] };
}
// tezgâh
export function tezgah(F, Lc, x0, x1, zemin, d = 1, f = 1) {
  sekil(F, Lc, kutu(x0, zemin - 260, x1, zemin), K.brown, d, f, 970, { p: .75, ang: 1.2 });
  sekil(F, Lc, kutu(x0 - 20, zemin - 290, x1 + 20, zemin - 260), K.ochre, d, f, 972, { p: .9 });
  return zemin - 290;
}
// kapı (sağ duvarda) — a: 0 kapalı, 1 açık (kanat daralır)
export function kapi(F, Lc, x, ust, zemin, a = 0, d = 1, f = 1) {
  sekil(F, Lc, kutu(x, ust, x + 130, zemin), K.ochre, d, f, 980, { p: .3 });
  const g = 130 * (1 - .75 * a);
  sekil(F, Lc, kutu(x, ust, x + g, zemin), K.brown, d, f, 982, { p: .85 });
  dab(F, x + g - 22, (ust + zemin) / 2, 9, { col: K.yellow, seed: 984 });
}
// büyük telefon (tezgâhta dik duran, çocuk perspektifi). ekran beyaz kâğıt; beyaz mum listesi ayrı çizilir.
export function telefon(F, Lc, cx, cy, o = {}) {
  const w = o.w ?? 170, h = o.h ?? 300, d = o.d ?? 1, f = o.f ?? 1;
  sekil(F, Lc, yuvarlak(cx - w / 2, cy - h / 2, cx + w / 2, cy + h / 2, 26), '#3a3640', d, f, 990, { p: .95, gap: 7, w: 9 });
  // ekran kâğıt rengi kalsın: koyu gövdenin içini sil (part ile değil; boyamayı ekran dışında bıraktık)
  return { ekran: [cx - w / 2 + 14, cy - h / 2 + 30, cx + w / 2 - 14, cy + h / 2 - 22] };
}
// telefonun gövdesi ekranı boyamasın diye: gövde = dış halka (çerçeve) olarak çizilir
export function telefonCerceve(F, Lc, cx, cy, o = {}) {
  const w = o.w ?? 170, h = o.h ?? 300, d = o.d ?? 1, f = o.f ?? 1, b = 14;
  const dis = yuvarlak(cx - w / 2, cy - h / 2, cx + w / 2, cy + h / 2, 26);
  erase(F, dis); erase(Lc, dis);   // arkadaki duvar boyası ekrandan görünmesin
  const parca = [kutu(cx - w / 2, cy - h / 2, cx + w / 2, cy - h / 2 + 30), kutu(cx - w / 2, cy + h / 2 - 22, cx + w / 2, cy + h / 2),
    kutu(cx - w / 2, cy - h / 2, cx - w / 2 + b, cy + h / 2), kutu(cx + w / 2 - b, cy - h / 2, cx + w / 2, cy + h / 2)];
  parca.forEach((q, i) => { if (f > 0) fill(F, q, { col: '#3a3640', p: .95, gap: 6, w: 8, ang: .3, seed: 990 + i, over: 1, draw: f }); });
  if (d > 0) line(Lc, [...dis, dis[1]], { w: 6, seed: 995, draw: d });
  return { ekran: [cx - w / 2 + b, cy - h / 2 + 30, cx + w / 2 - b, cy + h / 2 - 22] };
}
// konuşma baloncuğu (havada): gri müşteri / yeşil SıraGO; metin el yazısı
export function balon(F, Lc, x, y, metin, o = {}) {
  const yesil = o.yesil, size = o.size ?? 40, w = o.w ?? (metin.length * size * .42 + 50), h = o.h ?? size * 1.6, d = o.d ?? 1;
  const kuyruk = yesil ? [[x + w - 40, y + h], [x + w - 10, y + h + 34], [x + w - 70, y + h]] : [[x + 40, y + h], [x + 10, y + h + 34], [x + 70, y + h]];
  const sek = smooth([[x + 18, y], [x + w - 18, y], [x + w, y + 18], [x + w, y + h - 18], [x + w - 18, y + h], ...(yesil ? [kuyruk[0], kuyruk[1], kuyruk[2]] : []), [x + 18, y + h], ...(!yesil ? [kuyruk[2], kuyruk[1], kuyruk[0]] : []), [x, y + h - 18], [x, y + 18]], 3);
  sekil(F, Lc, sek, yesil ? K.mint : '#e6e0d6', d, d, o.seed ?? 1000, { p: yesil ? .75 : .6, gap: 8 });
  if (d > .6) yaz(Lc, metin, x + w / 2, y + h * .66, size, { reveal: pr(d, .6, 1), seed: (o.seed ?? 1000) + 7 });
}
// güneş (yüzlü). yuz: 'mutlu' | 'uyku'; isin: ışın çizilme ilerlemesi
export function gunes(F, Lc, cx, cy, o = {}) {
  const r = o.r ?? 80, d = o.d ?? 1;
  sekil(F, Lc, handCircle(cx, cy, r, 1010, .08, 40), K.yellow, d, d, 1010, { p: .9 });
  const n = 10;
  for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2 + .2; line(Lc, [[cx + Math.cos(a) * (r + 18), cy + Math.sin(a) * (r + 18)], [cx + Math.cos(a) * (r + 60), cy + Math.sin(a) * (r + 60)]], { w: 6, col: K.orange, seed: 1020 + i, draw: o.isin ?? d }); }
  if (d > .8) {
    if (o.yuz === 'uyku') for (const k of [-1, 1]) line(Lc, ellipse(cx + k * 26, cy - 6, 12, 8, 10, 0, Math.PI), { w: 5, seed: 1040 + k });
    else for (const k of [-1, 1]) dab(Lc, cx + k * 26, cy - 8, 8, { col: K.ink, seed: 1040 + k });
    line(Lc, ellipse(cx, cy + 14, 26, 16, 12, Math.PI * .1, Math.PI * .9), { w: 5, seed: 1044 });
    for (const k of [-1, 1]) dab(F, cx + k * 46, cy + 16, 12, { col: K.pink, seed: 1046 + k, sq: .7 });
  }
}
// ev duvarı + pencere (anne için). pencere içi kâğıt; perde pembe
export function evPencere(F, Lc, x0, y0, x1, y1, d = 1, f = 1) {
  sekil(F, Lc, kutu(x0, y0, x1, y1), K.ochre, d, f, 1060, { p: .6 });
  // çatı
  sekil(F, Lc, [[x0 - 40, y0], [(x0 + x1) / 2, y0 - 170], [x1 + 40, y0]], K.red, d, f, 1062);
  const px0 = x0 + 70, px1 = x1 - 70, py0 = y0 + 70, py1 = y1 - 110;
  return { pencere: [px0, py0, px1, py1] };
}
export function pencereCerceve(F, Lc, [px0, py0, px1, py1], d = 1, f = 1, lamba = 0) {
  line(Lc, [[px0, py0], [px1, py0], [px1, py1], [px0, py1], [px0, py0]], { w: 9, seed: 1070, draw: d });
  part({ k: { g: F.g }, f: F, l: Lc }, kutu(px0 - 30, py1, px1 + 30, py1 + 40), { col: K.brown, p: .9, gap: 7, w: 9, seed: 1072, draw: f }, { w: 6, seed: 1073 }, { kn: false });
  for (const k of [0, 1]) { const x = k ? px1 - 10 : px0 + 10; fill(F, smooth([[x, py0], [x + (k ? -70 : 70), py0], [x + (k ? -40 : 40), py1 - 60], [x, py1]], 3), { col: K.pink, p: .75, gap: 8, w: 9, seed: 1075 + k, draw: f }); }
  if (lamba > 0) fill(F, kutu(px0 + 4, py0 + 4, px1 - 4, py1 - 4), { col: K.yellow, p: .9 * lamba, gap: 7, w: 10, seed: 1080, cross: true });
}
// buzdolabı kapağı (sayfa dışı; çekilince görünür): sayfa dikdörtgeni dışında kalan alan
export function buzdolabi(F, Lc, [x0, y0, x1, y1], pay = 900) {
  // sayfanın altına mum sürülmesin (suluboyayı iter): sayfa çevresinde dört bant
  [kutu(x0 - pay, y0 - pay, x1 + pay, y0), kutu(x0 - pay, y1, x1 + pay, y1 + pay), kutu(x0 - pay, y0, x0, y1), kutu(x1, y0, x1 + pay, y1)]
    .forEach((q, i) => fill(F, q, { col: '#cfdbe0', p: .95, gap: 9, w: 14, seed: 1100 + i * 3, cross: true, over: 0 }));
  line(Lc, [[x1 + 160, y0 + 200], [x1 + 160, y1 - 200]], { w: 14, col: K.gray, seed: 1102 });
  // bant parçaları köşelerde
  for (const [i, [cx, cy]] of [[x0, y0], [x1, y0], [x1, y1], [x0, y1]].entries())
    fill(F, xf(kutu(-60, -18, 60, 18), { x: cx, y: cy, r: (i % 2 ? -1 : 1) * .7 }), { col: '#efe6c8', p: .9, gap: 5, w: 8, seed: 1110 + i, over: 0 });
  // mıknatıs: küçük tilki yüzü (Fiko)
  dab(F, x1 + 90, y0 + 120, 34, { col: K.orange, seed: 1120 });
}

// ───────── ek dekorlar (hikâye 4–9)
// el çizimi panel çerçevesi (çizgi roman şeridi gibi dikey sayfa bölmeleri)
export function panel(Lc, x0, y0, x1, y1, d = 1, seed = 1200) {
  line(Lc, [[x0, y0], [x1, y0 + 4], [x1 - 3, y1], [x0 + 2, y1 - 3], [x0, y0]], { w: 8, seed, draw: d });
}
// telefon (elde ya da masada) + ekranda mesaj satırları. msj: [{m, yesil, ben}] — ben: sağa yaslı (kullanıcının yazdığı)
export function ekranTelefon(F, Lc, cx, cy, msj, o = {}) {
  const w = o.w ?? 300, h = o.h ?? 520, d = o.d ?? 1, f = o.f ?? 1, size = o.size ?? 26;
  const t = telefonCerceve(F, Lc, cx, cy, { w, h, d, f });
  const [e0, e1, e2, e3] = t.ekran; let y = e1 + 18;
  msj.forEach((q, i) => {
    if (q.op === 0) return;
    const satirlar = q.m.split('\n'), bw = Math.min(e2 - e0 - 20, Math.max(...satirlar.map(l => l.length)) * size * .46 + 26), bh = satirlar.length * size * 1.2 + 16;
    const bx = q.ben ? e2 - 10 - bw : e0 + 10;
    if (y + bh > e3) return;
    sekil(F, Lc, yuvarlak(bx, y, bx + bw, y + bh, 10), q.yesil ? K.mint : '#e6e0d6', d, (q.op ?? 1) * f, (o.seed ?? 1400) + i * 7, { p: .7, gap: 6, w: 8, lw: 3.5 });
    satirlar.forEach((l, j) => yaz(Lc, l, bx + bw / 2, y + 8 + (j + 1) * size * 1.12, size, { reveal: q.op ?? 1, seed: (o.seed ?? 1400) + i * 7 + j }));
    y += bh + 12;
  });
  return t;
}
// yüzlü duvar saati: saat (0–12 ondalık) akrep/yelkovan
export function saat(F, Lc, cx, cy, r, sa, o = {}) {
  sekil(F, Lc, handCircle(cx, cy, r, 1210, .06, 36), '#f6efe0', o.d ?? 1, o.f ?? 1, 1210, { p: .4 });
  for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2; dab(Lc, cx + Math.sin(a) * r * .8, cy - Math.cos(a) * r * .8, 3, { col: K.ink, seed: 1220 + i }); }
  const ak = sa / 12 * Math.PI * 2, ye = (sa % 1) * Math.PI * 2;
  line(Lc, [[cx, cy], [cx + Math.sin(ak) * r * .45, cy - Math.cos(ak) * r * .45]], { w: 7, seed: 1235 });
  line(Lc, [[cx, cy], [cx + Math.sin(ye) * r * .7, cy - Math.cos(ye) * r * .7]], { w: 5, seed: 1236 });
}
// kanepe
export function kanepe(F, Lc, x, zemin, col, d = 1, f = 1, s = 1) {
  const Y = v => zemin - (zemin - v) * s, X = v => x + (v - x) * s;
  sekil(F, Lc, yuvarlak(X(x - 230), Y(zemin - 260), X(x + 230), Y(zemin - 130), 30), col, d, f, 1240);
  sekil(F, Lc, yuvarlak(X(x - 250), Y(zemin - 150), X(x + 250), Y(zemin - 40), 24), col, d, f, 1242);
  for (const k of [-1, 1]) sekil(F, Lc, yuvarlak(X(x + k * 250 - 40), Y(zemin - 200), X(x + k * 250 + 40), Y(zemin - 40), 20), col, d, f, 1244 + k);
  for (const k of [-1, 1]) line(Lc, [[X(x + k * 200), Y(zemin - 40)], [X(x + k * 205), zemin]], { w: 7, seed: 1248 + k, draw: d });
}
// masa (toplantı / ofis)
export function masa(F, Lc, x0, x1, ust, zemin, col = K.brown, d = 1, f = 1) {
  sekil(F, Lc, kutu(x0, ust, x1, ust + 30), col, d, f, 1250, { p: .85 });
  for (const x of [x0 + 30, x1 - 30]) sekil(F, Lc, kutu(x - 12, ust + 30, x + 12, zemin), col, d, f, 1252 + x % 7, { p: .85 });
}
// çocuk çizimi araba (yandan), yon: 1 sağa
export function araba(F, Lc, x, zemin, col, o = {}) {
  const d = o.d ?? 1, f = o.f ?? 1, k = o.yon ?? 1, tek = o.tekerlek ?? 0, s = o.s ?? 1;
  const P = pts => pts.map(([a, b]) => [x + a * k * s, zemin + (b - zemin) * s]);
  sekil(F, Lc, P(smooth([[-190, zemin - 50], [-180, zemin - 120], [-90, zemin - 130], [-50, zemin - 210], [90, zemin - 210], [130, zemin - 130], [200, zemin - 115], [205, zemin - 50]], 3)), col, d, f, 1260);
  sekil(F, Lc, P(smooth([[-30, zemin - 195], [80, zemin - 195], [110, zemin - 132], [-60, zemin - 132]], 3)), K.blue, d, f, 1262, { p: .45 });
  for (const ox of [-110, 120]) { const c = [x + ox * k * s, zemin - 40 * s]; sekil(F, Lc, handCircle(c[0], c[1], 40 * s, 1264 + ox, .08, 24), '#3a3640', d, f, 1264 + ox, { p: .95 });
    line(Lc, [[c[0] + Math.cos(tek) * 18 * s, c[1] + Math.sin(tek) * 18 * s], [c[0] - Math.cos(tek) * 18 * s, c[1] - Math.sin(tek) * 18 * s]], { w: 4, col: K.gray, seed: 1268 + ox }); }
}
// yağmur çizgileri (k: yoğunluk 0–1), alan dünyada
export function yagmur(Lc, x0, y0, x1, y1, t, k = 1) {
  const n = Math.floor(60 * k);
  for (let i = 0; i < n; i++) { const x = x0 + ((i * 137.5) % (x1 - x0)), sp = (t * 900 + i * 97) % (y1 - y0), y = y0 + sp;
    line(Lc, [[x, y], [x - 10, y + 40]], { w: 3, col: K.blue, p: .8, seed: 1280 + i, wob: .2 }); }
}
// yatak
export function yatak(F, Lc, x, zemin, d = 1, f = 1) {
  sekil(F, Lc, kutu(x - 300, zemin - 180, x - 260, zemin), K.brown, d, f, 1290);
  sekil(F, Lc, kutu(x - 300, zemin - 120, x + 300, zemin - 60), K.brown, d, f, 1292);
  sekil(F, Lc, yuvarlak(x - 250, zemin - 190, x - 120, zemin - 120, 24), '#f0e8da', d, f, 1294, { p: .35 });
}
// yorgan (karakterin üstüne, onu belinden aşağı örter) — KIS grubuna part olarak çizilir
export function yorgan(C, x, zemin, col) {
  part(C, smooth([[x - 140, zemin - 150], [x + 300, zemin - 160], [x + 310, zemin - 60], [x - 150, zemin - 60]], 4), { col, p: .85, gap: 8, w: 10, seed: 1296 }, { w: 6, seed: 1297 });
}
// dişçi koltuğu (yatık)
export function disKoltugu(F, Lc, x, zemin, d = 1, f = 1) {
  sekil(F, Lc, kutu(x - 20, zemin - 120, x + 20, zemin), K.gray, d, f, 1300, { p: .7 });
  sekil(F, Lc, smooth([[x - 220, zemin - 260], [x - 150, zemin - 170], [x + 200, zemin - 150], [x + 210, zemin - 110], [x - 170, zemin - 120], [x - 250, zemin - 230]], 3), K.mint, d, f, 1302);
  // lamba kolu
  line(Lc, [[x + 160, zemin - 150], [x + 170, zemin - 520], [x - 40, zemin - 560]], { w: 7, col: K.gray, seed: 1304, draw: d });
  sekil(F, Lc, ellipse(x - 60, zemin - 545, 46, 26, 20), K.yellow, d, f, 1306);
}
// defter (açık, karalanmış sayfalar)
export function defter(F, Lc, cx, cy, o = {}) {
  const w = o.w ?? 340, h = o.h ?? 230, d = o.d ?? 1;
  sekil(F, Lc, kutu(cx - w / 2, cy - h / 2, cx + w / 2, cy + h / 2), '#efe6cf', d, d, 1310, { p: .5 });
  line(Lc, [[cx, cy - h / 2], [cx, cy + h / 2]], { w: 4, seed: 1312, draw: d });
  if (o.karalama) for (let i = 0; i < 6; i++) { const y = cy - h / 2 + 30 + i * 32; line(Lc, [[cx - w / 2 + 20, y], [cx - 30, y + (i % 2 ? 6 : -4)]], { w: 3, col: K.blue, seed: 1314 + i, draw: d });
    if (i % 2) line(Lc, [[cx - w / 2 + 30, y - 8], [cx - 60, y + 10]], { w: 4, col: K.red, seed: 1320 + i, draw: d }); }
}
export { kutu, yuvarlak };

// bulut (pastel), s ölçek
export function bulut(F, Lc, cx, cy, s = 1, col = '#e4ecf2', d = 1, seed = 1330) {
  const pts = []; for (let i = 0; i <= 18; i++) { const a = Math.PI * 2 * i / 18; const r = (i % 3 === 0 ? 1.15 : 1) * 70 * s; pts.push([cx + Math.cos(a) * r * 1.7, cy + Math.sin(a) * r * .75]); }
  sekil(F, Lc, smooth(pts, 3), col, d, d, seed, { p: .7, lw: 5 });
}
