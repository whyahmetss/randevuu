const pool = require('../config/db');
const TR_ILCELER = require('../data/tr_ilceler.json');
const { sinonimleriGetir } = require('../data/kategori_sinonimleri');
const { BOLGELER, toplamIlceSayisi } = require('../data/tarama_presetleri');
const socketServer = require('./socketServer');

// Google Places API ile işletme arama
class AvciBot {
  constructor() {
    // Arka planda koşan taramaların progress durumları (tarama_id → { ... })
    this.taramaDurumlari = new Map();
    // Aktif job worker'ları (jobId → { iptal: bool })
    this.aktifJoblar = new Map();
    // Canlı sayaç throttle (jobId → lastEmit)
    this._jobEmitThrottle = new Map();
  }

  // Şehir adını normalize et ve ilçelerini getir (static JSON'dan)
  _ilceleriGetir(sehir) {
    if (!sehir) return [];
    const key = String(sehir).toLowerCase().trim()
      .replace('i̇', 'i'); // Türkçe "İ" lowercase edge case
    // Direkt match
    if (TR_ILCELER[key]) return TR_ILCELER[key];
    // Edge case: "İstanbul" → "istanbul"
    const normalize = (s) => s.toLocaleLowerCase('tr').replace(/\s+/g, ' ').trim();
    const nKey = normalize(sehir);
    for (const il of Object.keys(TR_ILCELER)) {
      if (normalize(il) === nKey) return TR_ILCELER[il];
    }
    return [];
  }

  // Türkçe lowercase + whitespace normalize
  _trLower(s) {
    return String(s || '').toLocaleLowerCase('tr').replace(/\s+/g, ' ').trim();
  }

  // Bir kelimeyi capitalize et (ilk harf büyük) — "çankaya" → "Çankaya"
  _capitalize(s) {
    if (!s) return s;
    return s.charAt(0).toLocaleUpperCase('tr') + s.slice(1);
  }

  // 🎯 AKILLI İLÇE TESPİT: Adres metninden bilinen ilçeyi match et.
  // Öncelik: verilen `hintIlce` → o şehrin bilinen ilçelerinde ara → diğer tüm ilçelerde ara.
  // Cadde/sokak adını asla ilçe olarak döndürmez.
  _ilceTespitEt(adres, sehir, hintIlce = null) {
    if (!adres && !hintIlce) return null;
    const adresN = this._trLower(adres);

    // 1) Hint verildi ve adresin içinde geçiyorsa en güvenli sonuç
    if (hintIlce) {
      const hintN = this._trLower(hintIlce);
      if (!adres || adresN.includes(hintN)) return this._capitalize(hintN);
    }

    // 2) Şehrin ilçeleri içinde ara — daha uzun eşleşme öncelikli (kelime sınırıyla)
    const wordBoundary = (text, target) => {
      const pat = new RegExp(`(^|[^a-zçğıöşüâî])${target.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^a-zçğıöşüâî]|$)`, 'i');
      return pat.test(text);
    };

    if (adres) {
      const sehirIlceleri = this._ilceleriGetir(sehir) || [];
      const sortedSehir = [...sehirIlceleri].sort((a, b) => b.length - a.length);
      for (const i of sortedSehir) {
        if (wordBoundary(adresN, this._trLower(i))) return this._capitalize(i);
      }

      // 3) Tüm ülke ilçelerinde ara (şehir bilinmiyorsa veya adres başka il'deyse)
      const tumIlceler = [];
      for (const arr of Object.values(TR_ILCELER)) for (const i of arr) tumIlceler.push(i);
      const sorted = [...new Set(tumIlceler)].sort((a, b) => b.length - a.length);
      for (const i of sorted) {
        if (this._trLower(i).length < 4) continue; // çok kısa ilçeleri (ör. "eş") ele
        if (wordBoundary(adresN, this._trLower(i))) return this._capitalize(i);
      }
    }

    return null;
  }

  // TEK SORGU — pagination'lı Text Search + DB insert (max 60 sonuç Google limiti)
  async _tekSorgu({ sehir, ilce, kategori, apiKey }) {
    const aramaMetni = `${kategori} ${ilce ? ilce + ' ' : ''}${sehir}`.trim();

    let tumSonuclar = [];
    let nextPageToken = null;

    do {
      const body = { textQuery: aramaMetni, languageCode: 'tr', maxResultCount: 20 };
      if (nextPageToken) body.pageToken = nextPageToken;

      const response = await fetch('https://places.googleapis.com/v1/places:searchText', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': apiKey,
          'X-Goog-FieldMask': 'places.id,places.displayName,places.formattedAddress,places.nationalPhoneNumber,places.internationalPhoneNumber,places.websiteUri,places.googleMapsUri,places.rating,places.userRatingCount,nextPageToken'
        },
        body: JSON.stringify(body)
      });

      const data = await response.json();

      if (data.error) {
        throw new Error(`Google API hatası: ${data.error.code} - ${data.error.message}`);
      }

      if (data.places) {
        tumSonuclar = tumSonuclar.concat(data.places);
      }

      nextPageToken = data.nextPageToken || null;

      if (nextPageToken) {
        await new Promise(r => setTimeout(r, 2000));
      }
    } while (nextPageToken);

    let yeniEklenen = 0;
    let zatenVar = 0;

    for (const yer of tumSonuclar) {
      try {
        const placeId = yer.id;

        const mevcut = await pool.query(
          'SELECT id FROM potansiyel_musteriler WHERE google_maps_id = $1',
          [placeId]
        );

        if (mevcut.rows.length > 0) {
          zatenVar++;
          continue;
        }

        const telefon = yer.nationalPhoneNumber || yer.internationalPhoneNumber || null;
        const webSitesi = yer.websiteUri || null;
        const mapsUrl = yer.googleMapsUri || null;
        const isletmeAdi = yer.displayName?.text || yer.displayName || 'Bilinmiyor';
        const adres = yer.formattedAddress || null;

        // 🎯 Akıllı ilçe tespiti — adresi TR_ILCELER ile match et, cadde/sokak adı asla geçmez
        const tespit_ilce = this._ilceTespitEt(adres, sehir, ilce);

        const skor = this.skorHesapla({
          puan: yer.rating,
          yorum_sayisi: yer.userRatingCount,
          web_sitesi: webSitesi,
          telefon: telefon
        });

        await pool.query(`
          INSERT INTO potansiyel_musteriler 
          (isletme_adi, telefon, adres, sehir, ilce, kategori, puan, yorum_sayisi, web_sitesi, google_maps_id, google_maps_url, skor)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
          ON CONFLICT (google_maps_id) DO NOTHING
        `, [
          isletmeAdi,
          telefon,
          adres,
          sehir,
          tespit_ilce,
          kategori,
          yer.rating || null,
          yer.userRatingCount || 0,
          webSitesi,
          placeId,
          mapsUrl,
          skor
        ]);

        yeniEklenen++;
      } catch (e) {
        console.log(`⚠️ Kayıt hatası:`, e.message);
      }
    }

    return { toplam_bulunan: tumSonuclar.length, yeni_eklenen: yeniEklenen, zaten_var: zatenVar };
  }

  // ANA TARAMA — Query Fanout: İlçe × Sinonim matrisi ile geniş kapsamlı arama
  async taramaYap(params) {
    const { sehir, ilce, kategori, apiKey, taramaId, hardLimit = 100 } = params;
    if (!apiKey) throw new Error('Google Maps API key gerekli');
    if (!sehir) throw new Error('Şehir gerekli');
    if (!kategori) throw new Error('Kategori gerekli');

    // 1) İlçe listesi: kullanıcı girdiyse tek ilçe, boşsa şehrin tüm ilçeleri
    let ilceler = [];
    if (ilce && ilce.trim()) {
      ilceler = [ilce.trim()];
    } else {
      ilceler = this._ilceleriGetir(sehir);
      if (ilceler.length === 0) {
        // İl bilinmiyor — tek "il merkezi" sorgusu ile devam et
        console.log(`⚠️ "${sehir}" için ilçe listesi bulunamadı, tek sorgu yapılıyor`);
        ilceler = [''];
      }
    }

    // 2) Sinonim listesi
    const sinonimler = sinonimleriGetir(kategori);

    // 3) Toplam sorgu sayısını hesapla, hard limit uygula
    const planlanan = ilceler.length * sinonimler.length;
    if (planlanan > hardLimit) {
      console.log(`⚠️ ${planlanan} sorgu planlandı, hard limit ${hardLimit}'e düşürülüyor. İlçe veya sinonim azaltılıyor.`);
    }
    const toplamSorgu = Math.min(planlanan, hardLimit);

    console.log(`🎯 Query Fanout: ${ilceler.length} ilçe × ${sinonimler.length} sinonim = ${planlanan} planlanan sorgu (limit: ${hardLimit})`);

    // 4) Progress başlat
    const durum = {
      basladi: new Date().toISOString(),
      durum: 'calisiyor',
      sehir, kategori, ilce_girilmis: !!ilce,
      toplam_sorgu: toplamSorgu,
      tamamlanan: 0,
      aktif: '',
      toplam_bulunan: 0,
      yeni_eklenen: 0,
      zaten_var: 0,
      ilce_detay: [],
      iptal: false,
      hata: null
    };
    if (taramaId) this.taramaDurumlari.set(taramaId, durum);
    try { socketServer.emitToAdmin('avci:progress', { tarama_id: taramaId, ...durum }); } catch (e) {}

    let sorguSayaci = 0;

    // 5) Fanout loop: her ilçe × her sinonim
    for (const curIlce of ilceler) {
      if (durum.iptal) break;

      const ilceBas = { ilce: curIlce || 'merkez', yeni: 0, zaten: 0 };

      for (const sinonim of sinonimler) {
        if (durum.iptal) break;
        if (sorguSayaci >= hardLimit) {
          console.log(`🛑 Hard limit (${hardLimit}) aşıldı, tarama durduruluyor`);
          break;
        }

        durum.aktif = `${sinonim} ${curIlce || ''} ${sehir}`.trim();

        try {
          const sonuc = await this._tekSorgu({ sehir, ilce: curIlce, kategori: sinonim, apiKey });
          durum.toplam_bulunan += sonuc.toplam_bulunan;
          durum.yeni_eklenen += sonuc.yeni_eklenen;
          durum.zaten_var += sonuc.zaten_var;
          ilceBas.yeni += sonuc.yeni_eklenen;
          ilceBas.zaten += sonuc.zaten_var;
          console.log(`  ✓ [${sorguSayaci + 1}/${toplamSorgu}] "${durum.aktif}" → ${sonuc.yeni_eklenen} yeni, ${sonuc.zaten_var} var`);
        } catch (e) {
          console.log(`  ✗ [${sorguSayaci + 1}/${toplamSorgu}] "${durum.aktif}" hata:`, e.message);
        }

        sorguSayaci++;
        durum.tamamlanan = sorguSayaci;

        // Her sorgu sonrası canlı progress yayını (süper admin)
        try { socketServer.emitToAdmin('avci:progress', { tarama_id: taramaId, ...durum }); } catch (e) {}

        // Rate limit - sorgular arası kısa bekleme
        await new Promise(r => setTimeout(r, 500));
      }

      durum.ilce_detay.push(ilceBas);
    }

    durum.durum = durum.iptal ? 'iptal' : 'tamamlandi';
    durum.bitti = new Date().toISOString();
    if (taramaId) this.taramaDurumlari.set(taramaId, durum);
    try { socketServer.emitToAdmin('avci:progress', { tarama_id: taramaId, ...durum }); } catch (e) {}

    const sonuc = {
      tarama_id: taramaId,
      toplam_bulunan: durum.toplam_bulunan,
      yeni_eklenen: durum.yeni_eklenen,
      zaten_var: durum.zaten_var,
      tarama_sayisi: durum.tamamlanan,
      ilce_sayisi: ilceler.length,
      sinonim_sayisi: sinonimler.length,
      hard_limit: hardLimit,
      iptal: durum.iptal,
      arama_metni: `${kategori} ${ilce || ''} ${sehir}`.trim(),
      ilce_detay: durum.ilce_detay
    };

    console.log(`✅ Fanout tamamlandı: ${sorguSayaci} sorgu, ${durum.yeni_eklenen} yeni, ${durum.zaten_var} zaten vardı`);

    // Durumu 10 dakika sonra temizle (memory koruması)
    if (taramaId) {
      setTimeout(() => this.taramaDurumlari.delete(taramaId), 10 * 60 * 1000);
    }

    return sonuc;
  }

  // Progress polling için
  getTaramaDurumu(taramaId) {
    return this.taramaDurumlari.get(taramaId) || null;
  }

  // Taramayı iptal et
  taramayiIptalEt(taramaId) {
    const d = this.taramaDurumlari.get(taramaId);
    if (d) {
      d.iptal = true;
      return true;
    }
    return false;
  }

  // Toplu tarama - birden fazla kategori için fanout (her kategori kendi içinde ilçe × sinonim yapar)
  async topluTarama({ sehir, kategoriler, apiKey, taramaId, hardLimitPerKategori = 60 }) {
    const toplamSonuc = { toplam_bulunan: 0, yeni_eklenen: 0, zaten_var: 0, tarama_sayisi: 0, detay: [] };

    for (const kategori of kategoriler) {
      try {
        // Her kategori için fanout tarama çağır (ilçe boş → tüm ilçeler)
        const sonuc = await this.taramaYap({
          sehir, ilce: '', kategori, apiKey,
          taramaId, // aynı taramaId ile progress akışı birleşik
          hardLimit: hardLimitPerKategori
        });
        toplamSonuc.toplam_bulunan += sonuc.toplam_bulunan;
        toplamSonuc.yeni_eklenen += sonuc.yeni_eklenen;
        toplamSonuc.zaten_var += sonuc.zaten_var;
        toplamSonuc.tarama_sayisi += sonuc.tarama_sayisi;
        toplamSonuc.detay.push({ kategori, ...sonuc });
      } catch (e) {
        console.log(`⚠️ Toplu tarama hatası (${kategori}):`, e.message);
      }
    }

    console.log(`✅ Toplu tarama bitti: ${toplamSonuc.tarama_sayisi} sorgu, ${toplamSonuc.yeni_eklenen} yeni lead`);
    return toplamSonuc;
  }

  // ═══════════════════════════════════════════════════════════════════
  // 🚀 JOB TABANLI TOPLU TARAMA — "Manyak Mod" Paralel Motor
  // ═══════════════════════════════════════════════════════════════════

  _jobId() {
    return 'tr_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
  }

  _jobEmit(jobId, data, force = false) {
    try {
      const now = Date.now();
      const last = this._jobEmitThrottle.get(jobId) || 0;
      if (!force && now - last < 1000) return; // 1sn throttle
      this._jobEmitThrottle.set(jobId, now);
      socketServer.emitToAdmin('avci:job', { job_id: jobId, ...data });
    } catch (e) {}
  }

  // Job oluştur, DB'ye kaydet, arka planda başlat
  async jobBaslat({ sehirler, kategoriler, preset = null, paralel = 5, hardLimit = 60, baslik = null }) {
    const apiKey = process.env.GOOGLE_MAPS_API_KEY;
    if (!apiKey) throw new Error('GOOGLE_MAPS_API_KEY env değişkeni tanımlı değil');
    if (!Array.isArray(sehirler) || !sehirler.length) throw new Error('En az 1 şehir gerekli');
    if (!Array.isArray(kategoriler) || !kategoriler.length) throw new Error('En az 1 kategori gerekli');

    const jobId = this._jobId();
    const ayarlar = { paralel, hard_limit: hardLimit };
    const finalBaslik = baslik || `${sehirler.length} il × ${kategoriler.length} kategori`;

    // Tahmini toplam sorgu: her (sehir, kategori) için hardLimit kadar sorgu (tipik kullanım)
    const tahminiToplam = sehirler.length * kategoriler.length * hardLimit;

    // Ana job kaydı
    await pool.query(
      `INSERT INTO avci_tarama_joblari (job_id, baslik, durum, sehirler, kategoriler, toplam_sorgu, preset, ayarlar)
       VALUES ($1, $2, 'bekliyor', $3, $4, $5, $6, $7)`,
      [jobId, finalBaslik, sehirler, kategoriler, tahminiToplam, preset, JSON.stringify(ayarlar)]
    );

    // Detay kayıtları (her sehir × kategori için)
    const detayValues = [];
    const detayParams = [];
    let idx = 1;
    for (const sehir of sehirler) {
      for (const kategori of kategoriler) {
        detayValues.push(`($${idx++}, $${idx++}, $${idx++}, 'bekliyor')`);
        detayParams.push(jobId, sehir, kategori);
      }
    }
    if (detayValues.length) {
      await pool.query(
        `INSERT INTO avci_tarama_detay (job_id, sehir, kategori, durum) VALUES ${detayValues.join(', ')}
         ON CONFLICT (job_id, sehir, kategori) DO NOTHING`,
        detayParams
      );
    }

    // Arka planda worker başlat (await etme!)
    this._jobWorker(jobId).catch(e => {
      console.error(`❌ Job worker hatası (${jobId}):`, e.message);
      pool.query(
        `UPDATE avci_tarama_joblari SET durum='hata', hata_mesaji=$1, bitis_tarihi=NOW() WHERE job_id=$2`,
        [e.message, jobId]
      ).catch(() => {});
    });

    return { job_id: jobId, baslik: finalBaslik, toplam_detay: detayValues.length, tahmini_sorgu: tahminiToplam };
  }

  // Ana worker — pending detayları paralel çalıştırır
  async _jobWorker(jobId) {
    const apiKey = process.env.GOOGLE_MAPS_API_KEY;
    if (!apiKey) throw new Error('GOOGLE_MAPS_API_KEY yok');

    // Job bilgilerini al
    const jobRes = await pool.query(
      `SELECT * FROM avci_tarama_joblari WHERE job_id=$1`, [jobId]
    );
    if (!jobRes.rows.length) throw new Error('Job bulunamadı');
    const job = jobRes.rows[0];
    const ayarlar = typeof job.ayarlar === 'string' ? JSON.parse(job.ayarlar) : (job.ayarlar || {});
    const paralel = ayarlar.paralel || 5;
    const hardLimit = ayarlar.hard_limit || 60;

    // İptal bayrağı
    this.aktifJoblar.set(jobId, { iptal: false });

    // Durum: calisiyor
    await pool.query(
      `UPDATE avci_tarama_joblari SET durum='calisiyor', son_guncelleme=NOW() WHERE job_id=$1`, [jobId]
    );
    this._jobEmit(jobId, { durum: 'calisiyor', baslik: job.baslik }, true);

    console.log(`🚀 [Job ${jobId}] başladı: ${job.sehirler.length} il × ${job.kategoriler.length} kategori, paralel=${paralel}, hardLimit=${hardLimit}`);

    // Pending detayları al
    const pendingRes = await pool.query(
      `SELECT sehir, kategori FROM avci_tarama_detay WHERE job_id=$1 AND durum IN ('bekliyor', 'calisiyor') ORDER BY id`,
      [jobId]
    );
    const pendings = pendingRes.rows;

    // Paralel havuz — aynı anda `paralel` sayıda detay çalışır
    let index = 0;
    const isler = [];
    const worker = async () => {
      while (index < pendings.length) {
        const ctrl = this.aktifJoblar.get(jobId);
        if (ctrl?.iptal) return;
        const my = pendings[index++];
        try {
          await this._detayTara(jobId, my.sehir, my.kategori, apiKey, hardLimit);
        } catch (e) {
          console.error(`❌ [${jobId}] ${my.sehir}×${my.kategori} hata:`, e.message);
          await pool.query(
            `UPDATE avci_tarama_detay SET durum='hata', hata_mesaji=$1, bitis=NOW() WHERE job_id=$2 AND sehir=$3 AND kategori=$4`,
            [e.message, jobId, my.sehir, my.kategori]
          ).catch(() => {});
          await pool.query(`UPDATE avci_tarama_joblari SET hatali_sorgu = hatali_sorgu + 1 WHERE job_id=$1`, [jobId]).catch(() => {});
        }
      }
    };
    for (let i = 0; i < paralel; i++) isler.push(worker());
    await Promise.all(isler);

    // Final durum
    const ctrl = this.aktifJoblar.get(jobId);
    const finalDurum = ctrl?.iptal ? 'iptal' : 'tamamlandi';
    await pool.query(
      `UPDATE avci_tarama_joblari SET durum=$1, bitis_tarihi=NOW(), son_guncelleme=NOW() WHERE job_id=$2`,
      [finalDurum, jobId]
    );
    const finalJob = await pool.query(`SELECT * FROM avci_tarama_joblari WHERE job_id=$1`, [jobId]);
    this._jobEmit(jobId, { durum: finalDurum, ...finalJob.rows[0] }, true);
    this.aktifJoblar.delete(jobId);

    console.log(`✅ [Job ${jobId}] bitti (${finalDurum}): yeni=${finalJob.rows[0].yeni_eklenen}, zaten_var=${finalJob.rows[0].zaten_var}`);
  }

  // Tek bir (sehir, kategori) için fanout tarama — detay tablosunu canlı günceller
  async _detayTara(jobId, sehir, kategori, apiKey, hardLimit) {
    const ctrl = this.aktifJoblar.get(jobId);
    if (ctrl?.iptal) return;

    // İlçeleri al
    let ilceler = this._ilceleriGetir(sehir);
    if (!ilceler.length) ilceler = ['']; // bilinmiyorsa tek sorgu

    // Sinonimler
    const sinonimler = sinonimleriGetir(kategori);

    // Detay: calisiyor
    await pool.query(
      `UPDATE avci_tarama_detay SET durum='calisiyor', baslangic=NOW() WHERE job_id=$1 AND sehir=$2 AND kategori=$3`,
      [jobId, sehir, kategori]
    );
    this._jobEmit(jobId, { tip: 'detay_basladi', sehir, kategori });

    let sorguSayaci = 0;
    let yeniToplam = 0, zatenToplam = 0, bulundToplam = 0;

    for (const curIlce of ilceler) {
      if (this.aktifJoblar.get(jobId)?.iptal) break;
      if (sorguSayaci >= hardLimit) break;

      for (const sinonim of sinonimler) {
        if (this.aktifJoblar.get(jobId)?.iptal) break;
        if (sorguSayaci >= hardLimit) break;

        try {
          const sonuc = await this._tekSorgu({ sehir, ilce: curIlce, kategori: sinonim, apiKey });
          yeniToplam += sonuc.yeni_eklenen;
          zatenToplam += sonuc.zaten_var;
          bulundToplam += sonuc.toplam_bulunan;
          sorguSayaci++;

          // Detay canlı güncelle
          await pool.query(
            `UPDATE avci_tarama_detay SET tamamlanan_sorgu=$1, yeni_eklenen=$2, zaten_var=$3 WHERE job_id=$4 AND sehir=$5 AND kategori=$6`,
            [sorguSayaci, yeniToplam, zatenToplam, jobId, sehir, kategori]
          );
          // Ana job sayaçları (atomik increment)
          await pool.query(
            `UPDATE avci_tarama_joblari 
             SET tamamlanan_sorgu = tamamlanan_sorgu + 1,
                 basarili_sorgu = basarili_sorgu + 1,
                 yeni_eklenen = yeni_eklenen + $1,
                 zaten_var = zaten_var + $2,
                 toplam_bulunan = toplam_bulunan + $3,
                 son_guncelleme = NOW()
             WHERE job_id = $4`,
            [sonuc.yeni_eklenen, sonuc.zaten_var, sonuc.toplam_bulunan, jobId]
          );

          // Canlı yayın (throttled)
          this._jobEmit(jobId, {
            tip: 'progress',
            sehir, kategori,
            detay_sorgu: sorguSayaci,
            detay_yeni: yeniToplam,
            aktif_sorgu: `${sinonim} ${curIlce || ''} ${sehir}`.trim(),
          });
        } catch (e) {
          console.log(`  ⚠️ [${jobId}] ${sinonim} ${curIlce} ${sehir} sorgu hata:`, e.message);
          await pool.query(`UPDATE avci_tarama_joblari SET hatali_sorgu = hatali_sorgu + 1, tamamlanan_sorgu = tamamlanan_sorgu + 1 WHERE job_id=$1`, [jobId]).catch(() => {});
          sorguSayaci++;
        }

        // Rate limit
        await new Promise(r => setTimeout(r, 300));
      }
    }

    // Detay bitti
    await pool.query(
      `UPDATE avci_tarama_detay SET durum='tamamlandi', bitis=NOW(), tamamlanan_sorgu=$1, yeni_eklenen=$2, zaten_var=$3 WHERE job_id=$4 AND sehir=$5 AND kategori=$6`,
      [sorguSayaci, yeniToplam, zatenToplam, jobId, sehir, kategori]
    );
    this._jobEmit(jobId, { tip: 'detay_bitti', sehir, kategori, yeni: yeniToplam, zaten: zatenToplam }, true);
  }

  // Job iptal
  async jobIptal(jobId) {
    const ctrl = this.aktifJoblar.get(jobId);
    if (ctrl) ctrl.iptal = true;
    await pool.query(`UPDATE avci_tarama_joblari SET durum='iptal', bitis_tarihi=NOW() WHERE job_id=$1 AND durum IN ('bekliyor', 'calisiyor')`, [jobId]);
    return { basarili: true };
  }

  // Job durumu — ana + detaylar
  async jobDurum(jobId) {
    const jobRes = await pool.query(`SELECT * FROM avci_tarama_joblari WHERE job_id=$1`, [jobId]);
    if (!jobRes.rows.length) return null;
    const detayRes = await pool.query(
      `SELECT sehir, kategori, durum, tamamlanan_sorgu, yeni_eklenen, zaten_var, baslangic, bitis, hata_mesaji
       FROM avci_tarama_detay WHERE job_id=$1 ORDER BY id`,
      [jobId]
    );
    return { ...jobRes.rows[0], detaylar: detayRes.rows };
  }

  // Son N job (geçmiş)
  async jobGecmis(limit = 20) {
    const r = await pool.query(
      `SELECT job_id, baslik, durum, sehirler, kategoriler, toplam_sorgu, tamamlanan_sorgu,
              basarili_sorgu, hatali_sorgu, yeni_eklenen, zaten_var,
              baslangic_tarihi, bitis_tarihi, preset
       FROM avci_tarama_joblari
       ORDER BY baslangic_tarihi DESC
       LIMIT $1`,
      [limit]
    );
    return r.rows;
  }

  // Pending job'ları resume et (server restart sonrası)
  async pendingJoblariDevam() {
    try {
      const r = await pool.query(
        `SELECT job_id FROM avci_tarama_joblari WHERE durum IN ('bekliyor', 'calisiyor')`
      );
      for (const row of r.rows) {
        console.log(`🔄 Pending job devam ediyor: ${row.job_id}`);
        this._jobWorker(row.job_id).catch(e => {
          console.error(`❌ Resume hatası (${row.job_id}):`, e.message);
        });
      }
      return r.rows.length;
    } catch (e) {
      console.log('⚠️ Job resume hatası:', e.message);
      return 0;
    }
  }

  // Sosyal medya araması - SerpAPI ile Instagram/Facebook/TikTok profilleri bul
  async sosyalMedyaTarama({ sehir, ilce, kategori, platform }) {
    const serpApiKey = process.env.SERP_API_KEY;
    if (!serpApiKey) throw new Error('SERP_API_KEY .env dosyasında tanımlı olmalı');

    const aramaMetni = `${kategori} ${ilce ? ilce + ' ' : ''}${sehir}`.trim();
    console.log(`🔍 Sosyal medya tarama (SerpAPI): "${aramaMetni}" - platform: ${platform}`);

    // Platform bazlı site filtresi
    const platformSite = {
      instagram: 'site:instagram.com',
      facebook: 'site:facebook.com',
      tiktok: 'site:tiktok.com',
      hepsi: 'site:instagram.com OR site:facebook.com OR site:tiktok.com'
    };
    const siteFilter = platformSite[platform] || platformSite['hepsi'];
    const sorgu = `${aramaMetni} ${siteFilter}`;

    let tumSonuclar = [];

    // SerpAPI - max 100 sonuç (10 sayfa x 10)
    for (let start = 0; start <= 90; start += 10) {
      try {
        const url = `https://serpapi.com/search.json?engine=google&q=${encodeURIComponent(sorgu)}&api_key=${serpApiKey}&num=10&start=${start}&hl=tr&gl=tr`;
        console.log(`🔎 SerpAPI sorgu (start=${start}): ${sorgu}`);
        const response = await fetch(url);
        const data = await response.json();

        if (data.error) {
          console.log(`⚠️ SerpAPI hatası: ${data.error}`);
          break;
        }

        const results = data.organic_results || [];
        if (results.length === 0) break;

        tumSonuclar = tumSonuclar.concat(results);

        if (!data.serpapi_pagination?.next) break;

        await new Promise(r => setTimeout(r, 300));
      } catch (e) {
        console.log(`⚠️ SerpAPI istek hatası (start=${start}):`, e.message);
        break;
      }
    }

    console.log(`📱 ${tumSonuclar.length} sosyal medya profili bulundu`);

    let yeniEklenen = 0;
    let zatenVar = 0;

    for (const item of tumSonuclar) {
      try {
        const link = item.link || '';
        const baslik = item.title || '';
        const aciklama = item.snippet || '';

        // Platform tespit
        let tespit_platform = 'diger';
        if (link.includes('instagram.com')) tespit_platform = 'instagram';
        else if (link.includes('facebook.com')) tespit_platform = 'facebook';
        else if (link.includes('tiktok.com')) tespit_platform = 'tiktok';

        // Profil linki mi kontrol (post/reel değil, profil)
        const instaProfil = tespit_platform === 'instagram' && !link.includes('/p/') && !link.includes('/reel/') && !link.includes('/stories/');
        const fbProfil = tespit_platform === 'facebook' && !link.includes('/posts/') && !link.includes('/photos/');
        const tiktokProfil = tespit_platform === 'tiktok' && link.includes('/@');

        if (!instaProfil && !fbProfil && !tiktokProfil) continue;

        // Kullanıcı adı çıkar
        let kullaniciAdi = '';
        if (tespit_platform === 'instagram') {
          const match = link.match(/instagram\.com\/([^\/\?]+)/);
          kullaniciAdi = match ? match[1] : '';
        } else if (tespit_platform === 'facebook') {
          const match = link.match(/facebook\.com\/([^\/\?]+)/);
          kullaniciAdi = match ? match[1] : '';
        } else if (tespit_platform === 'tiktok') {
          const match = link.match(/tiktok\.com\/@([^\/\?]+)/);
          kullaniciAdi = match ? match[1] : '';
        }

        if (!kullaniciAdi || ['explore', 'p', 'reel', 'stories', 'login', 'accounts', 'watch', 'marketplace', 'groups', 'events'].includes(kullaniciAdi)) continue;

        // Unique ID: platform + kullanıcı adı
        const uniqueId = `${tespit_platform}_${kullaniciAdi}`;

        const mevcut = await pool.query(
          'SELECT id FROM potansiyel_musteriler WHERE google_maps_id = $1',
          [uniqueId]
        );

        if (mevcut.rows.length > 0) {
          zatenVar++;
          continue;
        }

        // İsletme adını başlıktan çıkar
        let isletmeAdi = baslik
          .replace(/\(@[^)]+\)/g, '')
          .replace(/\| Instagram/gi, '')
          .replace(/\| Facebook/gi, '')
          .replace(/\| TikTok/gi, '')
          .replace(/- Home/gi, '')
          .trim();
        if (!isletmeAdi) isletmeAdi = kullaniciAdi;

        // Bio'dan telefon çıkarmaya çalış
        let telefon = null;
        const telMatch = aciklama.match(/(?:0|\+90)\s*\d{3}\s*\d{3}\s*\d{2}\s*\d{2}/);
        if (telMatch) telefon = telMatch[0].replace(/\s/g, '');

        const skor = this.skorHesapla({
          puan: null,
          yorum_sayisi: 0,
          web_sitesi: null,
          telefon: telefon,
          instagram: tespit_platform === 'instagram' ? kullaniciAdi : null
        });

        await pool.query(`
          INSERT INTO potansiyel_musteriler 
          (isletme_adi, telefon, adres, sehir, ilce, kategori, puan, yorum_sayisi, web_sitesi, instagram, google_maps_id, google_maps_url, skor, kaynak)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
          ON CONFLICT (google_maps_id) DO NOTHING
        `, [
          isletmeAdi,
          telefon,
          null,
          sehir,
          ilce || null,
          kategori,
          null,
          0,
          null,
          tespit_platform === 'instagram' ? kullaniciAdi : null,
          uniqueId,
          link,
          skor,
          tespit_platform
        ]);

        yeniEklenen++;
      } catch (e) {
        console.log(`⚠️ Sosyal medya kayıt hatası:`, e.message);
      }
    }

    console.log(`✅ Sosyal medya tarama bitti: ${yeniEklenen} yeni, ${zatenVar} zaten vardı`);
    return {
      toplam_bulunan: tumSonuclar.length,
      yeni_eklenen: yeniEklenen,
      zaten_var: zatenVar,
      arama_metni: aramaMetni,
      platform
    };
  }

  // Skorlama algoritması
  skorHesapla({ puan, yorum_sayisi, web_sitesi, telefon, instagram }) {
    let skor = 0;

    // Telefon var → ulaşılabilir (+25)
    if (telefon) skor += 25;

    // Web sitesi yok → dijitale uzak, bot lazım (+30)
    if (!web_sitesi) skor += 30;

    // Instagram yok/zayıf → dijital pazarlaması zayıf (+20)
    if (!instagram) skor += 20;

    // Yorum sayısı az (<50) → küçük işletme, kolay ikna (+15)
    if (yorum_sayisi && yorum_sayisi < 50) skor += 15;
    else if (yorum_sayisi && yorum_sayisi < 100) skor += 10;
    else if (yorum_sayisi && yorum_sayisi >= 100) skor += 5;

    // Puan iyi (>4.0) → kaliteli işletme, potansiyel (+10)
    if (puan && puan >= 4.0) skor += 10;
    else if (puan && puan >= 3.5) skor += 5;

    return skor;
  }

  // 🧹 TOPLU ONARIM: mevcut kirli ilçe değerlerini adresden yeniden tespit et
  async ilceleriYenidenHesapla(limit = 10000) {
    const r = await pool.query(
      `SELECT id, sehir, ilce, adres FROM potansiyel_musteriler
       WHERE adres IS NOT NULL OR ilce IS NOT NULL
       LIMIT $1`, [limit]
    );
    let duzeltildi = 0, temizlendi = 0, degismedi = 0;
    for (const row of r.rows) {
      const yeni = this._ilceTespitEt(row.adres, row.sehir, null);
      const eski = row.ilce;
      if (yeni === eski) { degismedi++; continue; }
      await pool.query(
        `UPDATE potansiyel_musteriler SET ilce = $1 WHERE id = $2`,
        [yeni, row.id]
      );
      if (yeni) duzeltildi++; else temizlendi++;
    }
    return { toplam: r.rows.length, duzeltildi, temizlendi, degismedi };
  }

  // Potansiyel müşterileri listele (filtreli)
  async listele({ durum, kategori, sehir, ilce, siralama, limit, offset, kaynak, q }) {
    let query = 'SELECT * FROM potansiyel_musteriler WHERE 1=1';
    const params = [];
    let idx = 1;

    // Serbest metin arama (isim, telefon, adres, instagram) — min 2 char
    if (q && String(q).trim().length >= 2) {
      const pattern = `%${String(q).trim()}%`;
      query += ` AND (isletme_adi ILIKE $${idx} OR telefon ILIKE $${idx} OR adres ILIKE $${idx} OR instagram ILIKE $${idx})`;
      params.push(pattern);
      idx++;
    }

    if (kaynak && kaynak !== 'hepsi') {
      if (kaynak === 'maps') {
        query += ` AND (kaynak = 'maps' OR kaynak IS NULL)`;
      } else if (kaynak === 'sosyal') {
        query += ` AND kaynak IN ('instagram', 'facebook', 'tiktok')`;
      } else {
        query += ` AND kaynak = $${idx++}`;
        params.push(kaynak);
      }
    }
    if (durum && durum !== 'hepsi') {
      if (durum === 'bot_yazdi') {
        query += ` AND wp_mesaj_durumu = 'gonderildi'`;
      } else if (durum === 'cevapsiz') {
        query += ` AND wp_mesaj_durumu = 'gonderildi' AND id NOT IN (SELECT lead_id FROM satis_konusmalar WHERE lead_id IS NOT NULL AND gelen_mesajlar IS NOT NULL AND gelen_mesajlar != '')`;
      } else {
        query += ` AND durum = $${idx++}`;
        params.push(durum);
      }
    }
    if (kategori && kategori !== 'hepsi') {
      query += ` AND kategori = $${idx++}`;
      params.push(kategori);
    }
    if (sehir) {
      query += ` AND sehir = $${idx++}`;
      params.push(sehir);
    }
    if (ilce) {
      query += ` AND ilce ILIKE $${idx++}`;
      params.push(`%${ilce}%`);
    }

    // Sıralama
    const siralamaMap = {
      'skor_desc': 'skor DESC',
      'skor_asc': 'skor ASC',
      'puan_desc': 'puan DESC NULLS LAST',
      'yorum_desc': 'yorum_sayisi DESC',
      'yeni': 'olusturma_tarihi DESC',
      'arama_tarihi': 'sonraki_arama ASC NULLS FIRST'
    };
    query += ` ORDER BY ${siralamaMap[siralama] || 'skor DESC'}`;

    if (limit) {
      query += ` LIMIT $${idx++}`;
      params.push(limit);
    }
    if (offset) {
      query += ` OFFSET $${idx++}`;
      params.push(offset);
    }

    const result = await pool.query(query, params);
    return result.rows;
  }

  // Durum güncelle (arandı, ilgileniyor, vs.)
  async durumGuncelle(id, { durum, notlar, sonraki_arama }) {
    const updates = [];
    const params = [];
    let idx = 1;

    if (durum) {
      updates.push(`durum = $${idx++}`);
      params.push(durum);
      if (durum === 'arandi' || durum === 'ilgileniyor') {
        updates.push(`arama_tarihi = NOW()`);
      }
    }
    if (notlar !== undefined) {
      updates.push(`notlar = $${idx++}`);
      params.push(notlar);
    }
    if (sonraki_arama) {
      updates.push(`sonraki_arama = $${idx++}`);
      params.push(sonraki_arama);
    }

    if (!updates.length) return null;

    params.push(id);
    const result = await pool.query(
      `UPDATE potansiyel_musteriler SET ${updates.join(', ')} WHERE id = $${idx} RETURNING *`,
      params
    );
    return result.rows[0];
  }

  // İstatistikler
  async istatistikler() {
    const result = await pool.query(`
      SELECT 
        COUNT(*) as toplam,
        COUNT(*) FILTER (WHERE durum = 'yeni') as yeni,
        COUNT(*) FILTER (WHERE durum = 'arandi') as arandi,
        COUNT(*) FILTER (WHERE durum = 'ilgileniyor') as ilgileniyor,
        COUNT(*) FILTER (WHERE durum = 'ilgilenmiyor') as ilgilenmiyor,
        COUNT(*) FILTER (WHERE durum = 'demo_yapildi') as demo_yapildi,
        COUNT(*) FILTER (WHERE durum = 'musteri_oldu') as musteri_oldu,
        COUNT(*) FILTER (WHERE wp_mesaj_durumu = 'gonderildi') as bot_yazdi,
        COUNT(*) FILTER (
          WHERE wp_mesaj_durumu = 'gonderildi'
            AND id NOT IN (
              SELECT lead_id FROM satis_konusmalar
              WHERE lead_id IS NOT NULL
                AND gelen_mesajlar IS NOT NULL
                AND gelen_mesajlar != ''
            )
        ) as cevapsiz,
        COUNT(*) FILTER (WHERE telefon IS NOT NULL) as telefonlu,
        COUNT(*) FILTER (WHERE web_sitesi IS NULL) as websitesiz,
        ROUND(AVG(skor)) as ort_skor,
        COUNT(DISTINCT kategori) as kategori_sayisi,
        COUNT(DISTINCT sehir) as sehir_sayisi
      FROM potansiyel_musteriler
    `);
    return result.rows[0];
  }

  // Günlük arama listesi - en yüksek skorlu, henüz aranmamış, bot yazmamış
  async gunlukListe(limit = 10) {
    const result = await pool.query(`
      SELECT * FROM potansiyel_musteriler 
      WHERE durum IN ('yeni', 'arandi') 
        AND telefon IS NOT NULL
        AND (wp_mesaj_durumu IS NULL OR wp_mesaj_durumu = '')
        AND (sonraki_arama IS NULL OR sonraki_arama <= NOW())
      ORDER BY 
        CASE WHEN durum = 'arandi' AND sonraki_arama <= NOW() THEN 0 ELSE 1 END,
        skor DESC
      LIMIT $1
    `, [limit]);
    return result.rows;
  }

  // Potansiyel müşteri sil
  async sil(id) {
    await pool.query('DELETE FROM potansiyel_musteriler WHERE id = $1', [id]);
  }

  // Toplu sil (filtreli)
  async topluSil(durum) {
    if (durum) {
      await pool.query('DELETE FROM potansiyel_musteriler WHERE durum = $1', [durum]);
    }
  }
}

module.exports = new AvciBot();
