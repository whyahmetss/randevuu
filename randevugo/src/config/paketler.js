const pool = require('./db');

// Hardcoded fallback — DB'de paket_tanimlari boşsa kullanılır
const FALLBACK_PAKETLER = {
  baslangic: {
    isim: 'Başlangıç',
    fiyat: 299,
    calisan_limit: 1,
    hizmet_limit: 5,
    aylik_randevu_limit: 100,
    bot_aktif: true,
    hatirlatma: false,
    istatistik: false,
    export_aktif: false,
    ozellikler: [
      '1 çalışan',
      '5 hizmete kadar',
      'Aylık 100 randevu',
      'WhatsApp bot',
    ]
  },
  profesyonel: {
    isim: 'Profesyonel',
    fiyat: 599,
    calisan_limit: 5,
    hizmet_limit: 20,
    aylik_randevu_limit: 500,
    bot_aktif: true,
    hatirlatma: true,
    istatistik: false,
    export_aktif: false,
    ozellikler: [
      '5 çalışana kadar',
      '20 hizmete kadar',
      'Aylık 500 randevu',
      'WhatsApp bot',
      'Randevu hatırlatmaları',
    ]
  },
  premium: {
    isim: 'Premium',
    fiyat: 999,
    calisan_limit: 999,
    hizmet_limit: 999,
    aylik_randevu_limit: 99999,
    bot_aktif: true,
    hatirlatma: true,
    istatistik: true,
    export_aktif: true,
    ozellikler: [
      'Sınırsız çalışan',
      'Sınırsız hizmet',
      'Sınırsız randevu',
      'WhatsApp bot',
      'Randevu hatırlatmaları',
      'Gelişmiş istatistikler',
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
