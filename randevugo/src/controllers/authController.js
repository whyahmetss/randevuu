const pool = require('../config/db');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const socketServer = require('../services/socketServer');
const pushService = require('../services/pushService');
const jwtSecret = process.env.JWT_SECRET || 'randevugo-default-secret-key-2024';

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
          [kullanici.isletme_id, kullanici.id, kullanici.email, req.ip]
        );
      } catch(e) { /* audit log opsiyonel */ }

      res.json({ token, kullanici: { id: kullanici.id, isim: kullanici.isim, email: kullanici.email, rol: kullanici.rol, isletme_id: kullanici.isletme_id, grup_id: kullanici.grup_id || null } });
    } catch (error) {
      console.error('❌ Giriş hatası:', error.message, error.stack);
      res.status(500).json({ hata: 'Sunucu hatası oluştu' });
    }
  }

  // Bot üzerinden kayıt (WP/TG bot çağırır)
  async botKayit(req, res) {
    try {
      const { isletmeAdi, email, sifre, telefon, kayitKanal, referans_kodu } = req.body;
      if (!isletmeAdi || !email || !sifre) {
        return res.status(400).json({ hata: 'İşletme adı, email ve şifre zorunlu' });
      }

      // Email kontrolü
      const mevcutKullanici = (await pool.query('SELECT id FROM admin_kullanicilar WHERE email = $1', [email])).rows[0];
      if (mevcutKullanici) {
        return res.status(400).json({ hata: 'Bu email zaten kayıtlı. Giriş yapmayı deneyin.' });
      }

      // İşletme oluştur
      const isletme = (await pool.query(
        `INSERT INTO isletmeler (isim, telefon, kategori, aktif, paket, olusturma_tarihi, deneme_bitis_tarihi) 
         VALUES ($1, $2, 'genel', true, 'baslangic', NOW(), NOW() + INTERVAL '7 days') RETURNING *`,
        [isletmeAdi, telefon || '']
      )).rows[0];

      // Admin kullanıcı oluştur
      const hashSifre = await bcrypt.hash(sifre, 10);
      const kullanici = (await pool.query(
        `INSERT INTO admin_kullanicilar (isim, email, sifre, rol, isletme_id, aktif) 
         VALUES ($1, $2, $3, 'admin', $4, true) RETURNING *`,
        [isletmeAdi, email, hashSifre, isletme.id]
      )).rows[0];

      // Referans kodu varsa sadece kaydet — ödül ilk ödeme anında verilecek (suistimal koruması)
      let referansMesaj = '';
      if (referans_kodu) {
        try {
          const ref = (await pool.query("SELECT * FROM referanslar WHERE referans_kodu = $1", [referans_kodu.toUpperCase()])).rows[0];
          if (ref) {
            await pool.query("UPDATE referanslar SET toplam_davet = toplam_davet + 1 WHERE id = $1", [ref.id]);
            await pool.query("UPDATE isletmeler SET referans_ile_gelen = $1 WHERE id = $2", [ref.sahip_isletme_id, isletme.id]);
            referansMesaj = ` (Referans: ${referans_kodu} kaydedildi — ödül ilk ödeme sonrası verilecek)`;
            console.log(`🤝 Referans kaydedildi (ödül beklemede): ${referans_kodu}, yeni: ${isletme.id}, sahip: ${ref.sahip_isletme_id}`);
          }
        } catch(e) { console.error('Referans uygulama hatası:', e.message); }
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
      res.json({ kullanici });
    } catch (error) {
      res.status(500).json({ hata: error.message });
    }
  }
}

module.exports = new AuthController();
