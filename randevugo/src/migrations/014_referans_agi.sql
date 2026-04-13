-- Referans Ağı (Arkadaşını Getir)
ALTER TABLE isletmeler ADD COLUMN IF NOT EXISTS referans_aktif BOOLEAN DEFAULT false;
ALTER TABLE isletmeler ADD COLUMN IF NOT EXISTS referans_puan_davet INTEGER DEFAULT 200;
ALTER TABLE isletmeler ADD COLUMN IF NOT EXISTS referans_puan_davetli INTEGER DEFAULT 100;

ALTER TABLE musteriler ADD COLUMN IF NOT EXISTS referans_kodu VARCHAR(10);
ALTER TABLE musteriler ADD COLUMN IF NOT EXISTS referans_ile_gelen BOOLEAN DEFAULT false;
ALTER TABLE musteriler ADD COLUMN IF NOT EXISTS davet_eden_id INTEGER REFERENCES musteriler(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS referans_log (
  id SERIAL PRIMARY KEY,
  isletme_id INTEGER NOT NULL REFERENCES isletmeler(id) ON DELETE CASCADE,
  davet_eden_id INTEGER REFERENCES musteriler(id) ON DELETE SET NULL,
  davetli_id INTEGER REFERENCES musteriler(id) ON DELETE SET NULL,
  davetli_telefon VARCHAR(20),
  referans_kodu VARCHAR(10),
  durum VARCHAR(20) DEFAULT 'bekliyor',
  puan_verildi BOOLEAN DEFAULT false,
  tarih TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_referans_isletme ON referans_log(isletme_id);
CREATE INDEX IF NOT EXISTS idx_referans_kod ON referans_log(referans_kodu);
