// Gün bazlı çalışma saati (2026-10-29): berber "hafta içi 9–21, son müşteri 20:00; cuma-cumartesi 23:00 kapanış" istedi.
// Önceden bütün günler tek açılış/kapanış saatiydi, "son randevu" diye bir şey yoktu.
// isletmeler.haftalik_saatler (JSONB): { "5": { "bas": "09:00", "bit": "23:00", "son": "22:00" }, ... } — 0 = Pazar.
// Günde yazılmayan alan genel saate (calisma_baslangic / calisma_bitis) düşer; kapalı günler yine kapali_gunler'de.
const { kapanisDk } = require('./tarih');

const s5 = (x) => (x ? String(x).slice(0, 5) : null);
const dk = (x) => { const [h, m] = String(x).slice(0, 5).split(':').map(Number); return (h || 0) * 60 + (m || 0); };
const SAAT = /^([01]\d|2[0-3]):[0-5]\d$/;

const tablo = (isletme) => {
  const t = isletme?.haftalik_saatler;
  if (t && typeof t === 'object') return t;
  try { const x = JSON.parse(t || 'null'); return x && typeof x === 'object' ? x : {}; } catch (e) { return {}; }
};

// gun: 0–6 ya da 'YYYY-MM-DD'. → { kapali, bas, bit, son, basDk, bitDk, sonDk }
// bitDk gece yarısını (00:00) gün sonu sayar; sonDk: en geç randevu başlangıcı (yoksa null)
function gunSaatleri(isletme, gun) {
  if (typeof gun === 'string' && gun.includes('-')) { const [y, a, g] = gun.split('-').map(Number); gun = new Date(y, a - 1, g).getDay(); }
  const kapali = String(isletme?.kapali_gunler || '').split(',').filter(Boolean).map(Number).includes(Number(gun));
  const ozel = tablo(isletme)[String(gun)] || {};
  const bas = s5(ozel.bas) || s5(isletme?.calisma_baslangic) || '09:00';
  const bit = s5(ozel.bit) || s5(isletme?.calisma_bitis) || '19:00';
  const son = s5(ozel.son);
  const basDk = dk(bas), bitDk = kapanisDk(bas, bit);
  let sonDk = son ? dk(son) : null;
  if (sonDk !== null && sonDk < basDk) sonDk += 24 * 60;   // "00:30" gibi gece yarısı sonrası yazılmışsa
  return { kapali, bas, bit, son, basDk, bitDk, sonDk };
}

// Panelden gelen tabloyu temizler: yalnız 0–6 günleri ve geçerli SS:DD saatleri kalır; boş gün atılır
function tabloTemizle(girdi) {
  const temiz = {};
  for (const [g, v] of Object.entries(girdi || {})) {
    if (!/^[0-6]$/.test(g) || !v || typeof v !== 'object') continue;
    const gun = {};
    for (const k of ['bas', 'bit', 'son']) if (SAAT.test(String(v[k] || ''))) gun[k] = String(v[k]);
    if (Object.keys(gun).length) temiz[g] = gun;
  }
  return Object.keys(temiz).length ? temiz : null;
}

// Haftanın özeti: aynı saatli ardışık günler birleşir ("Pzt–Per 09:00–21:00 · Cum–Cmt 09:00–23:00 · Paz kapalı")
const KISA = ['Paz', 'Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt'];
function haftaOzeti(isletme) {
  const sira = [1, 2, 3, 4, 5, 6, 0];
  const parca = sira.map(g => { const s = gunSaatleri(isletme, g); return { g, yazi: s.kapali ? 'kapalı' : `${s.bas}–${s.bit}` }; });
  const gruplar = [];
  for (const p of parca) {
    const son = gruplar[gruplar.length - 1];
    if (son && son.yazi === p.yazi) son.bitis = p.g; else gruplar.push({ ilk: p.g, bitis: p.g, yazi: p.yazi });
  }
  return gruplar.map(x => `${KISA[x.ilk]}${x.ilk !== x.bitis ? '–' + KISA[x.bitis] : ''} ${x.yazi}`).join(' · ');
}

module.exports = { gunSaatleri, tabloTemizle, haftaOzeti };
