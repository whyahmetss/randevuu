-- Sadakat Puan Sistemi
ALTER TABLE isletmeler ADD COLUMN IF NOT EXISTS sadakat_aktif BOOLEAN DEFAULT false;
ALTER TABLE isletmeler ADD COLUMN IF NOT EXISTS puan_oran_tl INTEGER DEFAULT 1;
ALTER TABLE isletmeler ADD COLUMN IF NOT EXISTS puan_oran_puan INTEGER DEFAULT 1;
ALTER TABLE isletmeler ADD COLUMN IF NOT EXISTS odul_esik INTEGER DEFAULT 1000;
ALTER TABLE isletmeler ADD COLUMN IF NOT EXISTS odul_hizmet_id INTEGER;

ALTER TABLE musteriler ADD COLUMN IF NOT EXISTS puan_bakiye INTEGER DEFAULT 0;
ALTER TABLE musteriler ADD COLUMN IF NOT EXISTS toplam_kazanilan_puan INTEGER DEFAULT 0;
ALTER TABLE musteriler ADD COLUMN IF NOT EXISTS toplam_harcanan_puan INTEGER DEFAULT 0;

CREATE TABLE IF NOT EXISTS puan_hareketleri (
  id SERIAL PRIMARY KEY,
  isletme_id INTEGER NOT NULL REFERENCES isletmeler(id) ON DELETE CASCADE,
  musteri_id INTEGER NOT NULL REFERENCES musteriler(id) ON DELETE CASCADE,
  randevu_id INTEGER REFERENCES randevular(id) ON DELETE SET NULL,
  tip VARCHAR(20) NOT NULL,
  puan INTEGER NOT NULL,
  aciklama TEXT,
  tarih TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_puan_musteri ON puan_hareketleri(isletme_id, musteri_id);
