process.env.TZ = 'Europe/Istanbul';

const express = require('express');
const cors = require('cors');
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
    console.log('✅ DB migration kontrolü tamamlandı');
  } catch (e) {
    console.log('⚠️ Migration hatası (önemsiz olabilir):', e.message);
  }
})();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true })); // Twilio webhook için

// API Routes
app.use('/api', apiRoutes);

// Health check for Render
app.get('/api/health', (req, res) => {
  res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Ana sayfa
app.get('/', (req, res) => {
  const baseUrl = process.env.BASE_URL || `http://localhost:${PORT}`;
  res.json({
    uygulama: 'RandevuGO API',
    versiyon: '1.0.0',
    durum: 'çalışıyor ✅',
    base_url: baseUrl,
    endpoints: {
      webhook: `POST ${baseUrl}/api/webhook/whatsapp`,
      test: `POST ${baseUrl}/api/bot/test`,
      giris: `POST ${baseUrl}/api/auth/giris`,
      randevular: `GET ${baseUrl}/api/randevular`,
      hizmetler: `GET ${baseUrl}/api/hizmetler`,
      istatistikler: `GET ${baseUrl}/api/istatistikler`,
      health: `GET ${baseUrl}/api/health`
    }
  });
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
