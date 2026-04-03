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
    console.log('✅ DB migration kontrolü tamamlandı');
  } catch (e) {
    console.log('⚠️ Migration hatası (önemsiz olabilir):', e.message);
  }
})();

// Middleware - Güvenlik
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
const apiLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 300, message: { hata: 'Çok fazla istek. 15 dakika sonra tekrar deneyin.' } });
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 20, message: { hata: 'Çok fazla giriş denemesi. 15 dakika sonra tekrar deneyin.' } });

app.use(express.json({ limit: '10mb' }));
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
  
  // Aylık otomatik ödeme kaydı servisi
  odemeService.baslat();

  // Telegram botlarını başlat
  telegramService.tumBotlariBaşlat();

  // WhatsApp Web servisini başlat
  whatsappWebService.tumIsletmeleriBaslat();
});

module.exports = app;
