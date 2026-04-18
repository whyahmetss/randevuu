const pool = require('../config/db');
const randevuService = require('../services/randevu');
const { ddosSayacArtir, _olayLogla } = require('../middleware/ddosGuard');

/* ─── In-memory OTP store ─── */
const otpStore = new Map(); // key: "isletmeId:telefon" → { kod, olusturma, deneme, kaynak }
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

// Ad soyad validation — minimum 3 karakter + en az bir harf (sayı/sembol kabul değil)
function adGecerliMi(isim) {
  if (!isim) return false;
  const temiz = String(isim).trim();
  if (temiz.length < 3) return false;
  // En az 2 harf (Türkçe + latin)
  const harfSayi = (temiz.match(/[a-zA-ZçÇğĞıİöÖşŞüÜ]/g) || []).length;
  return harfSayi >= 2;
}

class BookingController {

  // GET /api/book/:slug — İşletme bilgilerini getir (public)
  async isletmeBilgileri(req, res) {
    try {
      const { slug } = req.params;
      const isletme = (await pool.query(
        `SELECT id, isim, adres, ilce, kategori, calisma_baslangic, calisma_bitis, 
                kapali_gunler, randevu_suresi_dk, calisan_secim_modu, kapora_aktif,
                google_maps_reserve_url, booking_acik
         FROM isletmeler WHERE slug = $1 AND aktif = true`,
        [slug]
      )).rows[0];

      if (!isletme) {
        return res.status(404).json({ hata: 'İşletme bulunamadı' });
      }

      // Booking Gate — henüz aktif değilse özel response
      if (!isletme.booking_acik) {
        return res.json({
          isletme: { id: isletme.id, isim: isletme.isim, kategori: isletme.kategori },
          bookingKapali: true,
          sebep: 'kurulum_tamamlanmadi',
        });
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

      const secimModu = isletme.calisan_secim_modu || 'musteri';

      // Otomatik veya tek çalışan modunda çalışan listesi gösterme
      if (secimModu === 'otomatik' || secimModu === 'tek') {
        return res.json({ calisanlar: [], otomatik: true });
      }

      // Müşteri seçer modu
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
      const { hizmetId, calisanId, tarih, saat, musteriIsim, musteriTelefon, musteriDogum, musteriNot } = req.body;

      if (!hizmetId || !tarih || !saat || !musteriTelefon) {
        return res.status(400).json({ hata: 'Eksik bilgi' });
      }

      // Input validasyon
      const telefonTemiz = String(musteriTelefon).replace(/[^\d+]/g, '');
      if (telefonTemiz.length < 10 || telefonTemiz.length > 15) return res.status(400).json({ hata: 'Geçersiz telefon numarası' });
      if (!/^\d{4}-\d{2}-\d{2}$/.test(tarih)) return res.status(400).json({ hata: 'Geçersiz tarih formatı' });
      if (!/^\d{2}:\d{2}$/.test(saat)) return res.status(400).json({ hata: 'Geçersiz saat formatı' });

      // Ad soyad kontrolü — bot/troll'a karşı
      if (musteriIsim && !adGecerliMi(musteriIsim)) {
        try { await _olayLogla(null, 'ad_gecersiz', String(musteriIsim).slice(0, 30), req._ddosCtx?.ip, telefonTemiz); } catch {}
        return res.status(400).json({ hata: 'Lütfen gerçek ad ve soyadınızı girin (en az 3 harf).' });
      }

      const isletme = (await pool.query('SELECT id, calisan_secim_modu, booking_acik, dusuk_skor_manuel_onay, skor_esigi FROM isletmeler WHERE slug=$1 AND aktif=true', [slug])).rows[0];
      if (!isletme) return res.status(404).json({ hata: 'İşletme bulunamadı' });

      // Booking gate kontrolü (ddosGuard zaten kontrol etti ama double-check)
      if (!isletme.booking_acik) {
        return res.status(423).json({ hata: 'Bu işletme henüz randevu kabul etmiyor', bookingKapali: true });
      }

      // Kara liste kontrolü (aktif veya bloke_bitis > NOW)
      try {
        const kara = (await pool.query(
          `SELECT aktif, bloke_bitis FROM kara_liste 
           WHERE isletme_id=$1 AND telefon=$2 
             AND (aktif=true OR (bloke_bitis IS NOT NULL AND bloke_bitis > NOW()))`,
          [isletme.id, telefonTemiz]
        )).rows[0];
        if (kara) {
          try { await _olayLogla(isletme.id, 'kara_liste_block', JSON.stringify(kara), req._ddosCtx?.ip, telefonTemiz); } catch {}
          return res.status(403).json({ hata: 'Bu numara şu anda randevu alamıyor. Lütfen işletme ile iletişime geçin.' });
        }
      } catch {}

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
      const secimModu = isletme.calisan_secim_modu || 'musteri';
      if (!secilenCalisanId) {
        if (secimModu === 'tek') {
          // Tek çalışan modu: ilk uygun çalışanı ata
          const uygunlar = await randevuService.uygunCalisanlar(isletme.id, parseInt(hizmetId));
          if (uygunlar.length > 0) secilenCalisanId = uygunlar[0].id;
        } else {
          // Otomatik veya müşteri modu: en boş çalışanı ata (seans modunda saat de gönder)
          const enBos = await randevuService.enBosCalisan(isletme.id, tarih, parseInt(hizmetId), saat);
          if (enBos) secilenCalisanId = enBos.id;
        }
        if (!secilenCalisanId) return res.status(400).json({ hata: 'Uygun çalışan bulunamadı' });
      }

      // Müsaitlik kontrolü (seans modunda işletme bazlı, diğerlerinde çalışan bazlı)
      const musaitSaatler = await randevuService.musaitSaatleriGetir(
        isletme.id, tarih,
        secimModu === 'musteri' ? secilenCalisanId : null,
        parseInt(hizmetId)
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

      // Notu kaydet (varsa)
      if (musteriNot && musteriNot.trim()) {
        try { await pool.query('UPDATE randevular SET not_text=$1 WHERE id=$2', [musteriNot.trim().slice(0, 500), sonuc.randevu.id]); } catch(e) {}
      }

      // 🎂 Doğum tarihi kaydet (varsa) — opsiyonel
      if (musteriDogum && musteriDogum.trim()) {
        try {
          const { parseDogumTarihi } = require('../utils/dogumTarihi');
          const parsed = parseDogumTarihi(musteriDogum);
          if (parsed) {
            await pool.query('UPDATE musteriler SET dogum_tarihi=$1 WHERE telefon=$2 AND isletme_id=$3 AND dogum_tarihi IS NULL',
              [parsed, musteriTelefon, isletme.id]);
          }
        } catch(e) { /* ignore */ }
      }

      // İşletmeye bildirim gönder
      try {
        const adminController = require('./adminController');
        await adminController.bildirimOlustur(
          isletme.id, 'randevu',
          'Yeni Online Randevu',
          `${musteriIsim || 'Müşteri'} — ${tarih} ${saat} saatine online randevu aldı.`
        );
      } catch(e) {}

      // DDoS sayaçlarını artır (IP, fingerprint)
      if (req._ddosCtx) {
        try { await ddosSayacArtir(req._ddosCtx); } catch {}
      }

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

      const isletme = (await pool.query('SELECT id, isim, booking_acik FROM isletmeler WHERE slug=$1 AND aktif=true', [slug])).rows[0];
      if (!isletme) return res.status(404).json({ hata: 'İşletme bulunamadı' });

      // Booking gate kontrolü
      if (!isletme.booking_acik) {
        return res.status(423).json({ hata: 'Bu işletme henüz randevu kabul etmiyor', bookingKapali: true });
      }

      const storeKey = `${isletme.id}:${telefonTemiz}`;
      const mevcut = otpStore.get(storeKey);

      // Cooldown kontrolü
      if (mevcut && Date.now() - mevcut.olusturma < OTP_COOLDOWN) {
        const kalan = Math.ceil((OTP_COOLDOWN - (Date.now() - mevcut.olusturma)) / 1000);
        return res.status(429).json({ hata: `Lütfen ${kalan} saniye bekleyin.`, cooldown: kalan });
      }

      // 6 haneli kod üret
      const kod = String(Math.floor(100000 + Math.random() * 900000));

      // Numara formatı: 90XXXXXXXXXX veya XXXXXXXXXX → JID
      let jidTel = telefonTemiz;
      if (jidTel.startsWith('0')) jidTel = '90' + jidTel.substring(1);
      if (!jidTel.startsWith('90') && jidTel.length === 10) jidTel = '90' + jidTel;

      // ═══ CASCADE OTP GÖNDERİM ═══
      // 1. Esnafın kendi WA'sı bağlı mı?
      const whatsappWeb = require('../services/whatsappWeb');
      const waDurum = whatsappWeb.getDurum(isletme.id);
      let kaynak = null;
      let gonderildi = false;

      if (waDurum?.durum === 'bagli') {
        const mesaj = `🔐 *${isletme.isim} Doğrulama Kodu*\n\nOnline randevu için doğrulama kodunuz:\n\n🔑 *${kod}*\n\n⏰ Bu kod 5 dakika geçerlidir.\n\n_Bu mesajı siz talep etmediyseniz lütfen dikkate almayın._`;
        try {
          await whatsappWeb.mesajGonder(isletme.id, `${jidTel}@s.whatsapp.net`, mesaj);
          kaynak = 'esnaf_wa';
          gonderildi = true;
        } catch (e) {
          console.log(`⚠️ Esnaf WA ile gönderilemedi, merkez OTP'ye düşülüyor:`, e.message);
        }
      }

      // 2. Esnafın WA'sı yoksa → SıraGO Merkez OTP Bot
      if (!gonderildi) {
        const merkezOtpBot = require('../services/merkezOtpBot');
        if (merkezOtpBot.aktifMi()) {
          const mesaj = `🔐 *SıraGO Doğrulama*\n\n«${isletme.isim}» üzerinden randevunuz için kod:\n\n🔑 *${kod}*\n\n⏰ Bu kod 5 dakika geçerlidir.\n\n_Bu mesaj SıraGO güvenlik sistemi tarafından gönderilmiştir. Sen talep etmediysen dikkate alma._`;
          const sonuc = await merkezOtpBot.mesajGonder(telefonTemiz, mesaj);
          if (sonuc.success) {
            kaynak = 'merkez_otp';
            gonderildi = true;
          } else {
            console.error(`❌ Merkez OTP gönderilemedi:`, sonuc.hata);
          }
        }
      }

      // 3. Hiçbiri bağlı değilse → reddet (booking gate zaten kapalı olmalı ama ihtimal)
      if (!gonderildi) {
        try {
          await _olayLogla(isletme.id, 'otp_gonder_yok', 'Ne esnaf WA ne merkez OTP aktif', null, telefonTemiz);
        } catch {}
        return res.status(503).json({
          hata: 'Doğrulama servisi geçici olarak kullanılamıyor. Lütfen işletme ile doğrudan iletişime geçin.',
          servisYok: true,
        });
      }

      // Store'a kaydet
      otpStore.set(storeKey, { kod, olusturma: Date.now(), deneme: 0, kaynak });

      console.log(`📤 OTP gönderildi (${kaynak}): ${telefonTemiz} → ${isletme.isim} (${kod})`);
      res.json({ basarili: true, kaynak });
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

      // Max deneme kontrolü
      if (kayit.deneme >= OTP_MAX_DENEME) {
        otpStore.delete(storeKey);
        try { await _olayLogla(isletme.id, 'otp_max_deneme', 'Çok fazla yanlış deneme', null, telefonTemiz); } catch {}
        return res.status(429).json({ hata: 'Çok fazla yanlış deneme. Lütfen yeni kod isteyin.' });
      }

      // Kod kontrolü
      if (String(kod).trim() !== kayit.kod) {
        kayit.deneme++;
        return res.status(400).json({ hata: 'Doğrulama kodu yanlış.', kalanDeneme: OTP_MAX_DENEME - kayit.deneme });
      }

      // Başarılı doğrulama
      otpStore.delete(storeKey);
      // Skor bonusu (ilk OTP doğrulama)
      try {
        const guvenlikSkor = require('../services/guvenlikSkor');
        // Müşteri bu işletmede varsa ve daha önce OTP doğrulamış mı?
        const mus = (await pool.query(
          `SELECT id, guven_skoru FROM musteriler WHERE telefon=$1 LIMIT 1`,
          [telefonTemiz]
        )).rows[0];
        if (!mus || (mus.guven_skoru || 50) < 60) {
          await guvenlikSkor.logla(telefonTemiz, 'otp_dogrulandi', isletme.id);
        }
      } catch {}
      console.log(`✅ OTP doğrulandı: ${telefonTemiz} (kaynak=${kayit.kaynak || 'bilinmiyor'})`);
      res.json({ basarili: true, dogrulandi: true });
    } catch (error) {
      console.error('❌ OTP doğrulama hatası:', error.message);
      res.status(500).json({ hata: 'Doğrulama hatası' });
    }
  }
}

module.exports = new BookingController();
