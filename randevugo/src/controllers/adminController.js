const pool = require('../config/db');
const { bugunTarih, gunSonraTarih } = require('../utils/tarih');
const bcrypt = require('bcryptjs');
const randevuService = require('../services/randevu');
const PAKETLER = require('../config/paketler');
const avciBot = require('../services/avciBot');
const iyzicoService = require('../services/iyzicoService');

class AdminController {

  // ==================== RANDEVULAR ====================

  async randevulariGetir(req, res) {
    try {
      const { tarih, durum } = req.query;
      const isletmeId = req.kullanici.isletme_id;
      
      let query = `
        SELECT r.*, m.isim as musteri_isim, m.telefon as musteri_telefon,
               h.isim as hizmet_isim, h.fiyat, c.isim as calisan_isim
        FROM randevular r
        JOIN musteriler m ON r.musteri_id = m.id
        LEFT JOIN hizmetler h ON r.hizmet_id = h.id
        LEFT JOIN calisanlar c ON r.calisan_id = c.id
        WHERE r.isletme_id = $1
      `;
      const params = [isletmeId];

      if (tarih) { query += ` AND r.tarih = $${params.length + 1}`; params.push(tarih); }
      if (durum) { query += ` AND r.durum = $${params.length + 1}`; params.push(durum); }
      
      query += ' ORDER BY r.tarih DESC, r.saat ASC';

      const randevular = (await pool.query(query, params)).rows;
      res.json({ randevular });
    } catch (error) {
      res.status(500).json({ hata: error.message });
    }
  }

  async randevuDurumGuncelle(req, res) {
    try {
      const { id } = req.params;
      const { durum } = req.body;
      const result = await pool.query(
        'UPDATE randevular SET durum = $1 WHERE id = $2 AND isletme_id = $3 RETURNING *',
        [durum, id, req.kullanici.isletme_id]
      );
      res.json({ randevu: result.rows[0] });
    } catch (error) {
      res.status(500).json({ hata: error.message });
    }
  }

  // ==================== HİZMETLER ====================

  async hizmetleriGetir(req, res) {
    try {
      const result = await pool.query(
        'SELECT * FROM hizmetler WHERE isletme_id = $1 ORDER BY id', [req.kullanici.isletme_id]
      );
      res.json({ hizmetler: result.rows });
    } catch (error) {
      res.status(500).json({ hata: error.message });
    }
  }

  async hizmetEkle(req, res) {
    try {
      const { isim, sure_dk, fiyat, aciklama, emoji } = req.body;
      const isletme = (await pool.query('SELECT paket FROM isletmeler WHERE id=$1', [req.kullanici.isletme_id])).rows[0];
      const paket = PAKETLER[isletme?.paket] || PAKETLER.baslangic;
      const mevcut = (await pool.query('SELECT COUNT(*) as sayi FROM hizmetler WHERE isletme_id=$1 AND aktif=true', [req.kullanici.isletme_id])).rows[0];
      if (parseInt(mevcut.sayi) >= paket.hizmet_limit) {
        return res.status(403).json({ hata: `${paket.isim} paketinde en fazla ${paket.hizmet_limit} hizmet ekleyebilirsiniz. Paketinizi yükseltin.`, limit_asimi: true });
      }
      const result = await pool.query(
        'INSERT INTO hizmetler (isletme_id, isim, sure_dk, fiyat, aciklama, emoji) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
        [req.kullanici.isletme_id, isim, sure_dk, fiyat, aciklama, emoji || '']
      );
      res.json({ hizmet: result.rows[0] });
    } catch (error) {
      res.status(500).json({ hata: error.message });
    }
  }

  async hizmetGuncelle(req, res) {
    try {
      const { id } = req.params;
      const { isim, sure_dk, fiyat, aciklama, aktif, emoji } = req.body;
      const result = await pool.query(
        'UPDATE hizmetler SET isim=$1, sure_dk=$2, fiyat=$3, aciklama=$4, aktif=$5, emoji=$6 WHERE id=$7 AND isletme_id=$8 RETURNING *',
        [isim, sure_dk, fiyat, aciklama, aktif, emoji || '', id, req.kullanici.isletme_id]
      );
      res.json({ hizmet: result.rows[0] });
    } catch (error) {
      res.status(500).json({ hata: error.message });
    }
  }

  async hizmetSil(req, res) {
    try {
      await pool.query('DELETE FROM hizmetler WHERE id = $1 AND isletme_id = $2', [req.params.id, req.kullanici.isletme_id]);
      res.json({ mesaj: 'Silindi' });
    } catch (error) {
      res.status(500).json({ hata: error.message });
    }
  }

  // ==================== ÇALIŞANLAR ====================

  async calisanlariGetir(req, res) {
    try {
      const result = await pool.query(
        'SELECT * FROM calisanlar WHERE isletme_id = $1 ORDER BY id', [req.kullanici.isletme_id]
      );
      res.json({ calisanlar: result.rows });
    } catch (error) {
      res.status(500).json({ hata: error.message });
    }
  }

  async calisanEkle(req, res) {
    try {
      const { isim, telefon, uzmanlik } = req.body;
      const isletme = (await pool.query('SELECT paket FROM isletmeler WHERE id=$1', [req.kullanici.isletme_id])).rows[0];
      const paket = PAKETLER[isletme?.paket] || PAKETLER.baslangic;
      const mevcut = (await pool.query('SELECT COUNT(*) as sayi FROM calisanlar WHERE isletme_id=$1 AND aktif=true', [req.kullanici.isletme_id])).rows[0];
      if (parseInt(mevcut.sayi) >= paket.calisan_limit) {
        return res.status(403).json({ hata: `${paket.isim} paketinde en fazla ${paket.calisan_limit} çalışan ekleyebilirsiniz. Paketinizi yükseltin.`, limit_asimi: true });
      }
      const result = await pool.query(
        'INSERT INTO calisanlar (isletme_id, isim, telefon, uzmanlik) VALUES ($1, $2, $3, $4) RETURNING *',
        [req.kullanici.isletme_id, isim, telefon, uzmanlik]
      );
      res.json({ calisan: result.rows[0] });
    } catch (error) {
      res.status(500).json({ hata: error.message });
    }
  }

  // ==================== MÜŞTERİLER ====================

  async musterileriGetir(req, res) {
    try {
      const result = await pool.query(`
        SELECT m.*, COUNT(r.id) as randevu_sayisi, MAX(r.tarih) as son_randevu
        FROM musteriler m
        JOIN randevular r ON r.musteri_id = m.id
        WHERE r.isletme_id = $1
        GROUP BY m.id ORDER BY son_randevu DESC
      `, [req.kullanici.isletme_id]);
      res.json({ musteriler: result.rows });
    } catch (error) {
      res.status(500).json({ hata: error.message });
    }
  }

  // ==================== İSTATİSTİKLER ====================

  async istatistikler(req, res) {
    try {
      const isletmeId = req.kullanici.isletme_id;
      const bugun = bugunTarih();
      
      // Bugünün randevuları
      const bugunStats = await randevuService.istatistikler(isletmeId, bugun, bugun);

      // Bu hafta
      const haftaBasi = new Date();
      haftaBasi.setDate(haftaBasi.getDate() - haftaBasi.getDay() + 1);
      const haftaBasiStr = haftaBasi.toLocaleDateString('sv-SE', { timeZone: 'Europe/Istanbul' });
      const haftaStats = await randevuService.istatistikler(isletmeId, haftaBasiStr, bugun);

      // Bu ay
      const ayBasi = new Date();
      ayBasi.setDate(1);
      const ayBasiStr = ayBasi.toLocaleDateString('sv-SE', { timeZone: 'Europe/Istanbul' });
      const ayStats = await randevuService.istatistikler(isletmeId, ayBasiStr, bugun);

      // Toplam müşteri
      const musteriSayisi = (await pool.query(`
        SELECT COUNT(DISTINCT m.id) as sayi FROM musteriler m
        JOIN randevular r ON r.musteri_id = m.id WHERE r.isletme_id = $1
      `, [isletmeId])).rows[0];

      // Müsait saatler (bugün)
      const musaitSaatler = await randevuService.musaitSaatleriGetir(isletmeId, bugun);

      // Memnuniyet ortalaması
      const memnuniyetOrt = (await pool.query(
        'SELECT ROUND(AVG(puan)::numeric, 1) as ortalama, COUNT(*) as toplam FROM memnuniyet WHERE isletme_id=$1', [isletmeId]
      )).rows[0];

      // En popüler hizmet
      const populerHizmet = (await pool.query(`
        SELECT h.isim, COUNT(r.id) as sayi FROM randevular r
        JOIN hizmetler h ON r.hizmet_id = h.id
        WHERE r.isletme_id=$1 AND r.tarih >= $2
        GROUP BY h.isim ORDER BY sayi DESC LIMIT 3
      `, [isletmeId, ayBasiStr])).rows;

      // Bekleme listesi
      const bekleyenSayisi = (await pool.query(
        "SELECT COUNT(*) as sayi FROM bekleme_listesi WHERE isletme_id=$1 AND durum='bekliyor'", [isletmeId]
      )).rows[0];

      // Gelir (bu ay onaylanan randevular)
      const gelir = (await pool.query(`
        SELECT COALESCE(SUM(h.fiyat), 0) as toplam FROM randevular r
        JOIN hizmetler h ON r.hizmet_id = h.id
        WHERE r.isletme_id=$1 AND r.tarih >= $2 AND r.durum IN ('onaylandi','tamamlandi')
      `, [isletmeId, ayBasiStr])).rows[0];

      res.json({
        bugun: bugunStats,
        hafta: haftaStats,
        ay: ayStats,
        toplam_musteri: parseInt(musteriSayisi.sayi),
        bugun_musait_saat: musaitSaatler.length,
        memnuniyet: { ortalama: parseFloat(memnuniyetOrt.ortalama) || 0, toplam: parseInt(memnuniyetOrt.toplam) },
        populer_hizmetler: populerHizmet,
        bekleme_listesi: parseInt(bekleyenSayisi.sayi),
        aylik_gelir: parseFloat(gelir.toplam)
      });
    } catch (error) {
      res.status(500).json({ hata: error.message });
    }
  }

  // ==================== KAMPANYALAR ====================

  async kampanyalariGetir(req, res) {
    try {
      const result = await pool.query(
        'SELECT * FROM kampanyalar WHERE isletme_id=$1 ORDER BY olusturma_tarihi DESC', [req.kullanici.isletme_id]
      );
      res.json({ kampanyalar: result.rows });
    } catch (error) {
      res.status(500).json({ hata: error.message });
    }
  }

  async kampanyaEkle(req, res) {
    try {
      const { baslik, mesaj, baslangic_tarihi, bitis_tarihi } = req.body;
      if (!baslik || !mesaj) return res.status(400).json({ hata: 'Başlık ve mesaj gerekli' });
      const result = await pool.query(
        'INSERT INTO kampanyalar (isletme_id, baslik, mesaj, baslangic_tarihi, bitis_tarihi) VALUES ($1,$2,$3,$4,$5) RETURNING *',
        [req.kullanici.isletme_id, baslik, mesaj, baslangic_tarihi || null, bitis_tarihi || null]
      );
      res.json({ kampanya: result.rows[0] });
    } catch (error) {
      res.status(500).json({ hata: error.message });
    }
  }

  async kampanyaGonder(req, res) {
    try {
      const { id } = req.params;
      const isletmeId = req.kullanici.isletme_id;
      const kampanya = (await pool.query('SELECT * FROM kampanyalar WHERE id=$1 AND isletme_id=$2', [id, isletmeId])).rows[0];
      if (!kampanya) return res.status(404).json({ hata: 'Kampanya bulunamadı' });

      // Tüm müşteri telefonlarını al
      const musteriler = (await pool.query(`
        SELECT DISTINCT m.telefon FROM musteriler m
        JOIN randevular r ON r.musteri_id = m.id WHERE r.isletme_id=$1
      `, [isletmeId])).rows;

      const isletme = (await pool.query('SELECT * FROM isletmeler WHERE id=$1', [isletmeId])).rows[0];
      const mesajMetni = `🏷️ *${kampanya.baslik}*\n\n${kampanya.mesaj}\n\n_${isletme.isim}_`;

      let gonderilen = 0;
      // Telegram üzerinden gönder
      if (isletme.telegram_token) {
        const telegramService = require('../services/telegram');
        const bot = telegramService.botlar[isletmeId];
        if (bot) {
          for (const m of musteriler) {
            try {
              const bd = (await pool.query('SELECT * FROM bot_durum WHERE musteri_telefon=$1 AND isletme_id=$2', [m.telefon, isletmeId])).rows[0];
              if (bd) {
                await bot.sendMessage(m.telefon, mesajMetni, {
                  parse_mode: 'Markdown',
                  reply_markup: { inline_keyboard: [[{ text: '📅 Randevu Al', callback_data: '1' }], [{ text: '🏠 Ana Menü', callback_data: 'ana_menu' }]] }
                });
                gonderilen++;
              }
            } catch (e) { /* skip failed */ }
          }
        }
      }

      await pool.query("UPDATE kampanyalar SET gonderim_durumu='gonderildi', gonderim_tarihi=NOW() WHERE id=$1", [id]);
      res.json({ mesaj: `Kampanya ${gonderilen} müşteriye gönderildi`, gonderilen });
    } catch (error) {
      res.status(500).json({ hata: error.message });
    }
  }

  async kampanyaSil(req, res) {
    try {
      await pool.query('DELETE FROM kampanyalar WHERE id=$1 AND isletme_id=$2', [req.params.id, req.kullanici.isletme_id]);
      res.json({ mesaj: 'Kampanya silindi' });
    } catch (error) {
      res.status(500).json({ hata: error.message });
    }
  }

  // ==================== MEMNUNIYET ====================

  async memnuniyetleriGetir(req, res) {
    try {
      const result = await pool.query(`
        SELECT mn.*, m.isim as musteri_isim, m.telefon, h.isim as hizmet_isim, r.tarih, r.saat
        FROM memnuniyet mn
        JOIN musteriler m ON mn.musteri_id = m.id
        LEFT JOIN randevular r ON mn.randevu_id = r.id
        LEFT JOIN hizmetler h ON r.hizmet_id = h.id
        WHERE mn.isletme_id=$1 ORDER BY mn.olusturma_tarihi DESC
      `, [req.kullanici.isletme_id]);
      res.json({ memnuniyetler: result.rows });
    } catch (error) {
      res.status(500).json({ hata: error.message });
    }
  }

  // ==================== BEKLEME LİSTESİ ====================

  async beklemeListesiGetir(req, res) {
    try {
      const result = await pool.query(`
        SELECT bl.*, h.isim as hizmet_isim
        FROM bekleme_listesi bl
        LEFT JOIN hizmetler h ON bl.hizmet_id = h.id
        WHERE bl.isletme_id=$1 ORDER BY bl.olusturma_tarihi DESC
      `, [req.kullanici.isletme_id]);
      res.json({ bekleme_listesi: result.rows });
    } catch (error) {
      res.status(500).json({ hata: error.message });
    }
  }

  // ==================== AYARLAR ====================

  async paketBilgisi(req, res) {
    try {
      const isletme = (await pool.query('SELECT paket FROM isletmeler WHERE id=$1', [req.kullanici.isletme_id])).rows[0];
      const paketAdi = isletme?.paket || 'baslangic';
      const paket = PAKETLER[paketAdi] || PAKETLER.baslangic;
      const calisanSayisi = (await pool.query('SELECT COUNT(*) as sayi FROM calisanlar WHERE isletme_id=$1 AND aktif=true', [req.kullanici.isletme_id])).rows[0];
      const hizmetSayisi = (await pool.query('SELECT COUNT(*) as sayi FROM hizmetler WHERE isletme_id=$1 AND aktif=true', [req.kullanici.isletme_id])).rows[0];
      const buAyBasi = new Date(); buAyBasi.setDate(1);
      const buAyBasiStr = buAyBasi.toLocaleDateString('sv-SE', { timeZone: 'Europe/Istanbul' });
      const randevuSayisi = (await pool.query('SELECT COUNT(*) as sayi FROM randevular WHERE isletme_id=$1 AND tarih >= $2', [req.kullanici.isletme_id, buAyBasiStr])).rows[0];
      res.json({
        paket: paketAdi,
        paket_bilgi: paket,
        kullanim: {
          calisan: parseInt(calisanSayisi.sayi),
          hizmet: parseInt(hizmetSayisi.sayi),
          randevu: parseInt(randevuSayisi.sayi)
        }
      });
    } catch (error) {
      res.status(500).json({ hata: error.message });
    }
  }

  async isletmeAyarlari(req, res) {
    try {
      const isletme = (await pool.query('SELECT * FROM isletmeler WHERE id = $1', [req.kullanici.isletme_id])).rows[0];
      res.json({ isletme });
    } catch (error) {
      res.status(500).json({ hata: error.message });
    }
  }

  async isletmeGuncelle(req, res) {
    try {
      const { isim, adres, calisma_baslangic, calisma_bitis, randevu_suresi_dk, kapali_gunler, mola_saatleri } = req.body;
      const result = await pool.query(
        `UPDATE isletmeler SET isim=$1, adres=$2, calisma_baslangic=$3, calisma_bitis=$4, 
         randevu_suresi_dk=$5, kapali_gunler=$6, mola_saatleri=$7 WHERE id=$8 RETURNING *`,
        [isim, adres, calisma_baslangic, calisma_bitis, randevu_suresi_dk, kapali_gunler, JSON.stringify(mola_saatleri || []), req.kullanici.isletme_id]
      );
      res.json({ isletme: result.rows[0] });
    } catch (error) {
      res.status(500).json({ hata: error.message });
    }
  }

  // ==================== SUPER ADMIN ====================

  async tumIsletmeler(req, res) {
    try {
      const result = await pool.query(`
        SELECT i.*, COUNT(r.id) as toplam_randevu
        FROM isletmeler i
        LEFT JOIN randevular r ON r.isletme_id = i.id
        GROUP BY i.id ORDER BY i.id
      `);
      res.json({ isletmeler: result.rows });
    } catch (error) {
      res.status(500).json({ hata: error.message });
    }
  }

  async isletmeEkle(req, res) {
    try {
      const { isim, telefon, adres, ilce, kategori, email, sifre } = req.body;
      
      const isletme = (await pool.query(
        `INSERT INTO isletmeler (isim, telefon, adres, ilce, kategori) VALUES ($1, $2, $3, $4, $5) RETURNING *`,
        [isim, telefon, adres, ilce, kategori]
      )).rows[0];

      if (email && sifre) {
        const hashSifre = await bcrypt.hash(sifre, 10);
        await pool.query(
          'INSERT INTO admin_kullanicilar (email, sifre, isim, rol, isletme_id) VALUES ($1, $2, $3, $4, $5)',
          [email, hashSifre, isim, 'isletme', isletme.id]
        );
      }

      res.json({ isletme });
    } catch (error) {
      res.status(500).json({ hata: error.message });
    }
  }

  async isletmeGuncelleAdmin(req, res) {
    try {
      const { aktif, paket, isim, adres, ilce, kategori } = req.body;
      const fields = [];
      const values = [];
      let idx = 1;
      if (aktif !== undefined) { fields.push(`aktif=$${idx++}`); values.push(aktif); }
      if (paket !== undefined) { fields.push(`paket=$${idx++}`); values.push(paket); }
      if (isim !== undefined) { fields.push(`isim=$${idx++}`); values.push(isim); }
      if (adres !== undefined) { fields.push(`adres=$${idx++}`); values.push(adres); }
      if (ilce !== undefined) { fields.push(`ilce=$${idx++}`); values.push(ilce); }
      if (kategori !== undefined) { fields.push(`kategori=$${idx++}`); values.push(kategori); }
      values.push(req.params.id);
      const result = await pool.query(
        `UPDATE isletmeler SET ${fields.join(', ')} WHERE id=$${idx} RETURNING *`,
        values
      );
      res.json({ isletme: result.rows[0] });
    } catch (error) {
      res.status(500).json({ hata: error.message });
    }
  }

  async isletmeSil(req, res) {
    const id = req.params.id;
    try {
      // Bağımlı tabloları sırayla temizle
      await pool.query('DELETE FROM sohbet_gecmisi WHERE isletme_id = $1', [id]);
      await pool.query('DELETE FROM bot_durum WHERE isletme_id = $1', [id]);
      await pool.query('DELETE FROM bekleme_listesi WHERE isletme_id = $1', [id]);
      await pool.query('DELETE FROM randevular WHERE isletme_id = $1', [id]);
      await pool.query('DELETE FROM hizmetler WHERE isletme_id = $1', [id]);
      await pool.query('DELETE FROM calisanlar WHERE isletme_id = $1', [id]);
      await pool.query('DELETE FROM admin_kullanicilar WHERE isletme_id = $1', [id]);
      await pool.query('DELETE FROM odemeler WHERE isletme_id = $1', [id]).catch(() => {});
      await pool.query('DELETE FROM isletmeler WHERE id = $1', [id]);
      res.json({ mesaj: 'İşletme ve tüm verileri silindi' });
    } catch (error) {
      res.status(500).json({ hata: error.message });
    }
  }

  // ==================== BOT BAĞLANTI ====================

  async botDurum(req, res) {
    try {
      const isletme = (await pool.query('SELECT * FROM isletmeler WHERE id=$1', [req.kullanici.isletme_id])).rows[0];
      const telegramService = require('../services/telegram');
      const telegramAktif = !!telegramService.botlar[req.kullanici.isletme_id];
      res.json({
        telegram_bagli: telegramAktif,
        telegram_token: isletme?.telegram_token ? '***kayıtlı***' : null,
        meta_wa_token: isletme?.meta_wa_token ? '***kayıtlı***' : null,
        meta_wa_phone_id: isletme?.meta_wa_phone_id || null,
        whatsapp_no: isletme?.whatsapp_no || null,
        webhook_url: process.env.BASE_URL ? `${process.env.BASE_URL}/api/webhook/whatsapp` : `http://localhost:3000/api/webhook/whatsapp`,
      });
    } catch (error) {
      res.status(500).json({ hata: error.message });
    }
  }

  async telegramBagla(req, res) {
    try {
      const { token } = req.body;
      if (!token) return res.status(400).json({ hata: 'Token gerekli' });

      const telegramService = require('../services/telegram');

      // Token'ı test et
      const test = await telegramService.botTest(token);
      if (!test.basarili) return res.status(400).json({ hata: `Geçersiz token: ${test.hata}` });

      // DB'ye kaydet
      await pool.query('UPDATE isletmeler SET telegram_token=$1, bot_aktif=true WHERE id=$2', [token, req.kullanici.isletme_id]);

      // Botu başlat
      const isletme = (await pool.query('SELECT * FROM isletmeler WHERE id=$1', [req.kullanici.isletme_id])).rows[0];
      await telegramService.botBaslat(req.kullanici.isletme_id, token, isletme.isim);

      res.json({ mesaj: 'Telegram botu bağlandı', bot_isim: test.bot_isim, bot_ad: test.bot_ad });
    } catch (error) {
      res.status(500).json({ hata: error.message });
    }
  }

  async telegramAyir(req, res) {
    try {
      const telegramService = require('../services/telegram');
      await telegramService.botDurdur(req.kullanici.isletme_id);
      await pool.query('UPDATE isletmeler SET telegram_token=NULL, bot_aktif=false WHERE id=$1', [req.kullanici.isletme_id]);
      res.json({ mesaj: 'Telegram botu ayrıldı' });
    } catch (error) {
      res.status(500).json({ hata: error.message });
    }
  }

  async whatsappBagla(req, res) {
    try {
      const { meta_wa_token, meta_wa_phone_id } = req.body;
      if (!meta_wa_token || !meta_wa_phone_id) return res.status(400).json({ hata: 'Token ve Phone ID gerekli' });
      await pool.query(
        'UPDATE isletmeler SET meta_wa_token=$1, meta_wa_phone_id=$2 WHERE id=$3',
        [meta_wa_token, meta_wa_phone_id, req.kullanici.isletme_id]
      );
      res.json({ mesaj: 'WhatsApp bilgileri kaydedildi' });
    } catch (error) {
      res.status(500).json({ hata: error.message });
    }
  }

  // WhatsApp Web (QR kod) endpoints
  async wpWebDurum(req, res) {
    try {
      const whatsappWebService = require('../services/whatsappWeb');
      const durum = whatsappWebService.getDurum(req.kullanici.isletme_id);
      const isletme = (await pool.query('SELECT whatsapp_no FROM isletmeler WHERE id=$1', [req.kullanici.isletme_id])).rows[0];
      res.json({ ...durum, whatsapp_no: isletme?.whatsapp_no || null });
    } catch (error) {
      res.status(500).json({ hata: error.message });
    }
  }

  async wpWebBaslat(req, res) {
    try {
      const whatsappWebService = require('../services/whatsappWeb');
      const isletme = (await pool.query('SELECT id, isim FROM isletmeler WHERE id=$1', [req.kullanici.isletme_id])).rows[0];
      // Başlatma async - hemen cevap dön, QR SSE üzerinden gelecek
      whatsappWebService.isletmeBaslat(isletme.id, isletme.isim, true);
      res.json({ mesaj: 'WhatsApp başlatılıyor, QR kod bekleniyor...' });
    } catch (error) {
      res.status(500).json({ hata: error.message });
    }
  }

  async wpWebAyir(req, res) {
    try {
      const whatsappWebService = require('../services/whatsappWeb');
      await whatsappWebService.isletmeDurdur(req.kullanici.isletme_id);
      res.json({ mesaj: 'WhatsApp bağlantısı kesildi' });
    } catch (error) {
      res.status(500).json({ hata: error.message });
    }
  }

  // SSE - QR kod ve durum güncellemeleri için
  async wpWebSse(req, res) {
    const isletmeId = req.kullanici.isletme_id;
    const whatsappWebService = require('../services/whatsappWeb');

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.flushHeaders();

    // Mevcut durumu hemen gönder
    const mevcutDurum = whatsappWebService.getDurum(isletmeId);
    res.write(`data: ${JSON.stringify(mevcutDurum)}\n\n`);

    const onQr = (qrBase64) => res.write(`data: ${JSON.stringify({ durum: 'qr_bekleniyor', qrBase64 })}\n\n`);
    const onBagli = (numara) => res.write(`data: ${JSON.stringify({ durum: 'bagli', whatsapp_no: numara, qrBase64: null })}\n\n`);
    const onAyrildi = () => res.write(`data: ${JSON.stringify({ durum: 'bagli_degil', qrBase64: null })}\n\n`);

    whatsappWebService.on(`qr_${isletmeId}`, onQr);
    whatsappWebService.on(`bagli_${isletmeId}`, onBagli);
    whatsappWebService.on(`ayrildi_${isletmeId}`, onAyrildi);

    req.on('close', () => {
      whatsappWebService.off(`qr_${isletmeId}`, onQr);
      whatsappWebService.off(`bagli_${isletmeId}`, onBagli);
      whatsappWebService.off(`ayrildi_${isletmeId}`, onAyrildi);
    });
  }

  async botAyarlarGuncelle(req, res) {
    try {
      const { whatsapp_no } = req.body;
      await pool.query('UPDATE isletmeler SET whatsapp_no=$1 WHERE id=$2', [whatsapp_no, req.kullanici.isletme_id]);
      res.json({ mesaj: 'Bot ayarları güncellendi' });
    } catch (error) {
      res.status(500).json({ hata: error.message });
    }
  }

  // ==================== ÖDEMELER ====================

  async odemeleriGetir(req, res) {
    try {
      const result = await pool.query(`
        SELECT o.*, i.isim as isletme_isim
        FROM odemeler o
        JOIN isletmeler i ON o.isletme_id = i.id
        ORDER BY o.olusturma_tarihi DESC
      `);
      res.json({ odemeler: result.rows });
    } catch (error) {
      res.status(500).json({ hata: error.message });
    }
  }

  async odemeEkle(req, res) {
    try {
      const { isletme_id, tutar, donem, durum } = req.body;
      const result = await pool.query(
        `INSERT INTO odemeler (isletme_id, tutar, donem, durum) VALUES ($1, $2, $3, $4) RETURNING *`,
        [isletme_id, tutar, donem || bugunTarih().slice(0, 7), durum || 'bekliyor']
      );
      res.json({ odeme: result.rows[0] });
    } catch (error) {
      res.status(500).json({ hata: error.message });
    }
  }

  async odemeGuncelle(req, res) {
    try {
      const { durum } = req.body;
      const odeme_tarihi = durum === 'odendi' ? 'NOW()' : 'NULL';
      const result = await pool.query(
        `UPDATE odemeler SET durum = $1, odeme_tarihi = ${odeme_tarihi} WHERE id = $2 RETURNING *`,
        [durum, req.params.id]
      );
      res.json({ odeme: result.rows[0] });
    } catch (error) {
      res.status(500).json({ hata: error.message });
    }
  }

  // ==================== AVCI BOT ====================

  async avciTarama(req, res) {
    try {
      const { sehir, ilce, kategori } = req.body;
      const apiKey = process.env.GOOGLE_MAPS_API_KEY;
      if (!apiKey) return res.status(400).json({ hata: 'GOOGLE_MAPS_API_KEY .env dosyasında tanımlı değil' });
      if (!sehir || !kategori) return res.status(400).json({ hata: 'Şehir ve kategori zorunlu' });

      const sonuc = await avciBot.taramaYap({ sehir, ilce, kategori, apiKey });
      res.json(sonuc);
    } catch (error) {
      res.status(500).json({ hata: error.message });
    }
  }

  async avciSosyalTarama(req, res) {
    try {
      const { sehir, ilce, kategori, platform } = req.body;
      if (!sehir || !kategori || !platform) return res.status(400).json({ hata: 'Şehir, kategori ve platform zorunlu' });

      const sonuc = await avciBot.sosyalMedyaTarama({ sehir, ilce, kategori, platform });
      res.json(sonuc);
    } catch (error) {
      res.status(500).json({ hata: error.message });
    }
  }

  async avciTopluTarama(req, res) {
    try {
      const { sehir, kategoriler } = req.body;
      const apiKey = process.env.GOOGLE_MAPS_API_KEY;
      if (!apiKey) return res.status(400).json({ hata: 'GOOGLE_MAPS_API_KEY .env dosyasında tanımlı değil' });
      if (!sehir || !kategoriler?.length) return res.status(400).json({ hata: 'Şehir ve en az 1 kategori zorunlu' });

      const sonuc = await avciBot.topluTarama({ sehir, kategoriler, apiKey });
      res.json(sonuc);
    } catch (error) {
      res.status(500).json({ hata: error.message });
    }
  }

  async avciListe(req, res) {
    try {
      const { durum, kategori, sehir, ilce, siralama, limit, offset, kaynak } = req.query;
      const liste = await avciBot.listele({
        durum, kategori, sehir, ilce, siralama, kaynak,
        limit: limit ? parseInt(limit) : 50,
        offset: offset ? parseInt(offset) : 0
      });
      res.json({ potansiyel_musteriler: liste });
    } catch (error) {
      res.status(500).json({ hata: error.message });
    }
  }

  async avciIstatistik(req, res) {
    try {
      const stats = await avciBot.istatistikler();
      res.json(stats);
    } catch (error) {
      res.status(500).json({ hata: error.message });
    }
  }

  async avciGunlukListe(req, res) {
    try {
      const limit = req.query.limit ? parseInt(req.query.limit) : 10;
      const liste = await avciBot.gunlukListe(limit);
      res.json({ gunluk_liste: liste });
    } catch (error) {
      res.status(500).json({ hata: error.message });
    }
  }

  async avciDurumGuncelle(req, res) {
    try {
      const { durum, notlar, sonraki_arama } = req.body;
      const musteri = await avciBot.durumGuncelle(req.params.id, { durum, notlar, sonraki_arama });
      if (!musteri) return res.status(404).json({ hata: 'Kayıt bulunamadı' });
      res.json({ musteri });
    } catch (error) {
      res.status(500).json({ hata: error.message });
    }
  }

  async avciSil(req, res) {
    try {
      await avciBot.sil(req.params.id);
      res.json({ mesaj: 'Silindi' });
    } catch (error) {
      res.status(500).json({ hata: error.message });
    }
  }

  // ==================== ÖDEME (iyzico + havale) ====================

  async iyzicoBaslat(req, res) {
    try {
      const isletmeId = req.kullanici.isletme_id;
      const { paket } = req.body;
      const result = await iyzicoService.checkoutBaslat(isletmeId, paket || 'baslangic');
      res.json(result);
    } catch (error) {
      res.status(400).json({ hata: error.message });
    }
  }

  async iyzicoCallback(req, res) {
    try {
      const { token } = req.body;
      if (!token) return res.redirect((process.env.ADMIN_PANEL_URL || 'https://randevugo-admin.onrender.com') + '?odeme=hata');
      const sonuc = await iyzicoService.callbackDogrula(token);
      const baseUrl = process.env.ADMIN_PANEL_URL || 'https://randevugo-admin.onrender.com';
      res.redirect(baseUrl + (sonuc.basarili ? '?odeme=basarili' : '?odeme=basarisiz'));
    } catch (error) {
      console.error('iyzico callback hatası:', error);
      res.redirect((process.env.ADMIN_PANEL_URL || 'https://randevugo-admin.onrender.com') + '?odeme=hata');
    }
  }

  async havaleGonder(req, res) {
    try {
      const isletmeId = req.kullanici.isletme_id;
      const { dekont_notu } = req.body;

      const isletme = (await pool.query('SELECT * FROM isletmeler WHERE id = $1', [isletmeId])).rows[0];
      if (!isletme) return res.status(404).json({ hata: 'İşletme bulunamadı' });

      const paketBilgi = PAKETLER[isletme.paket] || PAKETLER.baslangic;
      const buAy = new Date().toISOString().slice(0, 7);

      // Referans kodu üret (isletme_id + dönem bazlı, sabit)
      const hash = Buffer.from(`${isletmeId}-${buAy}`).toString('base64').replace(/[^A-Z0-9]/gi, '').slice(0, 3).toUpperCase();
      const refKod = `SRGO-${isletmeId}${hash}`;

      // Mevcut bekleyen ödeme var mı?
      const mevcut = (await pool.query(
        "SELECT id FROM odemeler WHERE isletme_id = $1 AND donem = $2 AND durum IN ('bekliyor','havale_bekliyor')",
        [isletmeId, buAy]
      )).rows[0];

      if (mevcut) {
        await pool.query(
          "UPDATE odemeler SET durum = 'havale_bekliyor', odeme_yontemi = 'havale', havale_dekont = $1, referans_kodu = $2 WHERE id = $3",
          [dekont_notu || '', refKod, mevcut.id]
        );
      } else {
        await pool.query(
          "INSERT INTO odemeler (isletme_id, tutar, donem, durum, odeme_yontemi, havale_dekont, referans_kodu) VALUES ($1, $2, $3, 'havale_bekliyor', 'havale', $4, $5)",
          [isletmeId, paketBilgi.fiyat, buAy, dekont_notu || '', refKod]
        );
      }

      res.json({ mesaj: 'Havale bildiriminiz alındı. SuperAdmin onayı bekleniyor.' });
    } catch (error) {
      res.status(500).json({ hata: error.message });
    }
  }

  async odemeDurum(req, res) {
    try {
      const isletmeId = req.kullanici.isletme_id;
      const buAy = new Date().toISOString().slice(0, 7);

      const odeme = (await pool.query(
        'SELECT * FROM odemeler WHERE isletme_id = $1 AND donem = $2 ORDER BY olusturma_tarihi DESC LIMIT 1',
        [isletmeId, buAy]
      )).rows[0];

      const isletme = (await pool.query('SELECT paket, isim FROM isletmeler WHERE id = $1', [isletmeId])).rows[0];
      const paketBilgi = PAKETLER[isletme?.paket] || PAKETLER.baslangic;

      // Rastgele ödeme referans kodu üret (her istek için sabit kalması için isletme_id + dönem bazlı)
      const hash = Buffer.from(`${isletmeId}-${buAy}`).toString('base64').replace(/[^A-Z0-9]/gi, '').slice(0, 3).toUpperCase();
      const kod = `SRGO-${isletmeId}${hash}`;

      res.json({
        odeme: odeme || null,
        paket: isletme?.paket || 'baslangic',
        tutar: paketBilgi.fiyat,
        donem: buAy,
        referans_kodu: kod,
        banka: {
          banka_adi: 'Garanti BBVA',
          iban: 'TR54 0006 2000 7440 0006 8578 09',
          hesap_sahibi: 'Ahmet Çavdar',
          aciklama: kod
        }
      });
    } catch (error) {
      res.status(500).json({ hata: error.message });
    }
  }

  // ==================== İLETİŞİM YÖNETİM (SuperAdmin) ====================

  async iletisimListele(req, res) {
    try {
      const result = await pool.query('SELECT * FROM iletisim_mesajlari ORDER BY olusturma_tarihi DESC LIMIT 100');
      res.json({ mesajlar: result.rows });
    } catch (error) {
      res.status(500).json({ hata: error.message });
    }
  }

  async iletisimOkundu(req, res) {
    try {
      const { id } = req.params;
      const { okundu } = req.body;
      await pool.query('UPDATE iletisim_mesajlari SET okundu = $1 WHERE id = $2', [okundu !== false, id]);
      res.json({ mesaj: 'Güncellendi.' });
    } catch (error) {
      res.status(500).json({ hata: error.message });
    }
  }

  async iletisimSil(req, res) {
    try {
      const { id } = req.params;
      await pool.query('DELETE FROM iletisim_mesajlari WHERE id = $1', [id]);
      res.json({ mesaj: 'Silindi.' });
    } catch (error) {
      res.status(500).json({ hata: error.message });
    }
  }

  // ==================== İLETİŞİM FORMU (public) ====================

  async iletisimGonder(req, res) {
    try {
      const { isim, email, mesaj } = req.body;
      if (!isim || !email || !mesaj) return res.status(400).json({ hata: 'Tüm alanları doldurun.' });
      if (mesaj.length > 2000) return res.status(400).json({ hata: 'Mesaj çok uzun (max 2000 karakter).' });

      await pool.query(
        'INSERT INTO iletisim_mesajlari (isim, email, mesaj) VALUES ($1, $2, $3)',
        [isim.slice(0, 255), email.slice(0, 255), mesaj.slice(0, 2000)]
      );

      console.log(`📩 Yeni iletişim mesajı: ${isim} (${email})`);
      res.json({ mesaj: 'Mesajınız başarıyla gönderildi.' });
    } catch (error) {
      res.status(500).json({ hata: error.message });
    }
  }

  // ==================== GRAFİK İSTATİSTİK ====================

  async grafikVerileri(req, res) {
    try {
      const isletmeId = req.kullanici.isletme_id;

      // Son 7 günlük randevu sayıları
      const haftalik = (await pool.query(`
        SELECT tarih, COUNT(*) as sayi,
          COUNT(*) FILTER(WHERE durum='onaylandi' OR durum='tamamlandi') as onaylanan
        FROM randevular WHERE isletme_id=$1 AND tarih >= CURRENT_DATE - INTERVAL '6 days'
        GROUP BY tarih ORDER BY tarih
      `, [isletmeId])).rows;

      // Son 30 günlük gelir (günlük)
      const aylikGelir = (await pool.query(`
        SELECT r.tarih, COALESCE(SUM(h.fiyat),0) as gelir
        FROM randevular r
        JOIN hizmetler h ON r.hizmet_id = h.id
        WHERE r.isletme_id=$1 AND r.tarih >= CURRENT_DATE - INTERVAL '29 days'
          AND r.durum IN ('onaylandi','tamamlandi')
        GROUP BY r.tarih ORDER BY r.tarih
      `, [isletmeId])).rows;

      // Hizmet dağılımı (bu ay)
      const hizmetDagilimi = (await pool.query(`
        SELECT h.isim, COUNT(r.id) as sayi
        FROM randevular r
        JOIN hizmetler h ON r.hizmet_id = h.id
        WHERE r.isletme_id=$1 AND r.tarih >= date_trunc('month', CURRENT_DATE)
        GROUP BY h.isim ORDER BY sayi DESC LIMIT 8
      `, [isletmeId])).rows;

      // Saat dağılımı (bu ay)
      const saatDagilimi = (await pool.query(`
        SELECT saat, COUNT(*) as sayi
        FROM randevular WHERE isletme_id=$1 AND tarih >= date_trunc('month', CURRENT_DATE)
        GROUP BY saat ORDER BY saat
      `, [isletmeId])).rows;

      // Durum dağılımı (bu ay)
      const durumDagilimi = (await pool.query(`
        SELECT durum, COUNT(*) as sayi
        FROM randevular WHERE isletme_id=$1 AND tarih >= date_trunc('month', CURRENT_DATE)
        GROUP BY durum
      `, [isletmeId])).rows;

      res.json({ haftalik, aylikGelir, hizmetDagilimi, saatDagilimi, durumDagilimi });
    } catch (error) {
      res.status(500).json({ hata: error.message });
    }
  }
  // ==================== SATIŞ BOTU ====================

  async satisBotBaslat(req, res) {
    try {
      const satisBot = require('../services/satisBot');
      await satisBot.baslat();
      res.json({ mesaj: 'Satış botu başlatıldı', durum: satisBot.getDurum() });
    } catch (error) {
      res.status(500).json({ hata: error.message });
    }
  }

  async satisBotDurdur(req, res) {
    try {
      const satisBot = require('../services/satisBot');
      await satisBot.durdur();
      res.json({ mesaj: 'Satış botu durduruldu' });
    } catch (error) {
      res.status(500).json({ hata: error.message });
    }
  }

  async satisBotDurum(req, res) {
    try {
      const satisBot = require('../services/satisBot');
      const durum = satisBot.getDurum();
      const istatistikler = await satisBot.istatistikler();
      res.json({ ...durum, istatistikler });
    } catch (error) {
      res.status(500).json({ hata: error.message });
    }
  }

  async satisBotGonderimBaslat(req, res) {
    try {
      const satisBot = require('../services/satisBot');
      const sonuc = await satisBot.gonderimBaslat();
      res.json(sonuc);
    } catch (error) {
      res.status(500).json({ hata: error.message });
    }
  }

  async satisBotGonderimDurdur(req, res) {
    try {
      const satisBot = require('../services/satisBot');
      const sonuc = satisBot.gonderimDurdur();
      res.json(sonuc);
    } catch (error) {
      res.status(500).json({ hata: error.message });
    }
  }

  async satisBotKonusmalar(req, res) {
    try {
      const satisBot = require('../services/satisBot');
      const konusmalar = await satisBot.konusmalarGetir(50);
      res.json({ konusmalar });
    } catch (error) {
      res.status(500).json({ hata: error.message });
    }
  }
}

module.exports = new AdminController();
