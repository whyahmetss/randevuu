// Mağaza pilotu — berber önerisiyle ürün satışı (tedarikçinin mağazasına indirim kodlu link)
// SıraGO para tahsil etmez, stok tutmaz: yalnızca öneri linki, tıklanma ve komisyon raporu.
const crypto = require('crypto');
const pool = require('../config/db');
const { getIsletmeId } = require('../middleware/auth');

// Müşteriye giden kısa link tabanı (randevu.sırago.com API'ye bakıyor)
const LINK_TABAN = (process.env.MAGAZA_LINK_TABAN || 'https://randevu.xn--srago-n4a.com').replace(/\/$/, '');

const hata = (res, e, kod = 500) => res.status(kod).json({ hata: typeof e === 'string' ? e : 'Sunucu hatası', detay: e?.message });
const sayiMi = (x) => x !== undefined && x !== null && x !== '' && Number.isFinite(Number(x));
const httpUrlMu = (u) => { try { return ['http:', 'https:'].includes(new URL(u).protocol); } catch { return false; } };
const buAy = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Istanbul' }).slice(0, 7);

// Tedarikçinin ürün URL'sine indirim kodu ve kaynak parametresi ekle
function hedefUrl(urunUrl, indirimKodu) {
  const u = new URL(urunUrl);
  if (indirimKodu) u.searchParams.set('ref', indirimKodu);
  u.searchParams.set('utm_source', 'sirago');
  u.searchParams.set('utm_medium', 'berber_onerisi');
  return u.toString();
}

// Basit CSV ayrıştırıcı (tırnaklı alan + virgül/noktalı virgül ayırıcı)
function csvOku(metin) {
  const satirlar = String(metin || '').replace(/^﻿/, '').split(/\r?\n/).filter(s => s.trim());
  if (satirlar.length < 2) return [];
  const ayirici = (satirlar[0].match(/;/g) || []).length > (satirlar[0].match(/,/g) || []).length ? ';' : ',';
  const bol = (s) => {
    const out = []; let cur = ''; let q = false;
    for (let i = 0; i < s.length; i++) {
      const c = s[i];
      if (c === '"') { if (q && s[i + 1] === '"') { cur += '"'; i++; } else q = !q; }
      else if (c === ayirici && !q) { out.push(cur.trim()); cur = ''; }
      else cur += c;
    }
    out.push(cur.trim());
    return out;
  };
  // "Sipariş No" → "siparis_no", "İndirim Kodu" → "indirim_kodu"
  const TR = { ç: 'c', ğ: 'g', ı: 'i', ö: 'o', ş: 's', ü: 'u' };
  const basliklar = bol(satirlar[0]).map(b => b.toLocaleLowerCase('tr').replace(/[çğıöşü]/g, h => TR[h]).replace(/\s+/g, '_'));
  return satirlar.slice(1).map(s => Object.fromEntries(bol(s).map((v, i) => [basliklar[i], v])));
}

// "1.234,50" | "1234.50" | "1234" → sayı
function tutarOku(x) {
  let t = String(x || '').replace(/[^\d.,-]/g, '');
  if (t.includes(',') && t.lastIndexOf(',') > t.lastIndexOf('.')) t = t.replace(/\./g, '').replace(',', '.');
  else t = t.replace(/,/g, '');
  const n = parseFloat(t);
  return Number.isFinite(n) ? n : null;
}

class MagazaController {
  // ════════ SÜPER ADMİN ════════
  async tedarikcileriGetir(req, res) {
    try {
      const r = await pool.query(`
        SELECT t.*, (SELECT COUNT(*)::int FROM magaza_urunler u WHERE u.tedarikci_id = t.id) AS urun_sayisi
        FROM magaza_tedarikciler t ORDER BY t.id`);
      res.json({ tedarikciler: r.rows });
    } catch (e) { hata(res, e); }
  }

  async tedarikciKaydet(req, res) {
    try {
      const { isim, site_url, iletisim, berber_komisyon_yuzde, sirago_komisyon_yuzde, aktif } = req.body;
      if (!isim || !String(isim).trim()) return hata(res, 'Tedarikçi adı gerekli', 400);
      if (site_url && !httpUrlMu(site_url)) return hata(res, 'Site adresi http(s) ile başlamalı', 400);
      const by = sayiMi(berber_komisyon_yuzde) ? Number(berber_komisyon_yuzde) : 20;
      const sy = sayiMi(sirago_komisyon_yuzde) ? Number(sirago_komisyon_yuzde) : 10;
      if (by < 0 || sy < 0 || by + sy > 90) return hata(res, 'Komisyon oranları geçersiz', 400);
      const id = req.params.id ? parseInt(req.params.id) : null;
      const r = id
        ? await pool.query(
          `UPDATE magaza_tedarikciler SET isim=$1, site_url=$2, iletisim=$3, berber_komisyon_yuzde=$4, sirago_komisyon_yuzde=$5, aktif=$6
           WHERE id=$7 RETURNING *`, [isim.trim(), site_url || null, iletisim || null, by, sy, aktif !== false, id])
        : await pool.query(
          `INSERT INTO magaza_tedarikciler (isim, site_url, iletisim, berber_komisyon_yuzde, sirago_komisyon_yuzde, aktif)
           VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`, [isim.trim(), site_url || null, iletisim || null, by, sy, aktif !== false]);
      if (!r.rows[0]) return hata(res, 'Tedarikçi bulunamadı', 404);
      res.json({ tedarikci: r.rows[0] });
    } catch (e) { hata(res, e); }
  }

  async urunleriGetirAdmin(req, res) {
    try {
      const r = await pool.query(`
        SELECT u.*, t.isim AS tedarikci_isim FROM magaza_urunler u
        JOIN magaza_tedarikciler t ON t.id = u.tedarikci_id ORDER BY u.id DESC`);
      res.json({ urunler: r.rows });
    } catch (e) { hata(res, e); }
  }

  async urunKaydet(req, res) {
    try {
      const { tedarikci_id, isim, aciklama, gorsel_url, fiyat, urun_url, kategori, aktif } = req.body;
      if (!isim || !String(isim).trim()) return hata(res, 'Ürün adı gerekli', 400);
      if (!urun_url || !httpUrlMu(urun_url)) return hata(res, 'Ürün adresi http(s) ile başlamalı', 400);
      if (gorsel_url && !httpUrlMu(gorsel_url)) return hata(res, 'Görsel adresi http(s) ile başlamalı', 400);
      if (fiyat !== undefined && fiyat !== '' && !sayiMi(fiyat)) return hata(res, 'Fiyat sayı olmalı', 400);
      const id = req.params.id ? parseInt(req.params.id) : null;
      const deger = [parseInt(tedarikci_id), isim.trim(), aciklama || null, gorsel_url || null,
        sayiMi(fiyat) ? Number(fiyat) : null, urun_url, kategori || null, aktif !== false];
      const r = id
        ? await pool.query(
          `UPDATE magaza_urunler SET tedarikci_id=$1, isim=$2, aciklama=$3, gorsel_url=$4, fiyat=$5, urun_url=$6, kategori=$7, aktif=$8
           WHERE id=$9 RETURNING *`, [...deger, id])
        : await pool.query(
          `INSERT INTO magaza_urunler (tedarikci_id, isim, aciklama, gorsel_url, fiyat, urun_url, kategori, aktif)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`, deger);
      if (!r.rows[0]) return hata(res, 'Ürün bulunamadı', 404);
      res.json({ urun: r.rows[0] });
    } catch (e) {
      if (e.code === '23503') return hata(res, 'Tedarikçi bulunamadı', 400);
      hata(res, e);
    }
  }

  async kodlariGetir(req, res) {
    try {
      const r = await pool.query(`
        SELECT k.*, i.isim AS isletme_isim, t.isim AS tedarikci_isim FROM magaza_isletme_kodlari k
        JOIN isletmeler i ON i.id = k.isletme_id JOIN magaza_tedarikciler t ON t.id = k.tedarikci_id
        ORDER BY i.isim`);
      res.json({ kodlar: r.rows });
    } catch (e) { hata(res, e); }
  }

  async kodKaydet(req, res) {
    try {
      const { isletme_id, tedarikci_id, indirim_kodu } = req.body;
      const kod = String(indirim_kodu || '').trim().toUpperCase();
      if (!/^[A-Z0-9_-]{3,30}$/.test(kod)) return hata(res, 'İndirim kodu 3-30 karakter, harf/rakam olmalı', 400);
      const r = await pool.query(
        `INSERT INTO magaza_isletme_kodlari (isletme_id, tedarikci_id, indirim_kodu) VALUES ($1,$2,$3)
         ON CONFLICT (isletme_id, tedarikci_id) DO UPDATE SET indirim_kodu = EXCLUDED.indirim_kodu RETURNING *`,
        [parseInt(isletme_id), parseInt(tedarikci_id), kod]);
      res.json({ kod: r.rows[0] });
    } catch (e) {
      if (e.code === '23503') return hata(res, 'İşletme veya tedarikçi bulunamadı', 400);
      hata(res, e);
    }
  }

  // Tedarikçinin aylık satış raporu (CSV). Sütunlar: siparis_no, indirim_kodu, tutar, [durum]
  async satisYukle(req, res) {
    try {
      const tedarikciId = parseInt(req.body.tedarikci_id);
      const t = (await pool.query('SELECT * FROM magaza_tedarikciler WHERE id=$1', [tedarikciId])).rows[0];
      if (!t) return hata(res, 'Tedarikçi bulunamadı', 400);
      const satirlar = csvOku(req.body.csv);
      if (!satirlar.length) return hata(res, 'CSV boş ya da başlık satırı yok (siparis_no, indirim_kodu, tutar, durum)', 400);
      if (satirlar.length > 5000) return hata(res, 'Tek seferde en fazla 5000 satır', 400);
      const kodlar = new Map((await pool.query(
        'SELECT indirim_kodu, isletme_id FROM magaza_isletme_kodlari WHERE tedarikci_id=$1', [tedarikciId]
      )).rows.map(k => [k.indirim_kodu.toUpperCase(), k.isletme_id]));
      const donem = (req.body.donem && /^\d{4}-\d{2}$/.test(req.body.donem)) ? req.body.donem : buAy();
      const sonuc = { eklenen: 0, guncellenen: 0, eslesmeyen: 0, hatali: 0, hatalar: [] };
      for (const [i, s] of satirlar.entries()) {
        const siparis = s.siparis_no || s.siparis || s.order_id || s.order_no;
        const kod = String(s.indirim_kodu || s.kupon || s.coupon || s.discount_code || '').trim().toUpperCase();
        const tutar = tutarOku(s.tutar || s.total || s.amount);
        const durum = /iade|refund|iptal|cancel/i.test(s.durum || s.status || '') ? 'iade' : 'onaylandi';
        if (!siparis || tutar === null || tutar < 0) {
          sonuc.hatali++; if (sonuc.hatalar.length < 10) sonuc.hatalar.push(`Satır ${i + 2}: sipariş no veya tutar okunamadı`);
          continue;
        }
        const isletmeId = kodlar.get(kod) || null;
        if (!isletmeId) sonuc.eslesmeyen++;
        // İade edilen siparişte komisyon sıfırlanır
        const bk = durum === 'iade' || !isletmeId ? 0 : +(tutar * Number(t.berber_komisyon_yuzde) / 100).toFixed(2);
        const sk = durum === 'iade' ? 0 : +(tutar * Number(t.sirago_komisyon_yuzde) / 100).toFixed(2);
        const r = await pool.query(
          `INSERT INTO magaza_satislar (tedarikci_id, isletme_id, siparis_no, indirim_kodu, tutar, durum, berber_komisyon, sirago_komisyon, donem)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
           ON CONFLICT (tedarikci_id, siparis_no) DO UPDATE SET
             isletme_id = EXCLUDED.isletme_id, indirim_kodu = EXCLUDED.indirim_kodu, tutar = EXCLUDED.tutar, durum = EXCLUDED.durum,
             berber_komisyon = EXCLUDED.berber_komisyon, sirago_komisyon = EXCLUDED.sirago_komisyon
           RETURNING (xmax = 0) AS yeni`,
          [tedarikciId, isletmeId, String(siparis).slice(0, 100), kod || null, tutar, durum, bk, sk, donem]);
        if (r.rows[0]?.yeni) sonuc.eklenen++; else sonuc.guncellenen++;
      }
      res.json(sonuc);
    } catch (e) { hata(res, e); }
  }

  async ozetAdmin(req, res) {
    try {
      const donem = /^\d{4}-\d{2}$/.test(req.query.donem || '') ? req.query.donem : buAy();
      const isletmeler = (await pool.query(`
        SELECT i.id, i.isim,
          (SELECT COUNT(*)::int FROM magaza_oneriler o WHERE o.isletme_id = i.id AND to_char(o.olusturma, 'YYYY-MM') = $1) AS oneri,
          (SELECT COALESCE(SUM(o.tiklanma),0)::int FROM magaza_oneriler o WHERE o.isletme_id = i.id AND to_char(o.olusturma, 'YYYY-MM') = $1) AS tiklanma,
          (SELECT COUNT(*)::int FROM magaza_satislar s WHERE s.isletme_id = i.id AND s.donem = $1 AND s.durum = 'onaylandi') AS satis,
          (SELECT COALESCE(SUM(s.tutar),0) FROM magaza_satislar s WHERE s.isletme_id = i.id AND s.donem = $1 AND s.durum = 'onaylandi') AS ciro,
          (SELECT COALESCE(SUM(s.berber_komisyon),0) FROM magaza_satislar s WHERE s.isletme_id = i.id AND s.donem = $1) AS berber_komisyon
        FROM isletmeler i
        WHERE EXISTS (SELECT 1 FROM magaza_oneriler o WHERE o.isletme_id = i.id)
           OR EXISTS (SELECT 1 FROM magaza_satislar s WHERE s.isletme_id = i.id)
        ORDER BY ciro DESC`, [donem])).rows;
      const toplam = (await pool.query(`
        SELECT COALESCE(SUM(tutar) FILTER (WHERE durum='onaylandi'),0) AS ciro,
               COALESCE(SUM(berber_komisyon),0) AS berber_komisyon, COALESCE(SUM(sirago_komisyon),0) AS sirago_komisyon,
               COUNT(*) FILTER (WHERE isletme_id IS NULL)::int AS eslesmeyen
        FROM magaza_satislar WHERE donem = $1`, [donem])).rows[0];
      res.json({ donem, isletmeler, toplam });
    } catch (e) { hata(res, e); }
  }

  // ════════ İŞLETME ════════
  async urunleriGetir(req, res) {
    try {
      const isletmeId = getIsletmeId(req);
      const r = await pool.query(`
        SELECT u.id, u.isim, u.aciklama, u.gorsel_url, u.fiyat, u.kategori, t.isim AS tedarikci_isim,
               t.berber_komisyon_yuzde, k.indirim_kodu
        FROM magaza_urunler u
        JOIN magaza_tedarikciler t ON t.id = u.tedarikci_id AND t.aktif = true
        LEFT JOIN magaza_isletme_kodlari k ON k.tedarikci_id = t.id AND k.isletme_id = $1
        WHERE u.aktif = true ORDER BY u.kategori NULLS LAST, u.isim`, [isletmeId]);
      res.json({ urunler: r.rows });
    } catch (e) { hata(res, e); }
  }

  async oner(req, res) {
    try {
      const isletmeId = getIsletmeId(req);
      const urunId = parseInt(req.body.urun_id);
      const u = (await pool.query(`
        SELECT u.*, t.isim AS tedarikci_isim, k.indirim_kodu, i.isim AS isletme_isim
        FROM magaza_urunler u
        JOIN magaza_tedarikciler t ON t.id = u.tedarikci_id AND t.aktif = true
        JOIN isletmeler i ON i.id = $2
        LEFT JOIN magaza_isletme_kodlari k ON k.tedarikci_id = t.id AND k.isletme_id = $2
        WHERE u.id = $1 AND u.aktif = true`, [urunId, isletmeId])).rows[0];
      if (!u) return hata(res, 'Ürün bulunamadı', 404);
      if (!u.indirim_kodu) return hata(res, 'Bu tedarikçi için işletmenize henüz indirim kodu tanımlanmadı. SıraGO destek ile iletişime geçin.', 400);
      // Randevu verildiyse bu işletmeye ait olmalı
      let randevuId = req.body.randevu_id ? parseInt(req.body.randevu_id) : null;
      if (randevuId) {
        const rv = (await pool.query('SELECT id FROM randevular WHERE id=$1 AND isletme_id=$2', [randevuId, isletmeId])).rows[0];
        if (!rv) randevuId = null;
      }
      let kisa;
      for (let deneme = 0; deneme < 5; deneme++) {
        kisa = crypto.randomBytes(5).toString('base64url').slice(0, 7);
        try {
          await pool.query('INSERT INTO magaza_oneriler (kisa_kod, isletme_id, urun_id, randevu_id) VALUES ($1,$2,$3,$4)',
            [kisa, isletmeId, urunId, randevuId]);
          break;
        } catch (e) { if (e.code !== '23505' || deneme === 4) throw e; }
      }
      const link = `${LINK_TABAN}/m/${kisa}`;
      const mesaj = `Merhaba, bugün size önerdiğim ürün: ${u.isim}. ${u.indirim_kodu} koduyla indirimli alabilirsiniz: ${link}\n— ${u.isletme_isim}`;
      res.json({ link, mesaj, indirim_kodu: u.indirim_kodu });
    } catch (e) { hata(res, e); }
  }

  async kazanc(req, res) {
    try {
      const isletmeId = getIsletmeId(req);
      const donem = buAy();
      const q = async (sql, p) => (await pool.query(sql, p)).rows[0];
      const buay = await q(`
        SELECT
          (SELECT COUNT(*)::int FROM magaza_oneriler WHERE isletme_id=$1 AND to_char(olusturma,'YYYY-MM')=$2) AS oneri,
          (SELECT COALESCE(SUM(tiklanma),0)::int FROM magaza_oneriler WHERE isletme_id=$1 AND to_char(olusturma,'YYYY-MM')=$2) AS tiklanma,
          (SELECT COUNT(*)::int FROM magaza_satislar WHERE isletme_id=$1 AND donem=$2 AND durum='onaylandi') AS satis,
          (SELECT COALESCE(SUM(berber_komisyon),0) FROM magaza_satislar WHERE isletme_id=$1 AND donem=$2) AS komisyon`,
        [isletmeId, donem]);
      const toplam = await q(`
        SELECT COUNT(*) FILTER (WHERE durum='onaylandi')::int AS satis, COALESCE(SUM(berber_komisyon),0) AS komisyon
        FROM magaza_satislar WHERE isletme_id=$1`, [isletmeId]);
      const son = (await pool.query(`
        SELECT o.kisa_kod, o.tiklanma, o.olusturma, u.isim AS urun_isim FROM magaza_oneriler o
        JOIN magaza_urunler u ON u.id = o.urun_id WHERE o.isletme_id=$1 ORDER BY o.olusturma DESC LIMIT 20`, [isletmeId])).rows;
      res.json({ donem, buay, toplam, son_oneriler: son });
    } catch (e) { hata(res, e); }
  }

  // ════════ HERKESE AÇIK: /m/:kod ════════
  // Tıklanmayı sayar ve tedarikçinin ürün sayfasına yönlendirir. Kişisel veri tutmaz.
  async yonlendir(req, res) {
    try {
      const kod = String(req.params.kod || '');
      if (!/^[A-Za-z0-9_-]{4,12}$/.test(kod)) return res.status(404).send('Bulunamadı');
      // WhatsApp/Telegram link önizleme botları tıklama sayılmaz
      const onizleme = /whatsapp|facebookexternalhit|telegrambot|twitterbot|slackbot|discordbot|bot\b|crawler|spider/i.test(req.get('user-agent') || '');
      const r = (await pool.query(`
        UPDATE magaza_oneriler o SET tiklanma = tiklanma + $2, son_tiklanma = CASE WHEN $2 > 0 THEN NOW() ELSE son_tiklanma END
        FROM magaza_urunler u
        WHERE o.kisa_kod = $1 AND u.id = o.urun_id
        RETURNING u.urun_url, (SELECT k.indirim_kodu FROM magaza_isletme_kodlari k
          WHERE k.tedarikci_id = u.tedarikci_id AND k.isletme_id = o.isletme_id) AS indirim_kodu`, [kod, onizleme ? 0 : 1])).rows[0];
      if (!r) return res.status(404).send('Bu link artık geçerli değil.');
      res.redirect(302, hedefUrl(r.urun_url, r.indirim_kodu));
    } catch (e) { res.status(500).send('Bir sorun oluştu.'); }
  }
}

const magazaController = new MagazaController();
module.exports = magazaController;
module.exports._test = { csvOku, tutarOku, hedefUrl };
