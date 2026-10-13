-- Aylık kazanç özeti (2026-10-14): ayın 1'inde esnafa kendi WhatsApp'ından özet; istemeyen kapatabilir.
ALTER TABLE isletmeler ADD COLUMN IF NOT EXISTS aylik_ozet_aktif BOOLEAN DEFAULT true;
