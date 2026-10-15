-- Sahaya hazırlık (2026-10-15): sahada hesap açma, şifre işlemleri, WhatsApp'ta otomatik kurulum (otopilot),
-- satışçı kodlu QR kart, ilk randevu tebriği ve doğru anda davet isteği.

-- Yeni hesaplarda mesai dışı = "Normal Çalış": bot gece de randevu alır ("7/24 randevu" sözü tutulsun).
-- Yalnız varsayılan değişir; mevcut işletmelerin ayarına dokunulmaz.
ALTER TABLE isletmeler ALTER COLUMN mesai_disi_mod SET DEFAULT 'randevu_ver';

-- Geçici şifreyle açılan/sıfırlanan hesap: ilk girişte şifre değiştirilmeden panel açılmaz
ALTER TABLE admin_kullanicilar ADD COLUMN IF NOT EXISTS sifre_degistirmeli BOOLEAN NOT NULL DEFAULT false;

-- Otopilot kurulum adımı (services/otopilot.js) ve QR karttan gelen satışçı ("kart: S12" → kullanıcı 12)
ALTER TABLE satis_konusmalar ADD COLUMN IF NOT EXISTS kurulum_durum JSONB;
ALTER TABLE satis_konusmalar ADD COLUMN IF NOT EXISTS ref_kullanici_id INT;

-- Esnaf teşviki (services/esnafTesvik.js): her mesaj işletme başına bir kez gider
ALTER TABLE isletmeler ADD COLUMN IF NOT EXISTS ilk_randevu_tebrik TIMESTAMP;
ALTER TABLE isletmeler ADD COLUMN IF NOT EXISTS referans_tesvik TIMESTAMP;

-- Bir numara yalnız bir sisteme bağlanır (Satış Bot ≠ Merkez OTP): reddedilen/çıkarılan bağlantının sebebi panelde görünür
DO $$ BEGIN
  IF to_regclass('merkez_otp_bot') IS NOT NULL THEN ALTER TABLE merkez_otp_bot ADD COLUMN IF NOT EXISTS uyari TEXT; END IF;
END $$;
