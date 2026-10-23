// "Geliyorum Abi" — ritim oyunu, iki tur. 1. tur eski usul: "Geliyorum abi!" der, gelmez (üç gün, üç "GELMEDİ!").
// 2. tur SıraGO ile: 1 saat önce teyit (hatirlatma.js: "Randevu Teyidi … Gelebilecek misiniz? 1. Geliyorum 2. İptal Et"),
// "1" → "Harika, sizi bekliyoruz!" (whatsappWeb.js), "2" → "Randevunuz iptal edildi." ve saat boşalır, başkası alır.
import { K, el, tf, op, goster, clamp, lerp, seg, E, tempo, hopY, hitSq, dropY, sahneci, gtext, zemin, plaka, bant, kart, karar, patlama,
  tik, fasulye, poz, telefon, kapi, olc } from './ortak/kit.js';

const { B, BAR, at } = tempo(120);
export const DUR = at(14);
const root = document.getElementById('sahne');
const S = sahneci(root), { ev, punch, kes } = S;

S.sahne(0, at(1), g => { const k = kart(g, '1. TUR', 'Eski usul', K.red, '#ff6f6f'); return t => k(t, .05); });
ev(0, 'jingle');
// ── 1. tur: üç gün "Geliyorum abi!" → kapı kapalı → GELMEDİ!
S.sahne(at(1), at(5), (g, s) => {
  zemin(g, '#ff7a7a', 'serit', '#ff9090', '#c94848');
  const bantF = bant(g, '1. TUR', 'Söz var, müşteri yok', K.red);
  const k = kapi(g, K.orange); tf(k.g, 800, 1480);
  const usta = fasulye(g, { renk: K.sky, onluk: K.sirago, biyik: 1, sac: 'kisa', gobek: false });
  const mus = fasulye(g, { renk: K.yellow, gobek: K.cream });
  const tel = el('g', {}, g); el('rect', { x: -36, y: -64, width: 72, height: 128, rx: 14, fill: '#2d2a36', stroke: K.ink, 'stroke-width': 6 }, tel);
  const gunler = ['Pazartesi', 'Çarşamba', 'Cumartesi'];
  const GUN = gunler.map((d, i) => { const gg = el('g', {}, g); gtext(gg, d, 0, 0, 70, { fill: K.yellow }); return gg; });
  const SOZ = gunler.map(() => { const gg = el('g', {}, g); gtext(gg, 'Geliyorum abi!', 0, 0, 76, { fill: K.white }); return gg; });
  const SAAT = el('g', {}, g); gtext(SAAT, '17:00', 0, 0, 110, { fill: K.yellow });
  const kar = gunler.map((d, i) => { const t0 = at(1 + i, 3); ev(t0, 'buzzer'); punch(t0, .04); return karar(g, 'GELMEDİ!', 540, 560, t0, K.yellow, B * .95, 150); });
  s.fx.push(...kar);
  gunler.forEach((d, i) => { ev(at(1 + i, 0), 'gun'); ev(at(1 + i, .5), 'cagri'); ev(at(1 + i, 2), 'saat'); });
  const sonT = at(4, 2); s.fx.push(karar(g, 'Boş koltuk!', 540, 640, sonT, K.pink, at(5) - sonT, 130)); ev(sonT, 'karar'); punch(sonT, .05);
  return t => {
    bantF(t, at(1), at(5));
    const gun = clamp(Math.floor((t - at(1)) / BAR), 0, 2), bt = t - at(1 + gun);
    GUN.forEach((e, i) => { goster(e, i === gun && t < at(4)); tf(e, 540, 330, E.back(seg(bt, 0, .2))); });
    const konus = bt >= .25 && bt < 1.2 && t < at(4);
    SOZ.forEach((e, i) => { goster(e, i === gun && konus); tf(e, 300, 1000, E.back(seg(bt, .25, .45)), -5); });
    goster(SAAT, bt >= 1.0 && t < at(4)); tf(SAAT, 800, 760, E.back(seg(bt, 1.0, 1.2)));
    goster(mus.g, t < at(4)); tf(mus.g, 260, 1480 + hopY(t, B, 12), .72);
    poz(mus, { open: konus, kolR: [120, -280], hey: 0 });
    tf(tel, 260 + 120 * .72, 1480 - 290 * .72, .9);
    goster(tel, t < at(4));
    k.ac(0);
    const uzgun = t > at(4) ? 1 : 0;
    tf(usta.g, 560, 1640 + (uzgun ? 0 : hopY(t, B, 8)), .9);
    poz(usta, { sq: uzgun ? .12 + .05 * Math.sin(t * 6) : hitSq(t, at(1 + gun, 3), .12), lean: uzgun ? -6 : 0, kolL: uzgun ? [-120, 0] : undefined, kolR: uzgun ? [120, 0] : undefined });
  };
});
S.sahne(at(5), at(6), g => { const k = kart(g, '2. TUR', 'SıraGO ile', K.sirago, '#2b8a5e'); return t => k(t, at(5) + .05); });
ev(at(5), 'jingle');
// ── 2. tur: teyit → 1 / 2 → saat boşalır → kapı açılır, GELDİ!
S.sahne(at(6), at(11), (g, s) => {
  zemin(g, '#2bd36a', 'nokta', '#4fe08a', '#1aa553');
  const bantF = bant(g, '2. TUR', 'Bir saat önce sorulur', K.sirago);
  const tel = telefon(g, 600, 900); tf(tel.g, 690, 760);
  const k = kapi(g, K.orange); tf(k.g, 160, 1480);
  const A = fasulye(g, { renk: K.yellow }), Bk = fasulye(g, { renk: K.purple }), Cc = fasulye(g, { renk: K.pink });
  const dug = (et, col) => { const gg = el('g', {}, g); el('circle', { cx: 10, cy: 14, r: 90, fill: K.ink }, gg); el('circle', { r: 90, fill: col, stroke: K.ink, 'stroke-width': 9 }, gg); gtext(gg, et, 0, 34, 100, { fill: K.white }); return gg; };
  const D1 = dug('1', K.green), D2 = dug('2', K.red);
  const T1 = at(7, 0), T2 = at(8, 0), T3 = at(9, 0), ACIL = at(10, 0);
  ev(at(6, 0), 'teyit'); ev(T1, 'bas1'); ev(T1 + B, 'cevap'); ev(T2, 'bas2'); ev(T2 + B, 'iptal'); ev(T3 - .3, 'dus'); ev(T3 + B, 'cevap'); ev(ACIL, 'kapi');
  punch(T1, .03); punch(T2, .03); punch(ACIL, .05);
  s.fx.push(patlama(g, 300, 1240, T1, K.yellow, .6), patlama(g, 300, 1240, T2, K.white, .6));
  const SAAT = el('g', {}, g); gtext(SAAT, 'Saat boşaldı!', 0, 0, 80, { fill: K.yellow }); goster(SAAT, false);
  s.fx.push(karar(g, 'GELDİ!', 540, 520, ACIL + B, K.yellow, at(11) - ACIL - B, 190)); ev(ACIL + B, 'fanfar');
  return t => {
    bantF(t, at(6), at(11));
    const msj = [{ m: 'Randevu Teyidi\nRandevunuza 1 saat kaldı.\nGelebilecek misiniz?\n1. Geliyorum\n2. İptal Et', bot: 1, op: seg(t, at(6), at(6) + .2), fs: 38 }];
    if (t >= T1) msj.push({ m: '1', op: seg(t, T1, T1 + .15), fs: 40 });
    if (t >= T1 + B) msj.push({ m: 'Harika, sizi bekliyoruz!', bot: 1, op: seg(t, T1 + B, T1 + B + .15), fs: 38 });
    if (t >= T2) msj.splice(0, msj.length, { m: '2', op: seg(t, T2, T2 + .15), fs: 40 });
    if (t >= T2 + B) msj.push({ m: 'Randevunuz iptal edildi.', bot: 1, op: seg(t, T2 + B, T2 + B + .15), fs: 38 });
    if (t >= T3) msj.splice(0, msj.length, { m: 'Bugün 5’e yer var mı?', op: seg(t, T3, T3 + .15), fs: 38 });
    if (t >= T3 + B) msj.push({ m: '17:00 ✓', bot: 1, op: seg(t, T3 + B, T3 + B + .15), fs: 40 });
    tel.yaz(msj, t);
    // düğmeler: basılınca ezilir
    goster(D1, t >= at(6, 2) && t < T2); tf(D1, 300, 1240 + (t >= T1 && t < T1 + .15 ? 20 : 0), (t >= T1 && t < T1 + .15 ? .9 : 1) * E.back(seg(t, at(6, 2), at(6, 2) + .2)));
    goster(D2, t >= T1 + B * 2 && t < T3); tf(D2, 300, 1240 + (t >= T2 && t < T2 + .15 ? 20 : 0), (t >= T2 && t < T2 + .15 ? .9 : 1) * E.back(seg(t, T1 + B * 2, T1 + B * 2 + .2)));
    goster(SAAT, t >= T2 + B && t < T3 + B); tf(SAAT, 360, 1080, E.back(seg(t, T2 + B, T2 + B + .2)), -5);
    // müşteriler: A (1'e basar), B (2'ye basar, gider), C (düşer, boşalan saati alır)
    const kp = clamp(seg(t, ACIL, ACIL + .3)); k.ac(E.out(kp));
    goster(A.g, t < T2 || t >= ACIL); tf(A.g, t >= ACIL ? 160 + 160 * E.out(kp) : 380, 1480 + hopY(t, B, 12), .62);
    poz(A, { hey: (t >= T1 && t < T1 + .4) || t >= ACIL + B ? 1 : 0, open: t >= ACIL + B, kolR: t >= T1 - .2 && t < T1 + .2 ? [40, -250] : undefined });
    goster(Bk.g, t >= T2 - B && t < T3); tf(Bk.g, 380, 1480 + hopY(t, B, 12, .5), .62);
    poz(Bk, { kolR: t >= T2 - .2 && t < T2 + .2 ? [40, -250] : undefined, open: t >= T2 + B });
    goster(Cc.g, t >= T3 - .35); tf(Cc.g, t >= ACIL ? 300 + 140 * E.out(kp) : 400, 1480 + dropY(t, T3) + hopY(t, B, 12, .25), .62);
    poz(Cc, { hey: t >= T3 + B && t < T3 + B + .4 || t >= ACIL + B ? 1 : 0, open: t >= T3 && t < T3 + .3 || t >= ACIL + B });
  };
});
kes(at(5)); kes(at(6)); kes(at(11));
// ── final: kapıdan girenler + usta, perde
S.sahne(at(11), DUR, (g, s) => {
  zemin(g, K.yellow, 'isin', '#ffe066', '#e0b020');
  const isin = g.firstChild.nextSibling;
  const kim = [fasulye(g, { renk: K.yellow }), fasulye(g, { renk: K.sky, onluk: K.sirago, biyik: 1, sac: 'kisa', gobek: false }), fasulye(g, { renk: K.pink })];
  const st = el('g', {}, g); const p = plaka(st, 760, 220, K.sirago, { r: 40 }); gtext(st, 'Teyitli randevu', 0, 26, 80, { fill: K.white });
  const son = el('g', {}, g); gtext(son, 'Randevuyu', 0, 0, 104, { fill: K.white }); gtext(son, 'SıraGO yazsın.', 0, 120, 104, { fill: K.yellow });
  ev(at(11, 2), 'damga'); ev(at(12, 2), 'son'); punch(at(11, 2), .04);
  return t => {
    isin.setAttribute('transform', `rotate(${t * 10} 540 760)`);
    kim.forEach((c, i) => { tf(c.g, 260 + i * 280, 1480 + hopY(t, B, 22, i * .5), i === 1 ? .95 : .72); poz(c, { hey: 1, open: Math.floor(t / B) % 2 === 0 }); });
    tf(st, 540, 520, E.back(seg(t, at(11, 2), at(11, 2) + .25)), -4);
    goster(son, t >= at(12, 2)); tf(son, 540, 860, E.back(seg(t, at(12, 2), at(12, 2) + .3)));
  };
});
ev(at(11), 'jingle');

export const SUBS = [
  [2.2, 9.4, '“Geliyorum abi” dedi, gelmedi.'],
  [12.2, 15.8, 'Bir saat önce SıraGO sorar.'],
  [16.0, 19.8, 'İptal eden olursa saat boşalır.'],
  [20.1, 22.7, 'Bu sefer geldi.'],
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
