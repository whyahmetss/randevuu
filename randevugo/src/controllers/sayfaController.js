// Randevu sayfası görünümü (kullanıcı kararı 2026-10-14): esnaf hazır tema + tek vurgu rengi seçer,
// kapak fotoğrafı, logo ve kısa tanıtım yükler. Serbest renk seçici yok (okunmaz renk çıkmasın).
const pool = require('../config/db');
const { getIsletmeId } = require('../middleware/auth');

const TEMALAR = ['sade', 'klasik', 'gece', 'pudra', 'klinik'];
const VURGULAR = ['#1f6f4a', '#2fd27a', '#c9973f', '#c2637c', '#0f8b8d', '#2f56c6', '#7c3aed', '#b42318'];
const GORSEL = /^data:image\/(jpeg|png|webp);base64,/;
const hata = (res, m, k = 400) => res.status(k).json({ hata: m });
const galeriLimit = () => require('../utils/platformAyar').al('galeri_limit');   // Platform Ayarları (varsayılan 12)
const GORSEL_MAX = 2_000_000;
// Instagram: "@kemalberber", "instagram.com/kemalberber/" ya da tam adres → kullanıcı adı
const instagramAd = (v) => {
  const s = String(v || '').trim().replace(/^https?:\/\/(www\.)?instagram\.com\//i, '').replace(/^@/, '').split(/[/?#]/)[0];
  return s;
};
const gorselGecerli = (v) => GORSEL.test(String(v || '')) && String(v).length <= GORSEL_MAX;

const disari = (i) => ({
  tema: i.sayfa_tema || 'sade', vurgu: i.sayfa_vurgu || null, tanitim: i.sayfa_tanitim || '',
  hakkimizda: i.sayfa_hakkimizda || '', instagram: i.sayfa_instagram || '',
  kapak: !!i.kapak_var, logo: !!i.logo_var, v: i.sayfa_guncelleme ? new Date(i.sayfa_guncelleme).getTime() : 0, slug: i.slug,
});

const oku = async (id) => (await pool.query(`SELECT i.slug, i.sayfa_tema, i.sayfa_vurgu, i.sayfa_tanitim, i.sayfa_guncelleme, i.sayfa_hakkimizda, i.sayfa_instagram,
        (EXISTS (SELECT 1 FROM isletme_gorselleri g WHERE g.isletme_id = i.id AND g.tur = 'kapak')) AS kapak_var,
        (EXISTS (SELECT 1 FROM isletme_gorselleri g WHERE g.isletme_id = i.id AND g.tur = 'logo')) AS logo_var
      FROM isletmeler i WHERE i.id = $1`, [id])).rows[0];

// data:image/...;base64 → ikili görsel
function gorselGonder(res, veri) {
  const m = String(veri || '').match(/^data:(image\/(?:jpeg|png|webp));base64,(.+)$/);
  if (!m) return res.status(404).end();
  // Panel ve randevu sayfası başka alan adında: helmet'in same-origin kuralı görseli engelliyordu
  res.set('Content-Type', m[1]).set('Cache-Control', 'public, max-age=31536000, immutable').set('Cross-Origin-Resource-Policy', 'cross-origin').send(Buffer.from(m[2], 'base64'));
}
const sayfaDegisti = (id) => pool.query('UPDATE isletmeler SET sayfa_guncelleme = NOW() WHERE id = $1', [id]);
// Galeri ve ekip listeleri (görsel verisi olmadan; görsel ayrı adresten gelir)
const galeriListe = async (id) => (await pool.query(
  'SELECT id, aciklama FROM sayfa_galeri WHERE isletme_id = $1 ORDER BY sira, id', [id])).rows;
const ekipListe = async (id) => (await pool.query(
  `SELECT c.id, c.isim, c.uzmanlik, EXTRACT(EPOCH FROM g.guncelleme)::bigint AS foto_v
     FROM calisanlar c LEFT JOIN calisan_gorselleri g ON g.calisan_id = c.id AND g.isletme_id = c.isletme_id
    WHERE c.isletme_id = $1 AND COALESCE(c.aktif, true) = true ORDER BY c.id`, [id])).rows
  .map(c => ({ id: c.id, isim: c.isim, uzmanlik: c.uzmanlik || '', foto_v: c.foto_v ? Number(c.foto_v) : null }));

class SayfaController {
  async getir(req, res) {
    try {
      const i = await oku(getIsletmeId(req));
      if (!i) return hata(res, 'İşletme bulunamadı', 404);
      const id = getIsletmeId(req);
      res.json({ ...disari(i), temalar: TEMALAR, vurgular: VURGULAR, galeri_limit: galeriLimit(), galeri: await galeriListe(id), ekip: await ekipListe(id) });
    } catch (e) { hata(res, 'Alınamadı', 500); }
  }

  async kaydet(req, res) {
    try {
      const b = req.body || {};
      const set = [], deg = [];
      const ekle = (kolon, v) => { deg.push(v); set.push(`${kolon} = $${deg.length}`); };
      if (b.tema !== undefined) { if (!TEMALAR.includes(b.tema)) return hata(res, 'Geçersiz tema'); ekle('sayfa_tema', b.tema); }
      if (b.vurgu !== undefined) { if (b.vurgu !== null && !VURGULAR.includes(b.vurgu)) return hata(res, 'Geçersiz renk'); ekle('sayfa_vurgu', b.vurgu); }
      if (b.tanitim !== undefined) ekle('sayfa_tanitim', String(b.tanitim || '').trim().slice(0, 300) || null);
      if (b.hakkimizda !== undefined) ekle('sayfa_hakkimizda', String(b.hakkimizda || '').trim().slice(0, 1500) || null);
      if (b.instagram !== undefined) {
        const ad = instagramAd(b.instagram);
        if (ad && !/^[A-Za-z0-9._]{1,30}$/.test(ad)) return hata(res, 'Instagram kullanıcı adı geçersiz');
        ekle('sayfa_instagram', ad || null);
      }
      const id = getIsletmeId(req);
      for (const alan of ['kapak', 'logo']) {
        if (b[alan] === undefined || b[alan] === null) continue;
        if (!GORSEL.test(String(b[alan]))) return hata(res, 'Görsel JPG, PNG ya da WEBP olmalı');
        if (String(b[alan]).length > 2_000_000) return hata(res, 'Görsel çok büyük');
      }
      for (const alan of ['kapak', 'logo']) {
        if (b[alan] === null) await pool.query('DELETE FROM isletme_gorselleri WHERE isletme_id = $1 AND tur = $2', [id, alan]);
        else if (b[alan] !== undefined) await pool.query(`INSERT INTO isletme_gorselleri (isletme_id, tur, veri) VALUES ($1, $2, $3)
          ON CONFLICT (isletme_id, tur) DO UPDATE SET veri = EXCLUDED.veri, guncelleme = NOW()`, [id, alan, b[alan]]);
      }
      deg.push(id);
      await pool.query(`UPDATE isletmeler SET ${[...set, 'sayfa_guncelleme = NOW()'].join(', ')} WHERE id = $${deg.length}`, deg);
      res.json(disari(await oku(id)));
    } catch (e) { console.error('sayfa kaydet:', e.message); hata(res, 'Kaydedilemedi', 500); }
  }

  // ── Galeri: en fazla 12 fotoğraf, sırası değiştirilebilir ──
  async galeriEkle(req, res) {
    try {
      const id = getIsletmeId(req);
      const { veri, aciklama } = req.body || {};
      if (!gorselGecerli(veri)) return hata(res, 'Fotoğraf JPG, PNG ya da WEBP olmalı ve çok büyük olmamalı');
      const n = (await pool.query('SELECT COUNT(*)::int AS n, COALESCE(MAX(sira), 0) AS s FROM sayfa_galeri WHERE isletme_id = $1', [id])).rows[0];
      if (n.n >= galeriLimit()) return hata(res, `Galeride en fazla ${galeriLimit()} fotoğraf olabilir. Önce birini kaldır.`);
      await pool.query('INSERT INTO sayfa_galeri (isletme_id, veri, aciklama, sira) VALUES ($1, $2, $3, $4)',
        [id, veri, String(aciklama || '').trim().slice(0, 120) || null, Number(n.s) + 1]);
      await sayfaDegisti(id);
      res.json({ galeri: await galeriListe(id) });
    } catch (e) { console.error('galeri ekle:', e.message); hata(res, 'Eklenemedi', 500); }
  }

  async galeriSil(req, res) {
    try {
      const id = getIsletmeId(req);
      await pool.query('DELETE FROM sayfa_galeri WHERE id = $1 AND isletme_id = $2', [Number(req.params.id) || 0, id]);
      await sayfaDegisti(id);
      res.json({ galeri: await galeriListe(id) });
    } catch (e) { hata(res, 'Silinemedi', 500); }
  }

  // PUT /randevu-sayfasi/galeri/:id  { yon: -1 | 1 } → komşusuyla yer değiştirir; { aciklama } → açıklama
  async galeriGuncelle(req, res) {
    try {
      const id = getIsletmeId(req);
      const liste = await galeriListe(id);
      const i = liste.findIndex(g => g.id === Number(req.params.id));
      if (i < 0) return hata(res, 'Fotoğraf bulunamadı', 404);
      const { yon, aciklama } = req.body || {};
      if (aciklama !== undefined) await pool.query('UPDATE sayfa_galeri SET aciklama = $1 WHERE id = $2 AND isletme_id = $3',
        [String(aciklama || '').trim().slice(0, 120) || null, liste[i].id, id]);
      const j = i + (yon === -1 ? -1 : yon === 1 ? 1 : 0);
      if (j !== i && j >= 0 && j < liste.length) {
        [liste[i], liste[j]] = [liste[j], liste[i]];
        for (let k = 0; k < liste.length; k++) await pool.query('UPDATE sayfa_galeri SET sira = $1 WHERE id = $2 AND isletme_id = $3', [k + 1, liste[k].id, id]);
      }
      await sayfaDegisti(id);
      res.json({ galeri: await galeriListe(id) });
    } catch (e) { hata(res, 'Kaydedilemedi', 500); }
  }

  // ── Ekip kartı: uzmanlık + fotoğraf (null → kaldır) ──
  async ekipKaydet(req, res) {
    try {
      const id = getIsletmeId(req);
      const cid = Number(req.params.id) || 0;
      const c = (await pool.query('SELECT id FROM calisanlar WHERE id = $1 AND isletme_id = $2', [cid, id])).rows[0];
      if (!c) return hata(res, 'Çalışan bulunamadı', 404);
      const { uzmanlik, foto } = req.body || {};
      if (foto !== undefined && foto !== null && !gorselGecerli(foto)) return hata(res, 'Fotoğraf JPG, PNG ya da WEBP olmalı');
      if (uzmanlik !== undefined) await pool.query('UPDATE calisanlar SET uzmanlik = $1 WHERE id = $2', [String(uzmanlik || '').trim().slice(0, 80) || null, cid]);
      if (foto === null) await pool.query('DELETE FROM calisan_gorselleri WHERE calisan_id = $1 AND isletme_id = $2', [cid, id]);
      else if (foto !== undefined) await pool.query(`INSERT INTO calisan_gorselleri (calisan_id, isletme_id, veri) VALUES ($1, $2, $3)
        ON CONFLICT (calisan_id) DO UPDATE SET veri = EXCLUDED.veri, guncelleme = NOW() WHERE calisan_gorselleri.isletme_id = EXCLUDED.isletme_id`, [cid, id, foto]);
      await sayfaDegisti(id);
      res.json({ ekip: await ekipListe(id) });
    } catch (e) { console.error('ekip kaydet:', e.message); hata(res, 'Kaydedilemedi', 500); }
  }

  // Herkese açık: /api/book/:slug/galeri/:id ve /api/book/:slug/ekip/:id/foto (önbellekli; adres ?v= ile değişir)
  async galeriGorsel(req, res) {
    try {
      const r = (await pool.query(`SELECT g.veri FROM sayfa_galeri g JOIN isletmeler i ON i.id = g.isletme_id
        WHERE i.slug = $1 AND i.aktif = true AND g.id = $2`, [req.params.slug, Number(req.params.id) || 0])).rows[0];
      gorselGonder(res, r?.veri);
    } catch (e) { res.status(404).end(); }
  }

  async ekipGorsel(req, res) {
    try {
      const r = (await pool.query(`SELECT g.veri FROM calisan_gorselleri g JOIN isletmeler i ON i.id = g.isletme_id
        WHERE i.slug = $1 AND i.aktif = true AND g.calisan_id = $2`, [req.params.slug, Number(req.params.id) || 0])).rows[0];
      gorselGonder(res, r?.veri);
    } catch (e) { res.status(404).end(); }
  }

  // Herkese açık: /api/book/:slug/gorsel/kapak|logo (önbellekli; adres ?v= ile değişir)
  async gorsel(req, res) {
    try {
      if (!['kapak', 'logo'].includes(req.params.tur)) return res.status(404).end();
      const r = (await pool.query(`SELECT g.veri FROM isletme_gorselleri g JOIN isletmeler i ON i.id = g.isletme_id
        WHERE i.slug = $1 AND i.aktif = true AND g.tur = $2`, [req.params.slug, req.params.tur])).rows[0];
      gorselGonder(res, r?.veri);
    } catch (e) { res.status(404).end(); }
  }
}

module.exports = new SayfaController();
module.exports.TEMALAR = TEMALAR;
module.exports.VURGULAR = VURGULAR;
module.exports.galeriListe = galeriListe;
module.exports.ekipListe = ekipListe;
