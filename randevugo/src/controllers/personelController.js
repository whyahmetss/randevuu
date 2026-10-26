// Personel girişi (2026-10-26): esnaf çalışanına davet linki gönderir; çalışan kendi e-posta ve şifresiyle hesap açar,
// telefonundan yalnız kendi randevularını görür ve kendisi için acil durum başlatabilir. Rol 'personel':
// middleware/auth.js bu rolü PERSONEL_YOLLARI dışındaki her uç noktadan geri çevirir (esnaf panelinin verisine erişemez).
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const pool = require('../config/db');
const { getIsletmeId } = require('../middleware/auth');
const { bugunTarih, tarihFormatla } = require('../utils/tarih');

const DAVET_GECERLILIK_GUN = 7;
const hashle = (t) => crypto.createHash('sha256').update(String(t || '')).digest('hex');
const panelAdresi = () => (process.env.ADMIN_PANEL_URL || 'https://admin.xn--srago-n4a.com').replace(/\/$/, '');
const gunEkle = (t, n) => { const [y, a, g] = t.split('-').map(Number); return new Date(Date.UTC(y, a - 1, g + n)).toISOString().slice(0, 10); };

// Davet linkinin geçerli kaydı (çalışan ve işletme adıyla)
async function davetBul(token) {
  if (!/^[a-f0-9]{48}$/.test(String(token || ''))) return null;
  return (await pool.query(
    `SELECT d.*, c.isim AS calisan_isim, i.isim AS isletme_isim FROM personel_davetleri d
       JOIN calisanlar c ON c.id = d.calisan_id AND c.isletme_id = d.isletme_id
       JOIN isletmeler i ON i.id = d.isletme_id
      WHERE d.token_hash = $1 AND d.kullanildi IS NULL AND d.son_gecerlilik > NOW()`, [hashle(token)])).rows[0] || null;
}

class PersonelController {
  // Çalışanın personel hesaplarını kapat (çalışan silinince / esnaf erişimi kaldırınca); açık canlı bağlantı düşer
  async hesaplariKapat(isletmeId, calisanId) {
    const kapanan = (await pool.query(
      `UPDATE admin_kullanicilar SET aktif = false WHERE rol = 'personel' AND isletme_id = $1 AND calisan_id = $2 AND aktif = true RETURNING id`,
      [isletmeId, calisanId])).rows;
    const soket = require('../services/socketServer');
    for (const k of kapanan) soket.kullaniciDusur(k.id);
    await pool.query('DELETE FROM personel_davetleri WHERE isletme_id = $1 AND calisan_id = $2 AND kullanildi IS NULL', [isletmeId, calisanId]);
    return kapanan.length;
  }

  // ── Esnaf ──
  // GET /api/personel-hesaplari → çalışan başına girişi olan hesap
  async liste(req, res) {
    try {
      const rows = (await pool.query(
        `SELECT id, isim, email, calisan_id, son_giris FROM admin_kullanicilar WHERE rol = 'personel' AND isletme_id = $1 AND aktif = true ORDER BY id`,
        [getIsletmeId(req)])).rows;
      res.json({ hesaplar: rows });
    } catch (e) { res.status(500).json({ hata: e.message }); }
  }

  // POST /api/calisanlar/:id/personel-davet → 7 gün geçerli tek kullanımlık link (eskisi geçersiz olur)
  async davetOlustur(req, res) {
    try {
      const isletmeId = getIsletmeId(req);
      const c = (await pool.query('SELECT id, isim, telefon FROM calisanlar WHERE id = $1 AND isletme_id = $2', [req.params.id, isletmeId])).rows[0];
      if (!c) return res.status(404).json({ hata: 'Çalışan bulunamadı' });
      const token = crypto.randomBytes(24).toString('hex');
      await pool.query('DELETE FROM personel_davetleri WHERE isletme_id = $1 AND calisan_id = $2 AND kullanildi IS NULL', [isletmeId, c.id]);
      await pool.query(
        `INSERT INTO personel_davetleri (isletme_id, calisan_id, token_hash, son_gecerlilik) VALUES ($1, $2, $3, NOW() + make_interval(days => $4))`,
        [isletmeId, c.id, hashle(token), DAVET_GECERLILIK_GUN]);
      res.json({ link: `${panelAdresi()}/?personel=${token}`, calisan: c.isim, telefon: c.telefon || null, gecerlilik_gun: DAVET_GECERLILIK_GUN });
    } catch (e) { res.status(500).json({ hata: e.message }); }
  }

  // DELETE /api/calisanlar/:id/personel → girişi kaldır
  async erisimKaldir(req, res) {
    try {
      const sahip = (await pool.query('SELECT id FROM calisanlar WHERE id = $1 AND isletme_id = $2', [req.params.id, getIsletmeId(req)])).rows[0];
      if (!sahip) return res.status(404).json({ hata: 'Çalışan bulunamadı' });
      res.json({ kapanan: await this.hesaplariKapat(getIsletmeId(req), sahip.id) });
    } catch (e) { res.status(500).json({ hata: e.message }); }
  }

  // ── Davet (herkese açık) ──
  // GET /api/personel/davet/:token
  async davetBilgi(req, res) {
    try {
      const d = await davetBul(req.params.token);
      if (!d) return res.status(404).json({ hata: 'Davet linki geçersiz ya da süresi dolmuş. İşletmenizden yeni link isteyin.' });
      res.json({ isletme: d.isletme_isim, calisan: d.calisan_isim });
    } catch (e) { res.status(500).json({ hata: e.message }); }
  }

  // POST /api/personel/davet/:token { email, sifre } → hesap açılır, oturum döner
  async davetKabul(req, res) {
    try {
      const d = await davetBul(req.params.token);
      if (!d) return res.status(404).json({ hata: 'Davet linki geçersiz ya da süresi dolmuş. İşletmenizden yeni link isteyin.' });
      const email = String(req.body.email || '').trim();
      const sifre = String(req.body.sifre || '');
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 150) return res.status(400).json({ hata: 'Geçerli bir e-posta yazın' });
      if (sifre.length < 8 || sifre.length > 72) return res.status(400).json({ hata: 'Şifre en az 8 karakter olmalı' });
      const varMi = (await pool.query('SELECT id FROM admin_kullanicilar WHERE LOWER(email) = LOWER($1)', [email])).rows[0];
      if (varMi) return res.status(400).json({ hata: 'Bu e-posta ile zaten bir hesap var. Başka bir e-posta yazın.' });
      // Aynı link iki kez kullanılamaz (aynı anda iki istek)
      const kilit = (await pool.query('UPDATE personel_davetleri SET kullanildi = NOW() WHERE id = $1 AND kullanildi IS NULL RETURNING id', [d.id])).rows[0];
      if (!kilit) return res.status(409).json({ hata: 'Bu davet linki az önce kullanıldı.' });
      const k = (await pool.query(
        `INSERT INTO admin_kullanicilar (isim, email, sifre, rol, isletme_id, calisan_id, aktif) VALUES ($1, $2, $3, 'personel', $4, $5, true) RETURNING *`,
        [d.calisan_isim, email, await bcrypt.hash(sifre, 10), d.isletme_id, d.calisan_id])).rows[0];
      res.json(require('./authController').oturumCevabi(k));
    } catch (e) { res.status(500).json({ hata: e.message }); }
  }

  // ── Personel ──
  // GET /api/personel/ben
  async ben(req, res) {
    try {
      const r = (await pool.query(
        `SELECT c.id AS calisan_id, c.isim AS calisan, i.isim AS isletme, i.id AS isletme_id FROM calisanlar c JOIN isletmeler i ON i.id = c.isletme_id
          WHERE c.id = $1 AND c.isletme_id = $2`, [req.kullanici.calisan_id, getIsletmeId(req)])).rows[0];
      if (!r) return res.status(404).json({ hata: 'Çalışan kaydınız bulunamadı. İşletmenizle görüşün.' });
      res.json(r);
    } catch (e) { res.status(500).json({ hata: e.message }); }
  }

  // GET /api/personel/randevular?tarih=YYYY-MM-DD → o günden 7 gün (telefon numarası gösterilmez)
  async randevularim(req, res) {
    try {
      const bas = /^\d{4}-\d{2}-\d{2}$/.test(String(req.query.tarih || '')) ? req.query.tarih : bugunTarih();
      const rows = (await pool.query(
        `SELECT r.id, r.tarih, r.saat, r.bitis_saati, r.durum, m.isim AS musteri,
                COALESCE((SELECT STRING_AGG(h2.isim, ', ' ORDER BY rh.sira) FROM randevu_hizmetleri rh JOIN hizmetler h2 ON h2.id = rh.hizmet_id WHERE rh.randevu_id = r.id),
                         (SELECT isim FROM hizmetler WHERE id = r.hizmet_id)) AS hizmet
           FROM randevular r JOIN musteriler m ON m.id = r.musteri_id
          WHERE r.isletme_id = $1 AND r.calisan_id = $2 AND r.tarih >= $3 AND r.tarih < $4 AND r.durum <> 'iptal'
          ORDER BY r.tarih, r.saat`,
        [getIsletmeId(req), req.kullanici.calisan_id, bas, gunEkle(bas, 7)])).rows;
      res.json({ randevular: rows.map(r => ({ ...r, tarih: tarihFormatla(r.tarih), saat: String(r.saat).slice(0, 5), bitis_saati: r.bitis_saati ? String(r.bitis_saati).slice(0, 5) : null })) });
    } catch (e) { res.status(500).json({ hata: e.message }); }
  }
}

module.exports = new PersonelController();
