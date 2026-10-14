-- Avcı kategorileri ana kategoriye bağlanır (2026-10-14, tasarım raporu): "Saç Kesim", "Erkek Kuaförü", "Beauty Center",
-- "Bayan Kuaförü", "Diş Hekimi", "Tattoo"… kampanyalarla eşleşmediği için ~7.500 aday boşta kalıyordu.
-- Eşleme utils/kategori.js ile aynı; asıl Google kategorisi kategori_ham'da saklanır.
DO $$ BEGIN
  IF to_regclass('potansiyel_musteriler') IS NULL THEN RETURN; END IF;
  ALTER TABLE potansiyel_musteriler ADD COLUMN IF NOT EXISTS kategori_ham TEXT;
  UPDATE potansiyel_musteriler SET kategori_ham = kategori WHERE kategori_ham IS NULL AND kategori IS NOT NULL;
  UPDATE potansiyel_musteriler SET kategori = 'Berber' WHERE lower(btrim(kategori)) IN ('saç kesim','sac kesim','erkek kuaförü','erkek kuaforu','barber','barber shop');
  UPDATE potansiyel_musteriler SET kategori = 'Güzellik Salonu' WHERE lower(btrim(kategori)) IN ('beauty center','güzellik merkezi','guzellik merkezi','beauty salon');
  UPDATE potansiyel_musteriler SET kategori = 'Kuaför' WHERE lower(btrim(kategori)) IN ('bayan kuaförü','bayan kuaforu','kuaför salonu','kuafor salonu','hair salon');
  UPDATE potansiyel_musteriler SET kategori = 'Diş Kliniği' WHERE lower(btrim(kategori)) IN ('diş hekimi','dis hekimi','dentist');
  UPDATE potansiyel_musteriler SET kategori = 'Dövme' WHERE lower(btrim(kategori)) IN ('tattoo','tattoo shop','dövme stüdyosu');
END $$;
