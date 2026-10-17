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
const ODEMELER = ['bekliyor', 'odendi', 'iade'];
const kisa = (x, n) => (x === undefined ? undefined : (String(x || '').trim().slice(0, n) || null));
// Demo dükkânın (satış için açılan örnek) siparişi deneme amaçlıdır: rapora girmez
const GERCEK = 'i.demo IS NOT TRUE';

async function siragoTedarikci() {
  const r = (await pool.query("SELECT id FROM magaza_tedarikciler WHERE isim = 'SıraGO' ORDER BY id LIMIT 1")).rows[0];
  if (r) return r.id;
  return (await pool.query("INSERT INTO magaza_tedarikciler (isim, iletisim, berber_komisyon_yuzde, sirago_komisyon_yuzde) VALUES ('SıraGO', 'SıraGO ekibi', 0, 100) RETURNING id")).rows[0].id;
}

const disari = (u) => ({
  id: u.id, isim: u.isim, aciklama: u.aciklama, fiyat: u.fiyat === null ? null : Number(u.fiyat),
  eski_fiyat: u.eski_fiyat === null ? null : Number(u.eski_fiyat), stok: u.stok, kategori: u.kategori,
  gorsel: u.gorsel_veri ? `${API}/api/magaza/gorsel/${u.id}?v=${new Date(u.guncelleme || u.olusturma).getTime() || 1}` : (u.gorsel_url || null),
  odeme_linki: u.urun_url || null, aktif: u.aktif, hedef: u.hedef, sira: u.sira, kisisel_qr: !!u.kisisel_qr,
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
        await require('../utils/alarm').alarm(`🛒 Mağaza siparişi #${s.id}`,
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
      // Panel ve randevu sayfası başka alan adında: helmet'in same-origin kuralı görseli engelliyordu
      res.set('Content-Type', m[1]).set('Cache-Control', 'public, max-age=31536000, immutable').set('Cross-Origin-Resource-Policy', 'cross-origin').send(Buffer.from(m[2], 'base64'));
    } catch (e) { res.status(404).end(); }
  }

  // ── Kurucu: ilan ver / düzenle ──
  async ilanlar(req, res) {
    try {
      const r = await pool.query(`SELECT u.*,
          (SELECT COALESCE(SUM(s.adet), 0)::int FROM magaza_siparisler s JOIN isletmeler i ON i.id = s.isletme_id
            WHERE s.urun_id = u.id AND s.durum <> 'iptal' AND ${GERCEK}) AS satilan,
          (SELECT COALESCE(SUM(s.tutar), 0)::float FROM magaza_siparisler s JOIN isletmeler i ON i.id = s.isletme_id
            WHERE s.urun_id = u.id AND s.durum <> 'iptal' AND ${GERCEK}) AS ciro
        FROM magaza_urunler u WHERE u.hedef = 'esnaf' ORDER BY u.aktif DESC, u.sira, u.id DESC`);
      res.json({ ilanlar: r.rows.map(u => ({ ...disari(u), satilan: u.satilan, ciro: u.ciro })) });
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
      const alanlar = [isim, b.aciklama || null, fiyat, eski, stok, b.kategori || null, b.odeme_linki || null, b.aktif !== false, parseInt(b.sira) || 0, !!b.kisisel_qr];
      const id = req.params.id ? parseInt(req.params.id) : null;
      let r;
      if (id) {
        r = await pool.query(`UPDATE magaza_urunler SET isim=$1, aciklama=$2, fiyat=$3, eski_fiyat=$4, stok=$5, kategori=$6, urun_url=$7, aktif=$8, sira=$9, kisisel_qr=$10, guncelleme=NOW()
          ${gorsel !== undefined ? ', gorsel_veri=$12' : ''} WHERE id=$11 AND hedef='esnaf' RETURNING *`,
          gorsel !== undefined ? [...alanlar, id, gorsel] : [...alanlar, id]);
      } else {
        r = await pool.query(`INSERT INTO magaza_urunler (isim, aciklama, fiyat, eski_fiyat, stok, kategori, urun_url, aktif, sira, kisisel_qr, tedarikci_id, hedef, gorsel_veri)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'esnaf',$12) RETURNING *`, [...alanlar, tid, gorsel || null]);
      }
      if (!r.rows[0]) return hata(res, 'İlan bulunamadı', 404);
      res.json({ ilan: disari(r.rows[0]) });
    } catch (e) { console.error('ilan kaydet:', e.message); hata(res, 'İlan kaydedilemedi', 500); }
  }

  async siparisler(req, res) {
    try {
      const r = await pool.query(`SELECT s.*, u.isim AS urun_isim, u.kisisel_qr, i.isim AS isletme_isim, i.telefon AS isletme_telefon,
          i.ilce AS isletme_ilce, (i.demo IS TRUE) AS demo
        FROM magaza_siparisler s JOIN magaza_urunler u ON u.id = s.urun_id LEFT JOIN isletmeler i ON i.id = s.isletme_id
        ORDER BY (s.durum IN ('teslim','iptal')), s.id DESC LIMIT 500`);
      res.json({ siparisler: r.rows });
    } catch (e) { hata(res, 'Siparişler alınamadı', 500); }
  }

  // QR stand baskı dosyası için: dükkân adı, randevu linki ve yüksek çözünürlüklü siyah QR (çizim panelde yapılır)
  async baski(req, res) {
    try {
      const s = (await pool.query(`SELECT i.id, i.isim, i.slug FROM magaza_siparisler s JOIN isletmeler i ON i.id = s.isletme_id WHERE s.id = $1`, [parseInt(req.params.id)])).rows[0];
      if (!s) return hata(res, 'Sipariş bulunamadı', 404);
      if (!s.slug) return hata(res, 'İşletmenin randevu linki yok — önce panelinden QR sayfasını bir kez açsın');
      const url = `https://randevu.xn--srago-n4a.com/book/${s.slug}`;
      const qr = await require('qrcode').toDataURL(url, { width: 1200, margin: 1, errorCorrectionLevel: 'H', color: { dark: '#111111', light: '#FFFFFF' } });
      res.json({ isim: s.isim, url, gorunen: `randevu.sırago.com/book/${s.slug}`, qr });
    } catch (e) { hata(res, 'Baskı dosyası hazırlanamadı', 500); }
  }

  // Sipariş güncelle: durum, ödeme, kargo, iç not (yalnız gönderilen alanlar). Kargoya verilince esnafa WhatsApp gider.
  async siparisGuncelle(req, res) {
    try {
      const id = parseInt(req.params.id);
      const b = req.body || {};
      if (b.durum !== undefined && !DURUMLAR.includes(b.durum)) return hata(res, 'Geçersiz durum');
      if (b.odeme_durumu !== undefined && !ODEMELER.includes(b.odeme_durumu)) return hata(res, 'Geçersiz ödeme durumu');
      const eski = (await pool.query('SELECT * FROM magaza_siparisler WHERE id = $1', [id])).rows[0];
      if (!eski) return hata(res, 'Sipariş bulunamadı', 404);
      const alan = { durum: b.durum, odeme_durumu: b.odeme_durumu, kargo_firma: kisa(b.kargo_firma, 60), kargo_takip: kisa(b.kargo_takip, 80), admin_notu: kisa(b.admin_notu, 1000) };
      const set = [], deger = [];
      for (const [k, v] of Object.entries(alan)) if (v !== undefined) { deger.push(v); set.push(`${k} = $${deger.length}`); }
      if (!set.length) return hata(res, 'Değişiklik yok');
      deger.push(id);
      const s = (await pool.query(`UPDATE magaza_siparisler SET ${set.join(', ')}, guncelleme = NOW() WHERE id = $${deger.length} RETURNING *`, deger)).rows[0];
      // Teslim edilen siparişin stoğu bir kez düşülür (stok takibi açıksa)
      if (b.durum === 'teslim' && eski.durum !== 'teslim') await pool.query('UPDATE magaza_urunler SET stok = GREATEST(stok - $1, 0) WHERE id = $2 AND stok IS NOT NULL', [s.adet, s.urun_id]);
      let bildirildi = false;
      if (b.durum && b.durum !== eski.durum && ['kargoda', 'teslim', 'iptal'].includes(b.durum)) bildirildi = await this._esnafaHaber(s);
      res.json({ siparis: s, bildirildi });
    } catch (e) { console.error('sipariş güncelle:', e.message); hata(res, 'Güncellenemedi', 500); }
  }

  // Esnafa sipariş durumu (Merkez OTP numarasından); bağlı değilse sessizce geçer
  async _esnafaHaber(s) {
    try {
      const r = (await pool.query(`SELECT i.isim, i.telefon, i.demo, u.isim AS urun FROM isletmeler i, magaza_urunler u WHERE i.id = $1 AND u.id = $2`, [s.isletme_id, s.urun_id])).rows[0];
      const tel = require('../utils/telefon').telefonNormalize(r?.telefon);
      if (!r || r.demo || !/^905\d{9}$/.test(String(tel))) return false;
      const metin = {
        kargoda: `📦 ${r.isim}, SıraGO siparişiniz (${r.urun} × ${s.adet}) kargoya verildi.${s.kargo_firma ? `\nKargo: ${s.kargo_firma}` : ''}${s.kargo_takip ? `\nTakip no: ${s.kargo_takip}` : ''}`,
        teslim: `✅ ${r.isim}, SıraGO siparişiniz (${r.urun}) teslim edildi olarak işaretlendi. İyi kullanımlar!`,
        iptal: `ℹ️ ${r.isim}, SıraGO siparişiniz (${r.urun}) iptal edildi. Sorunuz varsa panelinizdeki Destek'ten yazabilirsiniz.`,
      }[s.durum];
      await require('../services/merkezOtpBot').mesajGonder(tel, metin);
      return true;
    } catch (e) { return false; }
  }

  // Aylık özet: sipariş, ciro, tahsil edilen, bekleyen; ürün ve işletme bazında (demo dükkân hariç)
  async ozet(req, res) {
    try {
      const donem = /^\d{4}-\d{2}$/.test(req.query.donem || '') ? req.query.donem : new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Istanbul' }).slice(0, 7);
      const ay = `to_char(s.olusturma AT TIME ZONE 'Europe/Istanbul', 'YYYY-MM') = $1`;
      const toplam = (await pool.query(`
        SELECT COUNT(*) FILTER (WHERE s.durum <> 'iptal')::int AS siparis,
          COALESCE(SUM(s.adet) FILTER (WHERE s.durum <> 'iptal'), 0)::int AS adet,
          COALESCE(SUM(s.tutar) FILTER (WHERE s.durum <> 'iptal'), 0)::float AS ciro,
          COALESCE(SUM(s.tutar) FILTER (WHERE s.odeme_durumu = 'odendi' AND s.durum <> 'iptal'), 0)::float AS tahsil,
          COUNT(*) FILTER (WHERE s.durum = 'iptal')::int AS iptal
        FROM magaza_siparisler s JOIN isletmeler i ON i.id = s.isletme_id WHERE ${GERCEK} AND ${ay}`, [donem])).rows[0];
      const acik = (await pool.query(`
        SELECT COUNT(*) FILTER (WHERE s.durum IN ('yeni', 'hazirlaniyor'))::int AS bekleyen,
          COUNT(*) FILTER (WHERE s.durum = 'kargoda')::int AS kargoda,
          COUNT(*) FILTER (WHERE s.durum <> 'iptal' AND s.odeme_durumu = 'bekliyor')::int AS odenmemis
        FROM magaza_siparisler s JOIN isletmeler i ON i.id = s.isletme_id WHERE ${GERCEK}`)).rows[0];
      const urunler = (await pool.query(`
        SELECT u.id, u.isim, COALESCE(SUM(s.adet), 0)::int AS adet, COALESCE(SUM(s.tutar), 0)::float AS ciro
        FROM magaza_siparisler s JOIN magaza_urunler u ON u.id = s.urun_id JOIN isletmeler i ON i.id = s.isletme_id
        WHERE ${GERCEK} AND s.durum <> 'iptal' AND ${ay} GROUP BY u.id, u.isim ORDER BY ciro DESC, adet DESC`, [donem])).rows;
      const isletmeler = (await pool.query(`
        SELECT i.id, i.isim, COUNT(*)::int AS siparis, COALESCE(SUM(s.tutar), 0)::float AS ciro
        FROM magaza_siparisler s JOIN isletmeler i ON i.id = s.isletme_id
        WHERE ${GERCEK} AND s.durum <> 'iptal' AND ${ay} GROUP BY i.id, i.isim ORDER BY ciro DESC LIMIT 50`, [donem])).rows;
      res.json({ donem, toplam: { ...toplam, ...acik }, urunler, isletmeler });
    } catch (e) { console.error('vitrin özet:', e.message); hata(res, 'Özet alınamadı', 500); }
  }

  // İlan sil: siparişi olan ilan silinmez, yayından kalkar (sipariş geçmişi bozulmasın)
  async ilanSil(req, res) {
    try {
      const id = parseInt(req.params.id);
      const var_ = (await pool.query('SELECT 1 FROM magaza_siparisler WHERE urun_id = $1 LIMIT 1', [id])).rows.length;
      if (var_) {
        await pool.query("UPDATE magaza_urunler SET aktif = false, guncelleme = NOW() WHERE id = $1 AND hedef = 'esnaf'", [id]);
        return res.json({ ok: true, pasif: true });
      }
      const r = await pool.query("DELETE FROM magaza_urunler WHERE id = $1 AND hedef = 'esnaf' RETURNING id", [id]);
      if (!r.rows.length) return hata(res, 'İlan bulunamadı', 404);
      res.json({ ok: true });
    } catch (e) { hata(res, 'İlan silinemedi', 500); }
  }
}

module.exports = new VitrinController();
