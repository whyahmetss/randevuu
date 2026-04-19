const pool = require('../config/db');
const { bugunTarih, simdiSaat } = require('../utils/tarih');
const socketServer = require('./socketServer');
const pushService = require('./pushService');
const googleCalendar = require('./googleCalendar');

class RandevuService {

  // Müsait saatleri hesapla
  // hizmetId: tek hizmet (legacy)
  // opts.hizmetIds: çoklu hizmet array [1,4] → toplam süre + max tampon
  // opts.toplamSureDk: manuel override (bot'larda direkt süre geçmek için)
  // calisanId: sadece o çalışanın randevularına bakar
  // Randevu Modları:
  //   sirali: her slot 1 randevu alır, arka arkaya sıralı (varsayılan)
  //   seans: aynı slota birden fazla müşteri alınabilir (çalışan sayısı kadar)
  //   esnek: 10dk aralıklarla tüm boş saatler sunulur
  async musaitSaatleriGetir(isletmeId, tarih, calisanId = null, hizmetId = null, opts = {}) {
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

    // ─── Hizmet süresi ve tampon hesabı ───
    // Öncelik: opts.toplamSureDk > opts.hizmetIds (çoklu) > hizmetId (tek) > işletme varsayılanı
    let hizmetSureDk = isletme.randevu_suresi_dk || 30;
    let hizmetTamponDk = 0;
    const hizmetIdListesi = Array.isArray(opts.hizmetIds) && opts.hizmetIds.length > 0
      ? opts.hizmetIds.map(x => parseInt(x)).filter(Boolean)
      : (hizmetId ? [parseInt(hizmetId)] : []);

    if (typeof opts.toplamSureDk === 'number' && opts.toplamSureDk > 0) {
      hizmetSureDk = opts.toplamSureDk;
    } else if (hizmetIdListesi.length > 0) {
      // Birden fazla hizmet → toplam süre + en büyük tampon
      const hz = await pool.query(
        'SELECT sure_dk, tampon_dk FROM hizmetler WHERE id = ANY($1::int[])',
        [hizmetIdListesi]
      );
      if (hz.rows.length > 0) {
        hizmetSureDk = hz.rows.reduce((t, r) => t + (r.sure_dk || 0), 0) || hizmetSureDk;
        hizmetTamponDk = Math.max(...hz.rows.map(r => r.tampon_dk || 0), 0);
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

    // 📅 Google Calendar freebusy — bağlı ise o günün meşgul aralıklarını da blokla
    let googleBusy = [];
    try {
      googleBusy = await googleCalendar.freebusyAraliklari(isletmeId, tarih);
    } catch (e) { /* google bağlı değil veya hata — yoksay */ }

    const googleCakisma = (dk) => {
      if (!googleBusy.length) return false;
      return googleBusy.some(r => (dk < r.bit && dk + hizmetSureDk > r.bas));
    };

    for (const dk of adaylar) {
      // Bugünse ve geçmişse atla
      if (tarih === bugun && dk <= simdiDk + 30) continue;

      if (!cakismaVar(dk) && !googleCakisma(dk)) {
        const saat = `${String(Math.floor(dk / 60)).padStart(2, '0')}:${String(dk % 60).padStart(2, '0')}`;
        musaitSaatler.push(saat);
      }
    }

    return musaitSaatler;
  }

  // Kapora hesapla — işletme alt sınırı + oran kontrolü
  // İkinci parametre hizmetId (legacy) VEYA hizmetIds array olabilir
  async kaporaHesapla(isletmeId, hizmetIdOrIds) {
    const isletme = (await pool.query('SELECT kapora_aktif, kapora_alt_siniri, kapora_orani FROM isletmeler WHERE id=$1', [isletmeId])).rows[0];
    if (!isletme || !isletme.kapora_aktif) return { gerekli: false, tutar: 0, yuzde: 0 };

    const hizmetIds = Array.isArray(hizmetIdOrIds)
      ? hizmetIdOrIds.map(x => parseInt(x)).filter(Boolean)
      : (hizmetIdOrIds ? [parseInt(hizmetIdOrIds)] : []);
    if (hizmetIds.length === 0) return { gerekli: false, tutar: 0, yuzde: 0 };

    const hizmetler = (await pool.query(
      'SELECT fiyat, kapora_yuzdesi FROM hizmetler WHERE id = ANY($1::int[])',
      [hizmetIds]
    )).rows;
    if (hizmetler.length === 0) return { gerekli: false, tutar: 0, yuzde: 0 };

    const toplamFiyat = hizmetler.reduce((t, h) => t + (parseFloat(h.fiyat) || 0), 0);
    if (toplamFiyat <= 0) return { gerekli: false, tutar: 0, yuzde: 0 };

    const altSinir = parseFloat(isletme.kapora_alt_siniri) || 0;
    if (toplamFiyat < altSinir) return { gerekli: false, tutar: 0, yuzde: 0 };

    // Çoklu hizmette: her hizmetin kendi kapora yüzdesi → ağırlıklı ortalama
    // Yüzdesi olmayan hizmetler işletme genel oranını kullanır
    const genelYuzde = parseFloat(isletme.kapora_orani) || 20;
    let toplamKapora = 0;
    for (const h of hizmetler) {
      const fiyat = parseFloat(h.fiyat) || 0;
      const yuzde = (h.kapora_yuzdesi && h.kapora_yuzdesi > 0) ? parseFloat(h.kapora_yuzdesi) : genelYuzde;
      toplamKapora += Math.ceil(fiyat * yuzde / 100);
    }

    if (toplamKapora <= 0) return { gerekli: false, tutar: 0, yuzde: 0 };

    // Efektif yüzde (bilgi amaçlı): toplam kapora / toplam fiyat
    const efektifYuzde = Math.round((toplamKapora / toplamFiyat) * 100);
    return { gerekli: true, tutar: toplamKapora, yuzde: efektifYuzde };
  }

  // Hizmete uygun çalışanları getir (calisan_hizmetler tablosundan)
  // hizmetIdOrIds: tek hizmet (legacy) VEYA hizmet array (intersection — tümünü yapabilen)
  async uygunCalisanlar(isletmeId, hizmetIdOrIds = null) {
    const hizmetIds = Array.isArray(hizmetIdOrIds)
      ? hizmetIdOrIds.map(x => parseInt(x)).filter(Boolean)
      : (hizmetIdOrIds ? [parseInt(hizmetIdOrIds)] : []);

    // Eşleştirme sistemi aktif mi?
    const eslesme = (await pool.query(
      'SELECT COUNT(*) as sayi FROM calisan_hizmetler ch JOIN calisanlar c ON c.id=ch.calisan_id WHERE c.isletme_id=$1',
      [isletmeId]
    )).rows[0];
    const eslesmeAktif = parseInt(eslesme.sayi) > 0;

    if (hizmetIds.length === 0 || !eslesmeAktif) {
      // Hizmet filtresi yok VEYA eşleştirme kurulmamış → tüm aktif çalışanlar
      return (await pool.query(
        'SELECT c.* FROM calisanlar c WHERE c.isletme_id=$1 AND (c.aktif IS NULL OR c.aktif=true) ORDER BY c.id',
        [isletmeId]
      )).rows;
    }

    // Intersection: SEÇİLEN TÜM HİZMETLERİ yapabilen çalışanlar
    // GROUP BY + HAVING COUNT = seçili hizmet sayısı
    const q = `
      SELECT c.* FROM calisanlar c
      JOIN calisan_hizmetler ch ON ch.calisan_id = c.id
      WHERE c.isletme_id = $1
        AND (c.aktif IS NULL OR c.aktif = true)
        AND ch.hizmet_id = ANY($2::int[])
      GROUP BY c.id
      HAVING COUNT(DISTINCT ch.hizmet_id) = $3
      ORDER BY c.id
    `;
    return (await pool.query(q, [isletmeId, hizmetIds, hizmetIds.length])).rows;
  }

  // Randevu oluştur — çoklu hizmet destekli (tek transaction, atomik)
  // hizmetId (legacy tek) VEYA hizmetIds (array) kabul edilir
  async randevuOlustur({ isletmeId, musteriTelefon, musteriIsim, hizmetId, hizmetIds, calisanId, tarih, saat, kaynak }) {
    // Hizmet ID listesini normalize et (legacy + multi)
    const hizmetIdListesi = Array.isArray(hizmetIds) && hizmetIds.length > 0
      ? hizmetIds.map(x => parseInt(x)).filter(Boolean)
      : (hizmetId ? [parseInt(hizmetId)] : []);

    if (hizmetIdListesi.length === 0) {
      const err = new Error('En az bir hizmet seçilmelidir');
      err.code = 'HIZMET_GEREKLI';
      throw err;
    }
    if (hizmetIdListesi.length > 6) {
      const err = new Error('En fazla 6 hizmet aynı anda seçilebilir');
      err.code = 'HIZMET_LIMIT';
      throw err;
    }
    // Aynı hizmet birden fazla girilmişse dedup
    const hizmetIdsUnique = [...new Set(hizmetIdListesi)];

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

    // Hizmetleri toplu çek (sıra korunsun — kullanıcının gönderdiği sıra)
    const hizmetlerRaw = (await pool.query(
      'SELECT * FROM hizmetler WHERE id = ANY($1::int[])',
      [hizmetIdsUnique]
    )).rows;
    const hizmetMap = new Map(hizmetlerRaw.map(h => [h.id, h]));
    const hizmetler = hizmetIdsUnique.map(id => hizmetMap.get(id)).filter(Boolean);

    if (hizmetler.length !== hizmetIdsUnique.length) {
      const err = new Error('Seçilen hizmetlerden biri bulunamadı');
      err.code = 'HIZMET_BULUNAMADI';
      throw err;
    }

    // Toplam süre + toplam fiyat
    const toplamSureDk = hizmetler.reduce((t, h) => t + (h.sure_dk || 0), 0);
    const toplamFiyat = hizmetler.reduce((t, h) => t + (parseFloat(h.fiyat) || 0), 0);

    const [saatH, saatM] = saat.split(':').map(Number);
    const bitisDk = saatH * 60 + saatM + toplamSureDk;
    const bitisSaat = `${String(Math.floor(bitisDk / 60)).padStart(2, '0')}:${String(bitisDk % 60).padStart(2, '0')}`;

    // Kapora kontrolü (toplam)
    const kapora = await this.kaporaHesapla(isletmeId, hizmetIdsUnique);

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

    // İlk hizmet = legacy `hizmet_id` sütunu (backward compat için)
    const anaHizmetId = hizmetIdsUnique[0];
    const anaHizmet = hizmetler[0];

    // ─── TRANSACTION: randevu + junction atomik ───
    const client = await pool.connect();
    let randevu;
    try {
      await client.query('BEGIN');
      randevu = (await client.query(
        `INSERT INTO randevular (isletme_id, calisan_id, musteri_id, hizmet_id, tarih, saat, bitis_saati, durum, kapora_durumu, kapora_tutari, kaynak)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING *`,
        [isletmeId, calisanId, musteri.id, anaHizmetId, tarih, saat, bitisSaat,
         durum, kaporaDurumu, kapora.tutar, kaynak || 'bot']
      )).rows[0];

      // Junction tabloya tüm hizmetleri kaydet (sira korunur)
      for (let i = 0; i < hizmetler.length; i++) {
        const h = hizmetler[i];
        await client.query(
          `INSERT INTO randevu_hizmetleri (randevu_id, hizmet_id, sira, fiyat, sure_dk)
           VALUES ($1, $2, $3, $4, $5)`,
          [randevu.id, h.id, i, h.fiyat, h.sure_dk]
        );
      }

      await client.query('COMMIT');
    } catch (txErr) {
      await client.query('ROLLBACK').catch(() => {});
      throw txErr;
    } finally {
      client.release();
    }

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
        hizmet: anaHizmet ? { id: anaHizmet.id, isim: anaHizmet.isim, sure_dk: toplamSureDk, fiyat: toplamFiyat } : null,
        hizmetler: hizmetler.map(h => ({ id: h.id, isim: h.isim, sure_dk: h.sure_dk, fiyat: h.fiyat })),
        kaynak: kaynak || 'bot'
      });
    } catch (e) { /* socket hatası randevu oluşturmayı engellemesin */ }

    // ─── WEB PUSH (ekran kapalı olsa bile bildirim) ───
    try {
      const saatStr = String(saat).slice(0, 5);
      const tarihFmt = String(tarih).slice(0, 10);
      const hizmetBasligi = hizmetler.length === 1
        ? hizmetler[0].isim
        : `${hizmetler[0].isim} + ${hizmetler.length - 1} hizmet daha`;
      pushService.sendToIsletme(isletmeId, {
        title: '🎉 Yeni Randevu',
        body: `${musteri.isim || 'Müşteri'} — ${hizmetBasligi} • ${tarihFmt} ${saatStr}`,
        url: '/',
        tag: `randevu-${randevu.id}`,
        requireInteraction: true,
        vibrate: [300, 100, 300, 100, 300],
        data: { randevuId: randevu.id, sayfa: 'randevular' }
      });
    } catch (e) {}

    // ─── 📅 GOOGLE CALENDAR SYNC (fire-and-forget) ───
    try {
      googleCalendar.freebusyCacheTemizle(isletmeId);
      if (durum === 'onaylandi' || durum === 'onay_bekliyor') {
        googleCalendar.randevuEventOlustur(isletmeId, randevu).catch(() => {});
      }
    } catch (e) { /* ignore */ }

    // Döndürülen hizmet: birleştirilmiş ana hizmet (legacy uyumlu) + tam liste
    const birlesikHizmet = anaHizmet ? {
      id: anaHizmet.id,
      isim: hizmetler.length === 1 ? anaHizmet.isim : `${anaHizmet.isim} + ${hizmetler.length - 1} hizmet`,
      isim_en: anaHizmet.isim_en,
      isim_ar: anaHizmet.isim_ar,
      sure_dk: toplamSureDk,
      fiyat: toplamFiyat
    } : null;

    return { randevu, musteri, hizmet: birlesikHizmet, hizmetler, kapora, manuelOnay };
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

    // 📅 Google Calendar — event sil (fire-and-forget)
    try {
      if (result.rows[0]) {
        googleCalendar.freebusyCacheTemizle(result.rows[0].isletme_id);
        googleCalendar.randevuEventSil(result.rows[0].isletme_id, randevuId).catch(() => {});
      }
    } catch (e) {}

    return result.rows[0];
  }

  // Müşterinin aktif randevularını getir (junction'dan çoklu hizmet dahil)
  async musteriRandevulari(musteriTelefon, isletmeId) {
    const result = await pool.query(`
      SELECT r.*,
             h.isim as hizmet_isim, h.fiyat,
             i.isim as isletme_isim, i.adres,
             (SELECT COALESCE(STRING_AGG(hh.isim, ', ' ORDER BY rh.sira), h.isim)
                FROM randevu_hizmetleri rh
                LEFT JOIN hizmetler hh ON hh.id = rh.hizmet_id
                WHERE rh.randevu_id = r.id) as hizmetler_isim,
             (SELECT COALESCE(SUM(rh.fiyat), h.fiyat)
                FROM randevu_hizmetleri rh
                WHERE rh.randevu_id = r.id) as toplam_fiyat,
             (SELECT COALESCE(SUM(rh.sure_dk), h.sure_dk)
                FROM randevu_hizmetleri rh
                WHERE rh.randevu_id = r.id) as toplam_sure_dk
      FROM randevular r
      LEFT JOIN hizmetler h ON r.hizmet_id = h.id
      JOIN isletmeler i ON r.isletme_id = i.id
      JOIN musteriler m ON r.musteri_id = m.id
      WHERE m.telefon = $1 AND r.isletme_id = $2 AND r.durum = 'onaylandi' AND r.tarih >= CURRENT_DATE
      ORDER BY r.tarih, r.saat
    `, [musteriTelefon, isletmeId]);
    return result.rows;
  }

  // Randevunun tüm hizmetlerini junction'dan getir (fallback: randevular.hizmet_id)
  async randevuHizmetleri(randevuId) {
    const rows = (await pool.query(`
      SELECT rh.hizmet_id, rh.sira, rh.fiyat, rh.sure_dk,
             h.isim, h.isim_en, h.isim_ar
      FROM randevu_hizmetleri rh
      LEFT JOIN hizmetler h ON h.id = rh.hizmet_id
      WHERE rh.randevu_id = $1
      ORDER BY rh.sira, rh.id
    `, [randevuId])).rows;
    if (rows.length > 0) return rows;

    // Junction boşsa (çok eski kayıt) randevudaki tek hizmete düş
    const legacy = (await pool.query(`
      SELECT r.hizmet_id, 0 as sira, h.fiyat, h.sure_dk, h.isim, h.isim_en, h.isim_ar
      FROM randevular r LEFT JOIN hizmetler h ON h.id = r.hizmet_id
      WHERE r.id = $1
    `, [randevuId])).rows;
    return legacy.filter(r => r.hizmet_id);
  }

  // Birleşik hizmet başlığı (tek/çoklu uyumlu, 3 dil)
  hizmetBasligi(hizmetler, dil = 'tr') {
    if (!hizmetler || hizmetler.length === 0) return '';
    const alan = dil === 'en' ? 'isim_en' : dil === 'ar' ? 'isim_ar' : 'isim';
    const adlar = hizmetler.map(h => h[alan] || h.isim).filter(Boolean);
    if (adlar.length === 1) return adlar[0];
    return adlar.join(' + ');
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

  // No-show kaydet → kara listeye basamaklı ceza + WA uyarı mesajı
  async noShowKaydet(isletmeId, musteriTelefon) {
    try {
      const isletme = (await pool.query(
        'SELECT isim, kara_liste_otomatik, kara_liste_ihlal_sinir FROM isletmeler WHERE id=$1',
        [isletmeId]
      )).rows[0];
      if (!isletme || !isletme.kara_liste_otomatik) return;

      const esikSayi = isletme.kara_liste_ihlal_sinir || 3;

      // Basamaklı ceza: 1. uyarı, 2. 7gün bloke, 3+. kalıcı
      // bloke_bitis: 7 gün bloke için NOW()+7day; kalıcı için NULL ama aktif=true
      const sonuc = (await pool.query(`
        INSERT INTO kara_liste (isletme_id, telefon, sebep, ihlal_sayisi, aktif, ilk_ihlal_zamani, son_ihlal_zamani)
        VALUES ($1, $2, 'no_show', 1, false, NOW(), NOW())
        ON CONFLICT (isletme_id, telefon) DO UPDATE SET
          ihlal_sayisi = kara_liste.ihlal_sayisi + 1,
          son_ihlal_zamani = NOW(),
          aktif = CASE WHEN kara_liste.ihlal_sayisi + 1 >= $3 THEN true ELSE kara_liste.aktif END,
          bloke_bitis = CASE 
            WHEN kara_liste.ihlal_sayisi + 1 = 2 THEN NOW() + INTERVAL '7 days'
            WHEN kara_liste.ihlal_sayisi + 1 >= $3 THEN NULL
            ELSE kara_liste.bloke_bitis
          END
        RETURNING ihlal_sayisi, aktif, bloke_bitis
      `, [isletmeId, musteriTelefon, esikSayi])).rows[0];

      // Basamaklı uyarı WA mesajı
      try {
        const whatsappWeb = require('./whatsappWeb');
        const durum = whatsappWeb.getDurum(isletmeId);
        if (durum?.durum === 'bagli') {
          let jidTel = String(musteriTelefon).replace(/[^\d]/g, '');
          if (jidTel.startsWith('0')) jidTel = '90' + jidTel.substring(1);
          if (!jidTel.startsWith('90') && jidTel.length === 10) jidTel = '90' + jidTel;
          const jid = `${jidTel}@s.whatsapp.net`;
          let mesaj = null;
          if (sonuc.ihlal_sayisi === 1) {
            mesaj = `😔 *${isletme.isim}*\n\nBugünkü randevunuza gelmediğinizi fark ettik. Umarız iyi bir sebebiniz vardır. 🙏\n\n_Bu bir nazik hatırlatmadır, bir sonraki randevunuza gelmeyi lütfen ihmal etmeyin._`;
          } else if (sonuc.ihlal_sayisi === 2) {
            mesaj = `⚠️ *${isletme.isim}*\n\nMaalesef 2. kez randevunuza gelmediniz. Bu nedenle *7 gün boyunca yeni randevu alamayacaksınız*.\n\nBu süreden sonra tekrar görüşmek dileğiyle 🙏`;
          } else if (sonuc.ihlal_sayisi >= esikSayi) {
            mesaj = `🛑 *${isletme.isim}*\n\nMaalesef randevu sisteminde kalıcı olarak engellendiniz. Tekrar randevu almak için işletme ile doğrudan iletişime geçmeniz gerekecek.`;
          }
          if (mesaj) {
            await whatsappWeb.mesajGonder(isletmeId, jid, mesaj);
          }
        }
      } catch (waErr) { /* WA bağlı değilse sessiz geç */ }

      console.log(`⚖️ No-show ceza: ${musteriTelefon} → ${sonuc.ihlal_sayisi}. ihlal ${sonuc.aktif ? '(kalıcı bloke)' : sonuc.bloke_bitis ? '(7 gün bloke)' : '(uyarı)'}`);
    } catch (e) {
      console.error('No-show kara liste hatası:', e.message);
    }
  }

  // Randevu tamamlandı → güven skoru + sayaç
  async randevuTamamlandi(randevuId) {
    try {
      const r = (await pool.query(
        `SELECT r.*, m.telefon FROM randevular r JOIN musteriler m ON m.id=r.musteri_id WHERE r.id=$1`,
        [randevuId]
      )).rows[0];
      if (!r) return;
      await pool.query(`UPDATE randevular SET durum='tamamlandi' WHERE id=$1`, [randevuId]);
      try {
        const guvenlikSkor = require('./guvenlikSkor');
        await guvenlikSkor.logla(r.telefon, 'randevu_geldi', r.isletme_id, `randevuId=${randevuId}`);
      } catch {}
    } catch (e) {
      console.error('randevuTamamlandi hatası:', e.message);
    }
  }
}

module.exports = new RandevuService();
