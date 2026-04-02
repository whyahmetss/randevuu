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

const app = express();
const PORT = process.env.PORT || 3000;

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
