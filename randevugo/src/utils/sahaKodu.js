// Satışçı kodu (QR kart, kullanıcı kararı 2026-10-15): kartı okutan esnafın Satış Bot'a giden ilk mesajında
// "kart: S12" yazar (12 = ekip üyesi). Bot bağlı değilse web kaydına ?saha=S12 ile gider. Kayıt olursa işletme o üyeye
// yazılır (getiren_id) ve Satış Masası'nda otomatik "Bağladım" sayılır.
const pool = require('../config/db');

const MESAJ_KODU = /\bkart[:\s]+S(\d{1,6})\b/i;
const kodYakala = (metin) => { const m = String(metin || '').match(MESAJ_KODU); return m ? parseInt(m[1]) : null; };
const linkKodu = (kod) => { const m = String(kod || '').trim().match(/^S(\d{1,6})$/i); return m ? parseInt(m[1]) : null; };

async function uyeBul(id) {
  if (!id) return null;
  return (await pool.query("SELECT id, isim FROM admin_kullanicilar WHERE id = $1 AND rol = 'superadmin' AND aktif = true", [id])).rows[0] || null;
}

// Kayıt tamamlanınca: işletme başka üyeye yazılmadıysa bu üyeye yazılır + otomatik "kurulum" (işletme başına bir kez)
async function kayittaUygula(uyeId, isletmeId, { kanal = 'qr_kart', notu = 'QR karttan kayıt oldu' } = {}) {
  const u = await uyeBul(uyeId);
  if (!u) return null;
  const r = await pool.query('UPDATE isletmeler SET getiren_id = $1 WHERE id = $2 AND getiren_id IS NULL RETURNING id', [u.id, isletmeId]);
  if (!r.rows.length) return null;
  await pool.query("UPDATE isletmeler SET kayit_kanali = $1 WHERE id = $2 AND (kayit_kanali IS NULL OR kayit_kanali = 'web')", [kanal, isletmeId]).catch(() => {});
  await pool.query(
    `INSERT INTO satis_aktivite (kullanici_id, isletme_id, tip, notu, otomatik)
     SELECT $1, $2, 'kurulum', $3, true WHERE NOT EXISTS (SELECT 1 FROM satis_aktivite WHERE isletme_id = $2 AND tip = 'kurulum')`,
    [u.id, isletmeId, notu]).catch((e) => console.error('QR kart aktivitesi yazılamadı:', e.message));
  return u;
}

module.exports = { kodYakala, linkKodu, uyeBul, kayittaUygula };
