-- Pro+ (kullanıcı kararı 2026-10-14): SMS hatırlatma Kurumsal'dan Pro+'a indi (işletmenin kendi NetGSM hesabıyla).
DO $$ BEGIN
  IF to_regclass('paket_tanimlari') IS NULL THEN RETURN; END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'paket_tanimlari' AND column_name = 'sms_hatirlatma') THEN
    UPDATE paket_tanimlari SET sms_hatirlatma = true WHERE kod = 'proplus';
  END IF;
  UPDATE paket_tanimlari SET ozellikler = E'10 çalışan\nSınırsız randevu\nSMS hatırlatma (kendi NetGSM hesabınla)\nÇoklu şube (3 şube)\nKasa Takibi & Prim Raporu\nSadakat, Kayıp Müşteri, Yorum Avcısı\nGece Raporu\nÖncelikli Destek\nTüm Standart Özellikler'
    WHERE kod = 'proplus';
END $$;
