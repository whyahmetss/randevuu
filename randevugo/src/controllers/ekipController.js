// Ekip yönetimi (yalnız kurucu): süper admin hesapları, görevleri ve yetki alanları.
const bcrypt = require('bcryptjs');
const pool = require('../config/db');
const { YETKILER, GOREVLER } = require('../config/ekip');

const hata = (res, mesaj, kod = 400) => res.status(kod).json({ hata: mesaj });

// Görev şablonu + elle seçilen yetkiler → geçerli liste. Kurucu = null (tam yetki).
const temizYetki = (gorev, yetkiler) => {
  if (gorev === 'kurucu') return null;
  const liste = Array.isArray(yetkiler) ? yetkiler : (GOREVLER[gorev]?.yetkiler || []);
  const gecerli = [...new Set(liste.filter(y => YETKILER[y]))];
  if (!gecerli.includes('genel')) gecerli.unshift('genel');   // dashboard herkese açık
  return gecerli;
};

const kaydet = (req, islem, detay) => pool.query(
  'INSERT INTO audit_log (kullanici_id, kullanici_email, islem, detay) VALUES ($1, $2, $3, $4)',
  [req.kullanici.id || null, req.kullanici.email || null, islem, detay]).catch(() => {});

class EkipController {
  async liste(req, res) {
    try {
      const r = await pool.query(`
        SELECT id, isim, email, aktif, ekip_gorev, ekip_yetkileri, son_giris, olusturma_tarihi, patron, gunluk_hedef
        FROM admin_kullanicilar WHERE rol = 'superadmin' ORDER BY patron DESC NULLS LAST, (ekip_yetkileri IS NULL) DESC, id`);
      res.json({
        ekip: r.rows.map(u => ({ ...u, patron: u.patron === true, kurucu: !Array.isArray(u.ekip_yetkileri), ben: u.id === req.kullanici.id })),
        yetkiler: YETKILER,
        gorevler: GOREVLER,
      });
    } catch (e) { hata(res, 'Ekip okunamadı', 500); }
  }

  async ekle(req, res) {
    try {
      const { isim, email, sifre, gorev = 'destek', yetkiler } = req.body;
      const e = String(email || '').trim().toLowerCase();
      if (!String(isim || '').trim()) return hata(res, 'İsim gerekli');
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) return hata(res, 'Geçerli bir e-posta yazın');
      if (String(sifre || '').length < 8) return hata(res, 'Geçici şifre en az 8 karakter olmalı');
      if (!GOREVLER[gorev]) return hata(res, 'Geçersiz görev');
      const mevcut = (await pool.query('SELECT id FROM admin_kullanicilar WHERE LOWER(email) = $1', [e])).rows[0];
      if (mevcut) return hata(res, 'Bu e-postayla bir hesap zaten var');
      const r = await pool.query(
        `INSERT INTO admin_kullanicilar (isim, email, sifre, rol, aktif, ekip_gorev, ekip_yetkileri)
         VALUES ($1, $2, $3, 'superadmin', true, $4, $5) RETURNING id, isim, email, aktif, ekip_gorev, ekip_yetkileri`,
        [String(isim).trim(), e, await bcrypt.hash(String(sifre), 10), gorev, temizYetki(gorev, yetkiler)]);
      kaydet(req, 'ekip_ekle', `${e} · ${GOREVLER[gorev].ad}`);
      res.json({ uye: r.rows[0] });
    } catch (err) { hata(res, 'Üye eklenemedi', 500); }
  }

  async guncelle(req, res) {
    try {
      const id = parseInt(req.params.id);
      const uye = (await pool.query("SELECT * FROM admin_kullanicilar WHERE id = $1 AND rol = 'superadmin'", [id])).rows[0];
      if (!uye) return hata(res, 'Üye bulunamadı', 404);
      if (uye.patron && id !== req.kullanici.id) return hata(res, 'Patron hesabı değiştirilemez', 403);
      const { isim, gorev, yetkiler, aktif, sifre } = req.body;
      if (gorev !== undefined && !GOREVLER[gorev]) return hata(res, 'Geçersiz görev');
      const yeniGorev = gorev !== undefined ? gorev : (uye.ekip_gorev || (Array.isArray(uye.ekip_yetkileri) ? 'destek' : 'kurucu'));
      const yeniYetki = (gorev !== undefined || yetkiler !== undefined) ? temizYetki(yeniGorev, yetkiler) : uye.ekip_yetkileri;
      const yeniAktif = aktif !== undefined ? !!aktif : uye.aktif;

      // Kendini kilitleme ve kurucusuz kalma koruması
      if (id === req.kullanici.id && (!yeniAktif || Array.isArray(yeniYetki))) {
        return hata(res, 'Kendi hesabınızı kapatamaz ya da kurucu yetkinizi kaldıramazsınız');
      }
      if (!Array.isArray(uye.ekip_yetkileri) && (Array.isArray(yeniYetki) || !yeniAktif)) {
        const kalan = (await pool.query(
          "SELECT COUNT(*)::int AS c FROM admin_kullanicilar WHERE rol = 'superadmin' AND aktif = true AND ekip_yetkileri IS NULL AND id <> $1",
          [id])).rows[0].c;
        if (!kalan) return hata(res, 'En az bir aktif kurucu kalmalı');
      }
      if (sifre !== undefined && sifre !== '' && String(sifre).length < 8) return hata(res, 'Şifre en az 8 karakter olmalı');

      const r = await pool.query(
        `UPDATE admin_kullanicilar SET isim = COALESCE($1, isim), ekip_gorev = $2, ekip_yetkileri = $3, aktif = $4,
           sifre = COALESCE($5, sifre)
         WHERE id = $6 RETURNING id, isim, email, aktif, ekip_gorev, ekip_yetkileri`,
        [isim ? String(isim).trim() : null, yeniGorev, yeniYetki, yeniAktif,
          sifre ? await bcrypt.hash(String(sifre), 10) : null, id]);
      kaydet(req, 'ekip_guncelle',
        `${uye.email} · ${GOREVLER[yeniGorev]?.ad || yeniGorev} · ${yeniAktif ? 'aktif' : 'kapalı'}${sifre ? ' · şifre yenilendi' : ''}`);
      res.json({ uye: r.rows[0] });
    } catch (err) { hata(res, 'Üye güncellenemedi', 500); }
  }
}

module.exports = new EkipController();
module.exports._test = { temizYetki };
