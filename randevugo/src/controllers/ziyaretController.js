// Ziyaret hazırla (2026-10-29): Satış Masası'ndan dükkânı bul, demo sayfasını hazırla, gitmeden önce kişiselleştir.
// Düzenlemeler yalnız demo işletmede (demo = true): bu ekrandan gerçek bir esnafın hizmetleri değişmesin.
const pool = require('../config/db');
const ziyaret = require('../services/ziyaret');
const { randevuLinki } = require('../utils/randevuLinki');

const hata = (res, m, k = 400) => res.status(k).json({ hata: m });
const GORSEL = /^data:image\/(jpeg|png|webp);base64,/;
const demoBul = async (id) => (await pool.query('SELECT * FROM isletmeler WHERE id = $1 AND demo = true', [parseInt(id)])).rows[0];
const degisti = (id) => pool.query('UPDATE isletmeler SET sayfa_guncelleme = NOW() WHERE id = $1', [id]);

class ZiyaretController {
  async ara(req, res) {
    try { res.json({ adaylar: await ziyaret.ara(req.body?.girdi) }); }
    catch (e) { console.error('ziyaret ara:', e.message); hata(res, e.kod ? e.message : 'Arama yapılamadı', e.kod || 500); }
  }

  async hazirla(req, res) {
    try { res.json(await ziyaret.hazirla(req.body?.place_id, req.body?.kategori || null)); }
    catch (e) { console.error('ziyaret hazırla:', e.message); hata(res, e.kod ? e.message : 'Hazırlanamadı', e.kod || 500); }
  }

  // Hazırlık ekranı: sayfa linki + QR, kontrol listesi, hizmetler, ziyaret notu (Google puanı)
  async getir(req, res) {
    try {
      const i = await demoBul(req.params.id);
      if (!i) return hata(res, 'Demo bulunamadı (hesap açılmış olabilir)', 404);
      const lead = (await pool.query('SELECT id, puan, yorum_sayisi, google_maps_url, telefon, kategori FROM potansiyel_musteriler WHERE demo_isletme_id = $1', [i.id])).rows[0] || null;
      const hizmetler = (await pool.query('SELECT id, isim, sure_dk, fiyat, aciklama FROM hizmetler WHERE isletme_id = $1 AND aktif = true ORDER BY id', [i.id])).rows;
      const gorsel = (await pool.query('SELECT tur FROM isletme_gorselleri WHERE isletme_id = $1', [i.id])).rows.map(r => r.tur);
      const link = await randevuLinki(i);
      const qr = await require('qrcode').toDataURL(link, { margin: 1, width: 480, errorCorrectionLevel: 'M' });
      const { haftaOzeti } = require('../utils/gunSaatleri');
      const tasarim = i.sayfa_tasarim_id ? (await pool.query('SELECT id, isim FROM sayfa_tasarimlari WHERE id = $1', [i.sayfa_tasarim_id])).rows[0] : null;
      res.json({
        isletme: { id: i.id, isim: i.isim, adres: i.adres, ilce: i.ilce, telefon: i.telefon, kategori: i.kategori, slug: i.slug,
          tanitim: i.sayfa_tanitim || '', saatler: haftaOzeti(i), goruntulenme: i.demo_goruntulenme || 0 },
        lead, hizmetler, link, qr, tasarim,
        kontrol: {
          logo: gorsel.includes('logo'), kapak: gorsel.includes('kapak'),
          fiyat: hizmetler.length > 0 && hizmetler.every(h => Number(h.fiyat) > 0),
          tasarim: !!tasarim, telefon: !!i.telefon,
        },
      });
    } catch (e) { console.error('ziyaret getir:', e.message); hata(res, 'Alınamadı', 500); }
  }

  // Hizmetler toplu: [{ id?, isim, sure_dk, fiyat, sil? }] — id yoksa eklenir, sil: true ise kaldırılır
  async hizmetler(req, res) {
    const i = await demoBul(req.params.id).catch(() => null);
    if (!i) return hata(res, 'Demo bulunamadı', 404);
    const liste = Array.isArray(req.body?.hizmetler) ? req.body.hizmetler.slice(0, 40) : null;
    if (!liste) return hata(res, 'Hizmet listesi gerekli');
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      for (const h of liste) {
        const id = parseInt(h.id) || null;
        if (h.sil) { if (id) await client.query('UPDATE hizmetler SET aktif = false WHERE id = $1 AND isletme_id = $2', [id, i.id]); continue; }
        const isim = String(h.isim || '').trim().slice(0, 100);
        if (!isim) continue;
        const sure = Math.min(600, Math.max(5, parseInt(h.sure_dk) || 30));
        const fiyat = Math.max(0, Number(h.fiyat) || 0);
        if (id) await client.query('UPDATE hizmetler SET isim = $1, sure_dk = $2, fiyat = $3 WHERE id = $4 AND isletme_id = $5', [isim, sure, fiyat, id, i.id]);
        else await client.query('INSERT INTO hizmetler (isletme_id, isim, sure_dk, fiyat, aktif) VALUES ($1, $2, $3, $4, true)', [i.id, isim, sure, fiyat]);
      }
      await client.query('COMMIT');
      await degisti(i.id);
      res.json({ ok: true });
    } catch (e) {
      await client.query('ROLLBACK').catch(() => {});
      console.error('ziyaret hizmetler:', e.message); hata(res, 'Kaydedilemedi', 500);
    } finally { client.release(); }
  }

  // Logo / kapak (esnafın Instagram'ından ya da dükkânda çekilen foto; Google fotoğrafı kopyalanmaz)
  async gorsel(req, res) {
    try {
      const i = await demoBul(req.params.id);
      if (!i) return hata(res, 'Demo bulunamadı', 404);
      const tur = req.body?.tur, veri = req.body?.veri;
      if (!['logo', 'kapak'].includes(tur)) return hata(res, 'Geçersiz görsel türü');
      if (veri === null) await pool.query('DELETE FROM isletme_gorselleri WHERE isletme_id = $1 AND tur = $2', [i.id, tur]);
      else {
        if (!GORSEL.test(String(veri || '')) || String(veri).length > 2_000_000) return hata(res, 'Görsel JPG, PNG ya da WEBP olmalı (en fazla ~1,5 MB)');
        await pool.query(`INSERT INTO isletme_gorselleri (isletme_id, tur, veri) VALUES ($1, $2, $3)
          ON CONFLICT (isletme_id, tur) DO UPDATE SET veri = EXCLUDED.veri, guncelleme = NOW()`, [i.id, tur, veri]);
      }
      await degisti(i.id);
      res.json({ ok: true });
    } catch (e) { hata(res, 'Kaydedilemedi', 500); }
  }

  // İsim düzeltme ve kısa tanıtım
  async bilgi(req, res) {
    try {
      const i = await demoBul(req.params.id);
      if (!i) return hata(res, 'Demo bulunamadı', 404);
      const isim = req.body?.isim !== undefined ? String(req.body.isim).trim().slice(0, 100) : i.isim;
      if (isim.length < 2) return hata(res, 'İşletme adı en az 2 harf');
      const tanitim = req.body?.tanitim !== undefined ? (String(req.body.tanitim).trim().slice(0, 300) || null) : i.sayfa_tanitim;
      await pool.query('UPDATE isletmeler SET isim = $1, sayfa_tanitim = $2, sayfa_guncelleme = NOW() WHERE id = $3', [isim, tanitim, i.id]);
      res.json({ ok: true });
    } catch (e) { hata(res, 'Kaydedilemedi', 500); }
  }

  // Son hazırlananlar (hesabı henüz açılmamış demolar)
  async son(req, res) {
    try {
      const r = (await pool.query(`SELECT i.id, i.isim, i.ilce, i.olusturma_tarihi, i.demo_goruntulenme, p.puan, p.yorum_sayisi
          FROM isletmeler i LEFT JOIN potansiyel_musteriler p ON p.demo_isletme_id = i.id
         WHERE i.demo = true AND i.olusturma_tarihi > NOW() - INTERVAL '30 days' ORDER BY i.olusturma_tarihi DESC LIMIT 20`)).rows;
      res.json({ liste: r });
    } catch (e) { hata(res, 'Alınamadı', 500); }
  }
}

module.exports = new ZiyaretController();
