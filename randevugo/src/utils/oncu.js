// Öncü Esnaf (kullanıcı kararı 2026-10-09): ilk 100 ödeyen esnafın fiyatı ömür boyu sabit.
// Ortaklık/pay değil: fiyat kilidi + Standart özellikleri (ONCU_ODUL) + panelde "🏆 Öncü Esnaf #12" rozeti.
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

// Öncü ödülü (kullanıcı kararı 2026-10-13): öncü hangi paketten öderse ödesin Standart'ın özellikleri açılır.
// Limitler (çalışan, hizmet, randevu) ve fiyat paketinden gelir; ödül geri alınmaz.
const ONCU_ODUL = ['kasa', 'magaza', 'prim', 'sadakat', 'winback', 'yorum_avcisi', 'gece_raporu', 'istatistik'];
function oncuPaket(paket, oncuNo) {
  if (!oncuNo || !paket) return paket;
  const p = { ...paket, oncu_odul: true };
  for (const k of ONCU_ODUL) p[k] = true;
  return p;
}
// İşletmenin geçerli paketi (grup şubesi merkezin paketine ve öncülüğüne tabi) + öncü ödülü
async function isletmePaketi(isletmeId) {
  const { paketGetir } = require('../config/paketler');
  const i = (await pool.query(
    `SELECT COALESCE(m.paket, i.paket) AS paket, COALESCE(m.oncu_no, i.oncu_no) AS oncu_no
       FROM isletmeler i LEFT JOIN LATERAL (SELECT paket, oncu_no FROM isletmeler WHERE grup_id = i.grup_id AND i.grup_id IS NOT NULL ORDER BY id LIMIT 1) m ON true
      WHERE i.id = $1`, [isletmeId])).rows[0];
  return { kod: i?.paket || 'baslangic', paket: oncuPaket(await paketGetir(i?.paket), i?.oncu_no) };
}

module.exports = { oncuOdeme, etkinFiyat, oncuDurum, oncuPaket, isletmePaketi, ONCU_LIMIT, ONCU_ODUL };
