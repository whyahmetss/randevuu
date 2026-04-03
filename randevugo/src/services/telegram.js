const TelegramBot = require('node-telegram-bot-api');
const pool = require('../config/db');
const { bugunTarih, yarinTarih, gunSonraTarih } = require('../utils/tarih');

class TelegramService {
  constructor() {
    this.botlar = {};
    this.isleniyor = new Set(); // çift tetiklenme önleme
  }

  async tumBotlariBaşlat() {
    try {
      const result = await pool.query(
        'SELECT id, isim, telegram_token FROM isletmeler WHERE telegram_token IS NOT NULL AND aktif = true'
      );
      for (const isletme of result.rows) {
        await this.botBaslat(isletme.id, isletme.telegram_token, isletme.isim);
      }
      console.log(`🤖 ${result.rows.length} Telegram botu başlatıldı`);
    } catch (err) {
      console.error('❌ Telegram botları başlatılamadı:', err.message);
    }
  }

  async botBaslat(isletmeId, token, isletmeIsim) {
    try {
      if (this.botlar[isletmeId]) {
        try { await this.botlar[isletmeId].stopPolling(); } catch(e) {}
        delete this.botlar[isletmeId];
      }

      const bot = new TelegramBot(token, { polling: { interval: 300, autoStart: true } });
      // Bot username'i kaydet (arkadaşına öner linki için)
      try {
        const me = await bot.getMe();
        bot._username = me.username;
      } catch(e) { bot._username = ''; }
      this.botlar[isletmeId] = bot;

      // Sadece text mesajları işle (callback_query için ayrı handler)
      bot.on('message', async (msg) => {
        if (!msg.text) return;
        const key = `msg_${msg.message_id}_${msg.chat.id}`;
        if (this.isleniyor.has(key)) return;
        this.isleniyor.add(key);
        setTimeout(() => this.isleniyor.delete(key), 5000);
        try {
          await this.istek(bot, msg.chat.id, msg.from, msg.text, isletmeId, null);
        } catch (err) {
          console.error(`❌ Telegram mesaj hatası:`, err.message);
        }
      });

      // Inline buton tıklamaları → editMessageText
      bot.on('callback_query', async (query) => {
        const key = `cb_${query.id}`;
        if (this.isleniyor.has(key)) return;
        this.isleniyor.add(key);
        setTimeout(() => this.isleniyor.delete(key), 5000);
        try {
          await bot.answerCallbackQuery(query.id).catch(() => {});
          await this.istek(bot, query.message.chat.id, query.from, query.data, isletmeId, query.message.message_id);
        } catch (err) {
          console.error(`❌ Telegram callback hatası:`, err.message);
        }
      });

      bot.on('polling_error', (err) => {
        if (!err.message.includes('ETELEGRAM')) {
          console.error(`❌ Telegram polling hatası [${isletmeIsim}]:`, err.message);
        }
      });

      console.log(`✅ Telegram botu aktif: ${isletmeIsim}`);
      return { basarili: true };
    } catch (err) {
      console.error(`❌ Bot başlatılamadı [${isletmeIsim}]:`, err.message);
      return { basarili: false, hata: err.message };
    }
  }

  async botDurdur(isletmeId) {
    if (this.botlar[isletmeId]) {
      await this.botlar[isletmeId].stopPolling();
      delete this.botlar[isletmeId];
    }
  }

  async botTest(token) {
    try {
      const bot = new TelegramBot(token, { polling: false });
      const bilgi = await bot.getMe();
      return { basarili: true, bot_isim: bilgi.username, bot_ad: bilgi.first_name };
    } catch (err) {
      return { basarili: false, hata: err.message };
    }
  }

  async istek(bot, chatId, from, metin, isletmeId, editMsgId = null) {
    metin = (metin || '').trim();
    this._editMsgId = editMsgId; // callback'lerde mesajı düzenlemek için
    const musteriTelefon = `tg:${chatId}`;

    const isletme = (await pool.query('SELECT * FROM isletmeler WHERE id=$1', [isletmeId])).rows[0];
    if (!isletme) return;

    // Müşteriyi kaydet / bul
    const musteriIsim = from ? [from.first_name, from.last_name].filter(Boolean).join(' ') : 'Telegram Kullanıcısı';
    await pool.query(
      'INSERT INTO musteriler (telefon, isim) VALUES ($1, $2) ON CONFLICT (telefon) DO NOTHING',
      [musteriTelefon, musteriIsim]
    );

    // Bot durumunu al / oluştur
    let botDurum = (await pool.query(
      'SELECT * FROM bot_durum WHERE musteri_telefon=$1 AND isletme_id=$2',
      [musteriTelefon, isletmeId]
    )).rows[0];

    if (!botDurum) {
      botDurum = (await pool.query(
        'INSERT INTO bot_durum (musteri_telefon, isletme_id, asama, chat_id) VALUES ($1, $2, $3, $4) RETURNING *',
        [musteriTelefon, isletmeId, 'baslangic', String(chatId)]
      )).rows[0];
    } else if (!botDurum.chat_id || botDurum.chat_id !== String(chatId)) {
      await pool.query('UPDATE bot_durum SET chat_id=$1 WHERE musteri_telefon=$2 AND isletme_id=$3', [String(chatId), musteriTelefon, isletmeId]);
    }

    // Sohbeti kaydet
    await pool.query(
      'INSERT INTO sohbet_gecmisi (musteri_telefon, isletme_id, yon, mesaj) VALUES ($1, $2, $3, $4)',
      [musteriTelefon, isletmeId, 'gelen', metin]
    );

    const hizmetler = (await pool.query(
      'SELECT * FROM hizmetler WHERE isletme_id=$1 AND aktif=true ORDER BY id', [isletmeId]
    )).rows;

    const mk = metin.toLowerCase();

    // /start veya merhaba veya ana_menu callback → ana menü
    if (metin === '/start' || mk === 'ana_menu' || ['merhaba','selam','hi','hello','alo','menu','menü'].includes(mk) || botDurum.asama === 'baslangic') {
      await this.durumGuncelle(musteriTelefon, isletmeId, 'ana_menu');
      await this.anaMenuGonder(bot, chatId, isletmeId, musteriTelefon, isletme, hizmetler);
      return;
    }

    // Cross-sell / hizmet seçimi (hz_0, hz_1 gibi callback'ler)
    if (mk.startsWith('hz_')) {
      const idx = parseInt(mk.replace('hz_', ''));
      const hz = hizmetler[idx];
      if (hz) {
        // Çalışan kontrolü
        const calisanlarHz = (await pool.query('SELECT * FROM calisanlar WHERE isletme_id=$1 AND (aktif IS NULL OR aktif=true) ORDER BY id', [isletmeId])).rows;
        if (calisanlarHz.length > 1) {
          await this.durumGuncelle(musteriTelefon, isletmeId, 'calisan_secimi', { secilen_hizmet_id: hz.id });
          const cBtnHz = calisanlarHz.map((c, i) => [{ text: `👤 ${c.isim}`, callback_data: `cl_${i}` }]);
          cBtnHz.push([{ text: '🔙 Geri', callback_data: 'geri_hizmet' }, { text: '🏠 Ana Menü', callback_data: 'ana_menu' }]);
          await this.cevapGonder(bot, chatId, isletmeId, musteriTelefon,
            `✅ *${hz.isim}* seçildi\n\n⏱ Süre: ${hz.sure_dk} dk\n💰 Ücret: ₺${hz.fiyat}\n\n� Çalışan seçin:`, cBtnHz);
        } else {
          const cId = calisanlarHz.length === 1 ? calisanlarHz[0].id : null;
          await this.durumGuncelle(musteriTelefon, isletmeId, 'tarih_secimi', { secilen_hizmet_id: hz.id, secilen_calisan_id: cId });
          const clText = calisanlarHz.length === 1 ? `\n👤 Çalışan: ${calisanlarHz[0].isim}` : '';
          await this.cevapGonder(bot, chatId, isletmeId, musteriTelefon,
            `✅ *${hz.isim}* seçildi\n\n⏱ Süre: ${hz.sure_dk} dk\n💰 Ücret: ₺${hz.fiyat}${clText}\n\n📅 Hangi gün istersiniz?`,
            [[{ text: '📅 Bugün', callback_data: 'bugun' }, { text: '📅 Yarın', callback_data: 'yarin' }],
             [{ text: '📆 Bu Hafta', callback_data: 'hafta' }],
             [{ text: '🔙 Geri', callback_data: 'geri_ana' }, { text: '🏠 Ana Menü', callback_data: 'ana_menu' }]]);
        }
        return;
      }
    }

    // Hızlı tekrar randevu
    if (mk.startsWith('tekrar_')) {
      const hizmetId = parseInt(mk.replace('tekrar_', ''));
      const hz = hizmetler.find(h => h.id === hizmetId);
      if (hz) {
        // Çalışan kontrolü
        const calisanlarTk = (await pool.query('SELECT * FROM calisanlar WHERE isletme_id=$1 AND (aktif IS NULL OR aktif=true) ORDER BY id', [isletmeId])).rows;
        if (calisanlarTk.length > 1) {
          await this.durumGuncelle(musteriTelefon, isletmeId, 'calisan_secimi', { secilen_hizmet_id: hz.id });
          const cBtnTk = calisanlarTk.map((c, i) => [{ text: `👤 ${c.isim}`, callback_data: `cl_${i}` }]);
          cBtnTk.push([{ text: '🔙 Geri', callback_data: 'geri_hizmet' }, { text: '🏠 Ana Menü', callback_data: 'ana_menu' }]);
          await this.cevapGonder(bot, chatId, isletmeId, musteriTelefon,
            `✅ *${hz.isim}* seçildi\n\n⏱ Süre: ${hz.sure_dk} dk\n💰 Ücret: ₺${hz.fiyat}\n\n� Çalışan seçin:`, cBtnTk);
        } else {
          const cId2 = calisanlarTk.length === 1 ? calisanlarTk[0].id : null;
          await this.durumGuncelle(musteriTelefon, isletmeId, 'tarih_secimi', { secilen_hizmet_id: hz.id, secilen_calisan_id: cId2 });
          const clText2 = calisanlarTk.length === 1 ? `\n👤 Çalışan: ${calisanlarTk[0].isim}` : '';
          await this.cevapGonder(bot, chatId, isletmeId, musteriTelefon,
            `✅ *${hz.isim}* seçildi\n\n⏱ Süre: ${hz.sure_dk} dk\n💰 Ücret: ₺${hz.fiyat}${clText2}\n\n📅 Hangi gün istersiniz?`,
            [[{ text: '📅 Bugün', callback_data: 'bugun' }, { text: '📅 Yarın', callback_data: 'yarin' }],
             [{ text: '📆 Bu Hafta', callback_data: 'hafta' }],
             [{ text: '🔙 Geri', callback_data: 'geri_ana' }, { text: '🏠 Ana Menü', callback_data: 'ana_menu' }]]);
        }
        return;
      }
    }

    // Konum bilgisi
    if (mk === 'bilgi_konum') {
      const adres = isletme.adres || 'Adres bilgisi bulunamadı';
      const sehir = isletme.sehir || '';
      const ilce = isletme.ilce || '';
      const tel = isletme.telefon || '';
      const mapsLink = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(adres + ' ' + ilce + ' ' + sehir)}`;
      const msg = `📍 *Adresimiz*\n\n🏥 ${isletme.isim}\n📍 ${adres}${ilce ? ', ' + ilce : ''}${sehir ? ', ' + sehir : ''}\n${tel ? '📞 ' + tel + '\n' : ''}\n🗺 [Google Maps\'te Aç](${mapsLink})`;
      await this.cevapGonder(bot, chatId, isletmeId, musteriTelefon, msg,
        [[{ text: '📅 Randevu Al', callback_data: '1' }],
         [{ text: '🏠 Ana Menü', callback_data: 'ana_menu' }]]);
      return;
    }

    // Çalışma saatleri
    if (mk === 'bilgi_saatler') {
      const bas = isletme.calisma_baslangic ? String(isletme.calisma_baslangic).substring(0,5) : '09:00';
      const bit = isletme.calisma_bitis ? String(isletme.calisma_bitis).substring(0,5) : '18:00';
      const kapaliGunler = isletme.kapali_gunler || '';
      const kapaliSet = new Set(kapaliGunler.split(',').filter(g => g.trim()).map(g => parseInt(g.trim())));
      // Gün isimleri: 0=Pazar ... 6=Cumartesi
      const gunIsimleri = ['Pazar','Pazartesi','Salı','Çarşamba','Perşembe','Cuma','Cumartesi'];
      let msg = `🕐 *Çalışma Saatlerimiz*\n\n`;
      msg += `📋 *Hafta İçi:*\n`;
      for (let g = 1; g <= 5; g++) {
        msg += kapaliSet.has(g) ? `   ❌ ${gunIsimleri[g]}: Kapalı\n` : `   ✅ ${gunIsimleri[g]}: ${bas} - ${bit}\n`;
      }
      msg += `\n� *Hafta Sonu:*\n`;
      for (const g of [6, 0]) {
        msg += kapaliSet.has(g) ? `   ❌ ${gunIsimleri[g]}: Kapalı\n` : `   ✅ ${gunIsimleri[g]}: ${bas} - ${bit}\n`;
      }
      msg += `\n⏰ Seans süresi: ${isletme.randevu_suresi_dk || 30} dk`;
      await this.cevapGonder(bot, chatId, isletmeId, musteriTelefon, msg,
        [[{ text: '📅 Randevu Al', callback_data: '1' }],
         [{ text: '🏠 Ana Menü', callback_data: 'ana_menu' }]]);
      return;
    }

    // Memnuniyet puan callback
    if (mk.startsWith('puan_')) {
      const parcalar = mk.split('_');
      const puan = parseInt(parcalar[1]);
      const randevuId = parseInt(parcalar[2]);
      const musteri = (await pool.query('SELECT id FROM musteriler WHERE telefon=$1', [musteriTelefon])).rows[0];
      if (musteri) {
        await pool.query('INSERT INTO memnuniyet (randevu_id, musteri_id, isletme_id, puan) VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING', [randevuId, musteri.id, isletmeId, puan]);
        await pool.query('UPDATE randevular SET memnuniyet_soruldu=true WHERE id=$1', [randevuId]);
      }
      const yildizlar = '⭐'.repeat(puan);
      let tesekkur = `Teşekkür ederiz! ${yildizlar}\n\n`;
      if (puan >= 4) tesekkur += `Memnuniyetiniz bizim için çok değerli! 😊`;
      else tesekkur += `Geri bildiriminiz için teşekkürler. Daha iyi hizmet vermek için çalışacağız! 💪`;
      await this.cevapGonder(bot, chatId, isletmeId, musteriTelefon, tesekkur,
        [[{ text: '📅 Yeni Randevu', callback_data: '1' }],
         [{ text: '🏠 Ana Menü', callback_data: 'ana_menu' }]]);
      return;
    }

    // Bekleme listesi callback
    if (mk.startsWith('bekle_')) {
      const beklemeTarih = mk.replace('bekle_', '');
      const gd = (await pool.query('SELECT * FROM bot_durum WHERE musteri_telefon=$1 AND isletme_id=$2', [musteriTelefon, isletmeId])).rows[0];
      await pool.query(
        'INSERT INTO bekleme_listesi (musteri_telefon, isletme_id, hizmet_id, istenen_tarih) VALUES ($1,$2,$3,$4)',
        [musteriTelefon, isletmeId, gd?.secilen_hizmet_id || null, beklemeTarih]
      );
      await this.cevapGonder(bot, chatId, isletmeId, musteriTelefon,
        `✅ *Bekleme listesine eklendi!*\n\n📅 ${this.tarihFormat(beklemeTarih)}\n\nBu tarihte yer açılırsa size hemen bildirim göndereceğiz. 🔔`,
        [[{ text: '📅 Başka Gün Seç', callback_data: 'hafta' }],
         [{ text: '🏠 Ana Menü', callback_data: 'ana_menu' }]]);
      return;
    }

    // Geri navigasyonu
    if (mk === 'geri_ana') {
      await this.durumGuncelle(musteriTelefon, isletmeId, 'ana_menu');
      await this.anaMenuGonder(bot, chatId, isletmeId, musteriTelefon, isletme, hizmetler);
      return;
    }

    // Callback data (inline buton tıklaması) - text olarak gelir
    switch (botDurum.asama) {
      case 'ana_menu': {
        if (metin === '1' || mk.includes('randevu al')) {
          await this.durumGuncelle(musteriTelefon, isletmeId, 'hizmet_secimi');
          await this.hizmetListesiGonder(bot, chatId, isletmeId, musteriTelefon, isletme, hizmetler);
        } else if (metin === '2' || mk.includes('randevular')) {
          const randevuService = require('./randevu');
          const randevular = await randevuService.musteriRandevulari(musteriTelefon, isletmeId);
          if (randevular.length === 0) {
            await this.cevapGonder(bot, chatId, isletmeId, musteriTelefon,
              `Henüz aktif randevunuz bulunmuyor.\nHemen yeni bir randevu oluşturabilirsiniz!`,
              [[{ text: '📅 Randevu Al', callback_data: '1' }],
               [{ text: '🏠 Ana Menü', callback_data: 'ana_menu' }]]);
          } else {
            let txt = `📝 *Randevularınız*\n\n`;
            randevular.slice(0,5).forEach((r,i) => {
              txt += `*${i+1}.* ${r.hizmet_isim||'Hizmet'}\n     📅 ${this.tarihFormat(r.tarih)} • 🕐 ${this.saatFormat(r.saat)}\n\n`;
            });
            await this.cevapGonder(bot, chatId, isletmeId, musteriTelefon, txt,
              [[{ text: '📅 Yeni Randevu', callback_data: '1' }],
               [{ text: '❌ Randevu İptal', callback_data: '3' }],
               [{ text: '🏠 Ana Menü', callback_data: 'ana_menu' }]]);
          }
        } else if (mk.includes('not al') || mk.includes('not ekle') || mk === 'not') {
          // Mevcut randevuya not ekleme
          const randevuService = require('./randevu');
          const randevular = await randevuService.musteriRandevulari(musteriTelefon, isletmeId);
          if (randevular.length === 0) {
            await this.cevapGonder(bot, chatId, isletmeId, musteriTelefon,
              `Aktif randevunuz bulunmuyor. Önce randevu alın, sonra not ekleyebilirsiniz.`,
              [[{ text: '📅 Randevu Al', callback_data: '1' }],
               [{ text: '🏠 Ana Menü', callback_data: 'ana_menu' }]]);
          } else {
            // En yakın randevuyu seç
            const r = randevular[0];
            await this.durumGuncelle(musteriTelefon, isletmeId, 'not_ekleme', { secilen_hizmet_id: r.id });
            await this.cevapGonder(bot, chatId, isletmeId, musteriTelefon,
              `💬 *Not Ekle*\n\nRandevunuz: ${r.hizmet_isim || 'Hizmet'} • ${this.tarihFormat(r.tarih)} • ${this.saatFormat(r.saat)}\n\nNotunuzu yazın:`,
              [[{ text: '🔙 Vazgeç', callback_data: 'ana_menu' }]]);
          }
        } else if (metin === '3' || mk.includes('iptal')) {
          await this.durumGuncelle(musteriTelefon, isletmeId, 'randevu_iptal');
          const deepseek = require('./deepseek');
          const ikna = await deepseek.serbetCevap('Müşteri randevusunu iptal etmek istiyor. Önce nedenini sor, empati kur, mümkünse ertelemeyi öner. Kısa, sıcak ve profesyonel cevap ver.', isletme, hizmetler, 'telegram');
          const mesajMetni = ikna || `Randevunuzu iptal etmek istediğinizi duydum. Sebebini öğrenebilir miyim? Belki size daha uygun bir zaman bulabiliriz.`;
          await this.cevapGonder(bot, chatId, isletmeId, musteriTelefon, mesajMetni,
            [[{ text: '❌ İptal Et', callback_data: 'evet' }],
             [{ text: '📆 Farklı Gün / Ertele', callback_data: 'farkli_gun' }],
             [{ text: '🔙 Vazgeç', callback_data: 'hayir' }]]);
        } else {
          const deepseek = require('./deepseek');
          const aiCevap = await deepseek.serbetCevap(metin, isletme, hizmetler, 'telegram');
          if (aiCevap) {
            await this.cevapGonder(bot, chatId, isletmeId, musteriTelefon, aiCevap,
              [[{ text: '📅 Randevu Al', callback_data: '1' }],
               [{ text: '🏠 Ana Menü', callback_data: 'ana_menu' }]]);
          } else {
            await this.anaMenuGonder(bot, chatId, isletmeId, musteriTelefon, isletme, hizmetler);
          }
        }
        break;
      }

      case 'hizmet_secimi': {
        let secilenHizmet = null;
        if (mk.startsWith('hz_')) {
          const idx = parseInt(mk.replace('hz_', ''));
          secilenHizmet = hizmetler[idx];
        } else {
          const idx = parseInt(metin) - 1;
          if (idx >= 0 && idx < hizmetler.length) secilenHizmet = hizmetler[idx];
          else secilenHizmet = hizmetler.find(h => mk.includes(h.isim.toLowerCase()));
        }

        if (secilenHizmet) {
          // Çalışan kontrolü
          const calisanlar = (await pool.query('SELECT * FROM calisanlar WHERE isletme_id=$1 AND (aktif IS NULL OR aktif=true) ORDER BY id', [isletmeId])).rows;
          console.log(`👤 Çalışan sorgusu: isletme=${isletmeId}, bulunan=${calisanlar.length}, isimler=${calisanlar.map(c=>c.isim).join(',')}`);
          if (calisanlar.length > 1) {
            await this.durumGuncelle(musteriTelefon, isletmeId, 'calisan_secimi', { secilen_hizmet_id: secilenHizmet.id });
            const cBtnlar = calisanlar.map((c, i) => [{ text: `👤 ${c.isim}`, callback_data: `cl_${i}` }]);
            cBtnlar.push([{ text: '🔙 Geri', callback_data: 'geri_hizmet' }, { text: '🏠 Ana Menü', callback_data: 'ana_menu' }]);
            await this.cevapGonder(bot, chatId, isletmeId, musteriTelefon,
              `✅ *${secilenHizmet.isim}* seçildi\n\n⏱ Süre: ${secilenHizmet.sure_dk} dk\n💰 Ücret: ₺${secilenHizmet.fiyat}\n\n👤 Çalışan seçin:`, cBtnlar);
          } else if (calisanlar.length === 1) {
            await this.durumGuncelle(musteriTelefon, isletmeId, 'tarih_secimi', { secilen_hizmet_id: secilenHizmet.id, secilen_calisan_id: calisanlar[0].id });
            await this.cevapGonder(bot, chatId, isletmeId, musteriTelefon,
              `✅ *${secilenHizmet.isim}* seçildi\n\n⏱ Süre: ${secilenHizmet.sure_dk} dk\n💰 Ücret: ₺${secilenHizmet.fiyat}\n👤 Çalışan: ${calisanlar[0].isim}\n\n📅 Hangi gün istersiniz?`,
              [[{ text: '📅 Bugün', callback_data: 'bugun' }, { text: '📅 Yarın', callback_data: 'yarin' }],
               [{ text: '📆 Bu Hafta', callback_data: 'hafta' }],
               [{ text: '🔙 Geri', callback_data: 'geri_hizmet' }, { text: '🏠 Ana Menü', callback_data: 'ana_menu' }]]);
          } else {
            await this.durumGuncelle(musteriTelefon, isletmeId, 'tarih_secimi', { secilen_hizmet_id: secilenHizmet.id });
            await this.cevapGonder(bot, chatId, isletmeId, musteriTelefon,
              `✅ *${secilenHizmet.isim}* seçildi\n\n⏱ Süre: ${secilenHizmet.sure_dk} dk\n💰 Ücret: ₺${secilenHizmet.fiyat}\n\n📅 Hangi gün istersiniz?`,
              [[{ text: '📅 Bugün', callback_data: 'bugun' }, { text: '📅 Yarın', callback_data: 'yarin' }],
               [{ text: '📆 Bu Hafta', callback_data: 'hafta' }],
               [{ text: '🔙 Geri', callback_data: 'geri_hizmet' }, { text: '🏠 Ana Menü', callback_data: 'ana_menu' }]]);
          }
        } else {
          const deepseek = require('./deepseek');
          const aiCevap = await deepseek.serbetCevap(metin, isletme, hizmetler, 'telegram');
          if (aiCevap) {
            await this.cevapGonder(bot, chatId, isletmeId, musteriTelefon, aiCevap,
              [[{ text: '📅 Randevu Al', callback_data: '1' }],
               [{ text: '🏠 Ana Menü', callback_data: 'ana_menu' }]]);
          } else {
            await this.hizmetListesiGonder(bot, chatId, isletmeId, musteriTelefon, isletme, hizmetler);
          }
        }
        break;
      }

      case 'calisan_secimi': {
        if (mk === 'geri_hizmet' || mk === 'geri') {
          await this.durumGuncelle(musteriTelefon, isletmeId, 'hizmet_secimi');
          await this.hizmetListesiGonder(bot, chatId, isletmeId, musteriTelefon, isletme, hizmetler);
          break;
        }
        if (mk === 'ana_menu') {
          await this.durumGuncelle(musteriTelefon, isletmeId, 'ana_menu');
          await this.anaMenuGonder(bot, chatId, isletmeId, musteriTelefon, isletme, hizmetler);
          break;
        }
        const calisanlarTg = (await pool.query('SELECT * FROM calisanlar WHERE isletme_id=$1 AND (aktif IS NULL OR aktif=true) ORDER BY id', [isletmeId])).rows;
        let secilenCalisan = null;
        if (mk.startsWith('cl_')) {
          const cIdx = parseInt(mk.replace('cl_', ''));
          secilenCalisan = calisanlarTg[cIdx];
        } else {
          const cIdx = parseInt(metin) - 1;
          if (cIdx >= 0 && cIdx < calisanlarTg.length) secilenCalisan = calisanlarTg[cIdx];
          else secilenCalisan = calisanlarTg.find(c => mk.includes(c.isim.toLowerCase()));
        }
        if (secilenCalisan) {
          await this.durumGuncelle(musteriTelefon, isletmeId, 'tarih_secimi', { secilen_calisan_id: secilenCalisan.id });
          await this.cevapGonder(bot, chatId, isletmeId, musteriTelefon,
            `👤 *${secilenCalisan.isim}* seçildi\n\n📅 Hangi gün istersiniz?`,
            [[{ text: '📅 Bugün', callback_data: 'bugun' }, { text: '📅 Yarın', callback_data: 'yarin' }],
             [{ text: '📆 Bu Hafta', callback_data: 'hafta' }],
             [{ text: '🔙 Geri', callback_data: 'geri_hizmet' }, { text: '🏠 Ana Menü', callback_data: 'ana_menu' }]]);
        } else {
          const cBtnlar2 = calisanlarTg.map((c, i) => [{ text: `👤 ${c.isim}`, callback_data: `cl_${i}` }]);
          cBtnlar2.push([{ text: '🔙 Geri', callback_data: 'geri_hizmet' }, { text: '🏠 Ana Menü', callback_data: 'ana_menu' }]);
          await this.cevapGonder(bot, chatId, isletmeId, musteriTelefon, `👤 Çalışan seçin:`, cBtnlar2);
        }
        break;
      }

      case 'tarih_secimi': {
        if (mk === 'geri_hizmet' || mk === 'geri') {
          await this.durumGuncelle(musteriTelefon, isletmeId, 'hizmet_secimi');
          await this.hizmetListesiGonder(bot, chatId, isletmeId, musteriTelefon, isletme, hizmetler);
          break;
        }
        let secilenTarih = null;
        if (mk === 'bugun' || mk.includes('bugün') || metin === '1') secilenTarih = bugunTarih();
        else if (mk === 'yarin' || mk.includes('yarın') || metin === '2') secilenTarih = yarinTarih();
        else if (mk === 'hafta') {
          const gunler = ['Paz','Pzt','Sal','Çar','Per','Cum','Cmt'];
          const butonlar = [];
          for (let i=0; i<7; i++) { const t=new Date(); t.setDate(t.getDate()+i); butonlar.push({ text: `${gunler[t.getDay()]} ${t.getDate()}.${t.getMonth()+1}`, callback_data: `gun_${i}` }); }
          const satirlar = [butonlar.slice(0,4), butonlar.slice(4)];
          satirlar.push([{ text: '🔙 Geri', callback_data: 'geri_hizmet' }, { text: '🏠 Ana Menü', callback_data: 'ana_menu' }]);
          await this.cevapGonder(bot, chatId, isletmeId, musteriTelefon, `📆 Bir gün seçin:`, satirlar);
          break;
        } else if (mk.startsWith('gun_')) {
          const gunIdx = parseInt(mk.replace('gun_',''));
          secilenTarih = gunSonraTarih(gunIdx);
        } else {
          const p = metin.match(/(\d{1,2})[./](\d{1,2})[./](\d{4})/);
          if (p) secilenTarih = `${p[3]}-${p[2].padStart(2,'0')}-${p[1].padStart(2,'0')}`;
        }

        if (secilenTarih) {
          const randevuService = require('./randevu');
          const gdTarih = (await pool.query('SELECT secilen_calisan_id, secilen_hizmet_id FROM bot_durum WHERE musteri_telefon=$1 AND isletme_id=$2', [musteriTelefon, isletmeId])).rows[0];
          const saatler = await randevuService.musaitSaatleriGetir(isletmeId, secilenTarih, gdTarih?.secilen_calisan_id, gdTarih?.secilen_hizmet_id);
          if (!saatler.length) {
            await this.cevapGonder(bot, chatId, isletmeId, musteriTelefon,
              `😔 *${this.tarihFormat(secilenTarih)}* tarihinde müsait saat bulunmuyor.\n\nBaşka gün seçebilir veya bekleme listesine eklenebilirsiniz:`,
              [[{ text: '📋 Bekleme Listesine Ekle', callback_data: `bekle_${secilenTarih}` }],
               [{ text: '📅 Bugün', callback_data: 'bugun' }, { text: '📅 Yarın', callback_data: 'yarin' }],
               [{ text: '📆 Bu Hafta', callback_data: 'hafta' }],
               [{ text: '🔙 Geri', callback_data: 'geri_hizmet' }, { text: '🏠 Ana Menü', callback_data: 'ana_menu' }]]);
          } else {
            await this.durumGuncelle(musteriTelefon, isletmeId, 'saat_secimi', { secilen_tarih: secilenTarih });
            const saatButonlar = saatler.map(s => ({ text: s, callback_data: `saat_${s}` }));
            const satirlar = [];
            for (let i=0; i<saatButonlar.length; i+=3) satirlar.push(saatButonlar.slice(i,i+3));
            satirlar.push([{ text: '🔙 Geri', callback_data: 'geri_tarih' }, { text: '🏠 Ana Menü', callback_data: 'ana_menu' }]);
            await this.cevapGonder(bot, chatId, isletmeId, musteriTelefon, `🕐 *${this.tarihFormat(secilenTarih)}*\n\nBir saat seçin:`, satirlar);
          }
        } else {
          await this.cevapGonder(bot, chatId, isletmeId, musteriTelefon,
            `📅 Lütfen bir gün seçin:`,
            [[{ text: '📅 Bugün', callback_data: 'bugun' }, { text: '📅 Yarın', callback_data: 'yarin' }],
             [{ text: '📆 Bu Hafta', callback_data: 'hafta' }],
             [{ text: '🔙 Geri', callback_data: 'geri_hizmet' }, { text: '🏠 Ana Menü', callback_data: 'ana_menu' }]]);
        }
        break;
      }

      case 'saat_secimi': {
        if (mk === 'geri_tarih') {
          await this.durumGuncelle(musteriTelefon, isletmeId, 'tarih_secimi');
          await this.cevapGonder(bot, chatId, isletmeId, musteriTelefon,
            `📅 Hangi gün istersiniz?`,
            [[{ text: '📅 Bugün', callback_data: 'bugun' }, { text: '📅 Yarın', callback_data: 'yarin' }],
             [{ text: '📆 Bu Hafta', callback_data: 'hafta' }],
             [{ text: '🔙 Geri', callback_data: 'geri_hizmet' }, { text: '🏠 Ana Menü', callback_data: 'ana_menu' }]]);
          break;
        }
        const randevuService = require('./randevu');
        const gd = (await pool.query('SELECT * FROM bot_durum WHERE musteri_telefon=$1 AND isletme_id=$2', [musteriTelefon, isletmeId])).rows[0];
        const saatler = await randevuService.musaitSaatleriGetir(isletmeId, gd.secilen_tarih, gd.secilen_calisan_id, gd.secilen_hizmet_id);
        let secilenSaat = null;
        if (mk.startsWith('saat_')) secilenSaat = metin.replace('saat_', '');
        else if (saatler.includes(metin)) secilenSaat = metin;
        else { const idx2 = parseInt(metin)-1; if (idx2>=0&&idx2<saatler.length) secilenSaat=saatler[idx2]; }

        if (secilenSaat && saatler.includes(secilenSaat)) {
          await this.durumGuncelle(musteriTelefon, isletmeId, 'onay', { secilen_saat: secilenSaat });
          const hz = gd.secilen_hizmet_id ? (await pool.query('SELECT * FROM hizmetler WHERE id=$1', [gd.secilen_hizmet_id])).rows[0] : null;
          const clOzet = gd.secilen_calisan_id ? (await pool.query('SELECT isim FROM calisanlar WHERE id=$1', [gd.secilen_calisan_id])).rows[0] : null;
          const ozet = `📋 *Randevu Özeti*\n\n` +
            `🏥  ${isletme.isim}\n` +
            `${hz ? `${hz.emoji ? hz.emoji + '  ' : ''}${hz.isim}\n` : ''}` +
            `${clOzet ? `👤  ${clOzet.isim}\n` : ''}` +
            `📅  ${this.tarihFormat(gd.secilen_tarih)}\n` +
            `🕐  ${secilenSaat}\n` +
            `${hz ? `💰  ₺${hz.fiyat}\n` : ''}` +
            `\nHer şey doğru mu?`;
          await this.cevapGonder(bot, chatId, isletmeId, musteriTelefon, ozet,
            [[{ text: '✅ Onayla', callback_data: 'evet' }],
             [{ text: '💬 Not Ekle', callback_data: 'not_ekle' }],
             [{ text: '✏️ Değiştir', callback_data: 'geri_hizmet' }, { text: '❌ İptal', callback_data: 'hayir' }]]);
        } else {
          const sb = saatler.map(s => ({ text: s, callback_data: `saat_${s}` }));
          const sat = []; for (let i=0;i<sb.length;i+=3) sat.push(sb.slice(i,i+3));
          sat.push([{ text: '🔙 Geri', callback_data: 'geri_tarih' }, { text: '🏠 Ana Menü', callback_data: 'ana_menu' }]);
          await this.cevapGonder(bot, chatId, isletmeId, musteriTelefon, `Lütfen bir saat seçin:`, sat);
        }
        break;
      }

      case 'onay': {
        const randevuService = require('./randevu');
        if (mk === 'evet' || mk.includes('onayla') || mk.includes('evet')) {
          try {
            const sd = (await pool.query('SELECT * FROM bot_durum WHERE musteri_telefon=$1 AND isletme_id=$2', [musteriTelefon, isletmeId])).rows[0];
            if (!sd || !sd.secilen_tarih || !sd.secilen_saat) {
              await this.durumGuncelle(musteriTelefon, isletmeId, 'ana_menu');
              await this.cevapGonder(bot, chatId, isletmeId, musteriTelefon,
                `⚠️ Randevu bilgileri eksik. Lütfen tekrar deneyin.`,
                [[{ text: '📅 Randevu Al', callback_data: '1' }],
                 [{ text: '🏠 Ana Menü', callback_data: 'ana_menu' }]]);
              break;
            }
            const sonuc = await randevuService.randevuOlustur({ isletmeId, musteriTelefon, hizmetId: sd.secilen_hizmet_id, calisanId: sd.secilen_calisan_id, tarih: sd.secilen_tarih, saat: sd.secilen_saat });
            await this.durumGuncelle(musteriTelefon, isletmeId, 'ana_menu', { secilen_hizmet_id: null, secilen_tarih: null, secilen_saat: null, secilen_calisan_id: null });
            const clTg = sd.secilen_calisan_id ? (await pool.query('SELECT isim FROM calisanlar WHERE id=$1', [sd.secilen_calisan_id])).rows[0] : null;

            let tebrik = `✅ *Randevunuz Oluşturuldu!*\n\n` +
              `🏥  ${isletme.isim}\n` +
              `${sonuc.hizmet ? `${sonuc.hizmet.emoji ? sonuc.hizmet.emoji + '  ' : ''}${sonuc.hizmet.isim}\n` : ''}` +
              `${clTg ? `👤  ${clTg.isim}\n` : ''}` +
              `📅  ${this.tarihFormat(sd.secilen_tarih)}\n` +
              `🕐  ${String(sd.secilen_saat).substring(0,5)}\n\n` +
              `⏰ Randevunuzdan 1 gün ve 1 saat önce hatırlatma alacaksınız.`;

            // Cross-sell: farklı bir hizmet öner
            const digerHizmetler = hizmetler.filter(h => h.id !== sd.secilen_hizmet_id);
            if (digerHizmetler.length > 0) {
              const oneri = digerHizmetler[Math.floor(Math.random() * digerHizmetler.length)];
              tebrik += `\n\n💡 *Bunu da denediniz mi?*\n${oneri.emoji || '✨'} ${oneri.isim} • ${oneri.sure_dk}dk • ₺${oneri.fiyat}`;
            }

            // Arkadaşına öner linki
            const botUsername = bot._username || '';
            if (botUsername) {
              tebrik += `\n\n👥 Arkadaşınıza önerin: t.me/${botUsername}`;
            }

            tebrik += `\n\nGörüşmek üzere! 😊`;

            const butonlar = [
              [{ text: '📅 Yeni Randevu', callback_data: '1' }],
              [{ text: '📝 Randevularım', callback_data: '2' }],
              [{ text: '🏠 Ana Menü', callback_data: 'ana_menu' }]
            ];
            // Cross-sell butonu
            if (digerHizmetler.length > 0) {
              const oneri2 = digerHizmetler[Math.floor(Math.random() * digerHizmetler.length)];
              butonlar.splice(1, 0, [{ text: `💡 ${oneri2.emoji || '✨'} ${oneri2.isim} al`, callback_data: `hz_${hizmetler.indexOf(oneri2)}` }]);
            }
            await this.cevapGonder(bot, chatId, isletmeId, musteriTelefon, tebrik, butonlar);
          } catch (err) {
            console.error('❌ Randevu onay hatası:', err.message);
            await this.durumGuncelle(musteriTelefon, isletmeId, 'ana_menu', { secilen_hizmet_id: null, secilen_tarih: null, secilen_saat: null, secilen_calisan_id: null });
            await this.cevapGonder(bot, chatId, isletmeId, musteriTelefon,
              `⚠️ Randevu oluşturulurken bir hata oluştu. Lütfen tekrar deneyin.`,
              [[{ text: '📅 Randevu Al', callback_data: '1' }],
               [{ text: '🏠 Ana Menü', callback_data: 'ana_menu' }]]);
          }
        } else if (mk === 'not_ekle') {
          await this.durumGuncelle(musteriTelefon, isletmeId, 'randevu_notu');
          await this.cevapGonder(bot, chatId, isletmeId, musteriTelefon,
            `💬 *Not Ekle*\n\nRandevunuzla ilgili bir not bırakabilirsiniz.\n\n_Örnek: "Sol üst diş ağrıyor", "15 dk geç kalabilirim"_`,
            [[{ text: '⏭ Notsuz Devam', callback_data: 'evet' }],
             [{ text: '🔙 Geri', callback_data: 'geri_onay' }]]);
        } else {
          await this.durumGuncelle(musteriTelefon, isletmeId, 'ana_menu');
          await this.anaMenuGonder(bot, chatId, isletmeId, musteriTelefon, isletme, hizmetler);
        }
        break;
      }

      case 'randevu_notu': {
        const randevuService = require('./randevu');
        if (mk === 'geri_onay') {
          await this.durumGuncelle(musteriTelefon, isletmeId, 'onay');
          const gdn = (await pool.query('SELECT * FROM bot_durum WHERE musteri_telefon=$1 AND isletme_id=$2', [musteriTelefon, isletmeId])).rows[0];
          const hzn = gdn.secilen_hizmet_id ? (await pool.query('SELECT * FROM hizmetler WHERE id=$1', [gdn.secilen_hizmet_id])).rows[0] : null;
          const clOzet2 = gdn.secilen_calisan_id ? (await pool.query('SELECT isim FROM calisanlar WHERE id=$1', [gdn.secilen_calisan_id])).rows[0] : null;
          const ozet = `📋 *Randevu Özeti*\n\n🏥  ${isletme.isim}\n${hzn ? `${hzn.emoji ? hzn.emoji + '  ' : ''}${hzn.isim}\n` : ''}${clOzet2 ? `👤  ${clOzet2.isim}\n` : ''}📅  ${this.tarihFormat(gdn.secilen_tarih)}\n🕐  ${gdn.secilen_saat}\n${hzn ? `💰  ₺${hzn.fiyat}\n` : ''}\nHer şey doğru mu?`;
          await this.cevapGonder(bot, chatId, isletmeId, musteriTelefon, ozet,
            [[{ text: '✅ Onayla', callback_data: 'evet' }],
             [{ text: '💬 Not Ekle', callback_data: 'not_ekle' }],
             [{ text: '✏️ Değiştir', callback_data: 'geri_hizmet' }, { text: '❌ İptal', callback_data: 'hayir' }]]);
          break;
        }
        if (mk === 'evet' || mk.includes('notsuz')) {
          // Notsuz devam - onay'a geri dön ve onayla
          await this.durumGuncelle(musteriTelefon, isletmeId, 'onay');
          // Aşağıdaki onay akışını tetikle
          const sd2 = (await pool.query('SELECT * FROM bot_durum WHERE musteri_telefon=$1 AND isletme_id=$2', [musteriTelefon, isletmeId])).rows[0];
          const sonuc2 = await randevuService.randevuOlustur({ isletmeId, musteriTelefon, hizmetId: sd2.secilen_hizmet_id, calisanId: sd2.secilen_calisan_id, tarih: sd2.secilen_tarih, saat: sd2.secilen_saat });
          await this.durumGuncelle(musteriTelefon, isletmeId, 'ana_menu', { secilen_hizmet_id: null, secilen_tarih: null, secilen_saat: null, secilen_calisan_id: null });
          await this.cevapGonder(bot, chatId, isletmeId, musteriTelefon,
            `✅ *Randevunuz oluşturuldu!*\n\nGörüşmek üzere! 😊`,
            [[{ text: '📝 Randevularım', callback_data: '2' }],
             [{ text: '🏠 Ana Menü', callback_data: 'ana_menu' }]]);
        } else {
          // Müşteri not yazdı
          const sd3 = (await pool.query('SELECT * FROM bot_durum WHERE musteri_telefon=$1 AND isletme_id=$2', [musteriTelefon, isletmeId])).rows[0];
          const sonuc3 = await randevuService.randevuOlustur({ isletmeId, musteriTelefon, hizmetId: sd3.secilen_hizmet_id, calisanId: sd3.secilen_calisan_id, tarih: sd3.secilen_tarih, saat: sd3.secilen_saat });
          // Notu kaydet
          if (sonuc3 && sonuc3.randevu) {
            await pool.query('UPDATE randevular SET not_text=$1 WHERE id=$2', [metin, sonuc3.randevu.id]);
          }
          await this.durumGuncelle(musteriTelefon, isletmeId, 'ana_menu', { secilen_hizmet_id: null, secilen_tarih: null, secilen_saat: null, secilen_calisan_id: null });
          await this.cevapGonder(bot, chatId, isletmeId, musteriTelefon,
            `✅ *Randevunuz oluşturuldu!*\n\n💬 Notunuz: _"${metin}"_\n\nGörüşmek üzere! 😊`,
            [[{ text: '📝 Randevularım', callback_data: '2' }],
             [{ text: '🏠 Ana Menü', callback_data: 'ana_menu' }]]);
        }
        break;
      }

      case 'not_ekleme': {
        if (mk === 'ana_menu') {
          await this.durumGuncelle(musteriTelefon, isletmeId, 'ana_menu');
          await this.anaMenuGonder(bot, chatId, isletmeId, musteriTelefon, isletme, hizmetler);
          break;
        }
        // Kullanıcı notu yazdı - mevcut randevuya kaydet
        const gd = (await pool.query('SELECT * FROM bot_durum WHERE musteri_telefon=$1 AND isletme_id=$2', [musteriTelefon, isletmeId])).rows[0];
        const randevuId = gd?.secilen_hizmet_id; // not_ekleme state'inde randevu id saklandı
        if (randevuId) {
          await pool.query('UPDATE randevular SET not_text=$1 WHERE id=$2', [metin, randevuId]);
        }
        await this.durumGuncelle(musteriTelefon, isletmeId, 'ana_menu', { secilen_hizmet_id: null });
        await this.cevapGonder(bot, chatId, isletmeId, musteriTelefon,
          `✅ Notunuz kaydedildi!\n\n💬 _"${metin}"_`,
          [[{ text: '📝 Randevularım', callback_data: '2' }],
           [{ text: '🏠 Ana Menü', callback_data: 'ana_menu' }]]);
        break;
      }

      case 'randevu_iptal': {
        const randevuService = require('./randevu');

        // Belirli bir randevuyu iptal et (iptal_ID callback'i)
        if (mk.startsWith('iptal_')) {
          const iptalId = parseInt(mk.replace('iptal_', ''));
          if (iptalId) {
            const iptalEdilen = await randevuService.randevuIptal(iptalId);
            await this.durumGuncelle(musteriTelefon, isletmeId, 'ana_menu', { secilen_hizmet_id: null, secilen_tarih: null, secilen_saat: null });
            await this.cevapGonder(bot, chatId, isletmeId, musteriTelefon,
              `✅ *Randevunuz iptal edildi*\n\n${iptalEdilen ? `📅 ${this.tarihFormat(iptalEdilen.tarih)} • 🕐 ${this.saatFormat(iptalEdilen.saat)}` : ''}\n\nTekrar görüşmek dileğiyle! 👋`,
              [[{ text: '📅 Yeni Randevu', callback_data: '1' }],
               [{ text: '🏠 Ana Menü', callback_data: 'ana_menu' }]]);
          }
          break;
        }

        // Belirli bir randevuyu ertele (ertele_ID callback'i)
        if (mk.startsWith('ertele_')) {
          const erteleId = parseInt(mk.replace('ertele_', ''));
          const erteleRandevu = (await pool.query('SELECT * FROM randevular WHERE id=$1', [erteleId])).rows[0];
          if (erteleRandevu) {
            // Mevcut randevuyu iptal et, aynı hizmetle yeni tarih seç
            await randevuService.randevuIptal(erteleId);
            await this.durumGuncelle(musteriTelefon, isletmeId, 'tarih_secimi', { secilen_hizmet_id: erteleRandevu.hizmet_id });
            await this.cevapGonder(bot, chatId, isletmeId, musteriTelefon,
              `📆 *Randevu Erteleme*\n\nEski randevunuz iptal edildi. Yeni tarih seçin:`,
              [[{ text: '📅 Bugün', callback_data: 'bugun' }, { text: '📅 Yarın', callback_data: 'yarin' }],
               [{ text: '📆 Bu Hafta', callback_data: 'hafta' }],
               [{ text: '🏠 Ana Menü', callback_data: 'ana_menu' }]]);
          }
          break;
        }

        if (mk === 'evet' || mk.includes('iptal et') || mk.includes('yine de')) {
          // Randevu listesini göster - kullanıcı hangisini iptal edeceğini seçsin
          const randevular = await randevuService.musteriRandevulari(musteriTelefon, isletmeId);
          if (!randevular.length) {
            await this.durumGuncelle(musteriTelefon, isletmeId, 'ana_menu');
            await this.cevapGonder(bot, chatId, isletmeId, musteriTelefon,
              `Aktif randevunuz bulunmuyor.`,
              [[{ text: '📅 Randevu Al', callback_data: '1' }],
               [{ text: '🏠 Ana Menü', callback_data: 'ana_menu' }]]);
          } else if (randevular.length === 1) {
            // Tek randevu varsa direkt iptal et
            await randevuService.randevuIptal(randevular[0].id);
            await this.durumGuncelle(musteriTelefon, isletmeId, 'ana_menu', { secilen_hizmet_id: null, secilen_tarih: null, secilen_saat: null });
            await this.cevapGonder(bot, chatId, isletmeId, musteriTelefon,
              `✅ *Randevunuz iptal edildi*\n\n${randevular[0].hizmet_isim || 'Hizmet'}\n📅 ${this.tarihFormat(randevular[0].tarih)} • 🕐 ${this.saatFormat(randevular[0].saat)}\n\nTekrar görüşmek dileğiyle! 👋`,
              [[{ text: '📅 Yeni Randevu', callback_data: '1' }],
               [{ text: '🏠 Ana Menü', callback_data: 'ana_menu' }]]);
          } else {
            // Birden fazla randevu var - seçtir
            let txt = `❌ *Hangi randevuyu iptal etmek istiyorsunuz?*\n\n`;
            const butonlar = [];
            randevular.slice(0, 5).forEach((r, i) => {
              txt += `*${i+1}.* ${r.hizmet_isim || 'Hizmet'}\n     📅 ${this.tarihFormat(r.tarih)} • 🕐 ${this.saatFormat(r.saat)}\n\n`;
              butonlar.push([{ text: `❌ ${i+1}. ${r.hizmet_isim || 'Hizmet'} - ${this.saatFormat(r.saat)}`, callback_data: `iptal_${r.id}` }]);
            });
            butonlar.push([{ text: '🔙 Vazgeç', callback_data: 'ana_menu' }]);
            await this.cevapGonder(bot, chatId, isletmeId, musteriTelefon, txt, butonlar);
          }
        } else if (mk === 'farkli_gun' || mk.includes('farklı') || mk.includes('ertele') || mk.includes('değiştir')) {
          // Ertele - randevu listesi göster, hangisini erteleyeceğini seçsin
          const randevular = await randevuService.musteriRandevulari(musteriTelefon, isletmeId);
          if (!randevular.length) {
            await this.durumGuncelle(musteriTelefon, isletmeId, 'ana_menu');
            await this.cevapGonder(bot, chatId, isletmeId, musteriTelefon,
              `Aktif randevunuz bulunmuyor.`,
              [[{ text: '📅 Randevu Al', callback_data: '1' }],
               [{ text: '🏠 Ana Menü', callback_data: 'ana_menu' }]]);
          } else if (randevular.length === 1) {
            // Tek randevu - direkt ertele (iptal et + aynı hizmetle tarih seç)
            await randevuService.randevuIptal(randevular[0].id);
            await this.durumGuncelle(musteriTelefon, isletmeId, 'tarih_secimi', { secilen_hizmet_id: randevular[0].hizmet_id });
            await this.cevapGonder(bot, chatId, isletmeId, musteriTelefon,
              `📆 *Randevu Erteleme*\n\n${randevular[0].hizmet_isim || 'Hizmet'} randevunuz için yeni tarih seçin:`,
              [[{ text: '📅 Bugün', callback_data: 'bugun' }, { text: '📅 Yarın', callback_data: 'yarin' }],
               [{ text: '📆 Bu Hafta', callback_data: 'hafta' }],
               [{ text: '🏠 Ana Menü', callback_data: 'ana_menu' }]]);
          } else {
            // Birden fazla randevu - hangisini erteleyeceğini seçtir
            let txt = `📆 *Hangi randevuyu ertelemek istiyorsunuz?*\n\n`;
            const butonlar = [];
            randevular.slice(0, 5).forEach((r, i) => {
              txt += `*${i+1}.* ${r.hizmet_isim || 'Hizmet'}\n     📅 ${this.tarihFormat(r.tarih)} • 🕐 ${this.saatFormat(r.saat)}\n\n`;
              butonlar.push([{ text: `📆 ${i+1}. ${r.hizmet_isim || 'Hizmet'} - ${this.saatFormat(r.saat)}`, callback_data: `ertele_${r.id}` }]);
            });
            butonlar.push([{ text: '🔙 Vazgeç', callback_data: 'ana_menu' }]);
            await this.cevapGonder(bot, chatId, isletmeId, musteriTelefon, txt, butonlar);
          }
        } else {
          await this.durumGuncelle(musteriTelefon, isletmeId, 'ana_menu');
          await this.anaMenuGonder(bot, chatId, isletmeId, musteriTelefon, isletme, hizmetler);
        }
        break;
      }

      default: {
        const deepseek = require('./deepseek');
        const aiCevap = await deepseek.serbetCevap(metin, isletme, hizmetler, 'telegram');
        if (aiCevap) {
          await this.cevapGonder(bot, chatId, isletmeId, musteriTelefon, aiCevap,
            [[{ text: '📅 Randevu Al', callback_data: '1' }],
             [{ text: '🏠 Ana Menü', callback_data: 'ana_menu' }]]);
        } else {
          await this.durumGuncelle(musteriTelefon, isletmeId, 'ana_menu');
          await this.anaMenuGonder(bot, chatId, isletmeId, musteriTelefon, isletme, hizmetler);
        }
      }
    }
  }

  async anaMenuGonder(bot, chatId, isletmeId, musteriTelefon, isletme, hizmetler) {
    const musteriIsim = (await pool.query('SELECT isim FROM musteriler WHERE telefon=$1', [musteriTelefon])).rows[0]?.isim || '';

    // Geçmiş randevu (tamamlanmış)
    const gecmisRandevu = (await pool.query(
      `SELECT r.*, h.isim as hizmet_isim FROM randevular r JOIN musteriler m ON r.musteri_id=m.id LEFT JOIN hizmetler h ON r.hizmet_id=h.id WHERE m.telefon=$1 AND r.isletme_id=$2 AND r.tarih < CURRENT_DATE ORDER BY r.tarih DESC LIMIT 1`,
      [musteriTelefon, isletmeId]
    )).rows[0] || null;

    // Yaklaşan randevu (bugün veya ileri tarih)
    const yaklasanRandevu = (await pool.query(
      `SELECT r.*, h.isim as hizmet_isim FROM randevular r JOIN musteriler m ON r.musteri_id=m.id LEFT JOIN hizmetler h ON r.hizmet_id=h.id WHERE m.telefon=$1 AND r.isletme_id=$2 AND r.tarih >= CURRENT_DATE AND r.durum='onaylandi' ORDER BY r.tarih ASC, r.saat ASC LIMIT 1`,
      [musteriTelefon, isletmeId]
    )).rows[0] || null;

    // DeepSeek kişisel karşılama (4sn timeout)
    let msg;
    try {
      const deepseek = require('./deepseek');
      const kisiselMsg = await Promise.race([
        deepseek.kisiselKarsilama(musteriIsim, gecmisRandevu, yaklasanRandevu, isletme, hizmetler || [], 'telegram'),
        new Promise(resolve => setTimeout(() => resolve(null), 4000))
      ]);
      msg = kisiselMsg || `*${isletme.isim}*'e hoş geldiniz! 👋\n\nSize nasıl yardımcı olabilirim?`;
    } catch(e) {
      msg = `*${isletme.isim}*'e hoş geldiniz! 👋\n\nSize nasıl yardımcı olabilirim?`;
    }

    const butonlar = [
      [{ text: '📅 Randevu Al', callback_data: '1' }],
      [{ text: '📝 Randevularım', callback_data: '2' }],
      [{ text: '❌ Randevu İptal', callback_data: '3' }],
      [{ text: '📍 Bize Ulaşın', callback_data: 'bilgi_konum' }, { text: '🕐 Çalışma Saatleri', callback_data: 'bilgi_saatler' }]
    ];

    // Hızlı tekrar: geçmiş randevusu varsa ve yaklaşan yoksa göster
    if (gecmisRandevu && gecmisRandevu.hizmet_isim && !yaklasanRandevu) {
      butonlar.unshift([{ text: `🔄 Tekrar: ${gecmisRandevu.hizmet_isim}`, callback_data: `tekrar_${gecmisRandevu.hizmet_id}` }]);
    }

    await this.cevapGonder(bot, chatId, isletmeId, musteriTelefon, msg, butonlar);
  }

  async hizmetListesiGonder(bot, chatId, isletmeId, musteriTelefon, isletme, hizmetler) {
    const msg = `📋 *Hizmetlerimiz*\n\nSize en uygun hizmeti seçin:`;
    // Tek sütun butonlar, fiyat etiketli — kesilmez
    const butonlar = hizmetler.map((h, i) => [
      { text: `${h.emoji ? h.emoji + ' ' : ''}${h.isim} • ${h.sure_dk}dk • ₺${h.fiyat}`, callback_data: `hz_${i}` }
    ]);
    butonlar.push([{ text: '🔙 Geri', callback_data: 'geri_ana' }, { text: '🏠 Ana Menü', callback_data: 'ana_menu' }]);
    await this.cevapGonder(bot, chatId, isletmeId, musteriTelefon, msg, butonlar);
  }

  async iptalIsle(musteriTelefon, isletme) {
    const randevuService = require('./randevu');
    const randevular = await randevuService.musteriRandevulari(musteriTelefon, isletme.id);
    if (randevular.length === 0) return 'Aktif bir randevunuz bulunmuyor.';
    await randevuService.randevuIptal(randevular[0].id);
    await this.durumGuncelle(musteriTelefon, isletme.id, 'ana_menu', { secilen_hizmet_id: null, secilen_tarih: null, secilen_saat: null });
    return `❌ Randevunuz iptal edildi.\n\n📅 ${this.tarihFormat(randevular[0].tarih)} ${randevular[0].saat}`;
  }

  async cevapGonder(bot, chatId, isletmeId, musteriTelefon, mesaj, inlineKeyboard = null) {
    const replyMarkup = inlineKeyboard ? { inline_keyboard: inlineKeyboard } : undefined;

    const gonder = async (text, parseMode) => {
      const opts = {};
      if (parseMode) opts.parse_mode = parseMode;
      if (replyMarkup) opts.reply_markup = replyMarkup;

      // Callback'den geldiyse → mevcut mesajı düzenle
      if (this._editMsgId) {
        opts.chat_id = chatId;
        opts.message_id = this._editMsgId;
        await bot.editMessageText(text, opts);
        this._editMsgId = null; // bir kere kullan
      } else {
        await bot.sendMessage(chatId, text, opts);
      }
    };

    try {
      await gonder(mesaj, 'Markdown');
    } catch (mdErr) {
      // Markdown hatası veya edit hatası → plain text yeni mesaj
      console.warn('⚠️ Mesaj gönderim hatası, plain text denenecek:', mdErr.message);
      try {
        this._editMsgId = null; // edit başarısızsa yeni mesaj gönder
        const plainMesaj = mesaj.replace(/\*/g, '').replace(/_/g, '').replace(/`/g, '');
        await bot.sendMessage(chatId, plainMesaj, replyMarkup ? { reply_markup: replyMarkup } : {});
      } catch (e2) {
        console.error('❌ Mesaj gönderilemedi:', e2.message);
      }
    }

    await pool.query(
      'INSERT INTO sohbet_gecmisi (musteri_telefon, isletme_id, yon, mesaj) VALUES ($1, $2, $3, $4)',
      [musteriTelefon, isletmeId, 'giden', mesaj]
    ).catch(() => {});
  }

  async durumGuncelle(musteriTelefon, isletmeId, asama, ekstra = {}) {
    const fields = ['asama = $3', 'son_aktivite = NOW()'];
    const values = [musteriTelefon, isletmeId, asama];
    let i = 4;
    for (const [k, v] of Object.entries(ekstra)) {
      fields.push(`${k} = $${i}`); values.push(v); i++;
    }
    await pool.query(
      `UPDATE bot_durum SET ${fields.join(', ')} WHERE musteri_telefon=$1 AND isletme_id=$2`, values
    );
  }

  kategoriEmoji(kategori) {
    if (!kategori) return '🏥';
    const k = kategori.toLowerCase();
    if (k.includes('dis') || k.includes('diş')) return '🦷';
    if (k.includes('kuaf') || k.includes('berber') || k.includes('saç')) return '✂️';
    if (k.includes('güzel') || k.includes('spa') || k.includes('bakım')) return '💆';
    if (k.includes('spor') || k.includes('fitness')) return '🏋️';
    if (k.includes('doktor') || k.includes('klinik') || k.includes('sağlık')) return '🏥';
    if (k.includes('vet') || k.includes('hayvan')) return '🐾';
    if (k.includes('oto') || k.includes('araba') || k.includes('araç')) return '🚗';
    if (k.includes('avukat') || k.includes('hukuk')) return '⚖️';
    if (k.includes('foto') || k.includes('stud')) return '📸';
    return '🏥';
  }

  tarihFormat(tarih) {
    const d = new Date(tarih);
    const gunler = ['Pazar','Pazartesi','Salı','Çarşamba','Perşembe','Cuma','Cumartesi'];
    const aylar = ['Ocak','Şubat','Mart','Nisan','Mayıs','Haziran','Temmuz','Ağustos','Eylül','Ekim','Kasım','Aralık'];
    return `${d.getDate()} ${aylar[d.getMonth()]} ${gunler[d.getDay()]}`;
  }

  saatFormat(saat) {
    if (!saat) return '';
    return String(saat).substring(0, 5);
  }
}

module.exports = new TelegramService();
