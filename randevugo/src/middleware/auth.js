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

    // Deneme süresi kontrolü — deneme_bitis_tarihi'ne bak
    const isletme = (await pool.query('SELECT deneme_bitis_tarihi, paket_bitis_tarihi FROM isletmeler WHERE id = $1', [isletmeId])).rows[0];
    if (isletme) {
      // Deneme süresi devam ediyorsa geç
      if (isletme.deneme_bitis_tarihi && new Date(isletme.deneme_bitis_tarihi) > new Date()) return next();
      // Paket bitiş tarihi varsa ve hâlâ geçerliyse geç
      if (isletme.paket_bitis_tarihi && new Date(isletme.paket_bitis_tarihi) > new Date()) return next();
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
