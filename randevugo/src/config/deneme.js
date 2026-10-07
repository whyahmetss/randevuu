// Ücretsiz deneme süresi — tek doğru kaynak (kullanıcı kararı 2026-10-07: 14 gün).
// Kayıt (web, WhatsApp, süper admin), satış botu mesajları ve AI talimatı buradan okur.
const DENEME_GUN = Math.max(1, parseInt(process.env.DENEME_GUN) || 14);

module.exports = { DENEME_GUN };
