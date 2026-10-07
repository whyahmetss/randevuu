-- Satış botu v2: kayıt takibi (huni), tanıtım videosu bir kez, ret türü, kalıcı kayıt durumu.
-- Tekrar çalıştırılabilir (runner hata alırsa bir sonraki açılışta baştan dener).
ALTER TABLE satis_konusmalar ADD COLUMN IF NOT EXISTS kayit_isletme_id INTEGER;
ALTER TABLE satis_konusmalar ADD COLUMN IF NOT EXISTS video_gonderildi BOOLEAN DEFAULT false;
ALTER TABLE satis_konusmalar ADD COLUMN IF NOT EXISTS red_tipi VARCHAR(10);
ALTER TABLE satis_konusmalar ADD COLUMN IF NOT EXISTS kayit_durum JSONB;
CREATE INDEX IF NOT EXISTS idx_satis_konusmalar_telefon ON satis_konusmalar(telefon);
CREATE INDEX IF NOT EXISTS idx_satis_konusmalar_olusturma ON satis_konusmalar(olusturma_tarihi);

-- Eski konuşmalarda ilk mesajla video zaten gitmişti; ilgi gösterince ikinci kez gitmesin
UPDATE satis_konusmalar SET video_gonderildi = true WHERE video_gonderildi IS DISTINCT FROM true AND olusturma_tarihi < NOW();

-- Deneme süresi tek değer: 14 gün ("ilk ay ücretsiz" / "2 ay" yazan şablonlar düzeltilir)
UPDATE satis_bot_sablonlar
SET mesaj = regexp_replace(mesaj, '(İlk|ilk) ay (tamamen )?(ücretsiz|sıfır lira)( geçiş)?', '14 gün ücretsiz', 'g')
WHERE mesaj ~ '(İlk|ilk) ay';
UPDATE satis_bot_sablonlar SET mesaj = regexp_replace(mesaj, '[0-9]+ ay ücretsiz', '14 gün ücretsiz', 'g') WHERE mesaj ~ '[0-9]+ ay ücretsiz';
-- Doğrulanamayan iddia
UPDATE satis_bot_sablonlar SET mesaj = replace(mesaj, ' İptal oranı %80 düşüyor.', '') WHERE mesaj LIKE '%İptal oranı \%80 düşüyor.%';
