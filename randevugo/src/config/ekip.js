// Ekip yetkileri — süper admin paneli 4 kişilik ekibe göre bölünür (kullanıcı kararı 2026-10-08).
// Ekip üyesi = rol 'superadmin' + ekip_yetkileri dizisi. ekip_yetkileri NULL → kurucu (tam yetki).
// Sunucu her /admin isteğinde yolYetkisi() ile hangi yetkinin gerektiğine bakar; bilinmeyen yol → 'kurucu'.

const YETKILER = {
  genel: 'Genel bakış (dashboard, bildirimler, aktivite, segmentasyon, karşılaştırma)',
  isletmeler: 'İşletmeler (detay, not, deneme uzatma, işletme olarak giriş), onboarding, zombiler',
  destek: 'Destek talepleri, iletişim mesajları, duyurular',
  satis: 'Satış: Avcı Bot, Satış Bot, Müşteri CRM, referanslar, QR kod',
  odemeler: 'Ödemeler ve hakediş',
  paketler: 'Paket fiyat ve özelliklerini değiştirme',
  magaza: 'Mağaza: tedarikçiler, ürünler, satış raporu',
  sistem: 'Sistem durumu, API dashboard, merkez OTP numaraları',
};

// Görev şablonları (Ekip sayfasında seçilir; sonra tek tek değiştirilebilir)
const GOREVLER = {
  kurucu: { ad: 'Kurucu', yetkiler: null },
  satis: { ad: 'Satış', yetkiler: ['genel', 'satis', 'magaza'] },
  destek: { ad: 'Destek & Kurulum', yetkiler: ['genel', 'isletmeler', 'destek'] },
  finans: { ad: 'Finans & Operasyon', yetkiler: ['genel', 'odemeler', 'paketler', 'magaza', 'sistem'] },
};

// /api/admin/<ilk parça> → yetki
const ONEK = {
  'saas-metrikleri': 'genel', buyume: 'genel', bildirimler: 'genel', 'musteri-aktivite': 'genel', segmentasyon: 'genel', karsilastirma: 'genel',
  isletmeler: 'isletmeler', impersonate: 'isletmeler', zombiler: 'isletmeler', onboarding: 'isletmeler',
  destek: 'destek', iletisim: 'destek', duyurular: 'destek',
  avci: 'satis', 'satis-bot': 'satis', 'musteri-crm': 'satis', referanslar: 'satis', 'qr-kod': 'satis',
  odemeler: 'odemeler', hakedis: 'odemeler',
  paketler: 'paketler',
  magaza: 'magaza',
  'sistem-durumu': 'sistem', 'api-dashboard': 'sistem', 'merkez-otp': 'sistem',
  'audit-log': 'kurucu', ekip: 'kurucu',
};

function yolYetkisi(method, url) {
  const yol = String(url || '').split('?')[0].replace(/^\/api/, '');
  const m = yol.match(/^\/admin\/([^/]+)(\/.*)?$/);
  if (!m) return 'kurucu';
  const [, ilk, kalan = ''] = m;
  // Listeyi herkes okuyabilir (satış "bu işletme zaten müşteri mi" diye bakar); paket fiyatlarını da
  if (method === 'GET' && (ilk === 'isletmeler' || ilk === 'paketler') && (kalan === '' || kalan === '/')) return 'genel';
  // İşletme silmek geri alınamaz: yalnız kurucu
  if (method === 'DELETE' && ilk === 'isletmeler') return 'kurucu';
  return ONEK[ilk] || 'kurucu';
}

const tamYetki = (k) => k?.rol === 'superadmin' && !Array.isArray(k.ekip_yetkileri);
const yetkiVar = (k, yetki) => k?.rol === 'superadmin' && (tamYetki(k) || (yetki !== 'kurucu' && k.ekip_yetkileri.includes(yetki)));

module.exports = { YETKILER, GOREVLER, yolYetkisi, tamYetki, yetkiVar };
