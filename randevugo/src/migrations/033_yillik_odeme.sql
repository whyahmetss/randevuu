-- Yıllık ödeme (kullanıcı kararı 2026-10-14): 12 ay kullan, 9 ay öde. Shopier ödemesi başlatılırken seçilen süre.
ALTER TABLE isletmeler ADD COLUMN IF NOT EXISTS bekleyen_sure VARCHAR(5);
