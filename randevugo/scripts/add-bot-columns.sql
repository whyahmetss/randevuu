-- Bot bağlantı kolonları
ALTER TABLE isletmeler ADD COLUMN IF NOT EXISTS telegram_token VARCHAR(255);
ALTER TABLE isletmeler ADD COLUMN IF NOT EXISTS meta_wa_token VARCHAR(500);
ALTER TABLE isletmeler ADD COLUMN IF NOT EXISTS meta_wa_phone_id VARCHAR(100);
ALTER TABLE isletmeler ADD COLUMN IF NOT EXISTS bot_aktif BOOLEAN DEFAULT false;
