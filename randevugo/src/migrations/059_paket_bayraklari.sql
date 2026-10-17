-- Paket Yönetimi'nden tüm özellikler (kullanıcı kararı 2026-10-17): Mağaza, Kasa, Sadakat, Kapora… önceden yalnız
-- koddaydı, panelde 4 kutu vardı. NULL = koddaki varsayılan (config/paketler.js); panelden değiştirilince yazılır.
DO $$ BEGIN
  IF to_regclass('paket_tanimlari') IS NULL THEN RETURN; END IF;
  ALTER TABLE paket_tanimlari ADD COLUMN IF NOT EXISTS kasa BOOLEAN;
  ALTER TABLE paket_tanimlari ADD COLUMN IF NOT EXISTS prim BOOLEAN;
  ALTER TABLE paket_tanimlari ADD COLUMN IF NOT EXISTS magaza BOOLEAN;
  ALTER TABLE paket_tanimlari ADD COLUMN IF NOT EXISTS sadakat BOOLEAN;
  ALTER TABLE paket_tanimlari ADD COLUMN IF NOT EXISTS winback BOOLEAN;
  ALTER TABLE paket_tanimlari ADD COLUMN IF NOT EXISTS yorum_avcisi BOOLEAN;
  ALTER TABLE paket_tanimlari ADD COLUMN IF NOT EXISTS gece_raporu BOOLEAN;
  ALTER TABLE paket_tanimlari ADD COLUMN IF NOT EXISTS sms_hatirlatma BOOLEAN;
  ALTER TABLE paket_tanimlari ADD COLUMN IF NOT EXISTS kapora BOOLEAN;
  ALTER TABLE paket_tanimlari ADD COLUMN IF NOT EXISTS telegram BOOLEAN;
  ALTER TABLE paket_tanimlari ADD COLUMN IF NOT EXISTS dogum_gunu BOOLEAN;
  ALTER TABLE paket_tanimlari ADD COLUMN IF NOT EXISTS oncelikli_destek BOOLEAN;
  ALTER TABLE paket_tanimlari ADD COLUMN IF NOT EXISTS api_erisimi BOOLEAN;
  ALTER TABLE paket_tanimlari ADD COLUMN IF NOT EXISTS sube_yonetimi BOOLEAN;
  ALTER TABLE paket_tanimlari ADD COLUMN IF NOT EXISTS coklu_dil INT;
  ALTER TABLE paket_tanimlari ADD COLUMN IF NOT EXISTS sube_limit INT;
END $$;
