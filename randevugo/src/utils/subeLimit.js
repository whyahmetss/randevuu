// Şube kötüye kullanımına karşı (kullanıcı kararı 2026-10-08): şubeler merkezin paketini paylaşır,
// bu yüzden şube sayısı merkezin paketindeki sube_limit ile sınırlı. Merkez = grubun en küçük id'li işletmesi.
const pool = require('../config/db');
const { paketGetir } = require('../config/paketler');

async function grupLimit(grupId) {
  const merkez = (await pool.query(
    'SELECT id, paket, paket_bitis_tarihi, deneme_bitis_tarihi FROM isletmeler WHERE grup_id=$1 ORDER BY id LIMIT 1', [grupId]
  )).rows[0];
  if (!merkez) return null;
  const paket = await paketGetir(merkez.paket);
  const limit = paket.sube_yonetimi ? Math.max(1, parseInt(paket.sube_limit) || 1) : 1;
  // Aktif şubeler (merkez dahil), açılış sırasıyla
  const aktifler = (await pool.query(
    'SELECT id FROM isletmeler WHERE grup_id=$1 AND aktif=true ORDER BY id', [grupId]
  )).rows.map(r => r.id);
  return { merkez, paket, limit, aktifler };
}

// Bu işletme, paketin izin verdiği şubeler içinde mi? (Paket düşürülünce fazla şubeler kapanır.)
async function subeIzinli(isletmeId, grupId) {
  const g = await grupLimit(grupId);
  if (!g || g.merkez.id === isletmeId) return true;
  const sira = g.aktifler.indexOf(isletmeId);
  return sira === -1 || sira < g.limit;
}

module.exports = { grupLimit, subeIzinli };
