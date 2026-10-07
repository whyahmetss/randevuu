const crypto = require('crypto');
const axios = require('axios');
const pool = require('../config/db');
const socketServer = require('./socketServer');
const pushService = require('./pushService');

// ═══════════════════════════════════════════════════════════
// Shopier Tam Otomatik Ödeme Sistemi (PAT + Webhook)
// ═══════════════════════════════════════════════════════════
// AKIŞ:
// 1. Kullanıcı "Güvenli Öde" → Backend Shopier'da dijital ürün oluşturur (PAT)
// 2. Kullanıcı shopier.com ürün URL'sine yönlendirilir → kart ile öder
// 3. Shopier order.created webhook'u backend'e gönderir (paymentStatus: paid)
// 4. Backend PENDING ödemeyi bulur → paket yükseltir / ödenir → ürünü Shopier'dan siler

const API_BASE = 'https://api.shopier.com/v1';
const PLACEHOLDER_IMAGE = 'https://dmih5ui1qqea9.cloudfront.net/pictures_large/Camiseta6855_cobalt-blue-t-shirt.jpg';

class ShopierService {
  constructor() {
    this.patToken = process.env.SHOPIER_PAT_TOKEN || '';
    this.webhookToken = process.env.SHOPIER_WEBHOOK_TOKEN || '';
  }

  // ─── Shopier API'de dijital ürün oluştur ───
  async urunOlustur({ baslik, aciklama, fiyat }) {
    const res = await axios.post(`${API_BASE}/products`, {
      title: baslik,
      description: aciklama,
      type: 'digital',
      media: [{ url: PLACEHOLDER_IMAGE, type: 'image', placement: 1 }],
      priceData: {
        currency: 'TRY',
        price: fiyat.toFixed(2),
        shippingPrice: '0.00',
      },
      stockStatus: 'inStock',
      stockQuantity: 1,
      shippingPayer: 'sellerPays',
      customListing: true,
      customNote: 'İşletme referans kodunuzu yazın (ör: SRGO-12)',
    }, {
      headers: {
        Authorization: `Bearer ${this.patToken}`,
        'Content-Type': 'application/json',
      },
      timeout: 15000,
    });

    const urun = res.data;
    console.log(`🛒 Shopier ürün oluşturuldu: ${urun.id} → ${urun.url}`);
    return { id: urun.id, url: urun.url };
  }

  // ─── Shopier API'den ürün sil ───
  async urunSil(urunId) {
    try {
      await axios.delete(`${API_BASE}/products/${urunId}`, {
        headers: { Authorization: `Bearer ${this.patToken}` },
        timeout: 10000,
      });
      console.log(`🗑️ Shopier ürün silindi: ${urunId}`);
    } catch (err) {
      console.log(`⚠️ Shopier ürün silme hatası (${urunId}):`, err.message);
    }
  }

  // ─── Webhook signature doğrulama ───
  // Shopier HS256 HMAC ile imzalar, header: Shopier-Signature
  webhookDogrula(rawBody, signatureHeader) {
    if (!this.webhookToken || !signatureHeader) return false;
    const computed = crypto
      .createHmac('sha256', this.webhookToken)
      .update(rawBody)
      .digest('hex');
    return crypto.timingSafeEqual(
      Buffer.from(computed, 'hex'),
      Buffer.from(signatureHeader, 'hex')
    );
  }

  // ─── Webhook: order.created işle ───
  async siparisGeldi(order) {
    const siparisId = order.id;
    const paymentStatus = order.paymentStatus; // 'paid' | 'unpaid'

    if (paymentStatus !== 'paid') {
      console.log(`⏳ Shopier sipariş #${siparisId} henüz ödenmemiş, atlanıyor`);
      return { islem: 'atlandı', sebep: 'unpaid' };
    }

    // Zaten işlenmiş mi?
    const zatenVar = (await pool.query(
      "SELECT id FROM odemeler WHERE shopier_siparis_id = $1 AND durum = 'odendi'",
      [siparisId]
    )).rows[0];
    if (zatenVar) {
      console.log(`ℹ️ Shopier sipariş #${siparisId} zaten işlenmiş`);
      return { islem: 'zaten_islenmis' };
    }

    // Ürün bilgilerinden referans kodunu bul (ürün başlığında SRGO-XX var)
    const urunBaslik = order.lineItems?.[0]?.title || '';
    const urunId = order.lineItems?.[0]?.id || null;
    const tutar = parseFloat(order.totals?.grandTotal || '0');
    const aliciEmail = order.shippingAddress?.email || '';
    const aliciTelefon = order.shippingAddress?.phone || '';
    const siparisNotu = order.note || '';

    console.log(`📦 Shopier sipariş geldi: #${siparisId} - ${urunBaslik} - ${tutar}₺ - ${aliciEmail}`);

    // ─── KAPORA KONTROLÜ ───
    // Ürün başlığı "Kapora -" ile başlıyorsa, bu bir randevu kapora ödemesi
    if (urunBaslik.startsWith('Kapora -') && urunId) {
      const kaporaRandevu = (await pool.query(
        "SELECT id, isletme_id FROM randevular WHERE kapora_shopier_urun_id=$1 AND kapora_durumu='bekliyor'",
        [urunId]
      )).rows[0];
      if (kaporaRandevu) {
        await pool.query(
          "UPDATE randevular SET kapora_durumu='odendi', durum='onaylandi' WHERE id=$1",
          [kaporaRandevu.id]
        );
        console.log(`✅ Kapora ödendi → randevu #${kaporaRandevu.id} onaylandı`);
        // 📅 Google Calendar event oluştur (kapora ödendi = onaylandı artık)
        try {
          const googleCalendar = require('./googleCalendar');
          googleCalendar.freebusyCacheTemizle(kaporaRandevu.isletme_id);
          googleCalendar.randevuEventOlustur(kaporaRandevu.isletme_id, { id: kaporaRandevu.id }).catch(() => {});
        } catch (e) {}
        // Ürünü sil
        await this.urunSil(urunId);
        return { islem: 'kapora_onaylandi', randevuId: kaporaRandevu.id, tutar };
      }
    }

    // İşletme ID'yi bul: önce ödeme başlatılırken saklanan ürün, sonra başlık/not
    let isletmeId = null;
    let bekleyenPaket = null;
    if (urunId) {
      const b = (await pool.query('SELECT id, bekleyen_paket FROM isletmeler WHERE bekleyen_shopier_urun_id = $1', [String(urunId)])).rows[0];
      if (b) { isletmeId = b.id; bekleyenPaket = b.bekleyen_paket; }
    }
    const refMatch = (urunBaslik + ' ' + siparisNotu).match(/SRGO-(\d+)/);
    if (!isletmeId && refMatch) {
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

    // PENDING ödemeyi bul (shopier_urun_id ile eşleştir — en güvenilir yol)
    if (!isletmeId && urunId) {
      const pendingOdeme = (await pool.query(
        "SELECT isletme_id FROM odemeler WHERE shopier_urun_id = $1 AND durum = 'odeme_bekliyor'",
        [urunId]
      )).rows[0];
      if (pendingOdeme) isletmeId = pendingOdeme.isletme_id;
    }

    const buAy = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Istanbul' }).slice(0, 7);

    if (isletmeId) {
      // Mevcut ödeme kaydını güncelle veya yeni kayıt oluştur
      const mevcut = (await pool.query(
        "SELECT id FROM odemeler WHERE isletme_id = $1 AND donem = $2",
        [isletmeId, buAy]
      )).rows[0];

      if (mevcut) {
        await pool.query(
          // Ay içinde ikinci ödeme (yükseltme) ise tutar üzerine eklenir
          `UPDATE odemeler SET tutar = CASE WHEN durum = 'odendi' THEN tutar + $3 ELSE $3 END,
             durum = 'odendi', odeme_yontemi = 'shopier', odeme_tarihi = NOW(), shopier_siparis_id = $1 WHERE id = $2`,
          [siparisId, mevcut.id, tutar]
        );
      } else {
        await pool.query(
          `INSERT INTO odemeler (isletme_id, tutar, donem, durum, odeme_yontemi, odeme_tarihi, shopier_siparis_id) VALUES ($1, $2, $3, 'odendi', 'shopier', NOW(), $4)
           ON CONFLICT (isletme_id, donem) WHERE isletme_id IS NOT NULL 
           DO UPDATE SET durum = 'odendi', odeme_yontemi = 'shopier', odeme_tarihi = NOW(), shopier_siparis_id = EXCLUDED.shopier_siparis_id`,
          [isletmeId, tutar, buAy, siparisId]
        );
      }
      console.log(`✅ Shopier ödeme onaylandı: işletme=${isletmeId}, sipariş=#${siparisId}, tutar=${tutar}₺`);

      // ─── CANLI YAYIN + PUSH (süper admin + ilgili işletme) ───
      try {
        const isletme = (await pool.query('SELECT isim FROM isletmeler WHERE id = $1', [isletmeId])).rows[0];
        const payload = {
          isletme_id: isletmeId,
          isletme_isim: isletme?.isim || '',
          tutar,
          siparis_id: siparisId,
          yontem: 'shopier'
        };
        socketServer.emitToAdmin('odeme:yeni', payload);
        socketServer.emitToIsletme(isletmeId, 'odeme:onaylandi', payload);
        pushService.sendToAdmin({
          title: '💳 Yeni Ödeme',
          body: `${isletme?.isim || 'İşletme'} — ${tutar}₺ (Shopier)`,
          url: '/',
          tag: `odeme-${siparisId}`,
        });
        pushService.sendToIsletme(isletmeId, {
          title: '✅ Ödemeniz alındı',
          body: `${tutar}₺ — paketiniz 30 gün yenilendi`,
          url: '/',
          tag: `odeme-ok-${siparisId}`,
        });
      } catch (e) {}

      // Paket: ödeme başlatılırken seçilen paket uygulanır; tutar paket fiyatından düşükse paket değişmez
      let yeniPaket = null;
      if (bekleyenPaket) {
        try {
          const { paketGetir } = require('../config/paketler');
          const p = await paketGetir(bekleyenPaket);
          if (tutar + 1 >= (p.fiyat || 0)) yeniPaket = bekleyenPaket;
          else console.warn(`⚠️ Shopier tutarı (${tutar}) ${bekleyenPaket} fiyatından (${p.fiyat}) düşük — paket değiştirilmedi`);
        } catch (e) {}
      }
      // Bitiş tarihi: kalan günler silinmesin (eskiden NOW()+30 yazılıyordu)
      await pool.query(
        `UPDATE isletmeler SET paket_bitis_tarihi = GREATEST(COALESCE(paket_bitis_tarihi, NOW()), NOW()) + INTERVAL '30 days',
           aktif = true, paket = COALESCE($2, paket), bekleyen_paket = NULL, bekleyen_shopier_urun_id = NULL WHERE id = $1`,
        [isletmeId, yeniPaket]
      );

      // Referans ödülü: ilk ödeme yapan davetli işletme ise, referans sahibine kazanilan_ay +1
      try {
        const refIsletme = (await pool.query(
          "SELECT referans_ile_gelen, referans_odeme_tetiklendi FROM isletmeler WHERE id = $1",
          [isletmeId]
        )).rows[0];
        if (refIsletme && refIsletme.referans_ile_gelen && !refIsletme.referans_odeme_tetiklendi) {
          const sahipId = refIsletme.referans_ile_gelen;
          await pool.query(
            "UPDATE referanslar SET kazanilan_ay = kazanilan_ay + 1 WHERE sahip_isletme_id = $1",
            [sahipId]
          );
          await pool.query(
            "UPDATE isletmeler SET referans_odeme_tetiklendi = true WHERE id = $1",
            [isletmeId]
          );
          // Sahip işletmenin paket süresine de +30 gün ekle
          await pool.query(
            "UPDATE isletmeler SET paket_bitis_tarihi = GREATEST(COALESCE(paket_bitis_tarihi, NOW()), NOW()) + INTERVAL '30 days' WHERE id = $1",
            [sahipId]
          );
          console.log(`🎁 Referans ödülü verildi: sahip=${sahipId}, ödeme yapan=${isletmeId}`);
        }
      } catch (refErr) {
        console.error('⚠️ Referans ödül hatası:', refErr.message);
      }
    } else {
      // Eşleştirilemeyen sipariş
      await pool.query(
        "INSERT INTO odemeler (isletme_id, tutar, donem, durum, odeme_yontemi, odeme_tarihi, shopier_siparis_id, referans_kodu) VALUES (NULL, $1, $2, 'eslestirilmedi', 'shopier', NOW(), $3, $4)",
        [tutar, buAy, siparisId, `${aliciEmail || aliciTelefon || urunBaslik}`]
      );
      console.log(`⚠️ Shopier sipariş eşleştirilemedi: #${siparisId} - ${aliciEmail} - ${tutar}₺`);
    }

    // Ürünü Shopier'dan sil (tek kullanımlık)
    if (urunId) {
      await this.urunSil(urunId);
    }

    return { islem: 'basarili', isletmeId, siparisId, tutar };
  }
}

module.exports = new ShopierService();
