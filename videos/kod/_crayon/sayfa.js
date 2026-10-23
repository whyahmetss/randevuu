// Pastel hikâyelerin ortak sayfa iskeleti: kamera eğrisi, basılı sözler (altyazı yaması), suluboya bandı, okuma denetimi.
import { CAM, text, sx, sy } from './crayon.js';
import { PAL } from './pal.js';
import { clamp, lerp, eio, hash } from '/core/lib.js';
const K = PAL.crayon;

// KAM: [[t, x, y, s], ...] → t ↦ [x, y, s]; yakınlık logaritmik, geçişler eio
export function kamera(KAM) {
  return t => {
    if (t <= KAM[0][0]) return KAM[0].slice(1);
    for (let i = 1; i < KAM.length; i++) if (t < KAM[i][0]) {
      const a = KAM[i - 1], b = KAM[i], k = eio((t - a[0]) / (b[0] - a[0]));
      return [lerp(a[1], b[1], k), lerp(a[2], b[2], k), Math.exp(lerp(Math.log(a[3]), Math.log(b[3]), k))];
    }
    return KAM[KAM.length - 1].slice(1);
  };
}

// basılı sözler: ekran altında yırtık kâğıt yaması (knock) + el yazısı, harf harf (0.35 sn)
export function altyazi(SUBK, SUBT, SUBS, t, { size = 52, y = 1800 } = {}) {
  for (const [t0, t1, s] of SUBS) {
    if (t < t0 || t > t1) continue;
    const g = SUBT.g; g.save(); g.font = `400 ${size}px "Patrick Hand"`;
    const satir = bol(g, s, 900), w = Math.max(...satir.map(l => g.measureText(l).width)) + 70; g.restore();
    const lh = size * 1.2, y0 = y - (satir.length - 1) * lh, h = satir.length * lh + 44, x0 = 540 - w / 2, yy0 = y0 - size * 1.08;
    const kg = SUBK.g; kg.save(); kg.fillStyle = '#000'; kg.beginPath();
    for (let i = 0; i <= 40; i++) kg.lineTo(x0 + i / 40 * w, yy0 + (hash(i * 3.1) - .5) * 10);
    for (let i = 0; i <= 12; i++) kg.lineTo(x0 + w + (hash(i * 5.7) - .5) * 10, yy0 + i / 12 * h);
    for (let i = 40; i >= 0; i--) kg.lineTo(x0 + i / 40 * w, yy0 + h + (hash(i * 7.3) - .5) * 10);
    for (let i = 12; i >= 0; i--) kg.lineTo(x0 + (hash(i * 9.1) - .5) * 10, yy0 + i / 12 * h);
    kg.closePath(); kg.fill(); kg.restore();
    const top = [...s].length; let n = 0;
    satir.forEach((l, i) => { text(SUBT, l, 540, y0 + i * lh, { size, font: 'Patrick Hand', col: K.ink, reveal: clamp((t - t0) / .35 - n / top) * top / [...l].length, seed: 1500 + i }); n += [...l].length; });
  }
}
function bol(g, s, maxW) {
  const k = s.split(' '); const out = []; let cur = '';
  for (const w of k) { const d = cur ? cur + ' ' + w : w; if (g.measureText(d).width > maxW && cur) { out.push(cur); cur = w; } else cur = d; }
  if (cur) out.push(cur); return out;
}

// suluboya: [x0, x1] genişliğinde, yukarıdan aşağı (ya da aşağıdan yukarı) akan bant; k 0→1 ilerleme
export function yikama(W, k, { x0 = -400, x1 = 1480, ust = -60, alt = 2500, yukari = false, t = 0, yogun = .9 } = {}) {
  const g = W.g, kenar = yukari ? lerp(alt, ust, k) : lerp(ust, alt, k);
  g.save(); g.fillStyle = `rgba(255,255,255,${yogun})`; g.beginPath();
  const bas = yukari ? alt : ust;
  g.moveTo(sx(x0), sy(bas)); g.lineTo(sx(x1), sy(bas));
  for (let x = x1; x >= x0; x -= 30) g.lineTo(sx(x), sy(kenar + Math.sin(x * .02 + t * 2) * 18 + (hash(Math.floor(x / 30)) - .5) * 14));
  g.closePath(); g.fill();
  if (k > 0 && k < 1) { g.fillStyle = 'rgba(255,255,255,.35)'; g.fillRect(0, sy(kenar) - (yukari ? 10 : 40) * CAM.s, 1080, 50 * CAM.s); }
  g.restore();
}

// readcheck için ekrandaki basılı sözler (harf açılımı bitince)
export const metinler = SUBS => t => SUBS.filter(([a, b]) => t >= a + .4 && t <= b).map(([a, b, s]) => ({ id: 'sub' + SUBS.findIndex(x => x[2] === s), text: s, x0: 90, y0: 1680, x1: 990, y1: 1880 }));

// olay listesi yardımcısı
export function olaylar() { const EV = []; return { EV, ev: (t, type, o = {}) => EV.push({ t: +t.toFixed(3), type, ...o }) }; }
