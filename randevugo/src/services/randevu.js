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

    // Çalışan varsa, çalışanın kapalı günlerini de kontrol et
    let calisan = null;
    if (calisanId) {
      calisan = (await pool.query('SELECT * FROM calisanlar WHERE id=$1', [calisanId])).rows[0];
      if (calisan) {
        const calisanKapali = (calisan.kapali_gunler || '').split(',').filter(Boolean).map(Number);
        if (calisanKapali.includes(gun)) return [];
      }
    }

    // İşletme kapalı günleri
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

    // Çalışma saatleri: çalışanın kendi mesaisi varsa onu kullan, yoksa işletme varsayılanı
    const baslangic = (calisan && calisan.calisma_baslangic) ? calisan.calisma_baslangic : isletme.calisma_baslangic;
    const bitis = (calisan && calisan.calisma_bitis) ? calisan.calisma_bitis : isletme.calisma_bitis;

    // Mevcut randevuları al (iptal ve gelmedi hariç — onay_bekliyor dahil, slotu kilitler)
    let randevuQuery = 'SELECT saat, bitis_saati FROM randevular WHERE isletme_id = $1 AND tarih = $2 AND durum NOT IN ($3, $4)';
    const params = [isletmeId, tarih, 'iptal', 'gelmedi'];
    
    if (calisanId) {
      randevuQuery += ` AND calisan_id = $${params.length + 1}`;
      params.push(calisanId);
    }

    const mevcutRandevular = (await pool.query(randevuQuery, params)).rows;

    // Randevu bilgilerini dakikaya çevir
    const doluAraliklar = mevcutRandevular.map(r => {
      const [rH, rM] = r.saat.split(':').map(Number);
      const [rbH, rbM] = r.bitis_saati.split(':').map(Number);
      return { bas: rH * 60 + rM, bit: rbH * 60 + rbM + TAMPON_DK };
    });

    // Mola saatlerini de dolu aralık olarak ekle
    // Önce çalışan molaları, sonra işletme molaları
    const molalar = (calisan && calisan.mola_saatleri && calisan.mola_saatleri.length > 0)
      ? calisan.mola_saatleri
      : (isletme.mola_saatleri || []);
    molalar.forEach(m => {
      if (m.baslangic && m.bitis) {
        const [mBH, mBM] = m.baslangic.split(':').map(Number);
        const [mBtH, mBtM] = m.bitis.split(':').map(Number);
        doluAraliklar.push({ bas: mBH * 60 + mBM, bit: mBtH * 60 + mBtM });
      }
    });

    // Çakışma kontrol fonksiyonu
    const cakismaVar = (dk) => {
      return doluAraliklar.some(r => (dk < r.bit && dk + hizmetSureDk > r.bas));
    };

    const [basH, basM] = baslangic.split(':').map(Number);
    const [bitH, bitM] = bitis.split(':').map(Number);
    const basDk = basH * 60 + basM;
    const bitisDk = bitH * 60 + bitM;

    // Şu anki saatten önceki saatleri atla (bugün ise)
    const bugun = bugunTarih();
    const simdiDk = simdiSaat().toplam;

    // Aday slotları oluştur: 30dk aralık + randevu bitişlerinden sonraki ilk uygun 10dk slot
    const adaySet = new Set();

    // 1) 30dk aralıklı temel slotlar (10:00, 10:30, 11:00...)
    for (let dk = basDk; dk + hizmetSureDk <= bitisDk; dk += 30) {
      adaySet.add(dk);
    }

    // 2) Randevu bitişlerinden sonra en yakın 10'un katı slot ekle (boşluğu değerlendir)
    doluAraliklar.forEach(r => {
      const ilkMusait = Math.ceil(r.bit / 10) * 10; // bitiş+tampon sonrası ilk 10dk katı
      if (ilkMusait + hizmetSureDk <= bitisDk) {
        adaySet.add(ilkMusait);
      }
    });

    // Sırala ve filtrele
    const musaitSaatler = [];
    const adaylar = Array.from(adaySet).sort((a, b) => a - b);

    for (const dk of adaylar) {
      // Bugünse ve geçmişse atla
      if (tarih === bugun && dk <= simdiDk + 30) continue;

      if (!cakismaVar(dk)) {
        const saat = `${String(Math.floor(dk / 60)).padStart(2, '0')}:${String(dk % 60).padStart(2, '0')}`;
        musaitSaatler.push(saat);
      }
    }

    return musaitSaatler;
  }

  // Kapora hesapla — işletme alt sınırı + oran kontrolü
  async kaporaHesapla(isletmeId, hizmetId) {
    const isletme = (await pool.query('SELECT kapora_aktif, kapora_alt_siniri, kapora_orani FROM isletmeler WHERE id=$1', [isletmeId])).rows[0];
    if (!isletme || !isletme.kapora_aktif) return { gerekli: false, tutar: 0, yuzde: 0 };
    
    if (!hizmetId) return { gerekli: false, tutar: 0, yuzde: 0 };
    const hizmet = (await pool.query('SELECT fiyat, kapora_yuzdesi FROM hizmetler WHERE id=$1', [hizmetId])).rows[0];
    if (!hizmet || !hizmet.fiyat) return { gerekli: false, tutar: 0, yuzde: 0 };

    const fiyat = parseFloat(hizmet.fiyat);
    const altSinir = parseFloat(isletme.kapora_alt_siniri) || 0;
    if (fiyat < altSinir) return { gerekli: false, tutar: 0, yuzde: 0 };

    // Hizmet bazlı yüzde varsa onu kullan, yoksa işletme genel oranını kullan
    const yuzde = (hizmet.kapora_yuzdesi && hizmet.kapora_yuzdesi > 0) ? hizmet.kapora_yuzdesi : (isletme.kapora_orani || 20);
    if (yuzde <= 0) return { gerekli: false, tutar: 0, yuzde: 0 };
    
    const tutar = Math.ceil(fiyat * yuzde / 100);
    return { gerekli: true, tutar, yuzde };
  }

  // Hizmete uygun çalışanları getir (calisan_hizmetler tablosundan)
  async uygunCalisanlar(isletmeId, hizmetId = null) {
    let query = 'SELECT c.* FROM calisanlar c WHERE c.isletme_id=$1 AND (c.aktif IS NULL OR c.aktif=true)';
    const params = [isletmeId];
    
    if (hizmetId) {
      // calisan_hizmetler tablosunda kayıt varsa sadece eşleşenleri getir, yoksa tüm çalışanları getir
      const eslesme = (await pool.query('SELECT COUNT(*) as sayi FROM calisan_hizmetler ch JOIN calisanlar c ON c.id=ch.calisan_id WHERE c.isletme_id=$1', [isletmeId])).rows[0];
      if (parseInt(eslesme.sayi) > 0) {
        // Eşleştirme sistemi aktif — sadece bu hizmete atanmış çalışanları getir
        query = `SELECT c.* FROM calisanlar c 
                 JOIN calisan_hizmetler ch ON ch.calisan_id = c.id 
                 WHERE c.isletme_id=$1 AND (c.aktif IS NULL OR c.aktif=true) AND ch.hizmet_id=$2`;
        params.push(hizmetId);
      }
    }
    
    query += ' ORDER BY c.id';
    return (await pool.query(query, params)).rows;
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

    // Kapora kontrolü
    const kapora = await this.kaporaHesapla(isletmeId, hizmetId);

    // İşletme onay modunu al
    const isletme = (await pool.query('SELECT randevu_onay_modu FROM isletmeler WHERE id=$1', [isletmeId])).rows[0];
    const manuelOnay = isletme && isletme.randevu_onay_modu === 'manuel';

    // Durum belirleme: kapora > manuel onay > otomatik
    let durum = 'onaylandi';
    let kaporaDurumu = 'yok';
    if (kapora.gerekli) {
      durum = 'kapora_bekliyor';
      kaporaDurumu = 'bekliyor';
    } else if (manuelOnay) {
      durum = 'onay_bekliyor';
    }

    // Randevuyu kaydet
    const randevu = (await pool.query(
      `INSERT INTO randevular (isletme_id, calisan_id, musteri_id, hizmet_id, tarih, saat, bitis_saati, durum, kapora_durumu, kapora_tutari)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *`,
      [isletmeId, calisanId, musteri.id, hizmetId, tarih, saat, bitisSaat,
       durum, kaporaDurumu, kapora.tutar]
    )).rows[0];

    return { randevu, musteri, hizmet, kapora, manuelOnay };
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

  // Slot-aware çalışan atama: ardışık blok kontrolü ile en boş çalışanı seç
  async enBosCalisan(isletmeId, tarih, hizmetId) {
    const calisanlar = await this.uygunCalisanlar(isletmeId, hizmetId);
    if (calisanlar.length === 0) return null;
    if (calisanlar.length === 1) return calisanlar[0];

    let enIyi = null;
    let enCokSlot = -1;

    for (const calisan of calisanlar) {
      const musaitSaatler = await this.musaitSaatleriGetir(isletmeId, tarih, calisan.id, hizmetId);
      if (musaitSaatler.length === 0) continue;
      if (musaitSaatler.length > enCokSlot) {
        enCokSlot = musaitSaatler.length;
        enIyi = calisan;
      }
    }

    return enIyi;
  }

  // No-show kaydet → kara listeye ihlal ekle (otomatik mod açıksa)
  async noShowKaydet(isletmeId, musteriTelefon) {
    try {
      const isletme = (await pool.query(
        'SELECT kara_liste_otomatik, kara_liste_ihlal_sinir FROM isletmeler WHERE id=$1',
        [isletmeId]
      )).rows[0];
      if (!isletme || !isletme.kara_liste_otomatik) return;

      await pool.query(`
        INSERT INTO kara_liste (isletme_id, telefon, sebep, ihlal_sayisi, aktif)
        VALUES ($1, $2, 'no_show', 1, false)
        ON CONFLICT (isletme_id, telefon) DO UPDATE SET
          ihlal_sayisi = kara_liste.ihlal_sayisi + 1,
          aktif = CASE WHEN kara_liste.ihlal_sayisi + 1 >= $3 THEN true ELSE kara_liste.aktif END
      `, [isletmeId, musteriTelefon, isletme.kara_liste_ihlal_sinir || 3]);
    } catch (e) {
      console.error('No-show kara liste hatası:', e.message);
    }
  }
}

module.exports = new RandevuService();
