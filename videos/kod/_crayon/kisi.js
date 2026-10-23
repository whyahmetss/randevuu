// Resimli kitap insanı: yuvarlak kafa (~2.4 kafa boy), nokta gözler + beyaz mum parıltı, pembe yanak, tüp kollar, eldiven eller.
// Yerel koordinat: ayakların ortası (0,0), yukarı eksi. o: { x, y, s, flip, ten, sac:{tip, renk}, ust, onluk, alt, ayakkabi,
//   ifade, bak (-1..1 yüz yönü), kolL, kolR ({a: derece aşağıdan, b: dirsek bükümü} ya da {el:[x,y]} yerel), oturan, gozluk,
//   biyik, tut (elde tutulan: 'telefon' | 'makas' | null), seed }
import { line, fill, dab, ellipse, handCircle, xf, smooth } from './crayon.js';
import { part, tube, curve } from './rig.js';
import { PAL } from './pal.js';
const K = PAL.crayon;
const LW = 6.5;

export function kisi(C, o) {
  const sd = o.seed || 300, s = o.s || 1, k = o.flip ? -1 : 1;
  const P = pts => xf(pts, { x: o.x || 0, y: o.y || 0, s, sx: k });
  const lo = (n, e = {}) => ({ w: LW, seed: sd + n, ...e });
  const ten = o.ten || K.peach, ust = o.ust || K.blue, alt = o.alt || '#4a5a7a';
  const fo = (col, n, e = {}) => ({ col, p: .8, gap: 9, w: 11, ang: .55, seed: sd + n, over: 4, ...e });
  const otur = o.oturan ? 1 : 0;
  // ── bacaklar (oturan: öne uzanır)
  const kalca = otur ? -150 : -72;
  for (const [i, sx] of [[0, -24], [1, 24]]) {
    const ayak = otur ? [sx * 1.1 + 70, -40] : [sx * 1.05, -8];
    const diz = otur ? [sx + 60, kalca + 4] : [sx, (kalca - 8) / 2];
    part(C, P(tube(curve([[sx, kalca], diz, ayak], 4), 32, 28)), fo(alt, 1 + i), lo(2 + i));
    part(C, P(ellipse(ayak[0] + 8, ayak[1] + 2, 24, 13, 20)), fo(o.ayakkabi || K.brown, 4 + i, { gap: 6, w: 8 }), lo(6 + i));
  }
  // ── gövde (yamuk, yuvarlak köşe)
  const g0 = kalca - 105;
  const govde = smooth([[-44, g0 + 6], [-30, g0], [30, g0], [44, g0 + 6], [56, kalca + 4], [0, kalca + 10], [-56, kalca + 4]], 5);
  part(C, P(govde), fo(ust, 10), lo(11));
  if (o.onluk) part(C, P(smooth([[-30, g0 + 18], [30, g0 + 18], [40, kalca + 8], [-40, kalca + 8]], 4)), fo(o.onluk, 12, { gap: 8 }), lo(13, { w: 5 }));
  // ── kollar (arka kol önce)
  const omuz = [[-46, g0 + 14], [46, g0 + 14]];
  const kol = (taraf, q) => {
    const om = omuz[taraf], yon = taraf ? 1 : -1;
    let el;
    if (q && q.el) el = q.el;
    else { const a = ((q && q.a) ?? 12) * Math.PI / 180; el = [om[0] + yon * Math.sin(a) * 92, om[1] + Math.cos(a) * 92]; }
    const b = (q && q.b) ?? 10;
    const dx = el[0] - om[0], dy = el[1] - om[1], L = Math.hypot(dx, dy) || 1;
    const dirsek = [(om[0] + el[0]) / 2 + (-dy / L) * b * yon, (om[1] + el[1]) / 2 + (dx / L) * b * yon];
    part(C, P(tube(curve([om, dirsek, el], 4), 26, 22)), fo(ust, 20 + taraf), lo(22 + taraf));
    part(C, P(handCircle(el[0], el[1], 15, sd + 24 + taraf, 0, 24)), fo(ten, 26 + taraf, { gap: 6, w: 8 }), lo(28 + taraf, { w: 5 }));
    return el;
  };
  const elL = kol(0, o.kolL), elR = kol(1, o.kolR);
  // ── kafa
  bas(C, P, o, g0, sd, ten, lo, fo);
  // ── elde tutulan
  if (o.tut === 'makas') makas(C, P(...[[[elR[0] + 6, elR[1] - 4]]])[0], s, sd + 90, k);
  if (o.tut === 'telefon') telefonKucuk(C, P([[elR[0] - 4, elR[1] - 24]])[0], s, sd + 92);
  return { elL: P([elL])[0], elR: P([elR])[0], bas: P([[0, g0 - 70]])[0], omuzY: P([[0, g0]])[0][1] };
}

function bas(C, P, o, g0, sd, ten, lo, fo) {
  const cy = g0 - 66, R = 62, bk = (o.bak || 0) * 14;
  const sac = o.sac || { tip: 'kisa', renk: K.brown };
  // arka saç kütlesi
  if (sac.tip === 'uzun') part(C, P(smooth([[-70, cy - 10], [-66, cy - 58], [0, cy - 80], [66, cy - 58], [72, cy - 10], [76, cy + 70], [40, cy + 76], [-40, cy + 76], [-76, cy + 70]], 5)), fo(sac.renk, 40), lo(41));
  if (sac.tip === 'basortu') part(C, P(smooth([[-76, cy + 4], [-70, cy - 56], [0, cy - 84], [70, cy - 56], [76, cy + 4], [64, cy + 66], [30, cy + 92], [-30, cy + 92], [-64, cy + 66]], 5)), fo(sac.renk, 40, { gap: 8 }), lo(41));
  // yüz
  const yuz = sac.tip === 'basortu' ? ellipse(bk * .3, cy + 6, 52, 56, 40) : ellipse(0, cy, R, R * .96, 44);
  part(C, P(yuz), fo(ten, 42, { p: .55, gap: 10, w: 12 }), lo(43));
  // ön saç
  if (sac.tip === 'kisa') part(C, P(smooth([[-64, cy - 6], [-60, cy - 44], [-30, cy - 66], [10, cy - 70], [46, cy - 58], [64, cy - 24], [64, cy - 6], [50, cy - 26], [34, cy - 32], [16, cy - 24], [-2, cy - 34], [-20, cy - 26], [-38, cy - 34], [-52, cy - 22]], 4)), fo(sac.renk, 44, { ang: 1.1 }), lo(45));
  if (sac.tip === 'kivircik') { const pts = []; for (let i = 0; i <= 16; i++) { const a = Math.PI * (1.05 + .9 * i / 16); const r = 70 + (i % 2 ? 10 : 0); pts.push([Math.cos(a) * r, cy - 6 + Math.sin(a) * r * .9]); } pts.push([60, cy - 18], [20, cy - 36], [-20, cy - 34], [-60, cy - 18]); part(C, P(smooth(pts, 3)), fo(sac.renk, 44, { ang: 1.1 }), lo(45)); }
  if (sac.tip === 'uzun') part(C, P(smooth([[-64, cy - 4], [-58, cy - 46], [0, cy - 70], [58, cy - 46], [64, cy - 4], [40, cy - 30], [10, cy - 22], [-20, cy - 34], [-46, cy - 22]], 4)), fo(sac.renk, 44, { ang: 1.1 }), lo(45));
  if (sac.tip === 'kel') { part(C, P(smooth([[-66, cy + 4], [-62, cy - 24], [-52, cy - 20], [-54, cy + 8]], 3)), fo(sac.renk, 44), lo(45, { w: 4 })); part(C, P(smooth([[66, cy + 4], [62, cy - 24], [52, cy - 20], [54, cy + 8]], 3)), fo(sac.renk, 46), lo(47, { w: 4 })); }
  if (sac.tip === 'topuz') { part(C, P(handCircle(0, cy - 82, 26, sd + 48, 0, 28)), fo(sac.renk, 48), lo(49)); part(C, P(smooth([[-64, cy - 4], [-58, cy - 48], [0, cy - 68], [58, cy - 48], [64, cy - 4], [36, cy - 34], [-36, cy - 34]], 4)), fo(sac.renk, 44, { ang: 1.1 }), lo(45)); }
  // yüz hatları
  yuzHat(C, P, o, cy + (sac.tip === 'basortu' ? 8 : 0), bk, sd);
}

export function yuzHat(C, P, o, cy, bk, sd) {
  const ifade = o.ifade || 'mutlu', ink = K.ink;
  const gx = [-22 + bk, 22 + bk], gy = cy + 4;
  if (ifade === 'mutlu-kapali' || ifade === 'uyku') gx.forEach((x, i) => line(C.l, P(ellipse(x, gy + 4, 9, 7, 10, Math.PI * (ifade === 'uyku' ? 0 : 1), Math.PI * (ifade === 'uyku' ? 1 : 2))), { w: 4.5, seed: sd + 60 + i, col: ink }));
  else {
    const r = ifade === 'saskin' ? 9 : 7;
    gx.forEach((x, i) => { dab(C.f, ...P([[x, gy]])[0], r * (o.s || 1), { col: ink, p: .95, seed: sd + 60 + i, gap: 3, w: 5 });
      dab(C.l, ...P([[x + 2.5, gy - 3]])[0], 2.4 * (o.s || 1), { col: K.white, p: 1, seed: sd + 62 + i, gap: 2, w: 3 }); });
  }
  [[-38 + bk, cy + 24], [38 + bk, cy + 24]].forEach(([x, y], i) => dab(C.f, ...P([[x, y]])[0], 10 * (o.s || 1), { col: K.pink, p: .7, seed: sd + 64 + i, sq: .7 }));
  const my = cy + 30, mx = bk;
  if (ifade === 'gulen') part(C, P(smooth([[mx - 18, my - 2], [mx + 18, my - 2], [mx + 10, my + 14], [mx - 10, my + 14]], 4)), { col: '#8a3a32', p: .85, gap: 5, w: 6, seed: sd + 66 }, { w: 4.5, seed: sd + 67 });
  else if (ifade === 'saskin') line(C.l, P(handCircle(mx, my + 4, 8, sd + 66, .1, 20)), { w: 4.5, seed: sd + 67 });
  else if (ifade === 'endise' || ifade === 'uzgun') line(C.l, P(ellipse(mx, my + 10, 12, 6, 10, Math.PI * 1.1, Math.PI * 1.9)), { w: 4.5, seed: sd + 67 });
  else if (ifade === 'duz') line(C.l, P([[mx - 10, my + 4], [mx + 10, my + 4]]), { w: 4.5, seed: sd + 67 });
  else line(C.l, P(ellipse(mx, my - 2, 14, 9, 12, Math.PI * .12, Math.PI * .88)), { w: 4.5, seed: sd + 67 });
  // endişe: kaşların iç uçları yukarı (ters çevrilirse kızgın okunur)
  if (ifade === 'endise' || ifade === 'uzgun') gx.forEach((x, i) => line(C.l, P([[x - 10, cy - 18 + (i ? -6 : 4)], [x + 10, cy - 18 + (i ? 4 : -6)]]), { w: 4, seed: sd + 68 + i }));
  if (ifade === 'saskin') gx.forEach((x, i) => line(C.l, P([[x - 9, cy - 22], [x + 9, cy - 24]]), { w: 4, seed: sd + 68 + i }));
  if (o.gozluk) { gx.forEach((x, i) => line(C.l, P(handCircle(x, gy, 15, sd + 70 + i, .05, 24)), { w: 4, seed: sd + 70 + i })); line(C.l, P([[gx[0] + 15, gy], [gx[1] - 15, gy]]), { w: 3.5, seed: sd + 72 }); }
  if (o.biyik) part(C, P(smooth([[mx - 22, my - 6], [mx, my - 12], [mx + 22, my - 6], [mx + 12, my + 2], [mx, my - 2], [mx - 12, my + 2]], 3)), { col: (o.sac && o.sac.renk) || K.brown, p: .9, gap: 5, w: 6, seed: sd + 74 }, { w: 4, seed: sd + 75 });
}

function makas(C, [x, y], s, sd, k) {
  const P = pts => xf(pts, { x, y, s, sx: k, r: -.5 });
  for (const i of [0, 1]) line(C.l, P([[0, 0], [i ? 40 : 42, i ? -8 : 6]]), { w: 5, col: K.gray, p: .95, seed: sd + i });
  for (const i of [0, 1]) line(C.l, P(handCircle(-12, i ? -8 : 8, 8, sd + 3 + i, .1, 18)), { w: 4, col: K.ink, seed: sd + 5 + i });
}
function telefonKucuk(C, [x, y], s, sd) {
  const P = pts => xf(pts, { x, y, s });
  part(C, P(smooth([[-18, -32], [18, -32], [18, 32], [-18, 32]], 3)), { col: '#2b2b33', p: .9, gap: 5, w: 7, seed: sd }, { w: 4.5, seed: sd + 1 });
}
