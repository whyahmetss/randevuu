-- SıraGO Vitrini (kullanıcı kararı 2026-10-14): SıraGO kendisi tedarikçi; esnafa tablet, stant, toptan
-- şampuan gibi ürünler Shopier sayfası gibi ilanla satılır, esnafın panelindeki vitrine düşer.
ALTER TABLE magaza_urunler ALTER COLUMN urun_url DROP NOT NULL;
ALTER TABLE magaza_urunler ADD COLUMN IF NOT EXISTS hedef VARCHAR(10) DEFAULT 'musteri';   -- musteri (öneri/komisyon) | esnaf (vitrin)
ALTER TABLE magaza_urunler ADD COLUMN IF NOT EXISTS eski_fiyat NUMERIC(10,2);
ALTER TABLE magaza_urunler ADD COLUMN IF NOT EXISTS stok INTEGER;
ALTER TABLE magaza_urunler ADD COLUMN IF NOT EXISTS gorsel_veri TEXT;
ALTER TABLE magaza_urunler ADD COLUMN IF NOT EXISTS sira INTEGER DEFAULT 0;

CREATE TABLE IF NOT EXISTS magaza_siparisler (
  id SERIAL PRIMARY KEY,
  isletme_id INTEGER NOT NULL,
  urun_id INTEGER NOT NULL,
  adet INTEGER NOT NULL DEFAULT 1,
  tutar NUMERIC(10,2),
  notu TEXT,
  durum VARCHAR(20) NOT NULL DEFAULT 'yeni',   -- yeni | hazirlaniyor | kargoda | teslim | iptal
  olusturma TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO magaza_tedarikciler (isim, iletisim, berber_komisyon_yuzde, sirago_komisyon_yuzde)
SELECT 'SıraGO', 'SıraGO ekibi', 0, 100
WHERE NOT EXISTS (SELECT 1 FROM magaza_tedarikciler WHERE isim = 'SıraGO');
ALTER TABLE magaza_urunler ADD COLUMN IF NOT EXISTS guncelleme TIMESTAMPTZ DEFAULT NOW();
