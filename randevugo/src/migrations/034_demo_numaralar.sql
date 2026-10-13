-- Demo numaraları (2026-10-14): eski demo telefonları gerçek hatlara denk geliyordu (bot testinde gerçek kişilere
-- mesaj gitti). Eski demo numaraları ayrılmış 905990000NNN aralığına taşınır; gönderim de engellenir (utils/demoTel).
UPDATE musteriler SET telefon = '+905990000' || LPAD(RIGHT(telefon, 2), 3, '0')
 WHERE telefon ~ '^\+9053210000(0[1-9]|1[0-5])$'
   AND NOT EXISTS (SELECT 1 FROM musteriler m2 WHERE m2.telefon = '+905990000' || LPAD(RIGHT(musteriler.telefon, 2), 3, '0'));
UPDATE calisanlar SET telefon = '+905990000' || LPAD((100 + RIGHT(telefon, 1)::int)::text, 3, '0')
 WHERE telefon ~ '^0555111000[1-3]$';
