// Kare kare belirlenimci zaman çizelgesi (CSS animasyonu yok; her kare zaman(t) ile kurulur).
//   data-sahne="bas-bit"        → [bas, bit) aralığında görünür (saniye)
//   data-gir="t" data-efekt=... → t anında girer: pop | yukari | asagi | sol | sag | sol-kay (yalnız opaklık: sön)
//   data-cik="t"                → t anında söner
//   data-kay="t1:px,t2:px,..."  → dikey kaydırma (translateY), aralarda yumuşak
(function () {
  const yumusak = x => x <= 0 ? 0 : x >= 1 ? 1 : 1 - Math.pow(1 - x, 3);
  const yay = x => { if (x <= 0) return 0; if (x >= 1) return 1; const c = 1.70158 * 1.2; return 1 + (c + 1) * Math.pow(x - 1, 3) + c * Math.pow(x - 1, 2); };
  const SURE = 0.32;
  window.zaman = function (t) {
    document.querySelectorAll('[data-sahne]').forEach(el => {
      const [a, b] = el.dataset.sahne.split('-').map(Number);
      el.style.display = t >= a && t < b ? '' : 'none';
    });
    document.querySelectorAll('[data-gir]').forEach(el => {
      const g = +el.dataset.gir, ef = el.dataset.efekt || 'pop';
      const p = (t - g) / (+el.dataset.sure || SURE);
      let op = ef === 'yer' ? (t >= g ? 1 : 0) : yumusak(p * 1.6), tr = '';
      if (ef === 'pop') { const s = 0.85 + 0.15 * yay(p); tr = `scale(${s})`; }
      if (ef === 'yukari') tr = `translateY(${(1 - yay(p)) * 60}px)`;
      if (ef === 'asagi') tr = `translateY(${(1 - yay(p)) * -160}px)`;
      if (ef === 'sol') tr = `translateX(${(1 - yay(p)) * -80}px)`;
      if (ef === 'sag') tr = `translateX(${(1 - yay(p)) * 80}px)`;
      if (el.dataset.cik) op *= 1 - yumusak((t - +el.dataset.cik) / 0.25);
      el.style.opacity = op;
      el.style.transform = tr;
      el.style.visibility = op <= 0.001 && ef !== 'yer' ? 'hidden' : '';
    });
    document.querySelectorAll('[data-kay]').forEach(el => {
      const n = el.dataset.kay.split(',').map(s => s.split(':').map(Number));
      let y = n[0][1];
      for (let i = 1; i < n.length; i++) {
        const [t0, y0] = n[i - 1], [t1, y1] = n[i];
        if (t >= t1) y = y1; else if (t > t0) { y = y0 + (y1 - y0) * yumusak((t - t0) / (t1 - t0) * 1.0); break; } else break;
      }
      el.style.transform = `translateY(${y}px)`;
    });
    document.querySelectorAll('[data-saat]').forEach(el => {
      // data-saat="t:17:42,t2:17:43" → saat metni
      let s = '';
      el.dataset.saat.split(',').forEach(p => { const i = p.indexOf(':'); if (t >= +p.slice(0, i)) s = p.slice(i + 1); });
      el.textContent = s;
    });
  };
  window.addEventListener('DOMContentLoaded', () => {
    const q = new URLSearchParams(location.search);
    window.zaman(+(q.get('t') || 0));
  });
})();
