const cron = require('node-cron');
const pool = require('../config/db');
const { paketGetir } = require('../config/paketler');

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
        const paket = await paketGetir(isletme.paket);
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

  // Günlük paket bitiş kontrolü
  async paketBitisKontrol() {
    try {
      // 3 gün kala uyarı gönder
      const yakinda = (await pool.query(`
        SELECT i.id, i.isim, i.telefon, i.paket, i.paket_bitis_tarihi
        FROM isletmeler i
        WHERE i.aktif = true
          AND i.paket_bitis_tarihi IS NOT NULL
          AND i.paket_bitis_tarihi BETWEEN NOW() AND NOW() + INTERVAL '3 days'
          AND i.paket_bitis_tarihi > NOW()
      `)).rows;

      for (const isl of yakinda) {
        const gun = Math.ceil((new Date(isl.paket_bitis_tarihi) - Date.now()) / 86400000);
        const mesaj = `⚠️ *Paketiniz ${gun} gün sonra bitiyor!*\n\nSıraGO ${isl.paket || 'Başlangıç'} paketiniz yakında sona erecek. Kesintisiz hizmet için hemen yenileyin:\n\n👉 Panel → Paket → Öde\n\nYenileme yapmazsanız bot ve randevu sisteminiz duracaktır.`;
        try {
          const wpService = require('./whatsappWeb');
          if (isl.telefon) {
            const tel = isl.telefon.replace(/^\+/, '');
            const jid = `${tel}@s.whatsapp.net`;
            await wpService.mesajGonder(isl.id, jid, mesaj);
          }
        } catch (e) { /* WA gönderilemezse geç */ }
      }
      if (yakinda.length > 0) console.log(`⚠️ ${yakinda.length} işletmeye paket bitiş uyarısı gönderildi`);

      // Süresi dolanları pasife çek
      const bitenlerin = await pool.query(`
        UPDATE isletmeler SET aktif = false
        WHERE aktif = true
          AND paket_bitis_tarihi IS NOT NULL
          AND paket_bitis_tarihi < NOW()
        RETURNING id, isim
      `);
      if (bitenlerin.rowCount > 0) {
        console.log(`🔒 ${bitenlerin.rowCount} işletme paketi dolduğu için pasife alındı: ${bitenlerin.rows.map(r => r.isim).join(', ')}`);
      }
    } catch (err) {
      console.error('❌ Paket bitiş kontrol hatası:', err.message);
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

    // Her gün saat 10:00'da paket bitiş kontrolü
    cron.schedule('0 10 * * *', async () => {
      try {
        await this.paketBitisKontrol();
      } catch (error) {
        console.error('❌ Paket bitiş kontrol hatası:', error);
      }
    });

    // Sunucu başlarken bu ayın kayıtlarını kontrol et, eksik varsa oluştur
    setTimeout(() => {
      this.aylikOdemeleriOlustur().catch(err =>
        console.error('❌ Başlangıç ödeme kontrolü hatası:', err)
      );
    }, 3000);

    console.log('💰 Ödeme servisi başlatıldı (aylık ödeme + günlük paket bitiş kontrolü)');
  }
}

module.exports = new OdemeService();
