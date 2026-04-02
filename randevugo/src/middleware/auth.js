const jwt = require('jsonwebtoken');

const authMiddleware = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1] || req.query.token;
  if (!token) return res.status(401).json({ hata: 'Token bulunamadı' });

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'randevugo-default-secret-key-2024');
    req.kullanici = decoded;
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

module.exports = { authMiddleware, superAdminMiddleware };
