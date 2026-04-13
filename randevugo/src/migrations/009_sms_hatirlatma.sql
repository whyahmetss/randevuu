-- SMS Hatırlatma: NetGSM entegrasyonu
ALTER TABLE isletmeler ADD COLUMN IF NOT EXISTS sms_aktif BOOLEAN DEFAULT false;
ALTER TABLE isletmeler ADD COLUMN IF NOT EXISTS netgsm_kullanici_adi VARCHAR(100);
ALTER TABLE isletmeler ADD COLUMN IF NOT EXISTS netgsm_sifre VARCHAR(100);
ALTER TABLE isletmeler ADD COLUMN IF NOT EXISTS netgsm_baslik VARCHAR(20);
ALTER TABLE isletmeler ADD COLUMN IF NOT EXISTS sms_hatirlatma_dk INTEGER DEFAULT 60;
ALTER TABLE isletmeler ADD COLUMN IF NOT EXISTS sms_onay_aktif BOOLEAN DEFAULT false;

CREATE TABLE IF NOT EXISTS sms_log (
  id SERIAL PRIMARY KEY,
  isletme_id INTEGER NOT NULL REFERENCES isletmeler(id) ON DELETE CASCADE,
  telefon VARCHAR(20) NOT NULL,
  mesaj TEXT,
  tip VARCHAR(30) DEFAULT 'hatirlatma',
  durum VARCHAR(20) DEFAULT 'gonderildi',
  netgsm_id VARCHAR(50),
  tarih TIMESTAMP DEFAULT NOW()
);
