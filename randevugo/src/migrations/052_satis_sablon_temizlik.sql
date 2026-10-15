-- Satış Bot şablon temizliği (2026-10-16): eskimiş/bozuk ifadeler düzeltilir, yeni A/B şablonları PASİF eklenir
-- (hangisinin gönderileceğine panelden karar verilir). Sayaçları olan şablonların anlamı değişmesin diye yalnız
-- küçük düzeltme yapılır; büyük değişiklikler yeni şablon olarak gelir.

-- Otomatik fren notu (services/satisBot.js _sablonFreni)
ALTER TABLE satis_bot_sablonlar ADD COLUMN IF NOT EXISTS durdurma_notu TEXT;

-- Soru Soran: bayram geçti, mevsimsel cümle her zaman doğru olan bir ifadeye döner
UPDATE satis_bot_sablonlar
SET mesaj = regexp_replace(mesaj, 'Bayram öncesi[^,]*,', 'Yoğun günlerde telefonlar susmuyordur,')
WHERE mesaj LIKE '%Bayram öncesi%';

-- Boş isimden kalan "Selam ," izi
UPDATE satis_bot_sablonlar SET mesaj = regexp_replace(mesaj, '^(Selam|Merhaba|Selamlar)\s+,', '\1,')
WHERE mesaj ~ '^(Selam|Merhaba|Selamlar)\s+,';

-- Yeni şablonlar (yoksa): kısa, kendini tanıtan, doğrulanamayan iddia içermeyen; ilk mesaj satış değil soru
INSERT INTO satis_bot_sablonlar (isim, mesaj, kategori, aktif)
SELECT v.isim, v.mesaj, v.kategori, false
FROM (VALUES
  ('Defter mi Sistem mi',
   'Selam, Google''da {isletme_adi} dükkânını gördüm. Yoğunlukta telefonlar susmuyordur; randevuları hâlâ telefonla mı tutuyorsunuz, yoksa WhatsApp''tan kendiliğinden alan bir sisteminiz var mı?',
   'genel'),
  ('Kısa Acı Noktası',
   'Selam, işlem yaparken çalan telefona bakmak zor oluyor; ulaşamayan müşteri de çoğu zaman başka yere gidiyor. {isletme_adi} için bu müşterileri WhatsApp''tan yakalayıp randevuya çeviren bir sistem kurduk. 1 dakikada göstereyim mi?',
   'genel'),
  ('Kendini Tanıtan',
   'Merhaba, ben SıraGO''dan yazıyorum. {isletme_adi} randevuları daha çok telefonla mı geliyor, WhatsApp''tan mı? Randevuyu WhatsApp''ta sizin yerinize alan bir sistemimiz var; uygunsa 1 dakikalık örneğini atayım mı?',
   'genel'),
  ('İnsta DM Yükü',
   'Selam, Instagram''daki çalışmalarınız çok iyi duruyor. DM''den fiyat ve randevu soran çok oluyordur; müşterinin tıklayıp kendi saatini seçebileceği bir randevu linkiniz var mı, yoksa hâlâ tek tek mi yazışıyorsunuz?',
   'dövme')
) AS v(isim, mesaj, kategori)
WHERE NOT EXISTS (SELECT 1 FROM satis_bot_sablonlar s WHERE s.isim = v.isim);
