-- Kasa Hareketleri tablosu
CREATE TABLE IF NOT EXISTS kasa_hareketleri (
  id SERIAL PRIMARY KEY,
  isletme_id INTEGER NOT NULL REFERENCES isletmeler(id) ON DELETE CASCADE,
  tip VARCHAR(10) NOT NULL CHECK (tip IN ('gelir', 'gider')),
  tutar DECIMAL(10,2) NOT NULL,
  aciklama VARCHAR(300),
  kategori VARCHAR(50) DEFAULT 'diger',
  odeme_yontemi VARCHAR(30) DEFAULT 'nakit',
  randevu_id INTEGER REFERENCES randevular(id) ON DELETE SET NULL,
  tarih DATE DEFAULT CURRENT_DATE,
  olusturan_id INTEGER,
  olusturma_tarihi TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_kasa_isletme_tarih ON kasa_hareketleri(isletme_id, tarih);
