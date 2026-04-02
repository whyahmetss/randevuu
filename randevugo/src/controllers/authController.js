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

      const token = jwt.sign(
        { id: kullanici.id, email: kullanici.email, rol: kullanici.rol, isletme_id: kullanici.isletme_id },
        process.env.JWT_SECRET,
        { expiresIn: '7d' }
      );

      res.json({ token, kullanici: { id: kullanici.id, isim: kullanici.isim, email: kullanici.email, rol: kullanici.rol, isletme_id: kullanici.isletme_id } });
    } catch (error) {
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
