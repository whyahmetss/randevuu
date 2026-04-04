const pool = require('../config/db');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

class AuthController {
  async giris(req, res) {
    try {
      const { email, sifre } = req.body;
      const kullanici = (await pool.query('SELECT * FROM admin_kullanicilar WHERE email = $1 AND aktif = true', [email])).rows[0];
      
      if (!kullanici || !(await bcrypt.compare(sifre, kullanici.sifre))) {
        return res.status(401).json({ hata: 'Email veya şifre hatalı' });
      }

      const jwtSecret = process.env.JWT_SECRET || 'randevugo-default-secret-key-2024';
      const token = jwt.sign(
        { id: kullanici.id, email: kullanici.email, rol: kullanici.rol, isletme_id: kullanici.isletme_id },
        jwtSecret,
        { expiresIn: '7d' }
      );

      res.json({ token, kullanici: { id: kullanici.id, isim: kullanici.isim, email: kullanici.email, rol: kullanici.rol, isletme_id: kullanici.isletme_id } });
    } catch (error) {
      console.error('❌ Giriş hatası:', error.message, error.stack);
      res.status(500).json({ hata: error.message });
    }
  }

  // Bot üzerinden kayıt (WP/TG bot çağırır)
  async botKayit(req, res) {
    try {
      const { isletmeAdi, email, sifre, telefon, kayitKanal } = req.body;
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
        `INSERT INTO isletmeler (isim, telefon, aktif, paket, olusturma_tarihi) 
         VALUES ($1, $2, true, 'baslangic', NOW()) RETURNING *`,
        [isletmeAdi, telefon || null]
      )).rows[0];

      // Admin kullanıcı oluştur
      const hashSifre = await bcrypt.hash(sifre, 10);
      const kullanici = (await pool.query(
        `INSERT INTO admin_kullanicilar (isim, email, sifre, rol, isletme_id, aktif) 
         VALUES ($1, $2, $3, 'admin', $4, true) RETURNING *`,
        [isletmeAdi, email, hashSifre, isletme.id]
      )).rows[0];

      console.log(`✅ Bot kayıt: ${isletmeAdi} (${email}) - kanal: ${kayitKanal || 'bilinmiyor'} - isletme_id: ${isletme.id}`);

      res.json({ 
        basarili: true, 
        isletme_id: isletme.id, 
        kullanici_id: kullanici.id,
        mesaj: `${isletmeAdi} başarıyla oluşturuldu!` 
      });
    } catch (error) {
      console.error('❌ Bot kayıt hatası:', error.message);
      res.status(500).json({ hata: error.message });
    }
  }

  async profilim(req, res) {
    try {
      const kullanici = (await pool.query(
        'SELECT ak.*, i.isim as isletme_isim FROM admin_kullanicilar ak LEFT JOIN isletmeler i ON ak.isletme_id = i.id WHERE ak.id = $1',
        [req.kullanici.id]
      )).rows[0];
      res.json({ kullanici });
    } catch (error) {
      res.status(500).json({ hata: error.message });
    }
  }
}

module.exports = new AuthController();
