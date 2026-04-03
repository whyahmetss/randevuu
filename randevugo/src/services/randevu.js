const pool = require('../config/db');
const { bugunTarih, simdiSaat } = require('../utils/tarih');

class RandevuService {

  // Müsait saatleri hesapla
  // hizmetId: seçilen hizmetin süresi kadar blok tutar
  // calisanId: sadece o çalışanın randevularına bakar
  async musaitSaatleriGetir(isletmeId, tarih, calisanId = null, hizmetId = null) {
    const isletme = (await pool.query('SELECT * FROM isletmeler WHERE id = $1', [isletmeId])).rows[0];
    if (!isletme) return [];

    // Gün kontrolü (0=Pazar, 6=Cumartesi)
    const gun = new Date(tarih).getDay();
    const kapaliGunler = (isletme.kapali_gunler || '').split(',').map(Number);
    if (kapaliGunler.includes(gun)) return [];

    // Hizmet süresi: seçilen hizmetin süresi veya işletme varsayılanı
    let hizmetSureDk = isletme.randevu_suresi_dk || 30;
    if (hizmetId) {
      const hizmet = (await pool.query('SELECT sure_dk FROM hizmetler WHERE id=$1', [hizmetId])).rows[0];
      if (hizmet) hizmetSureDk = hizmet.sure_dk;
    }

    // 5dk tampon (arası hazırlık/temizlik)
    const TAMPON_DK = 5;

    // Çalışma saatleri
    const baslangic = isletme.calisma_baslangic;
    const bitis = isletme.calisma_bitis;

    // Slot aralığı: 30dk (temiz görünüm, çakışma hizmet süresine göre hesaplanır)
    const SLOT_ARALIK = 30;

    // Mevcut randevuları al (bitiş saati + tampon ile)
    let randevuQuery = 'SELECT saat, bitis_saati FROM randevular WHERE isletme_id = $1 AND tarih = $2 AND durum != $3';
    const params = [isletmeId, tarih, 'iptal'];
    
    if (calisanId) {
      randevuQuery += ' AND calisan_id = $4';
      params.push(calisanId);
    }

    const mevcutRandevular = (await pool.query(randevuQuery, params)).rows;

    // Müsait saatleri hesapla
    const musaitSaatler = [];
    const [basH, basM] = baslangic.split(':').map(Number);
    const [bitH, bitM] = bitis.split(':').map(Number);
    
    let mevcutDk = basH * 60 + basM;
    const bitisDk = bitH * 60 + bitM;

    // Şu anki saatten önceki saatleri atla (bugün ise)
    const bugun = bugunTarih();
    const simdiDk = simdiSaat().toplam;

    while (mevcutDk + hizmetSureDk <= bitisDk) {
      const saat = `${String(Math.floor(mevcutDk / 60)).padStart(2, '0')}:${String(mevcutDk % 60).padStart(2, '0')}`;

      // Bugünse ve saat geçmişse atla (30dk marj)
      if (tarih === bugun && mevcutDk <= simdiDk + 30) {
        mevcutDk += SLOT_ARALIK;
        continue;
      }

      // Çakışma kontrolü: yeni randevunun [başlangıç, bitiş+tampon] aralığı mevcut randevuların [başlangıç, bitiş+tampon] ile çakışıyor mu?
      const yeniBasDk = mevcutDk;
      const yeniBitDk = mevcutDk + hizmetSureDk;

      const cakisma = mevcutRandevular.some(r => {
        const [rH, rM] = r.saat.split(':').map(Number);
        const [rbH, rbM] = r.bitis_saati.split(':').map(Number);
        const rBasDk = rH * 60 + rM;
        const rBitDk = rbH * 60 + rbM + TAMPON_DK; // mevcut randevu bitişine 5dk tampon ekle
        return (yeniBasDk < rBitDk && yeniBitDk > rBasDk);
      });

      if (!cakisma) {
        musaitSaatler.push(saat);
      }

      mevcutDk += SLOT_ARALIK;
    }

    return musaitSaatler;
  }

  // Randevu oluştur
  async randevuOlustur({ isletmeId, musteriTelefon, musteriIsim, hizmetId, calisanId, tarih, saat }) {
    // Müşteriyi bul veya oluştur
    let musteri = (await pool.query('SELECT * FROM musteriler WHERE telefon = $1', [musteriTelefon])).rows[0];
    
    if (!musteri) {
      musteri = (await pool.query(
        'INSERT INTO musteriler (telefon, isim) VALUES ($1, $2) RETURNING *',
        [musteriTelefon, musteriIsim || 'Bilinmiyor']
      )).rows[0];
    }

    // Hizmet süresini al
    const hizmet = hizmetId 
      ? (await pool.query('SELECT * FROM hizmetler WHERE id = $1', [hizmetId])).rows[0]
      : null;
    
    const sureDk = hizmet ? hizmet.sure_dk : 30;
    const [saatH, saatM] = saat.split(':').map(Number);
    const bitisDk = saatH * 60 + saatM + sureDk;
    const bitisSaat = `${String(Math.floor(bitisDk / 60)).padStart(2, '0')}:${String(bitisDk % 60).padStart(2, '0')}`;

    // Randevuyu kaydet
    const randevu = (await pool.query(
      `INSERT INTO randevular (isletme_id, calisan_id, musteri_id, hizmet_id, tarih, saat, bitis_saati, durum)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'onaylandi') RETURNING *`,
      [isletmeId, calisanId, musteri.id, hizmetId, tarih, saat, bitisSaat]
    )).rows[0];

    return { randevu, musteri, hizmet };
  }

  // Randevu iptal et
  async randevuIptal(randevuId) {
    const result = await pool.query(
      `UPDATE randevular SET durum = 'iptal' WHERE id = $1 RETURNING *`,
      [randevuId]
    );
    return result.rows[0];
  }

  // Müşterinin aktif randevularını getir
  async musteriRandevulari(musteriTelefon, isletmeId) {
    const result = await pool.query(`
      SELECT r.*, h.isim as hizmet_isim, h.fiyat, i.isim as isletme_isim, i.adres
      FROM randevular r
      LEFT JOIN hizmetler h ON r.hizmet_id = h.id
      JOIN isletmeler i ON r.isletme_id = i.id
      JOIN musteriler m ON r.musteri_id = m.id
      WHERE m.telefon = $1 AND r.isletme_id = $2 AND r.durum = 'onaylandi' AND r.tarih >= CURRENT_DATE
      ORDER BY r.tarih, r.saat
    `, [musteriTelefon, isletmeId]);
    return result.rows;
  }

  // Hatırlatma gönderilecek randevuları getir (1 saat içindekiler)
  async hatirlatmaRandevulari() {
    const result = await pool.query(`
      SELECT r.*, m.telefon as musteri_telefon, m.isim as musteri_isim,
             h.isim as hizmet_isim, i.isim as isletme_isim, i.adres as isletme_adres
      FROM randevular r
      JOIN musteriler m ON r.musteri_id = m.id
      LEFT JOIN hizmetler h ON r.hizmet_id = h.id
      JOIN isletmeler i ON r.isletme_id = i.id
      WHERE r.durum = 'onaylandi'
        AND r.hatirlatma_gonderildi = false
        AND r.tarih = CURRENT_DATE
        AND r.saat BETWEEN NOW()::time AND (NOW() + INTERVAL '1 hour')::time
    `);
    return result.rows;
  }

  // Hatırlatma gönderildi olarak işaretle
  async hatirlatmaIsaretle(randevuId) {
    await pool.query('UPDATE randevular SET hatirlatma_gonderildi = true WHERE id = $1', [randevuId]);
  }

  // İstatistikler
  async istatistikler(isletmeId, baslangicTarih, bitisTarih) {
    const result = await pool.query(`
      SELECT 
        COUNT(*) as toplam_randevu,
        COUNT(*) FILTER (WHERE durum = 'onaylandi') as aktif,
        COUNT(*) FILTER (WHERE durum = 'tamamlandi') as tamamlanan,
        COUNT(*) FILTER (WHERE durum = 'iptal') as iptal,
        COUNT(*) FILTER (WHERE durum = 'gelmedi') as gelmedi
      FROM randevular
      WHERE isletme_id = $1 AND tarih BETWEEN $2 AND $3
    `, [isletmeId, baslangicTarih, bitisTarih]);
    return result.rows[0];
  }
}

module.exports = new RandevuService();
