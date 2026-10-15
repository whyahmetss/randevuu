// Geçici şifre (2026-10-15): telefonda okunup kolayca yazılsın diye karışan harf/rakam yok (0/o, 1/l/ı/i).
// "kmtr-4829" biçimi: ~650 milyon olasılık; ilk girişte değiştirilmesi zorunlu (admin_kullanicilar.sifre_degistirmeli).
const crypto = require('crypto');

const HARF = 'abcdefghjkmnprstuvyz';
const RAKAM = '23456789';
const sec = (kume, n) => Array.from({ length: n }, () => kume[crypto.randomInt(0, kume.length)]).join('');

const geciciSifreUret = () => `${sec(HARF, 4)}-${sec(RAKAM, 4)}`;

module.exports = { geciciSifreUret };
