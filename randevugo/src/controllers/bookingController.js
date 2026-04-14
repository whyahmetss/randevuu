const pool = require('../config/db');
const randevuService = require('../services/randevu');

/* ─── In-memory OTP store ─── */
const otpStore = new Map(); // key: "isletmeId:telefon" → { kod, olusturma, deneme }
const OTP_TTL = 5 * 60 * 1000; // 5 dakika
const OTP_COOLDOWN = 60 * 1000; // 60 saniye - aynı numaraya tekrar gönderim
const OTP_MAX_DENEME = 5; // max yanlış deneme

// Periyodik temizlik (10dk'da bir)
setInterval(() => {
  const now = Date.now();
  for (const [key, val] of otpStore) {
    if (now - val.olusturma > OTP_TTL) otpStore.delete(key);
  }
}, 10 * 60 * 1000);

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
  // POST /api/book/:slug/otp-gonder — WhatsApp OTP gönder
  async otpGonder(req, res) {
    try {
      const { slug } = req.params;
      const { telefon } = req.body;
      if (!telefon) return res.status(400).json({ hata: 'Telefon numarası gerekli' });

      const telefonTemiz = String(telefon).replace(/[^\d]/g, '');
      if (telefonTemiz.length < 10 || telefonTemiz.length > 15) return res.status(400).json({ hata: 'Geçersiz telefon numarası' });

      const isletme = (await pool.query('SELECT id, isim FROM isletmeler WHERE slug=$1 AND aktif=true', [slug])).rows[0];
      if (!isletme) return res.status(404).json({ hata: 'İşletme bulunamadı' });

      const storeKey = `${isletme.id}:${telefonTemiz}`;
      const mevcut = otpStore.get(storeKey);

      // Cooldown kontrolü
      if (mevcut && Date.now() - mevcut.olusturma < OTP_COOLDOWN) {
        const kalan = Math.ceil((OTP_COOLDOWN - (Date.now() - mevcut.olusturma)) / 1000);
        return res.status(429).json({ hata: `Lütfen ${kalan} saniye bekleyin.`, cooldown: kalan });
      }

      // 6 haneli kod üret
      const kod = String(Math.floor(100000 + Math.random() * 900000));

      // Store'a kaydet
      otpStore.set(storeKey, { kod, olusturma: Date.now(), deneme: 0 });

      // WhatsApp ile gönder
      const whatsappWeb = require('../services/whatsappWeb');
      const waDurum = whatsappWeb.getDurum(isletme.id);

      if (waDurum?.durum !== 'bagli') {
        // WA bağlı değilse — OTP gönderilemez, frontend captcha moduna düşsün
        return res.json({ basarili: false, waBagli: false });
      }

      // Numara formatı: 90XXXXXXXXXX veya XXXXXXXXXX → JID
      let jidTel = telefonTemiz;
      if (jidTel.startsWith('0')) jidTel = '90' + jidTel.substring(1);
      if (!jidTel.startsWith('90') && jidTel.length === 10) jidTel = '90' + jidTel;

      const mesaj = `🔐 *SıraGO Doğrulama Kodu*\n\n*${isletme.isim}* üzerinden online randevu almak için doğrulama kodunuz:\n\n🔑 *${kod}*\n\n⏰ Bu kod 5 dakika geçerlidir.\n\n_Bu mesajı siz talep etmediyseniz lütfen dikkate almayın._`;

      await whatsappWeb.mesajGonder(isletme.id, `${jidTel}@s.whatsapp.net`, mesaj);

      console.log(`📤 OTP gönderildi: ${telefonTemiz} → ${isletme.isim} (${kod})`);
      res.json({ basarili: true });
    } catch (error) {
      console.error('❌ OTP gönderme hatası:', error.message);
      res.status(500).json({ hata: 'Doğrulama kodu gönderilemedi' });
    }
  }

  // POST /api/book/:slug/otp-dogrula — OTP doğrula
  async otpDogrula(req, res) {
    try {
      const { slug } = req.params;
      const { telefon, kod } = req.body;
      if (!telefon || !kod) return res.status(400).json({ hata: 'Telefon ve kod gerekli' });

      const telefonTemiz = String(telefon).replace(/[^\d]/g, '');

      const isletme = (await pool.query('SELECT id FROM isletmeler WHERE slug=$1 AND aktif=true', [slug])).rows[0];
      if (!isletme) return res.status(404).json({ hata: 'İşletme bulunamadı' });

      const storeKey = `${isletme.id}:${telefonTemiz}`;
      const kayit = otpStore.get(storeKey);

      if (!kayit) return res.status(400).json({ hata: 'Doğrulama kodu bulunamadı. Lütfen tekrar gönderin.' });

      // TTL kontrolü
      if (Date.now() - kayit.olusturma > OTP_TTL) {
        otpStore.delete(storeKey);
        return res.status(400).json({ hata: 'Kodun süresi dolmuş. Lütfen yeni kod isteyin.', sureDoldu: true });
      }

      // Bypass modu (WA bağlı değilken)
      if (kayit.bypass) {
        otpStore.delete(storeKey);
        return res.json({ basarili: true, dogrulandi: true });
      }

      // Max deneme kontrolü
      if (kayit.deneme >= OTP_MAX_DENEME) {
        otpStore.delete(storeKey);
        return res.status(429).json({ hata: 'Çok fazla yanlış deneme. Lütfen yeni kod isteyin.' });
      }

      // Kod kontrolü
      if (String(kod).trim() !== kayit.kod) {
        kayit.deneme++;
        return res.status(400).json({ hata: 'Doğrulama kodu yanlış.', kalanDeneme: OTP_MAX_DENEME - kayit.deneme });
      }

      // Başarılı doğrulama
      otpStore.delete(storeKey);
      console.log(`✅ OTP doğrulandı: ${telefonTemiz}`);
      res.json({ basarili: true, dogrulandi: true });
    } catch (error) {
      console.error('❌ OTP doğrulama hatası:', error.message);
      res.status(500).json({ hata: 'Doğrulama hatası' });
    }
  }
}

module.exports = new BookingController();
