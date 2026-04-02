# 🗓️ RandevuGO — WhatsApp Randevu Bot SaaS

İşletmelere WhatsApp üzerinden otomatik randevu yönetim sistemi.

## 🚀 Hızlı Başlangıç

### 1. Gereksinimleri Kur

```bash
# Node.js ve PostgreSQL kurulu olmalı
cd randevugo
npm install
```

### 2. Ortam Değişkenlerini Ayarla

```bash
cp .env.example .env
# .env dosyasını aç ve bilgileri doldur
```

**Minimum gereken ayarlar:**
- `DATABASE_URL` → PostgreSQL bağlantı adresi
- `JWT_SECRET` → Rastgele uzun bir string
- `CLAUDE_API_KEY` → Anthropic API anahtarı

**Opsiyonel (WhatsApp için):**
- `TWILIO_ACCOUNT_SID` → Twilio hesap ID
- `TWILIO_AUTH_TOKEN` → Twilio auth token
- `TWILIO_WHATSAPP_NUMBER` → Twilio WhatsApp numarası

### 3. Veritabanını Kur

```bash
# Tabloları oluştur
npm run db:setup

# Demo verileri ekle (opsiyonel)
npm run db:seed
```

### 4. Sunucuyu Başlat

```bash
# Geliştirme modu
npm run dev

# Prodüksiyon
npm start
```

Sunucu `http://localhost:3000` adresinde çalışacak.

## 📱 WhatsApp Bot Nasıl Çalışır?

### Müşteri Akışı:
```
1. Müşteri WhatsApp'tan mesaj atar
2. Bot karşılar ve hizmetleri listeler
3. Müşteri hizmet seçer
4. Bot müsait tarihleri sorar
5. Müşteri tarih seçer
6. Bot müsait saatleri gösterir
7. Müşteri saat seçer
8. Bot özeti gösterir ve onay ister
9. Müşteri onaylar → Randevu oluşur
10. 1 saat önce otomatik hatırlatma gönderilir
```

### Twilio Olmadan Test Etme:

Bot'u WhatsApp olmadan test edebilirsin:

```bash
# Terminal'den test
curl -X POST http://localhost:3000/api/bot/test \
  -H "Content-Type: application/json" \
  -d '{"telefon": "05531112233", "mesaj": "Merhaba randevu almak istiyorum"}'
```

Veya Admin Panel'deki "Bot Test" sekmesini kullan.

## 🖥️ Admin Panel

Admin panel React ile yazılmış. `RandevuGO_Admin_Panel.jsx` dosyasını kullan.

### Giriş Bilgileri:

**Super Admin:**
- Email: .env'deki ADMIN_EMAIL (varsayılan: admin@randevugo.com)
- Şifre: .env'deki ADMIN_PASSWORD (varsayılan: admin123456)

**Demo İşletme (seed çalıştırıldıysa):**
- Email: ali@berberali.com
- Şifre: berberali123

### Panel Özellikleri:
- 📊 Dashboard - günlük/haftalık istatistikler
- 📅 Randevular - randevu listesi ve durum güncelleme
- ✂️ Hizmetler - hizmet ekleme/silme/düzenleme
- 👥 Müşteriler - müşteri listesi ve geçmişi
- 🤖 Bot Test - WhatsApp olmadan botu test etme
- ⚙️ Ayarlar - çalışma saatleri, randevu süresi vb.

## 📁 Dosya Yapısı

```
randevugo/
├── .env.example          # Ortam değişkenleri şablonu
├── package.json
├── scripts/
│   ├── setup-db.js       # Veritabanı tabloları oluşturma
│   └── seed.js           # Demo veri ekleme
├── src/
│   ├── server.js         # Ana sunucu dosyası
│   ├── config/
│   │   └── db.js         # PostgreSQL bağlantısı
│   ├── middleware/
│   │   └── auth.js       # JWT doğrulama
│   ├── controllers/
│   │   ├── botController.js    # WhatsApp bot mantığı
│   │   ├── authController.js   # Giriş/kayıt
│   │   └── adminController.js  # Admin panel API
│   ├── services/
│   │   ├── claude.js     # Claude AI entegrasyonu
│   │   ├── whatsapp.js   # Twilio WhatsApp
│   │   ├── randevu.js    # Randevu iş mantığı
│   │   └── hatirlatma.js # Otomatik hatırlatma cron
│   └── routes/
│       └── api.js        # API route'ları
└── admin-panel/
    └── src/
        └── RandevuGO_Admin_Panel.jsx  # React admin panel
```

## 🔗 API Endpoints

| Method | Endpoint | Açıklama |
|--------|----------|----------|
| POST | /api/auth/giris | Giriş yap |
| GET | /api/auth/profil | Profil bilgisi |
| POST | /api/webhook/whatsapp | Twilio webhook |
| POST | /api/bot/test | Bot test (WhatsApp'sız) |
| GET | /api/randevular | Randevuları listele |
| PUT | /api/randevular/:id/durum | Randevu durumu güncelle |
| GET | /api/hizmetler | Hizmetleri listele |
| POST | /api/hizmetler | Hizmet ekle |
| PUT | /api/hizmetler/:id | Hizmet güncelle |
| DELETE | /api/hizmetler/:id | Hizmet sil |
| GET | /api/calisanlar | Çalışanları listele |
| POST | /api/calisanlar | Çalışan ekle |
| GET | /api/musteriler | Müşterileri listele |
| GET | /api/istatistikler | İstatistikler |
| GET | /api/ayarlar | İşletme ayarları |
| PUT | /api/ayarlar | Ayarları güncelle |
| GET | /api/admin/isletmeler | Tüm işletmeler (super admin) |
| POST | /api/admin/isletmeler | İşletme ekle (super admin) |

## � Render'a Deploy (Production)

### 1. GitHub'a Push Et
```bash
git add .
git commit -m "Production ready"
git push origin main
```

### 2. Render'da Web Service Oluştur
1. [Render.com](https://render.com)'da hesabına giriş yap
2. "New +" → "Web Service" seç
3. GitHub reposunu bağla
4. **Build Command**: `npm install`
5. **Start Command**: `npm start`
6. **Health Check Path**: `/api/health`

### 3. Environment Variables
Render'daki Environment Variables bölümüne ekle:

**Zorunlu:**
- `DATABASE_URL` → Render PostgreSQL bağlantısı
- `JWT_SECRET` → Rastgele 32+ karakter
- `BASE_URL` → Render URL (ör: `https://randevugo-api.onrender.com`)

**Opsiyonel:**
- `TWILIO_ACCOUNT_SID`
- `TWILIO_AUTH_TOKEN` 
- `TWILIO_PHONE_NUMBER`
- `DEEPSEEK_API_KEY`
- `ENABLE_CRON` → `true` (hatırlatmalar için)

### 4. PostgreSQL Database
1. Render'da "New +" → "PostgreSQL" seç
2. Database bilgilerini kopyala
3. Web Service'in Environment Variables'ına `DATABASE_URL` olarak ekle

### 5. Deploy Kontrolü
- Render otomatik deploy başlatır
- Loglarda "🚀 RandevuGO API çalışıyor" görünmeli
- Health check: `https://randevugo-api.onrender.com/api/health`

### 6. Webhook URL'leri
Render'a deploy ettikten sonra:
- WhatsApp webhook: `https://randevugo-api.onrender.com/api/webhook/whatsapp`
- Telegram webhook'lar otomatik ayarlanır

## 📞 Twilio WhatsApp Kurulumu

1. twilio.com'da hesap aç (ücretsiz deneme kredisi var)
2. WhatsApp Sandbox'ı aktif et
3. Sandbox numarasını ve token'ları .env'ye ekle
4. Webhook URL'i ayarla: `https://senin-domain.com/api/webhook/whatsapp`

## 🎯 Müşteriye Satış Konuşması

"Abi, müşterilerinden kaçı seni arayıp ulaşamadığı için başka yere gidiyor?
Ben sana bir sistem kuruyorum — müşterin WhatsApp'tan 7/24 randevu alabilecek.
Sen telefonu açmasanız bile bot otomatik hallediyor.
2 hafta ücretsiz deneyin, beğenmezsen kaldırırım."
```

---

*RandevuGO - GO Ecosystem'in bir parçası*
*Geliştirici: Ahmet Çavdar*
