import { clamp, seg, eo, eio, hash } from '/core/lib.js';
import * as UI from './ui.js';
import * as FK from './fiko.js';
import * as FM from './film.js';

const W = innerWidth, H = innerHeight, OX = W / 2, OY = H / 2;
const dunya = document.getElementById('dunya'), spr = document.getElementById('spr'), hud = document.getElementById('hud');
const mbw = document.getElementById('mbw'), mbg = document.getElementById('mbg');

window.DUR = FM.DUR;
window.EV = FM.EV.slice().sort((a, b) => a.t - b.t);
const duz = s => s.replace(/<br>/g, ' ').replace(/<[^>]+>/g, '');
window.SUBS = FM.ALTYAZI.map(([t0, t1, m]) => ({ t0, t1, text: duz(m) }));

// sohbet ve panel kaydırması: düzen sabit, bir kez ölçülür (her işçi kendi ilk karesinde)
let duzenA = null, duzenB = null;
function olcA() {
  const liste = dunya.querySelector('.wa-liste'), govde = dunya.querySelector('.wa-govde');
  if (!liste) return null;
  const m = {}; for (const el of liste.children) m[el.dataset.a] = el.offsetTop + el.offsetHeight;
  return { m, h: govde.clientHeight };
}
function kayA(t) {
  if (!duzenA) return 0;
  let k = -1e4;
  const sira = Object.entries(FM.GIRIS).sort((a, b) => a[1] - b[1]);
  for (const [id, g] of sira) {
    const hedef = duzenA.m[id] + 16 - duzenA.h;   // eksi olabilir: az mesajda liste alta yaslanır
    if (t >= g) k = k < -9e3 ? hedef : k + (hedef - k) * eio(seg(t, g, g + .45));
  }
  return k < -9e3 ? 0 : k;
}
function olcB() {
  const liste = dunya.querySelector('.pnl-liste'), govde = dunya.querySelector('.pnl-govde');
  if (!liste) return null;
  const r1 = liste.querySelector('[data-a="r1"]'), rM = liste.querySelector('[data-a="rM"]');
  return { taban: r1.offsetTop - 12, altM: rM.offsetTop + rM.offsetHeight, h: govde.clientHeight };
}
const kayB = acik => !duzenB ? 0 : duzenB.taban + Math.max(0, duzenB.altM + 124 * acik + 14 - duzenB.h - duzenB.taban);

const tf = ([cx, cy, z]) => `translate(${OX}px,${OY}px) scale(${z}) translate(${-cx}px,${-cy}px)`;

function render(t) {
  const cam = FM.camAt(t), [cx, cy, z] = cam;
  const SA = FM.durumA(t), SB = FM.durumB(t);
  dunya.innerHTML = UI.duvar() + UI.telA(SA) + UI.telB(SB);
  if (!duzenA && SA.wa.op > 0) duzenA = olcA();
  if (!duzenB && SB.pnl.op > 0) duzenB = olcB();
  const la = dunya.querySelector('.wa-liste'); if (la) la.style.transform = `translateY(${-kayA(t)}px)`;
  const lb = dunya.querySelector('.pnl-liste'); if (lb) lb.style.transform = `translateY(${-kayB(SB.pnl.acik)}px)`;
  dunya.style.transform = spr.style.transform = tf(cam);

  // dünya koordinatında bir öğe noktası
  const A = (key, fx = .5, fy = 0) => {
    const el = dunya.querySelector(`[data-a="${key}"]`); if (!el) return null;
    const r = el.getBoundingClientRect(); if (!r.width) return null;
    return { x: (r.left + r.width * fx - OX) / z + cx, y: (r.top + r.height * fy - OY) / z + cy, w: r.width / z, h: r.height / z };
  };
  const ekran = p => ({ x: (p.x - cx) * z + OX, y: (p.y - cy) * z + OY });

  // hareket bulanıklığı yalnız kırbaç geçişlerinde (kamera hızından)
  const [px, py] = FM.camAt(t - 1 / 30), vx = (cx - px) * z, vy = (cy - py) * z;
  const bx = Math.min(40, Math.max(0, Math.abs(vx) - 25) * .32), by = Math.min(40, Math.max(0, Math.abs(vy) - 25) * .32);
  mbg.setAttribute('stdDeviation', `${bx.toFixed(2)} ${by.toFixed(2)}`);
  mbw.style.filter = bx > .6 || by > .6 ? 'url(#mb)' : '';

  spr.innerHTML = fiko(t, A);
  hud.innerHTML = katman(t, A, ekran, z);
}

function fiko(t, A) {
  const F = FM.F, E = FM.EK, c = F.eval(t, A); let h = '';
  // doğuş: bildirim simgesinden piksel patlaması
  if (t > E.dogus - .3 && t < E.dogus + .35) { const p = A('ban', .1, .5); if (p) h += FK.patlama(p.x, p.y, seg(t, E.dogus - .3, E.dogus + .35), 18, undefined, hash); }
  if (!c) return h;
  h += FK.sprite(c);
  const top = c.y - c.px * 14, px = c.px;
  for (const j of F.ziplar) if (t >= j.t1 && t < j.t1 + .4) h += FK.toz(c.x, c.y, seg(t, j.t1, j.t1 + .4), 3, 6, j.t1 * 10);
  if (t > E.unlem[0] && t < E.unlem[1]) h += FK.UNLEM(c.x + 9 * px, top - 30, px, 1 - seg(t, E.unlem[1] - .15, E.unlem[1]));
  if (t > E.dusun[0] && t < E.dusun[1]) {
    h += FK.KALEM(c.x + 7 * px, c.y - 9 * px, px);
    h += FK.NOKTALAR(c.x + 9 * px, top - 14, px, 1 + Math.floor((t - E.dusun[0]) * 4) % 3);
  }
  if (t > E.sevinc[0] && t < E.sevinc[1]) { const k = seg(t, E.sevinc[0], E.sevinc[1]);
    for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2 + .4; h += FK.KIVILCIM(c.x + Math.cos(a) * (40 + k * 30), c.y - 28 + Math.sin(a) * (24 + k * 18), 3, i % 2 ? '#f2c14e' : FK.ATKI, 1 - k); } }
  for (const kt of E.kalp) if (t > kt && t < kt + .9) { const k = seg(t, kt, kt + .9); h += FK.KALP(c.x + 34 + k * 10, top - 4 - k * 36, 3, 1 - k * k); }
  for (const zt of E.zil) if (t > zt && t < zt + 1.0) { const k = seg(t, zt, zt + 1.0), a = Math.sin(k * Math.PI * 7) * .55 * (1 - k);
    h += FK.ZIL(c.flip ? c.x - 14 * px : c.x + 7 * px, c.y - 13 * px, px, a, 1 - seg(t, zt + .8, zt + 1.0));
    if (k < .7) h += FK.pixart(['.y.y.', 'y...y'], { x: c.x + (c.flip ? -16 : 5) * px, y: c.y - 15 * px - k * 10, px: 3, pal: { y: '#f2c14e' }, op: 1 - k }); }
  if (t > E.geldi && t < E.geldi + .9) { const k = seg(t, E.geldi, E.geldi + .9);
    for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; h += FK.KIVILCIM(c.x + Math.cos(a) * (36 + k * 60), c.y - 26 + Math.sin(a) * (22 + k * 40), 3, i % 2 ? '#f2c14e' : FK.ATKI, 1 - k); }
    h += FK.TIK(c.x + 34, top - 24, px, 1 - seg(t, E.geldi + .6, E.geldi + .9)); }
  if (t > E.uyku) for (let i = 0; i < 3; i++) { const k = ((t - E.uyku) * .55 + i / 3) % 1;
    h += FK.Z(c.x + 22 + k * 26, top + 8 - k * 46, 2 + (i % 2), Math.sin(k * Math.PI)); }
  return h;
}

function katman(t, A, ekran, z) {
  let h = '';
  // spot: önemli baloncuk dışı kararır
  const S = FM.SPOT, so = Math.min(seg(t, S.t0, S.t0 + .35), 1 - seg(t, S.t1 - .35, S.t1));
  if (so > 0) { const p = A(S.anahtar, .5, .5); if (p) { const e = ekran(p), rx = p.w * z * .62 + 40, ry = p.h * z * .62 + 40;
    h += `<div class="spot" style="opacity:${so};background:radial-gradient(${rx}px ${ry}px at ${e.x}px ${e.y}px, transparent 75%, rgba(30,24,16,.5) 100%)"></div>`; } }
  // dokunuş göstergesi
  const [g0, g1] = FM.DOKUN_GORUN, gop = Math.min(seg(t, g0, g0 + .15), 1 - seg(t, g1 - .2, g1));
  if (gop > 0) {
    const nokta = r => { if (r === 'alt') return { x: 815 + 60, y: 880 }; const p = A(r[0], r[1], r[2]); return p; };
    let p = null;
    for (const d of FM.DOKUN) { const a = nokta(d.from), b = nokta(d.to); if (!a || !b) continue;
      if (t < d.t0) { p = p || a; break; } const k = eio(seg(t, d.t0, d.t1)); p = { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k }; }
    if (p) { const e = ekran(p); let sc = 1, hal = 0;
      for (const d of FM.DOKUN) { if (t >= d.bas - .08 && t < d.bas + .08) sc = .8; if (t >= d.bas && t < d.bas + .45) hal = seg(t, d.bas, d.bas + .45); }
      const r = 30 * sc;
      if (hal > 0) h += `<div class="halka" style="left:${e.x - 30 - hal * 40}px;top:${e.y - 30 - hal * 40}px;width:${60 + hal * 80}px;height:${60 + hal * 80}px;opacity:${1 - hal}"></div>`;
      h += `<div class="dokun" style="left:${e.x - r}px;top:${e.y - r}px;width:${2 * r}px;height:${2 * r}px;opacity:${gop}"></div>`; }
  }
  for (const [a, b, no, ad] of FM.BOLUM) { const o = Math.min(seg(t, a, a + .3), 1 - seg(t, b - .3, b)); if (o > 0)
    h += `<div class="chap" style="opacity:${o};transform:translateY(${(1 - eo(seg(t, a, a + .35))) * -14}px)"><b>${no}</b>${ad}</div>`; }
  for (const [a, b, gun, kala] of FM.HIZ) { const o = Math.min(seg(t, a, a + .2), 1 - seg(t, b - .2, b)); if (o > 0)
    h += `<div class="ramp" style="opacity:${o}">${Math.floor(t * 4) % 2 ? '▶▶' : '▷▷'} ${gun} <i>· ${kala}</i></div>`; }
  for (const [a, b, m, cls] of FM.ALTYAZI) { const o = Math.min(seg(t, a, a + .25), 1 - seg(t, b - .25, b)); if (o > 0)
    h += `<div class="cap ${cls || ''}" data-cap style="opacity:${o};transform:translate(-50%,${(1 - eo(seg(t, a, a + .3))) * 16}px)">${m}</div>`; }
  if (t < .3) h += `<div class="karart" style="opacity:${1 - eo(t / .3)}"></div>`;
  return h;
}

// okuma süresi denetimi için ekrandaki yazılar
window.TEXTS = t => {
  render(t); const out = [];
  hud.querySelectorAll('[data-cap]').forEach((el, i) => { if (+el.style.opacity < .99) return; const r = el.getBoundingClientRect();
    out.push({ id: 'cap' + FM.ALTYAZI.findIndex(a => duz(a[2]) === duz(el.innerHTML)), text: duz(el.innerHTML), x0: r.left, y0: r.top, x1: r.right, y1: r.bottom }); });
  return out;
};
window.render = render;
await document.fonts.load('46px Inter'); await document.fonts.load('600 46px Inter'); await document.fonts.load('20px Geist'); await document.fonts.load('800 20px Geist');
await new Promise(r => { const i = new Image(); i.onload = i.onerror = r; i.src = 'ikon.png'; });
render(+(new URLSearchParams(location.search).get('t') || 0));
window.READY = true;
