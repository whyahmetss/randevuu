-- Venüs kişisel demo sayfaları (kullanıcı kararı 2026-10-08)
ALTER TABLE isletmeler ADD COLUMN IF NOT EXISTS demo BOOLEAN DEFAULT false;
ALTER TABLE isletmeler ADD COLUMN IF NOT EXISTS demo_lead_id INTEGER;
ALTER TABLE isletmeler ADD COLUMN IF NOT EXISTS demo_goruntulenme INTEGER DEFAULT 0;
ALTER TABLE isletmeler ADD COLUMN IF NOT EXISTS demo_son_goruntulenme TIMESTAMP;
ALTER TABLE potansiyel_musteriler ADD COLUMN IF NOT EXISTS demo_isletme_id INTEGER;
