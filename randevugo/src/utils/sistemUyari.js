// Sistem Uyarıları (2026-10-15): sorunlar Render logunda kaybolmasın, panelde görünsün.
// Saha olayı: bir işletmenin botu gece sustu, ancak loglar elle okunarak bulundu.
// Aynı anahtarla açık bir uyarı varsa yeni satır açılmaz: adet artar, son zaman ve detay güncellenir.
// Kendiliğinden düzelen durumlar (ör. WhatsApp yeniden bağlandı) coz() ile kapanır.
const pool = require('../config/db');

async function uyar({ tip, anahtar, baslik, detay = null, seviye = 'uyari', isletmeId = null }) {
  try {
    await pool.query(
      `INSERT INTO sistem_uyarilari (anahtar, tip, seviye, isletme_id, baslik, detay)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (anahtar) WHERE cozuldu = false
       DO UPDATE SET adet = sistem_uyarilari.adet + 1, son_zaman = NOW(), detay = EXCLUDED.detay,
         baslik = EXCLUDED.baslik, seviye = EXCLUDED.seviye`,
      [String(anahtar).slice(0, 200), tip, seviye, isletmeId, String(baslik).slice(0, 300), detay == null ? null : String(detay).slice(0, 2000)]
    );
  } catch (e) { /* uyarı yazılamazsa asıl işi bozmasın (tablo yoksa vb.) */ }
}

async function coz(anahtar, cozen = 'sistem') {
  try {
    await pool.query(`UPDATE sistem_uyarilari SET cozuldu = true, cozulme_zamani = NOW(), cozen = $2
      WHERE anahtar = $1 AND cozuldu = false`, [String(anahtar).slice(0, 200), cozen]);
  } catch (e) { /* yok say */ }
}

module.exports = { uyar, coz };
