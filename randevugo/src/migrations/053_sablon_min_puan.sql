-- Şablon puan filtresi (2026-10-16): övgü içeren şablon ("yorumlar on numara") yalnız Google puanı yüksek dükkâna gider.
ALTER TABLE satis_bot_sablonlar ADD COLUMN IF NOT EXISTS min_puan NUMERIC(2,1);
UPDATE satis_bot_sablonlar SET min_puan = 4.5
WHERE min_puan IS NULL AND (mesaj ILIKE '%on numara%' OR mesaj ILIKE '%yorumlar%' OR mesaj ILIKE '%yorumların%');
