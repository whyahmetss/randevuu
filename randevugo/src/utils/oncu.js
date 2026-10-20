// Öncü Esnaf (kullanıcı kararı 2026-10-09): ilk 100 ödeyen esnafın fiyatı ömür boyu sabit.
// Ortaklık/pay değil: fiyat kilidi + Standart özellikleri (ONCU_ODUL) + panelde "🏆 Öncü Esnaf #12" rozeti.
const pool = require('../config/db');

const ONCU_LIMIT = 100;

// Rozeti patron verir (kullanıcı kararı 2026-10-20): ödeme artık kendiliğinden öncü yapmaz; demo/deneme hesapları
// 100 kişilik yeri doldurmasın. Ödeme sonrası yalnız zaten öncü olanın kilitli paketi/fiyatı güncellenir.
// Öncü işletme paket değiştirirse yeni paketin o günkü fiyatı kilitlenir.
async function oncuOdeme(isletmeId, paketKod, listeFiyat) {
  const i = (await pool.query('SELECT oncu_no, kilitli_paket FROM isletmeler WHERE id = $1', [isletmeId])).rows[0];
  if (!i?.oncu_no) return null;
  if (i.kilitli_paket !== paketKod) {
    await pool.query('UPDATE isletmeler SET kilitli_paket = $2, kilitli_fiyat = $3 WHERE id = $1', [isletmeId, paketKod, listeFiyat]);
  }
  return i.oncu_no;
}

// Patron: rozeti ver. En küçük boş sıra numarası (geri alınanın numarası tekrar kullanılır); o anki paket ve
// liste fiyatı kilitlenir. Yer doluysa hata.
async function oncuVer(isletmeId) {
  const i = (await pool.query('SELECT oncu_no, paket FROM isletmeler WHERE id = $1', [isletmeId])).rows[0];
  if (!i) throw new Error('İşletme bulunamadı');
  if (i.oncu_no) return i.oncu_no;
  let fiyat = null;
  try { fiyat = Number((await require('../config/paketler').paketGetir(i.paket))?.fiyat) || null; } catch (e) { /* fiyatsız kilit: etkinFiyat liste fiyatını kullanır */ }
  for (let deneme = 0; deneme < 3; deneme++) {
    try {
      const r = await pool.query(`
        UPDATE isletmeler SET kilitli_paket = paket, kilitli_fiyat = $3,
          oncu_no = (SELECT MIN(n) FROM generate_series(1, $2::int) n WHERE NOT EXISTS (SELECT 1 FROM isletmeler WHERE oncu_no = n))
        WHERE id = $1 AND oncu_no IS NULL AND (SELECT COUNT(*) FROM isletmeler WHERE oncu_no IS NOT NULL) < $2
        RETURNING oncu_no`, [isletmeId, ONCU_LIMIT, fiyat]);
      if (r.rows[0]?.oncu_no) return r.rows[0].oncu_no;
      throw new Error(`Öncü Esnaf yerleri dolu (${ONCU_LIMIT}/${ONCU_LIMIT})`);
    } catch (e) {
      if (!/duplicate|unique/i.test(e.message)) throw e;   // aynı anda iki işlem: tekrar dene
    }
  }
  throw new Error('Rozet verilemedi, tekrar deneyin');
}

// Patron: rozeti geri al (yanlışlıkla verilen / demo). Fiyat kilidi ve öncü ödülü de kalkar; numara boşa çıkar.
async function oncuKaldir(isletmeId) {
  await pool.query('UPDATE isletmeler SET oncu_no = NULL, kilitli_paket = NULL, kilitli_fiyat = NULL WHERE id = $1', [isletmeId]);
}

// Patron sayacı: kaç öncü var, kimler
async function oncuListe() {
  const liste = (await pool.query(`SELECT id, isim, paket, oncu_no, kilitli_paket, kilitli_fiyat, demo, aktif
    FROM isletmeler WHERE oncu_no IS NOT NULL ORDER BY oncu_no`)).rows;
  return { limit: ONCU_LIMIT, sayi: liste.length, kalan: Math.max(0, ONCU_LIMIT - liste.length), liste };
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
const ONCU_ODUL = ['kasa', 'magaza', 'prim', 'sadakat', 'winback', 'yorum_avcisi', 'gece_raporu', 'istatistik', 'kapora', 'telegram', 'dogum_gunu'];
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
    `SELECT COALESCE(m.paket, i.paket) AS paket, COALESCE(m.oncu_no, i.oncu_no) AS oncu_no, i.paket_ayricalik
       FROM isletmeler i LEFT JOIN LATERAL (SELECT paket, oncu_no FROM isletmeler WHERE grup_id = i.grup_id AND i.grup_id IS NOT NULL ORDER BY id LIMIT 1) m ON true
      WHERE i.id = $1`, [isletmeId])).rows[0];
  const paket = oncuPaket(await paketGetir(i?.paket), i?.oncu_no);
  // Kazanılmış hak (044): paket kuralından önce açık olan özellik bu işletmede açık kalır
  const ayricalik = Array.isArray(i?.paket_ayricalik) ? i.paket_ayricalik : [];
  return { kod: i?.paket || 'baslangic', paket: ayricalik.length ? { ...paket, ...Object.fromEntries(ayricalik.map(k => [k, true])) } : paket };
}

module.exports = { oncuOdeme, oncuVer, oncuKaldir, oncuListe, etkinFiyat, oncuDurum, oncuPaket, isletmePaketi, ONCU_LIMIT, ONCU_ODUL };
