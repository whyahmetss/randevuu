/**
 * Otomatik No-show Cron
 * ═══════════════════════════════════════════════════
 * Her 10 dakikada bir:
 *   - Randevu saati +2 saat geçmiş + durum 'onaylandi' + check-in yok
 *     → durum = 'gelmedi' yap, noShowKaydet çağır
 *   - Sadece isletmeler.no_show_otomatik = true olan işletmeler
 */
const pool = require('../config/db');

let _timer = null;

async function tara() {
  try {
    // Bugün veya geçmiş, 2+ saat geçmiş randevuları bul
    const rows = (await pool.query(`
      SELECT r.id, r.isletme_id, r.tarih, r.saat, r.saat::time + INTERVAL '2 hours' as esik,
             m.telefon, m.isim
      FROM randevular r
      JOIN isletmeler i ON i.id = r.isletme_id
      JOIN musteriler m ON m.id = r.musteri_id
      WHERE i.no_show_otomatik = true
        AND r.durum IN ('onaylandi', 'onay_bekliyor')
        AND r.tarih <= CURRENT_DATE
        AND (r.tarih < CURRENT_DATE OR (r.tarih = CURRENT_DATE AND r.saat::time + INTERVAL '2 hours' < CURRENT_TIME))
      LIMIT 100
    `)).rows;

    if (rows.length === 0) return;
    console.log(`🕛 Otomatik no-show taraması: ${rows.length} randevu işlenecek`);

    const randevuService = require('./randevu');
    const guvenlikSkor = require('./guvenlikSkor');

    for (const r of rows) {
      try {
        await pool.query(`UPDATE randevular SET durum='gelmedi' WHERE id=$1`, [r.id]);
        // Skor düş
        await guvenlikSkor.logla(r.telefon, 'randevu_no_show', r.isletme_id, `randevuId=${r.id}`);
        // Kara liste + basamaklı ceza
        await randevuService.noShowKaydet(r.isletme_id, r.telefon);
        console.log(`   ↳ No-show: randevu #${r.id} (${r.isim} — ${r.tarih} ${r.saat})`);
      } catch (e) {
        console.log(`   ✗ No-show işaretlenirken hata #${r.id}:`, e.message);
      }
    }
  } catch (e) {
    console.error('❌ Otomatik no-show tarama hatası:', e.message);
  }
}

function baslat() {
  if (_timer) return;
  // İlk tarama 60 sn sonra (server tam başlasın diye), sonra her 10 dk
  setTimeout(() => {
    tara();
    _timer = setInterval(tara, 10 * 60 * 1000);
  }, 60 * 1000);
  console.log('✅ Otomatik no-show cron aktif (10 dk aralık)');
}

function durdur() {
  if (_timer) clearInterval(_timer);
  _timer = null;
}

module.exports = { baslat, durdur, tara };
