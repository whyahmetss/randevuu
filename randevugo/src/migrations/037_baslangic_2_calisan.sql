-- Başlangıç paketi 2 çalışan (kullanıcı kararı 2026-10-13; kod ve landing 2 diyordu, veritabanı tanımı 1'de kalmıştı:
-- kurulum sihirbazında "en fazla 1 çalışan" hatası). Yalnız düşükse yükseltir; elle daha yüksek verildiyse dokunmaz.
DO $$ BEGIN
  IF to_regclass('paket_tanimlari') IS NOT NULL THEN
    UPDATE paket_tanimlari SET calisan_limit = 2 WHERE kod = 'baslangic' AND COALESCE(calisan_limit, 1) < 2;
  END IF;
END $$;
