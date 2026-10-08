// Venüs okuma uçları — /api/venus/v1
// Yalnızca işletme düzeyinde özet döner; müşteri adı/telefonu yok.
const express = require('express');
const rateLimit = require('express-rate-limit');
const pool = require('../config/db');
const { venusAuth } = require('../middleware/venusAuth');

const router = express.Router();
router.use(venusAuth);
router.use(rateLimit({ windowMs: 60 * 1000, max: 60, message: { hata: 'Çok fazla istek' } }));

// Her çağrı audit log'a düşer (kim ne zaman baktı / ne yaptı)
router.use((req, res, next) => {
  pool.query(
    "INSERT INTO audit_log (kullanici_email, islem, detay) VALUES ('venus', $1, $2)",
    [req.method === 'GET' ? 'venus_okuma' : 'venus_islem', req.path]
  ).catch(() => {});
  next();
});

const sayi = async (sql, p = []) => parseInt((await pool.query(sql, p)).rows[0]?.c) || 0;
const hata = (res, e) => res.status(500).json({ hata: 'Sunucu hatası', detay: String(e?.message || e).slice(0, 200) });

// Günün özeti, dünle karşılaştırma
router.get('/ozet', async (req, res) => {
  try {
    const gun = async (fark) => {
      const p = [fark];
      const tutar = (await pool.query(
        "SELECT COALESCE(SUM(tutar), 0) t FROM odemeler WHERE durum = 'odendi' AND odeme_tarihi::date = CURRENT_DATE - $1::int", p
      )).rows[0].t;
      return {
        randevu: await sayi("SELECT COUNT(*) c FROM randevular WHERE tarih = CURRENT_DATE - $1::int AND durum <> 'iptal'", p),
        yeni_randevu: await sayi('SELECT COUNT(*) c FROM randevular WHERE olusturma_tarihi::date = CURRENT_DATE - $1::int', p),
        yeni_isletme: await sayi('SELECT COUNT(*) c FROM isletmeler WHERE olusturma_tarihi::date = CURRENT_DATE - $1::int', p),
        odeme_adet: await sayi("SELECT COUNT(*) c FROM odemeler WHERE durum = 'odendi' AND odeme_tarihi::date = CURRENT_DATE - $1::int", p),
        odeme_tutar: parseFloat(tutar) || 0,
      };
    };
    let botBagli = 0, botKopuk = 0;
    try {
      const wa = require('../services/whatsappWeb');
      for (const st of Object.values(wa.isletmeler || {})) {
        if (st?.durum === 'bagli') botBagli++; else botKopuk++;
      }
    } catch (e) { /* WA servisi yoksa 0 */ }
    res.json({
      bugun: await gun(0),
      dun: await gun(1),
      aktif_isletme: await sayi('SELECT COUNT(*) c FROM isletmeler WHERE aktif = true'),
      eslesmeyen_odeme: await sayi("SELECT COUNT(*) c FROM odemeler WHERE durum = 'eslestirilmedi'"),
      bot: { bagli: botBagli, kopuk: botKopuk },
      zaman: new Date().toISOString(),
    });
  } catch (e) { hata(res, e); }
});

// Kurulumda takılan işletmeler (en az bir adım eksik, son 60 gün)
router.get('/takilanlar', async (req, res) => {
  try {
    const rows = (await pool.query(`
      SELECT i.id, i.isim, i.olusturma_tarihi,
        (SELECT COUNT(*) FROM hizmetler h WHERE h.isletme_id = i.id) AS hizmet,
        (SELECT COUNT(*) FROM calisanlar c WHERE c.isletme_id = i.id) AS calisan,
        (SELECT COUNT(*) FROM wa_auth_keys w WHERE w.isletme_id = i.id) AS bot,
        (SELECT COUNT(*) FROM randevular r WHERE r.isletme_id = i.id) AS randevu
      FROM isletmeler i
      WHERE i.aktif = true AND i.olusturma_tarihi > NOW() - INTERVAL '60 days'
      ORDER BY i.olusturma_tarihi DESC`)).rows;
    const takilanlar = rows.map(r => {
      const adimlar = [['hizmet', +r.hizmet > 0], ['calisan', +r.calisan > 0], ['bot', +r.bot > 0], ['ilk_randevu', +r.randevu > 0]];
      return {
        id: r.id,
        isim: r.isim,
        eksik: adimlar.filter(a => !a[1]).map(a => a[0]),
        gun: Math.floor((Date.now() - new Date(r.olusturma_tarihi)) / 86400000),
      };
    }).filter(t => t.eksik.length > 0);
    res.json({ takilanlar });
  } catch (e) { hata(res, e); }
});

// Bugün aranacak potansiyel müşteriler (Avcı "Bugün Ara" listesi — kamuya açık işletme bilgileri)
router.get('/aranacaklar', async (req, res) => {
  try {
    const limit = Math.min(Math.max(parseInt(req.query.limit) || 20, 1), 50);
    const avciBot = require('../services/avciBot');
    const liste = await avciBot.gunlukListe(limit);
    res.json({
      aranacaklar: (liste || []).map(m => ({
        id: m.id, isletme_adi: m.isletme_adi, kategori: m.kategori, ilce: m.ilce,
        telefon: m.telefon, puan: m.puan, yorum_sayisi: m.yorum_sayisi, skor: m.skor, web_yok: !m.web_sitesi,
      })),
    });
  } catch (e) { hata(res, e); }
});

// Satış botu sayıları
router.get('/satis-bot', async (req, res) => {
  try {
    const satisBot = require('../services/satisBot');
    res.json({
      durum: satisBot.durum || 'bilinmiyor',
      gonderim_aktif: !!satisBot.aktif,
      fren: satisBot.fren || null,
      gunluk_gonderim: satisBot.gunlukGonderim || 0,
      gunluk_limit: satisBot.ayarlar?.gunlukLimit ?? null,
      istatistikler: await satisBot.istatistikler(),
      huni_7g: await satisBot.huni(7).then(h => h.toplam).catch(() => null),
    });
  } catch (e) { hata(res, e); }
});

// ── Yazma (Venüs tarafında: durdur SARI, başlat TURUNCU = her seferinde kullanıcı onayı) ──
// Yalnız satış botunun mesaj gönderimini açıp kapatır; mesaj içeriği, alıcı, limit Venüs'ten değiştirilemez.
router.post('/satis-bot/durdur', async (req, res) => {
  try {
    const satisBot = require('../services/satisBot');
    const onceAktif = !!satisBot.aktif;
    satisBot.gonderimDurdur();
    res.json({ tamam: true, mesaj: onceAktif ? 'Gönderim durduruldu' : 'Gönderim zaten durmuştu' });
  } catch (e) { hata(res, e); }
});

router.post('/satis-bot/baslat', async (req, res) => {
  try {
    const satisBot = require('../services/satisBot');
    const sonuc = await satisBot.gonderimBaslat();
    if (sonuc?.hata) return res.status(409).json({ hata: sonuc.hata });
    res.json({ tamam: true, mesaj: sonuc?.mesaj || 'Gönderim başladı', gunluk_limit: satisBot.ayarlar?.gunlukLimit ?? null });
  } catch (e) { hata(res, e); }
});

// Dikkat isteyen olaylar
router.get('/uyarilar', async (req, res) => {
  try {
    const saat = Math.min(Math.max(parseInt(req.query.saat) || 24, 1), 168);
    const uyarilar = [];
    const eslesmeyen = (await pool.query(
      "SELECT id, tutar, odeme_tarihi FROM odemeler WHERE durum = 'eslestirilmedi' AND odeme_tarihi > NOW() - make_interval(hours => $1)",
      [saat]
    )).rows;
    eslesmeyen.forEach(o => uyarilar.push({ tip: 'eslesmeyen_odeme', onem: 'yuksek', mesaj: `Eşleşmeyen Shopier ödemesi: ${o.tutar}₺`, zaman: o.odeme_tarihi }));
    const bitecek = (await pool.query(
      "SELECT id, isim, paket_bitis_tarihi FROM isletmeler WHERE aktif = true AND paket_bitis_tarihi BETWEEN NOW() AND NOW() + INTERVAL '3 days'"
    )).rows;
    bitecek.forEach(i => uyarilar.push({ tip: 'paket_bitiyor', onem: 'orta', mesaj: `${i.isim}: paket 3 gün içinde bitiyor`, zaman: i.paket_bitis_tarihi }));
    try {
      const acik = await sayi("SELECT COUNT(*) c FROM destek_talepleri WHERE durum = 'acik'");
      if (acik > 0) uyarilar.push({ tip: 'destek', onem: 'orta', mesaj: `${acik} açık destek talebi` });
    } catch (e) { /* tablo yoksa geç */ }
    try {
      const wa = require('../services/whatsappWeb');
      const kopuk = Object.entries(wa.isletmeler || {})
        .filter(([, st]) => st && st.basariliOturumVardi && st.durum !== 'bagli')
        .map(([id]) => Number(id));
      if (kopuk.length) uyarilar.push({ tip: 'bot_kopuk', onem: 'yuksek', mesaj: `${kopuk.length} işletmenin WhatsApp botu kopuk`, isletmeler: kopuk });
    } catch (e) { /* WA servisi yoksa geç */ }
    try {
      const basvuru = await sayi(
        "SELECT COUNT(*) c FROM iletisim_mesajlari WHERE okundu IS NOT TRUE AND olusturma_tarihi > NOW() - make_interval(hours => $1)", [saat]);
      if (basvuru > 0) uyarilar.push({ tip: 'yeni_basvuru', onem: 'yuksek', mesaj: `${basvuru} yeni başvuru (site/iletişim) — aranmayı bekliyor` });
    } catch (e) { /* tablo/kolon yoksa geç */ }
    try {
      const frenler = (await pool.query(
        "SELECT detay, olusturma_tarihi FROM audit_log WHERE islem = 'satis_bot_fren' AND olusturma_tarihi > NOW() - make_interval(hours => $1) ORDER BY id DESC LIMIT 5",
        [saat]
      )).rows;
      frenler.forEach(f => {
        let d = {}; try { d = JSON.parse(f.detay); } catch (e) { /* bozuk kayıt */ }
        uyarilar.push({ tip: 'satis_bot_fren', onem: 'yuksek', mesaj: `Satış botu durdu: ${d.mesaj || d.sebep || 'otomatik fren'}`, zaman: d.zaman || f.olusturma_tarihi });
      });
    } catch (e) { /* audit_log yoksa geç */ }
    res.json({ uyarilar });
  } catch (e) { hata(res, e); }
});

module.exports = router;
