-- Satış Masası + Patron yetkisi (kullanıcı kararı 2026-10-10)
-- Patron: kurucuların da üstünde tek hesap; ekip yönetimi, ekip takibi ve denetim kaydı yalnız onda.
ALTER TABLE admin_kullanicilar ADD COLUMN IF NOT EXISTS patron BOOLEAN DEFAULT false;
ALTER TABLE admin_kullanicilar ADD COLUMN IF NOT EXISTS gunluk_hedef INTEGER;
-- Henüz patron yoksa: ilk açılan süper admin hesabı (kurucunun kendi hesabı) patron olur
UPDATE admin_kullanicilar SET patron = true
WHERE id = (SELECT MIN(id) FROM admin_kullanicilar WHERE rol = 'superadmin')
  AND NOT EXISTS (SELECT 1 FROM admin_kullanicilar WHERE patron = true);

-- Aday ataması: aynı dükkanı iki kişi aramasın
ALTER TABLE potansiyel_musteriler ADD COLUMN IF NOT EXISTS atanan_id INTEGER;
ALTER TABLE potansiyel_musteriler ADD COLUMN IF NOT EXISTS atanma_tarihi TIMESTAMP;
ALTER TABLE potansiyel_musteriler ADD COLUMN IF NOT EXISTS son_temas TIMESTAMP;
CREATE INDEX IF NOT EXISTS idx_potansiyel_atanan ON potansiyel_musteriler(atanan_id) WHERE atanan_id IS NOT NULL;

-- Kim, hangi adayla, ne yaptı
CREATE TABLE IF NOT EXISTS satis_aktivite (
  id SERIAL PRIMARY KEY,
  kullanici_id INTEGER NOT NULL,
  lead_id INTEGER,
  isletme_id INTEGER,
  tip VARCHAR(20) NOT NULL,          -- arama_yok | gorustu | ilgilenmiyor | ilgileniyor | demo | kurulum | not
  notu TEXT,
  otomatik BOOLEAN DEFAULT false,
  olusturma_tarihi TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_satis_aktivite_kisi ON satis_aktivite(kullanici_id, olusturma_tarihi);

-- İşletmeyi getiren ekip üyesi (ödül/prim ve takip için)
ALTER TABLE isletmeler ADD COLUMN IF NOT EXISTS getiren_id INTEGER;

-- Ekip ayarları (hedef vb.)
CREATE TABLE IF NOT EXISTS ekip_ayar (anahtar VARCHAR(50) PRIMARY KEY, deger JSONB NOT NULL);
INSERT INTO ekip_ayar (anahtar, deger) VALUES
  ('hedef', '{"isletme": 200, "tarih": "2026-12-01", "baslangic": "2026-10-10"}')
ON CONFLICT (anahtar) DO NOTHING;

-- İtiraz bankası: ekip sahada duyduğunu ekler, patron düzenler
CREATE TABLE IF NOT EXISTS satis_itiraz (
  id SERIAL PRIMARY KEY,
  itiraz TEXT NOT NULL,
  cevap TEXT NOT NULL,
  ekleyen_id INTEGER,
  kullanim INTEGER DEFAULT 0,
  olusturma_tarihi TIMESTAMP DEFAULT NOW()
);
INSERT INTO satis_itiraz (itiraz, cevap)
SELECT * FROM (VALUES
  ('Müşterim yaşlı, kullanmaz.', 'Yaşlı müşteri yine telefon etsin. Gençler aramayı sevmiyor, mesajla halletmek istiyor; onları kaçırmayalım yeter.'),
  ('Telefonla hallediyoruz zaten.', 'Doğru. Peki traş ederken ya da gece 11''de yazanı kim karşılıyor? Sistem o anlar için.'),
  ('Ne kadar?', '14 gün ücretsiz, kart yok. Sonra paketine göre aylık; ayda 2 kaçan müşteriyi kurtarsa kendini öder. İlk 100 esnafın fiyatı ömür boyu sabit.'),
  ('Numaram kapanır mı?', 'WhatsApp Web gibi bağlanıyor; dışarı toplu mesaj atmıyor, sadece size yazana cevap veriyor. (Resmî WhatsApp API''si olduğunu SÖYLEMEYİN.)'),
  ('Bilgisayardan anlamam.', 'WhatsApp kullanabiliyorsanız yeter. Kurulumu ben yapıyorum, 5 dakika.'),
  ('Bir program kullanıyorum zaten.', 'Ne kullanıyorsunuz? Müşterileriniz WhatsApp''tan yazınca o cevap veriyor mu? Yan yana 14 gün deneyin, karşılaştırın.'),
  ('Sonra bakarım.', 'Tabii. Sayfanızı hazır bırakıyorum, linki gönderiyorum; ilk 100 esnafa ömür boyu sabit fiyat var, dolmadan yazın. Bir hafta sonra bir kez daha aranır.'),
  ('Müşterim link kullanmaz.', 'Link şart değil: müşteri sizin WhatsApp''ınıza yazar, bot cevap verir. Link isteyen için tezgâhta QR kart dursun.'),
  ('Kendi WhatsApp''ım karışır mı?', 'Hayır, telefonunuzda WhatsApp normal çalışmaya devam eder; bot yalnız randevu sorulunca devreye girer.')
) AS v(itiraz, cevap)
WHERE NOT EXISTS (SELECT 1 FROM satis_itiraz);
