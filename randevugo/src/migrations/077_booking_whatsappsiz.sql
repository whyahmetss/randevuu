-- Randevu sayfası WhatsApp bağlantısı beklemeden açık (2026-10-29). Önceden booking_acik yalnız ilk WhatsApp
-- bağlantısında true oluyordu; sayfa "kurulum tamamlanmadı" diyordu. Hiç bağlanmamış (kapalılığı esnafın seçimi
-- olamayacak) işletmeler açılır; WhatsApp'ı bağlı olup sayfayı kendisi kapatan esnafa dokunulmaz.
ALTER TABLE isletmeler ALTER COLUMN booking_acik SET DEFAULT true;

DO $$
BEGIN
  IF to_regclass('wa_auth_keys') IS NOT NULL THEN
    UPDATE isletmeler i SET booking_acik = true
     WHERE i.booking_acik IS NOT true
       AND NOT EXISTS (SELECT 1 FROM wa_auth_keys w WHERE w.isletme_id = i.id);
  ELSE
    UPDATE isletmeler SET booking_acik = true WHERE booking_acik IS NOT true;
  END IF;
END $$;
