process.env.TZ = 'Europe/Istanbul';

const express = require('express');
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
    // Çok dilli hizmet isimleri
    await pool.query(`ALTER TABLE hizmetler ADD COLUMN IF NOT EXISTS isim_en VARCHAR(100)`);
    await pool.query(`ALTER TABLE hizmetler ADD COLUMN IF NOT EXISTS isim_ar VARCHAR(100)`);

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
            s1:{ isim:'Berber — Sıra Bekleme', mesaj:'Selam {isletme_sahibi}, sıra bekleyen müşteri geri dönmüyor — bunu biliyorsunuz. {isletme_adi} için 7/24 online randevu sistemi kuruyoruz: müşteri telefondan sırasını alır, siz kesime odaklanırsınız. 1 dakikalık demo video göndereyim mi?' },
            s2:{ isim:'Berber — Hatırlatma', mesaj:'Merhaba {isletme_sahibi}, müşterileriniz randevu saatini unutup gelmiyor mu? {isletme_adi} için WhatsApp üzerinden otomatik hatırlatma gönderen bir sistem kurduk. İlk ay ücretsiz — denemek ister misiniz?' }
          },
          { isim:'Kuaför Kampanyası', kategori:'kuaför', gunler:'{1,3}', basla:10, bit:14, oncelik:10,
            s1:{ isim:'Kuaför — Telefon Çalıyor', mesaj:'Selam {isletme_sahibi}, boya uygularken telefon çaldığında ne yapıyorsunuz? {isletme_adi} randevularını 7/24 WhatsApp botu alsın, siz işinize odaklanın. Sistemin nasıl çalıştığını gösteren 1 dk video göndereyim mi?' },
            s2:{ isim:'Kuaför — Dijital Geçiş', mesaj:'Merhaba {isletme_sahibi}, sektördeki salonların %40\'ı online randevuya geçti. {isletme_adi} müşterileri de telefondan randevu alsın, WhatsApp ile hatırlatma gitsin. İlk ay bizden — ne dersiniz?' }
          },
          { isim:'Güzellik Salonu Kampanyası', kategori:'güzellik salonu', gunler:'{2,4}', basla:11, bit:15, oncelik:8,
            s1:{ isim:'Güzellik — Rutin Randevu', mesaj:'Selam {isletme_sahibi}, cilt bakımı düzenli randevu gerektirir ama müşteriler sıklıkla unutuyor. {isletme_adi} için WhatsApp hatırlatmalı randevu sistemi kurduk — müşteri kaybını ciddi azaltır. Demo göstereyim mi?' },
            s2:{ isim:'Güzellik — Hizmet Seçimi', mesaj:'Merhaba {isletme_sahibi}, müşterileriniz hangi hizmeti alacağını telefondan seçip randevu alsın, siz de doluluk oranınızı artırın. {isletme_adi} için ilk ay ücretsiz — 5 dk demo linki göndereyim mi?' }
          },
          { isim:'Diyetisyen Kampanyası', kategori:'diyetisyen', gunler:'{3,5}', basla:9, bit:12, oncelik:7,
            s1:{ isim:'Diyetisyen — Kontrol Randevusu', mesaj:'Selam {isletme_sahibi}, danışanlarınız kontrol randevusunu kaçırınca diyet programı yarıda kalıyor. {isletme_adi} için otomatik hatırlatmalı randevu sistemi kurduk — danışan takibi kolaylaşır. Detay vereyim mi?' },
            s2:{ isim:'Diyetisyen — 7/24 Randevu', mesaj:'Merhaba {isletme_sahibi}, danışanlarınız mesai saati dışında da randevu alabilsin. {isletme_adi} WhatsApp botu 7/24 çalışır, siz sadece onaylarsınız. İlk ay ücretsiz — ilgilenir misiniz?' }
          },
          { isim:'Diş Kliniği Kampanyası', kategori:'diş kliniği', gunler:'{2,4}', basla:12, bit:14, oncelik:9,
            s1:{ isim:'Diş — Sekreter Yükü', mesaj:'Selam {isletme_sahibi}, sekreteriniz telefon trafiğiyle boğuluyor mu? {isletme_adi} hastaları WhatsApp üzerinden 7/24 randevu alabilir — sekreter yükü %70 azalır. 1 dk demo göndereyim mi?' },
            s2:{ isim:'Diş — Randevu Kaçırma', mesaj:'Merhaba {isletme_sahibi}, hastalar randevuyu unutup gelmediğinde hem gelir kaybı hem boş koltuk oluşuyor. {isletme_adi} için otomatik WhatsApp hatırlatma sistemi kurduk. İlk ay ücretsiz deneyin — ne dersiniz?' }
          },
          { isim:'Veteriner Kampanyası', kategori:'veteriner', gunler:'{1,3}', basla:10, bit:13, oncelik:7,
            s1:{ isim:'Veteriner — Aşı Takibi', mesaj:'Selam {isletme_sahibi}, evcil hayvan sahipleri aşı ve kontrol tarihini unutunca hayvan sağlığı risk altına giriyor. {isletme_adi} için otomatik hatırlatmalı randevu sistemi — sahipler zamanında gelir. Demo göstereyim mi?' },
            s2:{ isim:'Veteriner — Online Randevu', mesaj:'Merhaba {isletme_sahibi}, müşterileriniz evcil dostları için 7/24 online randevu alsın, WhatsApp ile hatırlatma gitsin. {isletme_adi} için ilk ay ücretsiz — ilgilenir misiniz?' }
          },
          { isim:'Spa Kampanyası', kategori:'spa', gunler:'{1,2}', basla:11, bit:15, oncelik:6,
            s1:{ isim:'Spa — Doluluk Artışı', mesaj:'Selam {isletme_sahibi}, hafta içi boş kalan seanslarınız mı var? {isletme_adi} müşterileri WhatsApp\'tan anlık müsaitliği görüp randevu alsın — doluluk oranı artar. Demo göndereyim mi?' },
            s2:{ isim:'Spa — Rahatlık', mesaj:'Merhaba {isletme_sahibi}, müşterileriniz telefon açmadan WhatsApp\'tan hizmet seçip randevu alsın. {isletme_adi} için 7/24 çalışan AI asistan — ilk ay ücretsiz. Ne dersiniz?' }
          },
          { isim:'Dövme Kampanyası', kategori:'dövme', gunler:'{3,5}', basla:13, bit:17, oncelik:6,
            s1:{ isim:'Dövme — Randevu Karışıklığı', mesaj:'Selam {isletme_sahibi}, DM\'den gelen randevu isteklerini takip etmek zor mu? {isletme_adi} için tek panelden randevu yönetimi + WhatsApp hatırlatma sistemi kurduk. 1 dk demo göndereyim mi?' },
            s2:{ isim:'Dövme — Profesyonel Sistem', mesaj:'Merhaba {isletme_sahibi}, müşterileriniz online randevu alsın, siz de takvimi tek ekrandan yönetin. {isletme_adi} için ilk ay ücretsiz — denemek ister misiniz?' }
          },
          { isim:'Tırnak Salonu Kampanyası', kategori:'tırnak salonu', gunler:'{2,4}', basla:10, bit:14, oncelik:7,
            s1:{ isim:'Tırnak — Müşteri Kaybı', mesaj:'Selam {isletme_sahibi}, telefonla randevu alamayan müşteri rakibe gidiyor. {isletme_adi} için 7/24 WhatsApp randevu sistemi kurduk — müşteri kaybını önler. Demo göstereyim mi?' },
            s2:{ isim:'Tırnak — Hatırlatma', mesaj:'Merhaba {isletme_sahibi}, müşterileriniz nail art randevusunu unutup gelmiyor mu? {isletme_adi} için WhatsApp hatırlatma sistemi kurduk — ilk ay ücretsiz. İlgilenir misiniz?' }
          },
          { isim:'Cilt Bakım Kampanyası', kategori:'cilt bakım', gunler:'{3,5}', basla:10, bit:14, oncelik:7,
            s1:{ isim:'Cilt Bakım — Düzenlilik', mesaj:'Selam {isletme_sahibi}, cilt bakımı düzenli seans gerektirir ama müşteriler sıklıkla unutuyor. {isletme_adi} için otomatik hatırlatmalı randevu sistemi — müşteri kaybı biter. Demo göndereyim mi?' },
            s2:{ isim:'Cilt Bakım — Kolay Randevu', mesaj:'Merhaba {isletme_sahibi}, müşterileriniz WhatsApp\'tan hizmet seçip anında randevu alsın. {isletme_adi} için 7/24 AI asistan — ilk ay ücretsiz. Ne dersiniz?' }
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

    console.log('✅ DB migration kontrolü tamamlandı');

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
  'https://randevugo-admin.onrender.com', 'https://admin.xn--srago-n4a.com',
  'https://xn--srago-n4a.com', 'https://randevugo-api.onrender.com',
  process.env.ADMIN_PANEL_URL
].filter(Boolean);

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) callback(null, true);
    else callback(new Error('CORS policy: Origin not allowed'));
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
  res.sendFile(require('path').join(__dirname, 'public', 'booking.html'));
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

// Sunucuyu başlat
app.listen(PORT, () => {
  const baseUrl = process.env.BASE_URL || `http://localhost:${PORT}`;
  console.log(`\n🚀 RandevuGO API çalışıyor: ${baseUrl}`);
  console.log(`📡 WhatsApp Webhook: ${baseUrl}/api/webhook/whatsapp`);
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
  
  // Hatırlatma cron job'ını başlat (production'da sadece ENABLE_CRON=true ise)
  if (process.env.ENABLE_CRON !== 'false') {
    hatirlatmaService.baslat();
    // Gece raporu servisi + Haftalık rapor
    try { const geceRaporu = require('./services/geceRaporu'); geceRaporu.baslat(); geceRaporu.haftalikCronBaslat(); } catch (e) { console.error('Gece raporu başlatma hatası:', e.message); }
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
