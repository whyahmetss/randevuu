// KVKK "verilerimi silin" (2026-10-26): müşteri randevu sayfasından telefonunu doğrulatıp (OTP) kişisel verisinin
// silinmesini ister. Geçmiş randevular işletmenin kaydı olarak kalır ama kime ait olduğu anlaşılmaz: müşteri satırı
// anonimleşir, sohbet/bot/bekleme kayıtları silinir. Yaklaşan randevusu varsa önce onu iptal etmesi istenir.
// Telefon talepler tablosunda açık tutulmaz (özet), yalnız iz kaydı.
const crypto = require('crypto');
const pool = require('../config/db');
const { bugunTarih } = require('../utils/tarih');

const ozet = (tel) => crypto.createHash('sha256').update(`kvkk:${tel}`).digest('hex');

// Bu telefona ait veriyi tutan tablolar (yoksa atlanır: eski kurulum)
const SILINECEK = [
  ['bot_durum', 'musteri_telefon'],
  ['bekleme_listesi', 'musteri_telefon'],
  ['sohbet_gecmisi', 'musteri_telefon'],
  ['elle_yazisma', 'telefon'],
];

async function veriSil({ isletmeId = null, telefon }) {
  const tel = String(telefon || '');
  if (!tel) { const e = new Error('Telefon gerekli'); e.kod = 400; throw e; }
  const musteri = (await pool.query('SELECT id FROM musteriler WHERE telefon = $1', [tel])).rows[0];

  if (musteri) {
    const yaklasan = (await pool.query(
      `SELECT r.tarih, r.saat, i.isim FROM randevular r JOIN isletmeler i ON i.id = r.isletme_id
        WHERE r.musteri_id = $1 AND r.tarih >= $2 AND r.durum NOT IN ('iptal', 'gelmedi', 'tamamlandi') ORDER BY r.tarih, r.saat LIMIT 1`,
      [musteri.id, bugunTarih()])).rows[0];
    if (yaklasan) {
      await kaydet(isletmeId, tel, 'yaklasan_randevu');
      const e = new Error(`${yaklasan.isim} için yaklaşan bir randevunuz var. Verileriniz silinmeden önce o randevuyu iptal etmeniz gerekiyor.`);
      e.kod = 409; throw e;
    }
  }

  const silinen = {};
  for (const [tablo, kolon] of SILINECEK) {
    try { silinen[tablo] = (await pool.query(`DELETE FROM ${tablo} WHERE ${kolon} = $1`, [tel])).rowCount || 0; }
    catch (e) { if (e.code !== '42P01') throw e; }   // tablo yok
  }
  if (musteri) {
    await pool.query(
      `UPDATE musteriler SET isim = 'Silinmiş müşteri', telefon = $2, dogum_tarihi = NULL WHERE id = $1`,
      [musteri.id, `silindi-${musteri.id}`]);
    silinen.musteri = 1;
  }
  await kaydet(isletmeId, tel, 'silindi', silinen);
  return { silindi: true, kayitVardi: !!musteri };
}

async function kaydet(isletmeId, tel, durum, detay = null) {
  try {
    await pool.query('INSERT INTO kvkk_silme_talepleri (isletme_id, telefon_ozet, durum, detay) VALUES ($1, $2, $3, $4)',
      [isletmeId, ozet(tel), durum, detay ? JSON.stringify(detay) : null]);
  } catch (e) { if (e.code !== '42P01') throw e; }
}

module.exports = { veriSil };
