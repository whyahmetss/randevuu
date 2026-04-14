/**
 * Google Yorum Feedback Service
 * Randevudan 2 saat sonra müşteriye WhatsApp/Telegram ile
 * "Bizi Google'da değerlendirin" mesajı atar.
 * Premium paket özelliği.
 */
const pool = require('../config/db');

class GoogleYorumService {
  constructor() {
    this.timer = null;
  }

  baslat() {
    // Her 15 dakikada bir kontrol et
    this.timer = setInterval(() => this.kontrolEt(), 15 * 60 * 1000);
    // İlk çalıştırma 1 dk sonra
    setTimeout(() => this.kontrolEt(), 60 * 1000);
    console.log('⭐ Google Yorum Feedback servisi başlatıldı');
  }

  async kontrolEt() {
    try {
      // Tamamlanmış randevuları bul: 2 saat geçmiş, henüz feedback gönderilmemiş, premium + aktif
      const randevular = (await pool.query(`
        SELECT r.id, r.musteri_id, r.isletme_id, r.tarih, r.saat,
               m.telefon as musteri_telefon, m.isim as musteri_isim,
               i.isim as isletme_isim, i.google_maps_url
        FROM randevular r
        JOIN isletmeler i ON i.id = r.isletme_id
        JOIN musteriler m ON m.id = r.musteri_id
        WHERE r.durum = 'tamamlandi'
          AND i.paket IN ('profesyonel', 'kurumsal', 'premium')
          AND i.google_yorum_aktif = true
          AND i.google_maps_url IS NOT NULL
          AND i.google_maps_url != ''
          AND (r.tarih + r.saat) <= (NOW() - INTERVAL '2 hours')
          AND NOT EXISTS (
            SELECT 1 FROM google_yorum_talepleri gyt
            WHERE gyt.randevu_id = r.id
          )
        ORDER BY r.tarih DESC
        LIMIT 20
      `)).rows;

      for (const r of randevular) {
        await this.feedbackGonder(r);
        // Rate limit
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    } catch (err) {
      console.error('⭐ Google Yorum kontrol hatası:', err.message);
    }
  }

  async feedbackGonder(randevu) {
    try {
      const tel = randevu.musteri_telefon;
      if (!tel) return;

      const mapsUrl = randevu.google_maps_url;
      const mesaj = `Merhaba${randevu.musteri_isim ? ' ' + randevu.musteri_isim.split(' ')[0] : ''} 😊\n\n` +
        `*${randevu.isletme_isim}*'den aldığınız hizmet nasıldı?\n\n` +
        `Bizi Google'da değerlendirirseniz çok mutlu oluruz! ⭐⭐⭐⭐⭐\n\n` +
        `👉 ${mapsUrl}\n\n` +
        `_Desteğiniz için teşekkürler! 🙏_`;

      // DB'ye kaydet
      await pool.query(
        'INSERT INTO google_yorum_talepleri (isletme_id, randevu_id, musteri_telefon, gonderim_zamani, gonderildi) VALUES ($1,$2,$3,NOW(),true)',
        [randevu.isletme_id, randevu.id, tel]
      );

      // WhatsApp üzerinden gönder
      try {
        const wpService = require('./whatsappWeb');
        const jid = `${tel.replace(/^\+/, '')}@s.whatsapp.net`;
        await wpService.mesajGonder(randevu.isletme_id, jid, mesaj);
        console.log(`⭐ Google yorum mesajı gönderildi: ${tel} (${randevu.isletme_isim})`);
      } catch (e) {
        // WhatsApp yoksa Telegram dene
        try {
          const telegramService = require('./telegram');
          const bot = telegramService.botlar[randevu.isletme_id];
          if (bot) {
            await bot.sendMessage(tel, mesaj, { parse_mode: 'Markdown' });
            console.log(`⭐ Google yorum mesajı TG ile gönderildi: ${tel}`);
          }
        } catch (e2) {}
      }
    } catch (err) {
      console.error(`⭐ Feedback gönderim hatası:`, err.message);
    }
  }
}

module.exports = new GoogleYorumService();
