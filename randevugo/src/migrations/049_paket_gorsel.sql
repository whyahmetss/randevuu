-- Paket ödeme görseli (2026-10-15): Shopier ürününde görünen görsel Paket Yönetimi'nden değiştirilir.
-- Görsel data URL olarak tutulur (isletme_gorselleri ile aynı yöntem), /api/paket-gorsel/:kod adresinden sunulur.
ALTER TABLE paket_tanimlari ADD COLUMN IF NOT EXISTS gorsel TEXT;
ALTER TABLE paket_tanimlari ADD COLUMN IF NOT EXISTS gorsel_guncelleme TIMESTAMP;
