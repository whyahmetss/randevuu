-- Akıllı Teyit ve Doğrulama Zinciri
-- 1 saat önce teyit mesajı gönderildi mi?
ALTER TABLE randevular ADD COLUMN IF NOT EXISTS teyit_gonderildi BOOLEAN DEFAULT false;
-- Post-randevu memnuniyet anketi gönderildi mi?
ALTER TABLE randevular ADD COLUMN IF NOT EXISTS anket_gonderildi BOOLEAN DEFAULT false;
