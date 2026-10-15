// Kuponlar (2026-10-15): kampanya için kod değişikliği gerekmesin ("İlk ay %50", "BAYRAM100").
// Kupon ödeme başlatılırken doğrulanır ve Shopier ürün fiyatına uygulanır; kullanım ödeme gelince sayılır.
// Kural: her işletme bir kuponu bir kez kullanır. Havale ödemesinde kupon yok (yalnız kartla ödeme).
const pool = require('../config/db');

const kodNormalize = (k) => String(k || '').trim().toUpperCase().replace(/\s+/g, '');
const yuvarla = (x) => Math.round(Number(x) * 100) / 100;
const bugun = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Istanbul' });
const hata = (m) => Object.assign(new Error(m), { kullanici: true });

function uygula(kupon, tutar) {
  if (kupon.indirim_yuzde) return yuvarla(tutar * (100 - Number(kupon.indirim_yuzde)) / 100);
  if (kupon.indirim_tl) return yuvarla(tutar - Number(kupon.indirim_tl));
  return yuvarla(tutar);
}

// Geçerliyse { kupon, indirimli } döner, değilse kullanıcıya gösterilebilir mesajla hata atar
async function dogrula({ kod, isletmeId, paket, tutar }) {
  const k = kodNormalize(kod);
  if (!k) throw hata('Kupon kodu boş');
  // son_tarih metin olarak okunur: DATE → JS Date dönüşümü saat dilimiyle bir gün kaydırabiliyor
  const kupon = (await pool.query(`SELECT *, to_char(son_tarih, 'YYYY-MM-DD') AS son_gun FROM kuponlar WHERE kod = $1`, [k])).rows[0];
  if (!kupon || !kupon.aktif) throw hata('Bu kupon geçerli değil');
  if (kupon.son_gun && kupon.son_gun < bugun()) {
    throw hata('Bu kuponun süresi dolmuş');
  }
  if (kupon.max_kullanim != null && kupon.kullanim >= kupon.max_kullanim) throw hata('Bu kuponun kullanım hakkı dolmuş');
  if (Array.isArray(kupon.paketler) && kupon.paketler.length && !kupon.paketler.includes(paket)) {
    throw hata('Bu kupon seçtiğin pakette geçerli değil');
  }
  const kullandi = (await pool.query('SELECT 1 FROM kupon_kullanimlari WHERE kupon_id = $1 AND isletme_id = $2', [kupon.id, isletmeId])).rows[0];
  if (kullandi) throw hata('Bu kuponu daha önce kullandın');
  const indirimli = uygula(kupon, tutar);
  if (!(indirimli >= 1)) throw hata('Bu kupon bu tutarda kullanılamaz');
  return { kupon, indirimli };
}

// Ödeme gerçekleşince: kullanım kaydı (bir kez) ve sayaç
async function kullanildi({ kuponId, isletmeId, once, sonra }) {
  const r = await pool.query(
    `INSERT INTO kupon_kullanimlari (kupon_id, isletme_id, tutar_once, tutar_sonra) VALUES ($1, $2, $3, $4)
     ON CONFLICT (kupon_id, isletme_id) DO NOTHING RETURNING id`, [kuponId, isletmeId, once, sonra]);
  if (r.rows[0]) await pool.query('UPDATE kuponlar SET kullanim = kullanim + 1 WHERE id = $1', [kuponId]);
  return !!r.rows[0];
}

// Panel kaydı için doğrulama + normalleştirme
function kuponVerisi(b) {
  const kod = kodNormalize(b.kod);
  if (!/^[A-Z0-9_-]{3,40}$/.test(kod)) throw hata('Kod 3–40 karakter olmalı (harf, rakam, - ve _)');
  const yuzde = b.indirim_yuzde === '' || b.indirim_yuzde == null ? null : Number(b.indirim_yuzde);
  const tl = b.indirim_tl === '' || b.indirim_tl == null ? null : Number(b.indirim_tl);
  if ((yuzde == null) === (tl == null)) throw hata('Ya yüzde ya da TL indirim gir (ikisinden biri)');
  if (yuzde != null && !(Number.isInteger(yuzde) && yuzde >= 1 && yuzde <= 90)) throw hata('Yüzde indirim 1–90 arası olmalı');
  if (tl != null && !(tl > 0)) throw hata('TL indirim 0\'dan büyük olmalı');
  const max = b.max_kullanim === '' || b.max_kullanim == null ? null : Number(b.max_kullanim);
  if (max != null && !(Number.isInteger(max) && max >= 1)) throw hata('Kullanım limiti 1 ya da daha büyük tam sayı olmalı');
  const sonTarih = b.son_tarih ? String(b.son_tarih).slice(0, 10) : null;
  if (sonTarih && !/^\d{4}-\d{2}-\d{2}$/.test(sonTarih)) throw hata('Son tarih geçersiz');
  const paketler = Array.isArray(b.paketler) && b.paketler.length ? b.paketler.map(String) : null;
  return { kod, aciklama: String(b.aciklama || '').trim().slice(0, 200) || null, indirim_yuzde: yuzde, indirim_tl: tl,
    paketler, son_tarih: sonTarih, max_kullanim: max, aktif: b.aktif !== false };
}

module.exports = { dogrula, kullanildi, uygula, kuponVerisi, kodNormalize };
