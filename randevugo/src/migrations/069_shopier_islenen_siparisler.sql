-- Shopier siparişi bir kez işlenir (2026-10-26): sipariş numarası benzersiz; aynı bildirim tekrar ya da eşzamanlı
-- gelirse ikinci çağrı yazamaz ve işlemez. Daha önce işlenmiş siparişler geriye dönük eklenir.
CREATE TABLE IF NOT EXISTS shopier_islenen_siparisler (
  siparis_id TEXT PRIMARY KEY,
  olusturma TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
INSERT INTO shopier_islenen_siparisler (siparis_id)
  SELECT DISTINCT shopier_siparis_id FROM odemeler
  WHERE shopier_siparis_id IS NOT NULL AND durum IN ('odendi', 'eslestirilmedi')
ON CONFLICT DO NOTHING;
