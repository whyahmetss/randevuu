const pool = require('./db');

// Hardcoded fallback — DB'de paket_tanimlari boşsa kullanılır
const FALLBACK_PAKETLER = {
  baslangic: {
    isim: 'Başlangıç',
    fiyat: 299,
    calisan_limit: 2,
    hizmet_limit: 10,
    aylik_randevu_limit: 500,
    bot_aktif: true,
    hatirlatma: true,
    istatistik: false,
    export_aktif: false,
    // ─── Özellik flag'leri ───
    coklu_dil: false,       // ×
    kasa: false,             // ×
    prim: false,             // ×
    sadakat: false,          // ×
    winback: false,          // × Kayıp Müşteri
    yorum_avcisi: false,     // ×
    gece_raporu: false,      // ×
    sms_hatirlatma: false,   // ×
    oncelikli_destek: false, // ×
    api_erisimi: false,      // ×
    ozellikler: [
      '2 çalışan',
      '500 randevu / ay',
      'WhatsApp Bot',
      'Otomatik Hatırlatma',
      'Temel Analitik',
    ]
  },
  profesyonel: {
    isim: 'Profesyonel',
    fiyat: 699,
    calisan_limit: 5,
    hizmet_limit: 50,
    aylik_randevu_limit: 99999,
    bot_aktif: true,
    hatirlatma: true,
    istatistik: true,
    export_aktif: true,
    // ─── Özellik flag'leri ───
    coklu_dil: 3,            // ✓ (3 dil)
    kasa: true,              // ✓
    prim: true,              // ✓
    sadakat: true,           // ✓
    winback: true,           // ✓ Kayıp Müşteri
    yorum_avcisi: true,      // ✓
    gece_raporu: true,       // ✓
    sms_hatirlatma: false,   // ×
    oncelikli_destek: false, // ×
    api_erisimi: false,      // ×
    ozellikler: [
      '5 çalışan',
      'Sınırsız randevu',
      'Kasa Takibi & Prim Raporu',
      'Sadakat Puan Sistemi',
      'Kayıp Müşteri Kurtarma',
      'Yorum Avcısı',
      'Gece Raporu',
      '3 Dil Desteği',
    ]
  },
  kurumsal: {
    isim: 'Kurumsal',
    fiyat: 1499,
    calisan_limit: 999,
    hizmet_limit: 999,
    aylik_randevu_limit: 99999,
    bot_aktif: true,
    hatirlatma: true,
    istatistik: true,
    export_aktif: true,
    // ─── Özellik flag'leri ───
    coklu_dil: 99,           // ✓ (12+ dil)
    kasa: true,              // ✓
    prim: true,              // ✓
    sadakat: true,           // ✓
    winback: true,           // ✓
    yorum_avcisi: true,      // ✓
    gece_raporu: true,       // ✓
    sms_hatirlatma: true,    // ✓
    oncelikli_destek: true,  // ✓
    api_erisimi: true,       // ✓
    sube_yonetimi: true,     // ✓ Çok şubeli işletme yönetimi
    sube_limit: 999,
    ozellikler: [
      'Sınırsız çalışan',
      'Sınırsız randevu',
      'Çok Şubeli Yönetim',
      'Merkezi Müşteri & Sadakat',
      'Konsolide Raporlar',
      'SMS Hatırlatma',
      'Öncelikli Destek',
      'API Erişimi',
      'Özel Eğitim & Onboarding',
      'Tüm Profesyonel Özellikler',
    ]
  },
  // Geriye uyumluluk — eski 'premium' kodlu işletmeler için alias
  premium: {
    isim: 'Kurumsal',
    fiyat: 1499,
    calisan_limit: 999,
    hizmet_limit: 999,
    aylik_randevu_limit: 99999,
    bot_aktif: true,
    hatirlatma: true,
    istatistik: true,
    export_aktif: true,
    coklu_dil: 99, kasa: true, prim: true, sadakat: true, winback: true,
    yorum_avcisi: true, gece_raporu: true, sms_hatirlatma: true,
    oncelikli_destek: true, api_erisimi: true, sube_yonetimi: true, sube_limit: 999,
    ozellikler: [
      'Sınırsız çalışan',
      'Sınırsız randevu',
      'SMS Hatırlatma',
      'Öncelikli Destek',
      'API Erişimi',
      'Özel Eğitim & Onboarding',
      'Tüm Profesyonel Özellikler',
    ]
  }
};

// Cache — 5 dk boyunca DB'den tekrar sormaz
let _cache = null;
let _cacheTime = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5 dakika

/**
 * DB'deki paket_tanimlari tablosundan tüm aktif paketleri çeker.
 * Sonuç { kod: { isim, fiyat, calisan_limit, ... } } formatında döner.
 * DB boşsa veya hata olursa FALLBACK_PAKETLER kullanılır.
 */
async function paketleriYukle() {
  const now = Date.now();
  if (_cache && (now - _cacheTime) < CACHE_TTL) return _cache;

  try {
    const result = await pool.query("SELECT * FROM paket_tanimlari WHERE aktif = true ORDER BY sira, id");
    if (result.rows.length > 0) {
      const map = {};
      for (const row of result.rows) {
        const fallback = FALLBACK_PAKETLER[row.kod] || {};
        map[row.kod] = {
          isim: row.isim,
          fiyat: parseFloat(row.fiyat) || 0,
          calisan_limit: row.calisan_limit || 1,
          hizmet_limit: row.hizmet_limit || 5,
          aylik_randevu_limit: row.aylik_randevu_limit || 100,
          bot_aktif: row.bot_aktif !== false,
          hatirlatma: !!row.hatirlatma,
          istatistik: !!row.istatistik,
          export_aktif: !!row.export_aktif,
          coklu_dil: row.coklu_dil !== undefined ? row.coklu_dil : (fallback.coklu_dil || false),
          kasa: row.kasa !== undefined ? !!row.kasa : (fallback.kasa || false),
          prim: row.prim !== undefined ? !!row.prim : (fallback.prim || false),
          sadakat: row.sadakat !== undefined ? !!row.sadakat : (fallback.sadakat || false),
          winback: row.winback !== undefined ? !!row.winback : (fallback.winback || false),
          yorum_avcisi: row.yorum_avcisi !== undefined ? !!row.yorum_avcisi : (fallback.yorum_avcisi || false),
          gece_raporu: row.gece_raporu !== undefined ? !!row.gece_raporu : (fallback.gece_raporu || false),
          sms_hatirlatma: row.sms_hatirlatma !== undefined ? !!row.sms_hatirlatma : (fallback.sms_hatirlatma || false),
          oncelikli_destek: row.oncelikli_destek !== undefined ? !!row.oncelikli_destek : (fallback.oncelikli_destek || false),
          api_erisimi: row.api_erisimi !== undefined ? !!row.api_erisimi : (fallback.api_erisimi || false),
          sube_yonetimi: row.sube_yonetimi !== undefined ? !!row.sube_yonetimi : (fallback.sube_yonetimi || false),
          sube_limit: row.sube_limit !== undefined ? row.sube_limit : (fallback.sube_limit || 1),
          ozellikler: row.ozellikler ? row.ozellikler.split('\n').filter(Boolean) : [],
        };
      }
      _cache = map;
      _cacheTime = now;
      return map;
    }
  } catch (e) {
    // Tablo yoksa veya DB hatası — fallback kullan
  }
  _cache = FALLBACK_PAKETLER;
  _cacheTime = now;
  return FALLBACK_PAKETLER;
}

/**
 * Belirli bir işletmenin paket bilgisini döndürür.
 * @param {string} paketKodu - isletmeler.paket kolonundaki değer (ör: 'baslangic')
 * @returns {object} Paket limitleri ve özellikleri
 */
async function paketGetir(paketKodu) {
  const paketler = await paketleriYukle();
  return paketler[paketKodu] || paketler['baslangic'] || FALLBACK_PAKETLER.baslangic;
}

/**
 * Cache'i temizle (paket güncelleme/ekleme sonrası çağrılmalı)
 */
function paketCacheTemizle() {
  _cache = null;
  _cacheTime = 0;
}

// Geriye uyumluluk — eski PAKETLER[kod] kullanımları için senkron erişim (sadece fallback)
module.exports = FALLBACK_PAKETLER;
module.exports.FALLBACK_PAKETLER = FALLBACK_PAKETLER;
module.exports.paketGetir = paketGetir;
module.exports.paketleriYukle = paketleriYukle;
module.exports.paketCacheTemizle = paketCacheTemizle;
