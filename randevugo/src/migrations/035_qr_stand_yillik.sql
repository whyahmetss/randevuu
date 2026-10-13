-- QR stand (kullanıcı kararı 2026-10-14): vitrin ilanı kişiye özel baskılıysa siparişte dükkânın QR baskı dosyası üretilir.
ALTER TABLE magaza_urunler ADD COLUMN IF NOT EXISTS kisisel_qr BOOLEAN DEFAULT false;
-- Son ödemenin süresi (ay | yil): bitiş hatırlatması yıllık ödeyene yıllık link gönderir.
ALTER TABLE isletmeler ADD COLUMN IF NOT EXISTS son_odeme_sure VARCHAR(5);
