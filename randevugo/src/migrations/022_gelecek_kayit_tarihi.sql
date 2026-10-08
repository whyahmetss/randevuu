-- Eski "deneme uzat" kodu işletmenin kayıt tarihini ileri alıyordu (ör. 28.10 kayıt, "-21. gün").
-- Gelecekteki kayıt tarihlerini gerçek açılış tarihine (işletme kullanıcısının oluşturulması) çek.
DO $$
BEGIN
  UPDATE isletmeler i
  SET olusturma_tarihi = LEAST(
    NOW(),
    COALESCE((SELECT MIN(k.olusturma_tarihi) FROM admin_kullanicilar k WHERE k.isletme_id = i.id), NOW())
  )
  WHERE i.olusturma_tarihi > NOW();
EXCEPTION WHEN undefined_column THEN
  UPDATE isletmeler SET olusturma_tarihi = NOW() WHERE olusturma_tarihi > NOW();
END $$;
