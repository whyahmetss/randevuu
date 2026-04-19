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
                google_maps_reserve_url, booking_acik, telegram_token
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

      // OTP kanal durumu
      let telegramAktif = false;
      let telegramBotUsername = null;
      if (isletme.telegram_token) {
        try {
          const telegramOtp = require('../services/telegramOtp');
          telegramBotUsername = await telegramOtp.botUsername(isletme.id);
          telegramAktif = !!telegramBotUsername;
        } catch(e) {}
      }

      // Response'tan token gizle (güvenlik)
      delete isletme.telegram_token;
      isletme.telegram_aktif = telegramAktif;
      isletme.telegram_bot_username = telegramBotUsername;

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

  // GET /api/book/:slug/calisanlar?hizmetId=X  VEYA  ?hizmetIds=1,4,5
  // Çoklu hizmet → intersection (hepsini yapabilen çalışanlar)
  async calisanlariGetir(req, res) {
    try {
      const { slug } = req.params;
      const { hizmetId, hizmetIds } = req.query;
      const isletme = (await pool.query('SELECT id, calisan_secim_modu FROM isletmeler WHERE slug=$1 AND aktif=true', [slug])).rows[0];
      if (!isletme) return res.status(404).json({ hata: 'İşletme bulunamadı' });

      const secimModu = isletme.calisan_secim_modu || 'musteri';

      // Hizmet listesini normalize et: "1,4,5" → [1,4,5] veya tek hizmetId
      let hizmetListesi = null;
      if (hizmetIds) {
        hizmetListesi = String(hizmetIds).split(',').map(x => parseInt(x)).filter(Boolean);
      } else if (hizmetId) {
        hizmetListesi = [parseInt(hizmetId)];
      }

      // Otomatik / tek çalışan modunda: çalışanı backend seçecek
      if (secimModu === 'otomatik' || secimModu === 'tek') {
        // Intersection ile uygun çalışan var mı kontrol et (uyarı için)
        const uygun = hizmetListesi
          ? await randevuService.uygunCalisanlar(isletme.id, hizmetListesi)
          : [];
        return res.json({
          calisanlar: [],
          otomatik: true,
          uygunSayi: uygun.length,
          uyumsuzHizmet: hizmetListesi && hizmetListesi.length > 1 && uygun.length === 0
        });
      }

      // Müşteri seçer modu — intersection
      const calisanlar = await randevuService.uygunCalisanlar(isletme.id, hizmetListesi);

      // Tek çalışan veya 0 ise otomatik atama (0 durumu client'a bilgi)
      if (calisanlar.length <= 1) {
        return res.json({
          calisanlar: [],
          otomatik: true,
          uygunSayi: calisanlar.length,
          uyumsuzHizmet: hizmetListesi && hizmetListesi.length > 1 && calisanlar.length === 0
        });
      }

      res.json({ calisanlar: calisanlar.map(c => ({ id: c.id, isim: c.isim })) });
    } catch (error) {
      res.status(500).json({ hata: error.message });
    }
  }

  // GET /api/book/:slug/saatler?tarih=...&calisanId=X&hizmetIds=1,4
  async musaitSaatler(req, res) {
    try {
      const { slug } = req.params;
      const { tarih, calisanId, hizmetId, hizmetIds } = req.query;
      if (!tarih) return res.status(400).json({ hata: 'Tarih gerekli' });

      const isletme = (await pool.query('SELECT id FROM isletmeler WHERE slug=$1 AND aktif=true', [slug])).rows[0];
      if (!isletme) return res.status(404).json({ hata: 'İşletme bulunamadı' });

      const hizmetListesi = hizmetIds
        ? String(hizmetIds).split(',').map(x => parseInt(x)).filter(Boolean)
        : null;

      const saatler = await randevuService.musaitSaatleriGetir(
        isletme.id, tarih,
        calisanId ? parseInt(calisanId) : null,
        !hizmetListesi && hizmetId ? parseInt(hizmetId) : null,
        hizmetListesi ? { hizmetIds: hizmetListesi } : {}
      );

      res.json({ saatler });
    } catch (error) {
      res.status(500).json({ hata: error.message });
    }
  }

  // POST /api/book/:slug/randevu — Randevu oluştur (public, multi-hizmet)
  async randevuOlustur(req, res) {
    try {
      const { slug } = req.params;
      const { hizmetId, hizmetIds, calisanId, tarih, saat, musteriIsim, musteriTelefon, musteriDogum, musteriNot } = req.body;

      // Multi-hizmet: `hizmetIds` array öncelikli, yoksa eski `hizmetId` tek değer
      const hizmetListesi = Array.isArray(hizmetIds) && hizmetIds.length > 0
        ? hizmetIds.map(x => parseInt(x)).filter(Boolean)
        : (hizmetId ? [parseInt(hizmetId)] : []);

      if (hizmetListesi.length === 0 || !tarih || !saat || !musteriTelefon) {
        return res.status(400).json({ hata: 'Eksik bilgi (hizmet, tarih, saat, telefon gerekli)' });
      }
      if (hizmetListesi.length > 6) {
        return res.status(400).json({ hata: 'En fazla 6 hizmet aynı anda seçilebilir' });
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

      // Çalışan otomatik seçim — multi-hizmet intersection ile
      let secilenCalisanId = calisanId ? parseInt(calisanId) : null;
      const secimModu = isletme.calisan_secim_modu || 'musteri';
      if (!secilenCalisanId) {
        if (secimModu === 'tek') {
          // Tek çalışan modu: tüm hizmetleri yapabilen ilk uygun çalışanı ata
          const uygunlar = await randevuService.uygunCalisanlar(isletme.id, hizmetListesi);
          if (uygunlar.length > 0) secilenCalisanId = uygunlar[0].id;
        } else {
          // Otomatik veya müşteri modu: en boş çalışanı ata
          // enBosCalisan tek hizmetId alıyor — multi-hizmette ilk uyumlu çalışanı seç
          const uygunlar = await randevuService.uygunCalisanlar(isletme.id, hizmetListesi);
          if (uygunlar.length === 1) {
            secilenCalisanId = uygunlar[0].id;
          } else if (uygunlar.length > 1) {
            // En az yüklü çalışan
            const enBos = await randevuService.enBosCalisan(isletme.id, tarih, hizmetListesi[0], saat);
            if (enBos && uygunlar.some(u => u.id === enBos.id)) {
              secilenCalisanId = enBos.id;
            } else {
              secilenCalisanId = uygunlar[0].id;
            }
          }
        }
        if (!secilenCalisanId) {
          return res.status(400).json({
            hata: hizmetListesi.length > 1
              ? 'Seçilen hizmet kombinasyonunu yapabilen çalışan bulunamadı. Lütfen daha az hizmet seçin.'
              : 'Uygun çalışan bulunamadı'
          });
        }
      }

      // Müsaitlik kontrolü (toplam süreye göre, seans modunda işletme bazlı)
      const musaitSaatler = await randevuService.musaitSaatleriGetir(
        isletme.id, tarih,
        secimModu === 'musteri' ? secilenCalisanId : null,
        null,
        { hizmetIds: hizmetListesi }
      );
      if (!musaitSaatler.includes(saat)) {
        return res.status(400).json({ hata: 'Seçilen saat artık müsait değil' });
      }

      // Randevu oluştur (multi-hizmet)
      const sonuc = await randevuService.randevuOlustur({
        isletmeId: isletme.id,
        musteriTelefon,
        musteriIsim: musteriIsim || 'Online Müşteri',
        hizmetIds: hizmetListesi,
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
          bitis_saati: sonuc.randevu.bitis_saati,
          durum: sonuc.randevu.durum
        },
        hizmet: sonuc.hizmet ? { isim: sonuc.hizmet.isim, fiyat: sonuc.hizmet.fiyat, sure_dk: sonuc.hizmet.sure_dk } : null,
        hizmetler: (sonuc.hizmetler || []).map(h => ({ id: h.id, isim: h.isim, fiyat: h.fiyat, sure_dk: h.sure_dk })),
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
  // POST /api/book/:slug/otp-gonder — Çok kanallı OTP (WhatsApp | Telegram)
  async otpGonder(req, res) {
    try {
      const { slug } = req.params;
      const { telefon, kanal } = req.body;  // kanal: 'whatsapp' | 'telegram' (default 'whatsapp')
      if (!telefon) return res.status(400).json({ hata: 'Telefon numarası gerekli' });

      const telefonTemiz = String(telefon).replace(/[^\d]/g, '');
      if (telefonTemiz.length < 10 || telefonTemiz.length > 15) return res.status(400).json({ hata: 'Geçersiz telefon numarası' });

      const isletme = (await pool.query(
        'SELECT id, isim, booking_acik, imza_gizle FROM isletmeler WHERE slug=$1 AND aktif=true',
        [slug]
      )).rows[0];
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

      const { imzaSatiri } = require('../utils/siragoImza');
      const imza = imzaSatiri(isletme, 'tr');

      let kaynak = null;
      let gonderildi = false;
      const secilenKanal = (kanal || 'whatsapp').toLowerCase();

      // ═══ TELEGRAM KANALI ═══
      if (secilenKanal === 'telegram') {
        const telegramOtp = require('../services/telegramOtp');
        const chatId = await telegramOtp.chatIdBul(isletme.id, telefonTemiz);
        if (!chatId) {
          // Müşterinin chat_id'si yok → /start linki dönelim, FE modal gösterip bekleyecek
          const botUsername = await telegramOtp.botUsername(isletme.id);
          if (!botUsername) {
            return res.status(503).json({
              hata: 'Bu işletmede Telegram ile kod gönderimi aktif değil.',
              servisYok: true,
            });
          }
          return res.status(428).json({
            hata: 'Önce Telegram botumuza bağlanın',
            telegramHazirDegil: true,
            botUsername,
            startLink: `https://t.me/${botUsername}?start=link_${telefonTemiz}`,
          });
        }

        const mesaj = `🔐 *${isletme.isim} Doğrulama Kodu*\n\nOnline randevu için doğrulama kodunuz:\n\n🔑 *${kod}*\n\n⏰ Bu kod 5 dakika geçerlidir.\n\n_Bu mesajı siz talep etmediyseniz lütfen dikkate almayın._${imza}`;
        const sonuc = await telegramOtp.mesajGonder(isletme.id, chatId, mesaj);
        if (sonuc.success) {
          kaynak = 'telegram';
          gonderildi = true;
        } else {
          console.error('❌ TG OTP gönderilemedi:', sonuc.hata);
          return res.status(503).json({ hata: 'Telegram üzerinden gönderilemedi. WhatsApp ile deneyin.' });
        }
      }

      // ═══ WHATSAPP KANALI (default) — CASCADE: Esnaf WA → Merkez OTP ═══
      if (secilenKanal !== 'telegram' && !gonderildi) {
        // 1. Esnafın kendi WA'sı bağlı mı?
        const whatsappWeb = require('../services/whatsappWeb');
        const waDurum = whatsappWeb.getDurum(isletme.id);

        if (waDurum?.durum === 'bagli') {
          const mesaj = `🔐 *${isletme.isim} Doğrulama Kodu*\n\nOnline randevu için doğrulama kodunuz:\n\n🔑 *${kod}*\n\n⏰ Bu kod 5 dakika geçerlidir.\n\n_Bu mesajı siz talep etmediyseniz lütfen dikkate almayın._${imza}`;
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
            const mesaj = `🔐 *SıraGO Doğrulama*\n\n«${isletme.isim}» üzerinden randevunuz için kod:\n\n🔑 *${kod}*\n\n⏰ Bu kod 5 dakika geçerlidir.\n\n_Bu mesaj SıraGO güvenlik sistemi tarafından gönderilmiştir. Sen talep etmediysen dikkate alma._${imza}`;
            const sonuc = await merkezOtpBot.mesajGonder(telefonTemiz, mesaj);
            if (sonuc.success) {
              kaynak = 'merkez_otp';
              gonderildi = true;
            } else {
              console.error('❌ Merkez OTP gönderilemedi:', sonuc.hata);
            }
          }
        }
      }

      // 3. Hiçbiri başarılı değilse → reddet
      if (!gonderildi) {
        try {
          await _olayLogla(isletme.id, 'otp_gonder_yok', `Kanal=${secilenKanal}, sonuç yok`, null, telefonTemiz);
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

  // GET /api/book/:slug/telegram-chat-durum?tel=... — FE polling endpoint
  // Müşteri /start link_X sonrası chat_id eşleştirmesi yapıldı mı kontrolü
  async telegramChatDurum(req, res) {
    try {
      const { slug } = req.params;
      const { tel } = req.query;
      if (!tel) return res.status(400).json({ hata: 'Telefon gerekli' });
      const telefonTemiz = String(tel).replace(/[^\d]/g, '');

      const isletme = (await pool.query('SELECT id FROM isletmeler WHERE slug=$1 AND aktif=true', [slug])).rows[0];
      if (!isletme) return res.status(404).json({ hata: 'İşletme bulunamadı' });

      const telegramOtp = require('../services/telegramOtp');
      const chatId = await telegramOtp.chatIdBul(isletme.id, telefonTemiz);
      res.json({ hazir: !!chatId });
    } catch (error) {
      res.status(500).json({ hata: error.message });
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
