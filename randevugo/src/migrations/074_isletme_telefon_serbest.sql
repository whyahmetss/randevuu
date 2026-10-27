-- Web kaydı "Bir sorun oluştu" (2026-10-27): ilk kurulum (supabase-setup) isletmeler.telefon'u UNIQUE NOT NULL açmıştı.
-- Web kaydı ve şube açılışı telefonsuz ('') yazıyor: telefonsuz ikinci işletme benzersizlik kısıtına takılıp 500 veriyordu.
-- Kodda işletme telefonunun benzersiz olmasına dayanan bir şey yok (müşteri telefonu ayrı tablo). Adı ne olursa olsun
-- yalnız telefon kolonundan oluşan tekil kısıt/indeks kaldırılır.
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT c.conname FROM pg_constraint c
      JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY(c.conkey)
     WHERE c.conrelid = 'isletmeler'::regclass AND c.contype = 'u' AND array_length(c.conkey, 1) = 1 AND a.attname = 'telefon'
  LOOP
    EXECUTE format('ALTER TABLE isletmeler DROP CONSTRAINT %I', r.conname);
  END LOOP;
  FOR r IN
    SELECT i.relname FROM pg_index x
      JOIN pg_class i ON i.oid = x.indexrelid
      JOIN pg_attribute a ON a.attrelid = x.indrelid AND a.attnum = x.indkey[0]
     WHERE x.indrelid = 'isletmeler'::regclass AND x.indisunique AND NOT x.indisprimary AND x.indnatts = 1 AND a.attname = 'telefon'
  LOOP
    EXECUTE format('DROP INDEX IF EXISTS %I', r.relname);
  END LOOP;
END $$;
ALTER TABLE isletmeler ALTER COLUMN telefon DROP NOT NULL;
