const axios = require('axios');
const pool = require('../config/db');

// ═══════════════════════════════════════════════════
// Shopier Ödeme Linki + PAT Sipariş Takibi
// ═══════════════════════════════════════════════════
// Shopier'da 3 ürün oluşturulur (manuel), linkleri env'e konur.
// PAT token ile GET /v1/orders polling yapılarak yeni ödemeler tespit edilir.

class ShopierService {
  constructor() {
    this.patToken = process.env.SHOPIER_PAT_TOKEN || '';
    this.apiBase = 'https://api.shopier.com/v1';
    this.sonKontrolId = null; // Son kontrol edilen sipariş ID
    this.pollingInterval = null;
  }

  // Paket bazlı Shopier ödeme linkleri (env'den okunur)
  getOdemeLinki(paket) {
    const linkler = {
      baslangic: process.env.SHOPIER_LINK_BASLANGIC || '',
      pro: process.env.SHOPIER_LINK_PRO || '',
      premium: process.env.SHOPIER_LINK_PREMIUM || '',
    };
    return linkler[paket] || linkler.baslangic;
  }

  // Shopier API'den siparişleri çek (PAT token ile)
  async siparisleriGetir(limit = 10) {
    if (!this.patToken) {
      console.log('⚠️ Shopier PAT token ayarlanmamış');
      return [];
    }
    try {
      const res = await axios.get(`${this.apiBase}/orders`, {
        params: { limit },
        headers: { Authorization: `Bearer ${this.patToken}` },
        timeout: 10000,
      });
      return res.data || [];
    } catch (err) {
      console.log('⚠️ Shopier sipariş çekme hatası:', err.message);
      return [];
    }
  }

  // Yeni siparişleri kontrol et ve DB'de eşleştir
  async yeniSiparisleriKontrolEt() {
    try {
      const siparisler = await this.siparisleriGetir(20);
      if (!siparisler.length) return;

      for (const siparis of siparisler) {
        // Zaten işlenmiş mi kontrol et
        const mevcutRef = (await pool.query(
          "SELECT id FROM odemeler WHERE shopier_siparis_id = $1",
          [siparis.id]
        )).rows[0];
        if (mevcutRef) continue;

        // Sipariş bilgilerinden işletmeyi eşleştir
        // Shopier siparişindeki "notToSeller" alanında referans kodu olabilir
        // veya alıcı email/telefon ile eşleştir
        const aliciEmail = siparis.buyer?.email || '';
        const aliciTelefon = siparis.buyer?.phone || '';
        const siparisNotu = siparis.noteToSeller || '';
        const tutar = parseFloat(siparis.priceData?.totalPrice || siparis.priceData?.price || '0');
        const urunAdi = siparis.items?.[0]?.title || siparis.productTitle || '';

        console.log(`📦 Shopier yeni sipariş: #${siparis.id} - ${urunAdi} - ${tutar}₺ - ${aliciEmail}`);

        // Referans kodu varsa (SRGO-XX formatı)
        let isletmeId = null;
        const refMatch = siparisNotu.match(/SRGO-(\d+)/);
        if (refMatch) {
          isletmeId = parseInt(refMatch[1]);
        }

        // Email ile eşleştir
        if (!isletmeId && aliciEmail) {
          const isletme = (await pool.query(
            'SELECT id FROM isletmeler WHERE email = $1', [aliciEmail]
          )).rows[0];
          if (isletme) isletmeId = isletme.id;
        }

        // Telefon ile eşleştir
        if (!isletmeId && aliciTelefon) {
          const tel = aliciTelefon.replace(/\D/g, '').slice(-10);
          const isletme = (await pool.query(
            "SELECT id FROM isletmeler WHERE telefon LIKE $1", [`%${tel}`]
          )).rows[0];
          if (isletme) isletmeId = isletme.id;
        }

        // Paketi belirle (tutar bazlı)
        let paket = 'baslangic';
        if (tutar >= 700) paket = 'premium';
        else if (tutar >= 400) paket = 'pro';

        const buAy = new Date().toISOString().slice(0, 7);

        if (isletmeId) {
          // Mevcut bekleyen ödeme var mı?
          const mevcut = (await pool.query(
            "SELECT id FROM odemeler WHERE isletme_id = $1 AND donem = $2 AND durum != 'odendi'",
            [isletmeId, buAy]
          )).rows[0];

          if (mevcut) {
            await pool.query(
              "UPDATE odemeler SET durum = 'odendi', odeme_yontemi = 'shopier', odeme_tarihi = NOW(), shopier_siparis_id = $1 WHERE id = $2",
              [siparis.id, mevcut.id]
            );
          } else {
            await pool.query(
              "INSERT INTO odemeler (isletme_id, tutar, donem, durum, odeme_yontemi, odeme_tarihi, shopier_siparis_id) VALUES ($1, $2, $3, 'odendi', 'shopier', NOW(), $4)",
              [isletmeId, tutar, buAy, siparis.id]
            );
          }
          console.log(`✅ Shopier ödeme eşleştirildi: işletme=${isletmeId}, sipariş=${siparis.id}, tutar=${tutar}₺`);
        } else {
          // Eşleştirilemeyen sipariş — SuperAdmin'e bildir, log'a yaz
          await pool.query(
            "INSERT INTO odemeler (isletme_id, tutar, donem, durum, odeme_yontemi, odeme_tarihi, shopier_siparis_id, referans_kodu) VALUES (NULL, $1, $2, 'eslestirilmedi', 'shopier', NOW(), $3, $4)",
            [tutar, buAy, siparis.id, `${aliciEmail || aliciTelefon || 'bilinmiyor'}`]
          );
          console.log(`⚠️ Shopier sipariş eşleştirilemedi: #${siparis.id} - ${aliciEmail} - ${tutar}₺`);
        }
      }
    } catch (err) {
      console.error('❌ Shopier sipariş kontrol hatası:', err.message);
    }
  }

  // Sipariş polling başlat (her 5 dakikada bir kontrol)
  pollingBaslat() {
    if (!this.patToken) {
      console.log('⚠️ Shopier PAT token yok, sipariş polling başlatılmadı');
      return;
    }
    console.log('🔄 Shopier sipariş polling başlatıldı (5dk aralık)');
    // İlk kontrol
    setTimeout(() => this.yeniSiparisleriKontrolEt(), 10000);
    // Her 5 dakikada bir
    this.pollingInterval = setInterval(() => this.yeniSiparisleriKontrolEt(), 5 * 60 * 1000);
  }

  pollingDurdur() {
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
      this.pollingInterval = null;
      console.log('⏹️ Shopier sipariş polling durduruldu');
    }
  }
}

module.exports = new ShopierService();
