-- 018: Yeni özellikler - Hatırlatma zinciri, Haftalık rapor, Rebook, Sıra takibi, Forecasting, No-Show, Müşteri formu, Google Maps Reserve

-- Randevular tablosuna yeni flag'ler
ALTER TABLE randevular ADD COLUMN IF NOT EXISTS onbes_dk_gonderildi BOOLEAN DEFAULT false;
ALTER TABLE randevular ADD COLUMN IF NOT EXISTS rebook_gonderildi BOOLEAN DEFAULT false;
ALTER TABLE randevular ADD COLUMN IF NOT EXISTS form_cevaplari JSONB DEFAULT NULL;

-- İşletmeler tablosuna yeni toggle'lar
ALTER TABLE isletmeler ADD COLUMN IF NOT EXISTS hatirlatma_zinciri_aktif BOOLEAN DEFAULT true;
ALTER TABLE isletmeler ADD COLUMN IF NOT EXISTS haftalik_rapor_aktif BOOLEAN DEFAULT false;
ALTER TABLE isletmeler ADD COLUMN IF NOT EXISTS rebook_aktif BOOLEAN DEFAULT true;
ALTER TABLE isletmeler ADD COLUMN IF NOT EXISTS google_maps_reserve_url TEXT DEFAULT NULL;
ALTER TABLE isletmeler ADD COLUMN IF NOT EXISTS musteri_formu JSONB DEFAULT NULL;

-- Bekleme listesi: cevap_bekleniyor ve son_bildirim zamanı
ALTER TABLE bekleme_listesi ADD COLUMN IF NOT EXISTS bildirim_zamani TIMESTAMPTZ DEFAULT NULL;
ALTER TABLE bekleme_listesi ADD COLUMN IF NOT EXISTS bildirim_sayisi INT DEFAULT 0;
