const pool = require('../config/db');

class SadakatPuanService {

  // Randevu tamamlandığında puan ekle
  async puanEkle(isletmeId, musteriId, randevuId) {
    try {
      const isletme = (await pool.query(
        'SELECT sadakat_aktif, puan_oran_tl, puan_oran_puan, odul_esik, odul_hizmet_id FROM isletmeler WHERE id=$1',
        [isletmeId]
      )).rows[0];

      if (!isletme?.sadakat_aktif) return null;

      // Hizmet fiyatını al
      const randevu = (await pool.query(
        `SELECT r.hizmet_id, h.fiyat, h.isim as hizmet_isim FROM randevular r
         LEFT JOIN hizmetler h ON r.hizmet_id = h.id WHERE r.id = $1`,
        [randevuId]
      )).rows[0];

      if (!randevu?.fiyat || parseFloat(randevu.fiyat) <= 0) return null;

      const oranTl = isletme.puan_oran_tl || 1;
      const oranPuan = isletme.puan_oran_puan || 1;
      const kazanilanPuan = Math.floor(parseFloat(randevu.fiyat) / oranTl * oranPuan);

      if (kazanilanPuan <= 0) return null;

      // Daha önce bu randevu için puan verilmiş mi?
      const mevcut = (await pool.query(
        'SELECT id FROM puan_hareketleri WHERE randevu_id=$1 AND tip=$2',
        [randevuId, 'kazanc']
      )).rows[0];
      if (mevcut) return null;

      // Puan ekle
      await pool.query(
        'INSERT INTO puan_hareketleri (isletme_id, musteri_id, randevu_id, tip, puan, aciklama) VALUES ($1, $2, $3, $4, $5, $6)',
        [isletmeId, musteriId, randevuId, 'kazanc', kazanilanPuan, `${randevu.hizmet_isim || 'Hizmet'} (${randevu.fiyat}₺)`]
      );

      // Müşteri bakiyesini güncelle
      await pool.query(
        'UPDATE musteriler SET puan_bakiye = puan_bakiye + $1, toplam_kazanilan_puan = toplam_kazanilan_puan + $1 WHERE id = $2',
        [kazanilanPuan, musteriId]
      );

      console.log(`🎯 Sadakat puanı: +${kazanilanPuan} puan → müşteri ${musteriId}`);
      return kazanilanPuan;
    } catch (e) {
      console.error('❌ Puan ekleme hatası:', e.message);
      return null;
    }
  }

  // Puan harca (ödül kullan)
  async puanHarca(isletmeId, musteriId, puan, aciklama) {
    try {
      const musteri = (await pool.query('SELECT puan_bakiye FROM musteriler WHERE id=$1 AND isletme_id=$2', [musteriId, isletmeId])).rows[0];
      if (!musteri || musteri.puan_bakiye < puan) return { hata: 'Yetersiz puan' };

      await pool.query(
        'INSERT INTO puan_hareketleri (isletme_id, musteri_id, tip, puan, aciklama) VALUES ($1, $2, $3, $4, $5)',
        [isletmeId, musteriId, 'harcama', -puan, aciklama || 'Ödül kullanımı']
      );

      await pool.query(
        'UPDATE musteriler SET puan_bakiye = puan_bakiye - $1, toplam_harcanan_puan = toplam_harcanan_puan + $1 WHERE id = $2',
        [puan, musteriId]
      );

      return { basarili: true };
    } catch (e) {
      return { hata: e.message };
    }
  }

  // Müşterinin puan bakiyesini sorgula (bot için)
  async puanSorgula(isletmeId, telefon) {
    try {
      const musteri = (await pool.query(
        'SELECT puan_bakiye, toplam_kazanilan_puan FROM musteriler WHERE telefon=$1 AND isletme_id=$2',
        [telefon, isletmeId]
      )).rows[0];

      const isletme = (await pool.query(
        'SELECT sadakat_aktif, odul_esik FROM isletmeler WHERE id=$1',
        [isletmeId]
      )).rows[0];

      if (!isletme?.sadakat_aktif) return null;

      return {
        bakiye: musteri?.puan_bakiye || 0,
        toplam: musteri?.toplam_kazanilan_puan || 0,
        odul_esik: isletme.odul_esik || 1000,
        kalan: Math.max(0, (isletme.odul_esik || 1000) - (musteri?.puan_bakiye || 0))
      };
    } catch (e) {
      return null;
    }
  }

  // Otomatik bildirim mesajı oluştur
  puanBildirimMesaji(kazanilanPuan, toplamBakiye, odulEsik) {
    let mesaj = `🎯 Bu işlemden *+${kazanilanPuan} puan* kazandınız!\n⭐ Toplam bakiye: *${toplamBakiye} puan*`;
    const kalan = odulEsik - toplamBakiye;
    if (kalan > 0) {
      mesaj += `\n🎁 Ödüle ${kalan} puan kaldı!`;
    } else {
      mesaj += `\n🎉 Tebrikler! Ödül hakkınız var! Bir sonraki randevunuzda kullanabilirsiniz.`;
    }
    return mesaj;
  }
}

module.exports = new SadakatPuanService();
