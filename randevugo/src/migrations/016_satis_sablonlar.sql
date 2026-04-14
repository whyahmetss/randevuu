-- Satış Bot Mesaj Şablonları
CREATE TABLE IF NOT EXISTS satis_bot_sablonlar (
  id SERIAL PRIMARY KEY,
  isim VARCHAR(100) NOT NULL,
  mesaj TEXT NOT NULL,
  kategori VARCHAR(50) DEFAULT 'genel',
  aktif BOOLEAN DEFAULT true,
  gonderim_modu VARCHAR(20) DEFAULT 'rastgele',
  gonderilen INTEGER DEFAULT 0,
  cevap_gelen INTEGER DEFAULT 0,
  olumlu INTEGER DEFAULT 0,
  olumsuz INTEGER DEFAULT 0,
  olusturma_tarihi TIMESTAMP DEFAULT (NOW() AT TIME ZONE 'Europe/Istanbul')
);

-- satis_konusmalar tablosuna sablon_id kolonu
ALTER TABLE satis_konusmalar ADD COLUMN IF NOT EXISTS sablon_id INTEGER;
