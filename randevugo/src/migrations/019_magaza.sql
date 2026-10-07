-- Mağaza pilotu (Model 1: berber önerisiyle ürün satışı)
-- Para, stok, kargo ve iade tedarikçide. SıraGO yalnızca öneri linkini, tıklanmayı
-- ve tedarikçinin aylık raporundan komisyonu tutar. Ödeme/sepet yok.

CREATE TABLE IF NOT EXISTS magaza_tedarikciler (
  id SERIAL PRIMARY KEY,
  isim TEXT NOT NULL,
  site_url TEXT,
  iletisim TEXT,
  berber_komisyon_yuzde NUMERIC(5,2) NOT NULL DEFAULT 20,
  sirago_komisyon_yuzde NUMERIC(5,2) NOT NULL DEFAULT 10,
  aktif BOOLEAN NOT NULL DEFAULT true,
  olusturma TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS magaza_urunler (
  id SERIAL PRIMARY KEY,
  tedarikci_id INT NOT NULL REFERENCES magaza_tedarikciler(id) ON DELETE CASCADE,
  isim TEXT NOT NULL,
  aciklama TEXT,
  gorsel_url TEXT,
  fiyat NUMERIC(10,2),
  urun_url TEXT NOT NULL,
  kategori TEXT,
  aktif BOOLEAN NOT NULL DEFAULT true,
  olusturma TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- İşletmeye özel indirim kodu (tedarikçinin sisteminde tanımlanır, ör. KEMAL10)
CREATE TABLE IF NOT EXISTS magaza_isletme_kodlari (
  isletme_id INT NOT NULL REFERENCES isletmeler(id) ON DELETE CASCADE,
  tedarikci_id INT NOT NULL REFERENCES magaza_tedarikciler(id) ON DELETE CASCADE,
  indirim_kodu TEXT NOT NULL,
  PRIMARY KEY (isletme_id, tedarikci_id)
);

CREATE TABLE IF NOT EXISTS magaza_oneriler (
  id SERIAL PRIMARY KEY,
  kisa_kod TEXT NOT NULL UNIQUE,
  isletme_id INT NOT NULL REFERENCES isletmeler(id) ON DELETE CASCADE,
  urun_id INT NOT NULL REFERENCES magaza_urunler(id) ON DELETE CASCADE,
  randevu_id INT,
  tiklanma INT NOT NULL DEFAULT 0,
  son_tiklanma TIMESTAMPTZ,
  olusturma TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_magaza_oneriler_isletme ON magaza_oneriler(isletme_id, olusturma);

CREATE TABLE IF NOT EXISTS magaza_satislar (
  id SERIAL PRIMARY KEY,
  tedarikci_id INT NOT NULL REFERENCES magaza_tedarikciler(id) ON DELETE CASCADE,
  isletme_id INT REFERENCES isletmeler(id) ON DELETE SET NULL,
  siparis_no TEXT NOT NULL,
  indirim_kodu TEXT,
  tutar NUMERIC(10,2) NOT NULL,
  durum TEXT NOT NULL DEFAULT 'onaylandi',   -- onaylandi | iade
  berber_komisyon NUMERIC(10,2) NOT NULL DEFAULT 0,
  sirago_komisyon NUMERIC(10,2) NOT NULL DEFAULT 0,
  donem VARCHAR(7) NOT NULL,
  olusturma TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tedarikci_id, siparis_no)
);
CREATE INDEX IF NOT EXISTS idx_magaza_satislar_isletme ON magaza_satislar(isletme_id, donem);
