const pool = require('../config/db');
const randevuService = require('../services/randevu');

class BookingController {

  // GET /api/book/:slug — İşletme bilgilerini getir (public)
  async isletmeBilgileri(req, res) {
    try {
      const { slug } = req.params;
      const isletme = (await pool.query(
        `SELECT id, isim, adres, ilce, kategori, calisma_baslangic, calisma_bitis, 
                kapali_gunler, randevu_suresi_dk, calisan_secim_modu, kapora_aktif
         FROM isletmeler WHERE slug = $1 AND aktif = true`,
        [slug]
      )).rows[0];

      if (!isletme) {
        return res.status(404).json({ hata: 'İşletme bulunamadı' });
      }

      res.json({ isletme });
    } catch (error) {
      res.status(500).json({ hata: error.message });
    }
  }

  // GET /api/book/:slug/hizmetler — Hizmet listesi (public)
  async hizmetleriGetir(req, res) {
    try {
      const { slug } = req.params;
      const isletme = (await pool.query('SELECT id FROM isletmeler WHERE slug=$1 AND aktif=true', [slug])).rows[0];
      if (!isletme) return res.status(404).json({ hata: 'İşletme bulunamadı' });

      const hizmetler = (await pool.query(
        'SELECT id, isim, sure_dk, fiyat FROM hizmetler WHERE isletme_id=$1 AND aktif=true ORDER BY id',
        [isletme.id]
      )).rows;

      res.json({ hizmetler });
    } catch (error) {
      res.status(500).json({ hata: error.message });
    }
  }

  // GET /api/book/:slug/calisanlar?hizmetId=X — Çalışan listesi (public)
  async calisanlariGetir(req, res) {
    try {
      const { slug } = req.params;
      const { hizmetId } = req.query;
      const isletme = (await pool.query('SELECT id, calisan_secim_modu FROM isletmeler WHERE slug=$1 AND aktif=true', [slug])).rows[0];
      if (!isletme) return res.status(404).json({ hata: 'İşletme bulunamadı' });

      const calisanlar = await randevuService.uygunCalisanlar(isletme.id, hizmetId ? parseInt(hizmetId) : null);
      
      // Tek çalışan veya 0 ise otomatik atama
      if (calisanlar.length <= 1) {
        return res.json({ calisanlar: [], otomatik: true });
      }

      // 2+ çalışan varsa listeyi göster (müşteri seçsin)
      res.json({ calisanlar: calisanlar.map(c => ({ id: c.id, isim: c.isim })) });
    } catch (error) {
      res.status(500).json({ hata: error.message });
    }
  }

  // GET /api/book/:slug/saatler?tarih=YYYY-MM-DD&calisanId=X&hizmetId=X — Müsait saatler (public)
  async musaitSaatler(req, res) {
    try {
      const { slug } = req.params;
      const { tarih, calisanId, hizmetId } = req.query;
      if (!tarih) return res.status(400).json({ hata: 'Tarih gerekli' });

      const isletme = (await pool.query('SELECT id FROM isletmeler WHERE slug=$1 AND aktif=true', [slug])).rows[0];
      if (!isletme) return res.status(404).json({ hata: 'İşletme bulunamadı' });

      const saatler = await randevuService.musaitSaatleriGetir(
        isletme.id, tarih,
        calisanId ? parseInt(calisanId) : null,
        hizmetId ? parseInt(hizmetId) : null
      );

      res.json({ saatler });
    } catch (error) {
      res.status(500).json({ hata: error.message });
    }
  }

  // POST /api/book/:slug/randevu — Randevu oluştur (public)
  async randevuOlustur(req, res) {
    try {
      const { slug } = req.params;
      const { hizmetId, calisanId, tarih, saat, musteriIsim, musteriTelefon } = req.body;

      if (!hizmetId || !tarih || !saat || !musteriTelefon) {
        return res.status(400).json({ hata: 'Eksik bilgi' });
      }

      // Input validasyon
      const telefonTemiz = String(musteriTelefon).replace(/[^\d+]/g, '');
      if (telefonTemiz.length < 10 || telefonTemiz.length > 15) return res.status(400).json({ hata: 'Geçersiz telefon numarası' });
      if (!/^\d{4}-\d{2}-\d{2}$/.test(tarih)) return res.status(400).json({ hata: 'Geçersiz tarih formatı' });
      if (!/^\d{2}:\d{2}$/.test(saat)) return res.status(400).json({ hata: 'Geçersiz saat formatı' });

      const isletme = (await pool.query('SELECT id, calisan_secim_modu FROM isletmeler WHERE slug=$1 AND aktif=true', [slug])).rows[0];
      if (!isletme) return res.status(404).json({ hata: 'İşletme bulunamadı' });

      // Aynı telefon+tarih+saat ile tekrar randevu kontrolü
      const mevcutRandevu = (await pool.query(
        `SELECT r.id FROM randevular r JOIN musteriler m ON r.musteri_id=m.id 
         WHERE r.isletme_id=$1 AND m.telefon=$2 AND r.tarih=$3 AND r.saat=$4 AND r.durum != 'iptal'`,
        [isletme.id, telefonTemiz, tarih, saat]
      )).rows[0];
      if (mevcutRandevu) return res.status(400).json({ hata: 'Bu saat için zaten randevunuz bulunuyor.' });

      // Aynı telefondan günlük max 3 randevu
      const gunlukSayi = parseInt((await pool.query(
        `SELECT COUNT(*) as c FROM randevular r JOIN musteriler m ON r.musteri_id=m.id 
         WHERE r.isletme_id=$1 AND m.telefon=$2 AND r.tarih=$3 AND r.durum != 'iptal'`,
        [isletme.id, telefonTemiz, tarih]
      )).rows[0]?.c) || 0;
      if (gunlukSayi >= 3) return res.status(400).json({ hata: 'Aynı gün için en fazla 3 randevu alabilirsiniz.' });

      // Çalışan otomatik seçim
      let secilenCalisanId = calisanId ? parseInt(calisanId) : null;
      if (!secilenCalisanId) {
        const enBos = await randevuService.enBosCalisan(isletme.id, tarih, parseInt(hizmetId));
        if (!enBos) return res.status(400).json({ hata: 'Uygun çalışan bulunamadı' });
        secilenCalisanId = enBos.id;
      }

      // Müsaitlik kontrolü
      const musaitSaatler = await randevuService.musaitSaatleriGetir(
        isletme.id, tarih, secilenCalisanId, parseInt(hizmetId)
      );
      if (!musaitSaatler.includes(saat)) {
        return res.status(400).json({ hata: 'Seçilen saat artık müsait değil' });
      }

      // Randevu oluştur
      const sonuc = await randevuService.randevuOlustur({
        isletmeId: isletme.id,
        musteriTelefon,
        musteriIsim: musteriIsim || 'Online Müşteri',
        hizmetId: parseInt(hizmetId),
        calisanId: secilenCalisanId,
        tarih,
        saat
      });

      // Kaynağı online olarak güncelle
      await pool.query("UPDATE randevular SET kaynak='online' WHERE id=$1", [sonuc.randevu.id]);

      // İşletmeye bildirim gönder
      try {
        const adminController = require('./adminController');
        await adminController.bildirimOlustur(
          isletme.id, 'randevu',
          'Yeni Online Randevu',
          `${musteriIsim || 'Müşteri'} — ${tarih} ${saat} saatine online randevu aldı.`
        );
      } catch(e) {}

      res.json({
        basarili: true,
        randevu: {
          id: sonuc.randevu.id,
          tarih: sonuc.randevu.tarih,
          saat: sonuc.randevu.saat,
          durum: sonuc.randevu.durum
        },
        hizmet: sonuc.hizmet ? { isim: sonuc.hizmet.isim, fiyat: sonuc.hizmet.fiyat } : null,
        kapora: sonuc.kapora
      });
    } catch (error) {
      console.error('❌ Booking randevu oluşturma hatası:', error.message, error.stack);
      if (error.code === 'LIMIT_ASIMI') {
        return res.status(403).json({ hata: 'Bu işletmenin aylık randevu kapasitesi dolmuştur. Lütfen daha sonra tekrar deneyin.', limit_asimi: true });
      }
      res.status(500).json({ hata: 'Randevu oluşturulamadı: ' + error.message });
    }
  }
}

module.exports = new BookingController();
