-- Dinamik Süre Bloklama + Tampon Süre
ALTER TABLE hizmetler ADD COLUMN IF NOT EXISTS tampon_dk INTEGER DEFAULT 0;
ALTER TABLE isletmeler ADD COLUMN IF NOT EXISTS varsayilan_tampon_dk INTEGER DEFAULT 5;
ALTER TABLE isletmeler ADD COLUMN IF NOT EXISTS slot_aralik_dk INTEGER DEFAULT 30;
