const crypto = require('crypto');

const SHOPIER_PAYMENT_URL = 'https://www.shopier.com/ShowProduct/api_pay4.php';

class ShopierService {
  constructor() {
    this.apiKey = process.env.SHOPIER_API_KEY || '';
    this.apiSecret = process.env.SHOPIER_API_SECRET || '';
  }

  // Ödeme formu HTML'i oluştur (auto-submit)
  odemeSayfasiOlustur({ isletmeId, isletmeAdi, email, telefon, adres, sehir, paketAdi, tutar, siparisId, callbackUrl }) {
    const randomNr = Math.floor(100000 + Math.random() * 900000);
    const currency = 0; // TRY

    const args = {
      API_key: this.apiKey,
      website_index: 1,
      platform_order_id: siparisId,
      product_name: paketAdi,
      product_type: 1, // downloadable/virtual
      buyer_name: isletmeAdi.split(' ')[0] || isletmeAdi,
      buyer_surname: isletmeAdi.split(' ').slice(1).join(' ') || 'İşletme',
      buyer_email: email,
      buyer_account_age: 0,
      buyer_id_nr: isletmeId,
      buyer_phone: telefon || '5000000000',
      billing_address: adres || 'Türkiye',
      billing_city: sehir || 'İstanbul',
      billing_country: 'TR',
      billing_postcode: '34000',
      shipping_address: adres || 'Türkiye',
      shipping_city: sehir || 'İstanbul',
      shipping_country: 'TR',
      shipping_postcode: '34000',
      total_order_value: tutar.toFixed(2),
      currency: currency,
      platform: 0,
      is_in_frame: 0,
      current_language: 0, // TR
      modul_version: '1.0.4',
      random_nr: randomNr,
    };

    // Signature oluştur: hash_hmac('sha256', random_nr + order_id + total + currency, secret)
    const data = `${args.random_nr}${args.platform_order_id}${args.total_order_value}${args.currency}`;
    const signature = crypto.createHmac('sha256', this.apiSecret).update(data).digest('base64');

    args.signature = signature;
    args.callback = callbackUrl;

    // Auto-submit HTML formu oluştur
    const inputFields = Object.entries(args).map(([key, value]) =>
      `<input type="hidden" name="${key}" value="${value}" />`
    ).join('\n');

    const html = `<!DOCTYPE html>
<html lang="tr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>SıraGO - Ödeme Yönlendirme</title>
  <style>
    body { display: flex; justify-content: center; align-items: center; min-height: 100vh; margin: 0; background: #0f172a; font-family: -apple-system, system-ui, sans-serif; color: #e2e8f0; }
    .loader { text-align: center; }
    .spinner { width: 40px; height: 40px; border: 4px solid rgba(99,102,241,.3); border-top-color: #6366f1; border-radius: 50%; animation: spin 1s linear infinite; margin: 0 auto 16px; }
    @keyframes spin { to { transform: rotate(360deg); } }
    p { font-size: 16px; opacity: .8; }
  </style>
</head>
<body>
  <div class="loader">
    <div class="spinner"></div>
    <p>Shopier güvenli ödeme sayfasına yönlendiriliyorsunuz...</p>
  </div>
  <form id="shopier_form" method="POST" action="${SHOPIER_PAYMENT_URL}">
    ${inputFields}
  </form>
  <script>document.getElementById('shopier_form').submit();</script>
</body>
</html>`;

    return { html, siparisId, randomNr };
  }

  // Shopier callback doğrulama
  callbackDogrula(postData) {
    try {
      const { platform_order_id, random_nr, signature } = postData;

      if (!platform_order_id || !random_nr || !signature) {
        console.log('⚠️ Shopier callback: eksik parametreler');
        return { gecerli: false };
      }

      // Signature doğrula: hash_hmac('sha256', random_nr + order_id, secret)
      const data = `${random_nr}${platform_order_id}`;
      const expectedSignature = crypto.createHmac('sha256', this.apiSecret).update(data).digest('base64');

      const decodedReceived = Buffer.from(signature, 'base64');
      const decodedExpected = Buffer.from(expectedSignature, 'base64');

      const gecerli = crypto.timingSafeEqual(decodedReceived, decodedExpected);

      if (gecerli) {
        console.log(`✅ Shopier ödeme doğrulandı — sipariş: ${platform_order_id}`);
      } else {
        console.log(`❌ Shopier signature geçersiz — sipariş: ${platform_order_id}`);
      }

      return {
        gecerli,
        siparisId: platform_order_id,
        randomNr: random_nr,
        paymentId: postData.payment_id || null,
        installment: postData.installment || null,
      };
    } catch (err) {
      console.error('❌ Shopier callback doğrulama hatası:', err.message);
      return { gecerli: false };
    }
  }
}

module.exports = new ShopierService();
