// SıraGO Vitrini (kullanıcı kararı 2026-10-14): SıraGO'nun esnafa sattığı ürünler (tablet, stant, toptan
// şampuan…). Kurucu Shopier'deki gibi fotoğraflı ilan verir; ilan her esnafın panelindeki vitrine düşer.
// Ödeme: ilanda Shopier linki varsa esnaf oradan öder; yoksa sipariş ekibe düşer, ekip arar.
const pool = require('../config/db');
const { getIsletmeId } = require('../middleware/auth');

const API = (process.env.BASE_URL || 'https://randevu.xn--srago-n4a.com').replace(/\/$/, '');
const hata = (res, mesaj, kod = 400) => res.status(kod).json({ hata: mesaj });
const sayi = (x) => (x === undefined || x === null || x === '' ? null : Number(x));
const httpMi = (u) => { try { return ['http:', 'https:'].includes(new URL(u).protocol); } catch { return false; } };
const DURUMLAR = ['yeni', 'hazirlaniyor', 'kargoda', 'teslim', 'iptal'];

async function siragoTedarikci() {
  const r = (await pool.query("SELECT id FROM magaza_tedarikciler WHERE isim = 'SıraGO' ORDER BY id LIMIT 1")).rows[0];
  if (r) return r.id;
  return (await pool.query("INSERT INTO magaza_tedarikciler (isim, iletisim, berber_komisyon_yuzde, sirago_komisyon_yuzde) VALUES ('SıraGO', 'SıraGO ekibi', 0, 100) RETURNING id")).rows[0].id;
}

const disari = (u) => ({
  id: u.id, isim: u.isim, aciklama: u.aciklama, fiyat: u.fiyat === null ? null : Number(u.fiyat),
  eski_fiyat: u.eski_fiyat === null ? null : Number(u.eski_fiyat), stok: u.stok, kategori: u.kategori,
  gorsel: u.gorsel_veri ? `${API}/api/magaza/gorsel/${u.id}?v=${new Date(u.guncelleme || u.olusturma).getTime() || 1}` : (u.gorsel_url || null),
  odeme_linki: u.urun_url || null, aktif: u.aktif, hedef: u.hedef, sira: u.sira,
});

class VitrinController {
  // ── Esnaf ──
  async vitrin(req, res) {
    try {
      const r = await pool.query(`SELECT * FROM magaza_urunler WHERE hedef = 'esnaf' AND aktif = true ORDER BY sira, id DESC`);
      res.json({ urunler: r.rows.map(disari) });
    } catch (e) { hata(res, 'Vitrin alınamadı', 500); }
  }

  async siparis(req, res) {
    try {
      const isletmeId = getIsletmeId(req);
      const urunId = parseInt(req.body.urun_id);
      const adet = Math.min(Math.max(parseInt(req.body.adet) || 1, 1), 100);
      const u = (await pool.query("SELECT * FROM magaza_urunler WHERE id = $1 AND hedef = 'esnaf' AND aktif = true", [urunId])).rows[0];
      if (!u) return hata(res, 'Ürün bulunamadı', 404);
      if (u.stok !== null && u.stok < adet) return hata(res, `Stokta ${u.stok} adet var`);
      const tutar = u.fiyat === null ? null : Number(u.fiyat) * adet;
      const s = (await pool.query(
        'INSERT INTO magaza_siparisler (isletme_id, urun_id, adet, tutar, notu) VALUES ($1, $2, $3, $4, $5) RETURNING *',
        [isletmeId, urunId, adet, tutar, String(req.body.notu || '').slice(0, 500) || null])).rows[0];
      try {
        const i = (await pool.query('SELECT isim, telefon FROM isletmeler WHERE id = $1', [isletmeId])).rows[0];
        await require('../utils/alarm').alarm(`🛒 Vitrin siparişi #${s.id}`,
          `${i?.isim || 'İşletme'} (${i?.telefon || '-'}) · ${u.isim} × ${adet}${tutar ? ` · ${tutar}₺` : ''}${u.urun_url ? ' · Shopier linkine yönlendirildi' : ' · arayıp teyit edin'}${s.notu ? `\nNot: ${s.notu}` : ''}`);
      } catch (e) { /* bildirim önemsiz */ }
      res.json({ siparis: s, odeme_linki: u.urun_url || null });
    } catch (e) { hata(res, 'Sipariş alınamadı', 500); }
  }

  async siparislerim(req, res) {
    try {
      const r = await pool.query(`SELECT s.*, u.isim AS urun_isim FROM magaza_siparisler s JOIN magaza_urunler u ON u.id = s.urun_id
        WHERE s.isletme_id = $1 ORDER BY s.id DESC LIMIT 30`, [getIsletmeId(req)]);
      res.json({ siparisler: r.rows });
    } catch (e) { hata(res, 'Siparişler alınamadı', 500); }
  }

  // ── Görsel (herkese açık, önbellekli) ──
  async gorsel(req, res) {
    try {
      const u = (await pool.query('SELECT gorsel_veri FROM magaza_urunler WHERE id = $1', [parseInt(req.params.id)])).rows[0];
      const m = String(u?.gorsel_veri || '').match(/^data:(image\/(?:jpeg|png|webp));base64,(.+)$/);
      if (!m) return res.status(404).end();
      res.set('Content-Type', m[1]).set('Cache-Control', 'public, max-age=31536000, immutable').send(Buffer.from(m[2], 'base64'));
    } catch (e) { res.status(404).end(); }
  }

  // ── Kurucu: ilan ver / düzenle ──
  async ilanlar(req, res) {
    try {
      const r = await pool.query(`SELECT * FROM magaza_urunler WHERE hedef = 'esnaf' ORDER BY aktif DESC, sira, id DESC`);
      res.json({ ilanlar: r.rows.map(disari) });
    } catch (e) { hata(res, 'İlanlar alınamadı', 500); }
  }

  async ilanKaydet(req, res) {
    try {
      const b = req.body;
      const isim = String(b.isim || '').trim();
      if (isim.length < 2) return hata(res, 'Ürün adı yazın');
      const fiyat = sayi(b.fiyat), eski = sayi(b.eski_fiyat), stok = b.stok === '' || b.stok === null || b.stok === undefined ? null : parseInt(b.stok);
      if (fiyat !== null && !(fiyat >= 0)) return hata(res, 'Fiyat sayı olmalı');
      if (b.odeme_linki && !httpMi(b.odeme_linki)) return hata(res, 'Ödeme linki https:// ile başlamalı');
      let gorsel = undefined;                       // undefined = değiştirme, null = sil
      if (b.gorsel === null) gorsel = null;
      else if (typeof b.gorsel === 'string' && b.gorsel.startsWith('data:')) {
        if (!/^data:image\/(jpeg|png|webp);base64,/.test(b.gorsel)) return hata(res, 'Görsel JPG, PNG ya da WEBP olmalı');
        if (b.gorsel.length > 2_800_000) return hata(res, 'Görsel çok büyük (en fazla ~2 MB)');
        gorsel = b.gorsel;
      }
      const tid = await siragoTedarikci();
      const alanlar = [isim, b.aciklama || null, fiyat, eski, stok, b.kategori || null, b.odeme_linki || null, b.aktif !== false, parseInt(b.sira) || 0];
      const id = req.params.id ? parseInt(req.params.id) : null;
      let r;
      if (id) {
        r = await pool.query(`UPDATE magaza_urunler SET isim=$1, aciklama=$2, fiyat=$3, eski_fiyat=$4, stok=$5, kategori=$6, urun_url=$7, aktif=$8, sira=$9, guncelleme=NOW()
          ${gorsel !== undefined ? ', gorsel_veri=$11' : ''} WHERE id=$10 AND hedef='esnaf' RETURNING *`,
          gorsel !== undefined ? [...alanlar, id, gorsel] : [...alanlar, id]);
      } else {
        r = await pool.query(`INSERT INTO magaza_urunler (isim, aciklama, fiyat, eski_fiyat, stok, kategori, urun_url, aktif, sira, tedarikci_id, hedef, gorsel_veri)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'esnaf',$11) RETURNING *`, [...alanlar, tid, gorsel || null]);
      }
      if (!r.rows[0]) return hata(res, 'İlan bulunamadı', 404);
      res.json({ ilan: disari(r.rows[0]) });
    } catch (e) { console.error('ilan kaydet:', e.message); hata(res, 'İlan kaydedilemedi', 500); }
  }

  async siparisler(req, res) {
    try {
      const r = await pool.query(`SELECT s.*, u.isim AS urun_isim, i.isim AS isletme_isim, i.telefon AS isletme_telefon
        FROM magaza_siparisler s JOIN magaza_urunler u ON u.id = s.urun_id LEFT JOIN isletmeler i ON i.id = s.isletme_id
        ORDER BY (s.durum IN ('teslim','iptal')), s.id DESC LIMIT 200`);
      res.json({ siparisler: r.rows });
    } catch (e) { hata(res, 'Siparişler alınamadı', 500); }
  }

  async siparisDurum(req, res) {
    try {
      if (!DURUMLAR.includes(req.body.durum)) return hata(res, 'Geçersiz durum');
      const id = parseInt(req.params.id);
      const eski = (await pool.query('SELECT durum FROM magaza_siparisler WHERE id = $1', [id])).rows[0];
      const s = (await pool.query('UPDATE magaza_siparisler SET durum = $1 WHERE id = $2 RETURNING *', [req.body.durum, id])).rows[0];
      // Teslim edilen siparişin stoğu bir kez düşülür (stok takibi açıksa)
      if (s && req.body.durum === 'teslim' && eski?.durum !== 'teslim') await pool.query('UPDATE magaza_urunler SET stok = GREATEST(stok - $1, 0) WHERE id = $2 AND stok IS NOT NULL', [s.adet, s.urun_id]);
      res.json({ siparis: s });
    } catch (e) { hata(res, 'Güncellenemedi', 500); }
  }
}

module.exports = new VitrinController();
