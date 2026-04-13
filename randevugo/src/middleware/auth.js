const jwt = require('jsonwebtoken');
const pool = require('../config/db');

const authMiddleware = async (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1] || req.query.token;
  if (!token) return res.status(401).json({ hata: 'Token bulunamadı' });

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'randevugo-default-secret-key-2024');
    req.kullanici = decoded;

    // Pasif işletme kontrolü (SuperAdmin hariç)
    if (decoded.rol !== 'superadmin' && decoded.isletme_id) {
      try {
        const isletme = (await pool.query('SELECT aktif FROM isletmeler WHERE id = $1', [decoded.isletme_id])).rows[0];
        if (isletme && !isletme.aktif) {
          return res.status(403).json({ hata: 'İşletme pasif', mesaj: 'İşletmeniz pasif durumda. Lütfen destek ile iletişime geçin.', pasif: true });
        }
      } catch (e) { /* DB hatası durumunda engelleme */ }
    }

    next();
  } catch (err) {
    return res.status(401).json({ hata: 'Geçersiz token' });
  }
};

const superAdminMiddleware = (req, res, next) => {
  if (req.kullanici.rol !== 'superadmin') {
    return res.status(403).json({ hata: 'Bu işlem için yetkiniz yok' });
  }
  next();
};

const odemeKontrol = async (req, res, next) => {
  try {
    if (req.kullanici.rol === 'superadmin') return next();

    const isletmeId = req.kullanici.isletme_id;
    if (!isletmeId) return next();

    // İşletme oluşturulma tarihini kontrol et — ilk 7 gün ücretsiz
    const isletme = (await pool.query('SELECT olusturma_tarihi FROM isletmeler WHERE id = $1', [isletmeId])).rows[0];
    if (isletme) {
      const olusturma = new Date(isletme.olusturma_tarihi);
      olusturma.setHours(0, 0, 0, 0);
      const simdi = new Date();
      simdi.setHours(0, 0, 0, 0);
      const gunFark = Math.round((simdi - olusturma) / (1000 * 60 * 60 * 24));
      if (gunFark < 7) return next(); // İlk 7 gün deneme süresi (gün 0-6)
    }

    const buAy = new Date().toISOString().slice(0, 7);
    const odeme = (await pool.query(
      "SELECT durum FROM odemeler WHERE isletme_id = $1 AND donem = $2 ORDER BY olusturma_tarihi DESC LIMIT 1",
      [isletmeId, buAy]
    )).rows[0];

    if (odeme && odeme.durum === 'odendi') return next();

    return res.status(402).json({
      hata: 'Ödeme gerekli',
      mesaj: 'Bu ay için ödemeniz bulunmamaktadır. Paneli kullanmaya devam etmek için lütfen ödeme yapın.',
      odeme_durumu: odeme?.durum || 'yok'
    });
  } catch (err) {
    console.error('❌ Ödeme kontrol hatası:', err.message);
    next(); // Hata durumunda engelleme
  }
};

module.exports = { authMiddleware, superAdminMiddleware, odemeKontrol };
