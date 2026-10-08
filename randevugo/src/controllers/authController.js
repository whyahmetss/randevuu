const pool = require('../config/db');
const { DENEME_GUN } = require('../config/deneme');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const socketServer = require('../services/socketServer');
const pushService = require('../services/pushService');
const { jwtSecret } = require('../middleware/auth');

class AuthController {
  async giris(req, res) {
    try {
      const { email, sifre } = req.body;
      const kullanici = (await pool.query('SELECT * FROM admin_kullanicilar WHERE email = $1 AND aktif = true', [email])).rows[0];
      
      if (!kullanici || !(await bcrypt.compare(sifre, kullanici.sifre))) {
        return res.status(401).json({ hata: 'Email veya şifre hatalı' });
      }

      const token = jwt.sign(
        { id: kullanici.id, email: kullanici.email, rol: kullanici.rol, isletme_id: kullanici.isletme_id, grup_id: kullanici.grup_id || null },
        jwtSecret,
        { expiresIn: '7d' }
      );

      // Audit log — giriş kaydı
      try {
        await pool.query(
          `INSERT INTO audit_log (isletme_id, kullanici_id, kullanici_email, islem, detay, ip_adresi)
           VALUES ($1, $2, $3, 'giris', 'Panel girişi', $4)`,
          [kullanici.isletme_id, kullanici.id, kullanici.email, require('../utils/istemciIp').istemciIp(req)]
        );
      } catch(e) { /* audit log opsiyonel */ }

      if (kullanici.rol === 'superadmin') pool.query('UPDATE admin_kullanicilar SET son_giris = NOW() WHERE id = $1', [kullanici.id]).catch(() => {});
      res.json({ token, kullanici: { id: kullanici.id, isim: kullanici.isim, email: kullanici.email, rol: kullanici.rol, isletme_id: kullanici.isletme_id, grup_id: kullanici.grup_id || null,
        ekip_gorev: kullanici.ekip_gorev || null, ekip_yetkileri: Array.isArray(kullanici.ekip_yetkileri) ? kullanici.ekip_yetkileri : null } });
    } catch (error) {
      console.error('❌ Giriş hatası:', error.message, error.stack);
      res.status(500).json({ hata: 'Sunucu hatası oluştu' });
    }
  }

  // Bot üzerinden kayıt (WP/TG bot çağırır)
  async botKayit(req, res) {
    try {
      const { isletmeAdi, email, sifre, telefon, kayitKanal, referans_kodu, davet } = req.body;
      if (!isletmeAdi || !email || !sifre) {
        return res.status(400).json({ hata: 'İşletme adı, email ve şifre zorunlu' });
      }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email)) || String(email).length > 150) {
        return res.status(400).json({ hata: 'Geçerli bir e-posta yazın' });
      }
      if (String(sifre).length < 8 || String(sifre).length > 72) {
        return res.status(400).json({ hata: 'Şifre en az 8 karakter olmalı' });
      }
      if (String(isletmeAdi).trim().length < 2 || String(isletmeAdi).length > 100) {
        return res.status(400).json({ hata: 'İşletme adını kontrol edin' });
      }

      // Davet kodu yazıldıysa geçerli olmalı (yanlış yazılan kod sessizce kaybolmasın)
      const yazilanDavet = String(davet || referans_kodu || '').trim();
      if (yazilanDavet && !(await require('../utils/davet').kodGecerli(yazilanDavet))) {
        return res.status(400).json({ hata: 'Davet kodu bulunamadı. Kontrol edin ya da boş bırakın.' });
      }

      // Email kontrolü
      const mevcutKullanici = (await pool.query('SELECT id FROM admin_kullanicilar WHERE email = $1', [email])).rows[0];
      if (mevcutKullanici) {
        return res.status(400).json({ hata: 'Bu email zaten kayıtlı. Giriş yapmayı deneyin.' });
      }

      // İşletme oluştur
      const isletme = (await pool.query(
        `INSERT INTO isletmeler (isim, telefon, kategori, aktif, paket, olusturma_tarihi, deneme_bitis_tarihi) 
         VALUES ($1, $2, 'genel', true, 'baslangic', NOW(), NOW() + make_interval(days => $3)) RETURNING *`,
        [isletmeAdi, telefon || '', DENEME_GUN]
      )).rows[0];

      // Admin kullanıcı oluştur
      const hashSifre = await bcrypt.hash(sifre, 10);
      const kullanici = (await pool.query(
        `INSERT INTO admin_kullanicilar (isim, email, sifre, rol, isletme_id, aktif) 
         VALUES ($1, $2, $3, 'admin', $4, true) RETURNING *`,
        [isletmeAdi, email, hashSifre, isletme.id]
      )).rows[0];

      // Davet/referans kodu varsa yalnız bağla — ödül davet edilen ilk ödemesini yapınca (suistimal koruması)
      let referansMesaj = '';
      const davetKod = davet || referans_kodu;
      const { davetUygula, KANALLAR } = require('../utils/davet');
      if (davetKod) {
        try {
          const sahip = await davetUygula(davetKod, isletme.id);
          if (sahip) {
            referansMesaj = ` (Davet: ${String(davetKod).toUpperCase()} kaydedildi — ödül ilk ödeme sonrası)`;
            console.log(`🤝 Davet kaydedildi: yeni #${isletme.id}, davet eden #${sahip}`);
          }
        } catch(e) { console.error('Davet uygulama hatası:', e.message); }
      }
      // Kayıt kanalı (Büyüme ekranı): randevu sayfasından mı, davet linkinden mi, düz web mi
      const kanal = KANALLAR.includes(kayitKanal) ? kayitKanal : null;
      if (kanal) {
        try { await pool.query('UPDATE isletmeler SET kayit_kanali = $1 WHERE id = $2', [davetKod && kanal === 'web' ? 'davet' : kanal, isletme.id]); } catch (e) { /* kolon yoksa */ }
      }

      console.log(`✅ Bot kayıt: ${isletmeAdi} (${email}) - kanal: ${kayitKanal || 'bilinmiyor'} - isletme_id: ${isletme.id}${referansMesaj}`);

      // Süper admin panele canlı yayın + push
      try {
        socketServer.emitToAdmin('isletme:yeni', { isletme, kanal: kayitKanal || 'web' });
        pushService.sendToAdmin({
          title: '🎉 Yeni İşletme Kaydı',
          body: `${isletmeAdi} — ${email}${kayitKanal ? ` (${kayitKanal})` : ''}`,
          url: '/',
          tag: `isletme-${isletme.id}`,
        });
      } catch (e) {}

      res.json({ 
        basarili: true, 
        isletme_id: isletme.id, 
        kullanici_id: kullanici.id,
        mesaj: `${isletmeAdi} başarıyla oluşturuldu!${referansMesaj}` 
      });
    } catch (error) {
      console.error('❌ Bot kayıt hatası:', error.message);
      res.status(500).json({ hata: 'Kayıt sırasında bir hata oluştu' });
    }
  }

  async profilim(req, res) {
    try {
      const kullanici = (await pool.query(
        'SELECT ak.id, ak.isim, ak.email, ak.rol, ak.isletme_id, ak.aktif, ak.olusturma_tarihi, i.isim as isletme_isim FROM admin_kullanicilar ak LEFT JOIN isletmeler i ON ak.isletme_id = i.id WHERE ak.id = $1',
        [req.kullanici.id]
      )).rows[0];
      if (kullanici && kullanici.rol === 'superadmin') {
        kullanici.ekip_gorev = req.kullanici.ekip_gorev || null;
        kullanici.ekip_yetkileri = req.kullanici.ekip_yetkileri || null;
      }
      res.json({ kullanici });
    } catch (error) {
      res.status(500).json({ hata: error.message });
    }
  }
}

module.exports = new AuthController();
