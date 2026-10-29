-- Randevu sayfası tasarımları (kullanıcı kararı 2026-10-29): süper admin video/görsel arka planlı tasarımlar ekler,
-- fiyatını girer (tek seferlik; 0 = ücretsiz), işletmeye hediye eder. İşletme sahip olduğu tasarımı sayfasında kullanır.
CREATE TABLE IF NOT EXISTS sayfa_tasarimlari (
  id SERIAL PRIMARY KEY,
  isim VARCHAR(60) NOT NULL,
  aciklama VARCHAR(200),
  fiyat NUMERIC(10,2) NOT NULL DEFAULT 0,
  aktif BOOLEAN NOT NULL DEFAULT true,
  sira INTEGER NOT NULL DEFAULT 0,
  stil JSONB NOT NULL DEFAULT '{}',           -- { mod, vurgu, karartma, yazi, buton, kart }
  olusturma TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  guncelleme TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
-- Medya ayrı: liste sorguları büyük veri taşımasın. tur: arka (video ya da görsel) | poster (videonun ilk karesi)
CREATE TABLE IF NOT EXISTS sayfa_tasarim_medya (
  tasarim_id INTEGER NOT NULL REFERENCES sayfa_tasarimlari(id) ON DELETE CASCADE,
  tur VARCHAR(10) NOT NULL,
  mime VARCHAR(40) NOT NULL,
  veri BYTEA NOT NULL,
  guncelleme TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (tasarim_id, tur)
);
CREATE TABLE IF NOT EXISTS isletme_tasarimlari (
  isletme_id INTEGER NOT NULL REFERENCES isletmeler(id) ON DELETE CASCADE,
  tasarim_id INTEGER NOT NULL REFERENCES sayfa_tasarimlari(id) ON DELETE CASCADE,
  kaynak VARCHAR(12) NOT NULL DEFAULT 'hediye',   -- hediye | satin
  tarih TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (isletme_id, tasarim_id)
);
ALTER TABLE isletmeler ADD COLUMN IF NOT EXISTS sayfa_tasarim_id INTEGER REFERENCES sayfa_tasarimlari(id) ON DELETE SET NULL;
-- Tasarım satışı (Faz 3): esnaf ücretli tasarımı Shopier'den tek seferlik alır. Ürün başlığında SRGO-T<satış no>
-- (paket ödemesinin SRGO-<işletme> eşleşmesine düşmesin). Ödeme gelince tasarım işletmenin olur ve sayfasında açılır.
CREATE TABLE IF NOT EXISTS tasarim_satislari (
  id SERIAL PRIMARY KEY,
  isletme_id INTEGER NOT NULL REFERENCES isletmeler(id) ON DELETE CASCADE,
  tasarim_id INTEGER REFERENCES sayfa_tasarimlari(id) ON DELETE SET NULL,
  tasarim_isim VARCHAR(60),                       -- tasarım silinse de satış kaydı okunur kalsın
  tutar NUMERIC(10,2) NOT NULL,
  durum VARCHAR(12) NOT NULL DEFAULT 'bekliyor',  -- bekliyor | odendi
  shopier_urun_id VARCHAR(40),
  shopier_siparis_id VARCHAR(40),
  olusturma TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  odeme_tarihi TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS tasarim_satislari_urun ON tasarim_satislari (shopier_urun_id);
