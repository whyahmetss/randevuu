-- CRM temizliği (2026-10-14): 7 Ekim'deki filtreden önce WhatsApp grup (@g.us), kanal (@newsletter) ve durum
-- (@broadcast) kimlikleri müşteri olarak kaydedilmişti. Randevusu olmayanlar silinir; başka tabloya bağlı
-- olduğu için silinemeyen olursa atlanır (hiçbir gerçek kayıt zorla silinmez). Adı yalnız "." olanın adı boşaltılır.
DO $$
DECLARE r RECORD;
BEGIN
  IF to_regclass('musteriler') IS NULL THEN RETURN; END IF;
  FOR r IN SELECT m.id FROM musteriler m
           WHERE m.telefon ~ '@(g\.us|newsletter|broadcast)$'
             AND NOT EXISTS (SELECT 1 FROM randevular x WHERE x.musteri_id = m.id)
  LOOP
    BEGIN
      DELETE FROM musteriler WHERE id = r.id;
    EXCEPTION WHEN foreign_key_violation THEN NULL;
    END;
  END LOOP;
  UPDATE musteriler SET isim = NULL WHERE btrim(isim) IN ('.', '..', '-');
END $$;
