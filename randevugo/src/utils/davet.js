// Esnaf esnafı getirsin (kullanıcı kararı 2026-10-09): her işletmenin kendi davet kodu/linki olur.
// Davetle gelen işletme ilk ödemesini yapınca davet edenin paketi +30 gün uzar (shopierService).
const pool = require('../config/db');

const PANEL = (process.env.ADMIN_PANEL_URL || 'https://admin.xn--srago-n4a.com').replace(/\/$/, '');
const KANALLAR = ['web', 'davet', 'randevu_sayfasi'];

async function davetKodu(isletmeId) {
  const v = (await pool.query('SELECT referans_kodu FROM referanslar WHERE sahip_isletme_id = $1 ORDER BY id LIMIT 1', [isletmeId])).rows[0];
  if (v) return v.referans_kodu;
  for (let i = 0; i < 5; i++) {
    const kod = 'SG' + Math.random().toString(36).slice(2, 8).toUpperCase();
    const r = await pool.query(
      'INSERT INTO referanslar (referans_kodu, sahip_isletme_id) VALUES ($1, $2) ON CONFLICT (referans_kodu) DO NOTHING RETURNING referans_kodu',
      [kod, isletmeId]);
    if (r.rows.length) {
      await pool.query('UPDATE isletmeler SET referans_kodu = $1 WHERE id = $2 AND referans_kodu IS NULL', [kod, isletmeId]);
      return kod;
    }
  }
  throw new Error('Davet kodu üretilemedi');
}

const davetLinki = (kod, kanal) => `${PANEL}/?davet=${encodeURIComponent(kod)}${kanal ? `&k=${kanal}` : ''}`;

async function davetBilgi(isletmeId) {
  const kod = await davetKodu(isletmeId);
  const s = (await pool.query(`
    SELECT COUNT(*)::int AS gelen,
      COUNT(*) FILTER (WHERE referans_odeme_tetiklendi = true)::int AS odeyen
    FROM isletmeler WHERE referans_ile_gelen = $1`, [isletmeId])).rows[0];
  return { kod, link: davetLinki(kod), gelen: s.gelen, odeyen: s.odeyen, kazanilan_ay: s.odeyen };
}

// Kayıtta davet kodunu uygula. Döner: davet eden işletme id | null
async function davetUygula(kod, yeniIsletmeId) {
  if (!kod) return null;
  const ref = (await pool.query('SELECT * FROM referanslar WHERE referans_kodu = $1', [String(kod).trim().toUpperCase()])).rows[0];
  if (!ref || ref.sahip_isletme_id === yeniIsletmeId) return null;
  const r = await pool.query(
    'UPDATE isletmeler SET referans_ile_gelen = $1 WHERE id = $2 AND referans_ile_gelen IS NULL RETURNING id', [ref.sahip_isletme_id, yeniIsletmeId]);
  if (!r.rows.length) return null;
  await pool.query('UPDATE referanslar SET toplam_davet = toplam_davet + 1 WHERE id = $1', [ref.id]);
  return ref.sahip_isletme_id;
}

// Metnin içinden davet kodu yakala ("kayıt SG7K2M9Q", "kodum sg7k2m9q") — eski REF-XXXXXX kodları da
const kodYakala = (metin) => (String(metin || '').toUpperCase().match(/\b(SG[A-Z0-9]{6}|REF-[A-Z0-9]{6})\b/) || [])[1] || null;

async function kodGecerli(kod) {
  if (!kod) return false;
  return !!(await pool.query('SELECT 1 FROM referanslar WHERE referans_kodu = $1', [String(kod).trim().toUpperCase()])).rows[0];
}

// Kayıt bittikten sonra: kodu bağla, kanalı "davet" yap. Döner: davet eden id | null
async function kayittaUygula(kod, isletmeId) {
  const sahip = await davetUygula(kod, isletmeId);
  if (sahip) { try { await pool.query("UPDATE isletmeler SET kayit_kanali = 'davet' WHERE id = $1", [isletmeId]); } catch (e) { /* kolon yoksa */ } }
  return sahip;
}

module.exports = { davetKodu, davetLinki, davetBilgi, davetUygula, kodYakala, kodGecerli, kayittaUygula, KANALLAR };
