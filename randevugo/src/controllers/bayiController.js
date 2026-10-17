// Bayi / toptancı ağı (kullanıcı kararı 2026-10-17): yönetim (yetki: odemeler) + bayinin şifresiz kendi paneli (token).
const pool = require('../config/db');
const bayi = require('../services/bayi');
const { kartLinki, kartMetni } = require('../utils/sahaKodu');
const { telefonNormalize } = require('../utils/telefon');

const hata = (res, mesaj, kod = 400) => res.status(kod).json({ hata: mesaj });
const sayi = (v, min, max) => { const n = Number(String(v ?? '').replace(',', '.')); return Number.isFinite(n) && n >= min && n <= max ? n : null; };
const kaydet = (req, islem, detay) => pool.query(
  'INSERT INTO audit_log (kullanici_id, kullanici_email, islem, detay) VALUES ($1, $2, $3, $4)',
  [req.kullanici?.id || null, req.kullanici?.email || null, islem, detay]).catch(() => {});

async function kart(b) {
  const kod = `B${b.id}`;
  const link = kartLinki(kod);
  const qr = await require('qrcode').toDataURL(link, { margin: 1, width: 640, errorCorrectionLevel: 'M' });
  return { kod, link, qr, mesaj: kartMetni(kod) };
}

class BayiController {
  async liste(req, res) {
    try { res.json({ bayiler: await bayi.liste() }); }
    catch (e) { console.error('bayi liste:', e.message); hata(res, 'Bayiler okunamadı', 500); }
  }

  async ekle(req, res) {
    try {
      const { isim, firma, telefon, notu } = req.body || {};
      if (!String(isim || '').trim()) return hata(res, 'İsim gerekli');
      const yuzde = sayi(req.body.komisyon_yuzde ?? 20, 0, 100);
      const prim = sayi(req.body.ilk_odeme_tl ?? 0, 0, 100000);
      if (yuzde === null) return hata(res, 'Komisyon 0 ile 100 arasında olmalı');
      if (prim === null) return hata(res, 'İlk ödeme primi geçersiz');
      const r = await pool.query(
        `INSERT INTO bayiler (isim, firma, telefon, komisyon_yuzde, ilk_odeme_tl, token, notu)
         VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
        [String(isim).trim(), String(firma || '').trim() || null, telefonNormalize(telefon) || null, yuzde, prim, bayi.yeniToken(),
          String(notu || '').trim().slice(0, 1000) || null]);
      kaydet(req, 'bayi_ekle', `${r.rows[0].isim} · %${yuzde} · ilk ödeme ${prim}₺`);
      res.json({ bayi: { ...r.rows[0], kod: `B${r.rows[0].id}`, panel_linki: bayi.panelLinki(r.rows[0].token) } });
    } catch (e) { console.error('bayi ekle:', e.message); hata(res, 'Bayi eklenemedi', 500); }
  }

  async guncelle(req, res) {
    try {
      const id = parseInt(req.params.id);
      const b = (await pool.query('SELECT * FROM bayiler WHERE id = $1', [id])).rows[0];
      if (!b) return hata(res, 'Bayi bulunamadı', 404);
      const g = req.body || {};
      const yuzde = g.komisyon_yuzde !== undefined ? sayi(g.komisyon_yuzde, 0, 100) : Number(b.komisyon_yuzde);
      const prim = g.ilk_odeme_tl !== undefined ? sayi(g.ilk_odeme_tl, 0, 100000) : Number(b.ilk_odeme_tl);
      if (yuzde === null) return hata(res, 'Komisyon 0 ile 100 arasında olmalı');
      if (prim === null) return hata(res, 'İlk ödeme primi geçersiz');
      const r = await pool.query(
        `UPDATE bayiler SET isim = $1, firma = $2, telefon = $3, komisyon_yuzde = $4, ilk_odeme_tl = $5, aktif = $6, notu = $7, token = $8
         WHERE id = $9 RETURNING *`,
        [g.isim !== undefined && String(g.isim).trim() ? String(g.isim).trim() : b.isim,
          g.firma !== undefined ? (String(g.firma).trim() || null) : b.firma,
          g.telefon !== undefined ? (telefonNormalize(g.telefon) || null) : b.telefon,
          yuzde, prim, g.aktif !== undefined ? !!g.aktif : b.aktif,
          g.notu !== undefined ? (String(g.notu).trim().slice(0, 1000) || null) : b.notu,
          g.yeni_link ? bayi.yeniToken() : b.token, id]);
      kaydet(req, 'bayi_guncelle', `${r.rows[0].isim} · %${yuzde} · ${r.rows[0].aktif ? 'aktif' : 'kapalı'}${g.yeni_link ? ' · panel linki yenilendi' : ''}`);
      res.json({ bayi: { ...r.rows[0], kod: `B${id}`, panel_linki: bayi.panelLinki(r.rows[0].token) } });
    } catch (e) { console.error('bayi güncelle:', e.message); hata(res, 'Bayi güncellenemedi', 500); }
  }

  // Bayiye para verildi: bakiyeden düşer, bayi panelinde "ödenen" olarak görünür
  async odemeEkle(req, res) {
    try {
      const id = parseInt(req.params.id);
      const tutar = sayi(req.body?.tutar, 0.01, 1000000);
      if (tutar === null) return hata(res, 'Geçerli bir tutar yazın');
      const b = (await pool.query('SELECT id, isim FROM bayiler WHERE id = $1', [id])).rows[0];
      if (!b) return hata(res, 'Bayi bulunamadı', 404);
      await pool.query('INSERT INTO bayi_odemeleri (bayi_id, tutar, notu) VALUES ($1, $2, $3)', [id, tutar, String(req.body?.notu || '').trim().slice(0, 300) || null]);
      kaydet(req, 'bayi_odeme', `${b.isim} · ${tutar}₺`);
      res.json({ ok: true });
    } catch (e) { console.error('bayi ödeme:', e.message); hata(res, 'Ödeme kaydedilemedi', 500); }
  }

  async detay(req, res) {
    try {
      const b = (await pool.query('SELECT * FROM bayiler WHERE id = $1', [parseInt(req.params.id)])).rows[0];
      if (!b) return hata(res, 'Bayi bulunamadı', 404);
      const odemeler = (await pool.query('SELECT id, tutar::float, notu, tarih FROM bayi_odemeleri WHERE bayi_id = $1 ORDER BY tarih DESC', [b.id])).rows;
      res.json({ isletmeler: await bayi.isletmeleri(b), odemeler, kart: await kart(b) });
    } catch (e) { console.error('bayi detay:', e.message); hata(res, 'Bayi okunamadı', 500); }
  }

  // Herkese açık, şifresiz: yalnız linkteki gizli anahtarla. Telefon/e-posta gibi esnaf verisi dönmez.
  async panel(req, res) {
    try {
      const v = await bayi.panelVerisi(req.params.token);
      if (!v) return hata(res, 'Bu link geçersiz ya da kapatılmış', 404);
      const { b, ozet, isletmeler, odemeler } = v;
      res.json({
        bayi: { isim: b.isim, firma: b.firma, komisyon_yuzde: Number(b.komisyon_yuzde), ilk_odeme_tl: Number(b.ilk_odeme_tl) },
        kart: await kart(b), ozet, isletmeler, odemeler,
        destek: (() => { const { DESTEK_WP, DESTEK_EPOSTA } = require('../config/iletisim'); const wp = String(DESTEK_WP || '').replace(/\D/g, '');
          return wp ? `https://wa.me/${wp}` : (DESTEK_EPOSTA ? `mailto:${DESTEK_EPOSTA}` : null); })(),
      });
    } catch (e) { console.error('bayi panel:', e.message); hata(res, 'Panel açılamadı', 500); }
  }
}

module.exports = new BayiController();
