-- Kayıtta Kullanım Şartları + KVKK onayı (2026-10-14): onay tarihi saklanır (ispat için).
ALTER TABLE admin_kullanicilar ADD COLUMN IF NOT EXISTS sartlar_onay_tarihi TIMESTAMPTZ;
