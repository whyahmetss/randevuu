// Veri dışa aktarma (2026-10-15, KVKK md. 11): işletmenin tüm verisi tek JSON dosyası.
// isletme_id kolonu olan her tablo otomatik dahil olur (yeni tablo eklenince bu dosyaya dokunmak gerekmez).
// Gizli bilgiler (WhatsApp oturum anahtarları, şifreler, tokenlar) ve büyük görsel verisi dahil edilmez.
const pool = require('../config/db');

const HARIC_TABLO = new Set(['wa_auth_keys', 'push_abonelikleri', 'push_subscriptions', 'sistem_uyarilari', 'audit_log',
  'guvenlik_olay_log', 'kupon_kullanimlari', 'isletme_gorselleri', 'sayfa_galeri', 'calisan_gorselleri']);
const GIZLI_KOLON = /sifre|parola|password|token|secret|auth|api_key|apikey|imza|creds/i;
const BUYUK_VERI = /^data:/;

const temizle = (satir) => Object.fromEntries(Object.entries(satir)
  .filter(([k]) => !GIZLI_KOLON.test(k))
  .map(([k, v]) => [k, typeof v === 'string' && BUYUK_VERI.test(v) ? '(görsel — dışa aktarıma dahil değil)' : v]));

async function isletmeVerisi(isletmeId) {
  const id = Number(isletmeId);
  const isletme = (await pool.query('SELECT * FROM isletmeler WHERE id = $1', [id])).rows[0];
  if (!isletme) return null;
  const tablolar = (await pool.query(
    `SELECT table_name FROM information_schema.columns
      WHERE table_schema = current_schema() AND column_name = 'isletme_id' ORDER BY table_name`)).rows
    .map(r => r.table_name).filter(t => !HARIC_TABLO.has(t) && /^[a-z0-9_]+$/.test(t));

  const veri = {};
  for (const t of tablolar) {
    try { veri[t] = (await pool.query(`SELECT * FROM ${t} WHERE isletme_id = $1`, [id])).rows.map(temizle); }
    catch (e) { /* okunamayan tablo atlanır */ }
  }
  // Müşteriler global tabloda: bu işletmede randevusu olan ya da en son buraya gelenler
  try {
    veri.musteriler = (await pool.query(
      `SELECT * FROM musteriler m WHERE m.son_gelinen_isletme_id = $1
          OR EXISTS (SELECT 1 FROM randevular r WHERE r.musteri_id = m.id AND r.isletme_id = $1) ORDER BY m.id`, [id])).rows.map(temizle);
  } catch (e) { /* musteriler yoksa */ }
  try {
    veri.kullanicilar = (await pool.query('SELECT * FROM admin_kullanicilar WHERE isletme_id = $1', [id])).rows.map(temizle);
  } catch (e) { /* yoksa */ }

  return {
    aciklama: 'SıraGO veri dışa aktarımı (KVKK md. 11). Şifreler, oturum anahtarları ve görseller dahil değildir.',
    olusturma: new Date().toISOString(),
    isletme: temizle(isletme),
    veri,
  };
}

async function gonder(res, isletmeId) {
  const d = await isletmeVerisi(isletmeId);
  if (!d) return res.status(404).json({ hata: 'İşletme bulunamadı' });
  const ad = `sirago-veri-${isletmeId}-${new Date().toISOString().slice(0, 10)}.json`;
  res.set('Content-Type', 'application/json; charset=utf-8').set('Content-Disposition', `attachment; filename="${ad}"`)
    .send(JSON.stringify(d, null, 2));
}

module.exports = { isletmeVerisi, gonder };
