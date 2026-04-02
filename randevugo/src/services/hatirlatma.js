const cron = require('node-cron');
const pool = require('../config/db');
const randevuService = require('./randevu');

class HatirlatmaService {
  baslat() {
    // Her 5 dakikada bir kontrol et
    cron.schedule('*/5 * * * *', async () => {
      await this.saatlikHatirlatma();
      await this.gunlukHatirlatma();
      await this.memnuniyetSorusu();
      await this.beklemeListesiBildirim();
    });

    console.log('⏰ Hatırlatma servisi başlatıldı (her 5 dk)');
  }

  // 1 saat önce hatırlatma
  async saatlikHatirlatma() {
    try {
      const randevular = await randevuService.hatirlatmaRandevulari();
      for (const r of randevular) {
        const saat = String(r.saat).substring(0, 5);
        const mesaj = `⏰ *Hatırlatma*\n\n📅 Bugün saat *${saat}*'de randevunuz var!\n\n🏥 ${r.isletme_isim}\n${r.hizmet_isim ? '💊 ' + r.hizmet_isim + '\n' : ''}📍 ${r.isletme_adres || ''}\n\nSizi bekliyoruz! 😊`;
        await this.mesajGonder(r, mesaj);
        await randevuService.hatirlatmaIsaretle(r.id);
        console.log(`⏰ 1 saat hatırlatma: ${r.musteri_isim} - ${saat}`);
      }
    } catch (e) { console.error('❌ Saatlik hatırlatma hatası:', e.message); }
  }

  // 1 gün önce hatırlatma
  async gunlukHatirlatma() {
    try {
      const result = await pool.query(`
        SELECT r.*, m.telefon as musteri_telefon, m.isim as musteri_isim,
               h.isim as hizmet_isim, i.isim as isletme_isim, i.adres as isletme_adres,
               i.telegram_token, i.id as isletme_id
        FROM randevular r
        JOIN musteriler m ON r.musteri_id = m.id
        LEFT JOIN hizmetler h ON r.hizmet_id = h.id
        JOIN isletmeler i ON r.isletme_id = i.id
        WHERE r.durum = 'onaylandi'
          AND r.tarih = CURRENT_DATE + INTERVAL '1 day'
          AND r.hatirlatma_gonderildi = false
          AND EXTRACT(HOUR FROM NOW()) BETWEEN 9 AND 21
      `);
      for (const r of result.rows) {
        const tarih = new Date(r.tarih);
        const gun = ['Pazar','Pazartesi','Salı','Çarşamba','Perşembe','Cuma','Cumartesi'][tarih.getDay()];
        const saat = String(r.saat).substring(0, 5);
        const mesaj = `📅 *Yarınki Randevunuz*\n\n🏥 ${r.isletme_isim}\n${r.hizmet_isim ? '💊 ' + r.hizmet_isim + '\n' : ''}📅 Yarın (${gun}) saat ${saat}\n\nSizi bekliyoruz! 😊`;
        await this.mesajGonder(r, mesaj);
        console.log(`📅 1 gün hatırlatma: ${r.musteri_isim} - yarın ${saat}`);
      }
    } catch (e) { console.error('❌ Günlük hatırlatma hatası:', e.message); }
  }

  // Memnuniyet sorusu - randevu bittikten sonra
  async memnuniyetSorusu() {
    try {
      const result = await pool.query(`
        SELECT r.*, m.telefon as musteri_telefon, m.isim as musteri_isim,
               h.isim as hizmet_isim, h.sure_dk, i.isim as isletme_isim,
               i.telegram_token, i.id as isletme_id
        FROM randevular r
        JOIN musteriler m ON r.musteri_id = m.id
        LEFT JOIN hizmetler h ON r.hizmet_id = h.id
        JOIN isletmeler i ON r.isletme_id = i.id
        WHERE r.durum = 'onaylandi'
          AND r.memnuniyet_soruldu = false
          AND r.tarih = CURRENT_DATE
          AND (r.saat + (COALESCE(h.sure_dk, 30) || ' minutes')::interval) < NOW()::time
      `);
      for (const r of result.rows) {
        const mesaj = `⭐ *Hizmetimizi değerlendirin!*\n\n${r.hizmet_isim ? r.hizmet_isim + ' hizmetimizden' : 'Randevunuzdan'} memnun kaldınız mı?\n\nPuanınız bizim için çok değerli:`;
        await this.memnuniyetMesajGonder(r, mesaj);
        await pool.query('UPDATE randevular SET memnuniyet_soruldu = true WHERE id = $1', [r.id]);
        console.log(`⭐ Memnuniyet sorusu: ${r.musteri_isim}`);
      }
    } catch (e) { console.error('❌ Memnuniyet sorusu hatası:', e.message); }
  }

  // Bekleme listesi - iptal olunca bildir
  async beklemeListesiBildirim() {
    try {
      const bekleyenler = await pool.query(`
        SELECT bl.*, i.isim as isletme_isim, i.telegram_token, h.isim as hizmet_isim
        FROM bekleme_listesi bl
        JOIN isletmeler i ON bl.isletme_id = i.id
        LEFT JOIN hizmetler h ON bl.hizmet_id = h.id
        WHERE bl.durum = 'bekliyor' AND bl.istenen_tarih >= CURRENT_DATE
      `);
      for (const b of bekleyenler.rows) {
        const saatler = await randevuService.musaitSaatleriGetir(b.isletme_id, b.istenen_tarih.toISOString().split('T')[0]);
        if (saatler.length > 0) {
          const mesaj = `🔔 *Müjde!*\n\n📅 *${this.tarihFormat(b.istenen_tarih)}* tarihinde yer açıldı!\n${b.hizmet_isim ? '💊 ' + b.hizmet_isim + '\n' : ''}\nHemen randevu almak ister misiniz?`;
          // Telegram üzerinden bildirim
          if (b.telegram_token) {
            try {
              const TelegramBot = require('node-telegram-bot-api');
              const chatId = await this.telegramChatIdBul(b.musteri_telefon, b.isletme_id);
              if (chatId) {
                const bot = new TelegramBot(b.telegram_token);
                await bot.sendMessage(chatId, mesaj, {
                  parse_mode: 'Markdown',
                  reply_markup: { inline_keyboard: [
                    [{ text: '📅 Randevu Al', callback_data: '1' }],
                    [{ text: '🏠 Ana Menü', callback_data: 'ana_menu' }]
                  ]}
                });
              }
            } catch (e) { /* skip */ }
          }
          await pool.query('UPDATE bekleme_listesi SET durum = $1 WHERE id = $2', ['bildirildi', b.id]);
          console.log(`🔔 Bekleme listesi bildirim: ${b.musteri_telefon}`);
        }
      }
    } catch (e) { console.error('❌ Bekleme listesi hatası:', e.message); }
  }

  // Telegram veya WP üzerinden mesaj gönder
  async mesajGonder(randevu, mesaj) {
    const isTelegram = randevu.musteri_telefon && randevu.musteri_telefon.startsWith('tg:');

    try {
      if (isTelegram && randevu.telegram_token) {
        // Telegram kullanıcısı → chat_id ile gönder
        const chatId = await this.telegramChatIdBul(randevu.musteri_telefon, randevu.isletme_id);
        if (chatId) {
          const TelegramBot = require('node-telegram-bot-api');
          const bot = new TelegramBot(randevu.telegram_token);
          await bot.sendMessage(chatId, mesaj, {
            parse_mode: 'Markdown',
            reply_markup: { inline_keyboard: [[{ text: '🏠 Ana Menü', callback_data: 'ana_menu' }]] }
          });
          return;
        }
      }

      if (!isTelegram) {
        // WhatsApp kullanıcısı → telefon numarası ile gönder
        const whatsappService = require('./whatsapp');
        await whatsappService.hatirlatmaGonder(randevu.musteri_telefon, {
          tarih: new Date(randevu.tarih).toLocaleDateString('tr-TR'),
          saat: randevu.saat,
          hizmet: randevu.hizmet_isim || 'Randevu',
          isletme_isim: randevu.isletme_isim
        });
      }
    } catch (e) { console.error('Hatırlatma gönderim hatası:', e.message); }
  }

  // Memnuniyet mesajı - yıldız butonlarıyla
  async memnuniyetMesajGonder(randevu, mesaj) {
    const isTelegram = randevu.musteri_telefon && randevu.musteri_telefon.startsWith('tg:');

    try {
      if (isTelegram && randevu.telegram_token) {
        const chatId = await this.telegramChatIdBul(randevu.musteri_telefon, randevu.isletme_id);
        if (chatId) {
          const TelegramBot = require('node-telegram-bot-api');
          const bot = new TelegramBot(randevu.telegram_token);
          await bot.sendMessage(chatId, mesaj, {
            parse_mode: 'Markdown',
            reply_markup: { inline_keyboard: [
              [
                { text: '1⭐', callback_data: `puan_1_${randevu.id}` },
                { text: '2⭐', callback_data: `puan_2_${randevu.id}` },
                { text: '3⭐', callback_data: `puan_3_${randevu.id}` },
                { text: '4⭐', callback_data: `puan_4_${randevu.id}` },
                { text: '5⭐', callback_data: `puan_5_${randevu.id}` }
              ]
            ]}
          });
          return;
        }
      }
    } catch (e) { console.error('Memnuniyet mesaj hatası:', e.message); }
  }

  // bot_durum tablosundan Telegram chat_id bul
  async telegramChatIdBul(telefon, isletmeId) {
    try {
      const bd = await pool.query(
        "SELECT chat_id FROM bot_durum WHERE musteri_telefon=$1 AND isletme_id=$2",
        [telefon, isletmeId]
      );
      return bd.rows[0]?.chat_id || null;
    } catch (e) { return null; }
  }

  tarihFormat(tarih) {
    const d = new Date(tarih);
    const gunler = ['Pazar','Pazartesi','Salı','Çarşamba','Perşembe','Cuma','Cumartesi'];
    const aylar = ['Ocak','Şubat','Mart','Nisan','Mayıs','Haziran','Temmuz','Ağustos','Eylül','Ekim','Kasım','Aralık'];
    return `${d.getDate()} ${aylar[d.getMonth()]} ${gunler[d.getDay()]}`;
  }
}

module.exports = new HatirlatmaService();
