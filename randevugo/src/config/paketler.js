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
    export_aktif: true,      // 2026-10-10: müşteri listesi her pakette dışa aktarılabilir (güven)
    // ─── Özellik flag'leri ───
    coklu_dil: false,       // ×
    kasa: false,             // ×
    magaza: false,          // × Mağaza (ürün önerisi)
    prim: false,             // ×
    sadakat: false,          // ×
    winback: false,          // × Kayıp Müşteri
    yorum_avcisi: false,     // ×
    gece_raporu: false,      // ×
    sms_hatirlatma: false,   // ×
    kapora: false,           // × Kapora / ön ödeme (2026-10-14 paket kuralı: Standart ve üstü)
    telegram: false,         // × Telegram botu (Standart ve üstü)
    dogum_gunu: false,       // × Doğum günü mesajı (Standart ve üstü)
    oncelikli_destek: false, // ×
    api_erisimi: false,      // ×
    ozellikler: [
      '2 çalışan',
      '500 randevu / ay',
      'WhatsApp Bot',
      'Otomatik Hatırlatma',
      'Tablet modu (tezgâh ekranı)',
      'Temel Analitik',
    ]
  },
  profesyonel: {
    isim: 'Standart',
    fiyat: 499,
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
    magaza: true,           // ✓ Mağaza (ürün önerisi)
    prim: true,              // ✓
    sadakat: true,           // ✓
    winback: true,           // ✓ Kayıp Müşteri
    yorum_avcisi: true,      // ✓
    gece_raporu: true,       // ✓
    sms_hatirlatma: false,   // ×
    kapora: true,           // ✓ Kapora / ön ödeme (2026-10-14 paket kuralı: Standart ve üstü)
    telegram: true,         // ✓ Telegram botu (Standart ve üstü)
    dogum_gunu: true,       // ✓ Doğum günü mesajı (Standart ve üstü)
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
      'Kapora / ön ödeme',
      'Telegram botu',
      'Doğum günü mesajı',
      'Bot 3 dilde: Türkçe · İngilizce · Arapça',
    ]
  },
  // Pro+ (kullanıcı kararı 2026-10-08): Standart (499; 2026-10-09'a kadar 699) ile Kurumsal (4999) arası 7 kat sıçrama yerine
  proplus: {
    isim: 'Pro+',
    fiyat: 1499,
    calisan_limit: 10,
    hizmet_limit: 999,
    aylik_randevu_limit: 99999,
    bot_aktif: true,
    hatirlatma: true,
    istatistik: true,
    export_aktif: true,
    coklu_dil: 3,
    kasa: true,
    magaza: true,
    prim: true,
    sadakat: true,
    winback: true,
    yorum_avcisi: true,
    gece_raporu: true,
    sms_hatirlatma: true,    // ✓ (kullanıcı kararı 2026-10-14: SMS Pro+'a indi; kendi NetGSM hesabıyla)
    kapora: true,           // ✓ Kapora / ön ödeme (2026-10-14 paket kuralı: Standart ve üstü)
    telegram: true,         // ✓ Telegram botu (Standart ve üstü)
    dogum_gunu: true,       // ✓ Doğum günü mesajı (Standart ve üstü)
    oncelikli_destek: true,
    api_erisimi: false,
    sube_yonetimi: true,     // ✓ Çoklu şube (3'e kadar)
    sube_limit: 3,
    ozellikler: [
      '10 çalışan',
      'Sınırsız randevu',
      'SMS hatırlatma (kendi NetGSM hesabınla)',
      'Çoklu şube (3 şube)',
      'Kasa Takibi & Prim Raporu',
      'Sadakat, Kayıp Müşteri, Yorum Avcısı',
      'Gece Raporu',
      'Öncelikli Destek',
      'Tüm Standart Özellikler',
    ]
  },
  kurumsal: {
    isim: 'Kurumsal',
    fiyat: 4999,
    calisan_limit: 999,
    hizmet_limit: 999,
    aylik_randevu_limit: 99999,
    bot_aktif: true,
    hatirlatma: true,
    istatistik: true,
    export_aktif: true,
    // ─── Özellik flag'leri ───
    coklu_dil: 3,            // ✓ (TR/EN/AR)
    kasa: true,              // ✓
    magaza: true,           // ✓ Mağaza (ürün önerisi)
    prim: true,              // ✓
    sadakat: true,           // ✓
    winback: true,           // ✓
    yorum_avcisi: true,      // ✓
    gece_raporu: true,       // ✓
    sms_hatirlatma: true,    // ✓
    kapora: true,           // ✓ Kapora / ön ödeme (2026-10-14 paket kuralı: Standart ve üstü)
    telegram: true,         // ✓ Telegram botu (Standart ve üstü)
    dogum_gunu: true,       // ✓ Doğum günü mesajı (Standart ve üstü)
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
      'SMS Hatırlatma (kendi NetGSM hesabınızla)',
      'Öncelikli Destek',
      'API Erişimi',
      'Özel Eğitim & Onboarding',
      'Tüm Pro+ Özellikler',
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
    coklu_dil: 99, kasa: true, magaza: true, prim: true, sadakat: true, winback: true,
    yorum_avcisi: true, gece_raporu: true, sms_hatirlatma: true, kapora: true, telegram: true, dogum_gunu: true,
    oncelikli_destek: true, api_erisimi: true, sube_yonetimi: true, sube_limit: 999,
    ozellikler: [
      'Sınırsız çalışan',
      'Sınırsız randevu',
      'SMS Hatırlatma (kendi NetGSM hesabınızla)',
      'Öncelikli Destek',
      'API Erişimi',
      'Özel Eğitim & Onboarding',
      'Tüm Profesyonel Özellikler',
    ]
  }
};

// Paket Yönetimi'nden açılıp kapanan özellik bayrakları (2026-10-17: hepsi panelden yönetilir; önce yalnız 4 tanesi vardı).
// Veritabanında NULL → koddaki varsayılan (FALLBACK_PAKETLER) geçerli.
const BAYRAKLAR = {
  kasa: 'Kasa takibi', prim: 'Prim raporu', magaza: 'Vitrin (ürün önerisi)', sadakat: 'Sadakat puanı', winback: 'Kayıp müşteri',
  yorum_avcisi: 'Yorum avcısı', gece_raporu: 'Gece raporu', sms_hatirlatma: 'SMS hatırlatma', kapora: 'Kapora / ön ödeme',
  telegram: 'Telegram botu', dogum_gunu: 'Doğum günü mesajı', oncelikli_destek: 'Öncelikli destek', api_erisimi: 'API erişimi',
  sube_yonetimi: 'Şube yönetimi',
};
const SAYILAR = { coklu_dil: 'Bot dil sayısı (0 = yalnız Türkçe)', sube_limit: 'Şube limiti' };

// paket_tanimlari satırı → paket nesnesi (bayrak NULL ise koddaki varsayılan)
function satirdanPaket(row) {
  const fb = FALLBACK_PAKETLER[row.kod] || {};
  const bayrak = (k, vars = false) => (row[k] != null ? !!row[k] : (fb[k] !== undefined ? !!fb[k] : vars));
  const p = {
    isim: row.isim,
    fiyat: parseFloat(row.fiyat) || 0,
    calisan_limit: row.calisan_limit || 1,
    hizmet_limit: row.hizmet_limit || 5,
    aylik_randevu_limit: row.aylik_randevu_limit || 100,
    bot_aktif: row.bot_aktif !== false,
    hatirlatma: !!row.hatirlatma,
    istatistik: !!row.istatistik,
    export_aktif: !!row.export_aktif,
    coklu_dil: row.coklu_dil != null ? row.coklu_dil : (fb.coklu_dil || false),
    sube_limit: row.sube_limit != null ? row.sube_limit : (fb.sube_limit || 1),
    ozellikler: row.ozellikler ? row.ozellikler.split('\n').filter(Boolean) : [],
  };
  // Kapora, Telegram, doğum günü: kodda tanımı olmayan pakette eskisi gibi açık
  for (const k of Object.keys(BAYRAKLAR)) p[k] = bayrak(k, ['kapora', 'telegram', 'dogum_gunu'].includes(k));
  return p;
}

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
      for (const row of result.rows) map[row.kod] = satirdanPaket(row);
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
module.exports.BAYRAKLAR = BAYRAKLAR;
module.exports.SAYILAR = SAYILAR;
module.exports.satirdanPaket = satirdanPaket;
// Yıllık ödeme (2026-10-14): 12 ay kullanım için 9 aylık ücret alınır
module.exports.YILLIK_ODENEN_AY = 9;
