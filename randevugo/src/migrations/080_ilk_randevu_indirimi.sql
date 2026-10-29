-- İlk randevu indirimi (kullanıcı kararı 2026-10-29): esnaf yeni müşteri çekmek için ilk randevuya indirim verir.
-- Tür: yuzde (%20) ya da tl (100 ₺). Bitiş boşsa süresiz. Hangi hizmetlerde geçerli olduğunu esnaf seçer (varsayılan hepsi).
ALTER TABLE isletmeler ADD COLUMN IF NOT EXISTS ilk_indirim_aktif BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE isletmeler ADD COLUMN IF NOT EXISTS ilk_indirim_tur VARCHAR(6) NOT NULL DEFAULT 'yuzde';
ALTER TABLE isletmeler ADD COLUMN IF NOT EXISTS ilk_indirim_deger NUMERIC;
ALTER TABLE isletmeler ADD COLUMN IF NOT EXISTS ilk_indirim_bitis DATE;
ALTER TABLE hizmetler ADD COLUMN IF NOT EXISTS ilk_indirim BOOLEAN NOT NULL DEFAULT true;
-- Randevuya uygulanan indirim (TL). randevu_hizmetleri.fiyat indirimli fiyattır; panel bunu "İlk randevu" etiketiyle gösterir.
ALTER TABLE randevular ADD COLUMN IF NOT EXISTS ilk_indirim_tutari NUMERIC;
