// OTP doğrulandıktan sonra verilen kısa ömürlü, imzalı kanıt.
// Eskiden doğrulama yalnız arayüz adımıydı; randevu isteği hiçbir kanıt istemiyordu.
const crypto = require('crypto');
const { jwtSecret } = require('../middleware/auth');

const SURE_MS = 30 * 60 * 1000; // 30 dk içinde randevu tamamlanmalı

function imza(veri) {
  return crypto.createHmac('sha256', jwtSecret).update('otp:' + veri).digest('base64url');
}

function olustur(isletmeId, telefon) {
  const veri = Buffer.from(JSON.stringify({ i: isletmeId, t: telefon, e: Date.now() + SURE_MS })).toString('base64url');
  return `${veri}.${imza(veri)}`;
}

function dogrula(token, isletmeId, telefon) {
  if (!token || typeof token !== 'string' || !token.includes('.')) return false;
  const [veri, sig] = token.split('.');
  const beklenen = imza(veri);
  if (!sig || sig.length !== beklenen.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(beklenen))) return false;
  try {
    const p = JSON.parse(Buffer.from(veri, 'base64url').toString());
    return p.i === isletmeId && p.t === telefon && p.e > Date.now();
  } catch { return false; }
}

module.exports = { olustur, dogrula };
