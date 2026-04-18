const pool = require('../config/db');
const { bugunTarih, simdiSaat } = require('../utils/tarih');
const socketServer = require('./socketServer');
const pushService = require('./pushService');

class RandevuService {

  // Müsait saatleri hesapla
  // hizmetId: seçilen hizmetin süresi kadar blok tutar
  // calisanId: sadece o çalışanın randevularına bakar
  // Randevu Modları:
  //   sirali: her slot 1 randevu alır, arka arkaya sıralı (varsayılan)
  //   seans: aynı slota birden fazla müşteri alınabilir (çalışan sayısı kadar)
  //   esnek: 10dk aralıklarla tüm boş saatler sunulur
  async musaitSaatleriGetir(isletmeId, tarih, calisanId = null, hizmetId = null) {
    const isletme = (await pool.query('SELECT * FROM isletmeler WHERE id = $1', [isletmeId])).rows[0];
    if (!isletme) return [];

    const randevuModu = isletme.randevu_modu || 'sirali';

    // tarih parametresi Date objesi olabilir (PostgreSQL), string'e çevir
    if (tarih instanceof Date) {
      tarih = tarih.toISOString().slice(0, 10);
    } else if (tarih && typeof tarih !== 'string') {
      tarih = String(tarih);
    }
    if (!tarih) return [];

    // Gün kontrolü (0=Pazar, 6=Cumartesi) — timezone-safe
    const [yil, ay, gn] = tarih.split('-').map(Number);
    const gun = new Date(yil, ay - 1, gn).getDay();

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
    const kapaliGunler = (isletme.kapali_gunler || '').split(',').filter(Boolean).map(Number);
    if (kapaliGunler.length > 0 && kapaliGunler.includes(gun)) return [];

    // Hizmet süresi: seçilen hizmetin süresi veya işletme varsayılanı
    let hizmetSureDk = isletme.randevu_suresi_dk || 30;
    let hizmetTamponDk = 0;
    if (hizmetId) {
      const hizmet = (await pool.query('SELECT sure_dk, tampon_dk FROM hizmetler WHERE id=$1', [hizmetId])).rows[0];
      if (hizmet) {
        hizmetSureDk = hizmet.sure_dk;
        hizmetTamponDk = hizmet.tampon_dk || 0;
      }
    }

    // Tampon: hizmet bazlı > işletme varsayılanı > 5dk
    const TAMPON_DK = hizmetTamponDk > 0 ? hizmetTamponDk : (isletme.varsayilan_tampon_dk || 5);
    // Slot aralığı: işletme ayarı veya 30dk (esnek modda 10dk)
    const SLOT_ARALIK_DK = randevuModu === 'esnek' ? 10 : (isletme.slot_aralik_dk || 30);

    // Çalışma saatleri: çalışanın kendi mesaisi varsa onu kullan, yoksa işletme varsayılanı
    const baslangic = (calisan && calisan.calisma_baslangic) ? calisan.calisma_baslangic : (isletme.calisma_baslangic || '09:00');
    const bitis = (calisan && calisan.calisma_bitis) ? calisan.calisma_bitis : (isletme.calisma_bitis || '19:00');

    // Mevcut randevuları al (iptal ve gelmedi hariç — onay_bekliyor dahil, slotu kilitler)
    let randevuQuery = 'SELECT saat, bitis_saati, calisan_id FROM randevular WHERE isletme_id = $1 AND tarih = $2 AND durum NOT IN ($3, $4)';
    const params = [isletmeId, tarih, 'iptal', 'gelmedi'];
    
    if (calisanId) {
      randevuQuery += ` AND calisan_id = $${params.length + 1}`;
      params.push(calisanId);
    }

    const mevcutRandevular = (await pool.query(randevuQuery, params)).rows;

    // ─── SEANS MODU: aynı slota birden fazla müşteri alınabilir ───
    if (randevuModu === 'seans') {
      // Aktif çalışan sayısı = eşzamanlı kapasite
      const calisanSayisi = (await pool.query(
        'SELECT COUNT(*) as sayi FROM calisanlar WHERE isletme_id=$1 AND (aktif IS NULL OR aktif=true)',
        [isletmeId]
      )).rows[0];
      const kapasite = Math.max(parseInt(calisanSayisi.sayi) || 1, 1);

      // Her slot için kaç randevu var say
      const slotSayac = {};
      mevcutRandevular.forEach(r => {
        const key = r.saat.substring(0, 5);
        slotSayac[key] = (slotSayac[key] || 0) + 1;
      });

      // Mola aralıkları
      const molaAraliklari = [];
      const molalar = (calisan && calisan.mola_saatleri && calisan.mola_saatleri.length > 0)
        ? calisan.mola_saatleri : (isletme.mola_saatleri || []);
      molalar.forEach(m => {
        if (m.baslangic && m.bitis) {
          const [mBH, mBM] = m.baslangic.split(':').map(Number);
          const [mBtH, mBtM] = m.bitis.split(':').map(Number);
          molaAraliklari.push({ bas: mBH * 60 + mBM, bit: mBtH * 60 + mBtM });
        }
      });

      const [basH, basM] = baslangic.split(':').map(Number);
      const [bitH, bitM] = bitis.split(':').map(Number);
      const basDk = basH * 60 + basM;
      const bitisDk = bitH * 60 + bitM;
      const bugun = bugunTarih();
      const simdiDk = simdiSaat().toplam;
      const SEANS_ARALIK = isletme.slot_aralik_dk || 30;

      const musaitSaatler = [];
      for (let dk = basDk; dk + hizmetSureDk <= bitisDk; dk += SEANS_ARALIK) {
        if (tarih === bugun && dk <= simdiDk + 30) continue;
        // Mola kontrolü
        const molada = molaAraliklari.some(m => dk < m.bit && dk + hizmetSureDk > m.bas);
        if (molada) continue;

        const saat = `${String(Math.floor(dk / 60)).padStart(2, '0')}:${String(dk % 60).padStart(2, '0')}`;
        const mevcutSayi = slotSayac[saat] || 0;
        if (mevcutSayi < kapasite) {
          musaitSaatler.push(saat);
        }
      }
      return musaitSaatler;
    }

    // ─── SIRALİ (varsayılan) & ESNEK MOD ───
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

    // Aday slotları oluştur
    const adaySet = new Set();

    // 1) Slot aralığına göre temel slotlar
    for (let dk = basDk; dk + hizmetSureDk <= bitisDk; dk += SLOT_ARALIK_DK) {
      adaySet.add(dk);
    }

    // 2) Sıralı modda: randevu bitişlerinden sonra en yakın 10'un katı slot ekle (boşluğu değerlendir)
    if (randevuModu === 'sirali') {
      doluAraliklar.forEach(r => {
        const ilkMusait = Math.ceil(r.bit / 10) * 10;
        if (ilkMusait + hizmetSureDk <= bitisDk) {
          adaySet.add(ilkMusait);
        }
      });
    }

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
  async randevuOlustur({ isletmeId, musteriTelefon, musteriIsim, hizmetId, calisanId, tarih, saat, kaynak }) {
    // ─── AYLIK RANDEVU LİMİT KONTROLÜ ───
    const { paketGetir } = require('../config/paketler');
    const isletmePaket = (await pool.query('SELECT paket FROM isletmeler WHERE id=$1', [isletmeId])).rows[0];
    const paket = await paketGetir(isletmePaket?.paket);
    if (paket.aylik_randevu_limit < 99999) {
      const buAyBasi = new Date(); buAyBasi.setDate(1);
      const buAyBasiStr = buAyBasi.toLocaleDateString('sv-SE', { timeZone: 'Europe/Istanbul' });
      const aylikSayi = (await pool.query(
        'SELECT COUNT(*) as sayi FROM randevular WHERE isletme_id=$1 AND tarih >= $2',
        [isletmeId, buAyBasiStr]
      )).rows[0];
      if (parseInt(aylikSayi.sayi) >= paket.aylik_randevu_limit) {
        const err = new Error(`Aylık randevu limitine ulaşıldı (${paket.aylik_randevu_limit}/${paket.isim}). Paketinizi yükseltin.`);
        err.code = 'LIMIT_ASIMI';
        err.statusCode = 403;
        throw err;
      }
    }

    // Müşteriyi bul veya oluştur
    let musteri = (await pool.query('SELECT * FROM musteriler WHERE telefon = $1', [musteriTelefon])).rows[0];
    let musteriYeni = false;

    if (!musteri) {
      musteri = (await pool.query(
        'INSERT INTO musteriler (telefon, isim) VALUES ($1, $2) RETURNING *',
        [musteriTelefon, musteriIsim || 'Bilinmiyor']
      )).rows[0];
      musteriYeni = true;
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
      `INSERT INTO randevular (isletme_id, calisan_id, musteri_id, hizmet_id, tarih, saat, bitis_saati, durum, kapora_durumu, kapora_tutari, kaynak)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING *`,
      [isletmeId, calisanId, musteri.id, hizmetId, tarih, saat, bitisSaat,
       durum, kaporaDurumu, kapora.tutar, kaynak || 'bot']
    )).rows[0];

    // Win-back kurtarma takibi
    try { const winback = require('./winback'); await winback.kurtarmaKontrol(isletmeId, musteri.id); } catch (e) { /* skip */ }

    // ─── CANLI YAYIN (Socket.IO) ───
    try {
      if (musteriYeni) {
        socketServer.emitToIsletme(isletmeId, 'musteri:yeni', { musteri });
      }
      socketServer.emitToIsletme(isletmeId, 'randevu:yeni', {
        randevu,
        musteri: { id: musteri.id, isim: musteri.isim, telefon: musteri.telefon },
        hizmet: hizmet ? { id: hizmet.id, isim: hizmet.isim, sure_dk: hizmet.sure_dk, fiyat: hizmet.fiyat } : null,
        kaynak: kaynak || 'bot'
      });
    } catch (e) { /* socket hatası randevu oluşturmayı engellemesin */ }

    // ─── WEB PUSH (ekran kapalı olsa bile bildirim) ───
    try {
      const saatStr = String(saat).slice(0, 5);
      const tarihFmt = String(tarih).slice(0, 10);
      pushService.sendToIsletme(isletmeId, {
        title: '🎉 Yeni Randevu',
        body: `${musteri.isim || 'Müşteri'} — ${hizmet?.isim || 'Randevu'} • ${tarihFmt} ${saatStr}`,
        url: '/',
        tag: `randevu-${randevu.id}`,
        // Dükkan tableti için: bildirim kullanıcı kapatana kadar görünür kalsın (kaçırılmasın)
        requireInteraction: true,
        vibrate: [300, 100, 300, 100, 300],
        data: { randevuId: randevu.id, sayfa: 'randevular' }
      });
    } catch (e) {}

    return { randevu, musteri, hizmet, kapora, manuelOnay };
  }

  // Randevu iptal et
  async randevuIptal(randevuId) {
    const result = await pool.query(
      `UPDATE randevular SET durum = 'iptal' WHERE id = $1 RETURNING *`,
      [randevuId]
    );
    // Canlı güncelleme
    try {
      if (result.rows[0]) {
        socketServer.emitToIsletme(result.rows[0].isletme_id, 'randevu:guncellendi', {
          randevu: result.rows[0],
          eski_durum: null,
          yeni_durum: 'iptal'
        });
      }
    } catch (e) {}
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
  // saat parametresi: seans modunda belirli bir saat için boş çalışanı bul
  async enBosCalisan(isletmeId, tarih, hizmetId, saat = null) {
    const calisanlar = await this.uygunCalisanlar(isletmeId, hizmetId);
    if (calisanlar.length === 0) return null;
    if (calisanlar.length === 1) return calisanlar[0];

    // Seans modunda belirli saat için: o saatte henüz randevusu olmayan çalışanı bul
    if (saat) {
      const mevcutAtamalar = (await pool.query(
        "SELECT calisan_id FROM randevular WHERE isletme_id=$1 AND tarih=$2 AND saat=$3 AND durum NOT IN ('iptal','gelmedi')",
        [isletmeId, tarih, saat]
      )).rows.map(r => r.calisan_id);

      for (const calisan of calisanlar) {
        if (!mevcutAtamalar.includes(calisan.id)) return calisan;
      }
    }

    // Normal mod: en çok müsait slotu olan çalışan
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
