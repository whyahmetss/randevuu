-- Bölünmüş randevu (2026-10-29): seçilen hizmetleri tek usta yapamıyorsa (saç erkek ustada, kaş kadın personelde)
-- parçalar arka arkaya ayrı randevu olur. Devam parçaları ilk parçayı gösterir; ilk parça iptal olunca onlar da düşer.
ALTER TABLE randevular ADD COLUMN IF NOT EXISTS bagli_randevu_id INTEGER;
CREATE INDEX IF NOT EXISTS randevular_bagli ON randevular (bagli_randevu_id) WHERE bagli_randevu_id IS NOT NULL;
