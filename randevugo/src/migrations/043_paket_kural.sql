-- Paket kuralı (kullanıcı kararı 2026-10-14): Başlangıç = bot + randevu sayfası + hatırlatma + tablet modu;
-- Standart = + kapora, Telegram, kasa, sadakat, kayıp müşteri, yorum avcısı; Pro+ = + 3 şube; Kurumsal = + sınırsız şube, SMS, API.
-- Kapora ve Telegram açık/kapalı bilgisi koddadır (config/paketler.js); burada yalnız gösterilen özellik metinleri güncellenir.
DO $$ BEGIN
  IF to_regclass('paket_tanimlari') IS NULL THEN RETURN; END IF;
  UPDATE paket_tanimlari SET ozellikler = E'2 çalışan\n500 randevu / ay\nWhatsApp Bot\nOtomatik Hatırlatma\nTablet modu (tezgâh ekranı)\nTemel Analitik'
    WHERE kod = 'baslangic';
  UPDATE paket_tanimlari SET ozellikler = E'5 çalışan\nSınırsız randevu\nKasa Takibi & Prim Raporu\nSadakat Puan Sistemi\nKayıp Müşteri Kurtarma\nYorum Avcısı\nGece Raporu\nKapora / ön ödeme\nTelegram botu\nBot 3 dilde: Türkçe · İngilizce · Arapça'
    WHERE kod = 'profesyonel';
END $$;
