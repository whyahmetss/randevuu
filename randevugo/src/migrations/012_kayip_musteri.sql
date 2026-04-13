-- Kayıp Müşteri Kurtarma (Win-back)
ALTER TABLE isletmeler ADD COLUMN IF NOT EXISTS winback_aktif BOOLEAN DEFAULT false;
ALTER TABLE isletmeler ADD COLUMN IF NOT EXISTS winback_gun_esik INTEGER DEFAULT 45;
ALTER TABLE isletmeler ADD COLUMN IF NOT EXISTS winback_indirim INTEGER DEFAULT 10;
ALTER TABLE isletmeler ADD COLUMN IF NOT EXISTS winback_mesaj_sablonu TEXT;

CREATE TABLE IF NOT EXISTS winback_log (
  id SERIAL PRIMARY KEY,
  isletme_id INTEGER NOT NULL REFERENCES isletmeler(id) ON DELETE CASCADE,
  musteri_id INTEGER REFERENCES musteriler(id) ON DELETE SET NULL,
  telefon VARCHAR(20),
  son_randevu_tarihi DATE,
  gun_sayisi INTEGER,
  durum VARCHAR(20) DEFAULT 'gonderildi',
  kurtarildi BOOLEAN DEFAULT false,
  kurtarma_tarihi TIMESTAMP,
  gonderim_tarihi TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_winback_isletme ON winback_log(isletme_id, musteri_id);
