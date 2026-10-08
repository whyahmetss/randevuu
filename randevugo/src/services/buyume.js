// Büyüme ekranı (2026-10-08): esnaflar hangi kanaldan geliyor, kaçı kuruyor, kaçı ödüyor.
// Yeni kolon yok: kanal mevcut veriden çıkarılır (Telegram tg_ telefonu, Venüs demosu, satış botu
// konuşması, referans kodu; kalanı web/panel).
const pool = require('../config/db');

const KANAL_AD = { whatsapp: 'WhatsApp satış botu', demo: 'Kişisel demo (Venüs)', telegram: 'Telegram botu', referans: 'Referans', web: 'Web sitesi / panel' };

async function buyumeRaporu(gun = 30) {
  gun = Math.min(Math.max(parseInt(gun) || 30, 1), 365);
  const rows = (await pool.query(`
    SELECT i.id,
      CASE
        WHEN i.telefon LIKE 'tg\_%' THEN 'telegram'
        WHEN i.demo_lead_id IS NOT NULL THEN 'demo'
        WHEN EXISTS (SELECT 1 FROM satis_konusmalar k WHERE k.kayit_isletme_id = i.id) THEN 'whatsapp'
        WHEN COALESCE(i.referans_kodu, '') <> '' THEN 'referans'
        ELSE 'web' END AS kanal,
      (EXISTS (SELECT 1 FROM hizmetler h WHERE h.isletme_id = i.id)
        AND EXISTS (SELECT 1 FROM calisanlar c WHERE c.isletme_id = i.id)
        AND EXISTS (SELECT 1 FROM wa_auth_keys w WHERE w.isletme_id = i.id)) AS kurdu,
      EXISTS (SELECT 1 FROM randevular r WHERE r.isletme_id = i.id) AS randevu,
      EXISTS (SELECT 1 FROM odemeler o WHERE o.isletme_id = i.id AND o.durum = 'odendi') AS odedi
    FROM isletmeler i
    WHERE i.demo IS NOT TRUE
      AND NOT (i.grup_id IS NOT NULL AND i.id <> (SELECT MIN(m.id) FROM isletmeler m WHERE m.grup_id = i.grup_id))
      AND i.olusturma_tarihi > NOW() - make_interval(days => $1)`, [gun])).rows;

  const kanallar = {};
  for (const r of rows) {
    const k = (kanallar[r.kanal] ||= { kanal: r.kanal, ad: KANAL_AD[r.kanal], kayit: 0, kurdu: 0, randevu: 0, odedi: 0 });
    k.kayit++; if (r.kurdu) k.kurdu++; if (r.randevu) k.randevu++; if (r.odedi) k.odedi++;
  }
  const liste = Object.values(kanallar).sort((a, b) => b.kayit - a.kayit);
  const toplam = liste.reduce((t, k) => ({ kayit: t.kayit + k.kayit, kurdu: t.kurdu + k.kurdu, randevu: t.randevu + k.randevu, odedi: t.odedi + k.odedi }),
    { kayit: 0, kurdu: 0, randevu: 0, odedi: 0 });

  // Satış botunun üst hunisi: mesaj atılan → cevap veren → kayıt
  let satisBot = null;
  try {
    satisBot = (await pool.query(`
      SELECT COUNT(*)::int AS yazilan,
        COUNT(*) FILTER (WHERE COALESCE(gelen_mesajlar, '') <> '')::int AS cevap,
        COUNT(*) FILTER (WHERE kayit_isletme_id IS NOT NULL)::int AS kayit
      FROM satis_konusmalar WHERE olusturma_tarihi > NOW() - make_interval(days => $1)`, [gun])).rows[0];
  } catch (e) { /* tablo yoksa boş */ }

  return { gun, kanallar: liste, toplam, satisBot };
}

module.exports = { buyumeRaporu };
