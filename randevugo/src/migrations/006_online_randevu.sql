-- Online Randevu Linki: işletme slug'ı ve online randevu kaynağı
ALTER TABLE isletmeler ADD COLUMN IF NOT EXISTS slug VARCHAR(100) UNIQUE;
ALTER TABLE randevular ADD COLUMN IF NOT EXISTS kaynak VARCHAR(30) DEFAULT 'bot';

-- Mevcut işletmelere otomatik slug ata (isim -> url-friendly)
UPDATE isletmeler SET slug = LOWER(
  REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(
  REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(
    TRIM(isim),
    ' ', '-'), 'ı', 'i'), 'ğ', 'g'), 'ü', 'u'), 'ş', 's'), 'ö', 'o'), 'ç', 'c'),
    'İ', 'i'), 'Ğ', 'g'), 'Ü', 'u'), 'Ş', 's'), 'Ö', 'o'), 'Ç', 'c'),
    '.', ''), ',', ''), '''', ''), '&', '-')
) WHERE slug IS NULL;
