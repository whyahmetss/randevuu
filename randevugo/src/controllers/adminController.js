const pool = require('../config/db');
const { bugunTarih, gunSonraTarih } = require('../utils/tarih');
const bcrypt = require('bcryptjs');
const randevuService = require('../services/randevu');
const PAKETLER = require('../config/paketler');

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
      const { isim, adres, calisma_baslangic, calisma_bitis, randevu_suresi_dk, kapali_gunler } = req.body;
      const result = await pool.query(
        `UPDATE isletmeler SET isim=$1, adres=$2, calisma_baslangic=$3, calisma_bitis=$4, 
         randevu_suresi_dk=$5, kapali_gunler=$6 WHERE id=$7 RETURNING *`,
        [isim, adres, calisma_baslangic, calisma_bitis, randevu_suresi_dk, kapali_gunler, req.kullanici.isletme_id]
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
}

module.exports = new AdminController();
