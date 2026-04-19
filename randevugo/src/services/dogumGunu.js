const cron = require('node-cron');
const pool = require('../config/db');
const siragoImza = require('../utils/siragoImza');

class DogumGunuService {

  baslat() {
    // Her sabah 10:00'da çalış (Türkiye saati)
    cron.schedule('0 10 * * *', async () => {
      await this.dogumGunuTara();
    }, { timezone: 'Europe/Istanbul' });
    console.log('🎂 Doğum günü servisi başlatıldı (her gün 10:00)');
  }

  async dogumGunuTara() {
    try {
      // Bugün doğum günü olan müşterileri bul (ay+gün eşleşmesi, yıl fark etmez)
      const bugun = new Date();
      const ay = bugun.getMonth() + 1;
      const gun = bugun.getDate();

      const isletmeler = (await pool.query(
        `SELECT id, isim, dogum_gunu_aktif, dogum_gunu_indirim, dogum_gunu_mesaj_sablonu, telegram_token
         FROM isletmeler WHERE dogum_gunu_aktif = true AND paket IN ('profesyonel', 'kurumsal', 'premium')`
      )).rows;

      for (const isletme of isletmeler) {
        const musteriler = (await pool.query(
          `SELECT id, isim, telefon, dogum_tarihi
           FROM musteriler
           WHERE isletme_id = $1
             AND dogum_tarihi IS NOT NULL
             AND EXTRACT(MONTH FROM dogum_tarihi) = $2
             AND EXTRACT(DAY FROM dogum_tarihi) = $3
             AND NOT EXISTS (
               SELECT 1 FROM dogum_gunu_log d 
               WHERE d.musteri_id = musteriler.id 
                 AND d.isletme_id = $1 
                 AND EXTRACT(YEAR FROM d.gonderim_tarihi) = EXTRACT(YEAR FROM NOW())
             )`,
          [isletme.id, ay, gun]
        )).rows;

        for (const musteri of musteriler) {
          await this.kutlamaGonder(isletme, musteri);
        }

        if (musteriler.length > 0) {
          console.log(`🎂 ${isletme.isim}: ${musteriler.length} müşteriye doğum günü mesajı gönderildi`);
        }
      }
    } catch (e) {
      console.error('❌ Doğum günü tarama hatası:', e.message);
    }
  }

  async kutlamaGonder(isletme, musteri) {
    const ad = (musteri.isim || '').split(' ')[0] || 'Değerli müşterimiz';
    const indirim = isletme.dogum_gunu_indirim || 30;

    const sablon = isletme.dogum_gunu_mesaj_sablonu ||
      `🎂 *Doğum günün kutlu olsun ${ad}!*\n\n` +
      `${isletme.isim} ailesi olarak sana özel bir hediyemiz var:\n\n` +
      `🎁 *Bu hafta %${indirim} indirim!*\n\n` +
      `Sadece senin için 7 gün geçerli. Arkadaşını da getir, o da %${indirim} indirim kazansın 🎉\n\n` +
      `Randevu için mesaj at, yerini ayarlayalım 💫`;

    const mesaj = sablon
      .replace(/\{isim\}/g, ad)
      .replace(/\{isletme\}/g, isletme.isim)
      .replace(/\{indirim\}/g, indirim);

    const mesajWithSignature = siragoImza.imzaEkle(mesaj, isletme);

    let durum = 'gonderildi';
    try {
      const isTelegram = musteri.telefon && musteri.telefon.startsWith('tg:');
      if (isTelegram && isletme.telegram_token) {
        try {
          const telegram = require('./telegram');
          const chatId = musteri.telefon.slice(3);
          const bot = telegram.botlar?.[isletme.id];
          if (bot) {
            await bot.sendMessage(chatId, mesajWithSignature, { parse_mode: 'Markdown' });
          } else { durum = 'baglanti_yok'; }
        } catch(e) { durum = 'hata'; }
      } else if (!isTelegram) {
        try {
          const whatsappWeb = require('./whatsappWeb');
          const waDurum = whatsappWeb.getDurum(isletme.id);
          if (waDurum?.durum === 'bagli') {
            await whatsappWeb.mesajGonder(isletme.id, musteri.telefon, mesajWithSignature);
          } else { durum = 'baglanti_yok'; }
        } catch(e) { durum = 'hata'; }
      }
    } catch (e) {
      durum = 'hata';
      console.error('Doğum günü mesaj hatası:', e.message);
    }

    await pool.query(
      `INSERT INTO dogum_gunu_log (isletme_id, musteri_id, indirim, durum) VALUES ($1, $2, $3, $4)`,
      [isletme.id, musteri.id, indirim, durum]
    );
  }

  // Tek seferlik toplu profil güncelleme mesajı (eski müşterilerden doğum tarihi topla)
  async topluProfilGuncelleme(isletmeId) {
    try {
      const isletme = (await pool.query(
        `SELECT id, isim, telegram_token FROM isletmeler WHERE id=$1`,
        [isletmeId]
      )).rows[0];
      if (!isletme) return { basarili: false, mesaj: 'İşletme bulunamadı' };

      // Doğum tarihi henüz boş olan tüm müşteriler
      const musteriler = (await pool.query(
        `SELECT id, isim, telefon FROM musteriler
         WHERE isletme_id = $1 AND dogum_tarihi IS NULL AND telefon IS NOT NULL AND telefon != ''`,
        [isletmeId]
      )).rows;

      const mesajSablonu = (isim) => {
        const mesaj = `Merhaba${isim ? ' ' + isim.split(' ')[0] : ''}! *${isletme.isim}* olarak sistemimizi yeniledik 🎉\n\n` +
          `🎂 Doğum gününüzde size özel hediyeler ve indirimler sunabilmemiz için doğum tarihinizi *gün ve ay olarak* (Örn: 05.10 veya 5 Ekim) yazarak iletebilir misiniz?\n\n` +
          `_İstemiyorsanız bu mesajı yanıtsız bırakabilirsiniz._`;
        return siragoImza.imzaEkle(mesaj, isletme);
      };

      let gonderilen = 0;
      let hata = 0;

      // Anti-ban: müşteriler arasında 2-5 saniye random bekleme
      for (const m of musteriler) {
        try {
          const isTelegram = m.telefon.startsWith('tg:');
          const mesaj = mesajSablonu(m.isim);
          if (isTelegram && isletme.telegram_token) {
            const telegram = require('./telegram');
            const chatId = m.telefon.slice(3);
            const bot = telegram.botlar?.[isletmeId];
            if (bot) {
              await bot.sendMessage(chatId, mesaj, { parse_mode: 'Markdown' });
              // TG için state Bot'a gider ama basit olsun, sadece WA'da state değiştireceğiz
              gonderilen++;
            }
          } else if (!isTelegram) {
            const whatsappWeb = require('./whatsappWeb');
            const waDurum = whatsappWeb.getDurum(isletmeId);
            if (waDurum?.durum === 'bagli') {
              await whatsappWeb.mesajGonder(isletmeId, m.telefon, mesaj);
              // Bir sonraki yanıtı doğum tarihi olarak beklesin
              try {
                await pool.query(
                  `INSERT INTO bot_durum (musteri_telefon, isletme_id, asama, son_aktivite) VALUES ($1, $2, 'dogum_tarihi_bekleniyor', NOW())
                   ON CONFLICT (musteri_telefon, isletme_id) DO UPDATE SET asama='dogum_tarihi_bekleniyor', son_aktivite=NOW()`,
                  [m.telefon, isletmeId]
                );
              } catch(e) { /* bot_durum tablosu yoksa skip */ }
              gonderilen++;
            }
          }
          // Anti-ban: 2-5 saniye bekle
          await new Promise(r => setTimeout(r, 2000 + Math.random() * 3000));
        } catch (e) {
          hata++;
          console.log(`⚠️ Profil güncelleme mesaj hatası (${m.telefon}):`, e.message);
        }
      }

      console.log(`📬 ${isletme.isim}: ${gonderilen}/${musteriler.length} müşteriye profil güncelleme mesajı gönderildi`);
      return { basarili: true, toplam: musteriler.length, gonderilen, hata };
    } catch (e) {
      console.error('Toplu profil güncelleme hatası:', e.message);
      return { basarili: false, mesaj: e.message };
    }
  }

  // Manuel tetikleme (test için)
  async manuelTarama(isletmeId) {
    try {
      const bugun = new Date();
      const ay = bugun.getMonth() + 1;
      const gun = bugun.getDate();
      const isletme = (await pool.query(
        `SELECT id, isim, dogum_gunu_aktif, dogum_gunu_indirim, dogum_gunu_mesaj_sablonu, telegram_token FROM isletmeler WHERE id=$1`,
        [isletmeId]
      )).rows[0];
      if (!isletme) return { basarili: false, mesaj: 'İşletme bulunamadı' };

      const musteriler = (await pool.query(
        `SELECT id, isim, telefon, dogum_tarihi FROM musteriler
         WHERE isletme_id = $1 AND dogum_tarihi IS NOT NULL
           AND EXTRACT(MONTH FROM dogum_tarihi) = $2 AND EXTRACT(DAY FROM dogum_tarihi) = $3`,
        [isletmeId, ay, gun]
      )).rows;

      for (const m of musteriler) await this.kutlamaGonder(isletme, m);
      return { basarili: true, gonderilen: musteriler.length };
    } catch (e) {
      return { basarili: false, mesaj: e.message };
    }
  }
}

module.exports = new DogumGunuService();
