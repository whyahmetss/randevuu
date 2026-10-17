// Bayi / toptancı ağı (kullanıcı kararı 2026-10-17). Kart kodu "B12" (ekip üyesinin "S12"siyle karışmaz):
// Satış Bot'a giden ilk mesajda "kart: B12", bot bağlı değilse web kaydında ?saha=B12. Kayıt olursa işletme bayiye yazılır.
// Hakediş: bayinin getirdiği işletmelerin ödenmiş her ödemesinden komisyon_yuzde + işletme başına ilk ödemede ilk_odeme_tl.
const crypto = require('crypto');
const pool = require('../config/db');

const MESAJ_KODU = /\bkart[:\s]+B(\d{1,6})\b/i;
const kodYakala = (metin) => { const m = String(metin || '').match(MESAJ_KODU); return m ? parseInt(m[1]) : null; };
const linkKodu = (kod) => { const m = String(kod || '').trim().match(/^B(\d{1,6})$/i); return m ? parseInt(m[1]) : null; };
const yeniToken = () => crypto.randomBytes(16).toString('hex');
const PANEL = () => (process.env.ADMIN_PANEL_URL || 'https://admin.xn--srago-n4a.com').replace(/\/$/, '');
const panelLinki = (token) => `${PANEL()}/bayi/${token}`;

// İstanbul ayının başı (UTC'ye çevrilmiş) — "bu ay" hesapları
const AY_BASI = `(date_trunc('month', NOW() AT TIME ZONE 'Europe/Istanbul') AT TIME ZONE 'Europe/Istanbul')`;
const ODEME_ZAMANI = 'COALESCE(o.odeme_tarihi, o.olusturma_tarihi)';

async function bul(id) {
  if (!id) return null;
  return (await pool.query('SELECT * FROM bayiler WHERE id = $1 AND aktif = true', [id])).rows[0] || null;
}

// Kayıt tamamlanınca: işletme başka bayiye yazılmadıysa bu bayiye yazılır
async function kayittaUygula(bayiId, isletmeId) {
  const b = await bul(bayiId);
  if (!b) return null;
  const r = await pool.query('UPDATE isletmeler SET bayi_id = $1 WHERE id = $2 AND bayi_id IS NULL RETURNING id', [b.id, isletmeId]);
  if (!r.rows.length) return null;
  await pool.query("UPDATE isletmeler SET kayit_kanali = 'bayi' WHERE id = $1 AND (kayit_kanali IS NULL OR kayit_kanali = 'web')", [isletmeId]).catch(() => {});
  return b;
}

// Bayi başına özet sayılar (liste ve panel aynı hesabı kullanır)
async function ozetler(bayiId = null) {
  const r = await pool.query(`
    WITH od AS (
      SELECT i.bayi_id, o.isletme_id, o.tutar, ${ODEME_ZAMANI} AS zaman,
             ROW_NUMBER() OVER (PARTITION BY o.isletme_id ORDER BY ${ODEME_ZAMANI}, o.id) AS sira
      FROM odemeler o JOIN isletmeler i ON i.id = o.isletme_id
      WHERE o.durum = 'odendi' AND i.bayi_id IS NOT NULL ${bayiId ? 'AND i.bayi_id = $1' : ''}
    )
    SELECT b.id,
      (SELECT COUNT(*)::int FROM isletmeler i WHERE i.bayi_id = b.id) AS kayit,
      (SELECT COUNT(*)::int FROM isletmeler i WHERE i.bayi_id = b.id AND i.olusturma_tarihi >= ${AY_BASI}) AS bu_ay_kayit,
      COUNT(DISTINCT od.isletme_id)::int AS odeyen,
      COALESCE(SUM(od.tutar), 0)::float AS ciro,
      COALESCE(SUM(od.tutar) FILTER (WHERE od.zaman >= ${AY_BASI}), 0)::float AS bu_ay_ciro,
      COUNT(*) FILTER (WHERE od.sira = 1)::int AS ilk_odeme,
      COUNT(*) FILTER (WHERE od.sira = 1 AND od.zaman >= ${AY_BASI})::int AS bu_ay_ilk_odeme,
      (SELECT COALESCE(SUM(tutar), 0)::float FROM bayi_odemeleri bo WHERE bo.bayi_id = b.id) AS odenen
    FROM bayiler b LEFT JOIN od ON od.bayi_id = b.id
    ${bayiId ? 'WHERE b.id = $1' : ''}
    GROUP BY b.id`, bayiId ? [bayiId] : []);
  return r.rows;
}

function hakedisEkle(b, o = {}) {
  const yuzde = Number(b.komisyon_yuzde) || 0, prim = Number(b.ilk_odeme_tl) || 0;
  const yuvarla = (n) => Math.round(n * 100) / 100;
  const hakedis = yuvarla((o.ciro || 0) * yuzde / 100 + (o.ilk_odeme || 0) * prim);
  const buAy = yuvarla((o.bu_ay_ciro || 0) * yuzde / 100 + (o.bu_ay_ilk_odeme || 0) * prim);
  return {
    kayit: o.kayit || 0, bu_ay_kayit: o.bu_ay_kayit || 0, odeyen: o.odeyen || 0, ciro: o.ciro || 0,
    hakedis, bu_ay_hakedis: buAy, odenen: o.odenen || 0, bakiye: yuvarla(hakedis - (o.odenen || 0)),
  };
}

async function liste() {
  const bayiler = (await pool.query('SELECT * FROM bayiler ORDER BY aktif DESC, id')).rows;
  const oz = Object.fromEntries((await ozetler()).map(o => [o.id, o]));
  return bayiler.map(b => ({ ...b, kod: `B${b.id}`, panel_linki: panelLinki(b.token), ...hakedisEkle(b, oz[b.id]) }));
}

// Bayinin getirdiği işletmeler: durum + bayiye düşen pay (telefon/e-posta yok: bayi panelinde de gösterilir)
async function isletmeleri(b) {
  const r = await pool.query(`
    SELECT i.id, i.isim, i.ilce, i.olusturma_tarihi, i.aktif, i.deneme_bitis_tarihi, i.paket_bitis_tarihi,
      COALESCE((SELECT SUM(o.tutar) FROM odemeler o WHERE o.isletme_id = i.id AND o.durum = 'odendi'), 0)::float AS odenen,
      (SELECT COUNT(*) FROM odemeler o WHERE o.isletme_id = i.id AND o.durum = 'odendi')::int AS odeme_sayisi
    FROM isletmeler i WHERE i.bayi_id = $1 ORDER BY i.olusturma_tarihi DESC LIMIT 500`, [b.id]);
  const simdi = Date.now();
  const yuzde = Number(b.komisyon_yuzde) || 0, prim = Number(b.ilk_odeme_tl) || 0;
  return r.rows.map(i => {
    const paket = i.paket_bitis_tarihi && new Date(i.paket_bitis_tarihi).getTime() > simdi;
    const deneme = i.deneme_bitis_tarihi && new Date(i.deneme_bitis_tarihi).getTime() > simdi;
    const durum = !i.aktif ? 'kapandi' : (paket && i.odeme_sayisi) ? 'oduyor' : deneme ? 'denemede' : i.odeme_sayisi ? 'odemesi_bitti' : 'deneme_bitti';
    return { id: i.id, isim: i.isim, ilce: i.ilce, kayit: i.olusturma_tarihi, durum, odenen: i.odenen,
      kazanc: Math.round((i.odenen * yuzde / 100 + (i.odeme_sayisi ? prim : 0)) * 100) / 100 };
  });
}

async function panelVerisi(token) {
  if (!/^[a-f0-9]{32}$/.test(String(token || ''))) return null;
  const b = (await pool.query('SELECT * FROM bayiler WHERE token = $1 AND aktif = true', [token])).rows[0];
  if (!b) return null;
  const [oz] = await ozetler(b.id);
  const odemeler = (await pool.query('SELECT tutar::float, notu, tarih FROM bayi_odemeleri WHERE bayi_id = $1 ORDER BY tarih DESC LIMIT 50', [b.id])).rows;
  return { b, ozet: hakedisEkle(b, oz), isletmeler: await isletmeleri(b), odemeler };
}

module.exports = { kodYakala, linkKodu, yeniToken, panelLinki, bul, kayittaUygula, ozetler, hakedisEkle, liste, isletmeleri, panelVerisi };
