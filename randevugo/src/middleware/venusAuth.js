// Venüs (kullanıcının kişisel asistanı) için ayrı, dar yetkili anahtar.
// Süper admin JWT'si kullanılmaz: anahtar yalnızca /api/venus/v1 altındaki okuma uçlarını açar.
const crypto = require('crypto');

function venusAuth(req, res, next) {
  const beklenen = process.env.VENUS_API_ANAHTAR;
  // Anahtar tanımlı değilse (ya da çok kısaysa) uç hiç yokmuş gibi davran
  if (!beklenen || beklenen.length < 32) return res.status(404).json({ hata: 'Bulunamadı' });
  const gelen = String(req.headers['x-venus-anahtar'] || '');
  // Uzunluk sızdırmamak için özetleri karşılaştır
  const a = crypto.createHash('sha256').update(gelen).digest();
  const b = crypto.createHash('sha256').update(beklenen).digest();
  if (!gelen || !crypto.timingSafeEqual(a, b)) return res.status(401).json({ hata: 'Yetkisiz' });
  next();
}

module.exports = { venusAuth };
