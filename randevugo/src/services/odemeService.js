const cron = require('node-cron');
const pool = require('../config/db');
const PAKETLER = require('../config/paketler');

class OdemeService {
  async aylikOdemeleriOlustur() {
    const buAy = new Date().toISOString().slice(0, 7);
    console.log(`💰 Aylık ödeme kontrol: ${buAy}`);

    const isletmeler = (await pool.query(
      `SELECT * FROM isletmeler WHERE aktif = true`
    )).rows;

    let olusturulan = 0;
    for (const isletme of isletmeler) {
      const mevcut = (await pool.query(
        `SELECT id FROM odemeler WHERE isletme_id = $1 AND donem = $2`,
        [isletme.id, buAy]
      )).rows;

      if (mevcut.length === 0) {
        const paket = PAKETLER[isletme.paket] || PAKETLER.baslangic;
        await pool.query(
          `INSERT INTO odemeler (isletme_id, tutar, donem, durum) VALUES ($1, $2, $3, 'bekliyor')`,
          [isletme.id, paket.fiyat, buAy]
        );
        olusturulan++;
        console.log(`  ✅ ${isletme.isim} → ${paket.fiyat}₺ bekliyor`);
      }
    }

    if (olusturulan > 0) {
      console.log(`💰 ${olusturulan} işletme için ödeme kaydı oluşturuldu.`);
    } else {
      console.log(`💰 Tüm işletmeler zaten kayıtlı.`);
    }
  }

  baslat() {
    // Her ayın 1'i saat 09:00'da otomatik ödeme kaydı oluştur
    cron.schedule('0 9 1 * *', async () => {
      try {
        await this.aylikOdemeleriOlustur();
      } catch (error) {
        console.error('❌ Aylık ödeme oluşturma hatası:', error);
      }
    });

    // Sunucu başlarken bu ayın kayıtlarını kontrol et, eksik varsa oluştur
    setTimeout(() => {
      this.aylikOdemeleriOlustur().catch(err =>
        console.error('❌ Başlangıç ödeme kontrolü hatası:', err)
      );
    }, 3000);

    console.log('💰 Aylık ödeme servisi başlatıldı (her ayın 1\'i saat 09:00)');
  }
}

module.exports = new OdemeService();
