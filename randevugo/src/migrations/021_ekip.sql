-- Ekip: süper admin hesapları görev ve yetki alanına bölünür. ekip_yetkileri NULL = kurucu (tam yetki),
-- yani mevcut süper admin hesapları hiçbir şey kaybetmez.
ALTER TABLE admin_kullanicilar ADD COLUMN IF NOT EXISTS ekip_gorev VARCHAR(30);
ALTER TABLE admin_kullanicilar ADD COLUMN IF NOT EXISTS ekip_yetkileri TEXT[];
ALTER TABLE admin_kullanicilar ADD COLUMN IF NOT EXISTS son_giris TIMESTAMP;
