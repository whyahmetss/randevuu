const cron = require('node-cron');
const pool = require('../config/db');
const randevuService = require('./randevu');

class HatirlatmaService {
  baslat() {
    // Her 5 dakikada bir kontrol et
    cron.schedule('*/5 * * * *', async () => {
      await this.gunlukHatirlatma();      // 24 saat önce bilgi
      await this.teyitMesaji();           // 1 saat önce teyit
      await this.onBesDkHatirlatma();     // 15 dk önce son hatırlatma
      await this.postRandevuAnket();      // 1 saat sonra anket
      await this.rebookMesaji();          // 2 saat sonra rebook teklifi
      await this.sessizOnay();            // 3 saat sonra otomatik tamamla
      await this.beklemeListesiBildirim();
      await this.onayTimeoutKontrol();
      await this.kaporaTimeoutKontrol();
      // SMS Hatırlatma (NetGSM)
      try { const netgsm = require('./netgsm'); await netgsm.hatirlatmaSmsGonder(); } catch (e) { /* skip */ }
      // Yorum Avcısı
      try { const yorumAvcisi = require('./yorumAvcisi'); await yorumAvcisi.yorumTalepleriniGonder(); } catch (e) { /* skip */ }
    });

    console.log('⏰ Hatırlatma servisi başlatıldı — Hatırlatma Zinciri aktif (24h+1h+15dk, her 5 dk)');

    // Win-back: Günlük sabah 10:00'da kayıp müşterileri tara
    cron.schedule('0 10 * * *', async () => {
      try { const winback = require('./winback'); await winback.kayipMusterileriTara(); } catch (e) { /* skip */ }
    });
  }

  // ═══════════════════════════════════════════════════════
  // AŞAMA 1: Randevudan 1 saat önce — Teyit mesajı
  // Geliyorum ✅ / İptal Et ❌ seçenekli
  // ═══════════════════════════════════════════════════════
  async teyitMesaji() {
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
          AND r.teyit_gonderildi = false
          AND r.tarih = CURRENT_DATE
          AND r.saat BETWEEN NOW()::time AND (NOW() + INTERVAL '1 hour')::time
      `);
      for (const r of result.rows) {
        const saat = String(r.saat).substring(0, 5);
        const mesaj = `⏰ *Randevu Teyidi*\n\nMerhaba ${r.musteri_isim || ''}! Randevunuza *1 saat* kaldı.\n\n🏥 ${r.isletme_isim}\n${r.hizmet_isim ? '✂️ ' + r.hizmet_isim + '\n' : ''}🕐 Saat: ${saat}\n📍 ${r.isletme_adres || ''}\n\nGelebilecek misiniz?\n\n*1.* ✅ Geliyorum\n*2.* ❌ İptal Et`;
        await this.mesajGonder(r, mesaj);
        await pool.query('UPDATE randevular SET teyit_gonderildi = true, hatirlatma_gonderildi = true WHERE id = $1', [r.id]);
        console.log(`📩 Teyit mesajı gönderildi: ${r.musteri_isim} - ${saat}`);
      }
    } catch (e) { console.error('❌ Teyit mesajı hatası:', e.message); }
  }

  // 24 saat (1 gün) önce hatırlatma (bilgi amaçlı, teyit değil)
  async gunlukHatirlatma() {
    try {
      const result = await pool.query(`
        SELECT r.*, m.telefon as musteri_telefon, m.isim as musteri_isim,
               h.isim as hizmet_isim, i.isim as isletme_isim, i.adres as isletme_adres,
               i.telegram_token, i.id as isletme_id, i.hatirlatma_zinciri_aktif
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
        // Zincir kapalıysa 24h mesajı gönderme (sadece 1h teyit gider)
        if (r.hatirlatma_zinciri_aktif === false) continue;
        const tarih = new Date(r.tarih);
        const gun = ['Pazar','Pazartesi','Salı','Çarşamba','Perşembe','Cuma','Cumartesi'][tarih.getDay()];
        const saat = String(r.saat).substring(0, 5);
        const mesaj = `📅 *Yarınki Randevunuz*\n\nMerhaba ${r.musteri_isim || ''}! Yarın saat ${saat}'de randevunuz var.\n\n🏥 ${r.isletme_isim}\n${r.hizmet_isim ? '✂️ ' + r.hizmet_isim + '\n' : ''}📅 Yarın (${gun}) saat ${saat}\n📍 ${r.isletme_adres || ''}\n\nGörüşmek üzere! 😊`;
        await this.mesajGonder(r, mesaj);
        // hatirlatma_gonderildi true yaparak 24h mesajının tekrar gitmesini engelle
        await pool.query('UPDATE randevular SET hatirlatma_gonderildi = true WHERE id = $1', [r.id]);
        console.log(`📅 24h hatırlatma: ${r.musteri_isim} - yarın ${saat}`);
      }
    } catch (e) { console.error('❌ 24h hatırlatma hatası:', e.message); }
  }

  // 15 dakika önce son hatırlatma
  async onBesDkHatirlatma() {
    try {
      const result = await pool.query(`
        SELECT r.*, m.telefon as musteri_telefon, m.isim as musteri_isim,
               h.isim as hizmet_isim, i.isim as isletme_isim, i.adres as isletme_adres,
               i.telegram_token, i.id as isletme_id, i.hatirlatma_zinciri_aktif
        FROM randevular r
        JOIN musteriler m ON r.musteri_id = m.id
        LEFT JOIN hizmetler h ON r.hizmet_id = h.id
        JOIN isletmeler i ON r.isletme_id = i.id
        WHERE r.durum = 'onaylandi'
          AND r.teyit_gonderildi = true
          AND COALESCE(r.onbes_dk_gonderildi, false) = false
          AND r.tarih = CURRENT_DATE
          AND r.saat BETWEEN NOW()::time AND (NOW() + INTERVAL '15 minutes')::time
      `);
      for (const r of result.rows) {
        if (r.hatirlatma_zinciri_aktif === false) continue;
        const saat = String(r.saat).substring(0, 5);
        const mesaj = `⏰ *Randevunuza 15 dakika kaldı!*\n\nMerhaba ${r.musteri_isim || ''}!\n\n🏥 ${r.isletme_isim}\n${r.hizmet_isim ? '✂️ ' + r.hizmet_isim + '\n' : ''}🕐 Saat: ${saat}\n� ${r.isletme_adres || ''}\n\nYola çıktınız mı? 🚗`;
        await this.mesajGonder(r, mesaj);
        await pool.query('UPDATE randevular SET onbes_dk_gonderildi = true WHERE id = $1', [r.id]);
        console.log(`⏰ 15dk hatırlatma: ${r.musteri_isim} - ${saat}`);
      }
    } catch (e) { console.error('❌ 15dk hatırlatma hatası:', e.message); }
  }

  // ═══════════════════════════════════════════════════════
  // AŞAMA 3: Randevu bitişinden 1 saat sonra — Memnuniyet anketi
  // Müşteri puan verirse → otomatik tamamlandı
  // ═══════════════════════════════════════════════════════
  async postRandevuAnket() {
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
          AND r.anket_gonderildi = false
          AND r.tarih = CURRENT_DATE
          AND (r.saat + INTERVAL '1 hour' + (COALESCE(h.sure_dk, 30) || ' minutes')::interval) < NOW()::time
      `);
      for (const r of result.rows) {
        const mesaj = `⭐ *Hizmetimizi Değerlendirin!*\n\n${r.isletme_isim} ziyaretiniz nasıldı?\n${r.hizmet_isim ? '✂️ ' + r.hizmet_isim + '\n' : ''}\nPuanınız bizim için çok değerli:\n\n*1.* ⭐ (Kötü)\n*2.* ⭐⭐\n*3.* ⭐⭐⭐\n*4.* ⭐⭐⭐⭐\n*5.* ⭐⭐⭐⭐⭐ (Mükemmel)`;
        await this.mesajGonder(r, mesaj);
        await pool.query('UPDATE randevular SET anket_gonderildi = true, memnuniyet_soruldu = true WHERE id = $1', [r.id]);
        console.log(`⭐ Post-randevu anket: ${r.musteri_isim} - ${r.isletme_isim}`);
      }
    } catch (e) { console.error('❌ Post-randevu anket hatası:', e.message); }
  }

  // ═══════════════════════════════════════════════════════
  // SESSİZ ONAY: Randevu saatinden 3 saat geçmiş, usta dokunmamış,
  // müşteri cevap vermemiş → otomatik tamamlandı
  // (İşletme cirosu/istatistikleri doğru kalsın diye)
  // ═══════════════════════════════════════════════════════
  async sessizOnay() {
    try {
      const result = await pool.query(`
        SELECT r.id, r.saat, m.isim as musteri_isim, i.isim as isletme_isim
        FROM randevular r
        JOIN musteriler m ON r.musteri_id = m.id
        JOIN isletmeler i ON r.isletme_id = i.id
        WHERE r.durum = 'onaylandi'
          AND r.tarih = CURRENT_DATE
          AND (r.saat + INTERVAL '3 hours') < NOW()::time
      `);
      for (const r of result.rows) {
        await pool.query("UPDATE randevular SET durum = 'tamamlandi' WHERE id = $1", [r.id]);
        console.log(`🔇 Sessiz onay → tamamlandı: ${r.musteri_isim} (${r.isletme_isim}) - ${String(r.saat).substring(0,5)}`);
      }
    } catch (e) { console.error('❌ Sessiz onay hatası:', e.message); }
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

  // Telegram veya WP üzerinden mesaj gönder (Baileys öncelikli)
  async mesajGonder(randevu, mesaj) {
    const isTelegram = randevu.musteri_telefon && randevu.musteri_telefon.startsWith('tg:');

    try {
      if (isTelegram && randevu.telegram_token) {
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
        // Önce Baileys (WhatsApp Web) dene — bağlıysa direkt mesaj gönder
        try {
          const whatsappWeb = require('./whatsappWeb');
          const durum = whatsappWeb.getDurum(randevu.isletme_id);
          if (durum?.durum === 'bagli') {
            await whatsappWeb.mesajGonder(randevu.isletme_id, randevu.musteri_telefon, mesaj);
            return;
          }
        } catch (e) { /* Baileys bağlı değil, Twilio'ya düş */ }

        // Fallback: Twilio
        const whatsappService = require('./whatsapp');
        await whatsappService.mesajGonder(randevu.musteri_telefon, mesaj);
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

  // Manuel onay timeout kontrolü — süresi dolan onay_bekliyor randevularını iptal et
  async onayTimeoutKontrol() {
    try {
      const result = await pool.query(`
        SELECT r.*, m.telefon as musteri_telefon, m.isim as musteri_isim,
               h.isim as hizmet_isim, i.isim as isletme_isim, i.adres as isletme_adres,
               i.telegram_token, i.id as isletme_id, i.onay_timeout_dk
        FROM randevular r
        JOIN musteriler m ON r.musteri_id = m.id
        LEFT JOIN hizmetler h ON r.hizmet_id = h.id
        JOIN isletmeler i ON r.isletme_id = i.id
        WHERE r.durum = 'onay_bekliyor'
        AND r.olusturma_tarihi < NOW() - INTERVAL '1 minute' * COALESCE(i.onay_timeout_dk, 30)
      `);
      for (const r of result.rows) {
        await pool.query("UPDATE randevular SET durum='iptal' WHERE id=$1", [r.id]);
        const saat = String(r.saat).substring(0, 5);
        const mesaj = `⏳ *Randevunuz zaman aşımına uğradı*\n\n🏥 ${r.isletme_isim}\n${r.hizmet_isim ? '✂️ ' + r.hizmet_isim + '\n' : ''}📅 ${this.tarihFormat(r.tarih)} - 🕐 ${saat}\n\nİşletme belirtilen sürede onay vermediği için randevunuz iptal edildi.\n\n📅 Yeni randevu için *1* yazın.`;
        await this.mesajGonder(r, mesaj);
        console.log(`⏳ Onay timeout: ${r.musteri_isim} - ${r.isletme_isim} - ${saat}`);
      }
    } catch (e) { console.error('❌ Onay timeout hatası:', e.message); }
  }

  // Kapora timeout — 5 dakika içinde ödeme yapılmazsa randevuyu iptal et
  async kaporaTimeoutKontrol() {
    try {
      const result = await pool.query(`
        SELECT r.*, m.telefon as musteri_telefon, m.isim as musteri_isim,
               h.isim as hizmet_isim, i.isim as isletme_isim,
               i.telegram_token, i.id as isletme_id,
               r.kapora_shopier_urun_id
        FROM randevular r
        JOIN musteriler m ON r.musteri_id = m.id
        LEFT JOIN hizmetler h ON r.hizmet_id = h.id
        JOIN isletmeler i ON r.isletme_id = i.id
        WHERE r.durum = 'kapora_bekliyor'
        AND r.olusturma_tarihi < NOW() - INTERVAL '5 minutes'
      `);
      for (const r of result.rows) {
        await pool.query("UPDATE randevular SET durum='iptal', kapora_durumu='iptal' WHERE id=$1", [r.id]);
        const saat = String(r.saat).substring(0, 5);
        const mesaj = `⏳ *Kapora süresi doldu*\n\n🏥 ${r.isletme_isim}\n${r.hizmet_isim ? '✂️ ' + r.hizmet_isim + '\n' : ''}📅 ${this.tarihFormat(r.tarih)} - 🕐 ${saat}\n\n💳 Kapora ödemesi 5 dakika içinde tamamlanmadığı için randevunuz iptal edildi.\n\n📅 Yeni randevu için *1* yazın.`;
        await this.mesajGonder(r, mesaj);
        console.log(`💳⏳ Kapora timeout: ${r.musteri_isim} - ${r.isletme_isim} - ${saat}`);
        // Shopier ürününü sil
        if (r.kapora_shopier_urun_id) {
          try {
            const shopierService = require('./shopierService');
            await shopierService.urunSil(r.kapora_shopier_urun_id);
          } catch(e) {}
        }
      }
    } catch (e) { console.error('❌ Kapora timeout hatası:', e.message); }
  }

  // ═══════════════════════════════════════════════════════
  // REBOOK: Tamamlanan randevudan 2 saat sonra tekrar randevu teklifi
  // İşletme ayarlarında rebook_aktif toggle'ı
  // Aynı müşteriye 2 haftada 1'den fazla gönderilmez (spam koruması)
  // ═══════════════════════════════════════════════════════
  async rebookMesaji() {
    try {
      const result = await pool.query(`
        SELECT r.*, m.telefon as musteri_telefon, m.isim as musteri_isim,
               h.isim as hizmet_isim, h.sure_dk, i.isim as isletme_isim,
               i.telegram_token, i.id as isletme_id, i.rebook_aktif
        FROM randevular r
        JOIN musteriler m ON r.musteri_id = m.id
        LEFT JOIN hizmetler h ON r.hizmet_id = h.id
        JOIN isletmeler i ON r.isletme_id = i.id
        WHERE r.durum = 'tamamlandi'
          AND COALESCE(r.rebook_gonderildi, false) = false
          AND r.tarih = CURRENT_DATE
          AND (r.saat + INTERVAL '2 hours' + (COALESCE(h.sure_dk, 30) || ' minutes')::interval) < NOW()::time
      `);
      for (const r of result.rows) {
        if (r.rebook_aktif === false) {
          await pool.query('UPDATE randevular SET rebook_gonderildi = true WHERE id = $1', [r.id]);
          continue;
        }
        // Spam koruması: son 14 günde bu müşteriye rebook gönderilmiş mi?
        const sonRebook = (await pool.query(`
          SELECT id FROM randevular
          WHERE isletme_id = $1 AND musteri_id = $2 AND rebook_gonderildi = true
            AND tarih >= CURRENT_DATE - INTERVAL '14 days' AND id != $3
          LIMIT 1
        `, [r.isletme_id, r.musteri_id, r.id])).rows[0];
        if (sonRebook) {
          await pool.query('UPDATE randevular SET rebook_gonderildi = true WHERE id = $1', [r.id]);
          continue;
        }

        const mesaj = `📅 *Tekrar Bekleriz!*\n\nMerhaba ${r.musteri_isim || ''}! ${r.isletme_isim} ziyaretinizden memnun kaldıysanız bir sonraki randevunuzu şimdi alabilirsiniz! 😊\n\n${r.hizmet_isim ? '✂️ ' + r.hizmet_isim + '\n' : ''}Randevu almak için *1* yazın.`;
        await this.mesajGonder(r, mesaj);
        await pool.query('UPDATE randevular SET rebook_gonderildi = true WHERE id = $1', [r.id]);
        console.log(`📅 Rebook mesajı: ${r.musteri_isim} - ${r.isletme_isim}`);
      }
    } catch (e) { console.error('❌ Rebook mesajı hatası:', e.message); }
  }

  tarihFormat(tarih) {
    const d = new Date(tarih);
    const gunler = ['Pazar','Pazartesi','Salı','Çarşamba','Perşembe','Cuma','Cumartesi'];
    const aylar = ['Ocak','Şubat','Mart','Nisan','Mayıs','Haziran','Temmuz','Ağustos','Eylül','Ekim','Kasım','Aralık'];
    return `${d.getDate()} ${aylar[d.getMonth()]} ${gunler[d.getDay()]}`;
  }
}

module.exports = new HatirlatmaService();
