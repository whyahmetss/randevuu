const pool = require('../config/db');
const bcrypt = require('bcryptjs');
const { getGrupId } = require('../middleware/auth');

function slugify(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/ç/g, 'c').replace(/ğ/g, 'g').replace(/ı/g, 'i')
    .replace(/ö/g, 'o').replace(/ş/g, 's').replace(/ü/g, 'u')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

async function benzersizSlug(base) {
  let slug = base || 'grup';
  let i = 0;
  while (true) {
    const deneme = i === 0 ? slug : `${slug}-${i}`;
    const v = await pool.query('SELECT id FROM sube_gruplari WHERE slug=$1', [deneme]);
    if (v.rows.length === 0) return deneme;
    i++;
    if (i > 50) return `${slug}-${Date.now()}`;
  }
}

class GrupController {
  // POST /api/grup — Grup kur (mevcut işletmeyi ilk şube olarak attach)
  async grupKur(req, res) {
    try {
      const { isim, slug, logo, tanitim, renk_tema } = req.body;
      if (!isim) return res.status(400).json({ hata: 'Grup ismi zorunlu' });

      const kullaniciId = req.kullanici.id;
      const isletmeId = req.kullanici.isletme_id;
      if (!isletmeId) return res.status(400).json({ hata: 'Aktif işletme bulunamadı' });

      // Zaten bir gruba bağlı mı?
      const mevcut = (await pool.query('SELECT grup_id FROM isletmeler WHERE id=$1', [isletmeId])).rows[0];
      if (mevcut?.grup_id) return res.status(400).json({ hata: 'Bu işletme zaten bir gruba bağlı' });

      const finalSlug = await benzersizSlug(slugify(slug || isim));
      const grup = (await pool.query(
        `INSERT INTO sube_gruplari (isim, slug, sahip_kullanici_id, logo, tanitim, renk_tema)
         VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
        [isim, finalSlug, kullaniciId, logo || null, tanitim || null, renk_tema || '#8B5CF6']
      )).rows[0];

      // Mevcut işletmeyi gruba bağla
      await pool.query('UPDATE isletmeler SET grup_id=$1, sube_etiketi=COALESCE(sube_etiketi, $2) WHERE id=$3',
        [grup.id, 'Merkez', isletmeId]);

      // Kullanıcıyı grup_sahibi yap
      await pool.query("UPDATE admin_kullanicilar SET rol='grup_sahibi', grup_id=$1 WHERE id=$2",
        [grup.id, kullaniciId]);

      // Mevcut müşterilere grup_id backfill
      await pool.query('UPDATE musteriler SET grup_id=$1 WHERE isletme_id=$2 AND grup_id IS NULL',
        [grup.id, isletmeId]);

      res.json({ ok: true, grup, mesaj: 'Grup kuruldu. Yeniden giriş yapmanız gerekebilir.' });
    } catch (e) {
      console.error('grupKur hata:', e.message);
      res.status(500).json({ hata: e.message });
    }
  }

  // GET /api/grup — Grup + şube listesi
  async grupGetir(req, res) {
    try {
      const grupId = getGrupId(req);
      if (!grupId) return res.status(404).json({ hata: 'Grup bulunamadı' });

      const grup = (await pool.query('SELECT * FROM sube_gruplari WHERE id=$1', [grupId])).rows[0];
      if (!grup) return res.status(404).json({ hata: 'Grup bulunamadı' });

      const subeler = (await pool.query(
        `SELECT i.id, i.isim, i.slug, i.sube_etiketi, i.sehir, i.ilce, i.adres, i.telefon,
                i.aktif, i.grup_sira, i.calisma_baslangic, i.calisma_bitis,
                (SELECT COUNT(*)::int FROM randevular r WHERE r.isletme_id=i.id AND r.tarih >= CURRENT_DATE) AS aktif_randevu
           FROM isletmeler i
          WHERE i.grup_id=$1
          ORDER BY i.grup_sira, i.id`,
        [grupId]
      )).rows;

      res.json({ grup, subeler });
    } catch (e) {
      console.error('grupGetir hata:', e.message);
      res.status(500).json({ hata: e.message });
    }
  }

  // PUT /api/grup — Grup bilgilerini güncelle
  async grupGuncelle(req, res) {
    try {
      const grupId = getGrupId(req);
      if (!grupId) return res.status(404).json({ hata: 'Grup bulunamadı' });

      const { isim, slug, logo, tanitim, renk_tema } = req.body;
      const updates = [];
      const vals = [];
      let i = 1;
      if (isim !== undefined) { updates.push(`isim=$${i++}`); vals.push(isim); }
      if (slug !== undefined) {
        const s = slugify(slug);
        const cakisma = (await pool.query('SELECT id FROM sube_gruplari WHERE slug=$1 AND id<>$2', [s, grupId])).rows[0];
        if (cakisma) return res.status(400).json({ hata: 'Bu slug kullanılıyor' });
        updates.push(`slug=$${i++}`); vals.push(s);
      }
      if (logo !== undefined) { updates.push(`logo=$${i++}`); vals.push(logo); }
      if (tanitim !== undefined) { updates.push(`tanitim=$${i++}`); vals.push(tanitim); }
      if (renk_tema !== undefined) { updates.push(`renk_tema=$${i++}`); vals.push(renk_tema); }
      if (!updates.length) return res.json({ ok: true });

      vals.push(grupId);
      const grup = (await pool.query(
        `UPDATE sube_gruplari SET ${updates.join(', ')} WHERE id=$${i} RETURNING *`, vals
      )).rows[0];
      res.json({ ok: true, grup });
    } catch (e) {
      console.error('grupGuncelle hata:', e.message);
      res.status(500).json({ hata: e.message });
    }
  }

  // POST /api/grup/sube — Yeni şube ekle
  async subeEkle(req, res) {
    try {
      const grupId = getGrupId(req);
      if (!grupId) return res.status(403).json({ hata: 'Grup bulunamadı' });

      const { isim, sube_etiketi, telefon, sehir, ilce, adres, mudur_email, mudur_sifre, mudur_isim } = req.body;
      if (!isim) return res.status(400).json({ hata: 'Şube ismi zorunlu' });

      // Paket + ödeme tarihleri: grubun mevcut şubesinden (merkezden) inherit
      // Böylece yeni şube ayrıca ödeme istemez — grup paketine dahil
      const ornek = (await pool.query(
        `SELECT paket, paket_bitis_tarihi, deneme_bitis_tarihi, paket_baslangic_tarihi
           FROM isletmeler WHERE grup_id=$1 ORDER BY id LIMIT 1`,
        [grupId]
      )).rows[0];
      const paket = ornek?.paket || 'kurumsal';
      const paketBitis = ornek?.paket_bitis_tarihi || null;
      const denemeBitis = ornek?.deneme_bitis_tarihi || null;
      const paketBaslangic = ornek?.paket_baslangic_tarihi || null;

      // Slug: isim + sehir bazlı
      const baseSlug = slugify(`${isim}-${sehir || ''}`.trim());
      let slug = baseSlug || `sube-${Date.now()}`;
      let i = 0;
      while ((await pool.query('SELECT id FROM isletmeler WHERE slug=$1', [slug])).rows.length > 0) {
        i++; slug = `${baseSlug}-${i}`;
        if (i > 20) { slug = `${baseSlug}-${Date.now()}`; break; }
      }

      const sube = (await pool.query(
        `INSERT INTO isletmeler
           (isim, slug, telefon, sehir, ilce, adres, kategori, aktif, paket, grup_id, sube_etiketi,
            paket_baslangic_tarihi, paket_bitis_tarihi, deneme_bitis_tarihi, olusturma_tarihi)
         VALUES ($1,$2,$3,$4,$5,$6,'genel',true,$7,$8,$9,$10,$11,$12,NOW()) RETURNING *`,
        [isim, slug, telefon || '', sehir || null, ilce || null, adres || null, paket, grupId, sube_etiketi || null,
         paketBaslangic, paketBitis, denemeBitis]
      )).rows[0];

      // Şube müdürü (opsiyonel)
      let mudur = null;
      if (mudur_email && mudur_sifre) {
        const mevcut = (await pool.query('SELECT id FROM admin_kullanicilar WHERE email=$1', [mudur_email])).rows[0];
        if (mevcut) return res.status(400).json({ hata: 'Bu email zaten kayıtlı', sube });
        const hash = await bcrypt.hash(mudur_sifre, 10);
        mudur = (await pool.query(
          `INSERT INTO admin_kullanicilar (isim, email, sifre, rol, isletme_id, grup_id, aktif)
           VALUES ($1,$2,$3,'sube_muduru',$4,$5,true) RETURNING id, isim, email, rol`,
          [mudur_isim || isim, mudur_email, hash, sube.id, grupId]
        )).rows[0];
      }

      res.json({ ok: true, sube, mudur });
    } catch (e) {
      console.error('subeEkle hata:', e.message);
      res.status(500).json({ hata: e.message });
    }
  }

  // PUT /api/grup/sube/:id — Şube düzenle
  async subeGuncelle(req, res) {
    try {
      const grupId = getGrupId(req);
      const subeId = parseInt(req.params.id, 10);
      const sube = (await pool.query('SELECT grup_id FROM isletmeler WHERE id=$1', [subeId])).rows[0];
      if (!sube || sube.grup_id !== grupId) return res.status(404).json({ hata: 'Şube bulunamadı' });

      const { isim, sube_etiketi, telefon, sehir, ilce, adres, grup_sira, aktif } = req.body;
      const upd = []; const vals = []; let i = 1;
      if (isim !== undefined) { upd.push(`isim=$${i++}`); vals.push(isim); }
      if (sube_etiketi !== undefined) { upd.push(`sube_etiketi=$${i++}`); vals.push(sube_etiketi); }
      if (telefon !== undefined) { upd.push(`telefon=$${i++}`); vals.push(telefon); }
      if (sehir !== undefined) { upd.push(`sehir=$${i++}`); vals.push(sehir); }
      if (ilce !== undefined) { upd.push(`ilce=$${i++}`); vals.push(ilce); }
      if (adres !== undefined) { upd.push(`adres=$${i++}`); vals.push(adres); }
      if (grup_sira !== undefined) { upd.push(`grup_sira=$${i++}`); vals.push(grup_sira); }
      if (aktif !== undefined) { upd.push(`aktif=$${i++}`); vals.push(!!aktif); }
      if (!upd.length) return res.json({ ok: true });
      vals.push(subeId);
      const r = (await pool.query(`UPDATE isletmeler SET ${upd.join(', ')} WHERE id=$${i} RETURNING *`, vals)).rows[0];
      res.json({ ok: true, sube: r });
    } catch (e) {
      console.error('subeGuncelle hata:', e.message);
      res.status(500).json({ hata: e.message });
    }
  }

  // DELETE /api/grup/sube/:id — Soft delete
  async subeSil(req, res) {
    try {
      const grupId = getGrupId(req);
      const subeId = parseInt(req.params.id, 10);
      const sube = (await pool.query('SELECT grup_id FROM isletmeler WHERE id=$1', [subeId])).rows[0];
      if (!sube || sube.grup_id !== grupId) return res.status(404).json({ hata: 'Şube bulunamadı' });
      await pool.query('UPDATE isletmeler SET aktif=false WHERE id=$1', [subeId]);
      res.json({ ok: true });
    } catch (e) {
      res.status(500).json({ hata: e.message });
    }
  }

  // GET /api/grup/subeler — Switcher için minimal liste
  async subelerListe(req, res) {
    try {
      const grupId = getGrupId(req);
      if (!grupId) return res.json({ subeler: [] });
      const subeler = (await pool.query(
        `SELECT id, isim, sube_etiketi, sehir, aktif FROM isletmeler
          WHERE grup_id=$1 ORDER BY grup_sira, id`, [grupId]
      )).rows;
      res.json({ subeler });
    } catch (e) {
      res.status(500).json({ hata: e.message });
    }
  }

  // POST /api/grup/sube/:id/mudur — Müdür ekle
  async mudurEkle(req, res) {
    try {
      const grupId = getGrupId(req);
      const subeId = parseInt(req.params.id, 10);
      const sube = (await pool.query('SELECT grup_id FROM isletmeler WHERE id=$1', [subeId])).rows[0];
      if (!sube || sube.grup_id !== grupId) return res.status(404).json({ hata: 'Şube bulunamadı' });

      const { isim, email, sifre } = req.body;
      if (!email || !sifre) return res.status(400).json({ hata: 'Email ve şifre zorunlu' });

      const mevcut = (await pool.query('SELECT id FROM admin_kullanicilar WHERE email=$1', [email])).rows[0];
      if (mevcut) return res.status(400).json({ hata: 'Bu email zaten kayıtlı' });

      const hash = await bcrypt.hash(sifre, 10);
      const mudur = (await pool.query(
        `INSERT INTO admin_kullanicilar (isim, email, sifre, rol, isletme_id, grup_id, aktif)
         VALUES ($1,$2,$3,'sube_muduru',$4,$5,true) RETURNING id, isim, email, rol`,
        [isim || 'Şube Müdürü', email, hash, subeId, grupId]
      )).rows[0];
      res.json({ ok: true, mudur });
    } catch (e) {
      res.status(500).json({ hata: e.message });
    }
  }

  // GET /api/grup/raporlar?baslangic&bitis — Konsolide metrikler
  async raporlar(req, res) {
    try {
      const grupId = getGrupId(req);
      if (!grupId) return res.status(404).json({ hata: 'Grup bulunamadı' });

      const baslangic = req.query.baslangic || new Date(new Date().setDate(1)).toISOString().slice(0, 10);
      const bitis = req.query.bitis || new Date().toISOString().slice(0, 10);

      const subeMetrik = (await pool.query(
        `SELECT i.id, i.isim, i.sube_etiketi, i.sehir,
                COUNT(r.id)::int AS randevu_sayisi,
                COALESCE(SUM(CASE WHEN r.durum='tamamlandi' THEN h.fiyat ELSE 0 END),0) AS ciro,
                COUNT(CASE WHEN r.durum='iptal' OR r.durum='gelmedi' THEN 1 END)::int AS no_show
           FROM isletmeler i
           LEFT JOIN randevular r ON r.isletme_id=i.id AND r.tarih BETWEEN $2 AND $3
           LEFT JOIN hizmetler h ON h.id=r.hizmet_id
          WHERE i.grup_id=$1
          GROUP BY i.id
          ORDER BY ciro DESC`,
        [grupId, baslangic, bitis]
      )).rows;

      const topCalisan = (await pool.query(
        `SELECT c.id, c.isim, i.isim AS sube, COUNT(r.id)::int AS randevu_sayisi,
                COALESCE(SUM(CASE WHEN r.durum='tamamlandi' THEN h.fiyat ELSE 0 END),0) AS ciro
           FROM calisanlar c
           JOIN isletmeler i ON i.id=c.isletme_id AND i.grup_id=$1
           LEFT JOIN randevular r ON r.calisan_id=c.id AND r.tarih BETWEEN $2 AND $3
           LEFT JOIN hizmetler h ON h.id=r.hizmet_id
          GROUP BY c.id, i.isim
          ORDER BY ciro DESC
          LIMIT 5`,
        [grupId, baslangic, bitis]
      )).rows;

      const toplam = subeMetrik.reduce((a, s) => ({
        randevu: a.randevu + Number(s.randevu_sayisi || 0),
        ciro: a.ciro + Number(s.ciro || 0),
        no_show: a.no_show + Number(s.no_show || 0),
      }), { randevu: 0, ciro: 0, no_show: 0 });

      res.json({ baslangic, bitis, toplam, subeler: subeMetrik, top_calisan: topCalisan });
    } catch (e) {
      console.error('grup/raporlar hata:', e.message);
      res.status(500).json({ hata: e.message });
    }
  }
}

module.exports = new GrupController();
