-- Paket merdiveni (kullanıcı kararı 2026-10-08): 299 Başlangıç · 699 Standart · 1.499 Pro+ · 4.999 Kurumsal
-- Kod adları değişmez (mevcut işletmeler 'profesyonel' kodunda kalır, yalnız görünen ad "Standart").
UPDATE paket_tanimlari SET isim = 'Standart' WHERE kod = 'profesyonel' AND isim = 'Profesyonel';
UPDATE paket_tanimlari SET sira = 1 WHERE kod = 'baslangic';
UPDATE paket_tanimlari SET sira = 2 WHERE kod = 'profesyonel';
UPDATE paket_tanimlari SET sira = 4 WHERE kod = 'kurumsal';
INSERT INTO paket_tanimlari (kod, isim, fiyat, calisan_limit, hizmet_limit, aylik_randevu_limit, bot_aktif, hatirlatma, istatistik, export_aktif, ozellikler, aktif, sira)
SELECT 'proplus', 'Pro+', 1499, 10, 999, 99999, true, true, true, true,
       E'10 çalışan\nSınırsız randevu\nÇoklu şube (3 şube)\nKasa Takibi & Prim Raporu\nSadakat, Kayıp Müşteri, Yorum Avcısı\nGece Raporu\nÖncelikli Destek\nTüm Standart Özellikler',
       true, 3
WHERE EXISTS (SELECT 1 FROM paket_tanimlari)                       -- tablo boşsa koddaki yedek tanımlar geçerli
ON CONFLICT (kod) DO NOTHING;
