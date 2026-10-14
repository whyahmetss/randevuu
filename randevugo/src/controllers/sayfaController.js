// Randevu sayfası görünümü (kullanıcı kararı 2026-10-14): esnaf hazır tema + tek vurgu rengi seçer,
// kapak fotoğrafı, logo ve kısa tanıtım yükler. Serbest renk seçici yok (okunmaz renk çıkmasın).
const pool = require('../config/db');
const { getIsletmeId } = require('../middleware/auth');

const TEMALAR = ['sade', 'klasik', 'gece', 'pudra', 'klinik'];
const VURGULAR = ['#1f6f4a', '#2fd27a', '#c9973f', '#c2637c', '#0f8b8d', '#2f56c6', '#7c3aed', '#b42318'];
const GORSEL = /^data:image\/(jpeg|png|webp);base64,/;
const hata = (res, m, k = 400) => res.status(k).json({ hata: m });

const disari = (i) => ({
  tema: i.sayfa_tema || 'sade', vurgu: i.sayfa_vurgu || null, tanitim: i.sayfa_tanitim || '',
  kapak: !!i.kapak_var, logo: !!i.logo_var, v: i.sayfa_guncelleme ? new Date(i.sayfa_guncelleme).getTime() : 0, slug: i.slug,
});

const oku = async (id) => (await pool.query(`SELECT i.slug, i.sayfa_tema, i.sayfa_vurgu, i.sayfa_tanitim, i.sayfa_guncelleme,
        (EXISTS (SELECT 1 FROM isletme_gorselleri g WHERE g.isletme_id = i.id AND g.tur = 'kapak')) AS kapak_var,
        (EXISTS (SELECT 1 FROM isletme_gorselleri g WHERE g.isletme_id = i.id AND g.tur = 'logo')) AS logo_var
      FROM isletmeler i WHERE i.id = $1`, [id])).rows[0];

class SayfaController {
  async getir(req, res) {
    try {
      const i = await oku(getIsletmeId(req));
      if (!i) return hata(res, 'İşletme bulunamadı', 404);
      res.json({ ...disari(i), temalar: TEMALAR, vurgular: VURGULAR });
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

  // Herkese açık: /api/book/:slug/gorsel/kapak|logo (önbellekli; adres ?v= ile değişir)
  async gorsel(req, res) {
    try {
      if (!['kapak', 'logo'].includes(req.params.tur)) return res.status(404).end();
      const r = (await pool.query(`SELECT g.veri FROM isletme_gorselleri g JOIN isletmeler i ON i.id = g.isletme_id
        WHERE i.slug = $1 AND i.aktif = true AND g.tur = $2`, [req.params.slug, req.params.tur])).rows[0];
      const m = String(r?.veri || '').match(/^data:(image\/(?:jpeg|png|webp));base64,(.+)$/);
      if (!m) return res.status(404).end();
      // Panel ve randevu sayfası başka alan adında: helmet'in same-origin kuralı görseli engelliyordu
      res.set('Content-Type', m[1]).set('Cache-Control', 'public, max-age=31536000, immutable').set('Cross-Origin-Resource-Policy', 'cross-origin').send(Buffer.from(m[2], 'base64'));
    } catch (e) { res.status(404).end(); }
  }
}

module.exports = new SayfaController();
module.exports.TEMALAR = TEMALAR;
module.exports.VURGULAR = VURGULAR;
