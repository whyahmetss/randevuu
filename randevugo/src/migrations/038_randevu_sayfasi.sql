-- Randevu sayfası özelleştirme (kullanıcı kararı 2026-10-14): hazır tema + vurgu rengi, kısa tanıtım, kapak ve logo.
-- Görseller ayrı tabloda: isletmeler'i "SELECT *" ile okuyan yerler büyük veri taşımasın.
ALTER TABLE isletmeler ADD COLUMN IF NOT EXISTS sayfa_tema VARCHAR(20) DEFAULT 'sade';
ALTER TABLE isletmeler ADD COLUMN IF NOT EXISTS sayfa_vurgu VARCHAR(9);
ALTER TABLE isletmeler ADD COLUMN IF NOT EXISTS sayfa_tanitim TEXT;
ALTER TABLE isletmeler ADD COLUMN IF NOT EXISTS sayfa_guncelleme TIMESTAMPTZ;
CREATE TABLE IF NOT EXISTS isletme_gorselleri (
  isletme_id INTEGER NOT NULL REFERENCES isletmeler(id) ON DELETE CASCADE,
  tur VARCHAR(10) NOT NULL,            -- kapak | logo
  veri TEXT NOT NULL,                  -- data:image/...;base64,...
  guncelleme TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (isletme_id, tur)
);
