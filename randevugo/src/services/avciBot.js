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

  // Toplu tarama - tüm ilçeleri ve kategorileri tara
  async topluTarama({ sehir, kategoriler, apiKey }) {
    const istanbulIlceler = [
      'Kadıköy','Beşiktaş','Şişli','Bakırköy','Ataşehir','Üsküdar','Maltepe','Kartal',
      'Pendik','Tuzla','Ümraniye','Sancaktepe','Sultanbeyli','Çekmeköy','Beykoz',
      'Sarıyer','Eyüpsultan','Kağıthane','Beyoğlu','Fatih','Zeytinburnu','Bayrampaşa',
      'Güngören','Bahçelievler','Bağcılar','Esenler','Sultangazi','Gaziosmanpaşa',
      'Başakşehir','Küçükçekmece','Avcılar','Esenyurt','Beylikdüzü','Büyükçekmece',
      'Arnavutköy','Çatalca','Silivri','Şile','Adalar'
    ];

    const ilceler = sehir === 'İstanbul' ? istanbulIlceler : [''];
    const toplamSonuc = { toplam_bulunan: 0, yeni_eklenen: 0, zaten_var: 0, tarama_sayisi: 0 };

    for (const kategori of kategoriler) {
      for (const ilce of ilceler) {
        try {
          const sonuc = await this.taramaYap({ sehir, ilce, kategori, apiKey });
          toplamSonuc.toplam_bulunan += sonuc.toplam_bulunan;
          toplamSonuc.yeni_eklenen += sonuc.yeni_eklenen;
          toplamSonuc.zaten_var += sonuc.zaten_var;
          toplamSonuc.tarama_sayisi++;
          // Rate limit - her tarama arası 1sn bekle
          await new Promise(r => setTimeout(r, 1000));
        } catch (e) {
          console.log(`⚠️ Toplu tarama hatası (${kategori} ${ilce}):`, e.message);
        }
      }
    }

    console.log(`✅ Toplu tarama bitti: ${toplamSonuc.tarama_sayisi} tarama, ${toplamSonuc.yeni_eklenen} yeni lead`);
    return toplamSonuc;
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

  // Potansiyel müşterileri listele (filtreli)
  async listele({ durum, kategori, sehir, ilce, siralama, limit, offset, kaynak }) {
    let query = 'SELECT * FROM potansiyel_musteriler WHERE 1=1';
    const params = [];
    let idx = 1;

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
