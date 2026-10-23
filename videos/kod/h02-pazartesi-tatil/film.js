// Pazartesi Tatil — göl kenarı eskizi (kalem + suluboya, dikey). Bot metinleri: sohbetAsistani.js kapali + saatler (aynı mesajda,
// satır 363), onay; botMesajlar.js "Randevunuz Oluşturuldu!". Yüzler bu stilde boş: duygu duruşla.
import { clamp, lerp, ss, TAU, rng, fbm, n2, hex, mix3, INK, rgba, rough, ellipse, spline, wash, dab, foliage, arrivalField, sampleField,
  figure, drawPrims, penStroke, drawPen, handwrite, R3, sketchShape } from './ortak/engine.js';
import { stand, sit } from './ortak/poses.js';
import { dunyaKur, sahne, soz, metinler, kamera, olaylar } from './ortak/sayfa.js';
const { V } = R3;

export const DUR = 28.0;
export const { EV, ev } = olaylar();
const W = 2000, H = 3800, WIN_A = [1.0, 3.6], WIN_B = [11.0, 1.2];
const ORIGIN = [1150, 2150];
const C = { sky: hex('#9fbcd6'), hill: hex('#a7aec2'), hillD: hex('#8b93a6'), lake: hex('#7fa6b8'), lakeD: hex('#5f8496'), reed: hex('#9fb15a'), reedD: hex('#6f8a45'),
  wood: hex('#b08a62'), woodD: hex('#7d5f45'), bucket: hex('#8a96a6'), yesil: hex('#2f8f58') };
const USTA = { skin: hex('#d9a383'), top: hex('#7d8fae'), bottom: hex('#55555c'), hair: hex('#8a8580'), shoe: hex('#4a3a30'), torso: [.082, .09, .112] };
const SEAT = { x: 1160, y: 2168, S: 470 };
const ROD_TIP = [640, 1560], FLOAT = [610, 2030];

// ───────── dünya (bir kez)
const world = dunyaKur(W, H, WIN_A, WIN_B, ({ cx, penA, penB }) => {
  const R = rng(202);
  const tA = (pts, k = 0) => { const m = pts[pts.length >> 1]; return WIN_A[0] + .1 + Math.hypot(m[0] - ORIGIN[0], (m[1] - ORIGIN[1]) * 1.2) / 1500 + k; };
  // gökyüzü (hafif, yukarı doğru solar), bulut boşlukları
  for (let k = 0; k < 3; k++) wash(cx, [[120, 420 + k * 120], [W - 120, 380 + k * 140], [W - 90, 1330], [90, 1330]], C.sky, { a: .16, j: 40, layers: 2, edge: 0, seed: 10 + k });
  // uzak tepeler
  const tepe = x => 1220 - Math.sin(x * .0021 + 1) * 90 - fbm(x * .004, 1, 3) * 70;
  const tp = []; for (let x = 0; x <= W; x += 40) tp.push([x, tepe(x)]);
  wash(cx, [...tp.filter(([x]) => x > 80 && x < W - 80), [W - 80, 1330], [80, 1330]], C.hill, { a: .45, j: 10, layers: 3, edge: .25, seed: 30 });
  wash(cx, [...tp.filter(([x]) => x > 100 && x < W - 100).map(([x, y]) => [x, y + 50]), [W - 100, 1330], [100, 1330]], C.hillD, { a: .22, j: 14, layers: 2, edge: 0, seed: 31 });
  penA(tp, { w: 2.2, wob: 1.2, gap: .5, seed: 32 }, tA(tp));
  // karşı kıyı ağaçları
  for (let i = 0; i < 9; i++) { const x = 120 + i * 220 + R() * 60, y = 1300; foliage(cx, [{ x, y: y - 40, r: 46 + R() * 20 }, { x: x + 40, y: y - 20, r: 36 }], { seed: 40 + i, scale: .55, dens: .7 });
    const kume = []; for (let k = 0; k <= 10; k++) { const a = Math.PI * (1 + k / 10), rr = 58 + (k % 2 ? 12 : -4); kume.push([x + 15 + Math.cos(a) * rr * 1.2, y - 40 + Math.sin(a) * rr]); }
    penA(kume, { w: 1.5, wob: 1.4, seed: 50 + i, gap: .4 }, tA([[x, y]])); }
  // göl
  const kiyi = [[0, 1330], [W, 1330]];
  wash(cx, [[70, 1330], [W - 70, 1330], [W - 110, 2700], [110, 2660]], C.lake, { a: .4, j: 18, layers: 3, edge: .2, seed: 60 });
  for (let i = 0; i < 26; i++) { const y = 1400 + R() * 1200, x = 140 + R() * (W - 480), l = 60 + R() * 200; wash(cx, [[x, y], [x + l, y - 4], [x + l, y + 8], [x, y + 10]], C.lakeD, { a: .18, j: 3, layers: 1, edge: 0, seed: 70 + i }); }
  penA(kiyi, { w: 2.4, wob: 1, seed: 61 }, tA(kiyi));
  for (let i = 0; i < 22; i++) { const y = 1420 + R() * 1150, x = R() * W, l = 40 + R() * 140; penA([[x, y], [x + l, y + (R() - .5) * 6]], { w: 1.4, wob: .5, over: 2, seed: 80 + i, smooth: false }, tA([[x, y]], .3)); }
  // sazlık (sol alt)
  for (let i = 0; i < 34; i++) { const x = 80 + R() * 420, y = 2700 - R() * 80, h = 220 + R() * 300, b = (R() - .5) * 80;
    const p = [[x, y], [x + b * .3, y - h * .5], [x + b, y - h]]; penA(p, { w: 1.8, wob: .6, seed: 100 + i }, tA(p));
    wash(cx, [[x - 6, y], [x + b - 4, y - h], [x + b + 6, y - h], [x + 8, y]], i % 3 ? C.reed : C.reedD, { a: .35, j: 3, layers: 2, edge: 0, seed: 140 + i }); }
  // iskele: tahtalar perspektifte, kazıklar suya
  const D0 = 2150, D1 = 2330;
  const deck = [[1040, D0], [W, D0 - 30], [W, D1 + 40], [1040, D1]];
  wash(cx, deck, C.wood, { a: .5, j: 6, layers: 3, edge: .3, seed: 160 });
  penA([...deck, deck[0]], { w: 2.6, wob: .8, seed: 161, smooth: false }, tA(deck));
  for (let x = 1100; x < W; x += 70) { const p = [[x, D0 - (x - 1040) / (W - 1040) * 30], [x + 6, D1 + (x - 1040) / (W - 1040) * 40]]; penA(p, { w: 1.4, wob: .5, seed: 170 + x, smooth: false }, tA(p, .1)); }
  for (const x of [1080, 1400, 1760]) { const p = [[x, D1], [x + 4, D1 + 260]]; wash(cx, [[x - 14, D1], [x + 14, D1], [x + 18, D1 + 260], [x - 10, D1 + 260]], C.woodD, { a: .5, j: 3, layers: 2, edge: .2, seed: 180 + x }); penA(p, { w: 2.2, wob: .6, seed: 190 + x }, tA(p)); }
  // kova
  const kova = [[1330, 2090], [1420, 2090], [1410, 2165], [1340, 2165]];
  wash(cx, kova, C.bucket, { a: .5, j: 3, layers: 2, edge: .3, seed: 200 }); penA([...kova, kova[0]], { w: 2, seed: 201, smooth: false }, tA(kova));
  // kenar boşluğu: telefon eskizi (B katmanı, 11.0'da çizilir)
  const ph = [[520, 2760], [1480, 2760], [1480, 3700], [520, 3700]];
  penB([...ph, ph[0], ph[1]], { w: 3.2, wob: 1, seed: 210, smooth: false }, WIN_B[0], .7);
  penB([[880, 2800], [1120, 2800]], { w: 3, seed: 211 }, WIN_B[0] + .6, .2);
});

// ───────── renk varış haritası
const GW = 400, GH = 760;
const arr = arrivalField(W, H, GW, GH, [
  { x: 1000, y: 1950, t: 5.0, v: 700, R: 1400, mask: (x, y) => y > 1320 && y < 2720 },
  { x: 1000, y: 800, t: 5.6, v: 900, R: 1600, mask: (x, y) => y < 1330 },
  { x: 300, y: 2500, t: 6.0, v: 700, R: 500 },
  { x: 1500, y: 2240, t: 6.3, v: 900, R: 700, mask: (x, y) => y > 2000 && y < 2700 },
], { amp: 200 });
const T = (x, y) => sampleField(arr, W, H, GW, GH, x, y);
const colorAt = (x, y, t) => clamp((t - T(x, y) - .05) / .45);

// ───────── kamera
const kam = kamera([
  [0, 1000, 2000, .74], [4.6, 1000, 2000, .78], [7.6, 1000, 1950, .8], [8.4, 1040, 2050, 1.25], [10.6, 1040, 2050, 1.3],
  [11.6, 1000, 3200, .98], [18.6, 1000, 3200, 1.0], [19.4, 820, 1950, 1.05], [23.0, 820, 1950, 1.12], [26.0, 1000, 2100, .5], [28.0, 1000, 2100, .5],
]);
export const SUBS = [
  [0.4, 5.3, 'Pazartesi. Dükkân kapalı, Usta gölde.'],
  [8.2, 12.3, 'Telefon titredi. Usta bakmadı.'],
  [12.4, 18.8, 'Cevabı SıraGO verdi; Salı’ya randevu yazdı.'],
  [19.4, 23.4, 'Balık da geldi.'],
  [23.4, DUR, 'Kapalı günde bile randevu yazılır.'],
];
export const TEXTS = metinler(SUBS);
SUBS.forEach(([t0, t1, text]) => ev(t0, 'altyazi', { t1: Math.min(t1, DUR), text }));
// kalem darbeleri (ses)
world.strokes.forEach(([t, d]) => ev(t, 'kalem', { d }));
ev(5.0, 'renk', { d: 1.6 }); ev(5.6, 'kuslar');
ev(8.2, 'titresim'); ev(9.4, 'titresim'); ev(10.4, 'omuz');
const MSJ = [
  { t: 11.8, m: ['Usta, bugün gelsem?'] },
  { t: 13.0, m: ['Bugün (2 Kasım) kapalıyız.', 'Başka bir gün olabilir mi?', 'Yarın (3 Kasım) için boş saatler:', '10:00–13:00 arası, 15:40.', 'Size hangisi uygun?'], bot: 1 },
  { t: 15.0, m: ['10:00'] },
  { t: 15.6, m: ['Randevunuzu oluşturayım mı?'], bot: 1 },
  { t: 16.6, m: ['Evet'] },
  { t: 17.3, m: ['Randevunuz Oluşturuldu!'], bot: 1 },
];
MSJ.forEach(q => ev(q.t, q.bot ? 'yaz_bot' : 'yaz', { d: Math.min(1.2, q.m.join('').length * .025) }));
ev(19.6, 'samandira'); ev(20.2, 'sicrama'); ev(20.5, 'balik'); ev(23.6, 'son');

// ───────── sahne
const S = sahne(world, arr, GW, GH), ctx = S.ctx;
const boil = t => Math.floor(t * 12);

function usta(t) {
  const col = colorAt(SEAT.x, SEAT.y - 100, t);
  const titre = (t > 8.2 && t < 8.9) || (t > 9.4 && t < 10.1);
  let pose;
  if (t < 20.4) {
    const bakis = t > 8.4 && t < 10.2 ? ss(clamp((t - 8.4) / .4)) * (1 - ss(clamp((t - 9.8) / .4))) : 0;
    const omuz = t > 10.4 && t < 11.0 ? Math.sin((t - 10.4) / .6 * Math.PI) : 0;
    pose = { ...sit({ nod: .45 * bakis, headYaw: -.6 * bakis, lean: -.02 + .05 * omuz }), handR: V(.06, .36 + .04 * omuz, .3), handL: V(-.02, .32 + .04 * omuz, .3), elbR: V(1, -.5, 0), elbL: V(-1, -.5, 0) };
  } else {
    const k = ss(clamp((t - 20.4) / .5));
    pose = { ...stand({ lean: -.05 * k }), handR: V(.08, .8 + .3 * k, .22), handL: V(-.04, .75 + .3 * k, .2), elbR: V(1, 0, 0), elbL: V(-1, 0, 0), headYaw: 0, nod: -.15 * k };
  }
  const prims = figure(USTA, pose, { x: SEAT.x, y: SEAT.y, S: SEAT.S, yaw: -Math.PI / 2 }, { seed: 300, boil: boil(t) });
  const inkP = clamp((t - 1.6) / 1.4);
  drawPrims(ctx, prims, { color: col, ink: inkP });
  // olta: elden uca, misina uçtan şamandıraya (ya da balığa)
  const el = prims.hand?.R || [SEAT.x - 120, SEAT.y - 200];
  const kalk = t > 20.4 ? ss(clamp((t - 20.4) / .5)) : 0;
  const uc = [lerp(ROD_TIP[0], 720, kalk), lerp(ROD_TIP[1], 1280, kalk)];
  if (t > 2.2) drawPen(ctx, penStroke([el, [lerp(el[0], uc[0], .5), lerp(el[1], uc[1], .5) - 20], uc], { w: 4.2, wob: .4, seed: 310, smooth: true }), clamp((t - 2.2) / .6));
  const sam = balikYer(t);
  if (t > 2.6) drawPen(ctx, penStroke([uc, [lerp(uc[0], sam[0], .5) - 10, lerp(uc[1], sam[1], .55)], sam], { w: 1.4, wob: .3, seed: 311 }), clamp((t - 2.6) / .5));
  // cepteki telefon titreşimi: mürekkep zikzakları
  if (titre) { const p = prims.hand?.L || [SEAT.x, SEAT.y - 200]; for (const k of [-1, 1]) drawPen(ctx, penStroke([[p[0] + 30 * k + 40, p[1] + 30], [p[0] + 46 * k + 40, p[1] + 50], [p[0] + 30 * k + 40, p[1] + 70]], { w: 2.4, seed: 320 + k + boil(t) }), 1); }
  if (t > 10.4 && t < 11.2) handwrite(ctx, '…', SEAT.x - 40, SEAT.y - SEAT.S * .95, 60, 1, { font: 'Caveat' });
}
function balikYer(t) {
  if (t < 19.6) return [FLOAT[0], FLOAT[1] + Math.sin(t * 2) * 4];
  if (t < 20.4) return [FLOAT[0], FLOAT[1] + 18 * Math.sin((t - 19.6) / .8 * Math.PI * 3)];
  const k = ss(clamp((t - 20.4) / .8)); return [lerp(FLOAT[0], 740, k), lerp(FLOAT[1], 1520, k) - Math.sin(k * Math.PI) * 120];
}
function samandira(t) {
  const [x, y] = balikYer(t);
  if (t < 20.4) {
    sketchShape(ctx, ellipse(x, y - 16, 12, 20, 14), hex('#d4483c'), { ink: 2, wash: .7, seed: 330 + boil(t), color: colorAt(x, y, t) });
    for (let i = 0; i < 2; i++) { const r = 30 + ((t * 30 + i * 25) % 50); drawPen(ctx, penStroke(ellipse(x, y + 4, r, r * .25, 20).slice(10, 20), { w: 1.2, seed: 340 + i }), 1, INK, .6 * (1 - (r - 30) / 50)); }
  } else {
    // balık: sayfadaki tek turuncu şey
    const sal = Math.sin(t * 14) * .25, govde = [];
    for (let i = 0; i < 16; i++) { const a = i / 16 * TAU; govde.push([x + Math.cos(a) * 26, y + 70 + Math.sin(a) * 58]); }
    const kuyruk = [[x - 6, y + 128], [x - 34 + sal * 40, y + 170], [x + 30 + sal * 40, y + 170]];
    sketchShape(ctx, govde, hex('#e2792a'), { ink: 2.4, wash: .85, seed: 350 + boil(t), color: 1 });
    sketchShape(ctx, kuyruk, hex('#e2792a'), { ink: 2.4, wash: .85, seed: 351 + boil(t), color: 1 });
    if (t < 21.2) for (let i = 0; i < 6; i++) { const a = -Math.PI / 2 + (i - 2.5) * .35, k = clamp((t - 20.3) / .8); drawPen(ctx, penStroke([[FLOAT[0] + Math.cos(a) * 30 * k, FLOAT[1] + Math.sin(a) * 30 * k], [FLOAT[0] + Math.cos(a) * 90 * k, FLOAT[1] + Math.sin(a) * 90 * k]], { w: 2, seed: 360 + i }), 1, [70, 110, 140], 1 - k); }
  }
}
function mesajlar(t) {
  let y = 2880;
  for (const q of MSJ) {
    if (t < q.t) { y += q.m.length * 64 + 30; continue; }
    q.m.forEach((l, i) => {
      const p = clamp((t - q.t - i * .25) / .5);
      handwrite(ctx, l, q.bot ? 1450 : 550, y, 54, p, { font: 'Caveat', weight: q.bot ? 600 : 500, col: q.bot ? C.yesil : INK, align: q.bot ? 'right' : 'left' });
      y += 64;
    });
    y += 30;
  }
}

window.DUR = DUR;
window.render = t => {
  const cam = kam(t);
  S.bas(cam, t);
  handwrite(ctx, 'Pazartesi · göl · rüzgârsız', 160, 330, 64, clamp((t - .4) / .9), { font: 'Caveat', weight: 500, rot: -.02 });
  usta(t); samandira(t); mesajlar(t);
  S.bitir(cam);
  soz(ctx, SUBS, t);
};
window.EV = EV; window.SUBS = SUBS.map(([t0, t1, text]) => ({ t0, t1, text })); window.TEXTS = TEXTS;
window.READY = true;
