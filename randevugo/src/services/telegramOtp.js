// ═══════════════════════════════════════════════════
// 🔐 TELEGRAM OTP SERVİSİ
// Booking sayfasında müşteri OTP kanalı olarak Telegram seçerse kullanılır.
// Mevcut `telegram.js` bot instance'larını paylaşır (ayrıca polling başlatmaz).
// ═══════════════════════════════════════════════════
const pool = require('../config/db');
const telegramService = require('./telegram');

class TelegramOtpService {
  // İşletmenin TG bot'u aktif mi? (telegram_token var ve polling başlamış)
  async aktifMi(isletmeId) {
    try {
      const bot = telegramService.botlar?.[isletmeId];
      if (bot) return true;
      // Fallback: DB'de token var ama polling henüz başlamamış olabilir (cold start)
      const row = (await pool.query(
        'SELECT telegram_token FROM isletmeler WHERE id=$1 AND aktif=true',
        [isletmeId]
      )).rows[0];
      return !!(row?.telegram_token);
    } catch (e) {
      return false;
    }
  }

  // İşletmenin bot username'i (t.me linki için)
  async botUsername(isletmeId) {
    try {
      const bot = telegramService.botlar?.[isletmeId];
      if (bot?._username) return bot._username;

      // Cold start: DB'den token al, bir kereliğine getMe() çağır
      const row = (await pool.query(
        'SELECT telegram_token FROM isletmeler WHERE id=$1 AND aktif=true',
        [isletmeId]
      )).rows[0];
      if (!row?.telegram_token) return null;

      const TelegramBot = require('node-telegram-bot-api');
      const tmp = new TelegramBot(row.telegram_token, { polling: false });
      const me = await tmp.getMe();
      return me?.username || null;
    } catch (e) {
      console.error('❌ TG bot username alınamadı:', e.message);
      return null;
    }
  }

  // Müşterinin TG chat_id'si kayıtlı mı?
  // Booking polling akışı:
  //   1. Müşteri booking'de telefon + TG seçer
  //   2. BE t.me/<bot>?start=link_<tel> linkini döner, FE QR + buton gösterir
  //   3. Müşteri /start link_XXX'e basar → telegram.js start payload handler bot_durum'a eşleştirmeyi kaydeder
  //   4. FE her 2sn chatIdBul() sorgusu atar — dolduğu an OTP tetiklenir
  async chatIdBul(isletmeId, musteriTelefon) {
    try {
      const telefonTemiz = String(musteriTelefon).replace(/[^\d]/g, '');
      const row = (await pool.query(`
        SELECT chat_id
        FROM bot_durum
        WHERE isletme_id = $1
          AND musteri_telefon = $2
          AND chat_id IS NOT NULL
        ORDER BY id DESC
        LIMIT 1
      `, [isletmeId, telefonTemiz])).rows[0];
      return row?.chat_id || null;
    } catch (e) {
      console.error('❌ TG chat_id bulunamadı:', e.message);
      return null;
    }
  }

  // Müşteri /start link_<tel> dediğinde bot_durum'a yazmak için — telegram.js'te handler ekleriz.
  // Burada direkt yazma yardımcısı (unique constraint olmayabilir → manuel upsert).
  async eslestirmeKaydet(isletmeId, musteriTelefon, chatId) {
    try {
      const telefonTemiz = String(musteriTelefon).replace(/[^\d]/g, '');
      const mevcut = (await pool.query(
        'SELECT id FROM bot_durum WHERE musteri_telefon=$1 AND isletme_id=$2',
        [telefonTemiz, isletmeId]
      )).rows[0];

      if (mevcut) {
        await pool.query(
          'UPDATE bot_durum SET chat_id=$1 WHERE id=$2',
          [String(chatId), mevcut.id]
        );
      } else {
        await pool.query(
          `INSERT INTO bot_durum (musteri_telefon, isletme_id, asama, chat_id)
           VALUES ($1, $2, 'ana_menu', $3)`,
          [telefonTemiz, isletmeId, String(chatId)]
        );
      }
      return true;
    } catch (e) {
      console.error('❌ TG eşleştirme kayıt hatası:', e.message);
      return false;
    }
  }

  // TG üzerinden mesaj gönder (OTP + diğer sistem mesajları)
  async mesajGonder(isletmeId, chatId, metin) {
    const bot = telegramService.botlar?.[isletmeId];
    if (!bot) {
      // Polling yok ise send-only bot açalım (tek seferlik)
      try {
        const row = (await pool.query(
          'SELECT telegram_token FROM isletmeler WHERE id=$1 AND aktif=true',
          [isletmeId]
        )).rows[0];
        if (!row?.telegram_token) {
          return { success: false, hata: 'Telegram token yok' };
        }
        const TelegramBot = require('node-telegram-bot-api');
        const tmp = new TelegramBot(row.telegram_token, { polling: false });
        await tmp.sendMessage(String(chatId), metin, { parse_mode: 'Markdown' });
        return { success: true, tekSefer: true };
      } catch (e) {
        return { success: false, hata: e.message };
      }
    }

    try {
      await bot.sendMessage(String(chatId), metin, { parse_mode: 'Markdown' });
      return { success: true };
    } catch (e) {
      // Markdown parse hatasında plain text dene
      try {
        await bot.sendMessage(String(chatId), metin.replace(/[*_~`]/g, ''));
        return { success: true, plain: true };
      } catch (e2) {
        console.error(`❌ TG mesaj hatası (isletme=${isletmeId}):`, e2.message);
        return { success: false, hata: e2.message };
      }
    }
  }
}

module.exports = new TelegramOtpService();
