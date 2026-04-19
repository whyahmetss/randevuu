const cron = require('node-cron');
const pool = require('../config/db');
const siragoImza = require('../utils/siragoImza');

class YorumAvcisiService {

  baslat() {
    // Her 5 dakikada bir kontrol et
    cron.schedule('*/5 * * * *', async () => {
      await this.yorumTalepleriniGonder();
    });
    console.log('⭐ Yorum Avcısı servisi başlatıldı (her 5 dk)');
  }

  // Randevu tamamlandığında çağrılır — yorum talebi zamanlayıcı oluştur
  async talepOlustur(isletmeId, randevuId, musteriId, telefon) {
    try {
      const isletme = (await pool.query(
        'SELECT yorum_avcisi_aktif, yorum_gecikme_dk FROM isletmeler WHERE id=$1',
        [isletmeId]
      )).rows[0];

      if (!isletme?.yorum_avcisi_aktif) return;

      // Aynı müşteriye bu ay daha önce gönderilmiş mi? (spam önleme)
      const buAy = new Date().toISOString().slice(0, 7);
      const mevcut = (await pool.query(
        `SELECT id FROM yorum_talepleri WHERE isletme_id=$1 AND musteri_id=$2 
         AND TO_CHAR(olusturma_tarihi, 'YYYY-MM') = $3`,
        [isletmeId, musteriId, buAy]
      )).rows[0];

      if (mevcut) return; // Bu ay zaten gönderilmiş

      const gecikme = isletme.yorum_gecikme_dk || 60;
      const gonderimZamani = new Date(Date.now() + gecikme * 60 * 1000);

      await pool.query(
        `INSERT INTO yorum_talepleri (isletme_id, randevu_id, musteri_id, telefon, gonderim_zamani)
         VALUES ($1, $2, $3, $4, $5)`,
        [isletmeId, randevuId, musteriId, telefon, gonderimZamani]
      );

      console.log(`⭐ Yorum talebi oluşturuldu: müşteri ${musteriId}, gönderim: ${gonderimZamani.toLocaleTimeString('tr-TR')}`);
    } catch (e) {
      console.error('❌ Yorum talebi oluşturma hatası:', e.message);
    }
  }

  // Cron ile çağrılır — gönderim zamanı gelen talepleri gönder
  async yorumTalepleriniGonder() {
    try {
      const talepler = (await pool.query(`
        SELECT yt.*, m.isim as musteri_isim, i.isim as isletme_isim, 
               i.google_maps_link, i.yorum_mesaj_sablonu, i.telegram_token
        FROM yorum_talepleri yt
        JOIN musteriler m ON yt.musteri_id = m.id
        JOIN isletmeler i ON yt.isletme_id = i.id
        WHERE yt.durum = 'bekliyor' AND yt.gonderim_zamani <= NOW()
          AND i.paket IN ('profesyonel', 'kurumsal', 'premium')
      `)).rows;

      for (const t of talepler) {
        if (!t.google_maps_link) {
          await pool.query("UPDATE yorum_talepleri SET durum='link_yok' WHERE id=$1", [t.id]);
          continue;
        }

        // Mesaj oluştur
        let mesaj = t.yorum_mesaj_sablonu || 
          `Merhaba {musteri_adi}! 😊\n\n{isletme_adi}'deki deneyiminiz nasıldı?\n\nBizi Google'da değerlendirirseniz çok mutlu oluruz ⭐\n{google_maps_link}\n\nTeşekkürler, iyi günler! 🙏`;
        
        mesaj = mesaj
          .replace(/{musteri_adi}/g, t.musteri_isim || '')
          .replace(/{isletme_adi}/g, t.isletme_isim || '')
          .replace(/{google_maps_link}/g, t.google_maps_link || '');

        const mesajWithSignature = siragoImza.imzaEkle(mesaj, { imza_gizle: !t.paket || t.paket === 'baslangic' ? false : null, ...t });

        let durum = 'gonderildi';
        try {
          const isTelegram = t.telefon && t.telefon.startsWith('tg:');
          if (isTelegram && t.telegram_token) {
            const chatId = await this.telegramChatIdBul(t.telefon, t.isletme_id);
            if (chatId) {
              const TelegramBot = require('node-telegram-bot-api');
              const bot = new TelegramBot(t.telegram_token);
              await bot.sendMessage(chatId, mesajWithSignature);
            } else { durum = 'baglanti_yok'; }
          } else if (!isTelegram) {
            // WhatsApp Web (Baileys)
            const whatsappWeb = require('./whatsappWeb');
            const waDurum = whatsappWeb.getDurum(t.isletme_id);
            if (waDurum?.durum === 'bagli') {
              await whatsappWeb.mesajGonder(t.isletme_id, t.telefon, mesajWithSignature);
            } else { durum = 'baglanti_yok'; }
          }
        } catch (e) {
          durum = 'hata';
          console.error(`Yorum mesajı gönderim hatası: ${e.message}`);
        }

        await pool.query(
          "UPDATE yorum_talepleri SET durum=$1, gonderim_tarihi=NOW() WHERE id=$2",
          [durum, t.id]
        );
        if (durum === 'gonderildi') {
          console.log(`⭐ Yorum talebi gönderildi: ${t.musteri_isim} → ${t.isletme_isim}`);
        }
      }
    } catch (e) {
      console.error('❌ Yorum talepleri gönderim hatası:', e.message);
    }
  }

  async telegramChatIdBul(telefon, isletmeId) {
    try {
      const bd = await pool.query("SELECT chat_id FROM bot_durum WHERE musteri_telefon=$1 AND isletme_id=$2", [telefon, isletmeId]);
      return bd.rows[0]?.chat_id || null;
    } catch (e) { return null; }
  }
}

module.exports = new YorumAvcisiService();
