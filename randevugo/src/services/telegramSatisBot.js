const TelegramBot = require('node-telegram-bot-api');
const { DENEME_GUN } = require('../config/deneme');
const pool = require('../config/db');
const bcrypt = require('bcryptjs');

class TelegramSatisBot {
  constructor() {
    this.bot = null;
    this.kayitlar = {}; // chatId → { adim, isletmeAdi, email, sifre }
  }

  async baslat() {
    const token = process.env.TELEGRAM_SATIS_BOT_TOKEN;
    if (!token) {
      console.log('⚠️ TELEGRAM_SATIS_BOT_TOKEN yok, TG kayıt botu başlatılmadı');
      return;
    }

    try {
      this.bot = new TelegramBot(token, { polling: { interval: 300, autoStart: true } });
      const me = await this.bot.getMe();
      console.log(`✅ TG Kayıt Botu aktif: @${me.username}`);

      this.bot.on('message', async (msg) => {
        if (!msg.text) return;
        try {
          await this.mesajIsle(msg);
        } catch (err) {
          console.error('❌ TG Kayıt Bot mesaj hatası:', err.message);
        }
      });

      this.bot.on('callback_query', async (query) => {
        try {
          await this.bot.answerCallbackQuery(query.id).catch(() => {});
          await this.butonIsle(query);
        } catch (err) {
          console.error('❌ TG Kayıt Bot callback hatası:', err.message);
        }
      });

      this.bot.on('polling_error', (err) => {
        if (!err.message.includes('ETELEGRAM') && !err.message.includes('409')) {
          console.error('❌ TG Kayıt Bot polling hatası:', err.message);
        }
      });

    } catch (err) {
      console.error('❌ TG Kayıt Bot başlatma hatası:', err.message);
    }
  }

  async mesajIsle(msg) {
    const chatId = msg.chat.id;
    const metin = msg.text.trim();
    const metinKucuk = metin.toLowerCase();

    // /start komutu
    if (metinKucuk === '/start' || metinKucuk === '/start kayit' || metinKucuk === '/start kayıt') {
      return await this.hosgeldin(chatId, msg.from.first_name);
    }
    // Davet derin linki: t.me/siragoapp_bot?start=SG7K2M9Q
    const { kodYakala, kodGecerli } = require('../utils/davet');
    if (metinKucuk.startsWith('/start ')) {
      const kod = kodYakala(metin);
      if (kod && await kodGecerli(kod)) this.davetler = { ...(this.davetler || {}), [chatId]: kod };
      return await this.hosgeldin(chatId, msg.from.first_name);
    }

    // Kayıt komutu
    const kayitKomutlari = ['kayıt', 'kayit', '/kayit', '/kayıt', 'hesap aç', 'hesap ac', 'kaydol', 'üye ol', 'register'];
    if (kayitKomutlari.some(k => metinKucuk.includes(k))) {
      const ilkKod = kodYakala(metin);
      this.kayitlar[chatId] = { adim: 'isletme_adi', davet: (ilkKod && await kodGecerli(ilkKod)) ? ilkKod : this.davetler?.[chatId] };
      return await this.bot.sendMessage(chatId,
        `🎉 *SıraGO'ya Hoş Geldiniz!*\n\n` +
        `Hemen ücretsiz hesabınızı oluşturalım 🚀\n\n` +
        `*Adım 1/3*\n` +
        `🏪 İşletmenizin adını yazın:`,
        { parse_mode: 'Markdown', reply_markup: { inline_keyboard: [[{ text: '❌ İptal', callback_data: 'kayit_iptal' }]] } }
      );
    }

    // Kayıt akışı devam ediyorsa
    if (this.kayitlar[chatId]) {
      return await this.kayitAdimi(chatId, metin);
    }

    // Genel mesaj — kayıt rehberliği
    await this.hosgeldin(chatId, msg.from.first_name);
  }

  async hosgeldin(chatId, isim) {
    await this.bot.sendMessage(chatId,
      `👋 Merhaba${isim ? ' ' + isim : ''}!\n\n` +
      `Ben *SıraGO Kayıt Botu* 🤖\n\n` +
      `İşletmeniz için *ücretsiz online randevu sistemi* kuruyorum.\n\n` +
      `✅ 7/24 online randevu\n` +
      `✅ WhatsApp hatırlatma\n` +
      `✅ Kolay yönetim paneli\n` +
      `✅ ${DENEME_GUN} gün ücretsiz, kart bilgisi yok.\n\n` +
      `Hemen başlamak için aşağıdaki butona tıklayın 👇`,
      {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [{ text: '🚀 Ücretsiz Hesap Oluştur', callback_data: 'kayit_baslat' }],
            [{ text: '📖 Daha Fazla Bilgi', url: 'https://sırago.com' }]
          ]
        }
      }
    );
  }

  async butonIsle(query) {
    const chatId = query.message.chat.id;
    const data = query.data;

    if (data === 'kayit_davetsiz') {
      const k = this.kayitlar[chatId];
      if (k && k.adim === 'davet') { k.adim = 'sifre'; await this.sifreSor(chatId); }
    }

    if (data === 'kayit_baslat') {
      this.kayitlar[chatId] = { adim: 'isletme_adi', davet: this.davetler?.[chatId] };
      await this.bot.sendMessage(chatId,
        `🎉 *Harika! Başlayalım!*\n\n` +
        `*Adım 1/3*\n` +
        `🏪 İşletmenizin adını yazın:\n\n` +
        `_(Örn: Berber Ali, Güzellik Salonu Ela)_`,
        { parse_mode: 'Markdown', reply_markup: { inline_keyboard: [[{ text: '❌ İptal', callback_data: 'kayit_iptal' }]] } }
      );
    }

    if (data === 'kayit_iptal') {
      delete this.kayitlar[chatId];
      await this.bot.sendMessage(chatId,
        `❌ Kayıt iptal edildi.\n\nTekrar denemek için /kayit yazın.`,
        { reply_markup: { inline_keyboard: [[{ text: '🚀 Tekrar Dene', callback_data: 'kayit_baslat' }]] } }
      );
    }

    if (data === 'kayit_onayla') {
      await this.kayitTamamla(chatId);
    }

    if (data === 'kayit_geri') {
      delete this.kayitlar[chatId];
      await this.bot.sendMessage(chatId, `↩️ Kayıt iptal edildi. Tekrar denemek için /kayit yazın.`);
    }
  }

  async kayitAdimi(chatId, metin) {
    const kayit = this.kayitlar[chatId];
    if (!kayit) return;

    switch (kayit.adim) {
      case 'isletme_adi': {
        if (metin.length < 2) {
          return await this.bot.sendMessage(chatId, `⚠️ İşletme adı çok kısa. Lütfen geçerli bir isim yazın:`);
        }
        this.kayitlar[chatId].isletmeAdi = metin;
        this.kayitlar[chatId].adim = 'email';
        await this.bot.sendMessage(chatId,
          `✅ İşletme adı: *${metin}*\n\n` +
          `*Adım 2/3*\n` +
          `📧 Giriş için kullanacağınız *e-posta adresinizi* yazın:`,
          { parse_mode: 'Markdown', reply_markup: { inline_keyboard: [[{ text: '❌ İptal', callback_data: 'kayit_iptal' }]] } }
        );
        break;
      }

      case 'email': {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(metin.trim())) {
          return await this.bot.sendMessage(chatId, `⚠️ Geçerli bir e-posta adresi yazın.\n\nÖrnek: isim@email.com`);
        }
        const mevcut = (await pool.query('SELECT id FROM admin_kullanicilar WHERE email = $1', [metin.trim().toLowerCase()])).rows[0];
        if (mevcut) {
          return await this.bot.sendMessage(chatId,
            `⚠️ Bu e-posta zaten kayıtlı!\n\nFarklı bir e-posta yazın veya admin.sırago.com adresinden giriş yapın.`
          );
        }
        this.kayitlar[chatId].email = metin.trim().toLowerCase();
        if (this.kayitlar[chatId].davet) {
          this.kayitlar[chatId].adim = 'sifre';
          await this.sifreSor(chatId);
        } else {
          this.kayitlar[chatId].adim = 'davet';
          await this.bot.sendMessage(chatId,
            `✅ E-posta: *${metin.trim()}*\n\n` +
            `🎁 Sizi bir esnaf mı davet etti? *Davet kodunu* yazın (SG ile başlar).`,
            { parse_mode: 'Markdown', reply_markup: { inline_keyboard: [[{ text: 'Davet kodum yok', callback_data: 'kayit_davetsiz' }], [{ text: '❌ İptal', callback_data: 'kayit_iptal' }]] } }
          );
        }
        break;
      }

      case 'davet': {
        const { kodYakala, kodGecerli } = require('../utils/davet');
        const kod = kodYakala(metin);
        if (!kod || !(await kodGecerli(kod))) {
          return await this.bot.sendMessage(chatId, `⚠️ Bu kodu bulamadım. Kontrol edip tekrar yazın ya da *Davet kodum yok* butonuna basın.`,
            { parse_mode: 'Markdown', reply_markup: { inline_keyboard: [[{ text: 'Davet kodum yok', callback_data: 'kayit_davetsiz' }]] } });
        }
        this.kayitlar[chatId].davet = kod;
        this.kayitlar[chatId].adim = 'sifre';
        await this.sifreSor(chatId, `🎁 Davet kodu alındı: *${kod}*\n\n`);
        break;
      }

      case 'sifre': {
        if (metin.trim().length < 8) {
          return await this.bot.sendMessage(chatId, `⚠️ Şifre en az 8 karakter olmalı. Tekrar deneyin:`);
        }
        this.kayitlar[chatId].sifre = metin.trim();
        this.kayitlar[chatId].adim = 'onay';
        const k = this.kayitlar[chatId];
        await this.bot.sendMessage(chatId,
          `📋 *Kayıt Özeti*\n\n` +
          `🏪 İşletme: *${k.isletmeAdi}*\n` +
          `📧 E-posta: *${k.email}*\n` +
          (k.davet ? `🎁 Davet kodu: *${k.davet}*\n` : '') +
          `🔒 Şifre: *${'•'.repeat(k.sifre.length)}*\n\n` +
          `Her şey doğru mu?`,
          {
            parse_mode: 'Markdown',
            reply_markup: {
              inline_keyboard: [
                [{ text: '✅ Onayla ve Hesabı Oluştur', callback_data: 'kayit_onayla' }],
                [{ text: '❌ İptal Et', callback_data: 'kayit_geri' }]
              ]
            }
          }
        );
        break;
      }

      case 'onay': {
        // Metin yazarsa buton bekliyoruz diye uyar
        await this.bot.sendMessage(chatId, `👆 Lütfen yukarıdaki butonlardan birini tıklayın.`);
        break;
      }
    }
  }

  async sifreSor(chatId, onEk = '') {
    await this.bot.sendMessage(chatId,
      `${onEk}*Son adım*\n🔒 Bir *şifre* belirleyin (en az 8 karakter):`,
      { parse_mode: 'Markdown', reply_markup: { inline_keyboard: [[{ text: '❌ İptal', callback_data: 'kayit_iptal' }]] } }
    );
  }

  async kayitTamamla(chatId) {
    const k = this.kayitlar[chatId];
    if (!k || !k.isletmeAdi || !k.email || !k.sifre) {
      delete this.kayitlar[chatId];
      return await this.bot.sendMessage(chatId, `❌ Kayıt bilgileri eksik. Tekrar deneyin: /kayit`);
    }

    try {
      // Telefon olarak TG chatId kullan (unique olacak)
      const telFormatli = `tg_${chatId}`;

      // İşletme oluştur
      const isletme = (await pool.query(
        `INSERT INTO isletmeler (isim, telefon, kategori, aktif, paket, olusturma_tarihi, deneme_bitis_tarihi) 
         VALUES ($1, $2, 'genel', true, 'baslangic', NOW(), NOW() + make_interval(days => $3)) RETURNING *`,
        [k.isletmeAdi, telFormatli, DENEME_GUN]
      )).rows[0];

      // Admin kullanıcı oluştur
      const hashSifre = await bcrypt.hash(k.sifre, 10);
      await pool.query(
        `INSERT INTO admin_kullanicilar (isim, email, sifre, rol, isletme_id, aktif) 
         VALUES ($1, $2, $3, 'admin', $4, true)`,
        [k.isletmeAdi, k.email, hashSifre, isletme.id]
      );

      console.log(`🎉 TG Bot kayıt tamamlandı: ${k.isletmeAdi} (${k.email}) - isletme_id: ${isletme.id}`);
      if (k.davet) {
        try { await require('../utils/davet').kayittaUygula(k.davet, isletme.id); } catch (e) { console.error('Davet bağlanamadı:', e.message); }
        if (this.davetler) delete this.davetler[chatId];
      }

      delete this.kayitlar[chatId];

      await this.bot.sendMessage(chatId,
        `🎉 *Tebrikler! Hesabınız oluşturuldu!*\n\n` +
        `🏪 İşletme: *${k.isletmeAdi}*\n` +
        `📧 E-posta: *${k.email}*\n\n` +
        `Artık admin panelinize giriş yapabilirsiniz:\n\n` +
        `🔗 *admin.sırago.com*\n\n` +
        `E-posta ve şifrenizle giriş yapın.\n${DENEME_GUN} gün ücretsiz deneyebilirsiniz 🚀`,
        {
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [
              [{ text: '🔗 Admin Panele Git', url: 'https://admin.xn--srago-n4a.com' }]
            ]
          }
        }
      );
    } catch (err) {
      console.error('❌ TG Bot kayıt hatası:', err.message);
      delete this.kayitlar[chatId];
      await this.bot.sendMessage(chatId, `❌ Kayıt sırasında hata: ${err.message}\n\nTekrar deneyin: /kayit`);
    }
  }

  durdur() {
    if (this.bot) {
      try { this.bot.stopPolling(); } catch(e) {}
      this.bot = null;
    }
    console.log('🛑 TG Kayıt Botu durduruldu');
  }
}

module.exports = new TelegramSatisBot();
