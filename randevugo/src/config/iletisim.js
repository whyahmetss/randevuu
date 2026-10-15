// Destek/satış iletişim bilgileri tek yerden (2026-10-13: eski sanal numara ban yedi).
// 2026-10-15: Platform Ayarları'ndan değişir; DESTEK_WP env yalnız varsayılan. Boş numara → WhatsApp butonları gizlenir.
const ayar = () => require('../utils/platformAyar');
module.exports = {
  get DESTEK_WP() { return ayar().al('destek_whatsapp') || null; },
  get DESTEK_EPOSTA() { return ayar().al('destek_eposta'); },
};
