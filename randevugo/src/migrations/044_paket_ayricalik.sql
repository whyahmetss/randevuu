-- Kazanılmış hak (kullanıcı kararı 2026-10-14): paket kuralı değişmeden önce açık olan özellikler
-- o işletmede açık kalır. Yalnız bu migration'ın çalıştığı anda doldurulur; yeni işletmeler boş başlar.
ALTER TABLE isletmeler ADD COLUMN IF NOT EXISTS paket_ayricalik TEXT[] NOT NULL DEFAULT '{}';

UPDATE isletmeler SET paket_ayricalik = ARRAY(
  SELECT unnest(ARRAY[
    CASE WHEN kapora_aktif = true THEN 'kapora' END,
    CASE WHEN telegram_token IS NOT NULL AND telegram_token <> '' THEN 'telegram' END,
    CASE WHEN dogum_gunu_aktif = true THEN 'dogum_gunu' END
  ]) AS x EXCEPT SELECT NULL
)
WHERE COALESCE(paket, 'baslangic') = 'baslangic'
  AND (kapora_aktif = true OR (telegram_token IS NOT NULL AND telegram_token <> '') OR dogum_gunu_aktif = true);
