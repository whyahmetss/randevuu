const pool = require('../config/db');

class WinbackService {

  // Günlük cron ile çağrılır — kayıp müşterileri tespit et ve mesaj gönder
  async kayipMusterileriTara() {
    try {
      const isletmeler = (await pool.query(
        `SELECT id, isim, winback_gun_esik, winback_indirim, winback_mesaj_sablonu, telegram_token
         FROM isletmeler WHERE winback_aktif = true AND paket IN ('profesyonel', 'kurumsal', 'premium')`
      )).rows;

      for (const isletme of isletmeler) {
        await this.isletmeIcinTara(isletme);
      }
    } catch (e) {
      console.error('❌ Win-back tarama hatası:', e.message);
    }
  }

  async isletmeIcinTara(isletme) {
    const esik = isletme.winback_gun_esik || 45;
    try {
      // Son randevusu eşik gününden eski olan müşteriler
      const kayiplar = (await pool.query(`
        SELECT m.id, m.isim, m.telefon, MAX(r.tarih) as son_tarih,
          CURRENT_DATE - MAX(r.tarih)::date as gun_sayisi
        FROM musteriler m
        JOIN randevular r ON r.musteri_id = m.id AND r.isletme_id = $1 AND r.durum = 'tamamlandi'
        WHERE m.isletme_id = $1
        GROUP BY m.id, m.isim, m.telefon
        HAVING CURRENT_DATE - MAX(r.tarih)::date >= $2
      `, [isletme.id, esik])).rows;

      for (const m of kayiplar) {
        // Son 30 günde zaten winback mesajı gönderilmiş mi?
        const mevcut = (await pool.query(
          `SELECT id FROM winback_log WHERE isletme_id=$1 AND musteri_id=$2 
           AND gonderim_tarihi > NOW() - INTERVAL '30 days'`,
          [isletme.id, m.id]
        )).rows[0];

        if (mevcut) continue;

        await this.mesajGonder(isletme, m);
      }
    } catch (e) {
      console.error(`Win-back tarama hatası (${isletme.isim}):`, e.message);
    }
  }

  async mesajGonder(isletme, musteri) {
    const indirim = isletme.winback_indirim || 10;
    let mesaj = isletme.winback_mesaj_sablonu ||
      `Merhaba {musteri_adi}! 👋\nSizi özledik! Son ziyaretinizin üzerinden {gun_sayisi} gün geçti.\nBu hafta size özel %{indirim} indirim hazırladık! 🎉\nHemen randevu almak için yazın veya arayın.\n{isletme_adi} ❤️`;

    mesaj = mesaj
      .replace(/{musteri_adi}/g, musteri.isim || '')
      .replace(/{gun_sayisi}/g, musteri.gun_sayisi || '')
      .replace(/{indirim}/g, indirim)
      .replace(/{isletme_adi}/g, isletme.isim || '');

    let durum = 'gonderildi';
    try {
      const isTelegram = musteri.telefon?.startsWith('tg:');
      if (isTelegram && isletme.telegram_token) {
        const chatId = await this.telegramChatIdBul(musteri.telefon, isletme.id);
        if (chatId) {
          const TelegramBot = require('node-telegram-bot-api');
          const bot = new TelegramBot(isletme.telegram_token);
          await bot.sendMessage(chatId, mesaj);
        } else { durum = 'baglanti_yok'; }
      } else if (!isTelegram) {
        const whatsappWeb = require('./whatsappWeb');
        const waDurum = whatsappWeb.getDurum(isletme.id);
        if (waDurum?.durum === 'bagli') {
          await whatsappWeb.mesajGonder(isletme.id, musteri.telefon, mesaj);
        } else { durum = 'baglanti_yok'; }
      }
    } catch (e) {
      durum = 'hata';
      console.error(`Win-back mesaj hatası: ${e.message}`);
    }

    await pool.query(
      `INSERT INTO winback_log (isletme_id, musteri_id, telefon, son_randevu_tarihi, gun_sayisi, durum)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [isletme.id, musteri.id, musteri.telefon, musteri.son_tarih, musteri.gun_sayisi, durum]
    );

    if (durum === 'gonderildi') {
      console.log(`🔄 Win-back gönderildi: ${musteri.isim} (${musteri.gun_sayisi} gün) → ${isletme.isim}`);
    }
  }

  // Randevu oluşturulduğunda kurtarma takibi
  async kurtarmaKontrol(isletmeId, musteriId) {
    try {
      // Son 7 günde winback mesajı gönderilmiş ve kurtarılmamış kayıt var mı?
      const log = (await pool.query(
        `SELECT id FROM winback_log WHERE isletme_id=$1 AND musteri_id=$2 
         AND kurtarildi = false AND gonderim_tarihi > NOW() - INTERVAL '7 days'
         ORDER BY gonderim_tarihi DESC LIMIT 1`,
        [isletmeId, musteriId]
      )).rows[0];

      if (log) {
        await pool.query("UPDATE winback_log SET kurtarildi=true, kurtarma_tarihi=NOW() WHERE id=$1", [log.id]);
        console.log(`✅ Win-back kurtarıldı: müşteri ${musteriId}`);
      }
    } catch (e) { /* skip */ }
  }

  async telegramChatIdBul(telefon, isletmeId) {
    try {
      const bd = await pool.query("SELECT chat_id FROM bot_durum WHERE musteri_telefon=$1 AND isletme_id=$2", [telefon, isletmeId]);
      return bd.rows[0]?.chat_id || null;
    } catch (e) { return null; }
  }
}

module.exports = new WinbackService();
