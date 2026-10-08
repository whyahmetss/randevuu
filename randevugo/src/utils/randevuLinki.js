// İşletmenin müşteriye verilen online randevu linki. slug yoksa oluşturur (QR sayfasındakiyle aynı kural).
// Görünen alan adı sırago.com (WhatsApp'ta https ile tıklanır); ASCII sirago.com başkasının park alanı.
const pool = require('../config/db');

const TABAN = (process.env.RANDEVU_LINK_TABAN || 'https://randevu.sırago.com').replace(/\/$/, '');

function slugUret(isim, id) {
  const s = String(isim || 'isletme')
    .toLocaleLowerCase('tr')
    .replace(/ğ/g, 'g').replace(/ü/g, 'u').replace(/ş/g, 's')
    .replace(/ı/g, 'i').replace(/ö/g, 'o').replace(/ç/g, 'c')
    .replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
  return `${s || 'isletme'}-${id}`;
}

async function randevuLinki(isletme) {
  if (!isletme?.id) return null;
  let slug = isletme.slug;
  if (!slug) {
    slug = slugUret(isletme.isim, isletme.id);
    try {
      await pool.query('UPDATE isletmeler SET slug = $1 WHERE id = $2 AND slug IS NULL', [slug, isletme.id]);
      isletme.slug = slug;
    } catch (e) { return null; }
  }
  return `${TABAN}/book/${slug}`;
}

module.exports = { randevuLinki, slugUret };
