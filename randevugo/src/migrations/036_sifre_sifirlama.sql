-- Şifremi unuttum (2026-10-14): işletmenin WhatsApp'ına giden 6 haneli kod (hash'li), 15 dk geçerli, 5 deneme.
CREATE TABLE IF NOT EXISTS sifre_sifirlama (
  kullanici_id INTEGER PRIMARY KEY,
  kod_hash TEXT NOT NULL,
  son_gecerlilik TIMESTAMPTZ NOT NULL,
  deneme INTEGER NOT NULL DEFAULT 0,
  olusturma TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
