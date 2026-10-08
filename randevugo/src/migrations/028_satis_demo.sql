-- Satış botu kişiye özel demo linkini konuşma başına bir kez gönderir
ALTER TABLE satis_konusmalar ADD COLUMN IF NOT EXISTS demo_gonderildi BOOLEAN DEFAULT false;
