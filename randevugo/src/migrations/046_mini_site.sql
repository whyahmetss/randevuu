-- Randevu sayfası → mini web sitesi (kullanıcı kararı 2026-10-14): galeri, ekip kartları, hakkımızda, Instagram.
-- Fotoğraflar ayrı tablolarda (038 gibi): isletmeler/calisanlar'ı "SELECT *" ile okuyan yerler büyük veri taşımasın.
ALTER TABLE isletmeler ADD COLUMN IF NOT EXISTS sayfa_hakkimizda TEXT;
ALTER TABLE isletmeler ADD COLUMN IF NOT EXISTS sayfa_instagram VARCHAR(40);
ALTER TABLE calisanlar ADD COLUMN IF NOT EXISTS uzmanlik VARCHAR(80);

CREATE TABLE IF NOT EXISTS sayfa_galeri (
  id SERIAL PRIMARY KEY,
  isletme_id INTEGER NOT NULL REFERENCES isletmeler(id) ON DELETE CASCADE,
  veri TEXT NOT NULL,                  -- data:image/...;base64,...
  aciklama VARCHAR(120),
  sira INTEGER NOT NULL DEFAULT 0,
  olusturma TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS sayfa_galeri_isletme ON sayfa_galeri (isletme_id, sira, id);

-- Çalışan fotoğrafı (ekip kartı). Çalışan silinince controller temizler; işletmeyle birlikte silinir.
CREATE TABLE IF NOT EXISTS calisan_gorselleri (
  calisan_id INTEGER PRIMARY KEY,
  isletme_id INTEGER NOT NULL REFERENCES isletmeler(id) ON DELETE CASCADE,
  veri TEXT NOT NULL,
  guncelleme TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
