// Fiko: SıraGO'nun tilkisi, 18×14 kare piksel. Önden: sivri kulaklar, krem ağız, yeşil atkı, sağda kabarık kuyruk.
// Aksesuarlar (kalem, zil, "!", kıvılcım, zZ, toz) aynı piksel ızgarasında.
export const TURUNCU = '#e0761a', KOYU = '#b3560e', KREM = '#fff1dc', GOZ = '#22201c', ATKI = '#22b45a', ATKI_K = '#178a43';

// Gövde (göz/kol/bacak hariç). Harf → renk: o turuncu, d koyu, c krem, k göz rengi (burun), g atkı, h atkı koyu
const GOVDE = [
  '.dd.........dd....',
  '.odo.......odo....',
  '.ocoo.....ooco....',
  '.ooooooooooooo....',
  'ooooooooooooooo...',
  'ooooooooooooooo...',
  'ooooooooooooooo.oo',
  'occcoooooooccco.oo',
  '.cccccckccccccooco',
  '..ccccccccccc.oocc',
  '...ggggggggg..occ.',
  '..oooogghgoooo.c..',
  '..ooooooooooo.....',
];
const PAL = { o: TURUNCU, d: KOYU, c: KREM, k: GOZ, g: ATKI, h: ATKI_K };

// gözler (sütun, satır): iki göz sütun 4 ve 10 civarı
const GOZLER = {
  n: [[4, 5], [4, 6], [10, 5], [10, 6]], l: [[3, 5], [3, 6], [9, 5], [9, 6]], r: [[5, 5], [5, 6], [11, 5], [11, 6]],
  u: [[4, 4], [4, 5], [10, 4], [10, 5]], d: [[4, 6], [4, 7], [10, 6], [10, 7]],
  blink: [[3, 6], [4, 6], [5, 6], [9, 6], [10, 6], [11, 6]],
  shut: [[3, 6], [4, 6], [5, 6], [9, 6], [10, 6], [11, 6]],
  happy: [[3, 6], [4, 5], [5, 6], [9, 6], [10, 5], [11, 6]],
  wide: [[4, 4], [4, 5], [4, 6], [10, 4], [10, 5], [10, 6]],
};
const BACAK = { stand: [[4, 13], [6, 13], [8, 13], [10, 13]], walkA: [[4, 13], [7, 13], [10, 13]], walkB: [[5, 13], [8, 13], [9, 13]],
  tuck: [], sit: [[3, 12], [11, 12]] };

export function grid({ eyes = 'n', arms = 'down', legs = 'stand' } = {}) {
  const P = new Map(), put = (c, r, v) => P.set(c + ',' + r, v);
  GOVDE.forEach((row, r) => [...row].forEach((ch, c) => { if (PAL[ch]) put(c, r, PAL[ch]); }));
  for (const [c, r] of GOZLER[eyes] || GOZLER.n) put(c, r, GOZ);
  for (const [c, r] of BACAK[legs] || BACAK.stand) put(c, r, KOYU);
  if (arms === 'up') for (const [c, r] of [[0, 9], [0, 10], [1, 10], [14, 9], [14, 10], [13, 10]]) put(c, r, TURUNCU);
  else if (arms === 'wave') for (const [c, r] of [[0, 11], [1, 11], [13, 8], [14, 7], [14, 8]]) put(c, r, TURUNCU);
  else if (arms === 'hold') for (const [c, r] of [[1, 11], [2, 11], [12, 10], [13, 10], [13, 9]]) put(c, r, TURUNCU);
  return [...P].map(([k, v]) => { const [c, r] = k.split(',').map(Number); return [c, r, v]; });
}

const W = 18, H = 14;
// x,y = ayakların altındaki orta nokta (dünya); px = piksel kenarı; sq>0 ezilme, <0 uzama; flip sola bakar
export function sprite({ x, y, px = 4, flip = false, sq = 0, rot = 0, op = 1, shadow = 1, ...poz }) {
  let s = '';
  for (let [c, r, v] of grid(poz)) { if (flip) c = W - 1 - c; s += `<rect x="${c}" y="${r}" width="1.04" height="1.04" fill="${v}"/>`; }
  const sy = 1 - sq, sx = 1 + sq * .7, w = W * px * sx, h = H * px * sy;
  const gl = shadow > 0 ? `<div style="position:absolute;left:${x - 6.5 * px}px;top:${y - px * .35}px;width:${13 * px}px;height:${px * .8}px;border-radius:50%;background:rgba(40,25,10,${.18 * shadow})"></div>` : '';
  // kuyruk sağda: görsel merkez gövdeye otursun diye ızgara 1.5 piksel sola kayık çizilir
  const ox = (flip ? 1.5 : -1.5) * px * sx;
  return gl + `<svg class="px" viewBox="0 0 ${W} ${H}" width="${w}" height="${h}" style="left:${x - w / 2 + ox}px;top:${y - h}px;opacity:${op};transform:rotate(${rot}rad);transform-origin:50% 60%" shape-rendering="crispEdges">${s}</svg>`;
}

export function pixart(rows, { x, y, px = 4, pal, op = 1 }) {
  let s = ''; rows.forEach((row, r) => [...row].forEach((ch, c) => { if (pal[ch]) s += `<rect x="${c}" y="${r}" width="1.04" height="1.04" fill="${pal[ch]}"/>`; }));
  const w = rows[0].length, h = rows.length;
  return `<svg class="px" viewBox="0 0 ${w} ${h}" width="${w * px}" height="${h * px}" style="left:${x}px;top:${y}px;opacity:${op}" shape-rendering="crispEdges">${s}</svg>`;
}
export const UNLEM = (x, y, px = 4, op = 1) => pixart(['kk', 'kk', 'kk', 'kk', 'kk', '..', 'kk'], { x, y, px, op, pal: { k: GOZ } });
export const NOKTALAR = (x, y, px = 4, n = 3, op = 1) => n < 1 ? '' : pixart(['kk.kk.kk'.slice(0, n * 3 - 1), 'kk.kk.kk'.slice(0, n * 3 - 1)], { x, y, px, op, pal: { k: GOZ } });
export const KALEM = (x, y, px = 4, op = 1) => pixart(['......kk', '.....yyk', '....yyy.', '...yyy..', '..yyy...', '.pyy....', 'ppy.....', 'k.......'], { x, y, px, op, pal: { y: '#f2c14e', k: GOZ, p: '#e8a898' } });
// zil: a = salınım açısı (radyan)
export const ZIL = (x, y, px = 4, a = 0, op = 1) => pixart(['...k...', '..yyy..', '.yyyyy.', '.yyyyy.', '.yyyyy.', 'yyyyyyy', '...k...'], { x, y, px, op, pal: { y: '#f2c14e', k: GOZ } })
  .replace('style="', `style="transform:rotate(${a}rad);transform-origin:50% 0;`);
export const KIVILCIM = (x, y, px = 4, renk = '#f2c14e', op = 1) => pixart(['..y..', '..y..', 'yy.yy', '..y..', '..y..'], { x: x - 2.5 * px, y: y - 2.5 * px, px, op, pal: { y: renk } });
export const TIK = (x, y, px = 4, op = 1) => pixart(['.....g', '....gg', 'g..gg.', 'gggg..', '.gg...'], { x, y, px, op, pal: { g: ATKI } });
export const KALP = (x, y, px = 4, op = 1) => pixart(['.rr.rr.', 'rrrrrrr', 'rrrrrrr', '.rrrrr.', '..rrr..', '...r...'], { x: x - 3.5 * px, y: y - 3 * px, px, op, pal: { r: '#e0543a' } });
export const Z = (x, y, px = 4, op = 1) => pixart(['kkkk', '..k.', '.k..', 'kkkk'], { x, y, px, op, pal: { k: GOZ } });

// iniş tozu: t 0→1 iki yana yayılır
export function toz(x, y, t, px = 3, n = 6, tohum = 1) {
  if (t <= 0 || t >= 1) return ''; let s = '';
  for (let i = 0; i < n; i++) {
    const yan = i % 2 ? 1 : -1, k = (i >> 1) + 1, e = 1 - Math.pow(1 - t, 2);
    const dx = yan * (10 + k * 10 + ((tohum * 7 + i * 13) % 7)) * e, dy = -(5 + k * 3) * Math.sin(Math.PI * t * .9);
    const sz = px * (1 - t * .7);
    s += `<div style="position:absolute;left:${x + dx - sz / 2}px;top:${y + dy - sz}px;width:${sz}px;height:${sz}px;background:#d9cbb4;opacity:${1 - t}"></div>`;
  }
  return s;
}
// piksel patlaması (doğuş / dağılış): k 0→1
export function patlama(x, y, k, n = 16, renkler = [TURUNCU, KREM, ATKI], hash) {
  let s = '';
  for (let i = 0; i < n; i++) {
    const a = hash(i * 2.3) * Math.PI * 2, r = (8 + hash(i * 7.7) * 40) * k, sz = 4 * (1 - k * .5);
    s += `<div style="position:absolute;left:${x + Math.cos(a) * r}px;top:${y + Math.sin(a) * r * .7}px;width:${sz}px;height:${sz}px;background:${renkler[i % renkler.length]};opacity:${1 - k}"></div>`;
  }
  return s;
}
