-- Otomatik Gece Raporu
ALTER TABLE isletmeler ADD COLUMN IF NOT EXISTS gece_raporu_aktif BOOLEAN DEFAULT false;
ALTER TABLE isletmeler ADD COLUMN IF NOT EXISTS gece_raporu_saat VARCHAR(5) DEFAULT '22:00';
ALTER TABLE isletmeler ADD COLUMN IF NOT EXISTS gece_raporu_kanal VARCHAR(20) DEFAULT 'whatsapp';
ALTER TABLE isletmeler ADD COLUMN IF NOT EXISTS gece_raporu_telefon VARCHAR(20);

CREATE TABLE IF NOT EXISTS gece_rapor_log (
  id SERIAL PRIMARY KEY,
  isletme_id INTEGER NOT NULL REFERENCES isletmeler(id) ON DELETE CASCADE,
  tarih DATE DEFAULT CURRENT_DATE,
  kanal VARCHAR(20) DEFAULT 'whatsapp',
  rapor_icerik TEXT,
  durum VARCHAR(20) DEFAULT 'gonderildi',
  gonderim_tarihi TIMESTAMP DEFAULT NOW()
);
