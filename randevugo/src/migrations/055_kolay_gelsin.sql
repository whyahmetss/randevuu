-- Satış Bot ilk mesajı yalnız selam (kullanıcı kararı 2026-10-17): "Merhaba, kolay gelsin".
-- Ad soran, kendini tanıtan, soru soran açılışlar pasife alınır (silinmez; sayaçları ve metni panelde durur,
-- istenirse tek tıkla geri açılır). Sohbeti karşının cevabına göre satış yapay zekâsı (services/satisAI.js) yürütür.
INSERT INTO satis_bot_sablonlar (isim, mesaj, kategori, aktif)
SELECT 'Kolay Gelsin', 'Merhaba, kolay gelsin', 'genel', true
WHERE NOT EXISTS (SELECT 1 FROM satis_bot_sablonlar WHERE isim = 'Kolay Gelsin');

UPDATE satis_bot_sablonlar
SET aktif = false, durdurma_notu = 'Açılış "Merhaba, kolay gelsin" oldu (2026-10-17); sohbeti yapay zekâ yürütüyor.'
WHERE isim <> 'Kolay Gelsin' AND aktif = true;
