-- Esnaf daveti + kayıt kanalı + Öncü Esnaf (kullanıcı kararı 2026-10-09)
ALTER TABLE isletmeler ADD COLUMN IF NOT EXISTS kayit_kanali VARCHAR(30);
ALTER TABLE isletmeler ADD COLUMN IF NOT EXISTS oncu_no INTEGER;
ALTER TABLE isletmeler ADD COLUMN IF NOT EXISTS kilitli_paket VARCHAR(30);
ALTER TABLE isletmeler ADD COLUMN IF NOT EXISTS kilitli_fiyat NUMERIC(10,2);
CREATE UNIQUE INDEX IF NOT EXISTS idx_isletmeler_oncu_no ON isletmeler(oncu_no) WHERE oncu_no IS NOT NULL;
