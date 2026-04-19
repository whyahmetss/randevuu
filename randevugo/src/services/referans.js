const pool = require('../config/db');
const crypto = require('crypto');
const siragoImza = require('../utils/siragoImza');

class ReferansService {

  // Müşteriye referans kodu üret
  async kodUret(isletmeId, musteriId) {
    const musteri = (await pool.query('SELECT referans_kodu FROM musteriler WHERE id=$1', [musteriId])).rows[0];
    if (musteri?.referans_kodu) return musteri.referans_kodu;

    const kod = crypto.randomBytes(3).toString('hex').toUpperCase(); // 6 karakter
    await pool.query('UPDATE musteriler SET referans_kodu=$1 WHERE id=$2', [kod, musteriId]);
    return kod;
  }

  // Referans kodu ile davetli kaydı
  async referansKullan(isletmeId, davetliTelefon, referansKodu) {
    try {
      const isletme = (await pool.query(
        'SELECT referans_aktif, referans_puan_davet, referans_puan_davetli FROM isletmeler WHERE id=$1',
        [isletmeId]
      )).rows[0];
      if (!isletme?.referans_aktif) return null;

      // Kodu kimin kullandığını bul
      const davetEden = (await pool.query(
        'SELECT id, isim FROM musteriler WHERE referans_kodu=$1 AND isletme_id=$2',
        [referansKodu.toUpperCase(), isletmeId]
      )).rows[0];
      if (!davetEden) return { hata: 'Geçersiz referans kodu' };

      // Kendini davet edemez
      const davetli = (await pool.query('SELECT id FROM musteriler WHERE telefon=$1 AND isletme_id=$2', [davetliTelefon, isletmeId])).rows[0];
      if (davetli && davetli.id === davetEden.id) return { hata: 'Kendi kodunuzu kullanamazsınız' };

      // Daha önce referansla gelmiş mi?
      if (davetli) {
        const mevcut = (await pool.query(
          'SELECT id FROM referans_log WHERE isletme_id=$1 AND davetli_telefon=$2',
          [isletmeId, davetliTelefon]
        )).rows[0];
        if (mevcut) return { hata: 'Bu numara zaten referansla kayıtlı' };
      }

      // Referans kaydı oluştur
      await pool.query(
        `INSERT INTO referans_log (isletme_id, davet_eden_id, davetli_telefon, referans_kodu, durum) VALUES ($1, $2, $3, $4, 'bekliyor')`,
        [isletmeId, davetEden.id, davetliTelefon, referansKodu.toUpperCase()]
      );

      return { basarili: true, davetEden: davetEden.isim };
    } catch (e) {
      console.error('Referans kullanma hatası:', e.message);
      return { hata: e.message };
    }
  }

  // Randevu tamamlandığında referans puanlarını ver
  async referansPuanVer(isletmeId, musteriId, musteriTelefon) {
    try {
      const isletme = (await pool.query(
        'SELECT referans_aktif, referans_puan_davet, referans_puan_davetli FROM isletmeler WHERE id=$1',
        [isletmeId]
      )).rows[0];
      if (!isletme?.referans_aktif) return;

      // Bu müşterinin referans kaydı var mı?
      const log = (await pool.query(
        `SELECT * FROM referans_log WHERE isletme_id=$1 AND davetli_telefon=$2 AND durum='bekliyor' AND puan_verildi=false`,
        [isletmeId, musteriTelefon]
      )).rows[0];
      if (!log) return;

      const sadakatPuan = require('./sadakatPuan');

      // Davet edene puan
      if (log.davet_eden_id) {
        await sadakatPuan.puanEkle2(isletmeId, log.davet_eden_id, isletme.referans_puan_davet || 200, 'Referans bonusu (arkadaş getirme)');
      }

      // Davetliye puan
      await sadakatPuan.puanEkle2(isletmeId, musteriId, isletme.referans_puan_davetli || 100, 'Hoş geldin bonusu (referans)');

      // Kaydı güncelle
      await pool.query(
        "UPDATE referans_log SET durum='tamamlandi', puan_verildi=true, davetli_id=$1 WHERE id=$2",
        [musteriId, log.id]
      );
      await pool.query("UPDATE musteriler SET referans_ile_gelen=true, davet_eden_id=$1 WHERE id=$2", [log.davet_eden_id, musteriId]);

      console.log(`🤝 Referans puanları verildi: davet eden=${log.davet_eden_id}, davetli=${musteriId}`);
    } catch (e) {
      console.error('Referans puan hatası:', e.message);
    }
  }

  // Randevu tamamlandıktan sonra müşteriye "Arkadaşını getir" davet mesajı gönder (VİRAL DÖNGÜ)
  async davetMesajiGonder(isletmeId, musteriId, musteriTelefon, musteriIsim) {
    try {
      const isletme = (await pool.query(
        `SELECT id, isim, referans_aktif, referans_puan_davet, referans_puan_davetli, telegram_token FROM isletmeler WHERE id=$1`,
        [isletmeId]
      )).rows[0];
      if (!isletme?.referans_aktif) return;

      // Müşterinin referans kodunu al/üret
      const kod = await this.kodUret(isletmeId, musteriId);
      const ad = (musteriIsim || '').split(' ')[0] || 'Değerli müşterimiz';
      const puanDavet = isletme.referans_puan_davet || 200;
      const puanDavetli = isletme.referans_puan_davetli || 100;

      const mesaj = `Merhaba ${ad}, bugün *${isletme.isim}*'ye geldiğin için teşekkürler 🙏\n\n` +
        `🎁 *ARKADAŞINI GETİR, İKİNİZ DE KAZAN!*\n\n` +
        `Bu kodu bir arkadaşına gönder:\n` +
        `🔑 *${kod}*\n\n` +
        `✨ Arkadaşın ilk randevusunda *${puanDavetli} puan* (indirim) kazanır\n` +
        `✨ Sen bir sonraki gelişinde *${puanDavet} puan* (hediye hizmet) kazanırsın\n\n` +
        `Randevu için: Mesaj at → Kod ${kod} yaz → Arkadaşın hediyeyle gelsin 🎉`;

      const mesajWithSignature = siragoImza.imzaEkle(mesaj, isletme);

      // Telegram mı WhatsApp mı?
      const isTelegram = musteriTelefon && musteriTelefon.startsWith('tg:');
      if (isTelegram && isletme.telegram_token) {
        try {
          const telegram = require('./telegram');
          const chatId = musteriTelefon.slice(3);
          const bot = telegram.botlar?.[isletmeId];
          if (bot) {
            await bot.sendMessage(chatId, mesajWithSignature, { parse_mode: 'Markdown' });
          }
        } catch(e) { console.log('⚠️ Referans TG gönderim hatası:', e.message); }
      } else if (!isTelegram) {
        try {
          const whatsappWeb = require('./whatsappWeb');
          const waDurum = whatsappWeb.getDurum(isletmeId);
          if (waDurum?.durum === 'bagli') {
            await whatsappWeb.mesajGonder(isletmeId, musteriTelefon, mesajWithSignature);
          }
        } catch(e) { console.log('⚠️ Referans WA gönderim hatası:', e.message); }
      }

      console.log(`🎁 Referans davet mesajı gönderildi: ${ad} (${musteriTelefon}) kod=${kod}`);
    } catch (e) {
      console.error('Referans davet mesajı hatası:', e.message);
    }
  }

  // Bot'tan referans kodu sorgulama
  async kodSorgula(isletmeId, musteriTelefon) {
    const musteri = (await pool.query(
      'SELECT id, referans_kodu FROM musteriler WHERE telefon=$1 AND isletme_id=$2',
      [musteriTelefon, isletmeId]
    )).rows[0];
    if (!musteri) return null;

    let kod = musteri.referans_kodu;
    if (!kod) {
      kod = await this.kodUret(isletmeId, musteri.id);
    }

    const davetSayisi = (await pool.query(
      "SELECT COUNT(*) as sayi FROM referans_log WHERE isletme_id=$1 AND davet_eden_id=$2 AND durum='tamamlandi'",
      [isletmeId, musteri.id]
    )).rows[0];

    return { kod, davetSayisi: parseInt(davetSayisi?.sayi || 0) };
  }
}

module.exports = new ReferansService();
