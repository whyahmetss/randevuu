-- Tek kişi düzeni (2026-10-16): bot sıcak adayı kişiye devreder (Satış Masası → "Bot sana devretti")
ALTER TABLE satis_konusmalar ADD COLUMN IF NOT EXISTS devir_sebep VARCHAR(20);      -- arama | sicak | fiyat | demo | olumlu
ALTER TABLE satis_konusmalar ADD COLUMN IF NOT EXISTS devir_zamani TIMESTAMP;
ALTER TABLE satis_konusmalar ADD COLUMN IF NOT EXISTS devir_kapandi TIMESTAMP;
ALTER TABLE satis_konusmalar ADD COLUMN IF NOT EXISTS devir_ertele TIMESTAMP;        -- "ulaşamadım" → birkaç saat sonra yine listede
CREATE INDEX IF NOT EXISTS idx_satis_konusma_devir ON satis_konusmalar (devir_zamani) WHERE devir_sebep IS NOT NULL AND devir_kapandi IS NULL;
