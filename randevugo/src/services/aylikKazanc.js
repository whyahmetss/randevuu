// "Bu ay SıraGO sana ne kazandırdı" (kullanıcı kararı 2026-10-14): panelde kart + ayın 1'inde WhatsApp özeti.
// Sadece ölçülebileni söyler: kendiliğinden gelen randevular (bot/online/telegram…, 'manuel' hariç),
// bunların mesai dışında alınanları, hatırlatma gidip gelen müşteriler ve ₺ karşılığı (hizmet fiyatı).
// Mesaj esnafın KENDİ bağlı WhatsApp'ından kendi telefonuna gider; SıraGO numarası kullanılmaz (ban riski).
const cron = require('node-cron');
const pool = require('../config/db');
const { telefonNormalize } = require('../utils/telefon');

const AYLAR = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
const buAy = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Istanbul' }).slice(0, 7);
const oncekiAy = () => { const [y, m] = buAy().split('-').map(Number); return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`; };
const tl = (n) => `${Math.round(n).toLocaleString('tr-TR')}₺`;

async function hesapla(isletmeId, ay = buAy()) {
  if (!/^\d{4}-\d{2}$/.test(ay)) ay = buAy();
  const bas = `${ay}-01`;
  const r = (await pool.query(`
    WITH i AS (SELECT COALESCE(calisma_baslangic, '09:00')::time AS b, COALESCE(calisma_bitis, '20:00')::time AS s FROM isletmeler WHERE id = $1),
    ay AS (
      SELECT r.*, COALESCE(h.fiyat, 0)::numeric AS fiyat,
        (r.olusturma_tarihi AT TIME ZONE 'UTC' AT TIME ZONE 'Europe/Istanbul') AS olusma
      FROM randevular r LEFT JOIN hizmetler h ON h.id = r.hizmet_id
      WHERE r.isletme_id = $1 AND r.tarih >= $2::date AND r.tarih < ($2::date + INTERVAL '1 month')
    )
    SELECT
      COUNT(*) FILTER (WHERE COALESCE(kaynak, 'bot') <> 'manuel' AND durum <> 'iptal')::int AS otomatik,
      COALESCE(SUM(fiyat) FILTER (WHERE COALESCE(kaynak, 'bot') <> 'manuel' AND durum NOT IN ('iptal', 'gelmedi')), 0)::float AS otomatik_tutar,
      COUNT(*) FILTER (WHERE COALESCE(kaynak, 'bot') <> 'manuel' AND durum <> 'iptal'
        AND (olusma::time < (SELECT b FROM i) OR olusma::time >= (SELECT s FROM i)))::int AS mesai_disi,
      COUNT(*) FILTER (WHERE hatirlatma_gonderildi = true)::int AS hatirlatilan,
      COUNT(*) FILTER (WHERE hatirlatma_gonderildi = true AND durum = 'tamamlandi')::int AS hatirlatilan_gelen,
      COUNT(*) FILTER (WHERE durum = 'gelmedi')::int AS gelmeyen,
      COUNT(*) FILTER (WHERE durum <> 'iptal')::int AS toplam
    FROM ay`, [isletmeId, bas])).rows[0];
  const [y, m] = ay.split('-').map(Number);
  return { ay, ay_adi: `${AYLAR[m - 1]} ${y}`, ...r };
}

function mesaj(isim, k) {
  if (!k.toplam) return null;
  const satir = [`📊 *${k.ay_adi} — SıraGO özeti*`, isim ? `_${isim}_` : null, ''];
  if (k.otomatik) satir.push(`🤖 Sen uğraşmadan gelen randevu: *${k.otomatik}*${k.otomatik_tutar ? ` (≈ ${tl(k.otomatik_tutar)})` : ''}`);
  if (k.mesai_disi) satir.push(`🌙 Bunların *${k.mesai_disi}* tanesi dükkân kapalıyken alındı`);
  if (k.hatirlatilan) satir.push(`🔔 ${k.hatirlatilan} müşteriye hatırlatma gitti, *${k.hatirlatilan_gelen}* tanesi geldi`);
  satir.push(`📅 Ayın toplam randevusu: ${k.toplam}${k.gelmeyen ? ` · gelmeyen: ${k.gelmeyen}` : ''}`);
  satir.push('', 'Ayrıntısı panelinde: Bugün → "Bu ay kazandırdığımız"');
  return satir.filter(s => s !== null).join('\n');
}

async function gonderHepsi(ay = oncekiAy()) {
  const isletmeler = (await pool.query(`SELECT id, isim, telefon FROM isletmeler WHERE aktif = true AND COALESCE(aylik_ozet_aktif, true) = true`)).rows;
  const whatsappWeb = require('./whatsappWeb');
  let giden = 0;
  for (const i of isletmeler) {
    try {
      if (whatsappWeb.getDurum(i.id)?.durum !== 'bagli') continue;      // bağlı değilse sadece panelde görünür
      const tel = telefonNormalize(i.telefon);
      if (!/^905\d{9}$/.test(tel)) continue;
      const m = mesaj(i.isim, await hesapla(i.id, ay));
      if (!m) continue;
      await whatsappWeb.mesajGonder(i.id, tel, m);
      giden++;
      await new Promise(r => setTimeout(r, 1500));
    } catch (e) { console.error(`Aylık özet hatası (${i.isim}):`, e.message); }
  }
  console.log(`📊 Aylık özet: ${giden} işletmeye gönderildi (${ay})`);
  return giden;
}

function baslat() {
  // Ayın 1'i 10:00 (İstanbul): geçen ayın özeti
  cron.schedule('0 10 1 * *', () => gonderHepsi().catch(e => console.error('Aylık özet:', e.message)), { timezone: 'Europe/Istanbul' });
  console.log('📊 Aylık kazanç özeti servisi başlatıldı (her ayın 1\'i 10:00)');
}

module.exports = { hesapla, mesaj, gonderHepsi, baslat, buAy, oncekiAy };
