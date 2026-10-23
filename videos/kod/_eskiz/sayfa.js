// Kalem + suluboya eskiz hikâyelerinin ortak iskeleti (dikey 1080×1920): dünyayı bir kez pişirir (renk + iki kalem katmanı
// ve çizilme zamanları), GL birleştirici, dikey kamera dönüşümü, kâğıt dokusu, el yazısı basılı sözler.
import { rng, n2, penStroke, rasterPen, compositor, handwrite, clamp, INK, rgba } from './engine.js';

export const EW = 1080, EH = 1920;
function cv(w, h, fill) { const c = document.createElement('canvas'); c.width = w; c.height = h; const x = c.getContext('2d', { willReadFrequently: true }); if (fill) { x.fillStyle = fill; x.fillRect(0, 0, w, h); } return [c, x]; }

// ciz({ cx (renk ctx), penA(pts, o, t0, dur), penB(pts, o, t0, dur), W, H }) dünyayı çizer
export function dunyaKur(W, H, winA, winB, ciz) {
  const [colorC, cx] = cv(W, H, '#fff');
  const [inkAC, ia] = cv(W, H), [timeAC, ta] = cv(W, H, '#fff'), [inkBC, ib] = cv(W, H), [timeBC, tb] = cv(W, H, '#fff');
  ta.globalCompositeOperation = 'darken'; tb.globalCompositeOperation = 'darken';
  const strokes = [];
  const pen = (ik, tk, win, kat) => (pts, o = {}, t0 = 0, dur) => {
    const st = penStroke(pts, o); if (st.P.length < 2) return st;
    const du = dur ?? clamp(st.L / 2600, .04, .35);
    rasterPen(ik, tk, st, t0, du, win); strokes.push([+t0.toFixed(3), +du.toFixed(3), Math.round(st.L), kat]); return st;
  };
  const ek = ciz({ cx, penA: pen(ia, ta, winA, 0), penB: pen(ib, tb, winB, 1), W, H }) || {};
  const pack = (r, g) => { const out = new Uint8Array(W * H * 4); const A = r.getImageData(0, 0, W, H).data, B = g.getImageData(0, 0, W, H).data;
    for (let i = 0, n = W * H; i < n; i++) { out[i * 4] = A[i * 4 + 3]; out[i * 4 + 1] = B[i * 4 + 3]; out[i * 4 + 3] = 255; } return out; };
  const packT = (r, g) => { const out = new Uint8Array(W * H * 4); const A = r.getImageData(0, 0, W, H).data, B = g.getImageData(0, 0, W, H).data;
    for (let i = 0, n = W * H; i < n; i++) { out[i * 4] = A[i * 4]; out[i * 4 + 1] = B[i * 4]; out[i * 4 + 3] = 255; } return out; };
  return { W, H, color: colorC, ink: pack(ia, ib), time: packT(ta, tb), winA, winB, strokes, ...ek };
}

// sahne: GL birleştirici + 2B üst katman (figürler, el yazısı) — dikey
export function sahne(world, arr, gw, gh) {
  const cvs = document.getElementById('c'), ctx = cvs.getContext('2d');
  const glc = document.createElement('canvas'); glc.width = EW; glc.height = EH;
  const comp = compositor(glc, { ...world, arr, gw, gh });
  const tooth = (() => { const c = document.createElement('canvas'); c.width = c.height = 512; const x = c.getContext('2d'); const im = x.createImageData(512, 512); const R = rng(77);
    for (let j = 0; j < 512; j++) for (let i = 0; i < 512; i++) { const v = n2(i * .35, j * .35, 3) * .6 + n2(i * .09, j * .09, 5) * .4; const g = 255 - Math.max(0, (v - .55)) * 55 - (R() < .004 ? 25 : 0); const k = (j * 512 + i) * 4; im.data[k] = g; im.data[k + 1] = g * .995; im.data[k + 2] = g * .985; im.data[k + 3] = 255; }
    x.putImageData(im, 0, 0); return c; })();
  const toothPat = ctx.createPattern(tooth, 'repeat');
  return {
    ctx,
    // kamerayı uygula: GL resmini çiz, ctx'i dünya koordinatına al
    bas(cam, t) {
      comp(cam, t);
      ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalCompositeOperation = 'source-over'; ctx.drawImage(glc, 0, 0);
      const c = Math.cos(cam.rot || 0), s = Math.sin(cam.rot || 0);
      ctx.setTransform(cam.z * c, cam.z * s, -cam.z * s, cam.z * c, EW / 2 - cam.z * (c * cam.cx - s * cam.cy), EH / 2 - cam.z * (s * cam.cx + c * cam.cy));
    },
    // kâğıt dokusu her şeyin üstüne (figürler dahil), sonra ekran koordinatına dön
    bitir(cam) {
      const c = Math.cos(cam.rot || 0), s = Math.sin(cam.rot || 0);
      ctx.save(); ctx.globalCompositeOperation = 'multiply'; ctx.fillStyle = toothPat;
      ctx.setTransform(cam.z * c * .8, cam.z * s * .8, -cam.z * s * .8, cam.z * c * .8, EW / 2 - cam.z * (c * cam.cx - s * cam.cy), EH / 2 - cam.z * (s * cam.cx + c * cam.cy));
      const iz = 1 / (cam.z * .8); ctx.fillRect((cam.cx - 1500 / cam.z) / .8, (cam.cy - 1500 / cam.z) / .8, 3000 * iz, 3000 * iz); ctx.restore();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
    },
  };
}

// el yazısı basılı söz: ekranın alt kenar boşluğuna yazılır (kâğıt rengi hale + mürekkep), soldan sağa açılır
export function soz(ctx, SUBS, t, { y = 1790, size = 64 } = {}) {
  for (const [t0, t1, s] of SUBS) {
    if (t < t0 || t > t1) continue;
    ctx.save(); ctx.font = `500 ${size}px Caveat`;
    const satir = bol(ctx, s, 960), lh = size * 1.05, y0 = y - (satir.length - 1) * lh;
    const top = [...s].length; let n = 0;
    satir.forEach((l, i) => {
      const p = clamp(((t - t0) / Math.max(.6, top * .022)) * top / [...l].length - n / [...l].length);
      ctx.save(); ctx.shadowColor = 'rgba(245,238,222,.95)'; ctx.shadowBlur = 18;
      handwrite(ctx, l, 540, y0 + i * lh, size, p, { font: 'Caveat', weight: 500, col: INK, alpha: .9, align: 'center' });
      handwrite(ctx, l, 540, y0 + i * lh, size, p, { font: 'Caveat', weight: 500, col: INK, alpha: .9, align: 'center' });
      ctx.restore(); n += [...l].length;
    });
    ctx.restore();
  }
}
function bol(g, s, maxW) { const k = s.split(' '); const out = []; let cur = ''; for (const w of k) { const d = cur ? cur + ' ' + w : w; if (g.measureText(d).width > maxW && cur) { out.push(cur); cur = w; } else cur = d; } if (cur) out.push(cur); return out; }
export const metinler = SUBS => t => SUBS.filter(([a, b, s]) => t >= a + Math.max(.6, [...s].length * .022) && t <= b).map(([a, b, s]) => ({ id: 'sub' + SUBS.findIndex(x => x[2] === s), text: s, x0: 60, y0: 1650, x1: 1020, y1: 1880 }));

// tasarlanmış kamera: [[t, cx, cy, z], ...] eio geçişli
export function kamera(KAM) {
  const eio = t => { t = clamp(t); return t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; };
  return t => {
    if (t <= KAM[0][0]) return { cx: KAM[0][1], cy: KAM[0][2], z: KAM[0][3] };
    for (let i = 1; i < KAM.length; i++) if (t < KAM[i][0]) { const a = KAM[i - 1], b = KAM[i], k = eio((t - a[0]) / (b[0] - a[0]));
      return { cx: a[1] + (b[1] - a[1]) * k, cy: a[2] + (b[2] - a[2]) * k, z: Math.exp(Math.log(a[3]) + (Math.log(b[3]) - Math.log(a[3])) * k) }; }
    const L = KAM[KAM.length - 1]; return { cx: L[1], cy: L[2], z: L[3] };
  };
}
export function olaylar() { const EV = []; return { EV, ev: (t, type, o = {}) => EV.push({ t: +t.toFixed(3), type, ...o }) }; }
