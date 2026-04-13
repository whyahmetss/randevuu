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
  process.env.ADMIN_PANEL_URL
].filter(Boolean);

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) callback(null, true);
    else callback(null, true); // Geliştirme kolaylığı için şimdilik hepsini kabul et
  },
  credentials: true
}));

// Rate limiting
const apiLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 600, message: { hata: 'Çok fazla istek. 15 dakika sonra tekrar deneyin.' } });
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 20, message: { hata: 'Çok fazla giriş denemesi. 15 dakika sonra tekrar deneyin.' } });

app.use(express.json({
  limit: '10mb',
  verify: (req, res, buf) => { req.rawBody = buf.toString(); }
}));
app.use(express.urlencoded({ extended: true })); // Twilio webhook için
app.use(express.static(require('path').join(__dirname, 'public')));

// API Routes
app.use('/api/auth', authLimiter);
app.use('/api', apiLimiter, apiRoutes);

// Health check for Render
app.get('/api/health', (req, res) => {
  res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Ana sayfa - Landing page
app.get('/', (req, res) => {
  res.sendFile(require('path').join(__dirname, 'public', 'index.html'));
});

// Sunucuyu başlat
app.listen(PORT, () => {
  const baseUrl = process.env.BASE_URL || `http://localhost:${PORT}`;
  console.log(`\n🚀 RandevuGO API çalışıyor: ${baseUrl}`);
  console.log(`📡 WhatsApp Webhook: ${baseUrl}/api/webhook/whatsapp`);
  console.log(`🏥 Health Check: ${baseUrl}/api/health\n`);
  
  // WhatsApp servisini başlat
  whatsappService.init();
  
  // Hatırlatma cron job'ını başlat (production'da sadece ENABLE_CRON=true ise)
  if (process.env.ENABLE_CRON !== 'false') {
    hatirlatmaService.baslat();
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
