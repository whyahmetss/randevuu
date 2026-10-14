-- Paket tanımları koddakiyle hizalanır (2026-10-14, tasarım raporu): veritabanındaki satırlar panelin eski varsayılanlarıyla
-- oluşmuştu (Başlangıç 100–200 randevu, Standart 3 çalışan, "5 Dil", "12+ Dil"…) ve site / paket ekranıyla çelişiyordu.
-- Limitler yalnız düşükse yükseltilir; özellik metinleri ve adlar koddaki (config/paketler.js) güncel hâle getirilir.
DO $$ BEGIN
  IF to_regclass('paket_tanimlari') IS NULL THEN RETURN; END IF;
  UPDATE paket_tanimlari SET isim = 'Başlangıç',
    calisan_limit = GREATEST(COALESCE(calisan_limit, 0), 2), hizmet_limit = GREATEST(COALESCE(hizmet_limit, 0), 10),
    aylik_randevu_limit = GREATEST(COALESCE(aylik_randevu_limit, 0), 500), hatirlatma = true,
    ozellikler = E'2 çalışan\n500 randevu / ay\nWhatsApp Bot\nOtomatik Hatırlatma\nTemel Analitik'
    WHERE kod = 'baslangic';
  UPDATE paket_tanimlari SET isim = 'Standart',
    calisan_limit = GREATEST(COALESCE(calisan_limit, 0), 5), hizmet_limit = GREATEST(COALESCE(hizmet_limit, 0), 50),
    aylik_randevu_limit = GREATEST(COALESCE(aylik_randevu_limit, 0), 99999), hatirlatma = true,
    ozellikler = E'5 çalışan\nSınırsız randevu\nKasa Takibi & Prim Raporu\nSadakat Puan Sistemi\nKayıp Müşteri Kurtarma\nYorum Avcısı\nGece Raporu\nBot 3 dilde: Türkçe · İngilizce · Arapça'
    WHERE kod = 'profesyonel';
  UPDATE paket_tanimlari SET isim = 'Pro+',
    calisan_limit = GREATEST(COALESCE(calisan_limit, 0), 10), hizmet_limit = GREATEST(COALESCE(hizmet_limit, 0), 999),
    aylik_randevu_limit = GREATEST(COALESCE(aylik_randevu_limit, 0), 99999), hatirlatma = true,
    ozellikler = E'10 çalışan\nSınırsız randevu\nÇoklu şube (3 şube)\nKasa Takibi & Prim Raporu\nSadakat, Kayıp Müşteri, Yorum Avcısı\nGece Raporu\nÖncelikli Destek\nTüm Standart Özellikler'
    WHERE kod = 'proplus';
  UPDATE paket_tanimlari SET isim = 'Kurumsal',
    calisan_limit = GREATEST(COALESCE(calisan_limit, 0), 999), hizmet_limit = GREATEST(COALESCE(hizmet_limit, 0), 999),
    aylik_randevu_limit = GREATEST(COALESCE(aylik_randevu_limit, 0), 99999), hatirlatma = true,
    ozellikler = E'Sınırsız çalışan\nSınırsız randevu\nÇok Şubeli Yönetim\nMerkezi Müşteri & Sadakat\nKonsolide Raporlar\nSMS Hatırlatma (kendi NetGSM hesabınızla)\nÖncelikli Destek\nAPI Erişimi\nÖzel Eğitim & Onboarding\nTüm Pro+ Özellikler'
    WHERE kod = 'kurumsal';
END $$;
