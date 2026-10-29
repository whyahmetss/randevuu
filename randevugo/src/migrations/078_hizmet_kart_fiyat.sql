-- Kart fiyatı (2026-10-29): nakit ve kartla fiyatı farklı dükkânlar. fiyat = nakit (ana) fiyat; kart_fiyat yalnız gösterilir.
ALTER TABLE hizmetler ADD COLUMN IF NOT EXISTS kart_fiyat NUMERIC;
