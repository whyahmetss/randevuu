-- 2026-10-26: Resmî tatil kapanışı, acil durum, personel girişi, KVKK silme talebi.

-- 1) Resmî tatiller: kapalı tutulan tatil türleri (config/tatiller.js anahtarları). NULL = varsayılan (bayramların 1. günü)
ALTER TABLE isletmeler ADD COLUMN IF NOT EXISTS tatil_kapali JSONB;

-- 2) Acil durum: çalışan ya da bütün dükkân bir süre randevu almaz. Kapalı aralıklar takvim_bloklari'na yazılır,
--    acil durum bitirilince o bloklar silinir. ozet: aktarılan/iptal edilen randevular (panelde gösterilir).
CREATE TABLE IF NOT EXISTS acil_durumlar (
  id SERIAL PRIMARY KEY,
  isletme_id INTEGER NOT NULL REFERENCES isletmeler(id) ON DELETE CASCADE,
  calisan_id INTEGER,
  baslangic_tarih DATE NOT NULL,
  bitis_tarih DATE NOT NULL,
  olusturan_id INTEGER,
  aktif BOOLEAN NOT NULL DEFAULT true,
  ozet JSONB,
  olusturma TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  bitirildi TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS acil_durumlar_isletme ON acil_durumlar (isletme_id, aktif);
ALTER TABLE takvim_bloklari ADD COLUMN IF NOT EXISTS acil_durum_id INTEGER;

-- 3) Personel girişi: çalışan kendi telefonundan yalnız kendi randevularını görür (rol = 'personel')
ALTER TABLE admin_kullanicilar ADD COLUMN IF NOT EXISTS calisan_id INTEGER;
CREATE TABLE IF NOT EXISTS personel_davetleri (
  id SERIAL PRIMARY KEY,
  isletme_id INTEGER NOT NULL REFERENCES isletmeler(id) ON DELETE CASCADE,
  calisan_id INTEGER NOT NULL,
  token_hash VARCHAR(64) NOT NULL UNIQUE,
  son_gecerlilik TIMESTAMPTZ NOT NULL,
  kullanildi TIMESTAMPTZ,
  olusturma TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4) KVKK: müşterinin "verilerimi silin" talebi. Telefon saklanmaz (özet), yalnız iz kaydı.
CREATE TABLE IF NOT EXISTS kvkk_silme_talepleri (
  id SERIAL PRIMARY KEY,
  isletme_id INTEGER,
  telefon_ozet VARCHAR(64) NOT NULL,
  durum VARCHAR(20) NOT NULL,
  detay JSONB,
  olusturma TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
