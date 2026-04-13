const pool = require('../config/db');

class NetgsmService {

  // SMS gönder (NetGSM HTTP API)
  async smsGonder(isletmeId, telefon, mesaj, tip = 'hatirlatma') {
    try {
      const isletme = (await pool.query(
        'SELECT sms_aktif, netgsm_kullanici_adi, netgsm_sifre, netgsm_baslik FROM isletmeler WHERE id=$1',
        [isletmeId]
      )).rows[0];

      if (!isletme || !isletme.sms_aktif) {
        return { basarili: false, hata: 'SMS aktif değil' };
      }
      if (!isletme.netgsm_kullanici_adi || !isletme.netgsm_sifre) {
        return { basarili: false, hata: 'NetGSM bilgileri eksik' };
      }

      // Telefon numarası düzeltme (05xx → 905xx)
      let tel = telefon.replace(/\s/g, '').replace(/^\+/, '');
      if (tel.startsWith('0')) tel = '9' + tel;
      if (!tel.startsWith('90')) tel = '90' + tel;

      // NetGSM XML API
      const xml = `<?xml version="1.0" encoding="UTF-8"?>
<mainbody>
  <header>
    <company dession="0">Netgsm</company>
    <usercode>${isletme.netgsm_kullanici_adi}</usercode>
    <password>${isletme.netgsm_sifre}</password>
    <type>1:n</type>
    <msgheader>${isletme.netgsm_baslik || 'SIRAGO'}</msgheader>
  </header>
  <body>
    <msg><![CDATA[${mesaj}]]></msg>
    <no>${tel}</no>
  </body>
</mainbody>`;

      const response = await fetch('https://api.netgsm.com.tr/sms/send/xml', {
        method: 'POST',
        headers: { 'Content-Type': 'application/xml' },
        body: xml
      });

      const text = await response.text();
      const basarili = text.startsWith('00') || text.startsWith('01') || text.startsWith('02');
      const netgsmId = basarili ? text.split(' ')[1] || text : null;

      // Log kaydet
      await pool.query(
        'INSERT INTO sms_log (isletme_id, telefon, mesaj, tip, durum, netgsm_id) VALUES ($1, $2, $3, $4, $5, $6)',
        [isletmeId, tel, mesaj, tip, basarili ? 'gonderildi' : 'basarisiz', netgsmId]
      );

      if (basarili) {
        console.log(`📱 SMS gönderildi → ${tel} (${tip})`);
        return { basarili: true, netgsmId };
      } else {
        console.error(`❌ SMS başarısız → ${tel}: ${text}`);
        return { basarili: false, hata: text };
      }
    } catch (error) {
      console.error('❌ SMS gönderme hatası:', error.message);
      return { basarili: false, hata: error.message };
    }
  }

  // Hatırlatma SMS'i gönder (cron ile çağrılır)
  async hatirlatmaSmsGonder() {
    try {
      // SMS aktif olan işletmeleri bul
      const isletmeler = (await pool.query(
        `SELECT id, isim, sms_hatirlatma_dk, netgsm_kullanici_adi, netgsm_sifre, netgsm_baslik 
         FROM isletmeler WHERE sms_aktif = true AND netgsm_kullanici_adi IS NOT NULL`
      )).rows;

      for (const isletme of isletmeler) {
        const dk = isletme.sms_hatirlatma_dk || 60;
        // Hatırlatma gönderilecek randevuları bul
        const randevular = (await pool.query(`
          SELECT r.id, r.saat, m.telefon, m.isim as musteri_isim, h.isim as hizmet_isim
          FROM randevular r
          JOIN musteriler m ON r.musteri_id = m.id
          LEFT JOIN hizmetler h ON r.hizmet_id = h.id
          WHERE r.isletme_id = $1
            AND r.durum = 'onaylandi'
            AND r.tarih = CURRENT_DATE
            AND r.sms_hatirlatma_gonderildi IS NOT TRUE
            AND r.saat BETWEEN NOW()::time AND (NOW() + INTERVAL '${dk} minutes')::time
        `, [isletme.id])).rows;

        for (const r of randevular) {
          const mesaj = `Sayın ${r.musteri_isim}, bugün saat ${String(r.saat).substring(0,5)}'da ${isletme.isim}'de ${r.hizmet_isim || 'randevu'}nuz var. İyi günler! - SıraGO`;
          await this.smsGonder(isletme.id, r.telefon, mesaj, 'hatirlatma');
          await pool.query('UPDATE randevular SET sms_hatirlatma_gonderildi = true WHERE id = $1', [r.id]);
        }
      }
    } catch (error) {
      console.error('❌ SMS hatırlatma cron hatası:', error.message);
    }
  }

  // Randevu onay SMS'i
  async onaySmsiGonder(isletmeId, telefon, musteriIsim, isletmeIsim, tarih, saat) {
    const mesaj = `Merhaba ${musteriIsim}, ${tarih} tarihli saat ${saat} ${isletmeIsim} randevunuz onaylanmıştır. İyi günler! - SıraGO`;
    return this.smsGonder(isletmeId, telefon, mesaj, 'onay');
  }

  // SMS bakiye sorgula (NetGSM)
  async bakiyeSorgula(isletmeId) {
    try {
      const isletme = (await pool.query(
        'SELECT netgsm_kullanici_adi, netgsm_sifre FROM isletmeler WHERE id=$1',
        [isletmeId]
      )).rows[0];
      if (!isletme?.netgsm_kullanici_adi) return { bakiye: null, hata: 'Bilgi eksik' };

      const url = `https://api.netgsm.com.tr/balance/list/xml?usercode=${encodeURIComponent(isletme.netgsm_kullanici_adi)}&password=${encodeURIComponent(isletme.netgsm_sifre)}`;
      const response = await fetch(url);
      const text = await response.text();

      // NetGSM bakiye formatı: "00 XXXX" (XX = bakiye TL)
      if (text.startsWith('00')) {
        const bakiye = text.split(' ')[1] || '0';
        return { bakiye: parseFloat(bakiye), hata: null };
      }
      return { bakiye: null, hata: text };
    } catch (error) {
      return { bakiye: null, hata: error.message };
    }
  }
}

module.exports = new NetgsmService();
