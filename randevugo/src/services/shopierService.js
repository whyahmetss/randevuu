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
// Ürün görseli: Paket Yönetimi'nden yüklenen paket görseli; yoksa Fiko (eskiden yabancı bir tişört fotoğrafıydı ve bazen açılmıyordu)
const API_ADRES = (process.env.BASE_URL || 'https://randevu.xn--srago-n4a.com').replace(/\/$/, '');
const VARSAYILAN_GORSEL = `${(process.env.ADMIN_PANEL_URL || 'https://admin.xn--srago-n4a.com').replace(/\/$/, '')}/icon-512.png`;

class ShopierService {
  constructor() {
    this.patToken = process.env.SHOPIER_PAT_TOKEN || '';
    this.webhookToken = process.env.SHOPIER_WEBHOOK_TOKEN || '';
  }

  // ─── Shopier API'de dijital ürün oluştur ───
  async urunOlustur({ baslik, aciklama, fiyat, gorselUrl }) {
    const res = await axios.post(`${API_BASE}/products`, {
      title: baslik,
      description: aciklama,
      type: 'digital',
      media: [{ url: gorselUrl || VARSAYILAN_GORSEL, type: 'image', placement: 1 }],
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

  // ─── Fiyat: paket + Öncü kilitli fiyat + yıllık (kupon hariç). Kupon kontrolü ve ödeme aynı hesabı kullanır ───
  async fiyatHesapla(isletmeId, paketIstek, sure) {
    const { paketGetir, FALLBACK_PAKETLER, YILLIK_ODENEN_AY } = require('../config/paketler');
    const yillik = sure === 'yil';
    const isletme = (await pool.query('SELECT * FROM isletmeler WHERE id = $1', [isletmeId])).rows[0];
    if (!isletme) return null;
    // Şube kendi başına ödemez: grubun merkezi öder
    let merkez = isletme;
    if (isletme.grup_id) {
      merkez = (await pool.query('SELECT * FROM isletmeler WHERE grup_id = $1 ORDER BY id LIMIT 1', [isletme.grup_id])).rows[0] || isletme;
    }
    const paket = (paketIstek && FALLBACK_PAKETLER[paketIstek]) ? paketIstek : (merkez.paket || 'baslangic');
    const paketBilgi = { ...(await paketGetir(paket)) };
    if (!(paketBilgi.fiyat > 0)) throw new Error('Paket fiyatı tanımsız');
    // Öncü Esnaf: kilitli paket için kilitli fiyat
    let fiyat = require('../utils/oncu').etkinFiyat(merkez, paket, paketBilgi.fiyat);
    if (yillik) fiyat = fiyat * YILLIK_ODENEN_AY;
    return { merkez, merkezId: merkez.id, paket, paketBilgi, fiyat, yillik };
  }

  // ─── Ödeme başlat: işletmeye özel tek kullanımlık ürün → Shopier ödeme sayfası URL'si ───
  // sure: 'yil' → 12 ay kullanım, YILLIK_ODENEN_AY (9) aylık ücret. kuponKod: Kuponlar sayfasındaki kod (opsiyonel)
  async odemeBaslat(isletmeId, paketIstek, sure, kuponKod = null) {
    const { YILLIK_ODENEN_AY } = require('../config/paketler');
    const f = await this.fiyatHesapla(isletmeId, paketIstek, sure);
    if (!f) return null;
    const { merkez, yillik } = f;
    const secilenPaket = f.paket;
    const paketBilgi = { ...f.paketBilgi, fiyat: f.fiyat };
    let kuponBilgi = null;
    if (kuponKod) {
      const d = await require('./kupon').dogrula({ kod: kuponKod, isletmeId: merkez.id, paket: secilenPaket, tutar: f.fiyat });
      kuponBilgi = d.kupon;
      paketBilgi.fiyat = d.indirimli;
    }
    const buAy = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Istanbul' }).slice(0, 7);
    const refKod = `SRGO-${merkez.id}`;
    const paketLabel = paketBilgi.isim || secilenPaket;

    // Önceki ödenmemiş ürün Shopier'da kalmasın (eskiden her tıklamada yeni ürün birikiyordu)
    if (merkez.bekleyen_shopier_urun_id) this.urunSil(merkez.bekleyen_shopier_urun_id).catch(() => {});

    let gorselUrl = null;
    try {
      const g = (await pool.query('SELECT gorsel_guncelleme FROM paket_tanimlari WHERE kod = $1 AND gorsel IS NOT NULL', [secilenPaket])).rows[0];
      if (g) gorselUrl = `${API_ADRES}/api/paket-gorsel/${encodeURIComponent(secilenPaket)}?v=${new Date(g.gorsel_guncelleme).getTime()}`;
    } catch (e) { /* kolon yoksa varsayılan görsel */ }

    const urun = await this.urunOlustur({
      gorselUrl,
      baslik: `SıraGO ${paketLabel} Paket${yillik ? ' Yıllık' : ''} [${refKod}]`,
      aciklama: `SıraGO Randevu Sistemi - ${paketLabel} Paket, ${yillik ? `12 aylık kullanım (${YILLIK_ODENEN_AY} ay öde)` : '1 aylık kullanım'} (${buAy})\nİşletme: ${merkez.isim}\nRef: ${refKod}${kuponBilgi ? `\nKupon: ${kuponBilgi.kod}` : ''}`,
      fiyat: paketBilgi.fiyat,
    });
    await pool.query('UPDATE isletmeler SET bekleyen_paket=$1, bekleyen_shopier_urun_id=$2, bekleyen_sure=$4, bekleyen_kupon_id=$5 WHERE id=$3', [secilenPaket, String(urun.id), merkez.id, yillik ? 'yil' : null, kuponBilgi?.id || null]);

    const mevcut = (await pool.query("SELECT id, durum FROM odemeler WHERE isletme_id = $1 AND donem = $2", [merkez.id, buAy])).rows[0];
    if (mevcut && ['odendi', 'havale_bekliyor'].includes(mevcut.durum)) {
      // Bu ay zaten kayıt var (yükseltme/erken yenileme): eşleşme bekleyen_shopier_urun_id ile yapılır
    } else if (mevcut) {
      await pool.query(
        "UPDATE odemeler SET durum = 'odeme_bekliyor', odeme_yontemi = 'shopier', referans_kodu = $1, shopier_urun_id = $2, tutar = $3 WHERE id = $4",
        [refKod, urun.id, paketBilgi.fiyat, mevcut.id]);
    } else {
      await pool.query(
        "INSERT INTO odemeler (isletme_id, tutar, donem, durum, odeme_yontemi, referans_kodu, shopier_urun_id) VALUES ($1, $2, $3, 'odeme_bekliyor', 'shopier', $4, $5) ON CONFLICT DO NOTHING",
        [merkez.id, paketBilgi.fiyat, buAy, refKod, urun.id]);
    }
    console.log(`💳 Shopier ödeme başlatıldı: işletme #${merkez.id} - ${secilenPaket} - ${paketBilgi.fiyat}₺`);
    return urun.url;
  }

  // ─── Webhook signature doğrulama ───
  // Shopier HS256 HMAC ile imzalar, header: Shopier-Signature
  webhookDogrula(rawBody, signatureHeader) {
    if (!this.webhookToken || !signatureHeader) return false;
    const computed = crypto
      .createHmac('sha256', this.webhookToken)
      .update(rawBody)
      .digest('hex');
    const a = Buffer.from(computed, 'hex');
    const b = Buffer.from(String(signatureHeader), 'hex');
    return a.length === b.length && crypto.timingSafeEqual(a, b);
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
    let bekleyenPaket = null, bekleyenSure = null, bekleyenKuponId = null;
    if (urunId) {
      const b = (await pool.query('SELECT id, bekleyen_paket, bekleyen_sure, bekleyen_kupon_id FROM isletmeler WHERE bekleyen_shopier_urun_id = $1', [String(urunId)])).rows[0];
      if (b) { isletmeId = b.id; bekleyenPaket = b.bekleyen_paket; bekleyenSure = b.bekleyen_sure; bekleyenKuponId = b.bekleyen_kupon_id; }
    }
    const refMatch = (urunBaslik + ' ' + siparisNotu).match(/SRGO-(\d+)/);
    if (!isletmeId && refMatch) {
      isletmeId = parseInt(refMatch[1]);
    }

    // Email ile eşleştir
    if (!isletmeId && aliciEmail) {
      try {
        const k = (await pool.query(
          "SELECT isletme_id FROM admin_kullanicilar WHERE LOWER(email) = LOWER($1) AND isletme_id IS NOT NULL LIMIT 1", [aliciEmail]
        )).rows[0];
        if (k) isletmeId = k.isletme_id;
      } catch (e) { /* e-posta eşleşmesi opsiyonel */ }
    }

    // Telefon ile eşleştir
    if (!isletmeId && aliciTelefon) {
      const tel = aliciTelefon.replace(/\D/g, '').slice(-10);
      const adaylar = tel.length === 10 ? (await pool.query(
        "SELECT id FROM isletmeler WHERE telefon LIKE $1 AND demo IS NOT TRUE LIMIT 2", [`%${tel}`]
      )).rows : [];
      if (adaylar.length === 1) isletmeId = adaylar[0].id;
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
          body: `${tutar}₺ — paketiniz ${bekleyenSure === 'yil' ? '12 ay' : '30 gün'} yenilendi`,
          url: '/',
          tag: `odeme-ok-${siparisId}`,
        });
      } catch (e) {}

      // Paket: ödeme başlatılırken seçilen paket uygulanır; tutar paket fiyatından düşükse paket değişmez
      let yeniPaket = null, gun = 30;
      if (bekleyenPaket) {
        try {
          const { paketGetir, YILLIK_ODENEN_AY } = require('../config/paketler');
          const p = await paketGetir(bekleyenPaket);
          const isl = (await pool.query('SELECT oncu_no, kilitli_paket, kilitli_fiyat FROM isletmeler WHERE id = $1', [isletmeId])).rows[0];
          const aylik = require('../utils/oncu').etkinFiyat(isl, bekleyenPaket, p.fiyat || 0);
          // Kuponlu ödemede beklenen tutar kuponlu fiyattır (yoksa indirimli ödeyenin paketi değişmezdi)
          let kuponObj = null;
          if (bekleyenKuponId) kuponObj = (await pool.query('SELECT * FROM kuponlar WHERE id = $1', [bekleyenKuponId])).rows[0] || null;
          const beklenen = (t) => (kuponObj ? require('./kupon').uygula(kuponObj, t) : t);
          const tamTutar = bekleyenSure === 'yil' ? aylik * YILLIK_ODENEN_AY : aylik;
          if (tutar + 1 >= beklenen(bekleyenSure === 'yil' ? tamTutar : aylik)) yeniPaket = bekleyenPaket;
          else if (!kuponObj && tutar + 1 >= aylik) yeniPaket = bekleyenPaket;
          else console.warn(`⚠️ Shopier tutarı (${tutar}) ${bekleyenPaket} fiyatından (${p.fiyat}) düşük — paket değiştirilmedi`);
          // Yıllık: tam yıllık tutar (kuponluysa kuponlu hâli) ödendiyse 12 ay (365 gün) uzar
          if (bekleyenSure === 'yil' && tutar + 1 >= beklenen(tamTutar)) gun = 365;
          if (kuponObj && yeniPaket) {
            await require('./kupon').kullanildi({ kuponId: kuponObj.id, isletmeId, once: tamTutar, sonra: tutar });
            await pool.query('UPDATE odemeler SET kupon_kodu = $1 WHERE isletme_id = $2 AND donem = $3', [kuponObj.kod, isletmeId, buAy]);
          }
        } catch (e) {}
      }
      // Bitiş tarihi: kalan günler silinmesin (eskiden NOW()+30 yazılıyordu)
      await pool.query(
        `UPDATE isletmeler SET paket_bitis_tarihi = GREATEST(COALESCE(paket_bitis_tarihi, NOW()), NOW()) + make_interval(days => $3),
           aktif = true, paket = COALESCE($2, paket), bekleyen_paket = NULL, bekleyen_shopier_urun_id = NULL, bekleyen_sure = NULL, bekleyen_kupon_id = NULL,
           son_odeme_sure = CASE WHEN $3 >= 365 THEN 'yil' ELSE 'ay' END WHERE id = $1`,
        [isletmeId, yeniPaket, gun]
      );

      // Öncü Esnaf: ilk 100 ödeyenin paketi ve o günkü fiyatı kilitlenir
      try {
        const { paketGetir } = require('../config/paketler');
        const son = (await pool.query('SELECT paket FROM isletmeler WHERE id = $1', [isletmeId])).rows[0];
        const no = await require('../utils/oncu').oncuOdeme(isletmeId, son.paket, (await paketGetir(son.paket)).fiyat);
        if (no) console.log(`🏆 Öncü Esnaf #${no}: işletme ${isletmeId}`);
      } catch (e) { console.error('Öncü atama hatası:', e.message); }

      require('./odemeOtomasyon').odemeAlindiBildir(isletmeId, tutar);

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
      console.log(`⚠️ Shopier sipariş eşleştirilemedi: #${siparisId} - ${tutar}₺`);
      require('../utils/alarm').alarm(`Eşleşmeyen ödeme #${siparisId}`, `${tutar}₺ geldi ama hangi işletmeye ait bulunamadı. Süper admin → Ödemeler'den elle eşleştirin.`);
    }

    // Ürünü Shopier'dan sil (tek kullanımlık)
    if (urunId) {
      await this.urunSil(urunId);
    }

    return { islem: 'basarili', isletmeId, siparisId, tutar };
  }
}

module.exports = new ShopierService();
