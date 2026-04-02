const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const setupDB = async () => {
  console.log('🗄️  RandevuGO Veritabanı kuruluyor...\n');

  await pool.query(`

    -- İşletmeler tablosu
    CREATE TABLE IF NOT EXISTS isletmeler (
      id SERIAL PRIMARY KEY,
      isim VARCHAR(255) NOT NULL,
      telefon VARCHAR(20) NOT NULL UNIQUE,
      whatsapp_no VARCHAR(20),
      adres TEXT,
      sehir VARCHAR(100) DEFAULT 'İstanbul',
      ilce VARCHAR(100),
      kategori VARCHAR(100) NOT NULL, -- berber, kuafor, disci, guzellik, veteriner
      calisma_baslangic TIME DEFAULT '09:00',
      calisma_bitis TIME DEFAULT '19:00',
      randevu_suresi_dk INTEGER DEFAULT 30,
      kapali_gunler TEXT DEFAULT '0', -- 0=Pazar, virgülle ayır: '0,6'
      paket VARCHAR(50) DEFAULT 'baslangic', -- baslangic, profesyonel, premium
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
      uzmanlik TEXT, -- 'sac_kesimi,sakal,cilt_bakimi'
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
      durum VARCHAR(50) DEFAULT 'onaylandi', -- bekliyor, onaylandi, iptal, tamamlandi, gelmedi
      not_text TEXT,
      hatirlatma_gonderildi BOOLEAN DEFAULT false,
      olusturma_tarihi TIMESTAMP DEFAULT NOW()
    );

    -- Sohbet geçmişi (bot konuşmalarını takip etmek için)
    CREATE TABLE IF NOT EXISTS sohbet_gecmisi (
      id SERIAL PRIMARY KEY,
      musteri_telefon VARCHAR(20) NOT NULL,
      isletme_id INTEGER REFERENCES isletmeler(id) ON DELETE CASCADE,
      yon VARCHAR(10) NOT NULL, -- 'gelen' veya 'giden'
      mesaj TEXT NOT NULL,
      olusturma_tarihi TIMESTAMP DEFAULT NOW()
    );

    -- Bot durumu (müşteriyle hangi aşamada olduğunu takip)
    CREATE TABLE IF NOT EXISTS bot_durum (
      id SERIAL PRIMARY KEY,
      musteri_telefon VARCHAR(20) NOT NULL,
      isletme_id INTEGER REFERENCES isletmeler(id),
      asama VARCHAR(50) DEFAULT 'baslangic', 
      -- asamalar: baslangic, hizmet_secimi, tarih_secimi, saat_secimi, onay, tamamlandi
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
      rol VARCHAR(50) DEFAULT 'isletme', -- superadmin, isletme
      isletme_id INTEGER REFERENCES isletmeler(id) ON DELETE CASCADE,
      aktif BOOLEAN DEFAULT true,
      olusturma_tarihi TIMESTAMP DEFAULT NOW()
    );

    -- Ödemeler tablosu
    CREATE TABLE IF NOT EXISTS odemeler (
      id SERIAL PRIMARY KEY,
      isletme_id INTEGER REFERENCES isletmeler(id) ON DELETE CASCADE,
      tutar DECIMAL(10,2) NOT NULL,
      donem VARCHAR(20), -- '2026-04'
      durum VARCHAR(50) DEFAULT 'bekliyor', -- bekliyor, odendi, gecikti
      odeme_tarihi TIMESTAMP,
      olusturma_tarihi TIMESTAMP DEFAULT NOW()
    );

  `);

  console.log('✅ Tablolar oluşturuldu!\n');

  // Super admin oluştur
  const bcrypt = require('bcryptjs');
  const adminSifre = await bcrypt.hash(process.env.ADMIN_PASSWORD || 'admin123456', 10);
  
  await pool.query(`
    INSERT INTO admin_kullanicilar (email, sifre, isim, rol)
    VALUES ($1, $2, 'Super Admin', 'superadmin')
    ON CONFLICT (email) DO NOTHING
  `, [process.env.ADMIN_EMAIL || 'admin@randevugo.com', adminSifre]);

  console.log('✅ Super admin oluşturuldu!');
  console.log(`   Email: ${process.env.ADMIN_EMAIL || 'admin@randevugo.com'}`);
  console.log(`   Şifre: ${process.env.ADMIN_PASSWORD || 'admin123456'}\n`);

  console.log('🎉 RandevuGO veritabanı hazır!\n');
  process.exit(0);
};

setupDB().catch(err => {
  console.error('❌ Veritabanı hatası:', err);
  process.exit(1);
});
