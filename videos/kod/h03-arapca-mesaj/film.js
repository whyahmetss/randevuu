// Arapça Mesaj — çarşı sokağı eskizi (kalem + suluboya, dikey). Önden dükkân sırası; Yasmin otelden berbere yürür, kamera yanal
// takip eder. Tek renkli şey: Yasmin'in turkuaz başörtüsü; onay gelince renk dükkândan sokağa yayılır.
// Bot metinleri: sohbetAsistani.js ar saatler + onay, botMesajlar.js ar "تم تأكيد الموعد!". Panel satırı BugunMobil.jsx.
import { clamp, lerp, ss, rng, fbm, hex, INK, rgba, ellipse, spline, wash, foliage, arrivalField, sampleField,
  figure, drawPrims, penStroke, drawPen, handwrite, R3, sketchShape, rough } from './ortak/engine.js';
import { stand, walk, wave } from './ortak/poses.js';
import { dunyaKur, sahne, soz, metinler, kamera, olaylar } from './ortak/sayfa.js';
const { V } = R3;

export const DUR = 28.4;
export const { EV, ev } = olaylar();
const W = 3000, H = 3800, WIN_A = [.6, 3.2], WIN_B = [9.6, 1.4];
const ZEMIN = 2440;
const C = { duvar: hex('#d8c6a0'), duvarG: hex('#c7b396'), duvarP: hex('#d9b8a6'), tente: hex('#c9573f'), tenteS: hex('#e2b04a'), cam: hex('#98b1c8'),
  tas: hex('#c9bfa8'), tabela: hex('#2f8f58'), turkuaz: hex('#2bb3a8'), yesil: hex('#2f8f58'), sis: hex('#b9c0cc'), gok: hex('#bcd0dc') };
const YAS = { skin: hex('#d9a383'), top: hex('#8a7a9a'), bottom: hex('#6a6a70'), hair: hex('#2e2622'), hairLong: 1, sleeve: 'long', shoe: hex('#4a3a30'), torso: [.08, .07, .095] };
const USTA = { skin: hex('#c48a6a'), top: hex('#eeebe2'), bottom: hex('#4a4a52'), hair: hex('#2e2622'), curly: 1, shoe: hex('#333') };
const USTA_YER = { x: 2560, y: ZEMIN + 10, S: 520 };
const yasX = t => lerp(430, 2240, ss(clamp((t - 3.6) / 18.8)));

// ───────── dünya
const world = dunyaKur(W, H, WIN_A, WIN_B, ({ cx, penA, penB }) => {
  const R = rng(303);
  const tA = (pts, k = 0) => { const m = pts[pts.length >> 1]; return WIN_A[0] + .1 + Math.hypot(m[0] - 1500, (m[1] - 1800) * 1.3) / 1900 + k; };
  const L = (pts, o = {}, k = 0) => penA(pts, { w: 2.6, wob: 1, gap: .4, seed: (pts[0][0] * 7 + pts[0][1]) | 0, ...o }, tA(pts, k));
  const kutu = (x0, y0, x1, y1) => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
  // gökyüzü + puslu siluet (kubbe ve minareler, genel)
  for (let k = 0; k < 2; k++) wash(cx, [[140, 520 + k * 120], [W - 140, 480 + k * 140], [W - 120, 1180], [120, 1180]], C.gok, { a: .18, j: 40, layers: 2, edge: 0, seed: 10 + k });
  const sil = [[200, 1180]];
  for (const [x, w, h, tip] of [[420, 260, 260, 'kubbe'], [800, 40, 520, 'minare'], [1180, 360, 330, 'kubbe'], [1620, 40, 600, 'minare'], [2050, 300, 280, 'kubbe'], [2520, 40, 480, 'minare']]) {
    if (tip === 'kubbe') { const p = [[x - w / 2, 1180], [x - w / 2, 1180 - h * .45], ...ellipse(x, 1180 - h * .45, w / 2, h * .55, 16).slice(8, 17), [x + w / 2, 1180]]; wash(cx, p, C.sis, { a: .35, j: 6, layers: 2, edge: .15, seed: x }); L(p, { w: 1.6, wob: .8 }, .2); }
    else { const p = [[x - w / 2, 1180], [x - w / 2, 1180 - h], [x, 1180 - h - 90], [x + w / 2, 1180 - h], [x + w / 2, 1180]]; wash(cx, p, C.sis, { a: .35, j: 4, layers: 2, edge: .15, seed: x }); L(p, { w: 1.5, wob: .6, smooth: false }, .2); }
  }
  for (let i = 0; i < 5; i++) { const x = 600 + i * 380 + R() * 80, y = 760 + R() * 160; L([[x - 22, y], [x - 6, y - 10], [x, y], [x + 6, y - 10], [x + 22, y]], { w: 1.6, wob: .3, smooth: false }, .4); }
  // dükkân sırası
  const bina = (x0, x1, top, col, seed) => { const p = kutu(x0, top, x1, ZEMIN); wash(cx, p, col, { a: .45, j: 8, layers: 3, edge: .25, seed }); L([...p, p[0]], { smooth: false }); };
  bina(150, 720, 1220, C.duvar, 20);                       // otel
  for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) { const x0 = 210 + c * 170, y0 = 1330 + r * 230, w = kutu(x0, y0, x0 + 110, y0 + 150); wash(cx, w, C.cam, { a: .4, j: 4, layers: 2, edge: .2, seed: 30 + r * 3 + c }); L([...w, w[0]], { w: 1.6, smooth: false }); }
  L(kutu(360, 2080, 520, ZEMIN), { w: 2.4, smooth: false });
  bina(760, 1300, 1560, C.duvarP, 40);                     // kafe
  const t1 = [[740, 1880], [1320, 1880], [1360, 2000], [700, 2000]]; wash(cx, t1, C.tente, { a: .55, j: 6, layers: 3, edge: .3, seed: 41 }); L([...t1, t1[0]], { smooth: false });
  for (let i = 0; i < 6; i++) L([[760 + i * 100, 2000], [790 + i * 100, 2040], [820 + i * 100, 2000]], { w: 1.6, smooth: false }, .2);
  for (const x of [880, 1150]) { L([[x - 60, 2290], [x + 60, 2290]], { w: 2.2 }); L([[x, 2290], [x, ZEMIN]], { w: 2 }); }
  bina(1340, 1900, 1440, C.duvarG, 50);                    // fırın
  const t2 = [[1320, 1840], [1920, 1840], [1960, 1960], [1280, 1960]]; wash(cx, t2, C.tenteS, { a: .55, j: 6, layers: 3, edge: .3, seed: 51 }); L([...t2, t2[0]], { smooth: false });
  const v2 = kutu(1420, 2020, 1820, 2300); wash(cx, v2, C.cam, { a: .35, j: 5, layers: 2, edge: .2, seed: 52 }); L([...v2, v2[0]], { w: 2, smooth: false });
  for (let i = 0; i < 5; i++) { const e = ellipse(1480 + i * 72, 2250, 30, 18, 12); wash(cx, e, hex('#c9955a'), { a: .5, j: 3, layers: 2, edge: .3, seed: 53 + i }); L([...e, e[0]], { w: 1.4 }, .2); }
  bina(1940, 2860, 1300, C.duvar, 60);                     // Kuzey Berber
  const tb = kutu(1960, 1640, 2840, 1800); wash(cx, tb, C.tabela, { a: .62, j: 6, layers: 3, edge: .3, seed: 61 }); L([...tb, tb[0]], { w: 2.8, smooth: false });
  const vt = kutu(2380, 1880, 2800, 2300); wash(cx, vt, C.cam, { a: .4, j: 6, layers: 2, edge: .3, seed: 62 }); L([...vt, vt[0]], { w: 2.2, smooth: false });
  L(kutu(2100, 1900, 2320, ZEMIN), { w: 2.6, smooth: false });
  for (let i = 0; i < 7; i++) L([[2340, 1920 + i * 46], [2364, 1946 + i * 46]], { w: 2.2, smooth: false }, .2);
  for (let r = 0; r < 2; r++) for (let c = 0; c < 4; c++) { const w = kutu(2010 + c * 210, 1360 + r * 140, 2110 + c * 210, 1460 + r * 140); wash(cx, w, C.cam, { a: .35, j: 4, layers: 2, edge: .2, seed: 70 + r * 4 + c }); L([...w, w[0]], { w: 1.4, smooth: false }); }
  // kaldırım
  const kal = [[100, ZEMIN], [2900, ZEMIN], [2930, ZEMIN + 200], [80, ZEMIN + 200]]; wash(cx, kal, C.tas, { a: .35, j: 8, layers: 2, edge: .1, seed: 80 });
  L([[100, ZEMIN + 200], [2920, ZEMIN + 200]], { w: 2.4 });
  for (let x = 160; x < 2900; x += 160) L([[x, ZEMIN + 10], [x - 20, ZEMIN + 190]], { w: 1.2, gap: .6 }, .3);
  // sokak ağacı
  foliage(cx, [{ x: 1960 - 30, y: 1700, r: 150 }, { x: 1880, y: 1600, r: 110 }], { seed: 90, scale: .9 });
  L([[1930, ZEMIN], [1925, 1820]], { w: 4 });
  // kenar boşluğu: iki telefon
  for (const [x0, x1] of [[560, 1440], [1560, 2440]]) { const p = kutu(x0, 2900, x1, 3760); penB([...p, p[0], p[1]], { w: 3.4, wob: 1, seed: x0, smooth: false }, WIN_B[0], .6); }
});

const GW = 600, GH = 760;
const arr = arrivalField(W, H, GW, GH, [{ x: 2400, y: 2000, t: 17.6, v: 1100, R: 3200, mask: (x, y) => y < 2700 }], { amp: 220 });
const T = (x, y) => sampleField(arr, W, H, GW, GH, x, y);
const colorAt = (x, y, t) => clamp((t - T(x, y) - .05) / .45);

// kamera: açılış geniş → Yasmin'i yanal takip → Usta → kenar boşluğu (Arapça) → panel → kapı → bütün sayfa
const takip = t => yasX(t) + 160;
const KAM = kamera([
  [0, 1500, 2000, .5], [3.4, 1500, 2000, .52], [4.4, 700, 2050, .95], [9.4, 1500, 2050, .95],
  [10.2, 2480, 2040, 1.12], [12.4, 2480, 2040, 1.15], [13.2, 1000, 3330, 1.08], [17.6, 1000, 3330, 1.1], [18.4, 2000, 3330, 1.08], [21.8, 2000, 3330, 1.1],
  [22.8, 2330, 2050, 1.0], [25.8, 2350, 2050, 1.04], [28.4, 1500, 2150, .4],
]);
const kam = t => { const k = KAM(t); if (t > 4.4 && t < 9.4) { const w = ss(clamp((t - 4.4) / .8)) * (1 - ss(clamp((t - 8.6) / .8))); k.cx = lerp(k.cx, takip(t), w); } return k; };
export const SUBS = [
  [0.4, 4.6, 'Usta Arapça bilmez.'],
  [5.0, 9.6, 'Yasmin dükkâna Arapça yazdı.'],
  [12.8, 17.6, 'SıraGO ona Arapça cevap verdi.'],
  [18.2, 22.4, 'Randevu panele Türkçe düştü.'],
  [22.6, DUR, 'Müşterinin dilinde cevap, senin panelinde randevu.'],
];
export const TEXTS = metinler(SUBS);
SUBS.forEach(([t0, t1, text]) => ev(t0, 'altyazi', { t1: Math.min(t1, DUR), text }));
world.strokes.forEach(([t, d]) => ev(t, 'kalem', { d }));
const AR = [
  { t: 6.4, m: ['مرحبا، هل يوجد موعد اليوم؟'], kim: 'm' },
  { t: 13.4, m: ['الأوقات المتاحة يوم السبت، ٣١ أكتوبر:', '15:00, 16:20.', 'أيّها يناسبك؟'], kim: 'b' },
  { t: 14.8, m: ['15:00'], kim: 'm' },
  { t: 15.4, m: ['هل أؤكد الحجز؟ (اكتب "نعم")'], kim: 'b' },
  { t: 16.3, m: ['نعم'], kim: 'm' },
  { t: 17.0, m: ['تم تأكيد الموعد!'], kim: 'b' },
];
AR.forEach(q => ev(q.t, q.kim === 'b' ? 'yaz_bot' : 'yaz', { d: .8 }));
ev(10.2, 'soru'); ev(17.6, 'renk', { d: 2.2 }); ev(18.6, 'panel'); ev(22.6, 'zil'); ev(23.4, 'selam'); ev(24.4, 'selam2');
for (let t = 4.0; t < 22.4; t += .5) ev(t, 'adim');

const S = sahne(world, arr, GW, GH), ctx = S.ctx;
const boil = t => Math.floor(t * 12);
function yazAr(l, x, y, size, p, bot, col) {
  ctx.save(); ctx.globalAlpha = p; ctx.direction = 'rtl'; ctx.textAlign = bot ? 'left' : 'right';   // telefon Yasmin'in: kendi mesajı sağda, SıraGO solda
  ctx.font = `${bot ? 600 : 400} ${size}px "Segoe UI", Tahoma, Arial`; ctx.fillStyle = rgba(col, .92); ctx.fillText(l, x, y); ctx.restore();
}
function yasmin(t) {
  const x = yasX(t), y = ZEMIN + 20, Sd = 520, yuruyor = t > 3.6 && t < 22.4;
  const pose = yuruyor ? { ...walk(t * 6.5), handR: V(.1, .66, .26), elbR: V(1, -.5, 0) } : t > 23.2 && t < 27 ? wave(t * 6) : stand();
  const prims = figure(YAS, pose, { x, y, S: Sd, yaw: Math.PI / 2 }, { seed: 400, boil: boil(t) });
  drawPrims(ctx, prims, { color: colorAt(x, y - Sd * .5, t), ink: clamp((t - 1.2) / 1.2) });
  const h = prims.head; if (h && t > 1.2) {
    const [cx, cy] = h.c, r = h.r;
    const ort = rough([...ellipse(cx, cy - r * .1, r * 1.32, r * 1.36, 18).slice(9, 18), [cx + r * 1.4, cy + r * .9], [cx + r * 1.1, cy + r * 2.0], [cx - r * 1.1, cy + r * 2.0], [cx - r * 1.4, cy + r * .9]], r * .06, 3);
    sketchShape(ctx, ort, C.turkuaz, { ink: 2.2, wash: .85, seed: 410 + boil(t), color: 1, p: clamp((t - 1.2) / .6) });
    const yuz = rough(ellipse(cx + r * .28, cy + r * .1, r * .62, r * .82, 14), r * .04, 4);
    drawPrims(ctx, [{ k: 'knock', poly: yuz, a: .95 }, { k: 'wash', poly: yuz, col: YAS.skin, a: .45 * colorAt(x, y - Sd, t) }], { color: 1 });
  }
  if (t > 23.4 && t < 27.8) handwrite(ctx, 'Merhaba usta.', x - 260, y - Sd * .98, 64, clamp((t - 23.4) / .7), { font: 'Caveat', weight: 600 });
  if (t > 6.0 && t < 7.4) { const p = prims.hand?.R; if (p) for (let k = 0; k < 3; k++) drawPen(ctx, penStroke([[p[0] + 16 + k * 10, p[1] - 34 - k * 8], [p[0] + 28 + k * 10, p[1] - 50 - k * 8]], { w: 2.2, seed: 420 + k + boil(t) }), 1); }
}
function usta(t) {
  const pose = t > 24.4 && t < 27.8 ? wave(t * 6) : { ...stand(), handR: V(.08, .66, .24), handL: V(-.04, .62, .22), elbR: V(1, -.6, 0), elbL: V(-1, -.6, 0), nod: .25 };
  const prims = figure(USTA, pose, { ...USTA_YER, yaw: -Math.PI / 2 }, { seed: 500, boil: boil(t) });
  drawPrims(ctx, prims, { color: colorAt(USTA_YER.x, USTA_YER.y - 200, t), ink: clamp((t - 2.0) / 1.2) });
  if (t > 10.2 && t < 17.6) handwrite(ctx, '?', USTA_YER.x + 40, USTA_YER.y - USTA_YER.S * 1.22, 130, clamp((t - 10.2) / .4), { font: 'Caveat', weight: 700 });
  if (t > 24.4 && t < 27.8) handwrite(ctx, 'Hoş geldin!', USTA_YER.x + 20, USTA_YER.y - USTA_YER.S * 1.05, 64, clamp((t - 24.4) / .7), { font: 'Caveat', weight: 600 });
}
function telefonlar(t) {
  let y = 3010;
  for (const q of AR) {
    if (t < q.t) break;
    q.m.forEach((l, i) => { yazAr(l, q.kim === 'b' ? 600 : 1400, y, 40, clamp((t - q.t - i * .2) / .4), q.kim === 'b', q.kim === 'b' ? C.yesil : INK); y += 62; });
    y += 30;
  }
  if (t > 18.4) {
    const p = k => clamp((t - 18.4 - k * .25) / .5);
    handwrite(ctx, 'Bugün', 1620, 3010, 60, p(0), { font: 'Caveat', weight: 700 });
    handwrite(ctx, '15:00', 1620, 3150, 72, p(1), { font: 'Caveat', weight: 700 });
    handwrite(ctx, 'Yasmin', 1830, 3140, 60, p(2), { font: 'Caveat', weight: 600 });
    handwrite(ctx, 'Saç kesim · WhatsApp’tan', 1830, 3202, 44, p(3), { font: 'Caveat', alpha: .75 });
    handwrite(ctx, 'Onaylı', 2400, 3140, 50, p(4), { font: 'Caveat', weight: 700, col: C.yesil, align: 'right' });
    drawPen(ctx, penStroke([[1610, 3250], [2400, 3244]], { w: 1.6, seed: 600 }), p(4), INK, .5);
  }
}

window.DUR = DUR;
window.render = t => {
  const cam = kam(t);
  S.bas(cam, t);
  handwrite(ctx, 'Cumartesi · çarşı · güneşli', 180, 360, 80, clamp((t - .3) / .9), { font: 'Caveat', weight: 500, rot: -.02 });
  if (t > 2.0) handwrite(ctx, 'Otel', 435, 1290, 70, clamp((t - 2.0) / .5), { font: 'Caveat', weight: 700, align: 'center' });
  if (t > 2.4) handwrite(ctx, 'Kuzey Berber', 2400, 1750, 96, clamp((t - 2.4) / .8), { font: 'Caveat', weight: 700, col: [245, 238, 222], align: 'center' });
  yasmin(t); usta(t);
  telefonlar(t);
  S.bitir(cam);
  soz(ctx, SUBS, t);
};
window.EV = EV; window.SUBS = SUBS.map(([t0, t1, text]) => ({ t0, t1, text })); window.TEXTS = TEXTS;
window.READY = true;
