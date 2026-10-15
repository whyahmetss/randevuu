-- Platform yönetimi (2026-10-15): işi etkileyen değerler koddan panele taşınır.
-- Platform Ayarları, Sistem Uyarıları, bot mesaj şablonları, özellik anahtarları ve kuponlar.

-- Platform Ayarları: anahtar → değer (boş anahtar = koddaki varsayılan; utils/platformAyar.js)
CREATE TABLE IF NOT EXISTS platform_ayarlari (
  anahtar VARCHAR(60) PRIMARY KEY,
  deger TEXT,
  guncelleme TIMESTAMP DEFAULT NOW(),
  guncelleyen TEXT
);

-- Sistem Uyarıları: aynı sorun açıkken tekrar olursa yeni satır açılmaz, adet artar (utils/sistemUyari.js)
CREATE TABLE IF NOT EXISTS sistem_uyarilari (
  id SERIAL PRIMARY KEY,
  anahtar VARCHAR(200) NOT NULL,
  tip VARCHAR(40) NOT NULL,
  seviye VARCHAR(10) NOT NULL DEFAULT 'uyari',
  isletme_id INT,
  baslik TEXT NOT NULL,
  detay TEXT,
  adet INT NOT NULL DEFAULT 1,
  ilk_zaman TIMESTAMP NOT NULL DEFAULT NOW(),
  son_zaman TIMESTAMP NOT NULL DEFAULT NOW(),
  cozuldu BOOLEAN NOT NULL DEFAULT false,
  cozulme_zamani TIMESTAMP,
  cozen TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_sistem_uyari_acik ON sistem_uyarilari (anahtar) WHERE cozuldu = false;
CREATE INDEX IF NOT EXISTS idx_sistem_uyari_son ON sistem_uyarilari (cozuldu, son_zaman DESC);

-- Bot mesaj şablonları: utils/botMesajlar.js'deki metnin yerine geçer ({param} yer tutucularıyla)
CREATE TABLE IF NOT EXISTS bot_mesaj_sablonlari (
  anahtar VARCHAR(60) NOT NULL,
  dil VARCHAR(5) NOT NULL DEFAULT 'tr',
  metin TEXT NOT NULL,
  guncelleme TIMESTAMP DEFAULT NOW(),
  PRIMARY KEY (anahtar, dil)
);

-- Özellik anahtarları: yeni özellik önce seçili işletmelerde açılır (utils/ozellik.js)
CREATE TABLE IF NOT EXISTS ozellik_anahtarlari (
  kod VARCHAR(60) PRIMARY KEY,
  aciklama TEXT,
  durum VARCHAR(10) NOT NULL DEFAULT 'kapali',   -- kapali | herkes | secili
  isletme_idler INT[] NOT NULL DEFAULT '{}',
  guncelleme TIMESTAMP DEFAULT NOW()
);

-- Kuponlar: ödeme başlatılırken uygulanır; kullanım ödeme gerçekleşince sayılır (services/kupon.js)
CREATE TABLE IF NOT EXISTS kuponlar (
  id SERIAL PRIMARY KEY,
  kod VARCHAR(40) NOT NULL UNIQUE,
  aciklama TEXT,
  indirim_yuzde INT,
  indirim_tl NUMERIC,
  paketler TEXT[],                 -- NULL = tüm paketler
  son_tarih DATE,
  max_kullanim INT,                -- NULL = sınırsız
  kullanim INT NOT NULL DEFAULT 0,
  aktif BOOLEAN NOT NULL DEFAULT true,
  olusturma TIMESTAMP DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS kupon_kullanimlari (
  id SERIAL PRIMARY KEY,
  kupon_id INT NOT NULL,
  isletme_id INT NOT NULL,
  tutar_once NUMERIC,
  tutar_sonra NUMERIC,
  zaman TIMESTAMP DEFAULT NOW(),
  UNIQUE (kupon_id, isletme_id)
);
ALTER TABLE isletmeler ADD COLUMN IF NOT EXISTS bekleyen_kupon_id INT;
ALTER TABLE odemeler ADD COLUMN IF NOT EXISTS kupon_kodu VARCHAR(40);
