-- E-posta doğrulama (2026-10-27): "Tekrar gönder"e basınca ya da sayfa yenilenince yeni kod gidiyor, spamdaki ilk kod
-- "yanlış" oluyordu. Bir önceki kod da geçerlilik süresi içinde kabul edilir.
ALTER TABLE eposta_dogrulama ADD COLUMN IF NOT EXISTS onceki_kod_hash TEXT;
