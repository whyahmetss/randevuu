-- Finans & Kapora Yönetimi
-- İşletme kapora ayarları
ALTER TABLE isletmeler ADD COLUMN IF NOT EXISTS kapora_alt_siniri DECIMAL(10,2) DEFAULT 0;
ALTER TABLE isletmeler ADD COLUMN IF NOT EXISTS kapora_orani INTEGER DEFAULT 20;
ALTER TABLE isletmeler ADD COLUMN IF NOT EXISTS kapora_iptal_saati INTEGER DEFAULT 2;

-- Cüzdan tablosu — her işletmenin biriken kapora bakiyesi
CREATE TABLE IF NOT EXISTS cuzdan (
  id SERIAL PRIMARY KEY,
  isletme_id INTEGER REFERENCES isletmeler(id) ON DELETE CASCADE UNIQUE,
  toplam_kapora DECIMAL(10,2) DEFAULT 0,
  sirago_kesinti DECIMAL(10,2) DEFAULT 0,
  mahsup_edilen DECIMAL(10,2) DEFAULT 0,
  cekilen DECIMAL(10,2) DEFAULT 0,
  guncelleme_tarihi TIMESTAMP DEFAULT NOW()
);

-- Hakediş talepleri
CREATE TABLE IF NOT EXISTS hakedis_talepleri (
  id SERIAL PRIMARY KEY,
  isletme_id INTEGER REFERENCES isletmeler(id) ON DELETE CASCADE,
  tutar DECIMAL(10,2) NOT NULL,
  iban VARCHAR(34),
  ad_soyad VARCHAR(200),
  durum VARCHAR(20) DEFAULT 'bekliyor',
  talep_tarihi TIMESTAMP DEFAULT NOW(),
  islem_tarihi TIMESTAMP
);
