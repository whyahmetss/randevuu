// Çırak — ritim oyunu, iki tur. 1. tur: çırak herkese "Tamam!" der; 17:00'de üç kişi kapıya yığılır → "KARIŞTI!".
// 2. tur: aynı sorulara SıraGO; dolu saat için sohbetAsistani.js `dolu` ("Maalesef 17:00 dolu. 17:40 uygun mu?"), herkes kendi saatinde.
import { K, el, tf, op, goster, clamp, lerp, seg, E, tempo, hopY, hitSq, dropY, sahneci, gtext, zemin, plaka, bant, kart, karar, patlama,
  tik, fasulye, poz, telefon, kapi, olc } from './ortak/kit.js';

const { B, BAR, at } = tempo(120);
export const DUR = at(14);
const root = document.getElementById('sahne');
const S = sahneci(root), { ev, punch, kes } = S;
const MR = [K.pink, K.lime, K.purple];

S.sahne(0, at(1), g => { const k = kart(g, '1. TUR', 'Çırak telefonda', K.orange, '#ff8a1f'); return t => k(t, .05); });
ev(0, 'jingle');
// çırak: küçük fasulye, şapkalı
function cirak(g) { const c = fasulye(g, { renk: K.yellow, gobek: K.cream }); const sap = el('g', {}, c.gv); el('path', { d: 'M-80 -300 Q0 -380 80 -300 L110 -296 L-80 -290 Z', fill: K.red, stroke: K.ink, 'stroke-width': 8 }, sap); return c; }
function usta(g) { return fasulye(g, { renk: K.sky, onluk: K.sirago, biyik: 1, sac: 'kisa', gobek: false }); }

// ── 1. tur
S.sahne(at(1), at(5), (g, s) => {
  zemin(g, '#ffd23f', 'serit', '#ffdf6b', '#d9a91f');
  const bantF = bant(g, '1. TUR', 'Herkese “Tamam!”', K.orange);
  const k = kapi(g, K.blue); tf(k.g, 830, 1480);
  const c = cirak(g), u = usta(g), M = MR.map(r => fasulye(g, { renk: r }));
  const SOR = MR.map(() => { const q = el('g', {}, g); gtext(q, '5’e yer var mı?', 0, 0, 62, { fill: K.white }); goster(q, false); return q; });
  const TAMAM = MR.map(() => { const q = el('g', {}, g); gtext(q, 'Tamam!', 0, 0, 84, { fill: K.yellow }); goster(q, false); return q; });
  const sor = [at(1, 0), at(1, 2), at(2, 0)], cev = sor.map(t => t + B);
  sor.forEach(t => { ev(t, 'cagri'); punch(t, .012); }); cev.forEach(t => { ev(t, 'tamam'); punch(t, .02); });
  const SAAT = el('g', {}, g); gtext(SAAT, '17:00', 0, 0, 120, { fill: K.white }); goster(SAAT, false);
  const YIG = at(3, 0); ev(YIG - .3, 'dus3'); ev(YIG + B * 2, 'buzzer'); punch(YIG + B * 2, .06);
  s.fx.push(karar(g, 'KARIŞTI!', 540, 560, YIG + B * 2, K.red, at(5) - YIG - B * 2, 170));
  return t => {
    bantF(t, at(1), at(5));
    tf(c.g, 220, 1500 + hopY(t, B, 12), .7);
    const cevapta = cev.some(tc => t >= tc && t < tc + .4);
    poz(c, { open: cevapta, hey: cevapta ? 1 : 0, kolR: cevapta ? undefined : [100, -270] });
    tf(u.g, 520, 1640 + hopY(t, B, 6, .5), .85);
    const yuz = t > YIG + B * 2;
    poz(u, { sq: yuz ? .1 : 0, kolL: yuz ? [-30, -250] : undefined, lean: yuz ? 4 : 0 });            // usta elini yüzüne götürür
    SOR.forEach((q, i) => { goster(q, t >= sor[i] && t < sor[i] + B * .95); tf(q, 560, 820 + i * 10, E.back(seg(t, sor[i], sor[i] + .15)), -4); });
    TAMAM.forEach((q, i) => { goster(q, t >= cev[i] && t < cev[i] + B * .9); tf(q, 300, 1130, E.back(seg(t, cev[i], cev[i] + .15)), 6); });
    goster(SAAT, t >= at(2, 3) && t < YIG + B * 2); tf(SAAT, 820, 760, E.back(seg(t, at(2, 3), at(2, 3) + .2)));
    M.forEach((m, i) => { const sal = t > YIG + B * 2 ? Math.sin(t * 22 + i) * 14 : 0;
      goster(m.g, t >= YIG - .35); tf(m.g, 760 + i * 70 + sal, 1500 + dropY(t, YIG + i * .08), .62, sal * .4);
      poz(m, { open: t > YIG + B, hey: t > YIG + B * 2 ? 1 : 0, sq: hitSq(t, YIG + i * .08, .2) }); });
  };
});
S.sahne(at(5), at(6), g => { const k = kart(g, '2. TUR', 'SıraGO’da', K.sirago, '#2b8a5e'); return t => k(t, at(5) + .05); });
ev(at(5), 'jingle');
// ── 2. tur
S.sahne(at(6), at(10), (g, s) => {
  zemin(g, '#22c3a6', 'nokta', '#4fd3bb', '#16947e');
  const bantF = bant(g, '2. TUR', 'Dolu saati bilir, boşu önerir', K.teal);
  const tel = telefon(g, 620, 960); tf(tel.g, 660, 720);
  const M = MR.map(r => fasulye(g, { renk: r }));
  const sor = [at(6, 0), at(6, 2), at(7, 0)], cev = sor.map(t => t + B);
  const C = [{ m: 'Bugün · 17:00 ✓', bot: 1 }, { m: 'Maalesef 17:00 dolu.\n17:40 uygun mu?', bot: 1 }, { m: 'Maalesef 17:00 dolu.\n18:20 uygun mu?', bot: 1 }];
  sor.forEach(t => { ev(t, 'cagri'); punch(t, .012); }); cev.forEach((t, i) => ev(t, i ? 'dolu' : 'cevap'));
  // saat tabelası: 17:00 / 17:40 / 18:20 — her müşteri kendi saatinde kapıdan
  const SAAT = ['17:00', '17:40', '18:20'].map((s2, i) => { const q = el('g', {}, g); const p = plaka(q, 300, 120, K.cream, { r: 28, sh: 10 }); gtext(q, s2, 0, 24, 70, { fill: K.ink, sw: 0 }); tik(q, 190, -8, .7); goster(q, false); return q; });
  const GEL = [at(8, 0), at(8, 2), at(9, 0)];
  GEL.forEach(t => { ev(t, 'gel'); punch(t, .02); });
  s.fx.push(karar(g, 'SIRAYLA!', 540, 470, at(9, 2), K.yellow, at(10) - at(9, 2), 170)); ev(at(9, 2), 'karar'); punch(at(9, 2), .05);
  return t => {
    bantF(t, at(6), at(10));
    const msj = [];
    sor.forEach((tc, i) => { if (t >= tc) msj.push({ m: '5’e yer var mı?', op: seg(t, tc, tc + .15), fs: 40 }); if (t >= cev[i]) msj.push({ ...C[i], op: seg(t, cev[i], cev[i] + .15), fs: 40 }); });
    tel.yaz(msj, t);
    SAAT.forEach((q, i) => { goster(q, t >= GEL[i] - B); tf(q, 200, 1080 + i * 150 - (i * 0), E.back(seg(t, GEL[i] - B, GEL[i] - B + .2)), -3); });
    M.forEach((m, i) => { const gitti = t > GEL[i] + B * .8; goster(m.g, !gitti || t < GEL[i]); const x = 200 + i * 150;
      tf(m.g, lerp(x, 1100, E.in(seg(t, GEL[i], GEL[i] + B * .8))), 1500 + hopY(t, B, 12, i * .5), .62);
      poz(m, { open: t >= sor[i] && t < sor[i] + .35, hey: t >= cev[i] && t < cev[i] + .4 ? 1 : 0 }); });
  };
});
// ── 10: çırak süpürgesinde (yalnız davul)
S.sahne(at(10), at(11), (g, s) => {
  zemin(g, K.lime, 'serit', '#c6e87a', '#8fb83f');
  const c = cirak(g); const sup = el('g', {}, g);
  el('line', { x1: 0, y1: -260, x2: 0, y2: 0, stroke: K.ink, 'stroke-width': 26, 'stroke-linecap': 'round' }, sup); el('line', { x1: 0, y1: -260, x2: 0, y2: 0, stroke: '#a87a52', 'stroke-width': 14, 'stroke-linecap': 'round' }, sup);
  el('path', { d: 'M-70 0 L70 0 L50 60 L-50 60 Z', fill: K.orange, stroke: K.ink, 'stroke-width': 8 }, sup);
  const st = el('g', {}, g); plaka(st, 820, 170, K.cream, { r: 40 }); gtext(st, 'Çırak süpürgesine döndü.', 0, 20, 54, { fill: K.ink, sw: 0 });
  for (let i = 0; i < 4; i++) ev(at(10, i), 'supur');
  return t => { const sw = Math.sin(t / B * Math.PI) * 18; tf(c.g, 540, 1500 + hopY(t, B, 10), .9); poz(c, { open: true, kolR: [150, -120], kolL: [60, -140] });
    tf(sup, 680 + sw * 3, 1500, 1, sw); tf(st, 540, 520, E.back(seg(t, at(10), at(10) + .25)), -3); };
});
kes(at(5)); kes(at(6)); kes(at(10)); kes(at(11));
// ── final
S.sahne(at(11), DUR, (g, s) => {
  zemin(g, K.purple, 'isin', '#a185ff', '#6b4fd6');
  const isin = g.firstChild.nextSibling;
  const kim = [fasulye(g, { renk: K.pink }), cirak(g), usta(g), fasulye(g, { renk: K.lime }), fasulye(g, { renk: K.purple === K.purple ? K.orange : K.purple })];
  const son = el('g', {}, g); gtext(son, 'Randevuyu', 0, 0, 104, { fill: K.white }); gtext(son, 'SıraGO yazsın.', 0, 120, 104, { fill: K.yellow });
  ev(at(12, 2), 'son'); punch(at(12, 2), .04);
  return t => { isin.setAttribute('transform', `rotate(${t * 10} 540 760)`);
    kim.forEach((c, i) => { tf(c.g, 130 + i * 205, 1500 + hopY(t, B, 22, i * .5), i === 2 ? .85 : .66); poz(c, { hey: 1, open: Math.floor(t / B) % 2 === i % 2 }); });
    goster(son, t >= at(12, 2)); tf(son, 540, 720, E.back(seg(t, at(12, 2), at(12, 2) + .3))); };
});
ev(at(11), 'jingle');

export const SUBS = [
  [2.2, 5.9, 'Çırak herkese “Tamam” dedi.'],
  [6.1, 9.8, 'Saat beş: üç kişi, bir koltuk.'],
  [12.2, 17.8, 'SıraGO dolu saati bilir, boşu önerir.'],
  [18.0, 21.9, 'Herkes kendi saatinde.'],
];
const ust = el('g', {}, root);
const plk = SUBS.map(([t0, t1, s]) => { const g = el('g', {}, ust); const w = olc(s, 56, 900) + 90; el('rect', { x: -w / 2 + 10, y: -58, width: w, height: 112, rx: 30, fill: K.ink }, g);
  el('rect', { x: -w / 2, y: -68, width: w, height: 112, rx: 30, fill: K.ink, stroke: K.white, 'stroke-width': 6 }, g); gtext(g, s, 0, 8, 56, { fill: K.white, sw: 0 }); goster(g, false); return [t0, t1, g]; });
SUBS.forEach(([t0, t1, text]) => ev(t0, 'altyazi', { t1, text }));
window.DUR = DUR;
window.EV = S.EV.sort((a, b) => a.t - b.t);
window.SUBS = SUBS.map(([t0, t1, text]) => ({ t0, t1, text }));
window.TEXTS = t => SUBS.filter(([a, b]) => t >= a + .2 && t <= b).map(([a, b, s]) => ({ id: 'sub' + SUBS.findIndex(x => x[2] === s), text: s, x0: 80, y0: 1740, x1: 1000, y1: 1860 }));
window.render = t => { S.render(t, [DUR - .3, DUR]); plk.forEach(([t0, t1, g]) => { const on = t >= t0 && t < t1; goster(g, on); if (on) tf(g, 540, 1800, E.back(seg(t, t0, t0 + .2)) * (1 - E.in(seg(t, t1 - .15, t1)))); }); };
await document.fonts.ready;
window.READY = true;
