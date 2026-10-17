-- Bayi / toptancı ağı (kullanıcı kararı 2026-10-17): berber malzemecisi, kuaför toptancısı gibi her gün dükkân
-- dolaşanlar SıraGO kartını bırakır. Kartta bayi kodu (B12) vardır; esnaf okutup kayıt olursa işletme o bayiye yazılır.
-- Bayi şifresiz, kendine özel linkten (admin/bayi/<token>) kartını, getirdiği dükkânları ve kazancını görür.
CREATE TABLE IF NOT EXISTS bayiler (
  id SERIAL PRIMARY KEY,
  isim TEXT NOT NULL,
  firma TEXT,
  telefon TEXT,
  komisyon_yuzde NUMERIC(5,2) NOT NULL DEFAULT 20,   -- getirdiği işletmenin her ödemesinden pay
  ilk_odeme_tl NUMERIC(10,2) NOT NULL DEFAULT 0,      -- işletme ilk kez ödeyince tek seferlik prim
  token TEXT UNIQUE NOT NULL,
  aktif BOOLEAN NOT NULL DEFAULT true,
  notu TEXT,
  olusturma_tarihi TIMESTAMP DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS bayi_odemeleri (
  id SERIAL PRIMARY KEY,
  bayi_id INT NOT NULL REFERENCES bayiler(id) ON DELETE CASCADE,
  tutar NUMERIC(10,2) NOT NULL,
  notu TEXT,
  tarih TIMESTAMP DEFAULT NOW()
);
ALTER TABLE isletmeler ADD COLUMN IF NOT EXISTS bayi_id INT;
ALTER TABLE satis_konusmalar ADD COLUMN IF NOT EXISTS bayi_id INT;
CREATE INDEX IF NOT EXISTS isletmeler_bayi_idx ON isletmeler (bayi_id) WHERE bayi_id IS NOT NULL;
