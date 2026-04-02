-- RandevuGO - Supabase SQL Setup
-- Bu SQL'i Supabase SQL Editor'de çalıştır

-- İşletmeler tablosu
CREATE TABLE IF NOT EXISTS isletmeler (
  id SERIAL PRIMARY KEY,
  isim VARCHAR(255) NOT NULL,
  telefon VARCHAR(20) NOT NULL UNIQUE,
  whatsapp_no VARCHAR(20),
  adres TEXT,
  sehir VARCHAR(100) DEFAULT 'İstanbul',
  ilce VARCHAR(100),
  kategori VARCHAR(100) NOT NULL,
  calisma_baslangic TIME DEFAULT '09:00',
  calisma_bitis TIME DEFAULT '19:00',
  randevu_suresi_dk INTEGER DEFAULT 30,
  kapali_gunler TEXT DEFAULT '0',
  paket VARCHAR(50) DEFAULT 'baslangic',
  aktif BOOLEAN DEFAULT true,
  olusturma_tarihi TIMESTAMP DEFAULT NOW(),
  son_odeme_tarihi TIMESTAMP
);

-- Çalışanlar tablosu
CREATE TABLE IF NOT EXISTS calisanlar (
  id SERIAL PRIMARY KEY,
  isletme_id INTEGER REFERENCES isletmeler(id) ON DELETE CASCADE,
  isim VARCHAR(255) NOT NULL,
  telefon VARCHAR(20),
  uzmanlik TEXT,
  aktif BOOLEAN DEFAULT true,
  olusturma_tarihi TIMESTAMP DEFAULT NOW()
);

-- Hizmetler tablosu
CREATE TABLE IF NOT EXISTS hizmetler (
  id SERIAL PRIMARY KEY,
  isletme_id INTEGER REFERENCES isletmeler(id) ON DELETE CASCADE,
  isim VARCHAR(255) NOT NULL,
  sure_dk INTEGER DEFAULT 30,
  fiyat DECIMAL(10,2),
  aciklama TEXT,
  aktif BOOLEAN DEFAULT true
);

-- Müşteriler tablosu
CREATE TABLE IF NOT EXISTS musteriler (
  id SERIAL PRIMARY KEY,
  telefon VARCHAR(20) NOT NULL,
  isim VARCHAR(255),
  olusturma_tarihi TIMESTAMP DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_musteri_telefon ON musteriler(telefon);

-- Randevular tablosu
CREATE TABLE IF NOT EXISTS randevular (
  id SERIAL PRIMARY KEY,
  isletme_id INTEGER REFERENCES isletmeler(id) ON DELETE CASCADE,
  calisan_id INTEGER REFERENCES calisanlar(id) ON DELETE SET NULL,
  musteri_id INTEGER REFERENCES musteriler(id) ON DELETE CASCADE,
  hizmet_id INTEGER REFERENCES hizmetler(id) ON DELETE SET NULL,
  tarih DATE NOT NULL,
  saat TIME NOT NULL,
  bitis_saati TIME NOT NULL,
  durum VARCHAR(50) DEFAULT 'onaylandi',
  not_text TEXT,
  hatirlatma_gonderildi BOOLEAN DEFAULT false,
  olusturma_tarihi TIMESTAMP DEFAULT NOW()
);

-- Sohbet geçmişi
CREATE TABLE IF NOT EXISTS sohbet_gecmisi (
  id SERIAL PRIMARY KEY,
  musteri_telefon VARCHAR(20) NOT NULL,
  isletme_id INTEGER REFERENCES isletmeler(id) ON DELETE CASCADE,
  yon VARCHAR(10) NOT NULL,
  mesaj TEXT NOT NULL,
  olusturma_tarihi TIMESTAMP DEFAULT NOW()
);

-- Bot durumu
CREATE TABLE IF NOT EXISTS bot_durum (
  id SERIAL PRIMARY KEY,
  musteri_telefon VARCHAR(20) NOT NULL,
  isletme_id INTEGER REFERENCES isletmeler(id),
  asama VARCHAR(50) DEFAULT 'baslangic',
  secilen_hizmet_id INTEGER,
  secilen_calisan_id INTEGER,
  secilen_tarih DATE,
  secilen_saat TIME,
  son_aktivite TIMESTAMP DEFAULT NOW(),
  UNIQUE(musteri_telefon, isletme_id)
);

-- Admin kullanıcıları
CREATE TABLE IF NOT EXISTS admin_kullanicilar (
  id SERIAL PRIMARY KEY,
  email VARCHAR(255) NOT NULL UNIQUE,
  sifre VARCHAR(255) NOT NULL,
  isim VARCHAR(255),
  rol VARCHAR(50) DEFAULT 'isletme',
  isletme_id INTEGER REFERENCES isletmeler(id) ON DELETE CASCADE,
  aktif BOOLEAN DEFAULT true,
  olusturma_tarihi TIMESTAMP DEFAULT NOW()
);

-- Ödemeler tablosu
CREATE TABLE IF NOT EXISTS odemeler (
  id SERIAL PRIMARY KEY,
  isletme_id INTEGER REFERENCES isletmeler(id) ON DELETE CASCADE,
  tutar DECIMAL(10,2) NOT NULL,
  donem VARCHAR(20),
  durum VARCHAR(50) DEFAULT 'bekliyor',
  odeme_tarihi TIMESTAMP,
  olusturma_tarihi TIMESTAMP DEFAULT NOW()
);

-- ==================== DEMO VERİLER ====================

-- Demo işletme
INSERT INTO isletmeler (isim, telefon, whatsapp_no, adres, ilce, kategori, calisma_baslangic, calisma_bitis, randevu_suresi_dk, kapali_gunler)
VALUES ('Berber Ali', '05551234567', 'whatsapp:+905551234567', 'Bağcılar Caddesi No:42', 'Bağcılar', 'berber', '09:00', '20:00', 30, '0')
ON CONFLICT (telefon) DO NOTHING;

-- Çalışanlar
INSERT INTO calisanlar (isletme_id, isim, telefon, uzmanlik)
SELECT id, 'Ali Usta', '05551234567', 'sac_kesimi,sakal,cilt_bakimi' FROM isletmeler WHERE telefon = '05551234567'
ON CONFLICT DO NOTHING;

INSERT INTO calisanlar (isletme_id, isim, telefon, uzmanlik)
SELECT id, 'Mehmet', '05559876543', 'sac_kesimi,sakal' FROM isletmeler WHERE telefon = '05551234567'
ON CONFLICT DO NOTHING;

-- Hizmetler
INSERT INTO hizmetler (isletme_id, isim, sure_dk, fiyat)
SELECT id, 'Saç Kesimi', 30, 150 FROM isletmeler WHERE telefon = '05551234567';

INSERT INTO hizmetler (isletme_id, isim, sure_dk, fiyat)
SELECT id, 'Sakal Tıraşı', 20, 100 FROM isletmeler WHERE telefon = '05551234567';

INSERT INTO hizmetler (isletme_id, isim, sure_dk, fiyat)
SELECT id, 'Saç + Sakal', 45, 200 FROM isletmeler WHERE telefon = '05551234567';

INSERT INTO hizmetler (isletme_id, isim, sure_dk, fiyat)
SELECT id, 'Cilt Bakımı', 40, 250 FROM isletmeler WHERE telefon = '05551234567';

-- Demo müşteriler
INSERT INTO musteriler (telefon, isim) VALUES ('05531112233', 'Ahmet Müşteri') ON CONFLICT DO NOTHING;
INSERT INTO musteriler (telefon, isim) VALUES ('05532223344', 'Mehmet Müşteri') ON CONFLICT DO NOTHING;

-- İşletme admin (şifre: berberali123 → bcrypt hash)
INSERT INTO admin_kullanicilar (email, sifre, isim, rol, isletme_id)
SELECT 'ali@berberali.com', '$2a$10$uVqzyHHYEZBTyh7EMehP4e/na2/cNReowsRsLqzZt12etaaF7JtEi', 'Berber Ali', 'isletme', id
FROM isletmeler WHERE telefon = '05551234567'
ON CONFLICT (email) DO NOTHING;

-- Super admin (şifre: admin123456 → bcrypt hash)
INSERT INTO admin_kullanicilar (email, sifre, isim, rol)
VALUES ('admin@randevugo.com', '$2a$10$AgcJQ0IEOR5qkk.zMdwkoe3HyBWUTXirj0RAo5shO9Uf7foRn.zz6', 'Super Admin', 'superadmin')
ON CONFLICT (email) DO NOTHING;
