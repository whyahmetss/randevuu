-- Çok kişilik randevu (2026-10-22): müşteri "2 kişiyiz" / "oğlumla geleceğim" derse bot kaç kişilik randevu açacağını hatırlar
ALTER TABLE bot_durum ADD COLUMN IF NOT EXISTS kisi_sayisi SMALLINT;
