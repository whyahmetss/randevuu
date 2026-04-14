const pool = require('../config/db');
const { bugunTarih, gunSonraTarih } = require('../utils/tarih');
const bcrypt = require('bcryptjs');
const randevuService = require('../services/randevu');
const { paketGetir, paketleriYukle, paketCacheTemizle } = require('../config/paketler');
const avciBot = require('../services/avciBot');
const iyzicoService = require('../services/iyzicoService');
const shopierService = require('../services/shopierService');
const QRCode = require('qrcode');

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
      const isletmeId = req.kullanici.isletme_id;
      const result = await pool.query(
        'UPDATE randevular SET durum = $1 WHERE id = $2 AND isletme_id = $3 RETURNING *',
        [durum, id, isletmeId]
      );
      await this.auditLogYaz(req.kullanici, `randevu_${durum}`, `Randevu #${id} durumu: ${durum}`, 'randevular', parseInt(id), req.ip);

      // Randevu tamamlandığında otomatik kasa gelir kaydı oluştur
      if (durum === 'tamamlandi' && result.rows[0]) {
        try {
          const randevu = result.rows[0];
          const hizmet = randevu.hizmet_id ? (await pool.query('SELECT isim, fiyat FROM hizmetler WHERE id=$1', [randevu.hizmet_id])).rows[0] : null;
          if (hizmet && parseFloat(hizmet.fiyat) > 0) {
            // Daha önce bu randevu için kayıt var mı kontrol et
            const mevcut = (await pool.query('SELECT id FROM kasa_hareketleri WHERE randevu_id=$1 AND isletme_id=$2', [randevu.id, isletmeId])).rows[0];
            if (!mevcut) {
              await pool.query(
                `INSERT INTO kasa_hareketleri (isletme_id, tip, tutar, aciklama, kategori, odeme_yontemi, randevu_id, tarih, olusturan_id)
                 VALUES ($1, 'gelir', $2, $3, 'hizmet', 'nakit', $4, $5, $6)`,
                [isletmeId, hizmet.fiyat, `${hizmet.isim} (Randevu #${randevu.id})`, randevu.id, randevu.tarih, req.kullanici.id]
              );
            }
          }
        } catch (e) { console.error('Otomatik adisyon hatası:', e.message); }

        // Sadakat Puan: puan ekle + bildirim
        try {
          const sadakatPuan = require('../services/sadakatPuan');
          const kazanilan = await sadakatPuan.puanEkle(isletmeId, randevu.musteri_id, randevu.id);
          if (kazanilan) {
            const musteriP = (await pool.query('SELECT puan_bakiye FROM musteriler WHERE id=$1', [randevu.musteri_id])).rows[0];
            const isletmeP = (await pool.query('SELECT odul_esik FROM isletmeler WHERE id=$1', [isletmeId])).rows[0];
            const bildirim = sadakatPuan.puanBildirimMesaji(kazanilan, musteriP?.puan_bakiye || 0, isletmeP?.odul_esik || 1000);
            const mTel = (await pool.query('SELECT telefon FROM musteriler WHERE id=$1', [randevu.musteri_id])).rows[0];
            if (mTel?.telefon) {
              try {
                const whatsappWeb = require('../services/whatsappWeb');
                const waDurum = whatsappWeb.getDurum(isletmeId);
                if (waDurum?.durum === 'bagli') await whatsappWeb.mesajGonder(isletmeId, mTel.telefon, bildirim);
              } catch (e) { /* skip */ }
            }
          }
        } catch (e) { console.error('Sadakat puan hatası:', e.message); }

        // Referans: puan ver
        try {
          const mRef = (await pool.query('SELECT telefon FROM musteriler WHERE id=$1', [randevu.musteri_id])).rows[0];
          if (mRef) { const referans = require('../services/referans'); await referans.referansPuanVer(isletmeId, randevu.musteri_id, mRef.telefon); }
        } catch (e) { /* skip */ }

        // Yorum Avcısı: talebi oluştur
        try {
          const musteri = (await pool.query('SELECT id, telefon FROM musteriler WHERE id=$1', [randevu.musteri_id])).rows[0];
          if (musteri) {
            const yorumAvcisi = require('../services/yorumAvcisi');
            await yorumAvcisi.talepOlustur(isletmeId, randevu.id, musteri.id, musteri.telefon);
          }
        } catch (e) { console.error('Yorum avcısı hatası:', e.message); }
      }

      let noShow = null;
      if (durum === 'gelmedi' && result.rows[0]) {
        const randevu = result.rows[0];
        const musteri = (await pool.query('SELECT telefon FROM musteriler WHERE id=$1', [randevu.musteri_id])).rows[0];
        if (musteri) {
          await randevuService.noShowKaydet(isletmeId, musteri.telefon);
          const kl = (await pool.query(
            'SELECT ihlal_sayisi, aktif FROM kara_liste WHERE isletme_id=$1 AND telefon=$2',
            [isletmeId, musteri.telefon]
          )).rows[0];
          const isletmeNoShow = (await pool.query(
            'SELECT kara_liste_otomatik, kara_liste_ihlal_sinir, isim FROM isletmeler WHERE id=$1',
            [isletmeId]
          )).rows[0];
          noShow = {
            ihlalSayisi: kl?.ihlal_sayisi || 1,
            sinir: isletmeNoShow?.kara_liste_ihlal_sinir || 3,
            engellendi: kl?.aktif || false,
            otomatikAktif: isletmeNoShow?.kara_liste_otomatik || false
          };

          // No-Show WhatsApp mesajı gönder
          try {
            const whatsappWeb = require('../services/whatsappWeb');
            const waDurum = whatsappWeb.getDurum(isletmeId);
            if (waDurum?.durum === 'bagli') {
              const hizmet = randevu.hizmet_id ? (await pool.query('SELECT isim FROM hizmetler WHERE id=$1', [randevu.hizmet_id])).rows[0] : null;
              const botMesajlar = require('../utils/botMesajlar');
              const isletmeObj = (await pool.query('SELECT * FROM isletmeler WHERE id=$1', [isletmeId])).rows[0] || {};
              const tarihFormat = (t) => { const d = new Date(t); const g=['Pazar','Pazartesi','Salı','Çarşamba','Perşembe','Cuma','Cumartesi']; const a=['Ocak','Şubat','Mart','Nisan','Mayıs','Haziran','Temmuz','Ağustos','Eylül','Ekim','Kasım','Aralık']; return `${d.getDate()} ${a[d.getMonth()]} ${g[d.getDay()]}`; };
              const kaporaTutar = randevu.kapora_tutari && parseFloat(randevu.kapora_tutari) > 0 ? parseFloat(randevu.kapora_tutari) : null;
              // Kapora kesilsin (iade yapılmasın)
              if (kaporaTutar && randevu.kapora_durumu === 'odendi') {
                await pool.query("UPDATE randevular SET kapora_durumu='kesildi' WHERE id=$1", [randevu.id]);
              }
              const mesaj = botMesajlar.get(isletmeObj, 'noShowMesaj', {
                isletmeAd: isletmeNoShow?.isim || '',
                tarihStr: tarihFormat(randevu.tarih),
                saatStr: String(randevu.saat).substring(0, 5),
                kaporaTutar
              });
              await whatsappWeb.mesajGonder(isletmeId, musteri.telefon, mesaj);
            }
          } catch (e) { console.error('No-show WA mesaj hatası:', e.message); }
        }
      }

      res.json({ randevu: result.rows[0], noShow });
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
      const { isim, isim_en, isim_ar, sure_dk, fiyat, aciklama, emoji, kapora_yuzdesi, tampon_dk } = req.body;
      const isletme = (await pool.query('SELECT paket FROM isletmeler WHERE id=$1', [req.kullanici.isletme_id])).rows[0];
      const paket = await paketGetir(isletme?.paket);
      const mevcut = (await pool.query('SELECT COUNT(*) as sayi FROM hizmetler WHERE isletme_id=$1 AND aktif=true', [req.kullanici.isletme_id])).rows[0];
      if (parseInt(mevcut.sayi) >= paket.hizmet_limit) {
        return res.status(403).json({ hata: `${paket.isim} paketinde en fazla ${paket.hizmet_limit} hizmet ekleyebilirsiniz. Paketinizi yükseltin.`, limit_asimi: true });
      }
      const result = await pool.query(
        'INSERT INTO hizmetler (isletme_id, isim, isim_en, isim_ar, sure_dk, fiyat, aciklama, emoji, kapora_yuzdesi, tampon_dk) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *',
        [req.kullanici.isletme_id, isim, isim_en || null, isim_ar || null, sure_dk, fiyat, aciklama, emoji || '', parseInt(kapora_yuzdesi) || 0, parseInt(tampon_dk) || 0]
      );
      res.json({ hizmet: result.rows[0] });
    } catch (error) {
      res.status(500).json({ hata: error.message });
    }
  }

  async hizmetGuncelle(req, res) {
    try {
      const { id } = req.params;
      const { isim, isim_en, isim_ar, sure_dk, fiyat, aciklama, aktif, emoji, kapora_yuzdesi, tampon_dk } = req.body;
      const result = await pool.query(
        'UPDATE hizmetler SET isim=$1, isim_en=$2, isim_ar=$3, sure_dk=$4, fiyat=$5, aciklama=$6, aktif=$7, emoji=$8, kapora_yuzdesi=$9, tampon_dk=$10 WHERE id=$11 AND isletme_id=$12 RETURNING *',
        [isim, isim_en || null, isim_ar || null, sure_dk, fiyat, aciklama, aktif, emoji || '', parseInt(kapora_yuzdesi) || 0, parseInt(tampon_dk) || 0, id, req.kullanici.isletme_id]
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
      const isletmeId = req.kullanici.isletme_id;
      const buAy = new Date().toISOString().slice(0, 7);
      const result = await pool.query(`
        SELECT c.*,
          COALESCE(p.ay_randevu, 0)::int as ay_randevu,
          COALESCE(p.ay_ciro, 0)::int as ay_ciro
        FROM calisanlar c
        LEFT JOIN LATERAL (
          SELECT COUNT(r.id) as ay_randevu, COALESCE(SUM(h.fiyat),0) as ay_ciro
          FROM randevular r LEFT JOIN hizmetler h ON h.id = r.hizmet_id
          WHERE r.calisan_id = c.id AND r.isletme_id = $1 AND r.durum != 'iptal'
            AND to_char(r.tarih, 'YYYY-MM') = $2
        ) p ON true
        WHERE c.isletme_id = $1 ORDER BY c.id
      `, [isletmeId, buAy]);
      res.json({ calisanlar: result.rows });
    } catch (error) {
      res.status(500).json({ hata: error.message });
    }
  }

  async calisanEkle(req, res) {
    try {
      const { isim, telefon, uzmanlik, calisma_baslangic, calisma_bitis, kapali_gunler, mola_saatleri } = req.body;
      const isletme = (await pool.query('SELECT paket FROM isletmeler WHERE id=$1', [req.kullanici.isletme_id])).rows[0];
      const paket = await paketGetir(isletme?.paket);
      const mevcut = (await pool.query('SELECT COUNT(*) as sayi FROM calisanlar WHERE isletme_id=$1 AND aktif=true', [req.kullanici.isletme_id])).rows[0];
      if (parseInt(mevcut.sayi) >= paket.calisan_limit) {
        return res.status(403).json({ hata: `${paket.isim} paketinde en fazla ${paket.calisan_limit} çalışan ekleyebilirsiniz. Paketinizi yükseltin.`, limit_asimi: true });
      }
      const result = await pool.query(
        `INSERT INTO calisanlar (isletme_id, isim, telefon, uzmanlik, calisma_baslangic, calisma_bitis, kapali_gunler, mola_saatleri)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
        [req.kullanici.isletme_id, isim, telefon, uzmanlik, calisma_baslangic || null, calisma_bitis || null, kapali_gunler || '', JSON.stringify(mola_saatleri || [])]
      );
      res.json({ calisan: result.rows[0] });
    } catch (error) {
      res.status(500).json({ hata: error.message });
    }
  }

  async calisanGuncelle(req, res) {
    try {
      const { id } = req.params;
      const { isim, telefon, uzmanlik, aktif, calisma_baslangic, calisma_bitis, kapali_gunler, mola_saatleri } = req.body;
      const result = await pool.query(
        `UPDATE calisanlar SET isim=$1, telefon=$2, uzmanlik=$3, aktif=$4,
         calisma_baslangic=$5, calisma_bitis=$6, kapali_gunler=$7, mola_saatleri=$8
         WHERE id=$9 AND isletme_id=$10 RETURNING *`,
        [isim, telefon, uzmanlik, aktif !== undefined ? aktif : true, calisma_baslangic || null, calisma_bitis || null, kapali_gunler || '', JSON.stringify(mola_saatleri || []), id, req.kullanici.isletme_id]
      );
      res.json({ calisan: result.rows[0] });
    } catch (error) {
      res.status(500).json({ hata: error.message });
    }
  }

  async calisanSil(req, res) {
    try {
      await pool.query('DELETE FROM calisan_hizmetler WHERE calisan_id=$1', [req.params.id]);
      await pool.query('DELETE FROM calisanlar WHERE id=$1 AND isletme_id=$2', [req.params.id, req.kullanici.isletme_id]);
      res.json({ mesaj: 'Silindi' });
    } catch (error) {
      res.status(500).json({ hata: error.message });
    }
  }

  // Çalışan-Hizmet eşleştirme
  async calisanHizmetleriGetir(req, res) {
    try {
      const { id } = req.params;
      const result = await pool.query(
        `SELECT h.id, h.isim, h.emoji, CASE WHEN ch.id IS NOT NULL THEN true ELSE false END as atanmis
         FROM hizmetler h
         LEFT JOIN calisan_hizmetler ch ON ch.hizmet_id = h.id AND ch.calisan_id = $1
         WHERE h.isletme_id = $2 AND h.aktif = true ORDER BY h.id`,
        [id, req.kullanici.isletme_id]
      );
      res.json({ hizmetler: result.rows });
    } catch (error) {
      res.status(500).json({ hata: error.message });
    }
  }

  async calisanHizmetleriGuncelle(req, res) {
    try {
      const { id } = req.params;
      const { hizmet_idler } = req.body; // [1, 3, 5]
      // Önce mevcut eşleştirmeleri sil
      await pool.query('DELETE FROM calisan_hizmetler WHERE calisan_id=$1', [id]);
      // Yenilerini ekle
      if (hizmet_idler && hizmet_idler.length > 0) {
        const values = hizmet_idler.map((hId, i) => `($1, $${i + 2})`).join(', ');
        await pool.query(
          `INSERT INTO calisan_hizmetler (calisan_id, hizmet_id) VALUES ${values} ON CONFLICT DO NOTHING`,
          [id, ...hizmet_idler]
        );
      }
      res.json({ mesaj: 'Güncellendi' });
    } catch (error) {
      res.status(500).json({ hata: error.message });
    }
  }

  // Kapora aktif/pasif toggle
  async kaporaToggle(req, res) {
    try {
      const { kapora_aktif } = req.body;
      await pool.query('UPDATE isletmeler SET kapora_aktif=$1 WHERE id=$2', [!!kapora_aktif, req.kullanici.isletme_id]);
      res.json({ mesaj: 'Güncellendi', kapora_aktif: !!kapora_aktif });
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

      // Paket kontrol
      const isletme = (await pool.query('SELECT * FROM isletmeler WHERE id=$1', [isletmeId])).rows[0];
      const paketB = await paketGetir(isletme?.paket);
      if (!paketB.export_aktif) return res.status(403).json({ hata: `Toplu kampanya gönderimi ${paketB.isim} paketinde kullanılamıyor. Paketinizi yükseltin!`, limit_asimi: true });

      const kampanya = (await pool.query('SELECT * FROM kampanyalar WHERE id=$1 AND isletme_id=$2', [id, isletmeId])).rows[0];
      if (!kampanya) return res.status(404).json({ hata: 'Kampanya bulunamadı' });

      // Hedef müşteriler: etiket filtresi varsa sadece o etiketli müşteriler
      let musteriler;
      if (kampanya.hedef_etiket_id) {
        musteriler = (await pool.query(`
          SELECT DISTINCT ea.musteri_telefon as telefon FROM musteri_etiket_atamalari ea
          WHERE ea.isletme_id=$1 AND ea.etiket_id=$2
        `, [isletmeId, kampanya.hedef_etiket_id])).rows;
      } else {
        musteriler = (await pool.query(`
          SELECT DISTINCT m.telefon FROM musteriler m
          JOIN randevular r ON r.musteri_id = m.id WHERE r.isletme_id=$1
        `, [isletmeId])).rows;
      }

      const mesajMetni = `🏷️ *${kampanya.baslik}*\n\n${kampanya.mesaj}\n\n_${isletme.isim}_`;
      let basarili = 0, basarisiz = 0;
      const kanal = kampanya.kanal || 'hepsi';

      // WhatsApp broadcast
      if (kanal === 'hepsi' || kanal === 'whatsapp') {
        const wpService = require('../services/whatsappWeb');
        for (const m of musteriler) {
          try {
            const tel = m.telefon.replace(/^\+/, '');
            const jid = `${tel}@s.whatsapp.net`;
            const sonuc = await wpService.mesajGonder(isletmeId, jid, mesajMetni);
            if (sonuc.success) basarili++; else basarisiz++;
            // Rate limit: 1 mesaj/saniye
            await new Promise(r => setTimeout(r, 1000));
          } catch (e) { basarisiz++; }
        }
      }

      // Telegram broadcast
      if ((kanal === 'hepsi' || kanal === 'telegram') && isletme.telegram_token) {
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
                basarili++;
              }
            } catch (e) { basarisiz++; }
          }
        }
      }

      await pool.query(
        "UPDATE kampanyalar SET gonderim_durumu='gonderildi', gonderim_tarihi=NOW(), toplam_hedef=$2, basarili=$3, basarisiz=$4 WHERE id=$1",
        [id, musteriler.length, basarili, basarisiz]
      );
      res.json({ mesaj: `Kampanya ${basarili} müşteriye gönderildi`, basarili, basarisiz, toplam: musteriler.length });
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
      const paket = await paketGetir(paketAdi);
      const calisanSayisi = (await pool.query('SELECT COUNT(*) as sayi FROM calisanlar WHERE isletme_id=$1 AND aktif=true', [req.kullanici.isletme_id])).rows[0];
      const hizmetSayisi = (await pool.query('SELECT COUNT(*) as sayi FROM hizmetler WHERE isletme_id=$1 AND aktif=true', [req.kullanici.isletme_id])).rows[0];
      const buAyBasi = new Date(); buAyBasi.setDate(1);
      const buAyBasiStr = buAyBasi.toLocaleDateString('sv-SE', { timeZone: 'Europe/Istanbul' });
      const randevuSayisi = (await pool.query('SELECT COUNT(*) as sayi FROM randevular WHERE isletme_id=$1 AND tarih >= $2', [req.kullanici.isletme_id, buAyBasiStr])).rows[0];
      // Tüm paketleri yükle (modal'da fiyat göstermek için)
      const tumPaketler = await paketleriYukle();
      const paketListesi = {};
      for (const [kod, p] of Object.entries(tumPaketler)) {
        if (kod === 'premium') continue; // alias'ı atla
        paketListesi[kod] = { isim: p.isim, fiyat: p.fiyat };
      }

      res.json({
        paket: paketAdi,
        paket_bilgi: paket,
        kullanim: {
          calisan: parseInt(calisanSayisi.sayi),
          hizmet: parseInt(hizmetSayisi.sayi),
          randevu: parseInt(randevuSayisi.sayi)
        },
        tum_paketler: paketListesi
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
      const izinliAlanlar = [
        'isim','adres','calisma_baslangic','calisma_bitis','randevu_suresi_dk','kapali_gunler','mola_saatleri',
        'kategori','bot_konusma_stili','randevu_modu','hatirlatma_saat','calisan_secim_modu',
        'randevu_onay_modu','onay_timeout_dk','iptal_sinir_saat','mesai_disi_mod','mesai_disi_mesaj',
        'bot_diller','kara_liste_otomatik','kara_liste_ihlal_sinir','slug',
        'varsayilan_tampon_dk','slot_aralik_dk',
        'hatirlatma_zinciri_aktif','haftalik_rapor_aktif','rebook_aktif',
        'google_maps_reserve_url','musteri_formu'
      ];
      const jsonAlanlar = ['mola_saatleri','musteri_formu'];
      const setClauses = [];
      const values = [];
      let idx = 1;
      for (const alan of izinliAlanlar) {
        if (req.body[alan] !== undefined) {
          setClauses.push(`${alan}=$${idx}`);
          values.push(jsonAlanlar.includes(alan) ? JSON.stringify(req.body[alan] || []) : req.body[alan]);
          idx++;
        }
      }
      if (setClauses.length === 0) return res.json({ isletme: null });

      // ─── Çoklu dil paket kontrolü ───
      if (req.body.bot_diller !== undefined) {
        const dilListesi = Array.isArray(req.body.bot_diller) ? req.body.bot_diller :
          (typeof req.body.bot_diller === 'string' ? req.body.bot_diller.split(',').map(d => d.trim()).filter(Boolean) : ['tr']);
        const isletmePaket = (await pool.query('SELECT paket FROM isletmeler WHERE id=$1', [req.kullanici.isletme_id])).rows[0];
        const paketB = await paketGetir(isletmePaket?.paket);
        if (!paketB.coklu_dil && dilListesi.length > 1) {
          return res.status(403).json({ hata: `Çoklu dil desteği ${paketB.isim} paketinde kullanılamıyor. Paketinizi yükseltin!`, limit_asimi: true, ozellik: 'coklu_dil' });
        }
        if (typeof paketB.coklu_dil === 'number' && dilListesi.length > paketB.coklu_dil) {
          return res.status(403).json({ hata: `${paketB.isim} paketinde en fazla ${paketB.coklu_dil} dil destekleniyor. Paketinizi yükseltin!`, limit_asimi: true, ozellik: 'coklu_dil' });
        }
      }

      values.push(req.kullanici.isletme_id);
      const result = await pool.query(
        `UPDATE isletmeler SET ${setClauses.join(', ')} WHERE id=$${idx} RETURNING *`,
        values
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
        `INSERT INTO isletmeler (isim, telefon, adres, ilce, kategori, olusturma_tarihi, deneme_bitis_tarihi) VALUES ($1, $2, $3, $4, $5, NOW(), NOW() + INTERVAL '14 days') RETURNING *`,
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
      const { aktif, paket, isim, adres, ilce, kategori, deneme_bitis_tarihi, paket_bitis_tarihi } = req.body;
      const fields = [];
      const values = [];
      let idx = 1;
      if (aktif !== undefined) { fields.push(`aktif=$${idx++}`); values.push(aktif); }
      if (paket !== undefined) { fields.push(`paket=$${idx++}`); values.push(paket); }
      if (isim !== undefined) { fields.push(`isim=$${idx++}`); values.push(isim); }
      if (adres !== undefined) { fields.push(`adres=$${idx++}`); values.push(adres); }
      if (ilce !== undefined) { fields.push(`ilce=$${idx++}`); values.push(ilce); }
      if (kategori !== undefined) { fields.push(`kategori=$${idx++}`); values.push(kategori); }
      if (deneme_bitis_tarihi !== undefined) { fields.push(`deneme_bitis_tarihi=$${idx++}`); values.push(deneme_bitis_tarihi || null); }
      if (paket_bitis_tarihi !== undefined) { fields.push(`paket_bitis_tarihi=$${idx++}`); values.push(paket_bitis_tarihi || null); }
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
      const isletme = (await pool.query('SELECT isim FROM isletmeler WHERE id=$1', [id])).rows[0];
      // Bağımlı tabloları sırayla temizle (her biri catch ile — tablo yoksa sessizce geç)
      // Etiket atamaları (özel sorgu — etiket tablosuna bağlı)
      await pool.query('DELETE FROM musteri_etiket_atamalari WHERE etiket_id IN (SELECT id FROM musteri_etiketler WHERE isletme_id = $1)', [id]).catch(() => {});
      // Standart tablolar
      const silTablolari = [
        'isletme_bildirimleri', 'zombi_aksiyonlar', 'wa_auth_keys', 'destek_talepleri',
        'sohbet_gecmisi', 'bot_durum', 'bekleme_listesi',
        'kasa_hareketleri', 'prim_odemeleri', 'sms_log', 'gece_rapor_log',
        'yorum_talepleri', 'winback_log', 'puan_hareketleri', 'referans_log',
        'google_yorum_talepleri', 'musteri_etiketler', 'audit_log',
        'odemeler', 'randevular', 'musteriler', 'hizmetler', 'calisanlar', 'admin_kullanicilar'
      ];
      for (const t of silTablolari) {
        await pool.query(`DELETE FROM ${t} WHERE isletme_id = $1`, [id]).catch(() => {});
      }
      await pool.query('DELETE FROM referanslar WHERE sahip_isletme_id = $1', [id]).catch(() => {});
      await pool.query('DELETE FROM isletmeler WHERE id = $1', [id]);
      await this.auditLogYaz(req.kullanici, 'isletme_silindi', `${isletme?.isim || id} silindi (tüm verileriyle)`, 'isletmeler', parseInt(id), req.ip);
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
      const donemVal = donem || bugunTarih().slice(0, 7);
      const durumVal = durum || 'bekliyor';
      const result = await pool.query(
        `INSERT INTO odemeler (isletme_id, tutar, donem, durum) VALUES ($1, $2, $3, $4)
         ON CONFLICT (isletme_id, donem) WHERE isletme_id IS NOT NULL 
         DO UPDATE SET tutar = EXCLUDED.tutar, durum = EXCLUDED.durum
         RETURNING *`,
        [isletme_id, tutar, donemVal, durumVal]
      );
      res.json({ odeme: result.rows[0] });
    } catch (error) {
      res.status(500).json({ hata: error.message });
    }
  }

  async odemeGuncelle(req, res) {
    try {
      const { durum } = req.body;
      const allowedDurumlar = ['odendi', 'bekliyor', 'gecikti', 'basarisiz', 'havale_bekliyor', 'odeme_bekliyor'];
      if (!durum || !allowedDurumlar.includes(durum)) return res.status(400).json({ hata: 'Geçersiz durum' });
      const result = await pool.query(
        `UPDATE odemeler SET durum = $1, odeme_tarihi = CASE WHEN $1 = 'odendi' THEN NOW() ELSE NULL END WHERE id = $2 RETURNING *`,
        [durum, req.params.id]
      );
      await this.auditLogYaz(req.kullanici, `odeme_${durum}`, `Ödeme #${req.params.id} durumu: ${durum}`, 'odemeler', parseInt(req.params.id), req.ip);
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

      const paketBilgi = await paketGetir(isletme.paket);
      const buAy = new Date().toISOString().slice(0, 7);

      // Referans kodu üret (isletme_id + dönem bazlı, sabit)
      const hash = Buffer.from(`${isletmeId}-${buAy}`).toString('base64').replace(/[^A-Z0-9]/gi, '').slice(0, 3).toUpperCase();
      const refKod = `SRGO-${isletmeId}${hash}`;

      // Mevcut ödeme kaydı var mı? (herhangi bir durumda)
      const mevcut = (await pool.query(
        "SELECT id, durum FROM odemeler WHERE isletme_id = $1 AND donem = $2",
        [isletmeId, buAy]
      )).rows[0];

      if (mevcut) {
        // Zaten ödendi ise tekrar havale gönderme
        if (mevcut.durum === 'odendi') {
          return res.json({ mesaj: 'Bu dönem ödemesi zaten tamamlanmış.' });
        }
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
      const paketBilgi = await paketGetir(isletme?.paket);

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

  // ==================== SHOPIER ÖDEME ====================

  async shopierOdemeBaslat(req, res) {
    try {
      const isletmeId = req.kullanici.isletme_id;
      const isletme = (await pool.query('SELECT * FROM isletmeler WHERE id = $1', [isletmeId])).rows[0];
      if (!isletme) return res.status(404).json({ hata: 'İşletme bulunamadı' });

      // Seçilen paket (query param veya mevcut paket)
      const secilenPaket = req.query.paket || isletme.paket || 'baslangic';
      const paketBilgi = await paketGetir(secilenPaket);
      const buAy = new Date().toISOString().slice(0, 7);
      const refKod = `SRGO-${isletmeId}`;
      const paketLabel = paketBilgi.isim || secilenPaket;

      // Shopier'da dinamik dijital ürün oluştur
      const urun = await shopierService.urunOlustur({
        baslik: `SıraGO ${paketLabel} Paket [${refKod}]`,
        aciklama: `SıraGO Randevu Sistemi - ${paketLabel} Paket Aylık Abonelik (${buAy})\nİşletme: ${isletme.isim}\nRef: ${refKod}`,
        fiyat: paketBilgi.fiyat,
      });

      // Bekleyen ödeme kaydı oluştur (shopier_urun_id ile eşleştirme için)
      const mevcut = (await pool.query(
        "SELECT id, durum FROM odemeler WHERE isletme_id = $1 AND donem = $2",
        [isletmeId, buAy]
      )).rows[0];

      if (mevcut) {
        await pool.query(
          "UPDATE odemeler SET durum = 'odeme_bekliyor', odeme_yontemi = 'shopier', referans_kodu = $1, shopier_urun_id = $2 WHERE id = $3",
          [refKod, urun.id, mevcut.id]
        );
      } else {
        await pool.query(
          "INSERT INTO odemeler (isletme_id, tutar, donem, durum, odeme_yontemi, referans_kodu, shopier_urun_id) VALUES ($1, $2, $3, 'odeme_bekliyor', 'shopier', $4, $5)",
          [isletmeId, paketBilgi.fiyat, buAy, refKod, urun.id]
        );
      }

      console.log(`💳 Shopier ödeme başlatıldı: ${isletme.isim} - ${secilenPaket} - ${paketBilgi.fiyat}₺ → ${urun.url}`);

      // Shopier ürün sayfasına yönlendir
      res.redirect(urun.url);
    } catch (error) {
      console.error('❌ Shopier ödeme başlatma hatası:', error);
      res.status(500).json({ hata: 'Ödeme sayfası oluşturulamadı: ' + error.message });
    }
  }

  async shopierWebhook(req, res) {
    try {
      // Signature doğrula
      const signature = req.headers['shopier-signature'] || '';
      const rawBody = req.rawBody || JSON.stringify(req.body);

      if (!shopierService.webhookToken) {
        console.warn('⚠️ SHOPIER_WEBHOOK_TOKEN tanımlı değil! Webhook doğrulama atlanıyor — GÜVENLİK RİSKİ');
      }
      if (shopierService.webhookToken && signature) {
        const gecerli = shopierService.webhookDogrula(rawBody, signature);
        if (!gecerli) {
          console.log('❌ Shopier webhook signature geçersiz');
          return res.status(401).send('Invalid signature');
        }
      } else if (shopierService.webhookToken && !signature) {
        console.log('❌ Shopier webhook: signature header eksik');
        return res.status(401).send('Missing signature');
      }

      const order = req.body;
      console.log(`📩 Shopier webhook geldi: event=${req.headers['shopier-event']}, order=#${order.id}`);

      const sonuc = await shopierService.siparisGeldi(order);
      console.log('📋 Shopier webhook sonuç:', JSON.stringify(sonuc));

      res.status(200).json({ ok: true });
    } catch (error) {
      console.error('❌ Shopier webhook hatası:', error);
      res.status(200).json({ ok: true }); // Shopier retry yapmaması için 200 dön
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
      const { isim, email, telefon, mesaj, kaynak } = req.body;
      if (!isim && !telefon) return res.status(400).json({ hata: 'İsim veya telefon zorunlu.' });
      if (mesaj && mesaj.length > 2000) return res.status(400).json({ hata: 'Mesaj çok uzun (max 2000 karakter).' });

      await pool.query(
        'INSERT INTO iletisim_mesajlari (isim, email, telefon, mesaj, kaynak) VALUES ($1, $2, $3, $4, $5)',
        [(isim || '').slice(0, 255), (email || '').slice(0, 255), (telefon || '').slice(0, 20), (mesaj || 'Landing page başvuru').slice(0, 2000), kaynak || 'web']
      );

      console.log(`📩 Yeni iletişim mesajı: ${isim || telefon} (${email || telefon}) [${kaynak || 'web'}]`);
      res.json({ mesaj: 'Mesajınız başarıyla gönderildi.' });
    } catch (error) {
      res.status(500).json({ hata: error.message });
    }
  }

  // ==================== DASHBOARD EKSTRA ====================

  async dashboardEkstra(req, res) {
    try {
      const isletmeId = req.kullanici.isletme_id;
      const bugun = new Date().toISOString().slice(0, 10);

      // Günün en çok kazandıran hizmeti
      const topHizmet = (await pool.query(`
        SELECT h.isim, COUNT(r.id)::int as adet, COALESCE(SUM(h.fiyat),0)::int as toplam_ciro
        FROM randevular r JOIN hizmetler h ON h.id = r.hizmet_id
        WHERE r.isletme_id=$1 AND r.tarih=$2 AND r.durum != 'iptal'
        GROUP BY h.isim ORDER BY toplam_ciro DESC LIMIT 1
      `, [isletmeId, bugun])).rows[0] || null;

      // Günün en çok randevu alan çalışanı
      const topCalisan = (await pool.query(`
        SELECT c.isim, COUNT(r.id)::int as adet
        FROM randevular r JOIN calisanlar c ON c.id = r.calisan_id
        WHERE r.isletme_id=$1 AND r.tarih=$2 AND r.durum != 'iptal'
        GROUP BY c.isim ORDER BY adet DESC LIMIT 1
      `, [isletmeId, bugun])).rows[0] || null;

      // Paket bitiş bilgisi
      const isletme = (await pool.query('SELECT paket, paket_bitis_tarihi, deneme_bitis_tarihi, olusturma_tarihi FROM isletmeler WHERE id=$1', [isletmeId])).rows[0];
      let paketKalanGun = null;
      let paketBitisTarihi = null;
      let paketDurumTipi = null; // 'deneme' | 'paket' | 'odeme'

      if (isletme) {
        // 1) paket_bitis_tarihi elle set edilmişse en öncelikli
        if (isletme.paket_bitis_tarihi) {
          paketBitisTarihi = new Date(isletme.paket_bitis_tarihi).toISOString().slice(0, 10);
          paketKalanGun = Math.ceil((new Date(isletme.paket_bitis_tarihi) - Date.now()) / 86400000);
          paketDurumTipi = 'paket';
        }

        // 2) Ödeme yapılmışsa → son ödeme tarihinden +30 gün
        if (!paketDurumTipi) {
          const sonOdeme = (await pool.query(
            "SELECT olusturma_tarihi FROM odemeler WHERE isletme_id=$1 AND durum='odendi' ORDER BY olusturma_tarihi DESC LIMIT 1",
            [isletmeId]
          )).rows[0];
          if (sonOdeme?.olusturma_tarihi) {
            const bitis = new Date(sonOdeme.olusturma_tarihi);
            bitis.setDate(bitis.getDate() + 30);
            paketBitisTarihi = bitis.toISOString().slice(0, 10);
            paketKalanGun = Math.ceil((bitis - Date.now()) / 86400000);
            paketDurumTipi = 'paket';
          }
        }

        // 3) Hiçbir ödeme yoksa → deneme süresi
        if (!paketDurumTipi && isletme.deneme_bitis_tarihi) {
          paketBitisTarihi = new Date(isletme.deneme_bitis_tarihi).toISOString().slice(0, 10);
          paketKalanGun = Math.ceil((new Date(isletme.deneme_bitis_tarihi) - Date.now()) / 86400000);
          paketDurumTipi = 'deneme';
        }
      }

      res.json({ topHizmet, topCalisan, paketKalanGun, paketBitisTarihi, paketDurumTipi, paket: isletme?.paket });
    } catch (error) {
      res.json({ topHizmet: null, topCalisan: null, paketKalanGun: null });
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
  // ==================== GELİR TAHMİNİ / FORECASTING ====================

  async gelirTahmini(req, res) {
    try {
      const isletmeId = req.kullanici.isletme_id;
      // Önümüzdeki 7 günlük onaylı randevulardan tahmini gelir
      const gunluk = (await pool.query(`
        SELECT r.tarih, COUNT(*) as randevu_sayi,
          COALESCE(SUM(h.fiyat), 0) as tahmini_gelir
        FROM randevular r
        LEFT JOIN hizmetler h ON r.hizmet_id = h.id
        WHERE r.isletme_id = $1 AND r.tarih BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '6 days'
          AND r.durum IN ('onaylandi','onay_bekliyor','kapora_bekliyor')
        GROUP BY r.tarih ORDER BY r.tarih
      `, [isletmeId])).rows;

      // No-show oranını hesapla (son 30 gün)
      const stat = (await pool.query(`
        SELECT COUNT(*) as toplam,
          COUNT(*) FILTER (WHERE durum = 'gelmedi') as gelmedi
        FROM randevular WHERE isletme_id = $1 AND tarih >= CURRENT_DATE - INTERVAL '30 days'
      `, [isletmeId])).rows[0];
      const noShowOran = parseInt(stat.toplam) > 0 ? parseInt(stat.gelmedi) / parseInt(stat.toplam) : 0;

      // Haftalık toplam ve düzeltilmiş gelir
      const toplamTahmini = gunluk.reduce((s, g) => s + parseFloat(g.tahmini_gelir), 0);
      const duzeltilmisGelir = Math.round(toplamTahmini * (1 - noShowOran));

      // Geçen haftanın gerçekleşen geliri (karşılaştırma)
      const gecenHafta = (await pool.query(`
        SELECT COALESCE(SUM(h.fiyat), 0) as toplam
        FROM randevular r LEFT JOIN hizmetler h ON r.hizmet_id = h.id
        WHERE r.isletme_id = $1 AND r.tarih BETWEEN CURRENT_DATE - INTERVAL '7 days' AND CURRENT_DATE - INTERVAL '1 day'
          AND r.durum = 'tamamlandi'
      `, [isletmeId])).rows[0];

      res.json({
        gunluk,
        toplamTahmini: Math.round(toplamTahmini),
        duzeltilmisGelir,
        noShowOran: Math.round(noShowOran * 100),
        gecenHaftaGelir: Math.round(parseFloat(gecenHafta.toplam))
      });
    } catch (error) {
      res.status(500).json({ hata: error.message });
    }
  }

  // ==================== YOĞUNLUK TAHMİNİ ====================

  async yogunlukTahmini(req, res) {
    try {
      const isletmeId = req.kullanici.isletme_id;
      const isletme = (await pool.query('SELECT calisma_baslangic, calisma_bitis, randevu_suresi_dk FROM isletmeler WHERE id=$1', [isletmeId])).rows[0];
      const sureDk = isletme?.randevu_suresi_dk || 30;
      const basSaat = parseInt((isletme?.calisma_baslangic || '09:00').split(':')[0]);
      const bitSaat = parseInt((isletme?.calisma_bitis || '18:00').split(':')[0]);
      const toplamSlot = Math.floor(((bitSaat - basSaat) * 60) / sureDk);

      // Calisan sayısı
      const calisanSayi = (await pool.query("SELECT COUNT(*) as sayi FROM calisanlar WHERE isletme_id=$1 AND (aktif IS NULL OR aktif=true)", [isletmeId])).rows[0];
      const toplamKapasite = toplamSlot * Math.max(parseInt(calisanSayi.sayi), 1);

      // Yarınki dolu slot sayısı
      const yarinDolu = (await pool.query(`
        SELECT COUNT(*) as sayi FROM randevular
        WHERE isletme_id=$1 AND tarih = CURRENT_DATE + 1 AND durum IN ('onaylandi','onay_bekliyor','kapora_bekliyor')
      `, [isletmeId])).rows[0];

      // Bugünkü dolu slot sayısı
      const bugunDolu = (await pool.query(`
        SELECT COUNT(*) as sayi FROM randevular
        WHERE isletme_id=$1 AND tarih = CURRENT_DATE AND durum IN ('onaylandi','onay_bekliyor','kapora_bekliyor','tamamlandi')
      `, [isletmeId])).rows[0];

      const yarinDoluluk = toplamKapasite > 0 ? Math.round((parseInt(yarinDolu.sayi) / toplamKapasite) * 100) : 0;
      const bugunDoluluk = toplamKapasite > 0 ? Math.round((parseInt(bugunDolu.sayi) / toplamKapasite) * 100) : 0;

      // Renk: 0-50 yeşil, 50-80 sarı, 80+ kırmızı
      const renk = (d) => d >= 80 ? 'red' : d >= 50 ? 'yellow' : 'green';

      res.json({
        yarin: { dolu: parseInt(yarinDolu.sayi), kapasite: toplamKapasite, doluluk: yarinDoluluk, renk: renk(yarinDoluluk) },
        bugun: { dolu: parseInt(bugunDolu.sayi), kapasite: toplamKapasite, doluluk: bugunDoluluk, renk: renk(bugunDoluluk) }
      });
    } catch (error) {
      res.status(500).json({ hata: error.message });
    }
  }

  // ==================== NO-SHOW İSTATİSTİK ====================

  async noShowIstatistik(req, res) {
    try {
      const isletmeId = req.kullanici.isletme_id;
      // Son 30 günlük no-show sayısı ve oranı
      const stat = (await pool.query(`
        SELECT
          COUNT(*) as toplam_randevu,
          COUNT(*) FILTER (WHERE durum = 'gelmedi') as no_show,
          COUNT(*) FILTER (WHERE durum = 'tamamlandi') as tamamlanan,
          COUNT(*) FILTER (WHERE durum = 'iptal') as iptal
        FROM randevular WHERE isletme_id = $1 AND tarih >= CURRENT_DATE - INTERVAL '30 days'
      `, [isletmeId])).rows[0];

      // En çok no-show yapan müşteriler
      const tekrarlayan = (await pool.query(`
        SELECT m.isim, m.telefon, COUNT(*) as no_show_sayi
        FROM randevular r
        JOIN musteriler m ON r.musteri_id = m.id
        WHERE r.isletme_id = $1 AND r.durum = 'gelmedi' AND r.tarih >= CURRENT_DATE - INTERVAL '90 days'
        GROUP BY m.id, m.isim, m.telefon
        HAVING COUNT(*) >= 2
        ORDER BY no_show_sayi DESC LIMIT 10
      `, [isletmeId])).rows;

      // Kaybedilen gelir (no-show'ların hizmet fiyatı toplamı)
      const kaybedilen = (await pool.query(`
        SELECT COALESCE(SUM(h.fiyat), 0) as toplam
        FROM randevular r
        LEFT JOIN hizmetler h ON r.hizmet_id = h.id
        WHERE r.isletme_id = $1 AND r.durum = 'gelmedi' AND r.tarih >= CURRENT_DATE - INTERVAL '30 days'
      `, [isletmeId])).rows[0];

      const toplam = parseInt(stat.toplam_randevu);
      const noShowSayi = parseInt(stat.no_show);
      res.json({
        toplamRandevu: toplam,
        noShow: noShowSayi,
        noShowOran: toplam > 0 ? Math.round((noShowSayi / toplam) * 100) : 0,
        tamamlanan: parseInt(stat.tamamlanan),
        iptal: parseInt(stat.iptal),
        kaybedilenGelir: Math.round(parseFloat(kaybedilen.toplam)),
        tekrarlayan
      });
    } catch (error) {
      res.status(500).json({ hata: error.message });
    }
  }

  // ==================== MÜŞTERİ FORMU ====================

  async musteriFormuGuncelle(req, res) {
    try {
      const isletmeId = req.kullanici.isletme_id;
      const { musteri_formu } = req.body;
      await pool.query('UPDATE isletmeler SET musteri_formu = $1 WHERE id = $2', [JSON.stringify(musteri_formu), isletmeId]);
      res.json({ mesaj: 'Müşteri formu güncellendi' });
    } catch (error) {
      res.status(500).json({ hata: error.message });
    }
  }

  async musteriFormuGetir(req, res) {
    try {
      const isletmeId = req.kullanici.isletme_id;
      const result = (await pool.query('SELECT musteri_formu FROM isletmeler WHERE id=$1', [isletmeId])).rows[0];
      res.json({ musteri_formu: result?.musteri_formu || null });
    } catch (error) {
      res.status(500).json({ hata: error.message });
    }
  }

  // ==================== GOOGLE MAPS RESERVE ====================

  async googleMapsReserveGuncelle(req, res) {
    try {
      const isletmeId = req.kullanici.isletme_id;
      const { google_maps_reserve_url } = req.body;
      await pool.query('UPDATE isletmeler SET google_maps_reserve_url = $1 WHERE id = $2', [google_maps_reserve_url, isletmeId]);
      res.json({ mesaj: 'Google Maps Reserve URL güncellendi' });
    } catch (error) {
      res.status(500).json({ hata: error.message });
    }
  }

  // ==================== SATIŞ BOTU ====================

  async satisBotBaslat(req, res) {
    try {
      const satisBot = require('../services/satisBot');
      console.log('🔄 Satış Bot başlatma isteği geldi, mevcut durum:', satisBot.durum);

      // Zaten bağlıysa tekrar başlatma — sadece durumu döndür
      if (satisBot.durum === 'bagli' && satisBot.sock?.user) {
        console.log('✅ Satış Bot zaten bağlı, yeniden başlatma atlanıyor.');
        return res.json({ mesaj: 'Satış botu zaten bağlı', ...(await satisBot.getDurum()) });
      }

      // Bağlanma sürecindeyse bekle
      if (satisBot.durum === 'baslatiyor' || satisBot.durum === 'qr_bekleniyor') {
        console.log('⏳ Satış Bot zaten başlatılıyor/QR bekliyor.');
        return res.json({ mesaj: 'Satış botu başlatılıyor', ...(await satisBot.getDurum()) });
      }

      // Gerçekten kapalıysa başlat
      if (satisBot.sock) { try { satisBot.sock.end(); } catch(e) {} satisBot.sock = null; }
      satisBot.durum = 'kapali';
      satisBot.qrBase64 = null;
      satisBot.reconnectAttempts = 0;
      console.log('🔄 Satış Bot sıfırlandı, yeniden başlatılıyor...');
      satisBot.baslat();
      // 2sn bekle ki QR event'i gelsin
      await new Promise(r => setTimeout(r, 2000));
      const durum = await satisBot.getDurum();
      console.log('📱 Satış Bot başlatma sonrası durum:', durum.durum, 'QR var mı:', !!durum.qrBase64);
      res.json({ mesaj: 'Satış botu başlatıldı', ...durum });
    } catch (error) {
      console.error('❌ satisBotBaslat hatası:', error);
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
      const durum = await satisBot.getDurum();
      let istatistikler = { gonderilen: 0, bekleyen: 0, olumlu: 0, olumsuz: 0, wp_yok: 0, gunluk_gonderim: 0, gunluk_limit: 50 };
      try {
        istatistikler = await satisBot.istatistikler();
      } catch (e) {
        console.log('⚠️ İstatistik hatası (önemsiz):', e.message);
      }
      res.json({ ...durum, istatistikler });
    } catch (error) {
      console.error('❌ satisBotDurum hatası:', error);
      res.json({ durum: 'kapali', qrBase64: null, aktif: false, istatistikler: { gonderilen: 0, bekleyen: 0, olumlu: 0, olumsuz: 0, wp_yok: 0, gunluk_gonderim: 0, gunluk_limit: 50 } });
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

  async satisBotWpYok(req, res) {
    try {
      const pool = require('../config/db');
      const result = await pool.query(`
        SELECT id, isletme_adi, telefon, kategori, ilce, skor 
        FROM potansiyel_musteriler 
        WHERE wp_mesaj_durumu = 'wp_yok' AND telefon IS NOT NULL
        ORDER BY skor DESC
        LIMIT 50
      `);
      res.json({ liste: result.rows });
    } catch (error) {
      res.status(500).json({ hata: error.message });
    }
  }

  async satisBotAyarGuncelle(req, res) {
    try {
      const satisBot = require('../services/satisBot');
      const ayarlar = satisBot.ayarGuncelle(req.body);
      res.json({ mesaj: 'Ayarlar güncellendi', ayarlar });
    } catch (error) {
      res.status(500).json({ hata: error.message });
    }
  }

  // ==================== SAAS METRİKLERİ ====================

  async saasMetrikleri(req, res) {
    try {
      const buAy = new Date().toISOString().slice(0, 7);
      const gecenAyDate = new Date(); gecenAyDate.setMonth(gecenAyDate.getMonth() - 1);
      const gecenAy = gecenAyDate.toISOString().slice(0, 7);
      const ikiAyOnceDate = new Date(); ikiAyOnceDate.setMonth(ikiAyOnceDate.getMonth() - 2);
      const ikiAyOnce = ikiAyOnceDate.toISOString().slice(0, 7);

      // Aktif işletme sayısı
      const aktifIsletme = (await pool.query("SELECT COUNT(*) as sayi FROM isletmeler WHERE aktif = true")).rows[0];

      // Aktif Aboneler = ödeme yapmış (odendi) VEYA deneme süresinde (son 14 gün kayıt, hiç ödeme yok)
      const odemisIsletmeler = (await pool.query(
        "SELECT DISTINCT isletme_id FROM odemeler WHERE durum = 'odendi'"
      )).rows.map(r => r.isletme_id);

      const denemeIsletmeleri = (await pool.query(`
        SELECT id FROM isletmeler WHERE aktif = true
          AND olusturma_tarihi >= (CURRENT_DATE - interval '14 day')
          AND id NOT IN (SELECT DISTINCT isletme_id FROM odemeler WHERE durum = 'odendi' AND isletme_id IS NOT NULL)
      `)).rows.map(r => r.id);

      const aktifAboneSayi = new Set([...odemisIsletmeler, ...denemeIsletmeleri]).size;

      // MRR — Gerçek bu ay ödenen toplam (sadece odendi)
      const mrrResult = (await pool.query(
        "SELECT COALESCE(SUM(tutar), 0) as toplam FROM odemeler WHERE donem = $1 AND durum = 'odendi'", [buAy]
      )).rows[0];
      const mrr = parseFloat(mrrResult.toplam);

      // Beklenen Gelir — aktif abonelerin paket fiyat toplamı
      let beklenenGelir = 0;
      try {
        const tumPaketler = await paketleriYukle();
        const aktifIsletmePaketler = (await pool.query(
          "SELECT paket FROM isletmeler WHERE aktif = true"
        )).rows;
        for (const a of aktifIsletmePaketler) {
          const p = tumPaketler[a.paket] || tumPaketler['baslangic'];
          beklenenGelir += (p?.fiyat || 0);
        }
      } catch(e) {}

      // Gerçek bu ay gelir (ödenen) — MRR ile aynı
      const buAyGelir = mrr;

      // Geçen ay MRR (gerçek ödenen)
      const gecenAyMrr = (await pool.query(
        "SELECT COALESCE(SUM(tutar), 0) as toplam FROM odemeler WHERE donem = $1 AND durum = 'odendi'", [gecenAy]
      )).rows[0];
      const mrrGecen = parseFloat(gecenAyMrr.toplam);

      // MRR Büyüme %
      const mrrBuyume = mrrGecen > 0 ? ((mrr - mrrGecen) / mrrGecen * 100).toFixed(1) : 0;

      // ARR (Annual Recurring Revenue) — MRR x 12
      const arr = mrr * 12;

      // Churn: Geçen ay aktif olup bu ay aktif olmayanlar
      const gecenAyOdeyenler = (await pool.query(
        "SELECT DISTINCT isletme_id FROM odemeler WHERE donem = $1 AND durum = 'odendi'", [gecenAy]
      )).rows.map(r => r.isletme_id);

      const buAyOdeyenler = (await pool.query(
        "SELECT DISTINCT isletme_id FROM odemeler WHERE donem = $1 AND durum = 'odendi'", [buAy]
      )).rows.map(r => r.isletme_id);

      const churnSayi = gecenAyOdeyenler.filter(id => !buAyOdeyenler.includes(id)).length;
      const churnRate = gecenAyOdeyenler.length > 0 ? ((churnSayi / gecenAyOdeyenler.length) * 100).toFixed(1) : 0;

      // Yeni müşteriler: Bu ay kayıt olan işletmeler
      const yeniMusteriResult = (await pool.query(
        "SELECT COUNT(*) as c FROM isletmeler WHERE aktif = true AND olusturma_tarihi >= date_trunc('month', CURRENT_DATE)"
      )).rows[0];
      const yeniMusteri = parseInt(yeniMusteriResult.c) || 0;

      // Paket dağılımı
      const paketDagilimi = (await pool.query(
        "SELECT paket, COUNT(*) as sayi FROM isletmeler WHERE aktif = true GROUP BY paket ORDER BY sayi DESC"
      )).rows;

      // Son 6 ay gelir trendi
      const gelirTrendi = [];
      for (let i = 5; i >= 0; i--) {
        const d = new Date(); d.setMonth(d.getMonth() - i);
        const donem = d.toISOString().slice(0, 7);
        const gelir = (await pool.query(
          "SELECT COALESCE(SUM(tutar), 0) as toplam FROM odemeler WHERE donem = $1 AND durum = 'odendi'", [donem]
        )).rows[0];
        const odeyenSayi = (await pool.query(
          "SELECT COUNT(DISTINCT isletme_id) as sayi FROM odemeler WHERE donem = $1 AND durum = 'odendi'", [donem]
        )).rows[0];
        gelirTrendi.push({ donem, gelir: parseFloat(gelir.toplam), odeyen: parseInt(odeyenSayi.sayi) });
      }

      // ARPU (Average Revenue Per User)
      const arpu = buAyOdeyenler.length > 0 ? (mrr / buAyOdeyenler.length).toFixed(0) : 0;

      // Kategori dağılımı
      const kategoriDagilimi = (await pool.query(
        "SELECT kategori, COUNT(*) as sayi FROM isletmeler WHERE aktif = true GROUP BY kategori ORDER BY sayi DESC"
      )).rows;

      // Bu ay toplam randevu
      let buAyToplamRandevu = 0;
      try {
        buAyToplamRandevu = parseInt((await pool.query("SELECT COUNT(*) as c FROM randevular WHERE tarih >= date_trunc('month', CURRENT_DATE)")).rows[0]?.c) || 0;
      } catch(e) {}

      // Geçen ay ARPU (karşılaştırma için)
      const gecenAyOdeyenSayi = gecenAyOdeyenler.length;
      const arpuGecen = gecenAyOdeyenSayi > 0 ? (mrrGecen / gecenAyOdeyenSayi).toFixed(0) : 0;
      const arpuDegisim = parseFloat(arpuGecen) > 0 ? (((parseFloat(arpu) - parseFloat(arpuGecen)) / parseFloat(arpuGecen)) * 100).toFixed(1) : 0;

      // Geçen ay churn karşılaştırma
      const ikiAyOnceOdeyenler = (await pool.query(
        "SELECT DISTINCT isletme_id FROM odemeler WHERE donem = $1 AND durum = 'odendi'", [ikiAyOnce]
      )).rows.map(r => r.isletme_id);
      const gecenAyChurnSayi = ikiAyOnceOdeyenler.filter(id => !gecenAyOdeyenler.includes(id)).length;
      const gecenAyChurnRate = ikiAyOnceOdeyenler.length > 0 ? ((gecenAyChurnSayi / ikiAyOnceOdeyenler.length) * 100).toFixed(1) : 0;

      // Referansla gelen işletme sayısı (gerçek kayıtlı referanslar)
      let referanslaGelenSayi = 0;
      try {
        const refResult = (await pool.query(
          "SELECT COUNT(*) as c FROM isletmeler WHERE referans_ile_gelen IS NOT NULL AND referans_ile_gelen > 0"
        )).rows[0];
        referanslaGelenSayi = parseInt(refResult?.c) || 0;
      } catch(e) {}

      // Bu ay ödemeyenler (aktif işletmeler arasında ödeme kaydı 'odendi' olmayanlar)
      let buAyOdemeyenSayi = 0;
      try {
        const odemeyenResult = (await pool.query(`
          SELECT COUNT(*) as c FROM isletmeler i
          WHERE i.aktif = true
            AND NOT EXISTS (SELECT 1 FROM odemeler o WHERE o.isletme_id = i.id AND o.donem = $1 AND o.durum = 'odendi')
            AND i.olusturma_tarihi < (date_trunc('month', CURRENT_DATE) - interval '7 day')
        `, [buAy])).rows[0];
        buAyOdemeyenSayi = parseInt(odemeyenResult?.c) || 0;
      } catch(e) {}

      // Deneme süresi biten (önümüzdeki 7 gün)
      let denemeBitenSayi = 0;
      let denemeBitenler = [];
      try {
        const dResult = (await pool.query(
          `SELECT id, isim, telefon, olusturma_tarihi,
            (olusturma_tarihi + interval '7 day')::date as bitis_tarihi
          FROM isletmeler 
          WHERE aktif = true 
            AND olusturma_tarihi IS NOT NULL
            AND (olusturma_tarihi + interval '7 day')::date BETWEEN CURRENT_DATE AND (CURRENT_DATE + interval '7 day')
            AND id NOT IN (SELECT DISTINCT isletme_id FROM odemeler WHERE durum = 'odendi')
          ORDER BY olusturma_tarihi`
        )).rows;
        denemeBitenSayi = dResult.length;
        denemeBitenler = dResult.slice(0, 10);
      } catch(e) {}

      // Son 6 ay MRR sparkline verisi
      const mrrSparkline = gelirTrendi.map(g => g.gelir);

      res.json({
        mrr, mrrGecen, mrrBuyume: parseFloat(mrrBuyume),
        arr,
        buAyGelir, beklenenGelir,
        churnSayi, churnRate: parseFloat(churnRate),
        gecenAyChurnRate: parseFloat(gecenAyChurnRate),
        yeniMusteri,
        aktifIsletme: parseInt(aktifIsletme.sayi),
        aktifAboneSayi,
        buAyOdeyen: buAyOdeyenler.length,
        arpu: parseFloat(arpu),
        arpuGecen: parseFloat(arpuGecen),
        arpuDegisim: parseFloat(arpuDegisim),
        paketDagilimi,
        kategoriDagilimi,
        gelirTrendi,
        mrrSparkline,
        buAyToplamRandevu,
        referanslaGelenSayi,
        buAyOdemeyenSayi,
        denemeBitenSayi,
        denemeBitenler
      });
    } catch (error) {
      res.status(500).json({ hata: error.message });
    }
  }

  // ==================== İŞLETME DETAY (A-Z Yönetim) ====================

  async isletmeDetay(req, res) {
    try {
      const id = parseInt(req.params.id);
      const buAy = new Date().toISOString().slice(0, 7);

      // Temel bilgiler
      const isletme = (await pool.query('SELECT * FROM isletmeler WHERE id = $1', [id])).rows[0];
      if (!isletme) return res.status(404).json({ hata: 'İşletme bulunamadı' });

      // Admin kullanıcı
      let kullanici = [];
      try { kullanici = (await pool.query('SELECT id, email, rol, aktif, olusturma_tarihi FROM admin_kullanicilar WHERE isletme_id = $1', [id])).rows; } catch(e) { console.error('Detay kullanici hatası:', e.message); }

      // Çalışanlar
      let calisanlar = [];
      try { calisanlar = (await pool.query('SELECT * FROM calisanlar WHERE isletme_id = $1 ORDER BY id', [id])).rows; } catch(e) { console.error('Detay calisanlar hatası:', e.message); }

      // Hizmetler
      let hizmetler = [];
      try { hizmetler = (await pool.query('SELECT * FROM hizmetler WHERE isletme_id = $1 ORDER BY id', [id])).rows; } catch(e) { console.error('Detay hizmetler hatası:', e.message); }

      // Müşteriler
      let musteriSayisi = 0;
      try { musteriSayisi = parseInt((await pool.query('SELECT COUNT(*) as sayi FROM musteriler WHERE isletme_id = $1', [id])).rows[0]?.sayi) || 0; } catch(e) { console.error('Detay musteri hatası:', e.message); }

      // Randevu istatistikleri
      let randevuStats = { toplam: 0, bu_ay: 0, onaylanan: 0, bekleyen: 0, iptal: 0 };
      try {
        const rs = (await pool.query(`
          SELECT 
            COUNT(*) as toplam,
            COUNT(*) FILTER (WHERE tarih >= date_trunc('month', CURRENT_DATE)) as bu_ay,
            COUNT(*) FILTER (WHERE durum = 'onaylandi') as onaylanan,
            COUNT(*) FILTER (WHERE durum = 'bekliyor') as bekleyen,
            COUNT(*) FILTER (WHERE durum = 'iptal') as iptal
          FROM randevular WHERE isletme_id = $1
        `, [id])).rows[0];
        randevuStats = {
          toplam: parseInt(rs.toplam) || 0,
          bu_ay: parseInt(rs.bu_ay) || 0,
          onaylanan: parseInt(rs.onaylanan) || 0,
          bekleyen: parseInt(rs.bekleyen) || 0,
          iptal: parseInt(rs.iptal) || 0
        };
      } catch(e) { console.error('Detay randevu hatası:', e.message); }

      // Ödeme geçmişi
      let odemeler = [];
      try { odemeler = (await pool.query('SELECT * FROM odemeler WHERE isletme_id = $1 ORDER BY donem DESC LIMIT 12', [id])).rows; } catch(e) {}

      // Bot durumu
      let botDurum = null;
      try { botDurum = (await pool.query('SELECT * FROM bot_ayarlar WHERE isletme_id = $1', [id])).rows[0] || null; } catch(e) {}

      // Deneme süresi hesaplama
      const olusturmaGun = isletme.olusturma_tarihi ? Math.floor((new Date() - new Date(isletme.olusturma_tarihi)) / 86400000) : 0;
      const denemeSuresiKalan = Math.max(0, 7 - olusturmaGun);

      // Son 30 gün günlük randevu sayısı
      let gunlukRandevu = [];
      try {
        gunlukRandevu = (await pool.query(`
          SELECT tarih::date as gun, COUNT(*) as sayi FROM randevular 
          WHERE isletme_id = $1 AND tarih >= CURRENT_DATE - INTERVAL '30 days' 
          GROUP BY tarih::date ORDER BY gun
        `, [id])).rows;
      } catch(e) {}

      // Ayarlar
      let ayarlar = null;
      try { ayarlar = (await pool.query('SELECT * FROM isletme_ayarlar WHERE isletme_id = $1', [id])).rows[0]; } catch(e) {}

      console.log(`📋 İşletme detay yüklendi: id=${id}, calisanlar=${calisanlar.length}, hizmetler=${hizmetler.length}, musteri=${musteriSayisi}, randevu_toplam=${randevuStats.toplam}`);

      res.json({
        isletme,
        kullanici,
        calisanlar,
        hizmetler,
        musteri_sayisi: musteriSayisi,
        randevu_stats: randevuStats,
        odemeler,
        bot_durum: botDurum,
        deneme_suresi_kalan: denemeSuresiKalan,
        olusturma_gun: olusturmaGun,
        gunluk_randevu: gunlukRandevu,
        ayarlar
      });
    } catch (error) {
      console.error('İşletme detay hatası:', error);
      res.status(500).json({ hata: error.message });
    }
  }

  async isletmeDenemeUzat(req, res) {
    try {
      const id = parseInt(req.params.id);
      const { gun } = req.body; // kaç gün uzatılacak
      // olusturma_tarihi'ni geri çekerek deneme süresini uzat
      const yeniTarih = new Date();
      yeniTarih.setDate(yeniTarih.getDate() - (7 - (gun || 7)));
      await pool.query('UPDATE isletmeler SET olusturma_tarihi = $1 WHERE id = $2', [yeniTarih.toISOString(), id]);
      res.json({ mesaj: `Deneme süresi ${gun || 7} gün olarak ayarlandı` });
    } catch (error) { res.status(500).json({ hata: error.message }); }
  }

  async isletmeNotEkle(req, res) {
    try {
      const id = parseInt(req.params.id);
      const { not } = req.body;
      await pool.query('UPDATE isletmeler SET admin_notu = $1 WHERE id = $2', [not, id]);
      res.json({ mesaj: 'Not kaydedildi' });
    } catch (error) { res.status(500).json({ hata: error.message }); }
  }

  // ==================== İŞLETME ÖDEME PROFİLİ ====================

  async isletmeOdemeProfili(req, res) {
    try {
      const id = parseInt(req.params.id);
      const buAy = new Date().toISOString().slice(0, 7);

      // İşletme bilgileri
      const isletme = (await pool.query('SELECT id, isim, paket, aktif, olusturma_tarihi, ilce, kategori FROM isletmeler WHERE id = $1', [id])).rows[0];
      if (!isletme) return res.status(404).json({ hata: 'İşletme bulunamadı' });

      // Tüm ödeme geçmişi (son 24 ay)
      const odemeler = (await pool.query(
        'SELECT * FROM odemeler WHERE isletme_id = $1 ORDER BY donem DESC LIMIT 24', [id]
      )).rows;

      // Paket değişiklik geçmişi (audit_log'dan)
      let paketGecmisi = [];
      try {
        paketGecmisi = (await pool.query(`
          SELECT * FROM audit_log WHERE isletme_id = $1 AND islem LIKE '%paket%' ORDER BY olusturma_tarihi DESC LIMIT 20
        `, [id])).rows;
      } catch(e) {}

      // Deneme süresi
      const olusturmaGun = Math.floor((new Date() - new Date(isletme.olusturma_tarihi)) / 86400000);
      const denemeSuresiKalan = Math.max(0, 7 - olusturmaGun);

      // Ödeme istatistikleri
      const toplamOdenen = odemeler.filter(o => o.durum === 'odendi').reduce((s, o) => s + parseFloat(o.tutar || 0), 0);
      const sonOdeme = odemeler.find(o => o.durum === 'odendi');
      const buAyOdeme = odemeler.find(o => o.donem === buAy);
      const gecikmisSayi = odemeler.filter(o => o.durum === 'gecikti').length;

      // Aylık ödeme takvimi (son 12 ay)
      const takvim = [];
      for (let i = 0; i < 12; i++) {
        const d = new Date(); d.setMonth(d.getMonth() - i);
        const donem = d.toISOString().slice(0, 7);
        const odeme = odemeler.find(o => o.donem === donem);
        takvim.push({
          donem,
          durum: odeme ? odeme.durum : (i === 0 && denemeSuresiKalan > 0 ? 'deneme' : 'yok'),
          tutar: odeme ? parseFloat(odeme.tutar) : 0,
          odeme_tarihi: odeme?.odeme_tarihi || null,
          odeme_yontemi: odeme?.odeme_yontemi || null,
          id: odeme?.id || null
        });
      }

      // Paket fiyat bilgisi
      const paketFiyat = { baslangic: 299, profesyonel: 699, kurumsal: 1499, premium: 1499 };

      res.json({
        isletme,
        odemeler,
        paket_gecmisi: paketGecmisi,
        deneme_suresi_kalan: denemeSuresiKalan,
        olusturma_gun: olusturmaGun,
        istatistikler: {
          toplam_odenen: toplamOdenen,
          son_odeme_tarihi: sonOdeme?.odeme_tarihi || null,
          bu_ay_durum: buAyOdeme?.durum || (denemeSuresiKalan > 0 ? 'deneme' : 'odenmedi'),
          gecikme_sayisi: gecikmisSayi,
          toplam_ay: odemeler.length,
          odenen_ay: odemeler.filter(o => o.durum === 'odendi').length
        },
        takvim,
        paket_fiyat: paketFiyat[isletme.paket] || 299
      });
    } catch (error) {
      console.error('Ödeme profili hatası:', error);
      res.status(500).json({ hata: error.message });
    }
  }

  async odemeErteleme(req, res) {
    try {
      const odemeId = parseInt(req.params.id);
      const { yeni_donem, sebep } = req.body;
      
      // Mevcut ödemeyi güncelle
      await pool.query(
        'UPDATE odemeler SET donem = $1, notlar = COALESCE(notlar, \'\') || $2 WHERE id = $3',
        [yeni_donem, `\n[Erteleme: ${new Date().toLocaleDateString('tr-TR')}] ${sebep || 'Süre uzatıldı'}`, odemeId]
      );
      
      res.json({ mesaj: `Ödeme ${yeni_donem} dönemine ertelendi` });
    } catch (error) { res.status(500).json({ hata: error.message }); }
  }

  async odemeSuresiUzat(req, res) {
    try {
      const id = parseInt(req.params.id);
      const { gun } = req.body;
      // olusturma_tarihi'ni ileriye taşı (deneme süresini uzat)
      const yeniTarih = new Date();
      yeniTarih.setDate(yeniTarih.getDate() - (7 - (gun || 7)));
      await pool.query('UPDATE isletmeler SET olusturma_tarihi = $1 WHERE id = $2', [yeniTarih.toISOString(), id]);
      res.json({ mesaj: `Deneme süresi ${gun || 7} güne uzatıldı` });
    } catch (error) { res.status(500).json({ hata: error.message }); }
  }

  // ==================== IMPERSONATION (Müşteri olarak giriş) ====================

  async impersonate(req, res) {
    try {
      const isletmeId = parseInt(req.params.id);
      const jwt = require('jsonwebtoken');
      const impersonateSecret = process.env.JWT_SECRET || 'randevugo-default-secret-key-2024';
      
      // İşletme admin kullanıcısını bul
      const kullanici = (await pool.query(
        "SELECT id, email, rol, isletme_id FROM admin_kullanicilar WHERE isletme_id = $1 AND aktif = true ORDER BY id LIMIT 1",
        [isletmeId]
      )).rows[0];

      if (!kullanici) return res.status(404).json({ hata: 'Bu işletme için admin kullanıcı bulunamadı' });

      await this.auditLogYaz(req.kullanici, 'impersonate', `SuperAdmin ${req.kullanici.email} → İşletme #${isletmeId} (${kullanici.email}) impersonate`, 'admin_kullanicilar', kullanici.id, req.ip);

      const token = jwt.sign(
        { id: kullanici.id, email: kullanici.email, rol: kullanici.rol, isletme_id: kullanici.isletme_id, impersonated: true, impersonator: req.kullanici.email },
        impersonateSecret,
        { expiresIn: '2h' }
      );

      const isletme = (await pool.query('SELECT isim FROM isletmeler WHERE id = $1', [isletmeId])).rows[0];

      console.log(`👤 Impersonation: ${req.kullanici.email} → ${isletme?.isim} (${kullanici.email})`);

      res.json({ token, isletme_isim: isletme?.isim, kullanici_email: kullanici.email });
    } catch (error) {
      res.status(500).json({ hata: error.message });
    }
  }

  // ==================== SATIŞ BOT — ÇOKLU NUMARA ====================

  async satisBotNumaralar(req, res) {
    try {
      const result = await pool.query(
        "SELECT * FROM satis_bot_numaralar ORDER BY id"
      );
      res.json({ numaralar: result.rows });
    } catch (error) {
      // Tablo yoksa boş dön
      res.json({ numaralar: [] });
    }
  }

  async satisBotNumaraEkle(req, res) {
    try {
      const { isim, telefon } = req.body;
      const result = await pool.query(
        "INSERT INTO satis_bot_numaralar (isim, telefon, durum, gonderim_sayisi) VALUES ($1, $2, 'bekliyor', 0) RETURNING *",
        [isim || 'Numara', telefon || '']
      );
      res.json({ numara: result.rows[0] });
    } catch (error) {
      res.status(500).json({ hata: error.message });
    }
  }

  async satisBotNumaraSil(req, res) {
    try {
      await pool.query("DELETE FROM satis_bot_numaralar WHERE id = $1", [req.params.id]);
      res.json({ mesaj: 'Numara silindi' });
    } catch (error) {
      res.status(500).json({ hata: error.message });
    }
  }

  async satisBotNumaraDurumGuncelle(req, res) {
    try {
      const { durum, ban_notu } = req.body;
      const fields = ['durum = $1'];
      const values = [durum];
      let idx = 2;
      if (ban_notu !== undefined) { fields.push(`ban_notu = $${idx++}`); values.push(ban_notu); }
      if (durum === 'banli') { fields.push(`ban_tarihi = NOW()`); }
      values.push(req.params.id);
      await pool.query(
        `UPDATE satis_bot_numaralar SET ${fields.join(', ')} WHERE id = $${idx}`, values
      );
      res.json({ mesaj: 'Güncellendi' });
    } catch (error) {
      res.status(500).json({ hata: error.message });
    }
  }

  // ==================== AUDIT LOG (Sistem Logları) ====================

  async auditLogYaz(kullanici, islem, detay, hedef_tablo, hedef_id, ip) {
    try {
      await pool.query(
        `INSERT INTO audit_log (isletme_id, kullanici_id, kullanici_email, islem, detay, hedef_tablo, hedef_id, ip_adresi)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [kullanici?.isletme_id || null, kullanici?.id || null, kullanici?.email || 'sistem', islem, detay, hedef_tablo || null, hedef_id || null, ip || null]
      );
    } catch (e) { console.log('Audit log yazma hatası:', e.message); }
  }

  async auditLogListele(req, res) {
    try {
      const { limit, offset, isletme_id, islem } = req.query;
      let query = `SELECT al.*, i.isim as isletme_isim FROM audit_log al LEFT JOIN isletmeler i ON al.isletme_id = i.id WHERE 1=1`;
      const params = [];
      let idx = 1;
      if (isletme_id) { query += ` AND al.isletme_id = $${idx++}`; params.push(isletme_id); }
      if (islem) { query += ` AND al.islem ILIKE $${idx++}`; params.push(`%${islem}%`); }
      query += ` ORDER BY al.olusturma_tarihi DESC LIMIT $${idx++} OFFSET $${idx++}`;
      params.push(parseInt(limit) || 50, parseInt(offset) || 0);
      const result = await pool.query(query, params);
      const toplam = (await pool.query("SELECT COUNT(*) as sayi FROM audit_log")).rows[0];
      res.json({ loglar: result.rows, toplam: parseInt(toplam.sayi) });
    } catch (error) {
      res.json({ loglar: [], toplam: 0 });
    }
  }

  // ==================== UPTIME & HEALTH MONITOR ====================

  async sistemDurumu(req, res) {
    try {
      const os = require('os');
      // DB test
      const dbStart = Date.now();
      await pool.query('SELECT 1');
      const dbMs = Date.now() - dbStart;

      // WhatsApp bot durumu
      let wpDurum = 'bilinmiyor';
      try { const wb = require('../services/whatsappWeb'); const st = wb.getGlobalDurum?.() || {}; wpDurum = st.durum || 'bilinmiyor'; } catch(e) {}

      // Satış bot durumu
      let satisBotSt = 'kapali';
      try { const sb = require('../services/satisBot'); satisBotSt = sb.durum || 'kapali'; } catch(e) {}

      // DB bağlantı sayısı
      let dbPool = { total: 0, idle: 0, waiting: 0 };
      try { dbPool = { total: pool.totalCount, idle: pool.idleCount, waiting: pool.waitingCount }; } catch(e) {}

      // Son 24 saat randevu sayısı
      const son24saat = (await pool.query(
        "SELECT COUNT(*) as sayi FROM randevular WHERE olusturma_tarihi >= NOW() - INTERVAL '24 hours'"
      )).rows[0];

      // Son 24 saat hata logları
      const sonHatalar = (await pool.query(
        "SELECT COUNT(*) as sayi FROM audit_log WHERE islem ILIKE '%hata%' AND olusturma_tarihi >= NOW() - INTERVAL '24 hours'"
      )).rows[0];

      res.json({
        durum: 'aktif',
        sunucu: {
          uptime_saat: (os.uptime() / 3600).toFixed(1),
          bellek_mb: (process.memoryUsage().heapUsed / 1024 / 1024).toFixed(0),
          bellek_toplam_mb: (os.totalmem() / 1024 / 1024).toFixed(0),
          cpu_yukleme: os.loadavg()[0]?.toFixed(2) || 0,
          platform: os.platform(),
          node_versiyon: process.version,
        },
        veritabani: {
          durum: dbMs < 1000 ? 'saglikli' : 'yavas',
          yanit_ms: dbMs,
          havuz: dbPool,
        },
        servisler: {
          whatsapp_bot: wpDurum,
          satis_bot: satisBotSt,
        },
        son_24_saat: {
          randevu: parseInt(son24saat.sayi),
          hata: parseInt(sonHatalar.sayi),
        },
        zaman: new Date().toISOString(),
      });
    } catch (error) {
      res.status(500).json({ durum: 'hata', hata: error.message });
    }
  }

  // ==================== DESTEK TALEPLERİ (Ticket) ====================

  // Müşteri: destek talebi oluştur
  async destekTalebiOlustur(req, res) {
    try {
      const { konu, mesaj, oncelik } = req.body;
      if (!konu || !mesaj) return res.status(400).json({ hata: 'Konu ve mesaj zorunlu' });
      const result = await pool.query(
        `INSERT INTO destek_talepleri (isletme_id, kullanici_id, konu, mesaj, oncelik) VALUES ($1, $2, $3, $4, $5) RETURNING *`,
        [req.kullanici.isletme_id, req.kullanici.id, konu, mesaj, oncelik || 'normal']
      );
      await this.auditLogYaz(req.kullanici, 'destek_talebi_olusturuldu', `Konu: ${konu}`, 'destek_talepleri', result.rows[0].id);
      res.json({ talep: result.rows[0] });
    } catch (error) {
      res.status(500).json({ hata: error.message });
    }
  }

  // Müşteri: kendi taleplerini gör
  async destekTaleplerimGetir(req, res) {
    try {
      const result = await pool.query(
        "SELECT * FROM destek_talepleri WHERE isletme_id = $1 ORDER BY olusturma_tarihi DESC", [req.kullanici.isletme_id]
      );
      res.json({ talepler: result.rows });
    } catch (error) {
      res.json({ talepler: [] });
    }
  }

  // SuperAdmin: tüm talepleri gör
  async destekTalepleriListele(req, res) {
    try {
      const { durum } = req.query;
      let query = `SELECT dt.*, i.isim as isletme_isim FROM destek_talepleri dt LEFT JOIN isletmeler i ON dt.isletme_id = i.id`;
      const params = [];
      if (durum && durum !== 'hepsi') { query += ` WHERE dt.durum = $1`; params.push(durum); }
      query += ` ORDER BY CASE dt.oncelik WHEN 'acil' THEN 0 WHEN 'yuksek' THEN 1 WHEN 'normal' THEN 2 ELSE 3 END, dt.olusturma_tarihi DESC`;
      const result = await pool.query(query, params);
      res.json({ talepler: result.rows });
    } catch (error) {
      res.json({ talepler: [] });
    }
  }

  // SuperAdmin: talebe yanıt + durum güncelle
  async destekTalebiYanitla(req, res) {
    try {
      const { admin_yanit, durum } = req.body;
      const fields = [];
      const values = [];
      let idx = 1;
      if (admin_yanit) { fields.push(`admin_yanit = $${idx++}`); values.push(admin_yanit); fields.push(`admin_yanit_tarihi = NOW()`); }
      if (durum) { fields.push(`durum = $${idx++}`); values.push(durum); }
      values.push(req.params.id);
      await pool.query(`UPDATE destek_talepleri SET ${fields.join(', ')} WHERE id = $${idx}`, values);
      res.json({ mesaj: 'Talep güncellendi' });
    } catch (error) {
      res.status(500).json({ hata: error.message });
    }
  }

  // ==================== DİNAMİK PAKET YÖNETİMİ ====================

  async paketTanimlariGetir(req, res) {
    try {
      const result = await pool.query("SELECT * FROM paket_tanimlari ORDER BY sira, id");
      res.json({ paketler: result.rows });
    } catch (error) {
      // Tablo yoksa veya boşsa config'den dön
      res.json({ paketler: [] });
    }
  }

  async paketTanimiEkle(req, res) {
    try {
      const { kod, isim, fiyat, calisan_limit, hizmet_limit, aylik_randevu_limit, bot_aktif, hatirlatma, istatistik, export_aktif, ozellikler, sira } = req.body;
      const result = await pool.query(
        `INSERT INTO paket_tanimlari (kod, isim, fiyat, calisan_limit, hizmet_limit, aylik_randevu_limit, bot_aktif, hatirlatma, istatistik, export_aktif, ozellikler, sira)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
        [kod, isim, fiyat, calisan_limit||1, hizmet_limit||5, aylik_randevu_limit||100, bot_aktif!==false, !!hatirlatma, !!istatistik, !!export_aktif, ozellikler||'', sira||0]
      );
      paketCacheTemizle();
      await this.auditLogYaz(req.kullanici, 'paket_eklendi', `${isim} (${fiyat}₺)`, 'paket_tanimlari', result.rows[0].id);
      res.json({ paket: result.rows[0] });
    } catch (error) {
      res.status(500).json({ hata: error.message });
    }
  }

  async paketTanimiGuncelle(req, res) {
    try {
      const { isim, fiyat, calisan_limit, hizmet_limit, aylik_randevu_limit, bot_aktif, hatirlatma, istatistik, export_aktif, ozellikler, aktif, sira } = req.body;
      await pool.query(
        `UPDATE paket_tanimlari SET isim=$1, fiyat=$2, calisan_limit=$3, hizmet_limit=$4, aylik_randevu_limit=$5,
         bot_aktif=$6, hatirlatma=$7, istatistik=$8, export_aktif=$9, ozellikler=$10, aktif=$11, sira=$12 WHERE id=$13`,
        [isim, fiyat, calisan_limit, hizmet_limit, aylik_randevu_limit, bot_aktif, hatirlatma, istatistik, export_aktif, ozellikler||'', aktif!==false, sira||0, req.params.id]
      );
      paketCacheTemizle();
      res.json({ mesaj: 'Güncellendi' });
    } catch (error) {
      res.status(500).json({ hata: error.message });
    }
  }

  async paketTanimiSil(req, res) {
    try {
      await pool.query("DELETE FROM paket_tanimlari WHERE id = $1", [req.params.id]);
      paketCacheTemizle();
      res.json({ mesaj: 'Silindi' });
    } catch (error) {
      res.status(500).json({ hata: error.message });
    }
  }

  // ==================== ZOMBİ MÜŞTERİ TAKİBİ ====================

  async zombiMusteriler(req, res) {
    try {
      // Bot bağlı mı kontrol: wa_auth_keys tablosunda kayıt varsa bot bağlanmış demektir
      let botBagliIds = [];
      try {
        const botRows = (await pool.query("SELECT DISTINCT isletme_id FROM wa_auth_keys WHERE isletme_id < 999999")).rows;
        botBagliIds = botRows.map(r => r.isletme_id);
      } catch(e) {}

      const result = await pool.query(`
        SELECT i.id, i.isim, i.telefon, i.kategori, i.paket, i.olusturma_tarihi,
          i.bot_aktif, i.telegram_token, i.whatsapp_no,
          COUNT(r.id)::int as randevu_sayisi,
          MAX(r.tarih) as son_randevu
        FROM isletmeler i
        LEFT JOIN randevular r ON r.isletme_id = i.id
        WHERE i.aktif = true
        GROUP BY i.id
        ORDER BY i.olusturma_tarihi DESC
      `);

      // Zombi durumunu hesapla
      const zombiler = result.rows.map(i => {
        const botBagli = botBagliIds.includes(i.id) || !!i.telegram_token || !!i.whatsapp_no;
        const randevuSayisi = parseInt(i.randevu_sayisi) || 0;
        const sonRandevu = i.son_randevu ? new Date(i.son_randevu) : null;
        const gunFarki = sonRandevu ? Math.floor((new Date() - sonRandevu) / 86400000) : null;

        let zombi_durum = null;
        if (!botBagli && randevuSayisi === 0) zombi_durum = 'bot_yok';
        else if (randevuSayisi === 0) zombi_durum = 'randevu_yok';
        else if (gunFarki !== null && gunFarki > 30) zombi_durum = 'pasif_30gun';

        return { ...i, bot_bagli: botBagli, zombi_durum };
      }).filter(i => i.zombi_durum !== null);

      res.json({ zombiler });
    } catch (error) {
      console.error('Zombi müşteri hatası:', error.message);
      res.json({ zombiler: [] });
    }
  }

  async zombiTopluMesaj(req, res) {
    try {
      const { isletme_ids, mesaj, kanal } = req.body;
      if (!isletme_ids?.length || !mesaj) return res.status(400).json({ hata: 'İşletme listesi ve mesaj gerekli' });

      const isletmeler = (await pool.query(
        'SELECT id, isim, telefon, telegram_token FROM isletmeler WHERE id = ANY($1::int[])',
        [isletme_ids]
      )).rows;

      let basarili = 0, basarisiz = 0;

      for (const isl of isletmeler) {
        try {
          if ((kanal === 'whatsapp' || kanal === 'hepsi') && isl.telefon) {
            const satisBot = require('../services/satisBot');
            if (satisBot.sock && satisBot.durum === 'bagli') {
              const tel = isl.telefon.replace(/^\+/, '');
              const jid = `${tel}@s.whatsapp.net`;
              await satisBot.sock.sendMessage(jid, { text: mesaj });
              basarili++;
              await new Promise(r => setTimeout(r, 1500));
            } else { basarisiz++; }
          }
        } catch (e) { basarisiz++; }
      }

      res.json({ mesaj: `${basarili} işletmeye mesaj gönderildi`, basarili, basarisiz, toplam: isletmeler.length });
    } catch (error) {
      res.status(500).json({ hata: error.message });
    }
  }

  // ==================== ZOMBİ OTOMATİK AKSİYON ====================

  async zombiOtomatikAksiyon(req, res) {
    try {
      const zombiResult = await pool.query(`
        SELECT i.id, i.isim, i.telefon, i.paket, i.aktif, i.zombi_uyari_gonderildi,
          i.olusturma_tarihi,
          COUNT(r.id) as randevu_sayisi,
          MAX(r.tarih) as son_randevu
        FROM isletmeler i
        LEFT JOIN randevular r ON r.isletme_id = i.id
        WHERE i.aktif = true
        GROUP BY i.id
        ORDER BY i.olusturma_tarihi DESC
      `);

      let botBagliIds = [];
      try {
        const waResult = await pool.query("SELECT DISTINCT isletme_id FROM wa_auth_keys WHERE isletme_id != 999999");
        botBagliIds = waResult.rows.map(r => r.isletme_id);
      } catch(e) {}

      const aksiyonlar = [];
      const simdi = new Date();

      for (const i of zombiResult.rows) {
        const randevuSayisi = parseInt(i.randevu_sayisi) || 0;
        const sonRandevu = i.son_randevu ? new Date(i.son_randevu) : null;
        const gunFarki = sonRandevu ? Math.floor((simdi - sonRandevu) / 86400000) : null;
        const botBagli = botBagliIds.includes(i.id);
        const kayitGun = Math.floor((simdi - new Date(i.olusturma_tarihi)) / 86400000);

        // Kural 1: Bot bağlamamış, kayıttan 3+ gün geçmiş → WhatsApp uyarı
        if (!botBagli && kayitGun >= 3 && !i.zombi_uyari_gonderildi) {
          aksiyonlar.push({
            isletme_id: i.id, isletme_isim: i.isim, telefon: i.telefon, paket: i.paket,
            aksiyon_tipi: 'bot_uyari',
            mesaj: `Merhaba ${i.isim} 🙂\n\nSıraGO hesabınız açıldı ama henüz WhatsApp botunuzu bağlamadınız.\n\nBotu bağlamadan müşterileriniz randevu alamaz. 2 dakikada bağlayabilirsiniz!\n\n👉 Panel: admin.sırago.com`,
            oneri: 'WhatsApp bot bağlama hatırlatması gönder',
            zombi_durum: 'bot_yok'
          });
        }

        // Kural 2: Bot bağlı ama hiç randevu yok, kayıttan 7+ gün → Yardım teklifi
        if (botBagli && randevuSayisi === 0 && kayitGun >= 7 && !i.zombi_uyari_gonderildi) {
          aksiyonlar.push({
            isletme_id: i.id, isletme_isim: i.isim, telefon: i.telefon, paket: i.paket,
            aksiyon_tipi: 'yardim_teklif',
            mesaj: `Merhaba ${i.isim} 🙂\n\nSisteminiz hazır ama henüz müşterilerinizden randevu almadınız.\n\nSize ücretsiz kurulum desteği verelim! Çalışma saatlerinizi, hizmetlerinizi birlikte ayarlayalım.\n\nBize "yardım" yazmanız yeterli 🙏`,
            oneri: 'Ücretsiz kurulum desteği teklif et',
            zombi_durum: 'randevu_yok'
          });
        }

        // Kural 3: 30+ gün randevu yok → Reactivation mesajı
        if (gunFarki !== null && gunFarki > 30) {
          aksiyonlar.push({
            isletme_id: i.id, isletme_isim: i.isim, telefon: i.telefon, paket: i.paket,
            aksiyon_tipi: 'reaktivasyon',
            mesaj: `Merhaba ${i.isim} 🙂\n\nSon ${gunFarki} gündür SıraGO'da randevu almadığınızı fark ettik.\n\nSisteminiz hâlâ aktif! Müşterileriniz online randevu alabilir.\n\nSorun yaşıyorsanız bize yazın, hemen yardımcı olalım 🙏\n\n👉 admin.sırago.com`,
            oneri: 'Reaktivasyon mesajı gönder',
            zombi_durum: 'pasif_30gun'
          });
        }

        // Kural 4: 60+ gün → Paket düşürme / hesap dondurma önerisi
        if (gunFarki !== null && gunFarki > 60) {
          aksiyonlar.push({
            isletme_id: i.id, isletme_isim: i.isim, telefon: i.telefon, paket: i.paket,
            aksiyon_tipi: 'hesap_dondur',
            mesaj: `Merhaba ${i.isim} 🙂\n\nSon ${gunFarki} gündür sistem kullanılmıyor.\n\nHesabınızı dondurabiliriz — tekrar kullanmak istediğinizde hemen aktifleşir.\n\nYa da size özel indirimli bir paket sunabiliriz. Ne dersiniz?`,
            oneri: 'Hesap dondurma veya indirimli paket teklifi',
            zombi_durum: 'pasif_60gun'
          });
        }
      }

      res.json({ aksiyonlar, toplam: aksiyonlar.length });
    } catch (error) {
      res.status(500).json({ hata: error.message });
    }
  }

  async zombiAksiyonUygula(req, res) {
    try {
      const { isletme_id, aksiyon_tipi, mesaj } = req.body;
      if (!isletme_id || !aksiyon_tipi) return res.status(400).json({ hata: 'İşletme ve aksiyon tipi gerekli' });

      let sonuc = 'bekliyor';

      // WhatsApp mesaj gönder
      if (mesaj) {
        const isletme = (await pool.query('SELECT telefon FROM isletmeler WHERE id = $1', [isletme_id])).rows[0];
        if (isletme?.telefon) {
          try {
            const satisBot = require('../services/satisBot');
            if (satisBot.sock && satisBot.durum === 'bagli') {
              const tel = isletme.telefon.replace(/^\+/, '').replace(/^0/, '90');
              const jid = `${tel}@s.whatsapp.net`;
              await satisBot.sock.sendMessage(jid, { text: mesaj });
              sonuc = 'gonderildi';
            } else {
              sonuc = 'bot_kapali';
            }
          } catch (e) {
            sonuc = 'hata: ' + e.message;
          }
        }
      }

      // Aksiyon kaydı oluştur
      await pool.query(
        'INSERT INTO zombi_aksiyonlar (isletme_id, aksiyon_tipi, mesaj, durum, sonuc, uygulama_tarihi) VALUES ($1, $2, $3, $4, $5, NOW())',
        [isletme_id, aksiyon_tipi, mesaj, sonuc === 'gonderildi' ? 'tamamlandi' : sonuc, sonuc]
      );

      // İşletme uyarı durumunu güncelle
      await pool.query(
        'UPDATE isletmeler SET zombi_uyari_gonderildi = true, zombi_uyari_tarihi = NOW() WHERE id = $1',
        [isletme_id]
      );

      // İşletme paneline bildirim oluştur (3 kanal: panel + WA + SMS)
      const tipLabels = { bot_uyari: 'Bot Bağlama Hatırlatması', reaktivasyon: 'Kayıp Müşteri Uyarısı', yardim_teklif: 'Kurulum Desteği', hesap_dondur: 'Hesap Durumu' };
      await this.bildirimOlustur(isletme_id, 'zombi', tipLabels[aksiyon_tipi] || 'Zombi Uyarısı', mesaj || 'Detaylar için panelinizi kontrol edin.');

      res.json({ mesaj: 'Aksiyon uygulandı', sonuc });
    } catch (error) {
      res.status(500).json({ hata: error.message });
    }
  }

  async zombiAksiyonGecmisi(req, res) {
    try {
      const result = await pool.query(`
        SELECT za.*, i.isim as isletme_isim 
        FROM zombi_aksiyonlar za 
        LEFT JOIN isletmeler i ON za.isletme_id = i.id 
        ORDER BY za.olusturma_tarihi DESC LIMIT 100
      `);
      res.json({ aksiyonlar: result.rows });
    } catch (error) {
      res.status(500).json({ hata: error.message });
    }
  }

  async zombiTopluAksiyon(req, res) {
    try {
      const { aksiyonlar } = req.body;
      if (!aksiyonlar?.length) return res.status(400).json({ hata: 'Aksiyon listesi gerekli' });

      let basarili = 0, basarisiz = 0;
      const satisBot = require('../services/satisBot');

      for (const a of aksiyonlar) {
        try {
          let sonuc = 'bekliyor';
          if (a.mesaj) {
            const isletme = (await pool.query('SELECT telefon FROM isletmeler WHERE id = $1', [a.isletme_id])).rows[0];
            if (isletme?.telefon && satisBot.sock && satisBot.durum === 'bagli') {
              const tel = isletme.telefon.replace(/^\+/, '').replace(/^0/, '90');
              await satisBot.sock.sendMessage(`${tel}@s.whatsapp.net`, { text: a.mesaj });
              sonuc = 'gonderildi';
              await new Promise(r => setTimeout(r, 2000));
            }
          }
          await pool.query(
            'INSERT INTO zombi_aksiyonlar (isletme_id, aksiyon_tipi, mesaj, durum, sonuc, uygulama_tarihi) VALUES ($1, $2, $3, $4, $5, NOW())',
            [a.isletme_id, a.aksiyon_tipi, a.mesaj, sonuc === 'gonderildi' ? 'tamamlandi' : sonuc, sonuc]
          );
          await pool.query('UPDATE isletmeler SET zombi_uyari_gonderildi = true, zombi_uyari_tarihi = NOW() WHERE id = $1', [a.isletme_id]);
          basarili++;
        } catch (e) { basarisiz++; }
      }

      res.json({ mesaj: `${basarili} aksiyon uygulandı`, basarili, basarisiz });
    } catch (error) {
      res.status(500).json({ hata: error.message });
    }
  }

  // ==================== REFERANS (Affiliate) SİSTEMİ ====================

  async referanslarListele(req, res) {
    try {
      const result = await pool.query(`
        SELECT r.*, i.isim as isletme_isim
        FROM referanslar r
        JOIN isletmeler i ON r.sahip_isletme_id = i.id
        ORDER BY r.toplam_davet DESC
      `);
      res.json({ referanslar: result.rows });
    } catch (error) {
      res.json({ referanslar: [] });
    }
  }

  async referansOlustur(req, res) {
    try {
      const isletmeId = req.body.isletme_id || req.kullanici?.isletme_id;
      const bedavaGun = parseInt(req.body.bedava_gun) || 30;
      const minDavet = parseInt(req.body.min_davet) || 1;
      if (!isletmeId) return res.status(400).json({ hata: 'İşletme ID zorunlu' });
      const kod = 'REF-' + Math.random().toString(36).substring(2, 8).toUpperCase();
      const result = await pool.query(
        "INSERT INTO referanslar (referans_kodu, sahip_isletme_id, bedava_gun, min_davet) VALUES ($1, $2, $3, $4) RETURNING *",
        [kod, isletmeId, bedavaGun, minDavet]
      );
      await pool.query("UPDATE isletmeler SET referans_kodu = $1 WHERE id = $2", [kod, isletmeId]);
      res.json({ referans: result.rows[0] });
    } catch (error) {
      res.status(500).json({ hata: error.message });
    }
  }

  async referansKullan(req, res) {
    try {
      const { referans_kodu, yeni_isletme_id } = req.body;
      const ref = (await pool.query("SELECT * FROM referanslar WHERE referans_kodu = $1", [referans_kodu])).rows[0];
      if (!ref) return res.status(404).json({ hata: 'Geçersiz referans kodu' });
      // Davet sayısını artır + referans bağlantısını kaydet (ödül ilk ödeme anında verilecek)
      await pool.query("UPDATE referanslar SET toplam_davet = toplam_davet + 1 WHERE id = $1", [ref.id]);
      await pool.query("UPDATE isletmeler SET referans_ile_gelen = $1 WHERE id = $2", [ref.sahip_isletme_id, yeni_isletme_id]);

      await this.auditLogYaz(null, 'referans_kullanildi', `Kod: ${referans_kodu}, sahip: ${ref.sahip_isletme_id}, yeni: ${yeni_isletme_id}`, 'referanslar', ref.id);

      res.json({
        mesaj: `Referans kaydedildi! Ödül, davet edilen işletme ilk ödemesini yaptığında verilecek.`,
        sahip_isletme_id: ref.sahip_isletme_id,
        bedava_verildi: false
      });
    } catch (error) {
      res.status(500).json({ hata: error.message });
    }
  }

  async referansBedavaAyGuncelle(req, res) {
    try {
      const id = parseInt(req.params.id);
      const { kazanilan_ay, bedava_gun, min_davet } = req.body;
      const updates = [];
      const values = [];
      let idx = 1;
      if (kazanilan_ay !== undefined) { updates.push(`kazanilan_ay = $${idx++}`); values.push(parseInt(kazanilan_ay)); }
      if (bedava_gun !== undefined) { updates.push(`bedava_gun = $${idx++}`); values.push(parseInt(bedava_gun)); }
      if (min_davet !== undefined) { updates.push(`min_davet = $${idx++}`); values.push(parseInt(min_davet)); }
      if (updates.length === 0) return res.status(400).json({ hata: 'Güncellenecek alan yok' });
      values.push(id);
      await pool.query(`UPDATE referanslar SET ${updates.join(', ')} WHERE id = $${idx}`, values);
      res.json({ mesaj: 'Referans güncellendi' });
    } catch (error) {
      res.status(500).json({ hata: error.message });
    }
  }

  async referansSil(req, res) {
    try {
      const id = parseInt(req.params.id);
      await pool.query("DELETE FROM referanslar WHERE id = $1", [id]);
      res.json({ mesaj: 'Referans silindi' });
    } catch (error) { res.status(500).json({ hata: error.message }); }
  }

  // ==================== GLOBAL DUYURU MODÜLÜ ====================

  async duyurulariGetir(req, res) {
    try {
      const result = await pool.query("SELECT * FROM duyurular ORDER BY olusturma_tarihi DESC");
      res.json({ duyurular: result.rows });
    } catch (error) {
      res.json({ duyurular: [] });
    }
  }

  // Müşteri paneli: sadece aktif duyurular
  async aktifDuyurular(req, res) {
    try {
      const result = await pool.query(
        "SELECT * FROM duyurular WHERE aktif = true ORDER BY olusturma_tarihi DESC LIMIT 5"
      );
      res.json({ duyurular: result.rows });
    } catch (error) {
      res.json({ duyurular: [] });
    }
  }

  async duyuruEkle(req, res) {
    try {
      const { baslik, mesaj, tip, hedef } = req.body;
      if (!baslik || !mesaj) return res.status(400).json({ hata: 'Başlık ve mesaj zorunlu' });
      const result = await pool.query(
        "INSERT INTO duyurular (baslik, mesaj, tip, hedef) VALUES ($1, $2, $3, $4) RETURNING *",
        [baslik, mesaj, tip || 'bilgi', hedef || 'hepsi']
      );
      await this.auditLogYaz(req.kullanici, 'duyuru_yayinlandi', baslik, 'duyurular', result.rows[0].id);
      res.json({ duyuru: result.rows[0] });
    } catch (error) {
      res.status(500).json({ hata: error.message });
    }
  }

  async duyuruGuncelle(req, res) {
    try {
      const { baslik, mesaj, tip, aktif, hedef } = req.body;
      await pool.query(
        "UPDATE duyurular SET baslik=$1, mesaj=$2, tip=$3, aktif=$4, hedef=$5 WHERE id=$6",
        [baslik, mesaj, tip, aktif, hedef || 'hepsi', req.params.id]
      );
      res.json({ mesaj: 'Güncellendi' });
    } catch (error) {
      res.status(500).json({ hata: error.message });
    }
  }

  async duyuruSil(req, res) {
    try {
      await pool.query("DELETE FROM duyurular WHERE id = $1", [req.params.id]);
      res.json({ mesaj: 'Silindi' });
    } catch (error) {
      res.status(500).json({ hata: error.message });
    }
  }

  // ==================== VERİ DIŞA AKTARMA (Export) ====================

  async exportMusteriler(req, res) {
    try {
      const isletmeId = req.kullanici.isletme_id;
      // Paket kontrolü — export_aktif flag'i kontrol et
      const isletme = (await pool.query('SELECT paket FROM isletmeler WHERE id=$1', [isletmeId])).rows[0];
      const paketBilgi = await paketGetir(isletme?.paket);
      if (!paketBilgi.export_aktif) {
        return res.status(403).json({ hata: `Excel dışa aktarma ${paketBilgi.isim} paketinde kullanılamıyor. Paketinizi yükseltin!`, limit_asimi: true });
      }
      const musteriler = (await pool.query(`
        SELECT m.isim, m.telefon, COUNT(r.id) as randevu_sayisi, MAX(r.tarih) as son_randevu,
               COALESCE(SUM(h.fiyat), 0) as toplam_harcama
        FROM musteriler m
        JOIN randevular r ON r.musteri_id = m.id
        LEFT JOIN hizmetler h ON r.hizmet_id = h.id
        WHERE r.isletme_id = $1
        GROUP BY m.id ORDER BY randevu_sayisi DESC
      `, [isletmeId])).rows;

      // CSV formatı (Excel uyumlu BOM + ; ayraç)
      const BOM = '\uFEFF';
      let csv = BOM + 'İsim;Telefon;Randevu Sayısı;Son Randevu;Toplam Harcama\n';
      musteriler.forEach(m => {
        csv += `${m.isim};${m.telefon};${m.randevu_sayisi};${m.son_randevu || '-'};${m.toplam_harcama}₺\n`;
      });

      await this.auditLogYaz(req.kullanici, 'musteri_export', `${musteriler.length} müşteri dışa aktarıldı`, 'musteriler', null);
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename=musteriler_${new Date().toISOString().slice(0,10)}.csv`);
      res.send(csv);
    } catch (error) {
      res.status(500).json({ hata: error.message });
    }
  }
  // ==================== PREMIUM KONTROL HELPER ====================
  async _paketOzellikKontrol(isletmeId, featureKey) {
    const isletme = (await pool.query('SELECT paket FROM isletmeler WHERE id=$1', [isletmeId])).rows[0];
    const paket = await paketGetir(isletme?.paket);
    return { izinVar: !!paket[featureKey], paket };
  }

  // ==================== ETİKETLEME (Mini-CRM) ====================

  async etiketleriGetir(req, res) {
    try {
      const isletmeId = req.kullanici.isletme_id;
      const etiketler = (await pool.query(
        `SELECT e.*, (SELECT COUNT(*) FROM musteri_etiket_atamalari ea WHERE ea.etiket_id=e.id) as musteri_sayisi
         FROM musteri_etiketler e WHERE e.isletme_id=$1 ORDER BY e.isim`, [isletmeId]
      )).rows;
      res.json({ etiketler });
    } catch (error) { res.status(500).json({ hata: error.message }); }
  }

  async etiketEkle(req, res) {
    try {
      const isletmeId = req.kullanici.isletme_id;
      const isletme = (await pool.query('SELECT paket FROM isletmeler WHERE id=$1', [isletmeId])).rows[0];
      const paketB = await paketGetir(isletme?.paket);
      if (!paketB.export_aktif) return res.status(403).json({ hata: `Müşteri etiketleme ${paketB.isim} paketinde kullanılamıyor. Paketinizi yükseltin!`, limit_asimi: true });
      const { isim, renk } = req.body;
      if (!isim) return res.status(400).json({ hata: 'Etiket adı gerekli' });
      const result = await pool.query(
        'INSERT INTO musteri_etiketler (isletme_id, isim, renk) VALUES ($1,$2,$3) RETURNING *',
        [isletmeId, isim.trim(), renk || '#6366f1']
      );
      res.json({ etiket: result.rows[0] });
    } catch (error) {
      if (error.code === '23505') return res.status(400).json({ hata: 'Bu etiket zaten mevcut' });
      res.status(500).json({ hata: error.message });
    }
  }

  async etiketGuncelle(req, res) {
    try {
      const { isim, renk } = req.body;
      await pool.query('UPDATE musteri_etiketler SET isim=COALESCE($1,isim), renk=COALESCE($2,renk) WHERE id=$3 AND isletme_id=$4',
        [isim, renk, req.params.id, req.kullanici.isletme_id]);
      res.json({ mesaj: 'Etiket güncellendi' });
    } catch (error) { res.status(500).json({ hata: error.message }); }
  }

  async etiketSil(req, res) {
    try {
      await pool.query('DELETE FROM musteri_etiketler WHERE id=$1 AND isletme_id=$2', [req.params.id, req.kullanici.isletme_id]);
      res.json({ mesaj: 'Etiket silindi' });
    } catch (error) { res.status(500).json({ hata: error.message }); }
  }

  async musteriEtiketAta(req, res) {
    try {
      const isletmeId = req.kullanici.isletme_id;
      const isletme = (await pool.query('SELECT paket FROM isletmeler WHERE id=$1', [isletmeId])).rows[0];
      const paketB = await paketGetir(isletme?.paket);
      if (!paketB.export_aktif) return res.status(403).json({ hata: `Bu özellik ${paketB.isim} paketinde kullanılamıyor. Paketinizi yükseltin!`, limit_asimi: true });
      const { musteri_telefon, etiket_id } = req.body;
      if (!musteri_telefon || !etiket_id) return res.status(400).json({ hata: 'Telefon ve etiket ID gerekli' });
      await pool.query(
        'INSERT INTO musteri_etiket_atamalari (musteri_telefon, etiket_id, isletme_id) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING',
        [musteri_telefon, etiket_id, isletmeId]
      );
      res.json({ mesaj: 'Etiket atandı' });
    } catch (error) { res.status(500).json({ hata: error.message }); }
  }

  async musteriEtiketKaldir(req, res) {
    try {
      const { musteri_telefon, etiket_id } = req.body;
      await pool.query('DELETE FROM musteri_etiket_atamalari WHERE musteri_telefon=$1 AND etiket_id=$2 AND isletme_id=$3',
        [musteri_telefon, etiket_id, req.kullanici.isletme_id]);
      res.json({ mesaj: 'Etiket kaldırıldı' });
    } catch (error) { res.status(500).json({ hata: error.message }); }
  }

  async musteriEtiketleri(req, res) {
    try {
      const { telefon } = req.params;
      const etiketler = (await pool.query(
        `SELECT e.* FROM musteri_etiketler e
         JOIN musteri_etiket_atamalari ea ON ea.etiket_id=e.id
         WHERE ea.musteri_telefon=$1 AND ea.isletme_id=$2`, [telefon, req.kullanici.isletme_id]
      )).rows;
      res.json({ etiketler });
    } catch (error) { res.status(500).json({ hata: error.message }); }
  }

  async etiketliMusteriler(req, res) {
    try {
      const { etiketId } = req.params;
      const musteriler = (await pool.query(
        `SELECT DISTINCT m.isim, m.telefon, ea.olusturma_tarihi as etiket_tarihi
         FROM musteri_etiket_atamalari ea
         JOIN musteriler m ON m.telefon=ea.musteri_telefon
         WHERE ea.etiket_id=$1 AND ea.isletme_id=$2 ORDER BY m.isim`,
        [etiketId, req.kullanici.isletme_id]
      )).rows;
      res.json({ musteriler });
    } catch (error) { res.status(500).json({ hata: error.message }); }
  }

  async topluEtiketAta(req, res) {
    try {
      const isletmeId = req.kullanici.isletme_id;
      const { telefonlar, etiket_id } = req.body;
      if (!telefonlar?.length || !etiket_id) return res.status(400).json({ hata: 'Telefon listesi ve etiket ID gerekli' });
      let atanan = 0;
      for (const tel of telefonlar) {
        try {
          await pool.query('INSERT INTO musteri_etiket_atamalari (musteri_telefon, etiket_id, isletme_id) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING',
            [tel, etiket_id, isletmeId]);
          atanan++;
        } catch (e) {}
      }
      res.json({ mesaj: `${atanan} müşteriye etiket atandı`, atanan });
    } catch (error) { res.status(500).json({ hata: error.message }); }
  }

  // ==================== GOOGLE YORUM FEEDBACK ====================

  async googleYorumAyarlar(req, res) {
    try {
      const isletmeId = req.kullanici.isletme_id;
      const isletme = (await pool.query('SELECT google_maps_url, google_yorum_aktif, paket FROM isletmeler WHERE id=$1', [isletmeId])).rows[0];
      const paketB = await paketGetir(isletme?.paket);
      if (!paketB.yorum_avcisi) return res.status(403).json({ hata: `Yorum Avcısı ${paketB.isim} paketinde kullanılamıyor. Paketinizi yükseltin!`, limit_asimi: true });
      res.json({ google_maps_url: isletme.google_maps_url, google_yorum_aktif: isletme.google_yorum_aktif });
    } catch (error) { res.status(500).json({ hata: error.message }); }
  }

  async googleYorumAyarGuncelle(req, res) {
    try {
      const isletmeId = req.kullanici.isletme_id;
      const isletme = (await pool.query('SELECT paket FROM isletmeler WHERE id=$1', [isletmeId])).rows[0];
      const paketB = await paketGetir(isletme?.paket);
      if (!paketB.yorum_avcisi) return res.status(403).json({ hata: `Yorum Avcısı ${paketB.isim} paketinde kullanılamıyor. Paketinizi yükseltin!`, limit_asimi: true });
      const { google_maps_url, google_yorum_aktif } = req.body;
      await pool.query('UPDATE isletmeler SET google_maps_url=COALESCE($1,google_maps_url), google_yorum_aktif=COALESCE($2,google_yorum_aktif) WHERE id=$3',
        [google_maps_url, google_yorum_aktif, isletmeId]);
      res.json({ mesaj: 'Google yorum ayarları güncellendi' });
    } catch (error) { res.status(500).json({ hata: error.message }); }
  }

  async googleYorumTalepleri(req, res) {
    try {
      const isletmeId = req.kullanici.isletme_id;
      const result = await pool.query(
        `SELECT gyt.*, m.isim as musteri_isim FROM google_yorum_talepleri gyt
         LEFT JOIN musteriler m ON m.telefon=gyt.musteri_telefon
         WHERE gyt.isletme_id=$1 ORDER BY gyt.olusturma_tarihi DESC LIMIT 50`, [isletmeId]
      );
      res.json({ talepler: result.rows });
    } catch (error) { res.status(500).json({ hata: error.message }); }
  }

  // ==================== PREMİUM ÖZELLİK DURUMU ====================

  async premiumOzellikDurumu(req, res) {
    try {
      const isletmeId = req.kullanici.isletme_id;
      const isletme = (await pool.query('SELECT paket, google_maps_url, google_yorum_aktif FROM isletmeler WHERE id=$1', [isletmeId])).rows[0];
      const paketBilgi = await paketGetir(isletme?.paket);
      res.json({
        premium: !!paketBilgi.export_aktif && !!paketBilgi.istatistik,
        paket: isletme?.paket || 'baslangic',
        paket_bilgi: paketBilgi,
        ozellikler: {
          toplu_kampanya: !!paketBilgi.export_aktif,
          google_yorum: !!paketBilgi.yorum_avcisi,
          musteri_etiketleme: !!paketBilgi.export_aktif,
          excel_export: !!paketBilgi.export_aktif,
          hatirlatma: !!paketBilgi.hatirlatma,
          istatistik: !!paketBilgi.istatistik,
          kasa: !!paketBilgi.kasa,
          prim: !!paketBilgi.prim,
          sadakat: !!paketBilgi.sadakat,
          winback: !!paketBilgi.winback,
          yorum_avcisi: !!paketBilgi.yorum_avcisi,
          gece_raporu: !!paketBilgi.gece_raporu,
          sms_hatirlatma: !!paketBilgi.sms_hatirlatma,
          oncelikli_destek: !!paketBilgi.oncelikli_destek,
          api_erisimi: !!paketBilgi.api_erisimi,
          coklu_dil: paketBilgi.coklu_dil || false,
        },
        google_maps_url: isletme?.google_maps_url,
        google_yorum_aktif: isletme?.google_yorum_aktif
      });
    } catch (error) { res.status(500).json({ hata: error.message }); }
  }
  // ==================== MÜŞTERİ AKTİVİTE HARİTASI ====================

  async musteriAktivite(req, res) {
    try {
      const buAy = new Date().toISOString().slice(0, 7);
      const gecenAyDate = new Date(); gecenAyDate.setMonth(gecenAyDate.getMonth() - 1);
      const gecenAy = gecenAyDate.toISOString().slice(0, 7);

      // Her işletmenin aktivite verileri
      let isletmeler = [];
      try {
        // Önce basit query ile işletmeleri al
        const isletmeRows = (await pool.query('SELECT * FROM isletmeler ORDER BY id')).rows;
        
        // Her işletme için ayrı ayrı istatistikleri topla
        for (const i of isletmeRows) {
          let buAyR = 0, gecenAyR = 0, toplamR = 0, toplamM = 0, hizmetS = 0, calisanS = 0;
          try { buAyR = parseInt((await pool.query("SELECT COUNT(*) as c FROM randevular WHERE isletme_id = $1 AND tarih >= date_trunc('month', CURRENT_DATE)", [i.id])).rows[0]?.c) || 0; } catch(e) {}
          try { gecenAyR = parseInt((await pool.query("SELECT COUNT(*) as c FROM randevular WHERE isletme_id = $1 AND tarih >= date_trunc('month', CURRENT_DATE) - interval '1 month' AND tarih < date_trunc('month', CURRENT_DATE)", [i.id])).rows[0]?.c) || 0; } catch(e) {}
          try { toplamR = parseInt((await pool.query("SELECT COUNT(*) as c FROM randevular WHERE isletme_id = $1", [i.id])).rows[0]?.c) || 0; } catch(e) {}
          try { toplamM = parseInt((await pool.query("SELECT COUNT(*) as c FROM musteriler WHERE isletme_id = $1", [i.id])).rows[0]?.c) || 0; } catch(e) {}
          try { hizmetS = parseInt((await pool.query("SELECT COUNT(*) as c FROM hizmetler WHERE isletme_id = $1", [i.id])).rows[0]?.c) || 0; } catch(e) {}
          try { calisanS = parseInt((await pool.query("SELECT COUNT(*) as c FROM calisanlar WHERE isletme_id = $1", [i.id])).rows[0]?.c) || 0; } catch(e) {}
          
          isletmeler.push({
            id: i.id, isim: i.isim, kategori: i.kategori || '', paket: i.paket, aktif: i.aktif, olusturma_tarihi: i.olusturma_tarihi, ilce: i.ilce || '',
            bu_ay_randevu: buAyR, gecen_ay_randevu: gecenAyR, toplam_musteri: toplamM, hizmet_sayisi: hizmetS, calisan_sayisi: calisanS, toplam_randevu: toplamR
          });
        }
        isletmeler.sort((a, b) => b.bu_ay_randevu - a.bu_ay_randevu);
      } catch(e) { console.error('Aktivite ana sorgu hatası:', e.message); }

      // Bot kullanım durumu — sohbet_gecmisi tablosu
      let botKullanim = {};
      try {
        botKullanim = (await pool.query(`
          SELECT isletme_id, COUNT(*) as mesaj_sayisi 
          FROM sohbet_gecmisi 
          WHERE olusturma_tarihi >= date_trunc('month', CURRENT_DATE) 
          GROUP BY isletme_id
        `)).rows.reduce((acc, r) => { acc[r.isletme_id] = parseInt(r.mesaj_sayisi); return acc; }, {});
      } catch(e) { console.log('Bot kullanım sorgu hatası:', e.message); }

      // Ödeme durumları
      let odemeDurumlari = {};
      try {
        odemeDurumlari = (await pool.query(`
          SELECT isletme_id, durum FROM odemeler WHERE donem = $1
        `, [buAy])).rows.reduce((acc, r) => { acc[r.isletme_id] = r.durum; return acc; }, {});
      } catch(e) {}

      // Son giriş tarihleri — audit_log veya admin_kullanicilar.son_giris
      let sonGirisler = {};
      try {
        // Önce audit_log'dan dene
        sonGirisler = (await pool.query(`
          SELECT isletme_id, MAX(olusturma_tarihi) as son_giris FROM audit_log WHERE islem ILIKE '%giris%' OR islem ILIKE '%login%' GROUP BY isletme_id
        `)).rows.reduce((acc, r) => { acc[r.isletme_id] = r.son_giris; return acc; }, {});
      } catch(e) {}
      // Eğer audit_log boşsa, admin_kullanicilar tablosundan son_giris al
      if (Object.keys(sonGirisler).length === 0) {
        try {
          sonGirisler = (await pool.query(`
            SELECT isletme_id, MAX(guncelleme_tarihi) as son_giris FROM admin_kullanicilar WHERE isletme_id IS NOT NULL GROUP BY isletme_id
          `)).rows.reduce((acc, r) => { acc[r.isletme_id] = r.son_giris; return acc; }, {});
        } catch(e) {}
      }

      const aktiviteler = isletmeler.map(i => {
        const buAyR = parseInt(i.bu_ay_randevu) || 0;
        const gecenAyR = parseInt(i.gecen_ay_randevu) || 0;
        const buyume = gecenAyR > 0 ? Math.round((buAyR - gecenAyR) / gecenAyR * 100) : (buAyR > 0 ? 100 : 0);
        const botMesaj = botKullanim[i.id] || 0;
        
        // Aktivite skoru: randevu(40%) + müşteri(20%) + bot(20%) + hizmet(10%) + çalışan(10%)
        const skor = Math.min(100, Math.round(
          Math.min(buAyR * 4, 40) + 
          Math.min(parseInt(i.toplam_musteri) * 2, 20) + 
          Math.min(botMesaj * 0.5, 20) + 
          Math.min(parseInt(i.hizmet_sayisi) * 5, 10) + 
          Math.min(parseInt(i.calisan_sayisi) * 5, 10)
        ));

        return {
          id: i.id,
          isim: i.isim,
          kategori: i.kategori,
          paket: i.paket,
          aktif: i.aktif,
          ilce: i.ilce,
          olusturma_tarihi: i.olusturma_tarihi,
          bu_ay_randevu: buAyR,
          gecen_ay_randevu: gecenAyR,
          randevu_buyume: buyume,
          toplam_randevu: parseInt(i.toplam_randevu) || 0,
          toplam_musteri: parseInt(i.toplam_musteri) || 0,
          hizmet_sayisi: parseInt(i.hizmet_sayisi) || 0,
          calisan_sayisi: parseInt(i.calisan_sayisi) || 0,
          bot_mesaj: botMesaj,
          odeme_durumu: odemeDurumlari[i.id] || 'odenmedi',
          son_giris: sonGirisler[i.id] || null,
          aktivite_skoru: skor
        };
      });

      // Genel istatistikler
      const toplamRandevu = aktiviteler.reduce((s, a) => s + a.bu_ay_randevu, 0);
      const toplamMusteri = aktiviteler.reduce((s, a) => s + a.toplam_musteri, 0);
      const ortSkor = aktiviteler.length > 0 ? Math.round(aktiviteler.reduce((s, a) => s + a.aktivite_skoru, 0) / aktiviteler.length) : 0;
      const aktifSayi = aktiviteler.filter(a => a.aktivite_skoru > 20).length;
      const pasifSayi = aktiviteler.filter(a => a.aktivite_skoru <= 20).length;

      res.json({
        aktiviteler,
        ozet: { toplamRandevu, toplamMusteri, ortSkor, aktifSayi, pasifSayi, toplam: aktiviteler.length }
      });
    } catch (error) {
      console.error('Müşteri aktivite hatası:', error);
      res.status(500).json({ hata: error.message });
    }
  }

  // ==================== BİLDİRİM MERKEZİ ====================

  async bildirimMerkezi(req, res) {
    try {
      const buAy = new Date().toISOString().slice(0, 7);
      const bugun = new Date().toISOString().slice(0, 10);
      const bildirimler = [];

      // 1. Ödeme gecikmeleri
      const odemeyenler = (await pool.query(`
        SELECT i.id, i.isim, i.paket, i.olusturma_tarihi
        FROM isletmeler i
        WHERE i.aktif = true
          AND NOT EXISTS (SELECT 1 FROM odemeler o WHERE o.isletme_id = i.id AND o.donem = $1 AND o.durum = 'odendi')
      `, [buAy])).rows;

      for (const i of odemeyenler) {
        const gunFark = Math.floor((new Date() - new Date(i.olusturma_tarihi)) / 86400000);
        if (gunFark > 7) {
          bildirimler.push({
            tip: 'odeme_gecikme',
            oncelik: 'yuksek',
            baslik: `${i.isim} ödeme yapmadı`,
            mesaj: `${buAy} dönemi için ödeme yapılmadı. Paket: ${i.paket}`,
            tarih: new Date().toISOString(),
            isletme_id: i.id,
            ikon: '💰'
          });
        }
      }

      // 2. Deneme süresi dolacak işletmeler (kalan <= 2 gün)
      const denemeSuresiDolanlar = (await pool.query(`
        SELECT id, isim, olusturma_tarihi FROM isletmeler WHERE aktif = true
      `)).rows.filter(i => {
        const gun = Math.floor((new Date() - new Date(i.olusturma_tarihi)) / 86400000);
        return gun >= 5 && gun <= 7;
      });

      for (const i of denemeSuresiDolanlar) {
        const kalan = 7 - Math.floor((new Date() - new Date(i.olusturma_tarihi)) / 86400000);
        bildirimler.push({
          tip: 'deneme_bitiyor',
          oncelik: 'orta',
          baslik: `${i.isim} deneme süresi bitiyor`,
          mesaj: `${kalan} gün kaldı. Ödeme yapılmazsa erişim kısıtlanacak.`,
          tarih: i.olusturma_tarihi,
          isletme_id: i.id,
          ikon: '⏰'
        });
      }

      // 3. Yeni kayıtlar (son 7 gün)
      const yeniKayitlar = (await pool.query(`
        SELECT id, isim, kategori, olusturma_tarihi FROM isletmeler 
        WHERE olusturma_tarihi >= NOW() - INTERVAL '7 days' ORDER BY olusturma_tarihi DESC
      `)).rows;

      for (const i of yeniKayitlar) {
        bildirimler.push({
          tip: 'yeni_kayit',
          oncelik: 'dusuk',
          baslik: `Yeni işletme: ${i.isim}`,
          mesaj: `${i.kategori} kategorisinde yeni kayıt.`,
          tarih: i.olusturma_tarihi,
          isletme_id: i.id,
          ikon: '🆕'
        });
      }

      // 4. Havale bekleyenler
      const havaleBekleyenler = (await pool.query(`
        SELECT o.id, o.isletme_id, o.tutar, o.donem, i.isim
        FROM odemeler o JOIN isletmeler i ON i.id = o.isletme_id
        WHERE o.durum = 'havale_bekliyor' ORDER BY o.olusturma_tarihi DESC
      `)).rows;

      for (const h of havaleBekleyenler) {
        bildirimler.push({
          tip: 'havale_onay',
          oncelik: 'yuksek',
          baslik: `${h.isim} havale onay bekliyor`,
          mesaj: `${h.tutar}₺ havale bildirimi - ${h.donem} dönemi`,
          tarih: new Date().toISOString(),
          isletme_id: h.isletme_id,
          odeme_id: h.id,
          ikon: '🏦'
        });
      }

      // 5. Destek talepleri (açık olanlar)
      let acikDestekler = [];
      try {
        acikDestekler = (await pool.query(`
          SELECT d.id, d.baslik, d.olusturma_tarihi, i.isim
          FROM destek_talepleri d LEFT JOIN isletmeler i ON i.id = d.isletme_id
          WHERE d.durum = 'acik' ORDER BY d.olusturma_tarihi DESC LIMIT 10
        `)).rows;
      } catch(e) {}

      for (const d of acikDestekler) {
        bildirimler.push({
          tip: 'destek',
          oncelik: 'orta',
          baslik: `Destek: ${d.baslik}`,
          mesaj: `${d.isim || 'Bilinmeyen'} yardım bekliyor.`,
          tarih: d.olusturma_tarihi,
          ikon: '🎫'
        });
      }

      // 6. Pasif işletmeler (bu ay 0 randevu)
      const pasifler = (await pool.query(`
        SELECT i.id, i.isim FROM isletmeler i WHERE i.aktif = true
          AND NOT EXISTS (SELECT 1 FROM randevular r WHERE r.isletme_id = i.id AND r.tarih >= date_trunc('month', CURRENT_DATE))
          AND i.olusturma_tarihi < NOW() - INTERVAL '7 days'
      `)).rows;

      for (const p of pasifler) {
        bildirimler.push({
          tip: 'pasif_isletme',
          oncelik: 'dusuk',
          baslik: `${p.isim} pasif görünüyor`,
          mesaj: 'Bu ay hiç randevu oluşturmadı.',
          tarih: new Date().toISOString(),
          isletme_id: p.id,
          ikon: '😴'
        });
      }

      // Önceliğe göre sırala
      const oncelikSira = { yuksek: 0, orta: 1, dusuk: 2 };
      bildirimler.sort((a, b) => (oncelikSira[a.oncelik] || 2) - (oncelikSira[b.oncelik] || 2));

      // Özet
      const ozet = {
        toplam: bildirimler.length,
        yuksek: bildirimler.filter(b => b.oncelik === 'yuksek').length,
        orta: bildirimler.filter(b => b.oncelik === 'orta').length,
        dusuk: bildirimler.filter(b => b.oncelik === 'dusuk').length
      };

      res.json({ bildirimler, ozet });
    } catch (error) {
      console.error('Bildirim merkezi hatası:', error);
      res.status(500).json({ hata: error.message });
    }
  }

  // ==================== KARA LİSTE ====================

  async karaListeGetir(req, res) {
    try {
      const result = await pool.query(
        'SELECT * FROM kara_liste WHERE isletme_id = $1 ORDER BY olusturma_tarihi DESC',
        [req.kullanici.isletme_id]
      );
      res.json({ karaListe: result.rows });
    } catch (error) {
      res.status(500).json({ hata: error.message });
    }
  }

  async karaListeEkle(req, res) {
    try {
      const { telefon, sebep } = req.body;
      if (!telefon) return res.status(400).json({ hata: 'Telefon numarası gerekli' });
      const result = await pool.query(
        `INSERT INTO kara_liste (isletme_id, telefon, sebep, aktif) VALUES ($1, $2, $3, true)
         ON CONFLICT (isletme_id, telefon) DO UPDATE SET aktif = true, sebep = $3
         RETURNING *`,
        [req.kullanici.isletme_id, telefon, sebep || 'manuel']
      );
      res.json({ kayit: result.rows[0] });
    } catch (error) {
      res.status(500).json({ hata: error.message });
    }
  }

  async karaListeSil(req, res) {
    try {
      await pool.query(
        'DELETE FROM kara_liste WHERE id = $1 AND isletme_id = $2',
        [req.params.id, req.kullanici.isletme_id]
      );
      res.json({ basarili: true });
    } catch (error) {
      res.status(500).json({ hata: error.message });
    }
  }

  // ==================== FİNANS & CÜZDAN ====================

  async finansOzet(req, res) {
    try {
      const isletmeId = req.kullanici.isletme_id;

      // İşletme kapora ayarları
      const isletme = (await pool.query(
        'SELECT kapora_aktif, kapora_alt_siniri, kapora_orani, kapora_iptal_saati FROM isletmeler WHERE id=$1',
        [isletmeId]
      )).rows[0] || {};

      // Cüzdan bakiyesi (yoksa oluştur)
      let cuzdan = (await pool.query('SELECT * FROM cuzdan WHERE isletme_id=$1', [isletmeId])).rows[0];
      if (!cuzdan) {
        cuzdan = (await pool.query(
          'INSERT INTO cuzdan (isletme_id) VALUES ($1) RETURNING *', [isletmeId]
        )).rows[0];
      }

      // Kapora ödenen randevular toplamı (gerçek zamanlı hesapla)
      const kaporaTop = (await pool.query(
        "SELECT COALESCE(SUM(kapora_tutari),0) as toplam FROM randevular WHERE isletme_id=$1 AND kapora_durumu='odendi'",
        [isletmeId]
      )).rows[0];

      const toplamKapora = parseFloat(kaporaTop.toplam);
      const siragoKesinti = parseFloat(cuzdan.sirago_kesinti);
      const mahsupEdilen = parseFloat(cuzdan.mahsup_edilen);
      const cekilen = parseFloat(cuzdan.cekilen);
      const netBakiye = toplamKapora - siragoKesinti - mahsupEdilen - cekilen;

      // Güncel cüzdan bakiyesini güncelle
      await pool.query(
        'UPDATE cuzdan SET toplam_kapora=$1, guncelleme_tarihi=NOW() WHERE isletme_id=$2',
        [toplamKapora, isletmeId]
      );

      // Son kapora ödemeleri (son 20)
      const sonOdemeler = (await pool.query(`
        SELECT r.id, r.tarih, r.saat, r.kapora_tutari, r.kapora_durumu,
               m.isim as musteri_isim, h.isim as hizmet_isim
        FROM randevular r
        JOIN musteriler m ON r.musteri_id = m.id
        LEFT JOIN hizmetler h ON r.hizmet_id = h.id
        WHERE r.isletme_id=$1 AND r.kapora_durumu IN ('odendi','bekliyor','iade')
        ORDER BY r.olusturma_tarihi DESC LIMIT 20
      `, [isletmeId])).rows;

      // Hakediş talepleri
      const talepler = (await pool.query(
        'SELECT * FROM hakedis_talepleri WHERE isletme_id=$1 ORDER BY talep_tarihi DESC LIMIT 10',
        [isletmeId]
      )).rows;

      res.json({
        ayarlar: {
          kapora_aktif: isletme.kapora_aktif || false,
          kapora_alt_siniri: parseFloat(isletme.kapora_alt_siniri) || 0,
          kapora_orani: isletme.kapora_orani || 20,
          kapora_iptal_saati: isletme.kapora_iptal_saati || 2,
        },
        cuzdan: {
          toplam_kapora: toplamKapora,
          sirago_kesinti: siragoKesinti,
          mahsup_edilen: mahsupEdilen,
          cekilen,
          net_bakiye: netBakiye,
        },
        son_odemeler: sonOdemeler,
        talepler,
      });
    } catch (error) {
      res.status(500).json({ hata: error.message });
    }
  }

  async finansAyarlarGuncelle(req, res) {
    try {
      const isletmeId = req.kullanici.isletme_id;
      const { kapora_aktif, kapora_alt_siniri, kapora_orani, kapora_iptal_saati } = req.body;

      await pool.query(
        'UPDATE isletmeler SET kapora_aktif=$1, kapora_alt_siniri=$2, kapora_orani=$3, kapora_iptal_saati=$4 WHERE id=$5',
        [
          !!kapora_aktif,
          parseFloat(kapora_alt_siniri) || 0,
          parseInt(kapora_orani) || 20,
          parseInt(kapora_iptal_saati) || 2,
          isletmeId
        ]
      );

      res.json({ mesaj: 'Kapora ayarları güncellendi' });
    } catch (error) {
      res.status(500).json({ hata: error.message });
    }
  }

  async hakedisOlustur(req, res) {
    try {
      const isletmeId = req.kullanici.isletme_id;
      const { iban, ad_soyad } = req.body;

      if (!iban || !ad_soyad) return res.status(400).json({ hata: 'IBAN ve Ad Soyad zorunlu' });

      // Net bakiye kontrolü
      let cuzdan = (await pool.query('SELECT * FROM cuzdan WHERE isletme_id=$1', [isletmeId])).rows[0];
      if (!cuzdan) return res.status(400).json({ hata: 'Cüzdan bulunamadı' });

      const kaporaTop = (await pool.query(
        "SELECT COALESCE(SUM(kapora_tutari),0) as toplam FROM randevular WHERE isletme_id=$1 AND kapora_durumu='odendi'",
        [isletmeId]
      )).rows[0];
      const toplamKapora = parseFloat(kaporaTop.toplam);
      const netBakiye = toplamKapora - parseFloat(cuzdan.sirago_kesinti) - parseFloat(cuzdan.mahsup_edilen) - parseFloat(cuzdan.cekilen);

      if (netBakiye < 500) return res.status(400).json({ hata: 'Minimum çekim tutarı 500 TL' });

      // Bekleyen talep var mı?
      const bekleyen = (await pool.query(
        "SELECT id FROM hakedis_talepleri WHERE isletme_id=$1 AND durum='bekliyor'", [isletmeId]
      )).rows[0];
      if (bekleyen) return res.status(400).json({ hata: 'Zaten bekleyen bir talebiniz var' });

      const talep = (await pool.query(
        'INSERT INTO hakedis_talepleri (isletme_id, tutar, iban, ad_soyad) VALUES ($1, $2, $3, $4) RETURNING *',
        [isletmeId, netBakiye, iban.replace(/\s/g, ''), ad_soyad]
      )).rows[0];

      res.json({ mesaj: 'Hakediş talebi oluşturuldu', talep });
    } catch (error) {
      res.status(500).json({ hata: error.message });
    }
  }

  // SuperAdmin: Hakediş talepleri
  async hakedisListele(req, res) {
    try {
      const result = await pool.query(`
        SELECT ht.*, i.isim as isletme_isim
        FROM hakedis_talepleri ht
        JOIN isletmeler i ON ht.isletme_id = i.id
        ORDER BY ht.talep_tarihi DESC
      `);
      res.json({ talepler: result.rows });
    } catch (error) {
      res.status(500).json({ hata: error.message });
    }
  }

  async hakedisIsle(req, res) {
    try {
      const { id } = req.params;
      const { durum } = req.body; // 'onaylandi' veya 'reddedildi'

      const talep = (await pool.query('SELECT * FROM hakedis_talepleri WHERE id=$1', [id])).rows[0];
      if (!talep) return res.status(404).json({ hata: 'Talep bulunamadı' });

      await pool.query(
        'UPDATE hakedis_talepleri SET durum=$1, islem_tarihi=NOW() WHERE id=$2',
        [durum, id]
      );

      if (durum === 'onaylandi') {
        // Cüzdandan düş
        await pool.query(
          'UPDATE cuzdan SET cekilen = cekilen + $1, guncelleme_tarihi = NOW() WHERE isletme_id = $2',
          [talep.tutar, talep.isletme_id]
        );
      }

      res.json({ mesaj: `Talep ${durum}` });
    } catch (error) {
      res.status(500).json({ hata: error.message });
    }
  }
  // ==================== REFERANS AĞI ====================

  async referansAyarlariGetir(req, res) {
    try {
      const isletmeId = req.kullanici.isletme_id;
      const isletme = (await pool.query(
        'SELECT referans_aktif, referans_puan_davet, referans_puan_davetli FROM isletmeler WHERE id=$1',
        [isletmeId]
      )).rows[0];
      res.json({ ayarlar: isletme || {} });
    } catch (error) { res.status(500).json({ hata: error.message }); }
  }

  async referansAyarlariGuncelle(req, res) {
    try {
      const isletmeId = req.kullanici.isletme_id;
      const { referans_aktif, referans_puan_davet, referans_puan_davetli } = req.body;
      await pool.query(
        `UPDATE isletmeler SET referans_aktif=$1, referans_puan_davet=$2, referans_puan_davetli=$3 WHERE id=$4`,
        [!!referans_aktif, referans_puan_davet || 200, referans_puan_davetli || 100, isletmeId]
      );
      res.json({ mesaj: 'Referans ayarları güncellendi' });
    } catch (error) { res.status(500).json({ hata: error.message }); }
  }

  async referansRaporu(req, res) {
    try {
      const isletmeId = req.kullanici.isletme_id;
      const topDavetci = (await pool.query(`
        SELECT m.id, m.isim, m.telefon, m.referans_kodu,
          (SELECT COUNT(*) FROM referans_log rl WHERE rl.davet_eden_id = m.id AND rl.isletme_id = $1 AND rl.durum = 'tamamlandi') as basarili,
          (SELECT COUNT(*) FROM referans_log rl WHERE rl.davet_eden_id = m.id AND rl.isletme_id = $1) as toplam
        FROM musteriler m WHERE m.isletme_id=$1 AND m.referans_kodu IS NOT NULL
        ORDER BY basarili DESC
      `, [isletmeId])).rows;

      const loglar = (await pool.query(`
        SELECT rl.*, md.isim as davet_eden_isim, mv.isim as davetli_isim
        FROM referans_log rl
        LEFT JOIN musteriler md ON rl.davet_eden_id = md.id
        LEFT JOIN musteriler mv ON rl.davetli_id = mv.id
        WHERE rl.isletme_id=$1 ORDER BY rl.tarih DESC LIMIT 100
      `, [isletmeId])).rows;

      const stat = (await pool.query(`
        SELECT COUNT(*) as toplam, COUNT(*) FILTER (WHERE durum = 'tamamlandi') as basarili
        FROM referans_log WHERE isletme_id = $1
      `, [isletmeId])).rows[0];

      res.json({
        davetciler: topDavetci,
        loglar,
        istatistik: { toplam: parseInt(stat.toplam), basarili: parseInt(stat.basarili) }
      });
    } catch (error) { res.status(500).json({ hata: error.message }); }
  }

  // ==================== SADAKAT PUAN SİSTEMİ ====================

  async sadakatAyarlariGetir(req, res) {
    try {
      const isletmeId = req.kullanici.isletme_id;
      const isletme = (await pool.query(
        'SELECT sadakat_aktif, puan_oran_tl, puan_oran_puan, odul_esik, odul_hizmet_id FROM isletmeler WHERE id=$1',
        [isletmeId]
      )).rows[0];
      const hizmetler = (await pool.query('SELECT id, isim FROM hizmetler WHERE isletme_id=$1 AND aktif=true', [isletmeId])).rows;
      res.json({ ayarlar: isletme || {}, hizmetler });
    } catch (error) { res.status(500).json({ hata: error.message }); }
  }

  async sadakatAyarlariGuncelle(req, res) {
    try {
      const isletmeId = req.kullanici.isletme_id;
      const { sadakat_aktif, puan_oran_tl, puan_oran_puan, odul_esik, odul_hizmet_id } = req.body;
      await pool.query(
        `UPDATE isletmeler SET sadakat_aktif=$1, puan_oran_tl=$2, puan_oran_puan=$3, odul_esik=$4, odul_hizmet_id=$5 WHERE id=$6`,
        [!!sadakat_aktif, puan_oran_tl || 1, puan_oran_puan || 1, odul_esik || 1000, odul_hizmet_id || null, isletmeId]
      );
      res.json({ mesaj: 'Sadakat ayarları güncellendi' });
    } catch (error) { res.status(500).json({ hata: error.message }); }
  }

  async puanRaporu(req, res) {
    try {
      const isletmeId = req.kullanici.isletme_id;
      const result = await pool.query(`
        SELECT m.id, m.isim, m.telefon, m.puan_bakiye, m.toplam_kazanilan_puan, m.toplam_harcanan_puan
        FROM musteriler m WHERE m.isletme_id=$1 AND m.toplam_kazanilan_puan > 0
        ORDER BY m.puan_bakiye DESC
      `, [isletmeId]);
      const toplam = (await pool.query(
        `SELECT SUM(CASE WHEN tip='kazanc' THEN puan ELSE 0 END) as kazanilan, SUM(CASE WHEN tip='harcama' THEN ABS(puan) ELSE 0 END) as harcanan FROM puan_hareketleri WHERE isletme_id=$1`,
        [isletmeId]
      )).rows[0];
      res.json({ musteriler: result.rows, istatistik: { kazanilan: parseInt(toplam?.kazanilan || 0), harcanan: parseInt(toplam?.harcanan || 0) } });
    } catch (error) { res.status(500).json({ hata: error.message }); }
  }

  async puanKullan(req, res) {
    try {
      const isletmeId = req.kullanici.isletme_id;
      const { musteri_id, puan, aciklama } = req.body;
      if (!musteri_id || !puan) return res.status(400).json({ hata: 'Müşteri ve puan gerekli' });
      const sadakatPuan = require('../services/sadakatPuan');
      const sonuc = await sadakatPuan.puanHarca(isletmeId, musteri_id, puan, aciklama);
      if (sonuc.hata) return res.status(400).json({ hata: sonuc.hata });
      res.json({ mesaj: 'Puan kullanıldı' });
    } catch (error) { res.status(500).json({ hata: error.message }); }
  }

  async puanGecmisi(req, res) {
    try {
      const isletmeId = req.kullanici.isletme_id;
      const { musteri_id } = req.query;
      const where = musteri_id ? 'AND ph.musteri_id = $2' : '';
      const params = musteri_id ? [isletmeId, musteri_id] : [isletmeId];
      const result = await pool.query(`
        SELECT ph.*, m.isim as musteri_isim FROM puan_hareketleri ph
        LEFT JOIN musteriler m ON ph.musteri_id = m.id
        WHERE ph.isletme_id=$1 ${where} ORDER BY ph.tarih DESC LIMIT 100
      `, params);
      res.json({ hareketler: result.rows });
    } catch (error) { res.status(500).json({ hata: error.message }); }
  }

  // ==================== KAYIP MÜŞTERİ KURTARMA ====================

  async winbackAyarlariGetir(req, res) {
    try {
      const isletmeId = req.kullanici.isletme_id;
      const isletme = (await pool.query(
        'SELECT winback_aktif, winback_gun_esik, winback_indirim, winback_mesaj_sablonu FROM isletmeler WHERE id=$1',
        [isletmeId]
      )).rows[0];
      res.json({ ayarlar: isletme || {} });
    } catch (error) { res.status(500).json({ hata: error.message }); }
  }

  async winbackAyarlariGuncelle(req, res) {
    try {
      const isletmeId = req.kullanici.isletme_id;
      const { winback_aktif, winback_gun_esik, winback_indirim, winback_mesaj_sablonu } = req.body;
      await pool.query(
        `UPDATE isletmeler SET winback_aktif=$1, winback_gun_esik=$2, winback_indirim=$3, winback_mesaj_sablonu=$4 WHERE id=$5`,
        [!!winback_aktif, winback_gun_esik || 45, winback_indirim || 10, winback_mesaj_sablonu || null, isletmeId]
      );
      res.json({ mesaj: 'Win-back ayarları güncellendi' });
    } catch (error) { res.status(500).json({ hata: error.message }); }
  }

  async kayipMusteriler(req, res) {
    try {
      const isletmeId = req.kullanici.isletme_id;
      const { gun = 30 } = req.query;
      const result = await pool.query(`
        SELECT m.id, m.isim, m.telefon, MAX(r.tarih) as son_tarih,
          CURRENT_DATE - MAX(r.tarih)::date as gun_sayisi,
          COUNT(r.id) as toplam_randevu,
          (SELECT MAX(wl.gonderim_tarihi) FROM winback_log wl WHERE wl.musteri_id = m.id AND wl.isletme_id = $1) as son_mesaj
        FROM musteriler m
        JOIN randevular r ON r.musteri_id = m.id AND r.isletme_id = $1 AND r.durum = 'tamamlandi'
        WHERE m.isletme_id = $1
        GROUP BY m.id, m.isim, m.telefon
        HAVING CURRENT_DATE - MAX(r.tarih)::date >= $2
        ORDER BY gun_sayisi DESC
      `, [isletmeId, parseInt(gun)]);
      res.json({ musteriler: result.rows });
    } catch (error) { res.status(500).json({ hata: error.message }); }
  }

  async winbackManuelGonder(req, res) {
    try {
      const isletmeId = req.kullanici.isletme_id;
      const { musteri_id } = req.body;
      if (!musteri_id) return res.status(400).json({ hata: 'Müşteri ID gerekli' });

      const musteri = (await pool.query(`
        SELECT m.id, m.isim, m.telefon, MAX(r.tarih) as son_tarih,
          CURRENT_DATE - MAX(r.tarih)::date as gun_sayisi
        FROM musteriler m
        JOIN randevular r ON r.musteri_id = m.id AND r.isletme_id = $1 AND r.durum = 'tamamlandi'
        WHERE m.id = $2 AND m.isletme_id = $1
        GROUP BY m.id, m.isim, m.telefon
      `, [isletmeId, musteri_id])).rows[0];

      if (!musteri) return res.status(404).json({ hata: 'Müşteri bulunamadı' });

      const isletme = (await pool.query(
        'SELECT isim, winback_indirim, winback_mesaj_sablonu, telegram_token FROM isletmeler WHERE id=$1',
        [isletmeId]
      )).rows[0];

      const winback = require('../services/winback');
      await winback.mesajGonder({ id: isletmeId, ...isletme }, musteri);
      res.json({ mesaj: 'Win-back mesajı gönderildi' });
    } catch (error) { res.status(500).json({ hata: error.message }); }
  }

  async winbackLog(req, res) {
    try {
      const isletmeId = req.kullanici.isletme_id;
      const result = await pool.query(`
        SELECT wl.*, m.isim as musteri_isim FROM winback_log wl
        LEFT JOIN musteriler m ON wl.musteri_id = m.id
        WHERE wl.isletme_id=$1 ORDER BY wl.gonderim_tarihi DESC LIMIT 100
      `, [isletmeId]);
      const kurtarilan = (await pool.query(
        'SELECT COUNT(*) as sayi FROM winback_log WHERE isletme_id=$1 AND kurtarildi=true',
        [isletmeId]
      )).rows[0];
      res.json({ loglar: result.rows, kurtarilan_sayisi: parseInt(kurtarilan.sayi) });
    } catch (error) { res.status(500).json({ hata: error.message }); }
  }

  // ==================== YORUM AVCISI ====================

  async yorumAyarlariGetir(req, res) {
    try {
      const isletmeId = req.kullanici.isletme_id;
      const isletme = (await pool.query(
        'SELECT yorum_avcisi_aktif, google_maps_link, yorum_gecikme_dk, yorum_mesaj_sablonu FROM isletmeler WHERE id=$1',
        [isletmeId]
      )).rows[0];
      res.json({ ayarlar: isletme || {} });
    } catch (error) { res.status(500).json({ hata: error.message }); }
  }

  async yorumAyarlariGuncelle(req, res) {
    try {
      const isletmeId = req.kullanici.isletme_id;
      const { yorum_avcisi_aktif, google_maps_link, yorum_gecikme_dk, yorum_mesaj_sablonu } = req.body;
      await pool.query(
        `UPDATE isletmeler SET yorum_avcisi_aktif=$1, google_maps_link=$2, yorum_gecikme_dk=$3, yorum_mesaj_sablonu=$4 WHERE id=$5`,
        [!!yorum_avcisi_aktif, google_maps_link || null, yorum_gecikme_dk || 60, yorum_mesaj_sablonu || null, isletmeId]
      );
      res.json({ mesaj: 'Yorum avcısı ayarları güncellendi' });
    } catch (error) { res.status(500).json({ hata: error.message }); }
  }

  async yorumLogGetir(req, res) {
    try {
      const isletmeId = req.kullanici.isletme_id;
      const result = await pool.query(`
        SELECT yt.*, m.isim as musteri_isim FROM yorum_talepleri yt
        LEFT JOIN musteriler m ON yt.musteri_id = m.id
        WHERE yt.isletme_id=$1 ORDER BY yt.olusturma_tarihi DESC LIMIT 100
      `, [isletmeId]);
      res.json({ talepler: result.rows });
    } catch (error) { res.status(500).json({ hata: error.message }); }
  }

  async yorumIstatistik(req, res) {
    try {
      const isletmeId = req.kullanici.isletme_id;
      const buAy = new Date().toISOString().slice(0, 7);
      const stat = (await pool.query(`
        SELECT
          COUNT(*) as toplam,
          COUNT(*) FILTER (WHERE durum = 'gonderildi') as gonderilen,
          COUNT(*) FILTER (WHERE durum = 'bekliyor') as bekleyen
        FROM yorum_talepleri WHERE isletme_id=$1 AND TO_CHAR(olusturma_tarihi, 'YYYY-MM') = $2
      `, [isletmeId, buAy])).rows[0];
      res.json({
        toplam: parseInt(stat.toplam),
        gonderilen: parseInt(stat.gonderilen),
        bekleyen: parseInt(stat.bekleyen)
      });
    } catch (error) { res.status(500).json({ hata: error.message }); }
  }

  // ==================== GECE RAPORU ====================

  async geceRaporuAyarlari(req, res) {
    try {
      const isletmeId = req.kullanici.isletme_id;
      const isletme = (await pool.query(
        'SELECT gece_raporu_aktif, gece_raporu_saat, gece_raporu_kanal, gece_raporu_telefon FROM isletmeler WHERE id=$1',
        [isletmeId]
      )).rows[0];
      res.json({ ayarlar: isletme || {} });
    } catch (error) { res.status(500).json({ hata: error.message }); }
  }

  async geceRaporuGuncelle(req, res) {
    try {
      const isletmeId = req.kullanici.isletme_id;
      const { gece_raporu_aktif, gece_raporu_saat, gece_raporu_kanal, gece_raporu_telefon } = req.body;
      await pool.query(
        `UPDATE isletmeler SET gece_raporu_aktif=$1, gece_raporu_saat=$2, gece_raporu_kanal=$3, gece_raporu_telefon=$4 WHERE id=$5`,
        [!!gece_raporu_aktif, gece_raporu_saat || '22:00', gece_raporu_kanal || 'whatsapp', gece_raporu_telefon || null, isletmeId]
      );
      res.json({ mesaj: 'Gece raporu ayarları güncellendi' });
    } catch (error) { res.status(500).json({ hata: error.message }); }
  }

  async geceRaporuLog(req, res) {
    try {
      const isletmeId = req.kullanici.isletme_id;
      const result = await pool.query(
        'SELECT * FROM gece_rapor_log WHERE isletme_id=$1 ORDER BY gonderim_tarihi DESC LIMIT 30',
        [isletmeId]
      );
      res.json({ loglar: result.rows });
    } catch (error) { res.status(500).json({ hata: error.message }); }
  }

  async geceRaporuOnizle(req, res) {
    try {
      const isletmeId = req.kullanici.isletme_id;
      const geceRaporu = require('../services/geceRaporu');
      const mesaj = await geceRaporu.raporOlustur(isletmeId);
      res.json({ rapor: mesaj });
    } catch (error) { res.status(500).json({ hata: error.message }); }
  }

  // ==================== SMS (NetGSM) ====================

  async smsAyarlariGetir(req, res) {
    try {
      const isletmeId = req.kullanici.isletme_id;
      const isletme = (await pool.query(
        'SELECT sms_aktif, netgsm_kullanici_adi, netgsm_sifre, netgsm_baslik, sms_hatirlatma_dk, sms_onay_aktif FROM isletmeler WHERE id=$1',
        [isletmeId]
      )).rows[0];
      res.json({ ayarlar: isletme || {} });
    } catch (error) { res.status(500).json({ hata: error.message }); }
  }

  async smsAyarlariGuncelle(req, res) {
    try {
      const isletmeId = req.kullanici.isletme_id;
      const { sms_aktif, netgsm_kullanici_adi, netgsm_sifre, netgsm_baslik, sms_hatirlatma_dk, sms_onay_aktif } = req.body;
      await pool.query(
        `UPDATE isletmeler SET sms_aktif=$1, netgsm_kullanici_adi=$2, netgsm_sifre=$3, netgsm_baslik=$4, sms_hatirlatma_dk=$5, sms_onay_aktif=$6 WHERE id=$7`,
        [!!sms_aktif, netgsm_kullanici_adi || null, netgsm_sifre || null, netgsm_baslik || null, sms_hatirlatma_dk || 60, !!sms_onay_aktif, isletmeId]
      );
      res.json({ mesaj: 'SMS ayarları güncellendi' });
    } catch (error) { res.status(500).json({ hata: error.message }); }
  }

  async smsLogGetir(req, res) {
    try {
      const isletmeId = req.kullanici.isletme_id;
      const result = await pool.query(
        'SELECT * FROM sms_log WHERE isletme_id=$1 ORDER BY tarih DESC LIMIT 100',
        [isletmeId]
      );
      res.json({ loglar: result.rows });
    } catch (error) { res.status(500).json({ hata: error.message }); }
  }

  async smsTestGonder(req, res) {
    try {
      const isletmeId = req.kullanici.isletme_id;
      const { telefon } = req.body;
      if (!telefon) return res.status(400).json({ hata: 'Telefon gerekli' });
      const netgsm = require('../services/netgsm');
      const sonuc = await netgsm.smsGonder(isletmeId, telefon, 'SıraGO test mesajı. SMS entegrasyonunuz aktif!', 'test');
      res.json(sonuc);
    } catch (error) { res.status(500).json({ hata: error.message }); }
  }

  async smsBakiye(req, res) {
    try {
      const isletmeId = req.kullanici.isletme_id;
      const netgsm = require('../services/netgsm');
      const sonuc = await netgsm.bakiyeSorgula(isletmeId);
      res.json(sonuc);
    } catch (error) { res.status(500).json({ hata: error.message }); }
  }

  // ==================== PRİM HESAPLAMA ====================

  async primRaporu(req, res) {
    try {
      const isletmeId = req.kullanici.isletme_id;
      const { donem } = req.query; // YYYY-MM
      const ayDonem = donem || new Date().toISOString().slice(0, 7);
      const [yil, ay] = ayDonem.split('-').map(Number);
      const baslangic = `${ayDonem}-01`;
      const bitis = new Date(yil, ay, 0).toISOString().slice(0, 10); // ayın son günü

      const result = await pool.query(`
        SELECT c.id, c.isim, c.prim_yuzdesi,
          COUNT(r.id) as toplam_randevu,
          COALESCE(SUM(h.fiyat), 0) as toplam_ciro
        FROM calisanlar c
        LEFT JOIN randevular r ON r.calisan_id = c.id AND r.isletme_id = $1 
          AND r.durum = 'tamamlandi' AND r.tarih BETWEEN $2 AND $3
        LEFT JOIN hizmetler h ON r.hizmet_id = h.id
        WHERE c.isletme_id = $1 AND (c.aktif IS NULL OR c.aktif = true)
        GROUP BY c.id, c.isim, c.prim_yuzdesi
        ORDER BY toplam_ciro DESC
      `, [isletmeId, baslangic, bitis]);

      // Mevcut prim ödemeleri
      const odemeler = (await pool.query(
        'SELECT * FROM prim_odemeleri WHERE isletme_id=$1 AND donem=$2',
        [isletmeId, ayDonem]
      )).rows;

      const rapor = result.rows.map(c => {
        const ciro = parseFloat(c.toplam_ciro);
        const oran = c.prim_yuzdesi || 10;
        const primTutar = Math.round(ciro * oran / 100);
        const odeme = odemeler.find(o => o.calisan_id === c.id);
        return {
          calisan_id: c.id,
          isim: c.isim,
          prim_yuzdesi: oran,
          toplam_randevu: parseInt(c.toplam_randevu),
          toplam_ciro: ciro,
          prim_tutari: primTutar,
          durum: odeme?.durum || 'bekliyor',
          odeme_id: odeme?.id || null
        };
      });

      const toplamPrim = rapor.reduce((t, r) => t + r.prim_tutari, 0);
      const bekleyenPrim = rapor.filter(r => r.durum === 'bekliyor').reduce((t, r) => t + r.prim_tutari, 0);

      res.json({ rapor, donem: ayDonem, toplamPrim, bekleyenPrim });
    } catch (error) {
      res.status(500).json({ hata: error.message });
    }
  }

  async primOde(req, res) {
    try {
      const isletmeId = req.kullanici.isletme_id;
      const { calisan_id, donem, toplam_ciro, prim_yuzdesi, prim_tutari } = req.body;
      if (!calisan_id || !donem) return res.status(400).json({ hata: 'Eksik bilgi' });

      // Mevcut kayıt varsa güncelle yoksa oluştur
      const mevcut = (await pool.query(
        'SELECT id FROM prim_odemeleri WHERE isletme_id=$1 AND calisan_id=$2 AND donem=$3',
        [isletmeId, calisan_id, donem]
      )).rows[0];

      if (mevcut) {
        await pool.query(
          "UPDATE prim_odemeleri SET durum='odendi', odeme_tarihi=NOW(), toplam_ciro=$1, prim_yuzdesi=$2, prim_tutari=$3 WHERE id=$4",
          [toplam_ciro, prim_yuzdesi, prim_tutari, mevcut.id]
        );
      } else {
        await pool.query(
          `INSERT INTO prim_odemeleri (isletme_id, calisan_id, donem, toplam_ciro, prim_yuzdesi, prim_tutari, durum, odeme_tarihi)
           VALUES ($1, $2, $3, $4, $5, $6, 'odendi', NOW())`,
          [isletmeId, calisan_id, donem, toplam_ciro, prim_yuzdesi, prim_tutari]
        );
      }

      res.json({ mesaj: 'Prim ödendi olarak işaretlendi' });
    } catch (error) {
      res.status(500).json({ hata: error.message });
    }
  }

  // ==================== KASA TAKİBİ ====================

  async kasaListesi(req, res) {
    try {
      const isletmeId = req.kullanici.isletme_id;
      const { baslangic, bitis, tip } = req.query;
      let query = 'SELECT * FROM kasa_hareketleri WHERE isletme_id=$1';
      const params = [isletmeId];
      let idx = 2;
      if (baslangic) { query += ` AND tarih >= $${idx}`; params.push(baslangic); idx++; }
      if (bitis) { query += ` AND tarih <= $${idx}`; params.push(bitis); idx++; }
      if (tip && (tip === 'gelir' || tip === 'gider')) { query += ` AND tip = $${idx}`; params.push(tip); idx++; }
      query += ' ORDER BY tarih DESC, olusturma_tarihi DESC';
      const result = await pool.query(query, params);
      res.json({ hareketler: result.rows });
    } catch (error) {
      res.status(500).json({ hata: error.message });
    }
  }

  async kasaEkle(req, res) {
    try {
      const isletmeId = req.kullanici.isletme_id;
      const { tip, tutar, aciklama, kategori, odeme_yontemi, tarih } = req.body;
      if (!tip || !tutar) return res.status(400).json({ hata: 'Tip ve tutar gerekli' });
      const result = await pool.query(
        `INSERT INTO kasa_hareketleri (isletme_id, tip, tutar, aciklama, kategori, odeme_yontemi, tarih, olusturan_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
        [isletmeId, tip, tutar, aciklama || '', kategori || 'diger', odeme_yontemi || 'nakit', tarih || new Date().toISOString().slice(0,10), req.kullanici.id]
      );
      res.json({ hareket: result.rows[0] });
    } catch (error) {
      res.status(500).json({ hata: error.message });
    }
  }

  async kasaSil(req, res) {
    try {
      const isletmeId = req.kullanici.isletme_id;
      await pool.query('DELETE FROM kasa_hareketleri WHERE id=$1 AND isletme_id=$2', [req.params.id, isletmeId]);
      res.json({ mesaj: 'Silindi' });
    } catch (error) {
      res.status(500).json({ hata: error.message });
    }
  }

  async kasaOzet(req, res) {
    try {
      const isletmeId = req.kullanici.isletme_id;
      const bugun = new Date().toISOString().slice(0, 10);
      // Bugün
      const bugunOzet = (await pool.query(`
        SELECT
          COALESCE(SUM(CASE WHEN tip='gelir' THEN tutar ELSE 0 END), 0) as gunluk_gelir,
          COALESCE(SUM(CASE WHEN tip='gider' THEN tutar ELSE 0 END), 0) as gunluk_gider
        FROM kasa_hareketleri WHERE isletme_id=$1 AND tarih=$2
      `, [isletmeId, bugun])).rows[0];
      // Bu hafta (Pazartesi'den bugüne)
      const haftaOzet = (await pool.query(`
        SELECT
          COALESCE(SUM(CASE WHEN tip='gelir' THEN tutar ELSE 0 END), 0) as haftalik_gelir,
          COALESCE(SUM(CASE WHEN tip='gider' THEN tutar ELSE 0 END), 0) as haftalik_gider
        FROM kasa_hareketleri WHERE isletme_id=$1 AND tarih >= date_trunc('week', CURRENT_DATE)
      `, [isletmeId])).rows[0];
      // Bu ay
      const ayOzet = (await pool.query(`
        SELECT
          COALESCE(SUM(CASE WHEN tip='gelir' THEN tutar ELSE 0 END), 0) as aylik_gelir,
          COALESCE(SUM(CASE WHEN tip='gider' THEN tutar ELSE 0 END), 0) as aylik_gider
        FROM kasa_hareketleri WHERE isletme_id=$1 AND tarih >= date_trunc('month', CURRENT_DATE)
      `, [isletmeId])).rows[0];
      // Son 7 gün günlük dağılım (grafik için)
      const gunlukGrafik = (await pool.query(`
        SELECT tarih, tip, SUM(tutar) as toplam
        FROM kasa_hareketleri WHERE isletme_id=$1 AND tarih >= CURRENT_DATE - INTERVAL '6 days'
        GROUP BY tarih, tip ORDER BY tarih
      `, [isletmeId])).rows;

      res.json({
        bugun: { gelir: parseFloat(bugunOzet.gunluk_gelir), gider: parseFloat(bugunOzet.gunluk_gider) },
        hafta: { gelir: parseFloat(haftaOzet.haftalik_gelir), gider: parseFloat(haftaOzet.haftalik_gider) },
        ay: { gelir: parseFloat(ayOzet.aylik_gelir), gider: parseFloat(ayOzet.aylik_gider) },
        gunlukGrafik
      });
    } catch (error) {
      res.status(500).json({ hata: error.message });
    }
  }
  // ==================== API DASHBOARD ====================

  async apiDashboard(req, res) {
    try {
      // Tablo sayıları (whitelist — sadece bilinen tablo adları)
      const SAFE_TABLOLAR = new Set(['isletmeler', 'randevular', 'musteriler', 'hizmetler', 'calisanlar', 'odemeler', 'sohbet_gecmisi', 'destek_talepleri']);
      const tabloSayilari = {};
      for (const tablo of SAFE_TABLOLAR) {
        try {
          const r = await pool.query(`SELECT COUNT(*) as c FROM "${tablo}"`);
          tabloSayilari[tablo] = parseInt(r.rows[0].c) || 0;
        } catch (e) { tabloSayilari[tablo] = 0; }
      }

      // DB boyutu
      let dbBoyut = '?';
      try {
        const dbResult = await pool.query("SELECT pg_size_pretty(pg_database_size(current_database())) as boyut");
        dbBoyut = dbResult.rows[0].boyut;
      } catch(e) {}

      // Aktif bağlantı sayısı
      let aktiveBaglanti = 0;
      try {
        const bagResult = await pool.query("SELECT count(*) as c FROM pg_stat_activity WHERE state = 'active'");
        aktiveBaglanti = parseInt(bagResult.rows[0].c) || 0;
      } catch(e) {}

      // Son 24 saat randevu / ödeme aktivitesi
      let son24SaatRandevu = 0, son24SaatOdeme = 0;
      try {
        son24SaatRandevu = parseInt((await pool.query("SELECT COUNT(*) as c FROM randevular WHERE olusturma_tarihi >= NOW() - INTERVAL '24 hours'")).rows[0].c) || 0;
      } catch(e) {}
      try {
        son24SaatOdeme = parseInt((await pool.query("SELECT COUNT(*) as c FROM odemeler WHERE olusturma_tarihi >= NOW() - INTERVAL '24 hours'")).rows[0].c) || 0;
      } catch(e) {}

      // Son 7 gün günlük randevu trendi
      const gunlukTrend = [];
      for (let i = 6; i >= 0; i--) {
        try {
          const r = await pool.query(`SELECT COUNT(*) as c FROM randevular WHERE tarih = CURRENT_DATE - $1`, [i]);
          const gun = new Date(); gun.setDate(gun.getDate() - i);
          gunlukTrend.push({ gun: gun.toLocaleDateString("tr-TR", { weekday: "short" }), sayi: parseInt(r.rows[0].c) || 0 });
        } catch(e) { gunlukTrend.push({ gun: "?", sayi: 0 }); }
      }

      // WhatsApp bot durumları
      let botDurumlari = [];
      try {
        const botResult = await pool.query("SELECT isletme_id, durum, son_aktivite FROM bot_durum ORDER BY son_aktivite DESC LIMIT 20");
        botDurumlari = botResult.rows;
      } catch(e) {}

      // Uptime (process)
      const uptime = process.uptime();
      const uptimeStr = `${Math.floor(uptime / 86400)}g ${Math.floor((uptime % 86400) / 3600)}s ${Math.floor((uptime % 3600) / 60)}dk`;

      // Memory usage
      const mem = process.memoryUsage();
      const memMB = {
        rss: Math.round(mem.rss / 1048576),
        heapTotal: Math.round(mem.heapTotal / 1048576),
        heapUsed: Math.round(mem.heapUsed / 1048576),
      };

      res.json({
        tabloSayilari,
        dbBoyut,
        aktiveBaglanti,
        son24Saat: { randevu: son24SaatRandevu, odeme: son24SaatOdeme },
        gunlukTrend,
        botDurumlari,
        uptime: uptimeStr,
        memory: memMB,
        nodeVersion: process.version,
        platform: process.platform,
      });
    } catch (error) {
      res.status(500).json({ hata: error.message });
    }
  }

  // ==================== İŞLETME KARŞILAŞTIRMA RAPORU ====================

  async isletmeKarsilastirma(req, res) {
    try {
      const result = await pool.query(`
        SELECT i.id, i.isim, i.telefon, i.kategori, i.paket, i.olusturma_tarihi,
          COALESCE((SELECT SUM(o.tutar::numeric) FROM odemeler o WHERE o.isletme_id = i.id AND o.durum = 'odendi'), 0) as toplam_gelir,
          COALESCE((SELECT COUNT(*) FROM randevular r WHERE r.isletme_id = i.id), 0) as randevu_sayisi,
          COALESCE((SELECT COUNT(*) FROM randevular r WHERE r.isletme_id = i.id AND r.tarih >= CURRENT_DATE - INTERVAL '30 days'), 0) as aylik_randevu,
          COALESCE((SELECT COUNT(*) FROM musteriler m WHERE m.isletme_id = i.id), 0) as musteri_sayisi,
          COALESCE((SELECT COUNT(*) FROM hizmetler h WHERE h.isletme_id = i.id), 0) as hizmet_sayisi,
          COALESCE((SELECT COUNT(*) FROM calisanlar c WHERE c.isletme_id = i.id), 0) as calisan_sayisi,
          (SELECT MAX(r.tarih) FROM randevular r WHERE r.isletme_id = i.id) as son_randevu,
          COALESCE((SELECT AVG(CASE WHEN r.durum = 'tamamlandi' THEN 1.0 ELSE 0.0 END) FROM randevular r WHERE r.isletme_id = i.id), 0) as tamamlanma_orani
        FROM isletmeler i
        WHERE i.aktif = true
        ORDER BY 7 DESC
      `);

      let botBagliIds = [];
      try {
        const waResult = await pool.query("SELECT DISTINCT isletme_id FROM wa_auth_keys WHERE isletme_id != 999999");
        botBagliIds = waResult.rows.map(r => r.isletme_id);
      } catch(e) {}

      const isletmeler = result.rows.map(i => ({
        ...i,
        toplam_gelir: parseFloat(i.toplam_gelir) || 0,
        randevu_sayisi: parseInt(i.randevu_sayisi) || 0,
        aylik_randevu: parseInt(i.aylik_randevu) || 0,
        musteri_sayisi: parseInt(i.musteri_sayisi) || 0,
        hizmet_sayisi: parseInt(i.hizmet_sayisi) || 0,
        calisan_sayisi: parseInt(i.calisan_sayisi) || 0,
        tamamlanma_orani: Math.round((parseFloat(i.tamamlanma_orani) || 0) * 100),
        bot_bagli: botBagliIds.includes(i.id),
        kayit_gun: Math.floor((new Date() - new Date(i.olusturma_tarihi)) / 86400000)
      }));

      // Ortalamalar
      const ort = {
        gelir: isletmeler.length > 0 ? Math.round(isletmeler.reduce((s, i) => s + i.toplam_gelir, 0) / isletmeler.length) : 0,
        randevu: isletmeler.length > 0 ? Math.round(isletmeler.reduce((s, i) => s + i.randevu_sayisi, 0) / isletmeler.length) : 0,
        aylikRandevu: isletmeler.length > 0 ? Math.round(isletmeler.reduce((s, i) => s + i.aylik_randevu, 0) / isletmeler.length) : 0,
        musteri: isletmeler.length > 0 ? Math.round(isletmeler.reduce((s, i) => s + i.musteri_sayisi, 0) / isletmeler.length) : 0,
        tamamlanma: isletmeler.length > 0 ? Math.round(isletmeler.reduce((s, i) => s + i.tamamlanma_orani, 0) / isletmeler.length) : 0,
      };

      // Kategori bazında ortalamalar
      const kategoriler = {};
      isletmeler.forEach(i => {
        if (!kategoriler[i.kategori]) kategoriler[i.kategori] = { sayi: 0, gelir: 0, randevu: 0, musteri: 0 };
        kategoriler[i.kategori].sayi++;
        kategoriler[i.kategori].gelir += i.toplam_gelir;
        kategoriler[i.kategori].randevu += i.randevu_sayisi;
        kategoriler[i.kategori].musteri += i.musteri_sayisi;
      });

      res.json({ isletmeler, ortalamalar: ort, kategoriler, toplam: isletmeler.length });
    } catch (error) {
      res.status(500).json({ hata: error.message });
    }
  }

  // ==================== MÜŞTERİ SEGMENTASYONU ====================

  async musteriSegmentasyon(req, res) {
    try {
      const result = await pool.query(`
        SELECT i.id, i.isim, i.telefon, i.kategori, i.paket, i.aktif, i.olusturma_tarihi,
          COALESCE((SELECT SUM(o.tutar::numeric) FROM odemeler o WHERE o.isletme_id = i.id AND o.durum = 'odendi'), 0) as toplam_gelir,
          COALESCE((SELECT COUNT(*) FROM odemeler o WHERE o.isletme_id = i.id AND o.durum = 'odendi'), 0) as odeme_sayisi,
          COALESCE((SELECT COUNT(*) FROM randevular r WHERE r.isletme_id = i.id), 0) as randevu_sayisi,
          COALESCE((SELECT COUNT(*) FROM musteriler m WHERE m.isletme_id = i.id), 0) as musteri_sayisi,
          (SELECT MAX(r.tarih) FROM randevular r WHERE r.isletme_id = i.id) as son_randevu
        FROM isletmeler i
        WHERE i.aktif = true
        ORDER BY 8 DESC
      `);

      let botBagliIds = [];
      try {
        const waResult = await pool.query("SELECT DISTINCT isletme_id FROM wa_auth_keys WHERE isletme_id != 999999");
        botBagliIds = waResult.rows.map(r => r.isletme_id);
      } catch(e) {}

      const simdi = new Date();
      const segmentler = { vip: [], aktif: [], risk: [], uyuyan: [], yeni: [] };

      const isletmeler = result.rows.map(i => {
        const toplam = parseFloat(i.toplam_gelir) || 0;
        const randevu = parseInt(i.randevu_sayisi) || 0;
        const sonRandevu = i.son_randevu ? new Date(i.son_randevu) : null;
        const gunFarki = sonRandevu ? Math.floor((simdi - sonRandevu) / 86400000) : 999;
        const kayitGun = Math.floor((simdi - new Date(i.olusturma_tarihi)) / 86400000);
        const botBagli = botBagliIds.includes(i.id);

        let segment = 'uyuyan';
        if (kayitGun <= 14) segment = 'yeni';
        else if ((toplam >= 500 && randevu >= 30) || (toplam >= 1000 && randevu >= 10)) segment = 'vip';
        else if (randevu >= 5 && gunFarki <= 30) segment = 'aktif';
        else if (randevu > 0 && gunFarki > 30 && gunFarki <= 60) segment = 'risk';
        else if (gunFarki > 60 || (randevu === 0 && kayitGun > 14)) segment = 'uyuyan';

        const obj = { ...i, toplam_gelir: toplam, segment, gun_farki: gunFarki, kayit_gun: kayitGun, bot_bagli: botBagli };
        segmentler[segment].push(obj);
        return obj;
      });

      const segmentOzet = {
        vip: { sayi: segmentler.vip.length, gelir: segmentler.vip.reduce((s, i) => s + i.toplam_gelir, 0) },
        aktif: { sayi: segmentler.aktif.length, gelir: segmentler.aktif.reduce((s, i) => s + i.toplam_gelir, 0) },
        risk: { sayi: segmentler.risk.length, gelir: segmentler.risk.reduce((s, i) => s + i.toplam_gelir, 0) },
        uyuyan: { sayi: segmentler.uyuyan.length, gelir: segmentler.uyuyan.reduce((s, i) => s + i.toplam_gelir, 0) },
        yeni: { sayi: segmentler.yeni.length, gelir: segmentler.yeni.reduce((s, i) => s + i.toplam_gelir, 0) },
      };

      res.json({ isletmeler, segmentler: segmentOzet, toplam: isletmeler.length });
    } catch (error) {
      res.status(500).json({ hata: error.message });
    }
  }

  // ==================== İŞLETME ONBOARDING ====================

  async onboardingDurum(req, res) {
    try {
      const result = await pool.query(`
        SELECT i.id, i.isim, i.telefon, i.kategori, i.paket, i.aktif, i.olusturma_tarihi,
          i.onboarding_tamamlandi, i.onboarding_profil, i.onboarding_hizmet, 
          i.onboarding_calisan, i.onboarding_bot, i.onboarding_randevu,
          (SELECT COUNT(*) FROM hizmetler h WHERE h.isletme_id = i.id) as hizmet_sayisi,
          (SELECT COUNT(*) FROM calisanlar c WHERE c.isletme_id = i.id) as calisan_sayisi,
          (SELECT COUNT(*) FROM randevular r WHERE r.isletme_id = i.id) as randevu_sayisi
        FROM isletmeler i
        WHERE i.aktif = true
        ORDER BY i.olusturma_tarihi DESC
      `);

      let botBagliIds = [];
      try {
        const waResult = await pool.query("SELECT DISTINCT isletme_id FROM wa_auth_keys WHERE isletme_id != 999999");
        botBagliIds = waResult.rows.map(r => r.isletme_id);
      } catch(e) {}

      const isletmeler = result.rows.map(i => {
        const hizmetVar = parseInt(i.hizmet_sayisi) > 0;
        const calisanVar = parseInt(i.calisan_sayisi) > 0;
        const botBagli = botBagliIds.includes(i.id);
        const randevuVar = parseInt(i.randevu_sayisi) > 0;
        const profilTamam = !!(i.telefon && i.kategori);

        const adimlar = [
          { anahtar: 'profil', isim: 'Profil Bilgileri', tamamlandi: profilTamam, aciklama: 'İşletme adı, telefon, kategori' },
          { anahtar: 'hizmet', isim: 'Hizmet Ekle', tamamlandi: hizmetVar, aciklama: 'En az 1 hizmet tanımlama' },
          { anahtar: 'calisan', isim: 'Çalışan Ekle', tamamlandi: calisanVar, aciklama: 'En az 1 çalışan tanımlama' },
          { anahtar: 'bot', isim: 'WhatsApp Bot Bağla', tamamlandi: botBagli, aciklama: 'QR kod ile bot bağlantısı' },
          { anahtar: 'randevu', isim: 'İlk Randevu', tamamlandi: randevuVar, aciklama: 'İlk müşteri randevusu' }
        ];

        const tamamlananAdim = adimlar.filter(a => a.tamamlandi).length;
        const toplamAdim = adimlar.length;
        const tamamYuzde = Math.round((tamamlananAdim / toplamAdim) * 100);

        return {
          ...i, adimlar, tamamlananAdim, toplamAdim, tamamYuzde,
          bot_bagli: botBagli, hizmet_var: hizmetVar, calisan_var: calisanVar, randevu_var: randevuVar
        };
      });

      const tamamlanan = isletmeler.filter(i => i.tamamYuzde === 100).length;
      const devamEden = isletmeler.filter(i => i.tamamYuzde > 0 && i.tamamYuzde < 100).length;
      const hicBaslamamis = isletmeler.filter(i => i.tamamYuzde === 0).length;
      const ortalamaYuzde = isletmeler.length > 0 ? Math.round(isletmeler.reduce((s, i) => s + i.tamamYuzde, 0) / isletmeler.length) : 0;

      res.json({
        isletmeler,
        istatistik: { tamamlanan, devamEden, hicBaslamamis, ortalamaYuzde, toplam: isletmeler.length }
      });
    } catch (error) {
      res.status(500).json({ hata: error.message });
    }
  }

  // ==================== SATIŞ BOT ŞABLONLARI ====================

  async satisSablonlariGetir(req, res) {
    try {
      const sablonlar = (await pool.query('SELECT * FROM satis_bot_sablonlar ORDER BY id')).rows;
      // En iyi performans: en yüksek dönüş oranı
      let enIyiId = null;
      let enIyiOran = -1;
      sablonlar.forEach(s => {
        const oran = s.gonderilen > 0 ? (s.cevap_gelen / s.gonderilen) * 100 : 0;
        if (s.gonderilen >= 5 && oran > enIyiOran) {
          enIyiOran = oran;
          enIyiId = s.id;
        }
      });
      res.json({ sablonlar, enIyiId });
    } catch (error) {
      res.status(500).json({ hata: error.message });
    }
  }

  async satisSablonEkle(req, res) {
    try {
      const { isim, mesaj, kategori, aktif, gonderim_modu } = req.body;
      if (!isim || !mesaj) return res.status(400).json({ hata: 'İsim ve mesaj zorunlu' });
      const result = await pool.query(
        'INSERT INTO satis_bot_sablonlar (isim, mesaj, kategori, aktif, gonderim_modu) VALUES ($1, $2, $3, $4, $5) RETURNING *',
        [isim, mesaj, kategori || 'genel', aktif !== false, gonderim_modu || 'rastgele']
      );
      res.json({ sablon: result.rows[0] });
    } catch (error) {
      res.status(500).json({ hata: error.message });
    }
  }

  async satisSablonGuncelle(req, res) {
    try {
      const { id } = req.params;
      const { isim, mesaj, kategori, aktif, gonderim_modu } = req.body;
      const result = await pool.query(
        'UPDATE satis_bot_sablonlar SET isim=$1, mesaj=$2, kategori=$3, aktif=$4, gonderim_modu=$5 WHERE id=$6 RETURNING *',
        [isim, mesaj, kategori || 'genel', aktif, gonderim_modu || 'rastgele', id]
      );
      res.json({ sablon: result.rows[0] });
    } catch (error) {
      res.status(500).json({ hata: error.message });
    }
  }

  async satisSablonSil(req, res) {
    try {
      await pool.query('DELETE FROM satis_bot_sablonlar WHERE id=$1', [req.params.id]);
      res.json({ mesaj: 'Silindi' });
    } catch (error) {
      res.status(500).json({ hata: error.message });
    }
  }

  async satisSablonPerformans(req, res) {
    try {
      const sablonlar = (await pool.query(`
        SELECT s.*, 
          CASE WHEN s.gonderilen > 0 THEN ROUND((s.cevap_gelen::numeric / s.gonderilen) * 100, 1) ELSE 0 END as donus_orani,
          CASE WHEN s.cevap_gelen > 0 THEN ROUND((s.olumlu::numeric / s.cevap_gelen) * 100, 1) ELSE 0 END as olumlu_orani
        FROM satis_bot_sablonlar s ORDER BY donus_orani DESC
      `)).rows;
      res.json({ sablonlar });
    } catch (error) {
      res.status(500).json({ hata: error.message });
    }
  }
  // ==================== MÜŞTERİ CRM ====================

  async musteriCRM(req, res) {
    try {
      const { isletme_id, arama, segment } = req.query;

      let sorgu = `
        SELECT m.id, m.isim, m.telefon, m.olusturma_tarihi,
          COALESCE(m.puan_bakiye, 0) as puan, m.referans_kodu,
          (SELECT r2.isletme_id FROM randevular r2 WHERE r2.musteri_id = m.id LIMIT 1) as isletme_id,
          i.isim as isletme_isim, i.kategori, i.paket,
          COALESCE((SELECT COUNT(*) FROM randevular r WHERE r.musteri_id = m.id), 0) as randevu_sayisi,
          COALESCE((SELECT COUNT(*) FROM randevular r WHERE r.musteri_id = m.id AND r.durum = 'tamamlandi'), 0) as tamamlanan_randevu,
          COALESCE((SELECT COUNT(*) FROM randevular r WHERE r.musteri_id = m.id AND r.durum = 'iptal'), 0) as iptal_randevu,
          (SELECT MAX(r.tarih) FROM randevular r WHERE r.musteri_id = m.id) as son_randevu_tarih,
          (SELECT MIN(r.tarih) FROM randevular r WHERE r.musteri_id = m.id) as ilk_randevu_tarih
        FROM musteriler m
        LEFT JOIN isletmeler i ON i.id = (SELECT r3.isletme_id FROM randevular r3 WHERE r3.musteri_id = m.id LIMIT 1)
      `;

      const params = [];
      const where = [];

      if (isletme_id) { params.push(parseInt(isletme_id)); where.push(`EXISTS (SELECT 1 FROM randevular r4 WHERE r4.musteri_id = m.id AND r4.isletme_id = $${params.length})`); }
      if (arama) { params.push(`%${arama}%`); where.push(`(m.isim ILIKE $${params.length} OR m.telefon ILIKE $${params.length})`); }

      if (where.length > 0) sorgu += ' WHERE ' + where.join(' AND ');
      sorgu += ' ORDER BY m.olusturma_tarihi DESC LIMIT 500';

      const result = await pool.query(sorgu, params);

      const simdi = new Date();
      const musteriler = result.rows.map(m => {
        const randevuSayisi = parseInt(m.randevu_sayisi) || 0;
        const tamamlanan = parseInt(m.tamamlanan_randevu) || 0;
        const iptal = parseInt(m.iptal_randevu) || 0;
        const sonRandevu = m.son_randevu_tarih ? new Date(m.son_randevu_tarih) : null;
        const gunFarki = sonRandevu ? Math.floor((simdi - sonRandevu) / 86400000) : 999;

        let seg = 'yeni';
        if (randevuSayisi >= 10 && gunFarki <= 30) seg = 'sadik';
        else if (randevuSayisi >= 3 && gunFarki <= 30) seg = 'aktif';
        else if (randevuSayisi > 0 && gunFarki > 30 && gunFarki <= 90) seg = 'risk';
        else if (randevuSayisi > 0 && gunFarki > 90) seg = 'kayip';
        else if (randevuSayisi === 0) seg = 'yeni';

        return { ...m, randevu_sayisi: randevuSayisi, tamamlanan_randevu: tamamlanan, iptal_randevu: iptal, gun_farki: gunFarki, segment: seg };
      });

      const filtrelenmis = segment && segment !== 'hepsi' ? musteriler.filter(m => m.segment === segment) : musteriler;

      const segmentSayilari = { sadik: 0, aktif: 0, risk: 0, kayip: 0, yeni: 0 };
      musteriler.forEach(m => { if (segmentSayilari[m.segment] !== undefined) segmentSayilari[m.segment]++; });

      res.json({
        musteriler: filtrelenmis,
        toplam: musteriler.length,
        segmentler: segmentSayilari
      });
    } catch (error) {
      res.status(500).json({ hata: error.message });
    }
  }

  async musteriDetay(req, res) {
    try {
      const { id } = req.params;
      const musteri = (await pool.query(`
        SELECT m.*, i.isim as isletme_isim, i.kategori, i.paket
        FROM musteriler m LEFT JOIN isletmeler i ON m.isletme_id = i.id
        WHERE m.id = $1
      `, [id])).rows[0];

      if (!musteri) return res.status(404).json({ hata: 'Müşteri bulunamadı' });

      const randevular = (await pool.query(`
        SELECT r.tarih, r.saat, r.durum, r.notlar, h.isim as hizmet, c.isim as calisan
        FROM randevular r
        LEFT JOIN hizmetler h ON r.hizmet_id = h.id
        LEFT JOIN calisanlar c ON r.calisan_id = c.id
        WHERE r.musteri_id = $1
        ORDER BY r.tarih DESC, r.saat DESC LIMIT 50
      `, [id])).rows;

      res.json({ musteri, randevular });
    } catch (error) {
      res.status(500).json({ hata: error.message });
    }
  }

  // ==================== QR KOD SİSTEMİ ====================

  async adminQrKodOlustur(req, res) {
    try {
      const { isletme_id, type = 'whatsapp' } = req.query;
      if (!isletme_id) return res.status(400).json({ hata: 'isletme_id gerekli' });

      const isletme = (await pool.query(
        'SELECT id, isim, telefon, slug FROM isletmeler WHERE id = $1', [isletme_id]
      )).rows[0];

      if (!isletme) return res.status(404).json({ hata: 'İşletme bulunamadı' });

      let slug = isletme.slug;
      if (!slug) {
        slug = isletme.isim
          .toLowerCase()
          .replace(/ğ/g, 'g').replace(/ü/g, 'u').replace(/ş/g, 's')
          .replace(/ı/g, 'i').replace(/ö/g, 'o').replace(/ç/g, 'c')
          .replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
        slug = slug + '-' + isletme_id;
        await pool.query('UPDATE isletmeler SET slug = $1 WHERE id = $2', [slug, isletme_id]);
      }

      let hedefUrl;
      if (type === 'booking') {
        hedefUrl = `https://sırago.com/book/${slug}`;
      } else {
        const telefon = (isletme.telefon || '').replace(/\D/g, '');
        const uluslararasi = telefon.startsWith('90') ? telefon : '90' + telefon;
        hedefUrl = `https://wa.me/${uluslararasi}?text=Merhaba`;
      }

      const qrBase64 = await QRCode.toDataURL(hedefUrl, {
        width: 600, margin: 2,
        color: { dark: type === 'booking' ? '#3b82f6' : '#00C853', light: '#FFFFFF' },
        errorCorrectionLevel: 'M'
      });

      res.json({ qr: qrBase64, hedefUrl, type, isletmeIsim: isletme.isim, slug });
    } catch (error) {
      res.status(500).json({ hata: error.message });
    }
  }

  async qrKodOlustur(req, res) {
    try {
      const isletmeId = req.kullanici.isletme_id;
      const { type = 'whatsapp' } = req.query;

      const isletme = (await pool.query(
        'SELECT id, isim, telefon, slug FROM isletmeler WHERE id = $1', [isletmeId]
      )).rows[0];

      if (!isletme) return res.status(404).json({ hata: 'İşletme bulunamadı' });

      let slug = isletme.slug;
      if (!slug) {
        slug = isletme.isim
          .toLowerCase()
          .replace(/ğ/g, 'g').replace(/ü/g, 'u').replace(/ş/g, 's')
          .replace(/ı/g, 'i').replace(/ö/g, 'o').replace(/ç/g, 'c')
          .replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
        slug = slug + '-' + isletmeId;
        await pool.query('UPDATE isletmeler SET slug = $1 WHERE id = $2', [slug, isletmeId]);
      }

      let hedefUrl;
      if (type === 'booking') {
        hedefUrl = `https://sırago.com/book/${slug}`;
      } else {
        const telefon = (isletme.telefon || '').replace(/\D/g, '');
        const uluslararasi = telefon.startsWith('90') ? telefon : '90' + telefon;
        hedefUrl = `https://wa.me/${uluslararasi}?text=Merhaba`;
      }

      const qrBase64 = await QRCode.toDataURL(hedefUrl, {
        width: 600,
        margin: 2,
        color: { dark: '#00C853', light: '#FFFFFF' },
        errorCorrectionLevel: 'M'
      });

      res.json({
        qr: qrBase64,
        hedefUrl,
        type,
        isletmeIsim: isletme.isim,
        slug
      });
    } catch (error) {
      res.status(500).json({ hata: error.message });
    }
  }

  // ==================== İŞLETME BİLDİRİMLERİ ====================

  // Bildirim oluştur (yardımcı fonksiyon — diğer fonksiyonlardan çağrılır)
  async bildirimOlustur(isletmeId, tip, baslik, mesaj, link = null) {
    try {
      // Panel bildirimi oluştur
      await pool.query(
        `INSERT INTO isletme_bildirimleri (isletme_id, tip, baslik, mesaj, link) VALUES ($1, $2, $3, $4, $5)`,
        [isletmeId, tip, baslik, mesaj || '', link]
      );

      // İşletme bildirim tercihlerini kontrol et
      const isletme = (await pool.query(
        'SELECT isim, telefon, bildirim_whatsapp, bildirim_sms FROM isletmeler WHERE id = $1', [isletmeId]
      )).rows[0];
      if (!isletme) return;

      // WhatsApp bildirimi
      if (isletme.bildirim_whatsapp && isletme.telefon) {
        try {
          const wpService = require('../services/whatsappWeb');
          const tel = isletme.telefon.replace(/^\+/, '').replace(/^0/, '90');
          const jid = `${tel}@s.whatsapp.net`;
          await wpService.mesajGonder(isletmeId, jid, `🔔 *SıraGO Bildirim*\n\n*${baslik}*\n${mesaj || ''}\n\n👉 admin.sırago.com`);
        } catch(e) { /* WA gönderilemezse geç */ }
      }

      // SMS bildirimi
      if (isletme.bildirim_sms && isletme.telefon) {
        try {
          const netgsm = require('../services/netgsm');
          const kisa = `SıraGO: ${baslik}`.slice(0, 160);
          await netgsm.smsGonder(isletme.telefon, kisa, isletmeId);
        } catch(e) { /* SMS gönderilemezse geç */ }
      }
    } catch(e) {
      console.error('Bildirim oluşturma hatası:', e.message);
    }
  }

  // İşletmenin bildirimlerini getir
  async bildirimlerGetir(req, res) {
    try {
      const isletmeId = req.kullanici.isletme_id;
      const { limit = 50, offset = 0 } = req.query;
      const result = await pool.query(
        `SELECT * FROM isletme_bildirimleri WHERE isletme_id = $1 ORDER BY olusturma_tarihi DESC LIMIT $2 OFFSET $3`,
        [isletmeId, parseInt(limit), parseInt(offset)]
      );
      const toplam = (await pool.query(
        'SELECT COUNT(*) as c FROM isletme_bildirimleri WHERE isletme_id = $1', [isletmeId]
      )).rows[0];
      res.json({ bildirimler: result.rows, toplam: parseInt(toplam.c) });
    } catch (error) {
      res.status(500).json({ hata: error.message });
    }
  }

  // Okunmamış bildirim sayısı
  async bildirimOkunmamisSayi(req, res) {
    try {
      const isletmeId = req.kullanici.isletme_id;
      const result = (await pool.query(
        'SELECT COUNT(*) as c FROM isletme_bildirimleri WHERE isletme_id = $1 AND okundu = false', [isletmeId]
      )).rows[0];
      res.json({ sayi: parseInt(result.c) });
    } catch (error) {
      res.json({ sayi: 0 });
    }
  }

  // Bildirim okundu işaretle
  async bildirimOkundu(req, res) {
    try {
      const isletmeId = req.kullanici.isletme_id;
      await pool.query(
        'UPDATE isletme_bildirimleri SET okundu = true WHERE id = $1 AND isletme_id = $2',
        [req.params.id, isletmeId]
      );
      res.json({ ok: true });
    } catch (error) {
      res.status(500).json({ hata: error.message });
    }
  }

  // Tüm bildirimleri okundu işaretle
  async bildirimTumunuOku(req, res) {
    try {
      const isletmeId = req.kullanici.isletme_id;
      await pool.query(
        'UPDATE isletme_bildirimleri SET okundu = true WHERE isletme_id = $1 AND okundu = false',
        [isletmeId]
      );
      res.json({ ok: true });
    } catch (error) {
      res.status(500).json({ hata: error.message });
    }
  }

  // Bildirim tercihlerini güncelle
  async bildirimTercihGuncelle(req, res) {
    try {
      const isletmeId = req.kullanici.isletme_id;
      const { bildirim_panel, bildirim_whatsapp, bildirim_sms } = req.body;
      await pool.query(
        `UPDATE isletmeler SET 
          bildirim_panel = COALESCE($1, bildirim_panel),
          bildirim_whatsapp = COALESCE($2, bildirim_whatsapp),
          bildirim_sms = COALESCE($3, bildirim_sms)
        WHERE id = $4`,
        [bildirim_panel, bildirim_whatsapp, bildirim_sms, isletmeId]
      );
      res.json({ ok: true });
    } catch (error) {
      res.status(500).json({ hata: error.message });
    }
  }
}

module.exports = new AdminController();
