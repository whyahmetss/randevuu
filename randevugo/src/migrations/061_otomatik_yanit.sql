-- WhatsApp Business otomatik karşılama mesajı (2026-10-17): insan cevabı sayılmaz, bot cevaplamaz; yapay zekâ bilgi olarak görür.
ALTER TABLE satis_konusmalar ADD COLUMN IF NOT EXISTS otomatik_yanit TEXT;
