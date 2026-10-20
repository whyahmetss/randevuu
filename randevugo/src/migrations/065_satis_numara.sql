-- Satış sohbeti hangi Satış Bot numarasından başladı (2026-10-20): takip mesajı aynı numaradan gider,
-- başka numaradan "size yazmıştım" gitmez
ALTER TABLE satis_konusmalar ADD COLUMN IF NOT EXISTS numara_id INT;
