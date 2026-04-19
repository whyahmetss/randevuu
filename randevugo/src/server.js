process.env.TZ = 'Europe/Istanbul';

// stdout filtresi GEÇİCİ OLARAK KAPALI — tüm logları görelim

const express = require('express');
const http = require('http');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
require('dotenv').config();

const apiRoutes = require('./routes/api');
const whatsappService = require('./services/whatsapp');
const hatirlatmaService = require('./services/hatirlatma');
const odemeService = require('./services/odemeService');
const telegramService = require('./services/telegram');
const whatsappWebService = require('./services/whatsappWeb');
const telegramSatisBot = require('./services/telegramSatisBot');
const socketServer = require('./services/socketServer');

const pool = require('./config/db');

const app = express();
const PORT = process.env.PORT || 3000;

// Otomatik migration - eksik kolonları ekle
(async () => {
  try {
    await pool.query(`ALTER TABLE bot_durum ADD COLUMN IF NOT EXISTS secilen_calisan_id INTEGER`);
    await pool.query(`ALTER TABLE randevular ADD COLUMN IF NOT EXISTS not_text TEXT`);
    await pool.query(`ALTER TABLE calisanlar ADD COLUMN IF NOT EXISTS aktif BOOLEAN DEFAULT true`);
    await pool.query(`ALTER TABLE isletmeler ADD COLUMN IF NOT EXISTS mola_saatleri JSONB DEFAULT '[]'`);
    // Avcı Bot - Potansiyel müşteri tablosu
    await pool.query(`CREATE TABLE IF NOT EXISTS potansiyel_musteriler (
      id SERIAL PRIMARY KEY,
      isletme_adi VARCHAR(255) NOT NULL,
      telefon VARCHAR(50),
      adres TEXT,
      sehir VARCHAR(100),
      ilce VARCHAR(100),
      kategori VARCHAR(100),
      puan DECIMAL(2,1),
      yorum_sayisi INTEGER DEFAULT 0,
      web_sitesi VARCHAR(500),
      instagram VARCHAR(255),
      google_maps_id VARCHAR(255) UNIQUE,
      google_maps_url TEXT,
      skor INTEGER DEFAULT 0,
      durum VARCHAR(50) DEFAULT 'yeni',
      notlar TEXT,
      arama_tarihi TIMESTAMP,
      sonraki_arama TIMESTAMP,
      olusturma_tarihi TIMESTAMP DEFAULT NOW()
    )`);
    await pool.query(`ALTER TABLE potansiyel_musteriler ADD COLUMN IF NOT EXISTS instagram VARCHAR(255)`);
    await pool.query(`ALTER TABLE potansiyel_musteriler ADD COLUMN IF NOT EXISTS kaynak VARCHAR(30) DEFAULT 'maps'`);
    // Mevcut sosyal medya kayıtlarını otomatik işaretle
    await pool.query(`UPDATE potansiyel_musteriler SET kaynak = 'instagram' WHERE kaynak = 'maps' AND google_maps_id LIKE 'instagram_%'`);
    await pool.query(`UPDATE potansiyel_musteriler SET kaynak = 'facebook' WHERE kaynak = 'maps' AND google_maps_id LIKE 'facebook_%'`);
    await pool.query(`UPDATE potansiyel_musteriler SET kaynak = 'tiktok' WHERE kaynak = 'maps' AND google_maps_id LIKE 'tiktok_%'`);
    // Ödemeler tablosu - yeni kolonlar
    await pool.query(`CREATE TABLE IF NOT EXISTS odemeler (
      id SERIAL PRIMARY KEY,
      isletme_id INTEGER REFERENCES isletmeler(id),
      tutar DECIMAL(10,2) NOT NULL,
      donem VARCHAR(7),
      durum VARCHAR(30) DEFAULT 'bekliyor',
      odeme_yontemi VARCHAR(30),
      odeme_tarihi TIMESTAMP,
      iyzico_token VARCHAR(255),
      havale_dekont TEXT,
      olusturma_tarihi TIMESTAMP DEFAULT NOW()
    )`);
    await pool.query(`ALTER TABLE odemeler ADD COLUMN IF NOT EXISTS odeme_yontemi VARCHAR(30)`);
    await pool.query(`ALTER TABLE odemeler ADD COLUMN IF NOT EXISTS iyzico_token VARCHAR(255)`);
    await pool.query(`ALTER TABLE odemeler ADD COLUMN IF NOT EXISTS havale_dekont TEXT`);
    await pool.query(`ALTER TABLE odemeler ADD COLUMN IF NOT EXISTS referans_kodu VARCHAR(30)`);
    // İletişim mesajları
    await pool.query(`CREATE TABLE IF NOT EXISTS iletisim_mesajlari (
      id SERIAL PRIMARY KEY,
      isim VARCHAR(255),
      email VARCHAR(255),
      telefon VARCHAR(20),
      mesaj TEXT,
      kaynak VARCHAR(50) DEFAULT 'web',
      okundu BOOLEAN DEFAULT false,
      olusturma_tarihi TIMESTAMP DEFAULT NOW()
    )`);
    await pool.query(`ALTER TABLE iletisim_mesajlari ADD COLUMN IF NOT EXISTS telefon VARCHAR(20)`);
    await pool.query(`ALTER TABLE iletisim_mesajlari ADD COLUMN IF NOT EXISTS kaynak VARCHAR(50) DEFAULT 'web'`);
    // Satış Bot tablosu
    await pool.query(`CREATE TABLE IF NOT EXISTS satis_konusmalar (
      id SERIAL PRIMARY KEY,
      lead_id INTEGER,
      telefon VARCHAR(50),
      isletme_adi VARCHAR(255),
      kategori VARCHAR(100),
      gonderilen_mesaj TEXT,
      gelen_mesajlar TEXT,
      durum VARCHAR(30) DEFAULT 'bekliyor',
      son_mesaj_tarihi TIMESTAMP,
      olusturma_tarihi TIMESTAMP DEFAULT (NOW() AT TIME ZONE 'Europe/Istanbul')
    )`);
    await pool.query(`ALTER TABLE satis_konusmalar ADD COLUMN IF NOT EXISTS takip_sayisi INTEGER DEFAULT 0`);
    await pool.query(`ALTER TABLE satis_konusmalar ADD COLUMN IF NOT EXISTS son_takip_tarihi TIMESTAMP`);
    await pool.query(`ALTER TABLE potansiyel_musteriler ADD COLUMN IF NOT EXISTS wp_mesaj_durumu VARCHAR(30)`);
    await pool.query(`ALTER TABLE potansiyel_musteriler ADD COLUMN IF NOT EXISTS wp_mesaj_tarihi TIMESTAMP`);
    await pool.query(`ALTER TABLE odemeler ADD COLUMN IF NOT EXISTS shopier_siparis_id VARCHAR(100)`);
    await pool.query(`ALTER TABLE odemeler ADD COLUMN IF NOT EXISTS shopier_urun_id VARCHAR(100)`);
    // WhatsApp LID formatı 20 karakterden uzun — telefon kolonlarını genişlet
    await pool.query(`ALTER TABLE musteriler ALTER COLUMN telefon TYPE VARCHAR(50)`).catch(()=>{});
    await pool.query(`ALTER TABLE bot_durum ALTER COLUMN musteri_telefon TYPE VARCHAR(50)`).catch(()=>{});
    await pool.query(`ALTER TABLE sohbet_gecmisi ALTER COLUMN musteri_telefon TYPE VARCHAR(50)`).catch(()=>{});
    await pool.query(`ALTER TABLE bekleme_listesi ALTER COLUMN musteri_telefon TYPE VARCHAR(50)`).catch(()=>{});
    // Dil tercihi kalıcılığı
    await pool.query(`ALTER TABLE bot_durum ADD COLUMN IF NOT EXISTS secilen_dil VARCHAR(5)`);
    await pool.query(`ALTER TABLE bot_durum ADD COLUMN IF NOT EXISTS secilen_dilim VARCHAR(10)`);
    // Telegram OTP — chat_id eşleşmesi (booking sayfası TG kanalı için)
    await pool.query(`ALTER TABLE bot_durum ADD COLUMN IF NOT EXISTS chat_id VARCHAR(50)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_bot_durum_chat_id ON bot_durum(chat_id) WHERE chat_id IS NOT NULL`);
    // Çok dilli hizmet isimleri
    await pool.query(`ALTER TABLE hizmetler ADD COLUMN IF NOT EXISTS isim_en VARCHAR(100)`);
    await pool.query(`ALTER TABLE hizmetler ADD COLUMN IF NOT EXISTS isim_ar VARCHAR(100)`);

    // ─── KURUMSAL PAKET: ŞUBE GRUPLARI ───
    await pool.query(`CREATE TABLE IF NOT EXISTS sube_gruplari (
      id SERIAL PRIMARY KEY,
      isim VARCHAR(200) NOT NULL,
      slug VARCHAR(100) UNIQUE NOT NULL,
      sahip_kullanici_id INTEGER REFERENCES admin_kullanicilar(id),
      logo TEXT,
      tanitim TEXT,
      renk_tema VARCHAR(20) DEFAULT '#8B5CF6',
      sehirlerarasi BOOLEAN DEFAULT FALSE,
      olusturma_tarihi TIMESTAMP DEFAULT NOW()
    )`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_sube_gruplari_slug ON sube_gruplari(slug)`);
    await pool.query(`ALTER TABLE isletmeler ADD COLUMN IF NOT EXISTS grup_id INTEGER REFERENCES sube_gruplari(id) ON DELETE SET NULL`);
    await pool.query(`ALTER TABLE isletmeler ADD COLUMN IF NOT EXISTS sube_etiketi VARCHAR(100)`);
    await pool.query(`ALTER TABLE isletmeler ADD COLUMN IF NOT EXISTS grup_sira INTEGER DEFAULT 0`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_isletmeler_grup_id ON isletmeler(grup_id)`);
    await pool.query(`ALTER TABLE musteriler ADD COLUMN IF NOT EXISTS grup_id INTEGER REFERENCES sube_gruplari(id) ON DELETE SET NULL`);
    await pool.query(`ALTER TABLE musteriler ADD COLUMN IF NOT EXISTS son_gelinen_isletme_id INTEGER REFERENCES isletmeler(id)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_musteriler_grup_tel ON musteriler(grup_id, telefon) WHERE grup_id IS NOT NULL`);
    await pool.query(`ALTER TABLE admin_kullanicilar ADD COLUMN IF NOT EXISTS grup_id INTEGER REFERENCES sube_gruplari(id)`);

    // ─── BACKFILL: Grup alt şubelerinin NULL paket tarihlerini merkezden kopyala ───
    // (Yeni şube ekleme sırasında kopyalanmayan mevcut kayıtlar için tek seferlik fix)
    await pool.query(`
      UPDATE isletmeler sube
         SET paket = COALESCE(sube.paket, merkez.paket),
             paket_bitis_tarihi = COALESCE(sube.paket_bitis_tarihi, merkez.paket_bitis_tarihi),
             deneme_bitis_tarihi = COALESCE(sube.deneme_bitis_tarihi, merkez.deneme_bitis_tarihi)
        FROM (
          SELECT DISTINCT ON (grup_id) grup_id, paket, paket_bitis_tarihi, deneme_bitis_tarihi
            FROM isletmeler
           WHERE grup_id IS NOT NULL
           ORDER BY grup_id, id
        ) merkez
       WHERE sube.grup_id = merkez.grup_id
         AND sube.id <> (SELECT MIN(id) FROM isletmeler WHERE grup_id = sube.grup_id)
         AND (sube.paket_bitis_tarihi IS NULL OR sube.deneme_bitis_tarihi IS NULL)
    `);

    // ─── Bozuk slug'ları düzelt (boşluk, büyük harf, Türkçe karakter içerenler) ───
    await pool.query(`
      UPDATE isletmeler
         SET slug = LOWER(
           REGEXP_REPLACE(
             REGEXP_REPLACE(
               REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(
               REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(
                 isim,
                 'ğ','g'),'ü','u'),'ş','s'),'ı','i'),'ö','o'),'ç','c'),
                 'Ğ','g'),'Ü','u'),'Ş','s'),'İ','i'),'Ö','o'),'Ç','c'),
               '[^a-zA-Z0-9]+', '-', 'g'),
             '(^-|-$)', '', 'g')
         ) || '-' || id
       WHERE slug IS NOT NULL AND slug ~ '[^a-z0-9\\-]'
    `);

    // ─── KAPORA SİSTEMİ ───
    await pool.query(`ALTER TABLE hizmetler ADD COLUMN IF NOT EXISTS kapora_yuzdesi INTEGER DEFAULT 0`);
    await pool.query(`ALTER TABLE isletmeler ADD COLUMN IF NOT EXISTS kapora_aktif BOOLEAN DEFAULT false`);
    await pool.query(`ALTER TABLE randevular ADD COLUMN IF NOT EXISTS kapora_durumu VARCHAR(30) DEFAULT 'yok'`); // yok, bekliyor, odendi, iade
    await pool.query(`ALTER TABLE randevular ADD COLUMN IF NOT EXISTS kapora_tutari DECIMAL(10,2) DEFAULT 0`);
    await pool.query(`ALTER TABLE randevular ADD COLUMN IF NOT EXISTS kapora_link TEXT`);
    await pool.query(`ALTER TABLE randevular ADD COLUMN IF NOT EXISTS kapora_shopier_urun_id VARCHAR(100)`);

    // ─── PERSONEL BAZLI YÖNETİM ───
    // Çalışan kişisel mesai saatleri
    await pool.query(`ALTER TABLE calisanlar ADD COLUMN IF NOT EXISTS calisma_baslangic TIME`);
    await pool.query(`ALTER TABLE calisanlar ADD COLUMN IF NOT EXISTS calisma_bitis TIME`);
    await pool.query(`ALTER TABLE calisanlar ADD COLUMN IF NOT EXISTS kapali_gunler VARCHAR(50) DEFAULT ''`);
    await pool.query(`ALTER TABLE calisanlar ADD COLUMN IF NOT EXISTS mola_saatleri JSONB DEFAULT '[]'`);
    // Çalışan-hizmet eşleştirme tablosu
    await pool.query(`CREATE TABLE IF NOT EXISTS calisan_hizmetler (
      id SERIAL PRIMARY KEY,
      calisan_id INTEGER REFERENCES calisanlar(id) ON DELETE CASCADE,
      hizmet_id INTEGER REFERENCES hizmetler(id) ON DELETE CASCADE,
      UNIQUE(calisan_id, hizmet_id)
    )`);

    // ─── SATIŞ BOT ÇOKLU NUMARA ───
    await pool.query(`CREATE TABLE IF NOT EXISTS satis_bot_numaralar (
      id SERIAL PRIMARY KEY,
      isim VARCHAR(100) DEFAULT 'Numara',
      telefon VARCHAR(50),
      durum VARCHAR(30) DEFAULT 'bekliyor',
      gonderim_sayisi INTEGER DEFAULT 0,
      son_gonderim TIMESTAMP,
      ban_tarihi TIMESTAMP,
      ban_notu TEXT,
      olusturma_tarihi TIMESTAMP DEFAULT NOW()
    )`);

    // ─── AUDIT LOG (Sistem Logları) ───
    await pool.query(`CREATE TABLE IF NOT EXISTS audit_log (
      id SERIAL PRIMARY KEY,
      isletme_id INTEGER,
      kullanici_id INTEGER,
      kullanici_email VARCHAR(200),
      islem VARCHAR(100) NOT NULL,
      detay TEXT,
      hedef_tablo VARCHAR(100),
      hedef_id INTEGER,
      ip_adresi VARCHAR(50),
      olusturma_tarihi TIMESTAMP DEFAULT NOW()
    )`);

    // ─── DESTEK TALEPLERİ (Ticket Sistemi) ───
    await pool.query(`CREATE TABLE IF NOT EXISTS destek_talepleri (
      id SERIAL PRIMARY KEY,
      isletme_id INTEGER REFERENCES isletmeler(id) ON DELETE CASCADE,
      kullanici_id INTEGER,
      konu VARCHAR(200) NOT NULL,
      mesaj TEXT NOT NULL,
      oncelik VARCHAR(20) DEFAULT 'normal',
      durum VARCHAR(30) DEFAULT 'acik',
      admin_yanit TEXT,
      admin_yanit_tarihi TIMESTAMP,
      olusturma_tarihi TIMESTAMP DEFAULT NOW()
    )`);

    // ─── GLOBAL DUYURULAR ───
    await pool.query(`CREATE TABLE IF NOT EXISTS duyurular (
      id SERIAL PRIMARY KEY,
      baslik VARCHAR(300) NOT NULL,
      mesaj TEXT NOT NULL,
      tip VARCHAR(30) DEFAULT 'bilgi',
      aktif BOOLEAN DEFAULT true,
      hedef VARCHAR(30) DEFAULT 'hepsi',
      olusturma_tarihi TIMESTAMP DEFAULT NOW()
    )`);

    // ─── REFERANS (Affiliate) SİSTEMİ ───
    await pool.query(`CREATE TABLE IF NOT EXISTS referanslar (
      id SERIAL PRIMARY KEY,
      referans_kodu VARCHAR(50) UNIQUE NOT NULL,
      sahip_isletme_id INTEGER REFERENCES isletmeler(id) ON DELETE CASCADE,
      kazanilan_ay INTEGER DEFAULT 0,
      toplam_davet INTEGER DEFAULT 0,
      olusturma_tarihi TIMESTAMP DEFAULT NOW()
    )`);
    await pool.query(`ALTER TABLE isletmeler ADD COLUMN IF NOT EXISTS referans_kodu VARCHAR(50)`);
    await pool.query(`ALTER TABLE isletmeler ADD COLUMN IF NOT EXISTS referans_ile_gelen INTEGER`);
    await pool.query(`ALTER TABLE referanslar ADD COLUMN IF NOT EXISTS bedava_gun INTEGER DEFAULT 30`);
    await pool.query(`ALTER TABLE referanslar ADD COLUMN IF NOT EXISTS min_davet INTEGER DEFAULT 1`);
    await pool.query(`ALTER TABLE isletmeler ADD COLUMN IF NOT EXISTS paket_bitis_tarihi TIMESTAMP`);
    await pool.query(`ALTER TABLE isletmeler ADD COLUMN IF NOT EXISTS deneme_bitis_tarihi TIMESTAMP`);
    // Mevcut işletmeler: deneme_bitis_tarihi boşsa olusturma_tarihi + 7 gün set et
    await pool.query(`UPDATE isletmeler SET deneme_bitis_tarihi = olusturma_tarihi + INTERVAL '7 days' WHERE deneme_bitis_tarihi IS NULL AND olusturma_tarihi IS NOT NULL`);

    // ─── DİNAMİK PAKETLER ───
    await pool.query(`CREATE TABLE IF NOT EXISTS paket_tanimlari (
      id SERIAL PRIMARY KEY,
      kod VARCHAR(50) UNIQUE NOT NULL,
      isim VARCHAR(100) NOT NULL,
      fiyat DECIMAL(10,2) NOT NULL,
      calisan_limit INTEGER DEFAULT 1,
      hizmet_limit INTEGER DEFAULT 5,
      aylik_randevu_limit INTEGER DEFAULT 100,
      bot_aktif BOOLEAN DEFAULT true,
      hatirlatma BOOLEAN DEFAULT false,
      istatistik BOOLEAN DEFAULT false,
      export_aktif BOOLEAN DEFAULT false,
      ozellikler TEXT,
      aktif BOOLEAN DEFAULT true,
      sira INTEGER DEFAULT 0,
      olusturma_tarihi TIMESTAMP DEFAULT NOW()
    )`);

    // ─── WHATSAPP AUTH (Session verileri DB'de) ───
    await pool.query(`CREATE TABLE IF NOT EXISTS wa_auth_keys (
      id SERIAL PRIMARY KEY,
      isletme_id INTEGER NOT NULL,
      key_id VARCHAR(500) NOT NULL,
      key_data TEXT,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW(),
      UNIQUE(isletme_id, key_id)
    )`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_wa_auth_isletme ON wa_auth_keys(isletme_id)`);

    // ─── MÜŞTERİ ETİKETLEME (Mini-CRM) ───
    await pool.query(`CREATE TABLE IF NOT EXISTS musteri_etiketler (
      id SERIAL PRIMARY KEY,
      isletme_id INTEGER NOT NULL REFERENCES isletmeler(id) ON DELETE CASCADE,
      isim VARCHAR(100) NOT NULL,
      renk VARCHAR(20) DEFAULT '#6366f1',
      olusturma_tarihi TIMESTAMP DEFAULT NOW(),
      UNIQUE(isletme_id, isim)
    )`);
    await pool.query(`CREATE TABLE IF NOT EXISTS musteri_etiket_atamalari (
      id SERIAL PRIMARY KEY,
      musteri_telefon VARCHAR(50) NOT NULL,
      etiket_id INTEGER NOT NULL REFERENCES musteri_etiketler(id) ON DELETE CASCADE,
      isletme_id INTEGER NOT NULL,
      olusturma_tarihi TIMESTAMP DEFAULT NOW(),
      UNIQUE(musteri_telefon, etiket_id)
    )`);

    // ─── GOOGLE YORUM FEEDBACK ───
    await pool.query(`CREATE TABLE IF NOT EXISTS google_yorum_talepleri (
      id SERIAL PRIMARY KEY,
      isletme_id INTEGER NOT NULL REFERENCES isletmeler(id) ON DELETE CASCADE,
      randevu_id INTEGER REFERENCES randevular(id) ON DELETE SET NULL,
      musteri_telefon VARCHAR(50) NOT NULL,
      gonderim_zamani TIMESTAMP,
      gonderildi BOOLEAN DEFAULT false,
      yildiz INTEGER,
      olusturma_tarihi TIMESTAMP DEFAULT NOW()
    )`);
    await pool.query(`ALTER TABLE isletmeler ADD COLUMN IF NOT EXISTS google_maps_url TEXT`);
    await pool.query(`ALTER TABLE isletmeler ADD COLUMN IF NOT EXISTS google_yorum_aktif BOOLEAN DEFAULT false`);

    // ─── KAMPANYA BROADCAST GELİŞTİRME ───
    await pool.query(`ALTER TABLE kampanyalar ADD COLUMN IF NOT EXISTS hedef_etiket_id INTEGER`);
    await pool.query(`ALTER TABLE kampanyalar ADD COLUMN IF NOT EXISTS kanal VARCHAR(20) DEFAULT 'hepsi'`);
    await pool.query(`ALTER TABLE kampanyalar ADD COLUMN IF NOT EXISTS toplam_hedef INTEGER DEFAULT 0`);
    await pool.query(`ALTER TABLE kampanyalar ADD COLUMN IF NOT EXISTS basarili INTEGER DEFAULT 0`);
    await pool.query(`ALTER TABLE kampanyalar ADD COLUMN IF NOT EXISTS basarisiz INTEGER DEFAULT 0`);

    // ─── RANDEVU MODLARI ───
    await pool.query(`ALTER TABLE isletmeler ADD COLUMN IF NOT EXISTS randevu_modu VARCHAR(20) DEFAULT 'sirali'`);
    await pool.query(`ALTER TABLE isletmeler ADD COLUMN IF NOT EXISTS calisan_secim_modu VARCHAR(20) DEFAULT 'musteri'`);
    await pool.query(`ALTER TABLE isletmeler ADD COLUMN IF NOT EXISTS randevu_onay_modu VARCHAR(20) DEFAULT 'otomatik'`);

    // ─── ONLINE RANDEVU LİNKİ ───
    await pool.query(`ALTER TABLE isletmeler ADD COLUMN IF NOT EXISTS slug VARCHAR(100) UNIQUE`);
    await pool.query(`ALTER TABLE randevular ADD COLUMN IF NOT EXISTS kaynak VARCHAR(30) DEFAULT 'bot'`);

    // ─── KASA TAKİBİ (Adisyon) ───
    await pool.query(`CREATE TABLE IF NOT EXISTS kasa_hareketleri (
      id SERIAL PRIMARY KEY,
      isletme_id INTEGER NOT NULL REFERENCES isletmeler(id) ON DELETE CASCADE,
      tip VARCHAR(10) NOT NULL,
      tutar DECIMAL(10,2) NOT NULL,
      aciklama VARCHAR(300),
      kategori VARCHAR(50) DEFAULT 'diger',
      odeme_yontemi VARCHAR(30) DEFAULT 'nakit',
      randevu_id INTEGER REFERENCES randevular(id) ON DELETE SET NULL,
      tarih DATE DEFAULT CURRENT_DATE,
      olusturan_id INTEGER,
      olusturma_tarihi TIMESTAMP DEFAULT NOW()
    )`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_kasa_isletme_tarih ON kasa_hareketleri(isletme_id, tarih)`);

    // ─── PRİM HESAPLAMA ───
    await pool.query(`ALTER TABLE calisanlar ADD COLUMN IF NOT EXISTS prim_yuzdesi INTEGER DEFAULT 10`);
    await pool.query(`CREATE TABLE IF NOT EXISTS prim_odemeleri (
      id SERIAL PRIMARY KEY,
      isletme_id INTEGER NOT NULL REFERENCES isletmeler(id) ON DELETE CASCADE,
      calisan_id INTEGER NOT NULL REFERENCES calisanlar(id) ON DELETE CASCADE,
      donem VARCHAR(7) NOT NULL,
      toplam_ciro DECIMAL(10,2) DEFAULT 0,
      prim_yuzdesi INTEGER DEFAULT 10,
      prim_tutari DECIMAL(10,2) DEFAULT 0,
      durum VARCHAR(20) DEFAULT 'bekliyor',
      odeme_tarihi TIMESTAMP,
      olusturma_tarihi TIMESTAMP DEFAULT NOW()
    )`);

    // ─── SMS HATIRLATMA (NetGSM) ───
    await pool.query(`ALTER TABLE randevular ADD COLUMN IF NOT EXISTS sms_hatirlatma_gonderildi BOOLEAN DEFAULT false`);
    await pool.query(`ALTER TABLE isletmeler ADD COLUMN IF NOT EXISTS sms_aktif BOOLEAN DEFAULT false`);
    await pool.query(`ALTER TABLE isletmeler ADD COLUMN IF NOT EXISTS netgsm_kullanici_adi VARCHAR(100)`);
    await pool.query(`ALTER TABLE isletmeler ADD COLUMN IF NOT EXISTS netgsm_sifre VARCHAR(100)`);
    await pool.query(`ALTER TABLE isletmeler ADD COLUMN IF NOT EXISTS netgsm_baslik VARCHAR(20)`);
    await pool.query(`ALTER TABLE isletmeler ADD COLUMN IF NOT EXISTS sms_hatirlatma_dk INTEGER DEFAULT 60`);
    await pool.query(`ALTER TABLE isletmeler ADD COLUMN IF NOT EXISTS sms_onay_aktif BOOLEAN DEFAULT false`);
    await pool.query(`CREATE TABLE IF NOT EXISTS sms_log (
      id SERIAL PRIMARY KEY,
      isletme_id INTEGER NOT NULL REFERENCES isletmeler(id) ON DELETE CASCADE,
      telefon VARCHAR(20) NOT NULL,
      mesaj TEXT,
      tip VARCHAR(30) DEFAULT 'hatirlatma',
      durum VARCHAR(20) DEFAULT 'gonderildi',
      netgsm_id VARCHAR(50),
      tarih TIMESTAMP DEFAULT NOW()
    )`);

    // ─── OTOMATİK GECE RAPORU ───
    await pool.query(`ALTER TABLE isletmeler ADD COLUMN IF NOT EXISTS gece_raporu_aktif BOOLEAN DEFAULT false`);
    await pool.query(`ALTER TABLE isletmeler ADD COLUMN IF NOT EXISTS gece_raporu_saat VARCHAR(5) DEFAULT '22:00'`);
    await pool.query(`ALTER TABLE isletmeler ADD COLUMN IF NOT EXISTS gece_raporu_kanal VARCHAR(20) DEFAULT 'whatsapp'`);
    await pool.query(`ALTER TABLE isletmeler ADD COLUMN IF NOT EXISTS gece_raporu_telefon VARCHAR(20)`);
    await pool.query(`CREATE TABLE IF NOT EXISTS gece_rapor_log (
      id SERIAL PRIMARY KEY,
      isletme_id INTEGER NOT NULL REFERENCES isletmeler(id) ON DELETE CASCADE,
      tarih DATE DEFAULT CURRENT_DATE,
      kanal VARCHAR(20) DEFAULT 'whatsapp',
      rapor_icerik TEXT,
      durum VARCHAR(20) DEFAULT 'gonderildi',
      gonderim_tarihi TIMESTAMP DEFAULT NOW()
    )`);

    // ─── YORUM AVCISI (Google Review) ───
    await pool.query(`ALTER TABLE isletmeler ADD COLUMN IF NOT EXISTS yorum_avcisi_aktif BOOLEAN DEFAULT false`);
    await pool.query(`ALTER TABLE isletmeler ADD COLUMN IF NOT EXISTS google_maps_link VARCHAR(500)`);
    await pool.query(`ALTER TABLE isletmeler ADD COLUMN IF NOT EXISTS yorum_gecikme_dk INTEGER DEFAULT 60`);
    await pool.query(`ALTER TABLE isletmeler ADD COLUMN IF NOT EXISTS yorum_mesaj_sablonu TEXT`);
    await pool.query(`CREATE TABLE IF NOT EXISTS yorum_talepleri (
      id SERIAL PRIMARY KEY,
      isletme_id INTEGER NOT NULL REFERENCES isletmeler(id) ON DELETE CASCADE,
      randevu_id INTEGER REFERENCES randevular(id) ON DELETE SET NULL,
      musteri_id INTEGER REFERENCES musteriler(id) ON DELETE SET NULL,
      telefon VARCHAR(20),
      gonderim_zamani TIMESTAMP NOT NULL,
      durum VARCHAR(20) DEFAULT 'bekliyor',
      gonderim_tarihi TIMESTAMP,
      olusturma_tarihi TIMESTAMP DEFAULT NOW()
    )`);

    // ─── KAYIP MÜŞTERİ KURTARMA (Win-back) ───
    await pool.query(`ALTER TABLE isletmeler ADD COLUMN IF NOT EXISTS winback_aktif BOOLEAN DEFAULT false`);
    await pool.query(`ALTER TABLE isletmeler ADD COLUMN IF NOT EXISTS winback_gun_esik INTEGER DEFAULT 45`);
    await pool.query(`ALTER TABLE isletmeler ADD COLUMN IF NOT EXISTS winback_indirim INTEGER DEFAULT 10`);
    await pool.query(`ALTER TABLE isletmeler ADD COLUMN IF NOT EXISTS winback_mesaj_sablonu TEXT`);
    await pool.query(`CREATE TABLE IF NOT EXISTS winback_log (
      id SERIAL PRIMARY KEY,
      isletme_id INTEGER NOT NULL REFERENCES isletmeler(id) ON DELETE CASCADE,
      musteri_id INTEGER REFERENCES musteriler(id) ON DELETE SET NULL,
      telefon VARCHAR(20),
      son_randevu_tarihi DATE,
      gun_sayisi INTEGER,
      durum VARCHAR(20) DEFAULT 'gonderildi',
      kurtarildi BOOLEAN DEFAULT false,
      kurtarma_tarihi TIMESTAMP,
      gonderim_tarihi TIMESTAMP DEFAULT NOW()
    )`);

    // ─── SADAKAT PUAN SİSTEMİ ───
    await pool.query(`ALTER TABLE isletmeler ADD COLUMN IF NOT EXISTS sadakat_aktif BOOLEAN DEFAULT false`);
    await pool.query(`ALTER TABLE isletmeler ADD COLUMN IF NOT EXISTS puan_oran_tl INTEGER DEFAULT 1`);
    await pool.query(`ALTER TABLE isletmeler ADD COLUMN IF NOT EXISTS puan_oran_puan INTEGER DEFAULT 1`);
    await pool.query(`ALTER TABLE isletmeler ADD COLUMN IF NOT EXISTS odul_esik INTEGER DEFAULT 1000`);
    await pool.query(`ALTER TABLE isletmeler ADD COLUMN IF NOT EXISTS odul_hizmet_id INTEGER`);
    await pool.query(`ALTER TABLE musteriler ADD COLUMN IF NOT EXISTS puan_bakiye INTEGER DEFAULT 0`);
    await pool.query(`ALTER TABLE musteriler ADD COLUMN IF NOT EXISTS toplam_kazanilan_puan INTEGER DEFAULT 0`);
    await pool.query(`ALTER TABLE musteriler ADD COLUMN IF NOT EXISTS toplam_harcanan_puan INTEGER DEFAULT 0`);
    await pool.query(`CREATE TABLE IF NOT EXISTS puan_hareketleri (
      id SERIAL PRIMARY KEY,
      isletme_id INTEGER NOT NULL REFERENCES isletmeler(id) ON DELETE CASCADE,
      musteri_id INTEGER NOT NULL REFERENCES musteriler(id) ON DELETE CASCADE,
      randevu_id INTEGER REFERENCES randevular(id) ON DELETE SET NULL,
      tip VARCHAR(20) NOT NULL,
      puan INTEGER NOT NULL,
      aciklama TEXT,
      tarih TIMESTAMP DEFAULT NOW()
    )`);

    // ─── REFERANS AĞI ───
    await pool.query(`ALTER TABLE isletmeler ADD COLUMN IF NOT EXISTS referans_aktif BOOLEAN DEFAULT false`);
    await pool.query(`ALTER TABLE isletmeler ADD COLUMN IF NOT EXISTS referans_puan_davet INTEGER DEFAULT 200`);
    await pool.query(`ALTER TABLE isletmeler ADD COLUMN IF NOT EXISTS referans_puan_davetli INTEGER DEFAULT 100`);
    await pool.query(`ALTER TABLE musteriler ADD COLUMN IF NOT EXISTS referans_kodu VARCHAR(10)`);
    await pool.query(`ALTER TABLE musteriler ADD COLUMN IF NOT EXISTS referans_ile_gelen BOOLEAN DEFAULT false`);
    await pool.query(`ALTER TABLE musteriler ADD COLUMN IF NOT EXISTS davet_eden_id INTEGER`);
    await pool.query(`CREATE TABLE IF NOT EXISTS referans_log (
      id SERIAL PRIMARY KEY,
      isletme_id INTEGER NOT NULL REFERENCES isletmeler(id) ON DELETE CASCADE,
      davet_eden_id INTEGER REFERENCES musteriler(id) ON DELETE SET NULL,
      davetli_id INTEGER REFERENCES musteriler(id) ON DELETE SET NULL,
      davetli_telefon VARCHAR(20),
      referans_kodu VARCHAR(10),
      durum VARCHAR(20) DEFAULT 'bekliyor',
      puan_verildi BOOLEAN DEFAULT false,
      tarih TIMESTAMP DEFAULT NOW()
    )`);

    // ─── DOĞUM GÜNÜ PAZARLAMASI ───
    await pool.query(`ALTER TABLE isletmeler ADD COLUMN IF NOT EXISTS dogum_gunu_aktif BOOLEAN DEFAULT false`);
    await pool.query(`ALTER TABLE isletmeler ADD COLUMN IF NOT EXISTS dogum_gunu_indirim INTEGER DEFAULT 30`);
    await pool.query(`ALTER TABLE isletmeler ADD COLUMN IF NOT EXISTS dogum_gunu_mesaj_sablonu TEXT`);
    await pool.query(`ALTER TABLE musteriler ADD COLUMN IF NOT EXISTS dogum_tarihi DATE`);
    await pool.query(`CREATE TABLE IF NOT EXISTS dogum_gunu_log (
      id SERIAL PRIMARY KEY,
      isletme_id INTEGER NOT NULL REFERENCES isletmeler(id) ON DELETE CASCADE,
      musteri_id INTEGER REFERENCES musteriler(id) ON DELETE SET NULL,
      indirim INTEGER,
      durum VARCHAR(20) DEFAULT 'gonderildi',
      gonderim_tarihi TIMESTAMP DEFAULT NOW()
    )`);

    // ─── SATIŞ BOT ŞABLONLAR ───
    await pool.query(`CREATE TABLE IF NOT EXISTS satis_bot_sablonlar (
      id SERIAL PRIMARY KEY,
      isim VARCHAR(100) NOT NULL,
      mesaj TEXT NOT NULL,
      kategori VARCHAR(50) DEFAULT 'genel',
      aktif BOOLEAN DEFAULT true,
      gonderim_modu VARCHAR(20) DEFAULT 'rastgele',
      gonderilen INTEGER DEFAULT 0,
      cevap_gelen INTEGER DEFAULT 0,
      olumlu INTEGER DEFAULT 0,
      olumsuz INTEGER DEFAULT 0,
      olusturma_tarihi TIMESTAMP DEFAULT (NOW() AT TIME ZONE 'Europe/Istanbul')
    )`);
    await pool.query(`ALTER TABLE satis_konusmalar ADD COLUMN IF NOT EXISTS sablon_id INTEGER`);

    // Varsayılan şablonları ekle (yoksa)
    const mevcutSablon = (await pool.query('SELECT COUNT(*) as c FROM satis_bot_sablonlar')).rows[0];
    if (parseInt(mevcutSablon.c) === 0) {
      await pool.query(`INSERT INTO satis_bot_sablonlar (isim, mesaj, kategori) VALUES
        ('Acı Noktası', 'Selam {isletme_sahibi}, müşteri işlemdeyken çalan telefonlara bakmak veya mesajlara yetişmek vakit ve müşteri kaybettirir. {isletme_adi} randevularını 7/24 otomatik veren WhatsApp botumuza devretmek ister misiniz? Sistemin nasıl çalıştığını gösteren 1 dakikalık kısa bir video iletebilirim.', 'genel'),
        ('Kolaylık Odaklı', 'Merhaba {isletme_sahibi}, müşterilerinize uygulama indirtmeden, sadece WhatsApp üzerinden kendi kendilerine randevu aldırabileceğiniz AI sistemimizi {kategori} salonları için aktif ettik. İlk ay ücretsiz geçiş için 5 dakikalık demo linki göndereyim mi?', 'genel')
      `);
    }

    // ─── ŞABLON V2 GÜNCELLEMESİ ───
    // Eski düşük dönüşümlü şablonları pasifle, yeni A/B test şablonları ekle
    try {
      // "Soru Soran" → pasif
      await pool.query("UPDATE satis_bot_sablonlar SET aktif = false WHERE isim = 'Soru Soran' AND aktif = true");
      // "Bey" kaldır — cinsiyet nötr
      await pool.query("UPDATE satis_bot_sablonlar SET mesaj = REPLACE(mesaj, '{isletme_sahibi} Bey', '{isletme_sahibi}') WHERE mesaj LIKE '%{isletme_sahibi} Bey%'");
      // "Değer Öneren" ve "Rakip Müşterisi" → sil (0 gönderim veya düşük performans)
      await pool.query("DELETE FROM satis_bot_sablonlar WHERE isim = 'Değer Öneren' AND gonderilen = 0");
      await pool.query("DELETE FROM satis_bot_sablonlar WHERE isim = 'Rakip Müşterisi'");
      // Yeni şablonlar (yoksa ekle)
      const aciNokta = (await pool.query("SELECT id FROM satis_bot_sablonlar WHERE isim = 'Acı Noktası'")).rows[0];
      if (!aciNokta) {
        await pool.query("INSERT INTO satis_bot_sablonlar (isim, mesaj, kategori) VALUES ('Acı Noktası', 'Selam {isletme_sahibi}, müşteri işlemdeyken çalan telefonlara bakmak veya mesajlara yetişmek vakit ve müşteri kaybettirir. {isletme_adi} randevularını 7/24 otomatik veren WhatsApp botumuza devretmek ister misiniz? Sistemin nasıl çalıştığını gösteren 1 dakikalık kısa bir video iletebilirim.', 'genel')");
      }
      const kolaylik = (await pool.query("SELECT id FROM satis_bot_sablonlar WHERE isim = 'Kolaylık Odaklı'")).rows[0];
      if (!kolaylik) {
        await pool.query("INSERT INTO satis_bot_sablonlar (isim, mesaj, kategori) VALUES ('Kolaylık Odaklı', 'Merhaba {isletme_sahibi}, müşterilerinize uygulama indirtmeden, sadece WhatsApp üzerinden kendi kendilerine randevu aldırabileceğiniz AI sistemimizi {kategori} salonları için aktif ettik. İlk ay ücretsiz geçiş için 5 dakikalık demo linki göndereyim mi?', 'genel')");
      }
      console.log('✅ Satış bot şablonları v2 güncellendi');
    } catch(e) { console.log('⚠️ Şablon güncelleme notu:', e.message); }

    // ─── SATIŞ KAMPANYALARI (SEGMENTASYON MOTORU) ───
    await pool.query(`CREATE TABLE IF NOT EXISTS satis_kampanyalar (
      id SERIAL PRIMARY KEY,
      isim VARCHAR(100) NOT NULL,
      kategori VARCHAR(100) NOT NULL,
      aktif BOOLEAN DEFAULT true,
      oncelik INTEGER DEFAULT 0,
      min_skor INTEGER DEFAULT 0,
      mesai_baslangic INTEGER DEFAULT 10,
      mesai_bitis INTEGER DEFAULT 18,
      gunler INTEGER[] DEFAULT '{1,2,3,4,5}',
      gunluk_limit INTEGER DEFAULT 20,
      gonderilen INTEGER DEFAULT 0,
      bugun_gonderilen INTEGER DEFAULT 0,
      bugun_tarihi DATE DEFAULT CURRENT_DATE,
      cevap_gelen INTEGER DEFAULT 0,
      olumlu INTEGER DEFAULT 0,
      olusturma_tarihi TIMESTAMP DEFAULT (NOW() AT TIME ZONE 'Europe/Istanbul')
    )`);
    await pool.query(`ALTER TABLE satis_bot_sablonlar ADD COLUMN IF NOT EXISTS kampanya_id INTEGER`);

    // Seed: Sektöre özel kampanyalar + şablonlar (yoksa)
    try {
      const kampanyaVar = (await pool.query('SELECT COUNT(*) as c FROM satis_kampanyalar')).rows[0];
      if (parseInt(kampanyaVar.c) === 0) {
        const kampanyaSeed = [
          { isim:'Berber Kampanyası', kategori:'berber', gunler:'{1,2}', basla:10, bit:14, oncelik:10,
            s1:{ isim:'Berber — Telefon Kabusu', mesaj:'Selam, müşteri işlemdeyken çalan telefonlara bakmak veya mesajlara yetişmek vakit ve müşteri kaybettirir.\n\n{isletme_adi} randevularını 7/24 otomatik veren WhatsApp botumuza devretmek ister misiniz?\n\nSistemin nasıl çalıştığını gösteren 1 dakikalık kısa bir video iletebilirim.' },
            s2:{ isim:'Berber — Kolay Sistem', mesaj:'Merhaba, müşterilerinize uygulama indirtmeden, sadece WhatsApp üzerinden kendi kendilerine randevu aldırabileceğiniz bir sistem kurduk.\n\n{isletme_adi} için ilk ay ücretsiz — demo linki göndereyim mi?' }
          },
          { isim:'Kuaför Kampanyası', kategori:'kuaför', gunler:'{1,3}', basla:10, bit:14, oncelik:10,
            s1:{ isim:'Kuaför — Telefon Çalıyor', mesaj:'Merhaba, müşterilerinize uygulama indirtmeden, sadece WhatsApp üzerinden kendi kendilerine randevu aldırabileceğiniz AI sistemimizi aktif ettik.\n\n{isletme_adi} için ilk ay ücretsiz geçiş — 5 dakikalık demo linki göndereyim mi?' },
            s2:{ isim:'Kuaför — Müşteri Kaybı', mesaj:'Selam, müşteri saçını boyatırken telefon çalıyor, açamıyorsunuz — o arayan müşteri başka salona gidiyor.\n\n{isletme_adi} randevularını WhatsApp botu otomatik alsın. İlk ay ücretsiz, demo atayım mı?' }
          },
          { isim:'Güzellik Salonu Kampanyası', kategori:'güzellik salonu', gunler:'{2,4}', basla:11, bit:15, oncelik:8,
            s1:{ isim:'Güzellik — Hizmet Seçimi', mesaj:'Selam, saçtan tırnağa 10 farklı hizmetiniz var ama müşteri telefon açıp "bugün müsait misiniz" diye soruyor değil mi?\n\n{isletme_adi} için hizmet seçimli online randevu botu kurduk. Müşteri kendisi seçiyor, siz onaylıyorsunuz. İlk ay ücretsiz — bakmak ister misiniz?' },
            s2:{ isim:'Güzellik — Otomatik', mesaj:'Merhaba, müşterileriniz hizmet seçip WhatsApp\'tan kendi kendine randevu alsın, siz müşteriyle ilgilenin.\n\n{isletme_adi} için ilk ay ücretsiz. 2 dakikada aktif — demo atayım mı?' }
          },
          { isim:'Diyetisyen Kampanyası', kategori:'diyetisyen', gunler:'{3,5}', basla:9, bit:12, oncelik:7,
            s1:{ isim:'Diyetisyen — Kontrol Kaçırma', mesaj:'Merhaba, danışanlarınız 7/24 WhatsApp\'tan randevu alsın, otomatik hatırlatma gitsin, randevu kaçırma bitsin.\n\n{isletme_adi} için ilk ay ücretsiz — demo atayım mı?' },
            s2:{ isim:'Diyetisyen — 7/24 Randevu', mesaj:'Selam, danışanlarınız mesai dışında da randevu alabilsin. {isletme_adi} WhatsApp botu 7/24 çalışır, siz onaylarsınız.\n\nİlk ay ücretsiz — bakmak ister misiniz?' }
          },
          { isim:'Diş Kliniği Kampanyası', kategori:'diş kliniği', gunler:'{2,4}', basla:12, bit:14, oncelik:9,
            s1:{ isim:'Diş — Sekreter Yükü', mesaj:'Merhaba, hasta telefonla randevu alıp gelmiyor — sekreter gününün yarısını telefonda geçiriyor.\n\n{isletme_adi} için otomatik randevu + WhatsApp hatırlatma sistemi kurduk. İptal oranı %80 düşüyor. Demo atayım mı?' },
            s2:{ isim:'Diş — Otomatik Hatırlatma', mesaj:'Selam, hastalarınız 7/24 online randevu alsın, randevu öncesi otomatik WhatsApp hatırlatma gitsin.\n\n{isletme_adi} için ilk ay ücretsiz — sekreter yükünü azaltmak ister misiniz?' }
          },
          { isim:'Veteriner Kampanyası', kategori:'veteriner', gunler:'{1,3}', basla:10, bit:13, oncelik:7,
            s1:{ isim:'Veteriner — Muayene Telefon', mesaj:'Merhaba, evcil hayvan sahipleri genelde acil arıyor ama siz muayenedeyken telefona bakamıyorsunuz.\n\n{isletme_adi} için WhatsApp\'tan 7/24 otomatik randevu sistemi kurduk. İlk ay ücretsiz — demo atayım mı?' },
            s2:{ isim:'Veteriner — Otomatik', mesaj:'Selam, {isletme_adi} müşterileri evcil dostları için WhatsApp\'tan randevu alsın, hatırlatma otomatik gitsin.\n\nİlk ay ücretsiz — bakmak ister misiniz?' }
          },
          { isim:'Spa Kampanyası', kategori:'spa', gunler:'{1,2}', basla:11, bit:15, oncelik:6,
            s1:{ isim:'Spa — Otomatik Randevu', mesaj:'Merhaba, müşterileriniz hizmet ve saat seçip WhatsApp\'tan kendi kendine randevu alsın. Siz rahat edin.\n\n{isletme_adi} için ilk ay ücretsiz — demo atayım mı?' },
            s2:{ isim:'Spa — Doluluk', mesaj:'Selam, hafta içi boş kalan seanslarınız var mı? {isletme_adi} müşterileri WhatsApp\'tan anlık müsaitliği görüp randevu alsın.\n\nİlk ay ücretsiz — bakmak ister misiniz?' }
          },
          { isim:'Dövme Kampanyası', kategori:'dövme', gunler:'{3,5}', basla:13, bit:17, oncelik:6,
            s1:{ isim:'Dövme — DM Karışıklığı', mesaj:'Selam, dövme randevusu uzun süreç — mesajlaşma, tasarım onayı, tarih ayarlama. Hepsini tek yerden yönetebileceğiniz bir sistem kurduk.\n\n{isletme_adi} için ilk ay ücretsiz. Demo atayım mı?' },
            s2:{ isim:'Dövme — Otomatik Hatırlatma', mesaj:'Merhaba, {isletme_adi} müşterileri WhatsApp\'tan randevu alsın, otomatik hatırlatma gitsin, randevu kaçırma bitsin.\n\nİlk ay ücretsiz — bakmak ister misiniz?' }
          },
          { isim:'Tırnak Salonu Kampanyası', kategori:'tırnak salonu', gunler:'{2,4}', basla:10, bit:14, oncelik:7,
            s1:{ isim:'Tırnak — Müşteri Kaybı', mesaj:'Selam, müşteriniz işlem sırasında telefonunuza bakamıyorsunuz — o arayan müşteri başka salona gidiyor.\n\n{isletme_adi} için WhatsApp randevu botu kurduk. İlk ay ücretsiz — bakmak ister misiniz?' },
            s2:{ isim:'Tırnak — Kolay Randevu', mesaj:'Merhaba, müşterileriniz hizmet seçip WhatsApp\'tan randevu alsın, hatırlatma otomatik gitsin.\n\n{isletme_adi} için ilk ay ücretsiz — demo atayım mı?' }
          },
          { isim:'Cilt Bakım Kampanyası', kategori:'cilt bakım', gunler:'{3,5}', basla:10, bit:14, oncelik:7,
            s1:{ isim:'Cilt Bakım — Düzenlilik', mesaj:'Selam, cilt bakımı düzenli seans gerektirir ama müşteriler unutuyor. {isletme_adi} için otomatik hatırlatmalı randevu sistemi kurduk.\n\nİlk ay ücretsiz — demo atayım mı?' },
            s2:{ isim:'Cilt Bakım — Kolay Randevu', mesaj:'Merhaba, müşterileriniz WhatsApp\'tan hizmet seçip anında randevu alsın.\n\n{isletme_adi} için ilk ay ücretsiz. 2 dakikada aktif — bakmak ister misiniz?' }
          }
        ];
        for (const k of kampanyaSeed) {
          const kRes = await pool.query(
            `INSERT INTO satis_kampanyalar (isim, kategori, gunler, mesai_baslangic, mesai_bitis, oncelik)
             VALUES ($1,$2,$3::int[],$4,$5,$6) RETURNING id`,
            [k.isim, k.kategori, k.gunler, k.basla, k.bit, k.oncelik]
          );
          const kId = kRes.rows[0].id;
          await pool.query(
            `INSERT INTO satis_bot_sablonlar (isim, mesaj, kategori, kampanya_id) VALUES ($1,$2,$3,$4)`,
            [k.s1.isim, k.s1.mesaj, k.kategori, kId]
          );
          await pool.query(
            `INSERT INTO satis_bot_sablonlar (isim, mesaj, kategori, kampanya_id) VALUES ($1,$2,$3,$4)`,
            [k.s2.isim, k.s2.mesaj, k.kategori, kId]
          );
        }
        console.log('✅ Sektöre özel kampanyalar + şablonlar oluşturuldu (10 kampanya, 20 şablon)');
      }
    } catch(e) { console.log('⚠️ Kampanya seed notu:', e.message); }

    // ─── İŞLETME ONBOARDING ───
    await pool.query(`ALTER TABLE isletmeler ADD COLUMN IF NOT EXISTS onboarding_adim INTEGER DEFAULT 0`);
    await pool.query(`ALTER TABLE isletmeler ADD COLUMN IF NOT EXISTS onboarding_tamamlandi BOOLEAN DEFAULT false`);
    await pool.query(`ALTER TABLE isletmeler ADD COLUMN IF NOT EXISTS onboarding_profil BOOLEAN DEFAULT false`);
    await pool.query(`ALTER TABLE isletmeler ADD COLUMN IF NOT EXISTS onboarding_hizmet BOOLEAN DEFAULT false`);
    await pool.query(`ALTER TABLE isletmeler ADD COLUMN IF NOT EXISTS onboarding_calisan BOOLEAN DEFAULT false`);
    await pool.query(`ALTER TABLE isletmeler ADD COLUMN IF NOT EXISTS onboarding_bot BOOLEAN DEFAULT false`);
    await pool.query(`ALTER TABLE isletmeler ADD COLUMN IF NOT EXISTS onboarding_randevu BOOLEAN DEFAULT false`);

    // ─── ZOMBİ OTOMATİK AKSİYON ───
    await pool.query(`CREATE TABLE IF NOT EXISTS zombi_aksiyonlar (
      id SERIAL PRIMARY KEY,
      isletme_id INTEGER NOT NULL REFERENCES isletmeler(id) ON DELETE CASCADE,
      aksiyon_tipi VARCHAR(30) NOT NULL,
      mesaj TEXT,
      durum VARCHAR(20) DEFAULT 'bekliyor',
      sonuc TEXT,
      olusturma_tarihi TIMESTAMP DEFAULT (NOW() AT TIME ZONE 'Europe/Istanbul'),
      uygulama_tarihi TIMESTAMP
    )`);
    await pool.query(`ALTER TABLE isletmeler ADD COLUMN IF NOT EXISTS zombi_uyari_gonderildi BOOLEAN DEFAULT false`);
    await pool.query(`ALTER TABLE isletmeler ADD COLUMN IF NOT EXISTS zombi_uyari_tarihi TIMESTAMP`);

    // ─── İŞLETME BİLDİRİMLERİ ───
    await pool.query(`CREATE TABLE IF NOT EXISTS isletme_bildirimleri (
      id SERIAL PRIMARY KEY,
      isletme_id INTEGER NOT NULL REFERENCES isletmeler(id) ON DELETE CASCADE,
      tip VARCHAR(30) NOT NULL,
      baslik VARCHAR(255) NOT NULL,
      mesaj TEXT,
      okundu BOOLEAN DEFAULT false,
      link VARCHAR(255),
      olusturma_tarihi TIMESTAMP DEFAULT (NOW() AT TIME ZONE 'Europe/Istanbul')
    )`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_bildirim_isletme ON isletme_bildirimleri(isletme_id, okundu)`);
    // Bildirim tercihleri
    await pool.query(`ALTER TABLE isletmeler ADD COLUMN IF NOT EXISTS bildirim_panel BOOLEAN DEFAULT true`);
    await pool.query(`ALTER TABLE isletmeler ADD COLUMN IF NOT EXISTS bildirim_whatsapp BOOLEAN DEFAULT true`);
    await pool.query(`ALTER TABLE isletmeler ADD COLUMN IF NOT EXISTS bildirim_sms BOOLEAN DEFAULT false`);

    // ─── DİNAMİK SÜRE + TAMPON ───
    await pool.query(`ALTER TABLE hizmetler ADD COLUMN IF NOT EXISTS tampon_dk INTEGER DEFAULT 0`);
    await pool.query(`ALTER TABLE isletmeler ADD COLUMN IF NOT EXISTS varsayilan_tampon_dk INTEGER DEFAULT 5`);
    await pool.query(`ALTER TABLE isletmeler ADD COLUMN IF NOT EXISTS slot_aralik_dk INTEGER DEFAULT 30`);

    // ─── WEB PUSH ABONELİKLERİ ───
    await pool.query(`CREATE TABLE IF NOT EXISTS push_subscriptions (
      id SERIAL PRIMARY KEY,
      isletme_id INTEGER REFERENCES isletmeler(id) ON DELETE CASCADE,
      kullanici_id INTEGER,
      endpoint TEXT UNIQUE NOT NULL,
      p256dh TEXT NOT NULL,
      auth TEXT NOT NULL,
      user_agent TEXT,
      olusturma_tarihi TIMESTAMP DEFAULT NOW()
    )`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_push_isletme ON push_subscriptions(isletme_id)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_push_kullanici ON push_subscriptions(kullanici_id)`);

    // Avcı Bot — arama/filtre için index'ler (her biri bağımsız try/catch, pg_trgm yoksa da çalışır)
    try { await pool.query(`CREATE EXTENSION IF NOT EXISTS pg_trgm`); } catch (e) { console.log('⚠️ pg_trgm extension yok, trigram index atlanıyor:', e.message); }
    try { await pool.query(`CREATE INDEX IF NOT EXISTS idx_pm_isletme_adi_trgm ON potansiyel_musteriler USING gin (isletme_adi gin_trgm_ops)`); }
    catch (e) { try { await pool.query(`CREATE INDEX IF NOT EXISTS idx_pm_isletme_adi_lower ON potansiyel_musteriler (LOWER(isletme_adi))`); } catch(_) {} }
    try { await pool.query(`CREATE INDEX IF NOT EXISTS idx_pm_telefon ON potansiyel_musteriler (telefon)`); } catch (e) {}
    try { await pool.query(`CREATE INDEX IF NOT EXISTS idx_pm_sehir_ilce ON potansiyel_musteriler (sehir, ilce)`); } catch (e) {}
    try { await pool.query(`CREATE INDEX IF NOT EXISTS idx_pm_kategori ON potansiyel_musteriler (kategori)`); } catch (e) {}

    // Avcı Bot — ONE-TIME: kirli ilçe kayıtlarını adresten yeniden tespit et (idempotent, sadece ilk defa)
    try {
      await pool.query(`CREATE TABLE IF NOT EXISTS _avci_migrations (
        flag TEXT PRIMARY KEY,
        applied_at TIMESTAMP DEFAULT NOW()
      )`);
      const applied = await pool.query(
        `INSERT INTO _avci_migrations (flag) VALUES ('ilce_repair_v1')
         ON CONFLICT (flag) DO NOTHING RETURNING flag`
      );
      if (applied.rowCount > 0) {
        console.log('🧹 Avcı ilçe onarımı başlıyor (one-time)...');
        const avciBot = require('./services/avciBot');
        const r = await avciBot.ilceleriYenidenHesapla();
        console.log(`✅ Avcı ilçe onarımı: ${r.duzeltildi} düzeltildi, ${r.temizlendi} temizlendi, ${r.degismedi} değişmedi (toplam ${r.toplam})`);
      }
    } catch (e) { console.log('⚠️ Avcı ilçe onarımı atlandı:', e.message); }

    // ═══════════════════════════════════════════════════
    // 🛡️ GÜVENLIK + SALDIRI KORUMA MIGRATION (v2)
    // ═══════════════════════════════════════════════════

    // Booking Gate — işletme WA bağlayana kadar /book/:slug kapalı
    await pool.query(`ALTER TABLE isletmeler ADD COLUMN IF NOT EXISTS booking_acik BOOLEAN DEFAULT false`);

    // Güvenlik ayarları (esnaf kontrol)
    await pool.query(`ALTER TABLE isletmeler ADD COLUMN IF NOT EXISTS otp_zorunlu BOOLEAN DEFAULT false`);
    await pool.query(`ALTER TABLE isletmeler ADD COLUMN IF NOT EXISTS no_show_otomatik BOOLEAN DEFAULT true`);
    await pool.query(`ALTER TABLE isletmeler ADD COLUMN IF NOT EXISTS teyit_zincir_iptal BOOLEAN DEFAULT false`);
    await pool.query(`ALTER TABLE isletmeler ADD COLUMN IF NOT EXISTS dusuk_skor_manuel_onay BOOLEAN DEFAULT false`);
    await pool.query(`ALTER TABLE isletmeler ADD COLUMN IF NOT EXISTS ip_gunluk_limit INT DEFAULT 5`);
    await pool.query(`ALTER TABLE isletmeler ADD COLUMN IF NOT EXISTS skor_esigi INT DEFAULT 30`);

    // Güven skoru (cross-business — müşteri global skoru)
    await pool.query(`ALTER TABLE musteriler ADD COLUMN IF NOT EXISTS guven_skoru INT DEFAULT 50`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_musteriler_guven ON musteriler(guven_skoru)`);

    // Merkez OTP Bot — SıraGO sistem numaraları (esnaf WA'sı yoksa fallback)
    await pool.query(`CREATE TABLE IF NOT EXISTS merkez_otp_bot (
      id SERIAL PRIMARY KEY,
      numara TEXT UNIQUE,
      auth_id INT UNIQUE,
      durum VARCHAR(20) DEFAULT 'kapali',
      qr_base64 TEXT,
      gunluk_gonderim INT DEFAULT 0,
      bugun_tarihi DATE,
      aktif BOOLEAN DEFAULT true,
      olusturma TIMESTAMP DEFAULT NOW()
    )`);

    // IP bazlı günlük randevu sayacı
    await pool.query(`CREATE TABLE IF NOT EXISTS ip_randevu_log (
      id SERIAL PRIMARY KEY,
      ip TEXT NOT NULL,
      isletme_id INT,
      tarih DATE NOT NULL,
      sayi INT DEFAULT 1,
      olusturma TIMESTAMP DEFAULT NOW(),
      UNIQUE(ip, isletme_id, tarih)
    )`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_ip_randevu_ip_tarih ON ip_randevu_log(ip, tarih)`);

    // Fingerprint bazlı spam tespiti
    await pool.query(`CREATE TABLE IF NOT EXISTS fingerprint_log (
      hash TEXT NOT NULL,
      telefon TEXT,
      tarih DATE NOT NULL,
      sayi INT DEFAULT 1,
      PRIMARY KEY(hash, tarih, telefon)
    )`);

    // Güvenlik olay log (dashboard istatistik)
    await pool.query(`CREATE TABLE IF NOT EXISTS guvenlik_olay_log (
      id SERIAL PRIMARY KEY,
      isletme_id INT,
      tip VARCHAR(30),
      detay TEXT,
      ip TEXT,
      telefon TEXT,
      zaman TIMESTAMP DEFAULT NOW()
    )`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_guvenlik_olay_isletme_zaman ON guvenlik_olay_log(isletme_id, zaman)`);

    // No-show basamaklı ceza için kara_liste'de sebep detayı
    await pool.query(`ALTER TABLE kara_liste ADD COLUMN IF NOT EXISTS ilk_ihlal_zamani TIMESTAMP`);
    await pool.query(`ALTER TABLE kara_liste ADD COLUMN IF NOT EXISTS son_ihlal_zamani TIMESTAMP`);
    await pool.query(`ALTER TABLE kara_liste ADD COLUMN IF NOT EXISTS bloke_bitis TIMESTAMP`);

    // Hali hazırda WA bağlı işletmeler için booking_acik'i true yap
    await pool.query(`
      UPDATE isletmeler SET booking_acik = true 
      WHERE id IN (SELECT DISTINCT isletme_id FROM wa_auth_keys) 
      AND booking_acik IS NOT true
    `);

    // ═══════════════════════════════════════════════════
    // 🚀 AVCI BOT — TOPLU TARAMA JOB SİSTEMİ (Manyak Mod)
    // ═══════════════════════════════════════════════════
    await pool.query(`CREATE TABLE IF NOT EXISTS avci_tarama_joblari (
      id SERIAL PRIMARY KEY,
      job_id TEXT UNIQUE NOT NULL,
      baslik TEXT,
      durum TEXT DEFAULT 'bekliyor',
      sehirler TEXT[] NOT NULL,
      kategoriler TEXT[] NOT NULL,
      toplam_sorgu INT DEFAULT 0,
      tamamlanan_sorgu INT DEFAULT 0,
      basarili_sorgu INT DEFAULT 0,
      hatali_sorgu INT DEFAULT 0,
      yeni_eklenen INT DEFAULT 0,
      zaten_var INT DEFAULT 0,
      toplam_bulunan INT DEFAULT 0,
      baslangic_tarihi TIMESTAMP DEFAULT NOW(),
      bitis_tarihi TIMESTAMP,
      son_guncelleme TIMESTAMP DEFAULT NOW(),
      preset TEXT,
      ayarlar JSONB DEFAULT '{}'::jsonb,
      hata_mesaji TEXT
    )`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_avci_job_durum ON avci_tarama_joblari(durum, baslangic_tarihi DESC)`);

    await pool.query(`CREATE TABLE IF NOT EXISTS avci_tarama_detay (
      id SERIAL PRIMARY KEY,
      job_id TEXT NOT NULL,
      sehir TEXT NOT NULL,
      kategori TEXT NOT NULL,
      durum TEXT DEFAULT 'bekliyor',
      tamamlanan_sorgu INT DEFAULT 0,
      yeni_eklenen INT DEFAULT 0,
      zaten_var INT DEFAULT 0,
      baslangic TIMESTAMP,
      bitis TIMESTAMP,
      hata_mesaji TEXT,
      UNIQUE(job_id, sehir, kategori)
    )`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_avci_tarama_detay_job ON avci_tarama_detay(job_id)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_avci_tarama_detay_durum ON avci_tarama_detay(durum)`);

    // ═══════════════════════════════════════════════════
    // 🧾 ÇOKLU HİZMET (Saç + Sakal + ...) — Junction tablo
    // ═══════════════════════════════════════════════════
    await pool.query(`CREATE TABLE IF NOT EXISTS randevu_hizmetleri (
      id SERIAL PRIMARY KEY,
      randevu_id INTEGER NOT NULL REFERENCES randevular(id) ON DELETE CASCADE,
      hizmet_id INTEGER NOT NULL REFERENCES hizmetler(id) ON DELETE RESTRICT,
      sira SMALLINT DEFAULT 0,
      fiyat NUMERIC(10,2),
      sure_dk INTEGER,
      UNIQUE(randevu_id, hizmet_id)
    )`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_randevu_hizmetleri_randevu ON randevu_hizmetleri(randevu_id)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_randevu_hizmetleri_hizmet ON randevu_hizmetleri(hizmet_id)`);

    // ⬇️ BACKFILL: Mevcut randevular için junction tabloya tek-hizmet kayıtları at.
    // Sadece junction'da hiç kaydı olmayan randevular için yapılır (idempotent).
    // Try-catch ile sarıldı — migration başarısız olursa diğer başlatmalar etkilenmesin.
    try {
      const bf = await pool.query(`
        INSERT INTO randevu_hizmetleri (randevu_id, hizmet_id, sira, fiyat, sure_dk)
        SELECT r.id, r.hizmet_id, 0, h.fiyat, h.sure_dk
        FROM randevular r
        LEFT JOIN hizmetler h ON h.id = r.hizmet_id
        LEFT JOIN randevu_hizmetleri rh ON rh.randevu_id = r.id
        WHERE r.hizmet_id IS NOT NULL AND rh.id IS NULL
      `);
      if (bf.rowCount > 0) console.log(`📋 Junction backfill: ${bf.rowCount} randevu aktarıldı`);
    } catch (bfErr) {
      console.log('⚠️ Junction backfill atlandı:', bfErr.message);
    }

    // Premium paket için imza gizleme kolonu (ileride kullanılacak)
    await pool.query(`ALTER TABLE isletmeler ADD COLUMN IF NOT EXISTS imza_gizle BOOLEAN DEFAULT false`);

    // ═══════════════════════════════════════════════════
    // 📅 GOOGLE CALENDAR 2-WAY SYNC
    // ═══════════════════════════════════════════════════
    await pool.query(`ALTER TABLE isletmeler ADD COLUMN IF NOT EXISTS timezone TEXT DEFAULT 'Europe/Istanbul'`);
    await pool.query(`CREATE TABLE IF NOT EXISTS google_calendar_auth (
      id SERIAL PRIMARY KEY,
      isletme_id INTEGER NOT NULL REFERENCES isletmeler(id) ON DELETE CASCADE,
      google_email TEXT,
      access_token TEXT NOT NULL,
      refresh_token TEXT NOT NULL,
      expires_at TIMESTAMPTZ,
      calendar_id TEXT DEFAULT 'primary',
      sync_aktif BOOLEAN DEFAULT true,
      freebusy_kontrol BOOLEAN DEFAULT true,
      son_senkron TIMESTAMPTZ,
      olusturma_tarihi TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(isletme_id)
    )`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_gcal_auth_isletme ON google_calendar_auth(isletme_id)`);
    // Randevu ↔ Google event eşleşme
    await pool.query(`ALTER TABLE randevular ADD COLUMN IF NOT EXISTS google_event_id TEXT`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_randevular_google_event ON randevular(google_event_id) WHERE google_event_id IS NOT NULL`);

    console.log('✅ DB migration kontrolü tamamlandı (güvenlik v2 + avcı job + google calendar dahil)');

    // Dosya tabanlı migration'ları çalıştır
    const migrationRunner = require('./utils/migrationRunner');
    await migrationRunner.calistir();
  } catch (e) {
    console.log('⚠️ Migration hatası (önemsiz olabilir):', e.message);
  }
})();

// Middleware - Güvenlik
app.set('trust proxy', 1); // Render reverse proxy
app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false }));

const allowedOrigins = [
  'http://localhost:5173', 'http://localhost:3000',
  'https://randevugo-admin.onrender.com', 'https://randevugo-admin-v2.onrender.com',
  'https://randevugo-api.onrender.com', 'https://randevugo-api-v2.onrender.com',
  'https://admin.xn--srago-n4a.com', 'https://xn--srago-n4a.com',
  process.env.ADMIN_PANEL_URL, process.env.FRONTEND_URL
].filter(Boolean);

// 🛡️ CORS kontrolü — origin listesi + regex fallback (Render auto-URL'ler, siragO subdomain'leri)
const corsCheck = (origin) => {
  if (!origin) return true; // curl/SSR istekleri
  if (allowedOrigins.includes(origin)) return true;
  // Render'ın otomatik dağıttığı URL'ler (randevugo-*, randevugo-*-v2, vb.)
  if (/^https:\/\/randevugo[a-z0-9-]*\.onrender\.com$/i.test(origin)) return true;
  // siragO ana alan + tüm subdomain'ler (punycode dahil)
  if (/^https:\/\/([a-z0-9-]+\.)?(xn--srago-n4a|sirago)\.com$/i.test(origin)) return true;
  console.log('⚠️ CORS reject:', origin);
  return false;
};

app.use(cors({
  origin: (origin, callback) => {
    if (corsCheck(origin)) callback(null, true);
    else callback(null, false); // throw yok → 500 vermez, silent reject
  },
  credentials: true
}));

// Rate limiting
const apiLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 600, message: { hata: 'Çok fazla istek. 15 dakika sonra tekrar deneyin.' } });
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 20, message: { hata: 'Çok fazla giriş denemesi. 15 dakika sonra tekrar deneyin.' } });
const publicFormLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 30, message: { hata: 'Çok fazla istek. Lütfen bekleyin.' } });
const bookingLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 200, message: { hata: 'Çok fazla randevu isteği.' } });
const webhookLimiter = rateLimit({ windowMs: 1 * 60 * 1000, max: 100, message: 'Too many requests' });

app.use(express.json({
  limit: '10mb',
  verify: (req, res, buf) => { req.rawBody = buf.toString(); }
}));
app.use(express.urlencoded({ extended: true })); // Twilio webhook için
app.use(express.static(require('path').join(__dirname, 'public')));

// Health check for Render (must be before apiLimiter)
app.get('/api/health', (req, res) => {
  res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
});

// API Routes — stricter rate limits for public endpoints
app.use('/api/auth', authLimiter);
app.use('/api/iletisim', publicFormLimiter);
app.use('/api/referans/kullan', publicFormLimiter);
app.use('/api/book', bookingLimiter);
app.use('/api/webhook', webhookLimiter);
app.use('/api', apiLimiter, apiRoutes);

// Online Booking sayfası — /book/:slug
app.get('/book/:slug', (req, res) => {
  const dosya = require('path').join(__dirname, 'public', 'booking.html');
  const fs = require('fs');
  if (!fs.existsSync(dosya)) {
    console.error('❌ booking.html bulunamadı:', dosya);
    return res.status(404).send('Booking sayfası bulunamadı. Path: ' + dosya);
  }
  res.sendFile(dosya);
});

// Grup Booking sayfası — /g/:slug
app.get('/g/:slug', (req, res) => {
  const dosya = require('path').join(__dirname, 'public', 'booking.html');
  res.sendFile(dosya);
});

// Ana sayfa - Landing page
app.get('/', (req, res) => {
  res.sendFile(require('path').join(__dirname, 'public', 'index.html'));
});

// Global error handler — her zaman JSON döndür
app.use((err, req, res, next) => {
  console.error('❌ Unhandled error:', err.message);
  res.status(err.status || 500).json({ hata: err.message || 'Sunucu hatası' });
});

// HTTP sunucu + Socket.IO (CORS check fonksiyonunu geçir, böylece regex de çalışır)
const httpServer = http.createServer(app);
socketServer.init(httpServer, allowedOrigins, corsCheck);

// Sunucuyu başlat
httpServer.listen(PORT, () => {
  const baseUrl = process.env.BASE_URL || `http://localhost:${PORT}`;
  console.log(`\n🚀 RandevuGO API çalışıyor: ${baseUrl}`);
  console.log(`📡 WhatsApp Webhook: ${baseUrl}/api/webhook/whatsapp`);
  console.log(`🔌 Socket.IO aktif`);
  console.log(`🏥 Health Check: ${baseUrl}/api/health\n`);
  
  // WhatsApp servisini başlat
  whatsappService.init();

  // Auto-migration: yeni feature kolonları
  try {
    const migrations = [
      "ALTER TABLE randevular ADD COLUMN IF NOT EXISTS onbes_dk_gonderildi BOOLEAN DEFAULT false",
      "ALTER TABLE randevular ADD COLUMN IF NOT EXISTS rebook_gonderildi BOOLEAN DEFAULT false",
      "ALTER TABLE randevular ADD COLUMN IF NOT EXISTS form_cevaplari JSONB DEFAULT NULL",
      "ALTER TABLE isletmeler ADD COLUMN IF NOT EXISTS hatirlatma_zinciri_aktif BOOLEAN DEFAULT true",
      "ALTER TABLE isletmeler ADD COLUMN IF NOT EXISTS haftalik_rapor_aktif BOOLEAN DEFAULT false",
      "ALTER TABLE isletmeler ADD COLUMN IF NOT EXISTS rebook_aktif BOOLEAN DEFAULT true",
      "ALTER TABLE isletmeler ADD COLUMN IF NOT EXISTS google_maps_reserve_url TEXT DEFAULT NULL",
      "ALTER TABLE isletmeler ADD COLUMN IF NOT EXISTS musteri_formu JSONB DEFAULT NULL",
      "ALTER TABLE bekleme_listesi ADD COLUMN IF NOT EXISTS bildirim_zamani TIMESTAMPTZ DEFAULT NULL",
      "ALTER TABLE bekleme_listesi ADD COLUMN IF NOT EXISTS bildirim_sayisi INT DEFAULT 0",
    ];
    Promise.all(migrations.map(m => pool.query(m).catch(() => {})))
      .then(() => console.log('✅ Auto-migration tamamlandı'))
      .catch(() => {});
  } catch(e) { console.log('⚠️ Migration hatası:', e.message); }

  // Cleanup: test duyurularını sil
  try { pool.query("DELETE FROM duyurular WHERE baslik ILIKE '%battık%' OR baslik ILIKE '%test%duyuru%'").then(r => { if (r.rowCount > 0) console.log(`🧹 ${r.rowCount} test duyurusu silindi`); }); } catch(e) {}

  // 🚀 Avcı toplu tarama — yarım kalan (pending/calisiyor) job'ları devam ettir
  try {
    setTimeout(async () => {
      try {
        const avciBot = require('./services/avciBot');
        const sayi = await avciBot.pendingJoblariDevam();
        if (sayi > 0) console.log(`🔄 Avcı: ${sayi} yarım kalan toplu tarama job'u devam ettirildi`);
      } catch(e) { console.log('⚠️ Avcı job resume hatası:', e.message); }
    }, 5000); // 5sn sonra (DB migration'ların bitmesini bekle)
  } catch(e) {}
  
  // Hatırlatma cron job'ını başlat (production'da sadece ENABLE_CRON=true ise)
  if (process.env.ENABLE_CRON !== 'false') {
    hatirlatmaService.baslat();
    // Gece raporu servisi + Haftalık rapor
    try { const geceRaporu = require('./services/geceRaporu'); geceRaporu.baslat(); geceRaporu.haftalikCronBaslat(); } catch (e) { console.error('Gece raporu başlatma hatası:', e.message); }
    // 🎂 Doğum günü pazarlaması (her gün 10:00)
    try { const dogumGunu = require('./services/dogumGunu'); dogumGunu.baslat(); } catch (e) { console.error('Doğum günü servisi başlatma hatası:', e.message); }
  }

  // Google Yorum Feedback cron (Premium)
  try {
    const googleYorumService = require('./services/googleYorumService');
    googleYorumService.baslat();
  } catch (e) {
    console.log('⚠️ Google Yorum servisi başlatma hatası:', e.message);
  }
  
  // Aylık otomatik ödeme kaydı servisi
  odemeService.baslat();

  // Telegram botlarını başlat
  telegramService.tumBotlariBaşlat();

  // WhatsApp Web servisini başlat
  whatsappWebService.tumIsletmeleriBaslat();

  // Satış botunu otomatik başlat (auth varsa bağlanır, yoksa QR bekler)
  try {
    const satisBot = require('./services/satisBot');
    console.log('🤖 Satış Bot otomatik başlatılıyor...');
    satisBot.baslat();
  } catch (e) {
    console.log('⚠️ Satış Bot otomatik başlatma hatası:', e.message);
  }

  // 📞 SıraGO Merkez OTP Bot (esnaf WA'sı yoksa fallback)
  try {
    const merkezOtpBot = require('./services/merkezOtpBot');
    console.log('📞 Merkez OTP Bot başlatılıyor...');
    merkezOtpBot.baslat();
  } catch (e) {
    console.log('⚠️ Merkez OTP Bot başlatma hatası:', e.message);
  }

  // 🕛 Otomatik no-show cron (her 10 dk)
  try {
    const otomatikNoShow = require('./services/otomatikNoShow');
    console.log('🕛 Otomatik no-show cron başlatılıyor...');
    otomatikNoShow.baslat();
  } catch (e) {
    console.log('⚠️ Otomatik no-show başlatma hatası:', e.message);
  }

  // Telegram Kayıt Botu (siragoapp_bot)
  try {
    console.log('🤖 TG Kayıt Botu başlatılıyor...');
    telegramSatisBot.baslat();
  } catch (e) {
    console.log('⚠️ TG Kayıt Bot başlatma hatası:', e.message);
  }

  // Render keep-alive: 14 dakikada bir self-ping (uyku modunu engelle)
  const keepAliveUrl = process.env.BASE_URL || `http://localhost:${PORT}`;
  setInterval(async () => {
    try {
      const https = require('https');
      const http = require('http');
      const mod = keepAliveUrl.startsWith('https') ? https : http;
      mod.get(`${keepAliveUrl}/api/health`, (res) => {
        console.log(`🏓 Keep-alive ping: ${res.statusCode}`);
      }).on('error', (e) => {
        console.log('🏓 Keep-alive ping hatası:', e.message);
      });
    } catch (e) {}
  }, 14 * 60 * 1000); // 14 dakika
  console.log('🏓 Keep-alive başlatıldı (14dk aralıklarla)');
});

module.exports = app;
