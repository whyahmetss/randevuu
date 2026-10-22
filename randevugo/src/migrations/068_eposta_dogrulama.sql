-- E-posta doğrulama (2026-10-22): web kaydında e-postaya giden 6 haneli kod (hash'li), 15 dk geçerli, 5 deneme.
-- Kod doğrulanmadan hesap açılmaz. Google ile kayıtta e-postayı Google doğrular.
CREATE TABLE IF NOT EXISTS eposta_dogrulama (
  email TEXT PRIMARY KEY,
  kod_hash TEXT NOT NULL,
  son_gecerlilik TIMESTAMPTZ NOT NULL,
  deneme INTEGER NOT NULL DEFAULT 0,
  olusturma TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE admin_kullanicilar ADD COLUMN IF NOT EXISTS eposta_dogrulandi BOOLEAN NOT NULL DEFAULT false;
