const pool = require('../config/db');

// Google Places API ile işletme arama
class AvciBot {

  // Google Maps'ten işletmeleri ara ve DB'ye kaydet
  async taramaYap(params) {
    const { sehir, ilce, kategori, apiKey } = params;
    if (!apiKey) throw new Error('Google Maps API key gerekli');

    const aramaMetni = `${kategori} ${ilce ? ilce + ' ' : ''}${sehir}`;
    console.log(`🔍 Avcı Bot tarama: "${aramaMetni}"`);

    let tumSonuclar = [];
    let nextPageToken = null;

    // Places API (New) - Text Search kullanıyoruz
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

    console.log(`📍 ${tumSonuclar.length} işletme bulundu`);

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

        // İlçe tespiti
        let tespit_ilce = ilce || null;
        if (adres) {
          const adresParcalari = adres.split(',').map(s => s.trim());
          if (adresParcalari.length >= 3) {
            tespit_ilce = adresParcalari[adresParcalari.length - 3] || tespit_ilce;
          }
        }

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

        if (yeniEklenen % 10 === 0) {
          await new Promise(r => setTimeout(r, 500));
        }

      } catch (e) {
        console.log(`⚠️ Kayıt hatası:`, e.message);
      }
    }

    const sonuc = {
      toplam_bulunan: tumSonuclar.length,
      yeni_eklenen: yeniEklenen,
      zaten_var: zatenVar,
      arama_metni: aramaMetni
    };

    console.log(`✅ Tarama tamamlandı: ${yeniEklenen} yeni, ${zatenVar} zaten vardı`);
    return sonuc;
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

  // Potansiyel müşterileri listele (filtreli)
  async listele({ durum, kategori, sehir, ilce, siralama, limit, offset }) {
    let query = 'SELECT * FROM potansiyel_musteriler WHERE 1=1';
    const params = [];
    let idx = 1;

    if (durum && durum !== 'hepsi') {
      query += ` AND durum = $${idx++}`;
      params.push(durum);
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
        COUNT(*) FILTER (WHERE telefon IS NOT NULL) as telefonlu,
        COUNT(*) FILTER (WHERE web_sitesi IS NULL) as websitesiz,
        ROUND(AVG(skor)) as ort_skor,
        COUNT(DISTINCT kategori) as kategori_sayisi,
        COUNT(DISTINCT sehir) as sehir_sayisi
      FROM potansiyel_musteriler
    `);
    return result.rows[0];
  }

  // Günlük arama listesi - en yüksek skorlu, henüz aranmamış
  async gunlukListe(limit = 10) {
    const result = await pool.query(`
      SELECT * FROM potansiyel_musteriler 
      WHERE durum IN ('yeni', 'arandi') 
        AND telefon IS NOT NULL
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
