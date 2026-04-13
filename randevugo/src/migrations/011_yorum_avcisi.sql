-- Yorum Avcısı: Google Review Botu
ALTER TABLE isletmeler ADD COLUMN IF NOT EXISTS yorum_avcisi_aktif BOOLEAN DEFAULT false;
ALTER TABLE isletmeler ADD COLUMN IF NOT EXISTS google_maps_link VARCHAR(500);
ALTER TABLE isletmeler ADD COLUMN IF NOT EXISTS yorum_gecikme_dk INTEGER DEFAULT 60;
ALTER TABLE isletmeler ADD COLUMN IF NOT EXISTS yorum_mesaj_sablonu TEXT;

CREATE TABLE IF NOT EXISTS yorum_talepleri (
  id SERIAL PRIMARY KEY,
  isletme_id INTEGER NOT NULL REFERENCES isletmeler(id) ON DELETE CASCADE,
  randevu_id INTEGER REFERENCES randevular(id) ON DELETE SET NULL,
  musteri_id INTEGER REFERENCES musteriler(id) ON DELETE SET NULL,
  telefon VARCHAR(20),
  gonderim_zamani TIMESTAMP NOT NULL,
  durum VARCHAR(20) DEFAULT 'bekliyor',
  gonderim_tarihi TIMESTAMP,
  olusturma_tarihi TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_yorum_isletme_durum ON yorum_talepleri(isletme_id, durum);
