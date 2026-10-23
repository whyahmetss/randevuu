// Ritim oyunu / yarışma programı seti (düz vektör SVG, dikey 1080×1920). Her şey tempo ızgarasına oturur; render(t) saf: her
// öğenin durumu t'den yeniden hesaplanır. Kalın mürekkep kontur, düz renk, sert ofset gölge; degrade/bulanıklık yok.
// Yöntem Lemo-Opuscar game-show stilinden (MIT) öğrenildi; kod SıraGO için yeniden yazıldı.
export const NS = 'http://www.w3.org/2000/svg';
export const K = { ink: '#1d1a24', white: '#ffffff', cream: '#fff6e4', yellow: '#ffd23f', orange: '#ff9f43', red: '#ff5a5f', pink: '#ff7eb6',
  green: '#2bd36a', lime: '#b8e05b', sky: '#5ec8f2', blue: '#4a7cff', purple: '#8c6cff', sirago: '#1f6f4a', teal: '#22c3a6', navy: '#273469', gold: '#f5c542',
  ten: '#f2c3a0', tenE: '#c98e62' };
export const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
export const lerp = (a, b, t) => a + (b - a) * t;
export const seg = (t, a, b) => clamp((t - a) / (b - a));
export const E = { out: t => 1 - Math.pow(1 - clamp(t), 3), in: t => Math.pow(clamp(t), 3), io: t => { t = clamp(t); return t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; },
  back: (t, s = 2.2) => { t = clamp(t) - 1; return 1 + t * t * ((s + 1) * t + s); } };
export function el(tag, a = {}, p) { const e = document.createElementNS(NS, tag); for (const k in a) e.setAttribute(k, a[k]); if (p) p.appendChild(e); return e; }
export const tf = (e, x, y, s = 1, r = 0, sy) => e.setAttribute('transform', `translate(${x.toFixed(2)},${y.toFixed(2)}) rotate(${r.toFixed(2)}) scale(${s.toFixed(4)},${(sy ?? s).toFixed(4)})`);
export const op = (e, o) => e.setAttribute('opacity', clamp(o).toFixed(3));
export const goster = (e, v) => e.setAttribute('display', v ? 'inline' : 'none');

// ── tempo ızgarası
export function tempo(BPM, vurus = 4) { const B = 60 / BPM; return { B, BAR: B * vurus, at: (bar, beat = 0) => +(bar * vurus * B + beat * B).toFixed(4) }; }
export const hopY = (t, B, h = 18, faz = 0) => { const u = (((t / B + faz) % 1) + 1) % 1; return -h * 4 * u * (1 - u); };
export const hitSq = (t, t0, a = .14) => t < t0 || t > t0 + .4 ? 0 : a * Math.exp(-(t - t0) / .12) * Math.cos((t - t0) * 30);
export const dropY = (t, t0, h = 1400, d = .32) => t < t0 - d ? -h : t > t0 ? 0 : -h * (1 - E.in(seg(t, t0 - d, t0)));

// ── sahne kaydı + kamera vuruşu + kesme flaşı
export function sahneci(root) {
  const SAHNE = [], PUNCH = [], FLAS = [], EV = [];
  const kamera = el('g', {}, root), flas = el('rect', { x: 0, y: 0, width: 1080, height: 1920, fill: '#fff', opacity: 0 }, root);
  const kararti = el('rect', { x: 0, y: 0, width: 1080, height: 1920, fill: K.ink, opacity: 0 }, root);
  return {
    EV, ev: (t, type, o = {}) => EV.push({ t: +t.toFixed(3), type, ...o }),
    punch: (t, a = .02) => PUNCH.push([t, a]),
    kes: t => FLAS.push(t),
    sahne(t0, t1, build) { const g = el('g', { display: 'none' }, kamera); const s = { fx: [] }; const up = build(g, s); SAHNE.push({ t0, t1, g, up, s }); },
    render(t, son = null) {
      for (const S of SAHNE) { const on = t >= S.t0 && t < S.t1; goster(S.g, on); if (on) { S.up(t); S.s.fx.forEach(f => f(t)); } }
      let z = 1; for (const [t0, a] of PUNCH) if (t >= t0 && t < t0 + .5) z += a * Math.exp(-(t - t0) / .16);
      kamera.setAttribute('transform', `translate(540,960) scale(${z.toFixed(4)}) translate(-540,-960)`);
      let f = 0; for (const t0 of FLAS) if (t >= t0 && t < t0 + .14) f = Math.max(f, .85 * (1 - (t - t0) / .14));
      op(flas, f); op(kararti, son ? seg(t, son[0], son[1]) : 0);
    },
  };
}

// ── metin (telop): beyaz/sarı dolgu, altında kalın mürekkep kontur
export function gtext(p, s, x, y, size, o = {}) {
  const e = el('text', { x, y, 'font-family': 'Rubik', 'font-weight': o.weight ?? 900, 'font-size': size, fill: o.fill ?? K.white, stroke: o.stroke ?? K.ink,
    'stroke-width': o.sw ?? size * .14, 'stroke-linejoin': 'round', 'paint-order': 'stroke', 'text-anchor': o.anchor ?? 'middle', 'letter-spacing': o.ls ?? 0 }, p);
  e.textContent = s; return e;
}
// harf harf patlayan başlık
export function harfler(p, s, x, y, size, o = {}) {
  const g = el('g', {}, p), ws = [...s].map(ch => ({ ch, w: olc(ch, size) })), top = ws.reduce((a, b) => a + b.w, 0);
  let cx = x - (o.anchor === 'start' ? 0 : top / 2); const parcalar = [];
  for (const { ch, w } of ws) { const hg = el('g', {}, g); gtext(hg, ch, 0, 0, size, { ...o, anchor: 'middle' }); parcalar.push({ hg, x: cx + w / 2, y }); cx += w; }
  return (t, t0, ara = .05) => parcalar.forEach((q, i) => { const k = E.back(seg(t, t0 + i * ara, t0 + i * ara + .22)); tf(q.hg, q.x, q.y, Math.max(.0001, k)); });
}
const _c = document.createElement('canvas').getContext('2d');
export function olc(s, size, w = 900) { _c.font = `${w} ${size}px Rubik`; return _c.measureText(s).width; }

// ── setler: düz zemin + desen + taban bandı
export function zemin(p, col, desen, col2, taban, o = {}) {
  el('rect', { x: -60, y: -60, width: 1200, height: 2040, fill: col }, p);
  const d = el('g', {}, p);
  if (desen === 'serit') for (let i = -20; i < 40; i++) el('rect', { x: i * 90, y: -400, width: 45, height: 2800, fill: col2, transform: `rotate(-20 540 960)` }, d);
  if (desen === 'nokta') for (let j = 0; j < 22; j++) for (let i = 0; i < 12; i++) el('circle', { cx: i * 100 + (j % 2) * 50, cy: j * 95, r: 16, fill: col2 }, d);
  if (desen === 'isin') { for (let i = 0; i < 28; i++) { const a0 = i / 28 * Math.PI * 2, a1 = a0 + Math.PI / 28; el('path', { d: `M540 760 L${540 + Math.cos(a0) * 2400} ${760 + Math.sin(a0) * 2400} L${540 + Math.cos(a1) * 2400} ${760 + Math.sin(a1) * 2400} Z`, fill: col2 }, d); } }
  if (taban) { el('rect', { x: -60, y: o.ty ?? 1480, width: 1200, height: 600, fill: taban }, p); el('rect', { x: -60, y: (o.ty ?? 1480) - 6, width: 1200, height: 12, fill: K.ink }, p); }
  return d;   // desen grubu (ışınlar update'te döndürülür)
}
// sert ofset gölgeli kart / plaka
export function plaka(p, w, h, col, o = {}) {
  const g = el('g', {}, p), r = o.r ?? 34, sh = o.sh ?? 14;
  el('rect', { x: -w / 2 + sh, y: -h / 2 + sh, width: w, height: h, rx: r, fill: K.ink }, g);
  el('rect', { x: -w / 2, y: -h / 2, width: w, height: h, rx: r, fill: col, stroke: K.ink, 'stroke-width': 8 }, g);
  return g;
}
// köşe bandı (sol üst): başlık + alt satır
export function bant(p, baslik, alt, col) {
  const g = el('g', {}, p), w = Math.max(olc(baslik, 54), olc(alt, 34, 700)) + 80;
  el('rect', { x: 12, y: 12, width: w, height: 150, rx: 26, fill: K.ink }, g);
  el('rect', { x: 0, y: 0, width: w, height: 150, rx: 26, fill: col, stroke: K.ink, 'stroke-width': 8 }, g);
  gtext(g, baslik, 40, 70, 54, { anchor: 'start' }); gtext(g, alt, 40, 122, 34, { anchor: 'start', fill: K.yellow, weight: 700 });
  return (t, t0, t1) => { const k = E.back(seg(t, t0, t0 + .3)) * (1 - E.in(seg(t, t1 - .2, t1))); tf(g, 40 - (1 - k) * 600, 60, 1); };
}
// tur kartı (1 ölçü): numara + ad, sette uçarak gelir
export function kart(p, no, ad, col, col2) {
  const g = el('g', {}, p);
  zemin(g, col, 'isin', col2);
  const pl = plaka(g, 820, 560, K.cream, { r: 60 }); tf(pl, 540, 900);
  gtext(g, no, 540, 790, 96, { fill: K.yellow });
  const h = harfler(g, ad, 540, 980, Math.min(120, 700 / (olc(ad, 100) / 100)), { fill: K.white });   // başlık karta sığsın
  return (t, t0) => { const k = E.back(seg(t, t0, t0 + .35)); tf(pl, 540, 900, k); h(t, t0 + .2); };
}
// karar kelimesi: açılı, kocaman, patlar
export function karar(p, kelime, x, y, t0, col = K.pink, dur = 1.2, size = 170) {
  const g = el('g', {}, p); gtext(g, kelime, 0, size * .35, size, { fill: col, sw: size * .16 }); goster(g, false);
  return t => { const on = t >= t0 && t < t0 + dur; goster(g, on); if (on) { const k = E.back(seg(t, t0, t0 + .22), 3); tf(g, x, y, k * (1 + .03 * Math.sin((t - t0) * 20) * Math.exp(-(t - t0) * 4)), -8); } };
}
// patlama: yıldız + halka + hız çizgileri
export function patlama(p, x, y, t0, col = K.yellow, s = 1) {
  const g = el('g', {}, p); goster(g, false);
  const yildiz = el('path', { d: yildizYol(12, 120, 60), fill: col, stroke: K.ink, 'stroke-width': 8 }, g);
  const halka = el('circle', { r: 100, fill: 'none', stroke: K.white, 'stroke-width': 14 }, g);
  const cz = []; for (let i = 0; i < 10; i++) cz.push(el('line', { stroke: K.ink, 'stroke-width': 10, 'stroke-linecap': 'round' }, g));
  return t => { const k = seg(t, t0, t0 + .4), on = t >= t0 && k < 1; goster(g, on); if (!on) return;
    tf(g, x, y, s); tf(yildiz, 0, 0, E.back(k) * (1 - k * .3), k * 40); op(yildiz, 1 - E.in(k)); halka.setAttribute('r', 60 + 160 * E.out(k)); op(halka, 1 - k);
    cz.forEach((c, i) => { const a = i / 10 * Math.PI * 2, r0 = 150 + 120 * E.out(k), r1 = r0 + 60 * (1 - k); c.setAttribute('x1', Math.cos(a) * r0); c.setAttribute('y1', Math.sin(a) * r0); c.setAttribute('x2', Math.cos(a) * r1); c.setAttribute('y2', Math.sin(a) * r1); op(c, 1 - k); }); };
}
export function yildizYol(n, r1, r2) { let d = ''; for (let i = 0; i < n * 2; i++) { const a = i / (n * 2) * Math.PI * 2 - Math.PI / 2, r = i % 2 ? r2 : r1; d += (i ? 'L' : 'M') + (Math.cos(a) * r).toFixed(1) + ' ' + (Math.sin(a) * r).toFixed(1); } return d + 'Z'; }
export function tik(p, x, y, s = 1, col = K.green) {
  const g = el('g', {}, p); el('path', { d: 'M-40 0 L-12 30 L44 -34', fill: 'none', stroke: K.ink, 'stroke-width': 34, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }, g);
  el('path', { d: 'M-40 0 L-12 30 L44 -34', fill: 'none', stroke: col, 'stroke-width': 18, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }, g); tf(g, x, y, s); return g;
}

// ── fasulye karakter: renk kimliktir, değişmez
export function fasulye(p, o = {}) {
  const g = el('g', {}, p), renk = o.renk ?? K.sky, gv = el('g', {}, g);
  const kol = taraf => { const k = el('g', {}, gv); const a = el('path', { fill: 'none', stroke: K.ink, 'stroke-width': 40, 'stroke-linecap': 'round' }, k), b = el('path', { fill: 'none', stroke: renk, 'stroke-width': 24, 'stroke-linecap': 'round' }, k);
    const el2 = el('circle', { r: 24, fill: K.white, stroke: K.ink, 'stroke-width': 8 }, k); return { k, a, b, el: el2, taraf }; };
  const kL = kol(-1), kR = kol(1);
  for (const x of [-46, 46]) el('ellipse', { cx: x, cy: -6, rx: 40, ry: 22, fill: K.ink }, gv);
  const govde = el('path', { d: 'M-104 -14 C-128 -150 -96 -318 0 -318 C96 -318 128 -150 104 -14 C70 6 -70 6 -104 -14 Z', fill: renk, stroke: K.ink, 'stroke-width': 9 }, gv);
  if (o.gobek !== false) el('ellipse', { cx: 0, cy: -100, rx: 62, ry: 70, fill: o.gobek ?? K.cream, stroke: K.ink, 'stroke-width': 6 }, gv);
  if (o.onluk) el('path', { d: 'M-66 -180 L66 -180 L74 -30 L-74 -30 Z', fill: o.onluk, stroke: K.ink, 'stroke-width': 7 }, gv);
  const goz = []; for (const x of [-34, 34]) { const e = el('g', {}, gv); el('ellipse', { cx: 0, cy: 0, rx: 15, ry: 22, fill: K.ink }, e); el('circle', { cx: 5, cy: -8, r: 6, fill: K.white }, e); tf(e, x, -232); goz.push(e); }
  const kapali = el('path', { d: 'M-24 -10 Q-14 -18 -4 -10', fill: 'none', stroke: K.ink, 'stroke-width': 6, 'stroke-linecap': 'round' }, gv);
  const agiz = el('path', { d: 'M-22 -186 Q0 -170 22 -186', fill: 'none', stroke: K.ink, 'stroke-width': 7, 'stroke-linecap': 'round' }, gv);
  const acik = el('path', { d: 'M-30 -192 Q0 -194 30 -192 Q26 -150 0 -146 Q-26 -150 -30 -192 Z', fill: '#7a1f2b', stroke: K.ink, 'stroke-width': 7 }, gv);
  goster(kapali, false);
  if (o.biyik) el('path', { d: 'M-44 -198 Q-22 -212 0 -200 Q22 -212 44 -198 Q22 -190 0 -196 Q-22 -190 -44 -198 Z', fill: K.ink }, gv);
  if (o.sac) el('path', { d: o.sac === 'kivircik' ? 'M-80 -270 Q-90 -330 -40 -330 Q-20 -360 10 -335 Q50 -360 70 -320 Q100 -300 84 -262 Q40 -300 0 -296 Q-40 -300 -80 -270 Z' : 'M-90 -262 Q-80 -334 0 -330 Q80 -334 90 -262 Q50 -296 0 -292 Q-50 -296 -90 -262 Z', fill: o.sacRenk ?? K.ink, stroke: K.ink, 'stroke-width': 6 }, gv);
  if (o.basortu) el('path', { d: 'M-98 -150 Q-120 -330 0 -334 Q120 -330 98 -150 Q60 -250 0 -262 Q-60 -250 -98 -150 Z', fill: o.basortu, stroke: K.ink, 'stroke-width': 7 }, gv);
  let etiket = null;
  if (o.ad) { etiket = el('g', {}, gv); const w = olc(o.ad, 30, 800) + 30; el('rect', { x: -w / 2, y: -88, width: w, height: 44, rx: 12, fill: K.white, stroke: K.ink, 'stroke-width': 5 }, etiket); gtext(etiket, o.ad, 0, -56, 30, { fill: K.ink, sw: 0, weight: 800 }); }
  const durum = { g, gv, kL, kR, goz, kapali, agiz, acik };
  return durum;
}
// poz: open (ağız), hey (kollar yukarı), sq (ezilme), lean, blink, kolL/kolR: [x, y] el hedefi (yerel)
export function poz(c, o = {}) {
  const sq = o.sq ?? 0; tf(c.gv, 0, 0, 1 + sq * .7, o.lean ?? 0, 1 - sq);
  goster(c.acik, !!o.open); goster(c.agiz, !o.open);
  c.goz.forEach((e, i) => goster(e, !o.blink)); goster(c.kapali, false);
  const kol = (k, hedef, varsay) => { const [x, y] = hedef ?? varsay; const sx = k.taraf * 100, sy = -150, mx = (sx + x) / 2 + k.taraf * 10, my = (sy + y) / 2 + 20;
    const d = `M${sx} ${sy} Q${mx} ${my} ${x} ${y}`; k.a.setAttribute('d', d); k.b.setAttribute('d', d); k.el.setAttribute('cx', x); k.el.setAttribute('cy', y); };
  const hey = o.hey ?? 0;
  kol(c.kL, o.kolL ?? (hey ? [-150, -330] : null), [-140, -60]); kol(c.kR, o.kolR ?? (hey ? [150, -330] : null), [140, -60]);
}
// telefon plakası: satırlar [{m, bot, op}]
export function telefon(p, w = 520, h = 760) {
  const g = el('g', {}, p);
  el('rect', { x: -w / 2 + 16, y: -h / 2 + 16, width: w, height: h, rx: 56, fill: K.ink }, g);
  el('rect', { x: -w / 2, y: -h / 2, width: w, height: h, rx: 56, fill: '#2d2a36', stroke: K.ink, 'stroke-width': 8 }, g);
  el('rect', { x: -w / 2 + 22, y: -h / 2 + 60, width: w - 44, height: h - 100, rx: 26, fill: K.cream }, g);
  el('rect', { x: -60, y: -h / 2 + 22, width: 120, height: 22, rx: 11, fill: K.ink }, g);
  const ic = el('g', {}, g);
  return { g, yaz(satirlar, t) { while (ic.firstChild) ic.removeChild(ic.firstChild); let y = -h / 2 + 90;
    for (const q of satirlar) { if ((q.op ?? 1) <= 0) continue; const sat = q.m.split('\n'), fs = q.fs ?? 34, bw = Math.min(w - 70, Math.max(...sat.map(l => olc(l, fs, 600))) + 40), bh = sat.length * fs * 1.22 + 22;
      const bx = q.bot ? -w / 2 + 34 : w / 2 - 34 - bw, k = E.back(clamp(q.op ?? 1));
      const b = el('g', {}, ic); el('rect', { x: 0, y: 0, width: bw, height: bh, rx: 20, fill: q.bot ? '#bff0cf' : K.white, stroke: K.ink, 'stroke-width': 5 }, b);
      sat.forEach((l, i) => gtext(b, l, 20, 14 + (i + 1) * fs * 1.12, fs, { anchor: 'start', fill: K.ink, sw: 0, weight: 600 }));
      b.setAttribute('transform', `translate(${bx + (q.bot ? 0 : bw)},${y}) scale(${k}) translate(${q.bot ? 0 : -bw},0)`);
      y += bh + 18; } } };
}
// kapı (açık/kapalı)
export function kapi(p, col = K.orange) {
  const g = el('g', {}, p);
  el('rect', { x: -150, y: -540, width: 300, height: 540, fill: K.ink }, g);
  const kanat = el('g', {}, g); el('rect', { x: -140, y: -530, width: 280, height: 530, fill: col, stroke: K.ink, 'stroke-width': 8 }, kanat);
  el('circle', { cx: 100, cy: -260, r: 16, fill: K.yellow, stroke: K.ink, 'stroke-width': 6 }, kanat);
  return { g, ac: k => tf(kanat, -140 * k, 0, 1 - k * .7, 0, 1) };
}
