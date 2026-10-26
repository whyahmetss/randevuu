-- Hizmet kategorileri (2026-10-26): 80 hizmetli salonlarda randevu sayfası tek uzun liste olmasın.
-- kategori: serbest metin ("Saç", "Renk", "Tırnak"); boşsa "Diğer" altında. one_cikan: Pro+ ve üstünde sayfanın başında.
ALTER TABLE hizmetler ADD COLUMN IF NOT EXISTS kategori VARCHAR(60);
ALTER TABLE hizmetler ADD COLUMN IF NOT EXISTS one_cikan BOOLEAN NOT NULL DEFAULT false;
-- Paket bayrağı: NULL = koddaki varsayılan (config/paketler.js: Pro+ ve Kurumsal açık)
DO $$ BEGIN
  IF to_regclass('paket_tanimlari') IS NULL THEN RETURN; END IF;
  ALTER TABLE paket_tanimlari ADD COLUMN IF NOT EXISTS zengin_sayfa BOOLEAN;
END $$;
