-- Memnuniyet / Feedback tablosu
CREATE TABLE IF NOT EXISTS memnuniyet (
  id SERIAL PRIMARY KEY,
  randevu_id INTEGER REFERENCES randevular(id),
  musteri_id INTEGER REFERENCES musteriler(id),
  isletme_id INTEGER REFERENCES isletmeler(id),
  puan INTEGER CHECK (puan >= 1 AND puan <= 5),
  yorum TEXT,
  olusturma_tarihi TIMESTAMP DEFAULT NOW()
);

-- Bekleme listesi tablosu
CREATE TABLE IF NOT EXISTS bekleme_listesi (
  id SERIAL PRIMARY KEY,
  musteri_telefon VARCHAR(20) NOT NULL,
  isletme_id INTEGER REFERENCES isletmeler(id),
  hizmet_id INTEGER REFERENCES hizmetler(id),
  istenen_tarih DATE NOT NULL,
  durum VARCHAR(20) DEFAULT 'bekliyor', -- bekliyor, bildirildi, randevu_alindi, iptal
  olusturma_tarihi TIMESTAMP DEFAULT NOW()
);

-- Kampanya/Duyuru tablosu
CREATE TABLE IF NOT EXISTS kampanyalar (
  id SERIAL PRIMARY KEY,
  isletme_id INTEGER REFERENCES isletmeler(id),
  baslik VARCHAR(200) NOT NULL,
  mesaj TEXT NOT NULL,
  baslangic_tarihi DATE,
  bitis_tarihi DATE,
  aktif BOOLEAN DEFAULT true,
  gonderim_durumu VARCHAR(20) DEFAULT 'bekliyor', -- bekliyor, gonderildi
  gonderim_tarihi TIMESTAMP,
  olusturma_tarihi TIMESTAMP DEFAULT NOW()
);

-- Randevular tablosuna not alanı zaten var (not_text), memnuniyet gönderildi flag ekle
ALTER TABLE randevular ADD COLUMN IF NOT EXISTS memnuniyet_soruldu BOOLEAN DEFAULT false;

-- Müşteriler tablosuna doğum tarihi ekle (ileride kullanılabilir)
ALTER TABLE musteriler ADD COLUMN IF NOT EXISTS dogum_tarihi DATE;
