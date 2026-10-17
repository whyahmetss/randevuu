-- SıraGO Vitrini sipariş yönetimi (kullanıcı kararı 2026-10-17): ödeme durumu, kargo firması/takip no, iç not.
ALTER TABLE magaza_siparisler ADD COLUMN IF NOT EXISTS odeme_durumu VARCHAR(20) NOT NULL DEFAULT 'bekliyor';   -- bekliyor | odendi | iade
ALTER TABLE magaza_siparisler ADD COLUMN IF NOT EXISTS kargo_firma TEXT;
ALTER TABLE magaza_siparisler ADD COLUMN IF NOT EXISTS kargo_takip TEXT;
ALTER TABLE magaza_siparisler ADD COLUMN IF NOT EXISTS admin_notu TEXT;
ALTER TABLE magaza_siparisler ADD COLUMN IF NOT EXISTS guncelleme TIMESTAMPTZ DEFAULT NOW();
