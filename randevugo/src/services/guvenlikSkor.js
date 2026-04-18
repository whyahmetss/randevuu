/**
 * Güven Skoru Motoru
 * ═══════════════════════════════════════════════════
 * Müşterilerin davranışına göre cross-business güven skoru (0-100)
 *
 * Başlangıç: 50 (orta)
 * Aralıklar:
 *   >= 80  → VIP
 *   30-79  → Normal
 *   10-29  → Şüpheli (ek captcha / manuel onay)
 *   < 10   → Otomatik kara liste
 */
const pool = require('../config/db');

const ETKILER = {
  randevu_geldi:          +5,   // başarılı randevu (durum=tamamlandi)
  randevu_no_show:        -15,  // gelmedi
  randevu_iptal_erken:    +2,   // 24h+ önceden iptal
  randevu_iptal_son_dakika: -5, // <1h iptal
  otp_dogrulandi:         +10,  // ilk OTP doğrulama (tek seferlik, musteriler.id'ye göre)
  wa_eski_musteri:        +10,  // WA bot üzerinden eski müşteri (5+ randevu geçmişi)
  limit_asimi_denedi:     -20,  // IP limiti aştı, spam denedi
  fingerprint_spoof:      -10,  // şüpheli cihaz davranışı
  bayrak_elle_esnaf:      -30,  // esnaf "kötü müşteri" manuel bayrak koydu
};

const MIN_SKOR = 0;
const MAX_SKOR = 100;

/**
 * Müşterinin skorunu kaydet / güncelle
 * @param {string} telefon — normalize edilmiş rakam string (10-12 hane)
 * @param {string} olayTipi — ETKILER key'i
 * @param {number} isletmeId — ilgili işletme (log için)
 * @param {string} extraDetay — opsiyonel açıklama
 */
async function logla(telefon, olayTipi, isletmeId = null, extraDetay = '') {
  if (!ETKILER[olayTipi]) {
    console.warn(`⚠️ guvenlikSkor.logla: bilinmeyen olay tipi '${olayTipi}'`);
    return null;
  }
  const delta = ETKILER[olayTipi];
  const telefonTemiz = String(telefon).replace(/[^\d]/g, '');
  if (!telefonTemiz) return null;

  try {
    // Mevcut skoru al (tüm işletmelerdeki kayıtları birleştir — cross-business)
    const result = await pool.query(
      `UPDATE musteriler 
       SET guven_skoru = GREATEST($2, LEAST($3, COALESCE(guven_skoru, 50) + $1))
       WHERE telefon = $4
       RETURNING id, guven_skoru`,
      [delta, MIN_SKOR, MAX_SKOR, telefonTemiz]
    );

    // Log at
    try {
      await pool.query(
        `INSERT INTO guvenlik_olay_log (isletme_id, tip, detay, telefon) VALUES ($1, $2, $3, $4)`,
        [isletmeId, `skor_${olayTipi}`, `delta=${delta} ${extraDetay}`, telefonTemiz]
      );
    } catch {}

    return result.rows[0]?.guven_skoru ?? null;
  } catch (e) {
    console.error('guvenlikSkor.logla hatası:', e.message);
    return null;
  }
}

/**
 * Müşterinin güncel skorunu getir
 */
async function skorAl(telefon) {
  const telefonTemiz = String(telefon).replace(/[^\d]/g, '');
  try {
    const row = (await pool.query(
      `SELECT MAX(COALESCE(guven_skoru, 50)) as skor FROM musteriler WHERE telefon=$1`,
      [telefonTemiz]
    )).rows[0];
    return row?.skor ?? 50;
  } catch {
    return 50;
  }
}

/**
 * Skor bazlı kategori
 */
function kategori(skor) {
  if (skor >= 80) return 'vip';
  if (skor >= 30) return 'normal';
  if (skor >= 10) return 'supheli';
  return 'kotu';
}

/**
 * Bir işletme için güvenlik istatistiği (son 30 gün)
 */
async function istatistik(isletmeId, gunSayisi = 30) {
  try {
    const rows = (await pool.query(
      `SELECT tip, COUNT(*) as sayi FROM guvenlik_olay_log 
       WHERE isletme_id=$1 AND zaman >= NOW() - INTERVAL '${gunSayisi} days'
       GROUP BY tip ORDER BY sayi DESC`,
      [isletmeId]
    )).rows;
    return rows;
  } catch {
    return [];
  }
}

module.exports = { logla, skorAl, kategori, istatistik, ETKILER };
