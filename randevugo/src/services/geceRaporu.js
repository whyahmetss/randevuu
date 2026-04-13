const cron = require('node-cron');
const pool = require('../config/db');

class GeceRaporuService {

  baslat() {
    // Her dakika kontrol et (saatler işletmeye göre farklı olabilir)
    cron.schedule('* * * * *', async () => {
      await this.raporKontrol();
    });
    console.log('🌙 Gece raporu servisi başlatıldı');
  }

  async raporKontrol() {
    try {
      const simdi = new Date();
      const saat = `${String(simdi.getHours()).padStart(2, '0')}:${String(simdi.getMinutes()).padStart(2, '0')}`;
      const bugun = simdi.toISOString().slice(0, 10);

      // Bu saatte rapor gönderilecek işletmeleri bul
      const isletmeler = (await pool.query(`
        SELECT i.* FROM isletmeler i
        WHERE i.gece_raporu_aktif = true
          AND i.gece_raporu_saat = $1
          AND NOT EXISTS (
            SELECT 1 FROM gece_rapor_log g WHERE g.isletme_id = i.id AND g.tarih = $2
          )
      `, [saat, bugun])).rows;

      for (const isletme of isletmeler) {
        await this.raporGonder(isletme);
      }
    } catch (e) {
      console.error('❌ Gece raporu kontrol hatası:', e.message);
    }
  }

  async raporOlustur(isletmeId) {
    const bugun = new Date().toISOString().slice(0, 10);

    // Bugünkü randevu istatistikleri
    const randevuStat = (await pool.query(`
      SELECT 
        COUNT(*) as toplam,
        COUNT(*) FILTER (WHERE durum = 'tamamlandi') as tamamlanan,
        COUNT(*) FILTER (WHERE durum = 'onaylandi') as onaylanan,
        COUNT(*) FILTER (WHERE durum = 'iptal') as iptal,
        COUNT(*) FILTER (WHERE durum = 'gelmedi') as gelmedi
      FROM randevular WHERE isletme_id = $1 AND tarih = $2
    `, [isletmeId, bugun])).rows[0];

    // Bugünkü ciro
    const ciro = (await pool.query(`
      SELECT COALESCE(SUM(h.fiyat), 0) as toplam_ciro
      FROM randevular r
      LEFT JOIN hizmetler h ON r.hizmet_id = h.id
      WHERE r.isletme_id = $1 AND r.tarih = $2 AND r.durum = 'tamamlandi'
    `, [isletmeId, bugun])).rows[0];

    // Kasa hareketleri
    const kasa = (await pool.query(`
      SELECT 
        COALESCE(SUM(CASE WHEN tip='gelir' THEN tutar ELSE 0 END), 0) as gelir,
        COALESCE(SUM(CASE WHEN tip='gider' THEN tutar ELSE 0 END), 0) as gider
      FROM kasa_hareketleri WHERE isletme_id = $1 AND tarih = $2
    `, [isletmeId, bugun])).rows[0];

    // Yarınki randevular
    const yarin = new Date();
    yarin.setDate(yarin.getDate() + 1);
    const yarinStr = yarin.toISOString().slice(0, 10);
    const yarinRandevu = (await pool.query(`
      SELECT COUNT(*) as sayi FROM randevular 
      WHERE isletme_id = $1 AND tarih = $2 AND durum IN ('onaylandi', 'onay_bekliyor')
    `, [isletmeId, yarinStr])).rows[0];

    const isletme = (await pool.query('SELECT isim FROM isletmeler WHERE id=$1', [isletmeId])).rows[0];
    const gelir = parseFloat(kasa.gelir);
    const gider = parseFloat(kasa.gider);
    const toplamCiro = parseFloat(ciro.toplam_ciro);

    const mesaj = `🌙 *${isletme?.isim || 'İşletme'} — Günlük Rapor*
📅 ${new Date().toLocaleDateString('tr-TR', { weekday: 'long', day: 'numeric', month: 'long' })}

📊 *Randevu Özeti*
• Toplam: ${randevuStat.toplam}
• Tamamlanan: ${randevuStat.tamamlanan}
• Onaylı: ${randevuStat.onaylanan}
• İptal: ${randevuStat.iptal}
• Gelmedi: ${randevuStat.gelmedi}

💰 *Finansal Özet*
• Hizmet Cirosu: ${Math.round(toplamCiro)}₺
• Kasa Gelir: ${Math.round(gelir)}₺
• Kasa Gider: ${Math.round(gider)}₺
• Net: ${Math.round(gelir - gider)}₺

📅 *Yarın*
• Bekleyen randevu: ${yarinRandevu.sayi}

_SıraGO — Otomatik Gece Raporu_`;

    return mesaj;
  }

  async raporGonder(isletme) {
    try {
      const mesaj = await this.raporOlustur(isletme.id);
      const kanal = isletme.gece_raporu_kanal || 'whatsapp';
      const telefon = isletme.gece_raporu_telefon || isletme.telefon;
      let durum = 'gonderildi';

      if (kanal === 'whatsapp' && telefon) {
        try {
          const whatsappWeb = require('./whatsappWeb');
          const waDurum = whatsappWeb.getDurum(isletme.id);
          if (waDurum?.durum === 'bagli') {
            await whatsappWeb.mesajGonder(isletme.id, telefon, mesaj);
          } else {
            durum = 'baglanti_yok';
          }
        } catch (e) {
          durum = 'hata';
          console.error(`Gece raporu WA hatası (${isletme.isim}):`, e.message);
        }
      } else if (kanal === 'sms' && telefon) {
        try {
          const netgsm = require('./netgsm');
          const smsMesaj = mesaj.replace(/\*/g, '').replace(/_/g, '');
          const sonuc = await netgsm.smsGonder(isletme.id, telefon, smsMesaj, 'gece_raporu');
          durum = sonuc.basarili ? 'gonderildi' : 'hata';
        } catch (e) {
          durum = 'hata';
        }
      }

      // Log kaydet
      await pool.query(
        'INSERT INTO gece_rapor_log (isletme_id, tarih, kanal, rapor_icerik, durum) VALUES ($1, CURRENT_DATE, $2, $3, $4)',
        [isletme.id, kanal, mesaj, durum]
      );

      console.log(`🌙 Gece raporu gönderildi: ${isletme.isim} (${kanal}) — ${durum}`);
    } catch (e) {
      console.error(`❌ Gece raporu gönderim hatası (${isletme.isim}):`, e.message);
    }
  }
}

module.exports = new GeceRaporuService();
