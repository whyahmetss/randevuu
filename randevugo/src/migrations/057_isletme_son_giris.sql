-- Esnaf panele girdi mi (kullanıcı kararı 2026-10-17): İşletmeler listesinde son giriş / son görülme.
-- Demo hesaplar (Satış Masası "Demo hazırla", Instagram'dan yaz) gerçek kayıtla karışmasın diye listede ayrı gösterilir.
ALTER TABLE isletmeler ADD COLUMN IF NOT EXISTS son_giris TIMESTAMP;
ALTER TABLE isletmeler ADD COLUMN IF NOT EXISTS son_panel TIMESTAMP;
