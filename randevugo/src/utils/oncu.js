// Öncü Esnaf (kullanıcı kararı 2026-10-09): ilk 100 ödeyen esnafın fiyatı ömür boyu sabit.
// Ortaklık/pay değil; yalnız fiyat kilidi + panelde "🏆 Öncü Esnaf #12" rozeti.
const pool = require('../config/db');

const ONCU_LIMIT = 100;

// Ödeme sonrası: henüz öncü değilse ve yer varsa sıra numarası ver; paketi ve o anki fiyatı kilitle.
// Öncü işletme paket değiştirirse yeni paketin o günkü fiyatı kilitlenir.
async function oncuOdeme(isletmeId, paketKod, listeFiyat) {
  const i = (await pool.query('SELECT oncu_no, kilitli_paket FROM isletmeler WHERE id = $1', [isletmeId])).rows[0];
  if (!i) return null;
  if (i.oncu_no) {
    if (i.kilitli_paket !== paketKod) {
      await pool.query('UPDATE isletmeler SET kilitli_paket = $2, kilitli_fiyat = $3 WHERE id = $1', [isletmeId, paketKod, listeFiyat]);
    }
    return i.oncu_no;
  }
  for (let deneme = 0; deneme < 3; deneme++) {
    try {
      const r = await pool.query(`
        UPDATE isletmeler SET oncu_no = (SELECT COALESCE(MAX(oncu_no), 0) + 1 FROM isletmeler),
          kilitli_paket = $2, kilitli_fiyat = $3
        WHERE id = $1 AND oncu_no IS NULL AND (SELECT COUNT(*) FROM isletmeler WHERE oncu_no IS NOT NULL) < $4
        RETURNING oncu_no`, [isletmeId, paketKod, listeFiyat, ONCU_LIMIT]);
      return r.rows[0]?.oncu_no || null;
    } catch (e) {
      if (!/duplicate|unique/i.test(e.message)) throw e;   // aynı anda iki ödeme: tekrar dene
    }
  }
  return null;
}

// Ödenecek fiyat: öncünün kilitli paketi için kilitli fiyat (liste fiyatı düşerse düşük olan)
function etkinFiyat(isletme, paketKod, listeFiyat) {
  const k = Number(isletme?.kilitli_fiyat);
  if (isletme?.oncu_no && isletme.kilitli_paket === paketKod && k > 0) return Math.min(k, Number(listeFiyat));
  return Number(listeFiyat);
}

async function oncuDurum(isletmeId) {
  const sayi = (await pool.query('SELECT COUNT(*)::int AS n FROM isletmeler WHERE oncu_no IS NOT NULL')).rows[0].n;
  const i = isletmeId ? (await pool.query('SELECT oncu_no, kilitli_paket, kilitli_fiyat FROM isletmeler WHERE id = $1', [isletmeId])).rows[0] : null;
  return { limit: ONCU_LIMIT, kalan: Math.max(0, ONCU_LIMIT - sayi), no: i?.oncu_no || null,
    kilitli_paket: i?.kilitli_paket || null, kilitli_fiyat: i?.kilitli_fiyat ? Number(i.kilitli_fiyat) : null };
}

module.exports = { oncuOdeme, etkinFiyat, oncuDurum, ONCU_LIMIT };
