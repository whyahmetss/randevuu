-- Zombi Otomatik Aksiyon Tablosu
CREATE TABLE IF NOT EXISTS zombi_aksiyonlar (
  id SERIAL PRIMARY KEY,
  isletme_id INTEGER NOT NULL REFERENCES isletmeler(id) ON DELETE CASCADE,
  aksiyon_tipi VARCHAR(30) NOT NULL,
  mesaj TEXT,
  durum VARCHAR(20) DEFAULT 'bekliyor',
  sonuc TEXT,
  olusturma_tarihi TIMESTAMP DEFAULT (NOW() AT TIME ZONE 'Europe/Istanbul'),
  uygulama_tarihi TIMESTAMP
);

-- Zombi ayarları
ALTER TABLE isletmeler ADD COLUMN IF NOT EXISTS zombi_uyari_gonderildi BOOLEAN DEFAULT false;
ALTER TABLE isletmeler ADD COLUMN IF NOT EXISTS zombi_uyari_tarihi TIMESTAMP;
