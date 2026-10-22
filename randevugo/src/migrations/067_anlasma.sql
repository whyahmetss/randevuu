-- Anlaşmalı hesap (2026-10-22, Elit Barber: video reklam karşılığı ücretsiz): ödeme kaydı olmadan, bitiş tarihine kadar
-- ücretsiz kullanım. Esnaf panelinde ödeme/uzatma kartı görünmez; gelir raporlarına hiçbir şey yazılmaz.
ALTER TABLE isletmeler ADD COLUMN IF NOT EXISTS anlasma_bitis TIMESTAMP;
ALTER TABLE isletmeler ADD COLUMN IF NOT EXISTS anlasma_notu TEXT;
