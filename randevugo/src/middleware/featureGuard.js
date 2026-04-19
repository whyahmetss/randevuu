const pool = require('../config/db');
const { paketGetir } = require('../config/paketler');

/**
 * Feature Guard Middleware Factory
 * Belirli bir özelliğin (kasa, sadakat, winback vb.) mevcut pakette
 * aktif olup olmadığını kontrol eder.
 * 
 * Kullanım: router.get('/kasa', authMiddleware, featureGuard('kasa'), handler)
 * 
 * @param {string} featureKey - paketler.js'deki flag adı (kasa, sadakat, winback, prim, yorum_avcisi, gece_raporu, sms_hatirlatma, api_erisimi, coklu_dil)
 * @param {string} [ozelIsim] - Kullanıcıya gösterilecek özellik adı (opsiyonel)
 */
function featureGuard(featureKey, ozelIsim) {
  const OZELLIK_ISIMLERI = {
    kasa: 'Kasa Takibi',
    prim: 'Prim Raporu',
    sadakat: 'Sadakat Puan Sistemi',
    winback: 'Kayıp Müşteri Kurtarma',
    yorum_avcisi: 'Yorum Avcısı',
    gece_raporu: 'Gece Raporu',
    sms_hatirlatma: 'SMS Hatırlatma',
    oncelikli_destek: 'Öncelikli Destek',
    api_erisimi: 'API Erişimi',
    coklu_dil: 'Çoklu Dil Desteği',
    export_aktif: 'Excel Dışa Aktarma',
    istatistik: 'Gelişmiş İstatistik',
    sube_yonetimi: 'Çok Şubeli Yönetim',
  };

  const isim = ozelIsim || OZELLIK_ISIMLERI[featureKey] || featureKey;

  return async (req, res, next) => {
    try {
      // Superadmin her şeye erişebilir
      if (req.kullanici?.rol === 'superadmin') return next();

      // Grup sahibi için: grubun ilk şubesinin paketini kontrol et (grubun paketi = sahibin paketi)
      let isletmeId = req.kullanici?.aktif_isletme_id || req.kullanici?.isletme_id;
      if (!isletmeId && req.kullanici?.grup_id) {
        const sube = (await pool.query('SELECT id FROM isletmeler WHERE grup_id=$1 LIMIT 1', [req.kullanici.grup_id])).rows[0];
        isletmeId = sube?.id;
      }
      if (!isletmeId) return next();

      const isletme = (await pool.query('SELECT paket FROM isletmeler WHERE id=$1', [isletmeId])).rows[0];
      const paket = await paketGetir(isletme?.paket);

      if (!paket[featureKey]) {
        return res.status(403).json({
          hata: `${isim} özelliği ${paket.isim} paketinde kullanılamıyor. Paketinizi yükseltin!`,
          limit_asimi: true,
          gereken_paket: featureKey === 'sms_hatirlatma' || featureKey === 'api_erisimi' || featureKey === 'oncelikli_destek' ? 'kurumsal' : 'profesyonel',
          ozellik: featureKey
        });
      }

      // Paket bilgisini req'e ekle (controller'lar kullanabilsin)
      req.paketBilgi = paket;
      next();
    } catch (err) {
      console.error(`❌ Feature guard hatası (${featureKey}):`, err.message);
      next(); // Hata durumunda engelleme
    }
  };
}

module.exports = featureGuard;
