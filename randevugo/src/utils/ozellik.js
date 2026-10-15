// Özellik anahtarları (2026-10-15): yeni bir özellik önce birkaç işletmede açılır, sorun çıkarsa
// panelden tek tuşla kapatılır (deploy gerekmez).
// Kullanım (kodda):  if (require('../utils/ozellik').acik('yeni_ozellik', isletmeId)) { ... }
// Tanımlı olmayan kod → kapalı. Durumlar bellekte tutulur; kaydedilince ve dakikada bir tazelenir.
const pool = require('../config/db');

let anahtarlar = new Map();

async function yukle() {
  try {
    const r = await pool.query('SELECT kod, durum, isletme_idler FROM ozellik_anahtarlari');
    anahtarlar = new Map(r.rows.map(x => [x.kod, { durum: x.durum, idler: new Set((x.isletme_idler || []).map(Number)) }]));
  } catch (e) { /* tablo yoksa hepsi kapalı */ }
}

function acik(kod, isletmeId) {
  const a = anahtarlar.get(kod);
  if (!a) return false;
  if (a.durum === 'herkes') return true;
  if (a.durum === 'secili') return a.idler.has(Number(isletmeId));
  return false;
}

function baslat() {
  yukle();
  setInterval(yukle, 60_000).unref?.();
}

module.exports = { acik, yukle, baslat };
