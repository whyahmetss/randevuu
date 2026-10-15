// Ücretsiz deneme süresi — tek doğru kaynak (kullanıcı kararı 2026-10-07: 14 gün).
// 2026-10-15: Platform Ayarları'ndan değişir (utils/platformAyar → deneme_gun); DENEME_GUN env yalnız varsayılan.
// Değer her çağrıda okunur: modül yüklenirken sabitlenmesin diye fonksiyon.
const denemeGun = () => require('../utils/platformAyar').al('deneme_gun');

module.exports = { denemeGun };
