// Yer Var mı? — ritim oyunu (çağrı-cevap). Müşteriler vuruşta düşer, "Yer var mı?" diye bağırır; dükkânın telefonu ara vuruşta
// cevap verir. 2. turda desen sekizliğe hızlanır (olay bu); biri dolu saate denk gelir: sohbetAsistani.js `dolu`
// ("Maalesef 17:00 dolu. 17:40 uygun mu?"). Usta ortada makasını ritimle sallar; telaşlanmaz. Final: grup fotoğrafı.
import { K, el, tf, op, goster, clamp, lerp, seg, E, tempo, hopY, hitSq, dropY, sahneci, gtext, harfler, zemin, plaka, bant, kart, karar, patlama,
  tik, fasulye, poz, telefon, olc } from './ortak/kit.js';

const { B, BAR, at } = tempo(120);
export const DUR = at(14);
const root = document.getElementById('sahne');
const S = sahneci(root), { ev, punch, kes } = S;
const RENK = [K.pink, K.yellow, K.lime, K.orange, K.purple, K.red, K.sky, K.teal];

// ── 0: tur kartı
S.sahne(0, at(1), g => { const k = kart(g, '1. TUR', 'Yer var mı?', K.blue, '#3f6ef0'); ev(0, 'jingle'); return t => k(t, .05); });
// tur sahnesi kurucu: n müşteri, adım (vuruş cinsinden), cevaplar
function tur(b0, b1, set, adim, cevaplar, banttxt, kararTxt) {
  S.sahne(at(b0), at(b1), (g, s) => {
    zemin(g, set[0], set[1], set[2], set[3]);
    const bantF = bant(g, banttxt[0], banttxt[1], set[4]);
    // telefon (sağ üst)
    const tel = telefon(g, 580, 880); tf(tel.g, 750, 800);
    gtext(g, 'SıraGO', 750, 1320, 60, { fill: K.green });
    // usta (orta alt): makas ritimle
    const usta = fasulye(g, { renk: K.sky, onluk: K.sirago, biyik: 1, sac: 'kisa', gobek: false });
    const mak = el('g', {}, usta.gv); for (const a of [-1, 1]) el('path', { d: `M0 0 L${70} ${a * 10}`, stroke: K.ink, 'stroke-width': 10, 'stroke-linecap': 'round' }, mak);
    // müşteri kuyruğu (sol)
    const n = cevaplar.length, M = [];
    for (let i = 0; i < n; i++) { const c = fasulye(g, { renk: RENK[i % RENK.length], gobek: K.cream }); M.push(c); }
    const T0 = at(b0, 1), cagri = [...Array(n)].map((_, i) => T0 + i * adim * 2 * B), cevap = cagri.map(t => t + adim * B);
    cagri.forEach((t, i) => { ev(t - .3, 'dus'); ev(t, 'cagri', { i }); punch(t, .012); });
    cevap.forEach((t, i) => { ev(t, cevaplar[i].dolu ? 'dolu' : 'cevap', { i }); s.fx.push(patlama(g, 300, 520, t, K.yellow, .45)); });
    const tels = cagri.map(t => { const tg = el('g', {}, g); gtext(tg, 'Yer var mı?', 0, 0, 58, { fill: K.yellow }); goster(tg, false); return tg; });
    const sonT = at(b1 - 1, 2);
    s.fx.push(karar(g, kararTxt, 540, 470, sonT, K.pink, at(b1) - sonT, 140)); ev(sonT, 'karar'); punch(sonT, .05);
    return t => {
      bantF(t, at(b0), at(b1));
      // telefon: en yeni mesajlar (kaydırma: son 6 balon)
      const msj = [];
      cagri.forEach((tc, i) => { if (t >= tc) msj.push({ m: 'Yer var mı?', op: seg(t, tc, tc + .15), fs: 40 }); if (t >= cevap[i]) msj.push({ m: cevaplar[i].m, bot: 1, op: seg(t, cevap[i], cevap[i] + .15), fs: 40 }); });
      tel.yaz(msj.slice(-6), t);
      tf(usta.g, 600, 1640 + hopY(t, B, 10), .92);
      const kes = Math.floor(t / (B / 2)) % 2; usta.gv.lastChild && tf(mak, 120, -100, 1, kes ? -20 : 10);
      poz(usta, { open: false, sq: hitSq(t, Math.floor(t / B) * B, .05), kolR: [140, -100] });
      M.forEach((c, i) => {
        const tc = cagri[i], gitti = t > cevap[i] + B * 1.2;
        const x = 120 + (i % 4) * 100 + (i >= 4 ? 50 : 0), y = 1560 + (i >= 4 ? 60 : 0);
        goster(c.g, t > tc - .35 && !gitti);
        tf(c.g, x, y + dropY(t, tc) + hopY(t, B, 12, i * .5), .62);
        poz(c, { open: t >= tc && t < tc + .35, hey: t >= cevap[i] && t < cevap[i] + .4 ? 1 : 0, sq: hitSq(t, tc, .18) });
        goster(tels[i], t >= tc && t < tc + adim * B * 1.6); tf(tels[i], Math.max(200, x), y - 210, E.back(seg(t, tc, tc + .15)), -4);
      });
    };
  });
}
const R1 = [{ m: '15:00 ✓' }, { m: '15:40 ✓' }, { m: '16:20 ✓' }, { m: '17:00 ✓' }];
tur(1, 5, ['#5ec8f2', 'serit', '#79d3f5', '#2f9fd0', K.blue], 1, R1, ['1. TUR', 'Sorular gelir, cevaplar gider'], 'Hepsi yazıldı!');
S.sahne(at(5), at(6), g => { const k = kart(g, '2. TUR', 'Cumartesi!', K.orange, '#ff8a1f'); return t => k(t, at(5) + .05); });
kes(at(5)); ev(at(5), 'jingle');
const R2 = [{ m: '17:40 ✓' }, { m: '18:20 ✓' }, { m: 'Maalesef 17:00 dolu.\n17:40 uygun mu?', dolu: 1 }, { m: '19:00 ✓' }, { m: '10:00 ✓' }, { m: '10:40 ✓' }, { m: '11:20 ✓' }, { m: '12:00 ✓' }];
tur(6, 10, ['#ff9f43', 'nokta', '#ffb46e', '#e0782a', K.red], .5, R2, ['2. TUR', 'Hızlanıyor!'], 'Sıralı!');
kes(at(6)); kes(at(10)); kes(at(11));
// ── 10: tabela — günün listesi (yalnız davul ölçüsü)
S.sahne(at(10), at(11), (g, s) => {
  zemin(g, K.navy, 'isin', '#33408a');
  const p = plaka(g, 860, 1100, K.cream, { r: 50 }); tf(p, 540, 960);
  gtext(g, 'Bugün', 540, 520, 96, { fill: K.yellow });
  const satir = ['10:00', '10:40', '11:20', '12:00', '15:00', '15:40', '16:20', '17:00', '17:40', '18:20', '19:00'];
  const G = satir.map((s2, i) => { const r = el('g', {}, g); gtext(r, s2, -200, 0, 52, { fill: K.ink, sw: 0, anchor: 'start', weight: 800 }); tik(r, 220, -16, .7); return r; });
  return t => G.forEach((r, i) => { const t0 = at(10) + i * B / 3; goster(r, t >= t0); tf(r, 540, 640 + (i % 6) * 90 + (i >= 6 ? 0 : 0) + (i >= 6 ? 0 : 0), E.back(seg(t, t0, t0 + .15)));
    tf(r, i < 6 ? 400 : 760, 660 + (i % 6) * 100, E.back(seg(t, t0, t0 + .15)) * .9); });
});
for (let i = 0; i < 11; i++) ev(at(10) + i * B / 3, 'tik');
// ── 11–14: final — grup fotoğrafı, polaroid
S.sahne(at(11), DUR, (g, s) => {
  zemin(g, K.green, 'isin', '#46e07f', '#1aa553');
  const isin = g.firstChild.nextSibling;
  const kadro = el('g', {}, g);
  const kim = [fasulye(kadro, { renk: K.pink }), fasulye(kadro, { renk: K.yellow }), fasulye(kadro, { renk: K.sky, onluk: K.sirago, biyik: 1, sac: 'kisa', gobek: false }), fasulye(kadro, { renk: K.lime }), fasulye(kadro, { renk: K.purple })];
  const tel = telefon(kadro, 300, 440); tf(tel.g, 540, 760, 1);
  tel.yaz([{ m: 'SıraGO', bot: 1, fs: 40 }], 0);
  const FOTO = at(12, 2);
  const pol = el('g', {}, g); goster(pol, false);
  el('rect', { x: -420 + 18, y: -560 + 18, width: 840, height: 1120, rx: 18, fill: K.ink }, pol);
  el('rect', { x: -420, y: -560, width: 840, height: 1120, rx: 18, fill: K.white, stroke: K.ink, 'stroke-width': 8 }, pol);
  gtext(pol, 'Randevuyu', 0, 370, 74, { fill: K.ink, sw: 0 }); gtext(pol, 'SıraGO yazsın.', 0, 460, 74, { fill: K.sirago, sw: 0 });
  ev(FOTO, 'flas'); kes(FOTO); punch(FOTO, .04);
  return t => {
    isin.setAttribute('transform', `rotate(${t * 12} 540 760)`);
    const don = t >= FOTO;
    kim.forEach((c, i) => { const tt = don ? FOTO : t; tf(c.g, 140 + i * 200, 1500 + (don ? 0 : hopY(tt, B, 22, i * .5)), i === 2 ? .8 : .62); poz(c, { hey: 1, open: true }); });
    const k = E.io(seg(t, FOTO + .3, FOTO + 1.0));
    tf(kadro, lerp(0, 540 - 540 * .62, k), lerp(0, 1000 - 1100 * .62 - 260, k), lerp(1, .62, k));
    goster(pol, t >= FOTO + .3); tf(pol, 540, 1000, E.back(seg(t, FOTO + .3, FOTO + .7)) * 1, -3 * k);
    if (t >= FOTO + .3) { pol.parentNode.appendChild(kadro); }
  };
});
ev(at(11), 'jingle');

// ── sunucu sözleri: alt telop plakası (aynı zamanda seslendirme metni)
export const SUBS = [
  [2.3, 9.6, 'Herkes aynı anda soruyor.'],
  [12.3, 19.6, 'SıraGO her birine cevap veriyor.'],
  [20.05, 22.65, 'Hepsi listede.'],
  [22.75, 26.8, 'Usta makasını bırakmadı.'],
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
