const Iyzipay = require('iyzipay');
const pool = require('../config/db');
const { paketGetir } = require('../config/paketler');

class IyzicoService {
  constructor() {
    if (process.env.IYZICO_API_KEY && process.env.IYZICO_SECRET_KEY) {
      this.iyzipay = new Iyzipay({
        apiKey: process.env.IYZICO_API_KEY,
        secretKey: process.env.IYZICO_SECRET_KEY,
        uri: process.env.IYZICO_BASE_URL || 'https://sandbox-api.iyzipay.com'
      });
      console.log('💳 iyzico servisi başlatıldı');
    } else {
      this.iyzipay = null;
      console.log('⚠️ iyzico API anahtarları tanımlı değil, ödeme sadece havale ile yapılabilir');
    }
  }

  // Checkout Form başlat
  async checkoutBaslat(isletmeId, paket) {
    if (!this.iyzipay) throw new Error('iyzico yapılandırılmamış. Lütfen havale ile ödeme yapın.');

    const paketBilgi = await paketGetir(paket);
    if (!paketBilgi) throw new Error('Geçersiz paket');

    const isletme = (await pool.query('SELECT * FROM isletmeler WHERE id = $1', [isletmeId])).rows[0];
    if (!isletme) throw new Error('İşletme bulunamadı');

    // Admin kullanıcı bilgisi
    const admin = (await pool.query('SELECT * FROM admin_kullanicilar WHERE isletme_id = $1 LIMIT 1', [isletmeId])).rows[0];

    const buAy = new Date().toISOString().slice(0, 7);
    const baseUrl = process.env.ADMIN_PANEL_URL || 'https://randevugo-admin.onrender.com';
    const apiUrl = process.env.BASE_URL || 'https://randevugo-api.onrender.com';
    const conversationId = `${isletmeId}_${buAy}_${Date.now()}`;

    return new Promise((resolve, reject) => {
      this.iyzipay.checkoutFormInitialize.create({
        locale: Iyzipay.LOCALE.TR,
        conversationId: conversationId,
        price: String(paketBilgi.fiyat),
        paidPrice: String(paketBilgi.fiyat),
        currency: Iyzipay.CURRENCY.TRY,
        basketId: `paket_${isletmeId}_${buAy}`,
        paymentGroup: Iyzipay.PAYMENT_GROUP.PRODUCT,
        callbackUrl: `${apiUrl}/api/odeme/iyzico/callback`,
        enabledInstallments: [1, 2, 3, 6],
        buyer: {
          id: String(isletmeId),
          name: isletme.isim || 'İşletme',
          surname: 'Yönetici',
          gsmNumber: isletme.telefon ? `+90${isletme.telefon.replace(/^0/, '')}` : '+905000000000',
          email: admin?.email || 'info@sirago.com',
          identityNumber: '11111111111',
          registrationAddress: isletme.adres || 'Türkiye',
          ip: '85.34.78.112',
          city: isletme.ilce || 'Istanbul',
          country: 'Turkey',
        },
        shippingAddress: {
          contactName: isletme.isim || 'İşletme',
          city: 'Istanbul',
          country: 'Turkey',
          address: isletme.adres || 'Türkiye',
        },
        billingAddress: {
          contactName: isletme.isim || 'İşletme',
          city: 'Istanbul',
          country: 'Turkey',
          address: isletme.adres || 'Türkiye',
        },
        basketItems: [{
          id: `paket_${paket}`,
          name: `SıraGO ${paketBilgi.isim} Paket - ${buAy}`,
          category1: 'SaaS',
          category2: 'Randevu Yönetimi',
          itemType: Iyzipay.BASKET_ITEM_TYPE.VIRTUAL,
          price: String(paketBilgi.fiyat),
        }],
      }, (err, result) => {
        if (err) return reject(err);
        if (result.status === 'success') {
          // Token'ı DB'ye kaydet
          pool.query(
            `INSERT INTO odemeler (isletme_id, tutar, donem, durum, odeme_yontemi, iyzico_token)
             VALUES ($1, $2, $3, 'odeme_bekliyor', 'iyzico', $4)
             ON CONFLICT DO NOTHING`,
            [isletmeId, paketBilgi.fiyat, buAy, result.token]
          ).catch(() => {});
          resolve({
            checkoutFormContent: result.checkoutFormContent,
            token: result.token,
            tokenExpireTime: result.tokenExpireTime,
          });
        } else {
          reject(new Error(result.errorMessage || 'iyzico başlatma hatası'));
        }
      });
    });
  }

  // Checkout callback - ödeme sonucunu doğrula
  async callbackDogrula(token) {
    if (!this.iyzipay) throw new Error('iyzico yapılandırılmamış');

    return new Promise((resolve, reject) => {
      this.iyzipay.checkoutForm.retrieve({
        locale: Iyzipay.LOCALE.TR,
        token: token,
      }, async (err, result) => {
        if (err) return reject(err);

        try {
          if (result.status === 'success' && result.paymentStatus === 'SUCCESS') {
            // Ödemeyi onayla
            await pool.query(
              `UPDATE odemeler SET durum = 'odendi', odeme_tarihi = NOW()
               WHERE iyzico_token = $1`,
              [token]
            );
            resolve({ basarili: true, mesaj: 'Ödeme başarıyla alındı' });
          } else {
            await pool.query(
              `UPDATE odemeler SET durum = 'basarisiz' WHERE iyzico_token = $1`,
              [token]
            );
            resolve({ basarili: false, mesaj: result.errorMessage || 'Ödeme başarısız' });
          }
        } catch (dbErr) {
          reject(dbErr);
        }
      });
    });
  }
}

module.exports = new IyzicoService();
