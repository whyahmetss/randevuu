const jwt = require('jsonwebtoken');
const pool = require('../config/db');

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) console.warn('⚠️ CRITICAL: JWT_SECRET env variable tanımlı değil! Varsayılan secret kullanılıyor. Production ortamında mutlaka güçlü bir secret ayarlayın.');
const jwtSecret = JWT_SECRET || 'randevugo-default-secret-key-2024';

const authMiddleware = async (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1] || req.query.token;
  if (!token) return res.status(401).json({ hata: 'Token bulunamadı' });

  try {
    const decoded = jwt.verify(token, jwtSecret);
    req.kullanici = decoded;

    // JWT eski olabilir — admin_kullanicilar'dan fresh rol + grup_id çek
    // (özellikle grup kurma sonrası: rol 'admin' → 'grup_sahibi' güncellenmiş olur)
    if (decoded.rol !== 'superadmin' && decoded.id) {
      try {
        const k = (await pool.query('SELECT rol, grup_id FROM admin_kullanicilar WHERE id=$1', [decoded.id])).rows[0];
        if (k) {
          if (k.rol) req.kullanici.rol = k.rol;
          if (k.grup_id) req.kullanici.grup_id = k.grup_id;
        }
      } catch (e) { /* ignore — JWT değerleri kullanılmaya devam eder */ }
    }

    // Grup sahibi ise aktif şube header'ı işle
    if (req.kullanici.rol === 'grup_sahibi' && req.kullanici.grup_id) {
      const aktifHeader = req.headers['x-aktif-isletme'];
      if (aktifHeader) {
        const aktifId = parseInt(aktifHeader, 10);
        if (!isNaN(aktifId)) {
          // Spoof koruması: seçilen şube gerçekten bu gruba ait mi?
          try {
            const sube = (await pool.query('SELECT id, aktif, grup_id FROM isletmeler WHERE id = $1', [aktifId])).rows[0];
            if (sube && sube.grup_id === req.kullanici.grup_id) {
              req.kullanici.aktif_isletme_id = sube.id;
              req.kullanici.isletme_id = sube.id; // backward compat
            }
          } catch (e) { /* ignore */ }
        }
      }
    }

    // Pasif işletme kontrolü + grup_id backfill (SuperAdmin hariç)
    const kontrolId = req.kullanici.aktif_isletme_id || decoded.isletme_id;
    if (decoded.rol !== 'superadmin' && kontrolId) {
      try {
        const isletme = (await pool.query('SELECT aktif, grup_id FROM isletmeler WHERE id = $1', [kontrolId])).rows[0];
        if (isletme && !isletme.aktif) {
          return res.status(403).json({ hata: 'İşletme pasif', mesaj: 'İşletmeniz pasif durumda. Lütfen destek ile iletişime geçin.', pasif: true });
        }
        // JWT eski olabilir — grup_id'yi DB'den fresh al
        if (isletme && isletme.grup_id && !req.kullanici.grup_id) {
          req.kullanici.grup_id = isletme.grup_id;
        }
      } catch (e) { /* DB hatası durumunda engelleme */ }
    }

    next();
  } catch (err) {
    return res.status(401).json({ hata: 'Geçersiz token' });
  }
};

// Kapsam helper: Controllerlar bu fonksiyonu kullansın (eski req.kullanici.isletme_id yerine)
const getIsletmeId = (req) => req.kullanici?.aktif_isletme_id || req.kullanici?.isletme_id || null;
const getGrupId = (req) => req.kullanici?.grup_id || null;

// Rol tabanlı erişim helper: rolKontrol('grup_sahibi', 'superadmin')
const rolKontrol = (...izinliRoller) => (req, res, next) => {
  if (!req.kullanici || !izinliRoller.includes(req.kullanici.rol)) {
    return res.status(403).json({ hata: 'Bu işlem için yetkiniz yok' });
  }
  next();
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

    // Deneme süresi ve paket bitiş kontrolü
    const isletme = (await pool.query('SELECT deneme_bitis_tarihi, paket_bitis_tarihi, grup_id FROM isletmeler WHERE id = $1', [isletmeId])).rows[0];
    if (isletme) {
      const now = new Date();
      // Deneme süresi devam ediyorsa geç
      if (isletme.deneme_bitis_tarihi && new Date(isletme.deneme_bitis_tarihi) > now) return next();
      // Paket bitiş tarihi varsa ve hâlâ geçerliyse geç
      if (isletme.paket_bitis_tarihi && new Date(isletme.paket_bitis_tarihi) > now) return next();

      // Grup şubesi: merkez şubenin (ID'si en küçük olan) ödemesine bak
      if (isletme.grup_id) {
        const merkez = (await pool.query(
          `SELECT deneme_bitis_tarihi, paket_bitis_tarihi
             FROM isletmeler WHERE grup_id=$1 ORDER BY id LIMIT 1`,
          [isletme.grup_id]
        )).rows[0];
        if (merkez) {
          if (merkez.deneme_bitis_tarihi && new Date(merkez.deneme_bitis_tarihi) > now) return next();
          if (merkez.paket_bitis_tarihi && new Date(merkez.paket_bitis_tarihi) > now) return next();
        }
      }
    }

    const buAy = new Date().toISOString().slice(0, 7);
    let odeme = (await pool.query(
      "SELECT durum FROM odemeler WHERE isletme_id = $1 AND donem = $2 ORDER BY olusturma_tarihi DESC LIMIT 1",
      [isletmeId, buAy]
    )).rows[0];

    // Grup şubesi: kendi ödemesi yoksa merkez ödemesine bak
    if (!odeme && isletme?.grup_id) {
      const merkez = (await pool.query(
        'SELECT id FROM isletmeler WHERE grup_id=$1 ORDER BY id LIMIT 1', [isletme.grup_id]
      )).rows[0];
      if (merkez && merkez.id !== isletmeId) {
        odeme = (await pool.query(
          "SELECT durum FROM odemeler WHERE isletme_id = $1 AND donem = $2 ORDER BY olusturma_tarihi DESC LIMIT 1",
          [merkez.id, buAy]
        )).rows[0];
      }
    }

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

module.exports = { authMiddleware, superAdminMiddleware, odemeKontrol, jwtSecret, getIsletmeId, getGrupId, rolKontrol };
