const pool = require('../config/db');
const deepseekService = require('../services/deepseek');
const whatsappService = require('../services/whatsapp');
const randevuService = require('../services/randevu');

class BotController {

  // Twilio webhook - gelen WhatsApp mesajı
  async gelenMesaj(req, res) {
    try {
      const { From, Body, To } = req.body;
      const musteriTelefon = From; // whatsapp:+905xxxxxxxxx
      const mesaj = Body.trim();
      const isletmeTelefon = To;

      console.log(`📩 Gelen: ${musteriTelefon} → "${mesaj}"`);

      // İşletmeyi bul (To numarasına göre veya varsayılan)
      let isletme = (await pool.query(
        'SELECT * FROM isletmeler WHERE whatsapp_no = $1 AND aktif = true',
        [isletmeTelefon]
      )).rows[0];

      // Varsayılan işletme (tek işletme varsa)
      if (!isletme) {
        isletme = (await pool.query('SELECT * FROM isletmeler WHERE aktif = true LIMIT 1')).rows[0];
      }

      if (!isletme) {
        await whatsappService.mesajGonder(musteriTelefon, 'Üzgünüz, şu an hizmet veremiyoruz. 🙏');
        return res.status(200).send('OK');
      }

      // Bot durumunu al veya oluştur
      let botDurum = (await pool.query(
        'SELECT * FROM bot_durum WHERE musteri_telefon = $1 AND isletme_id = $2',
        [musteriTelefon, isletme.id]
      )).rows[0];

      if (!botDurum) {
        botDurum = (await pool.query(
          'INSERT INTO bot_durum (musteri_telefon, isletme_id, asama) VALUES ($1, $2, $3) RETURNING *',
          [musteriTelefon, isletme.id, 'baslangic']
        )).rows[0];
      }

      // Sohbeti kaydet
      await pool.query(
        'INSERT INTO sohbet_gecmisi (musteri_telefon, isletme_id, yon, mesaj) VALUES ($1, $2, $3, $4)',
        [musteriTelefon, isletme.id, 'gelen', mesaj]
      );

      // İptal komutu
      if (mesaj.toLowerCase().includes('iptal')) {
        const cevap = await this.iptalIsle(musteriTelefon, isletme);
        await this.cevapGonder(musteriTelefon, isletme.id, cevap);
        return res.status(200).send('OK');
      }

      // Hizmetleri al
      const hizmetler = (await pool.query(
        'SELECT * FROM hizmetler WHERE isletme_id = $1 AND aktif = true ORDER BY id',
        [isletme.id]
      )).rows;

      // Bugünün müsait saatlerini al
      const bugun = new Date().toISOString().split('T')[0];
      const musaitSaatler = await randevuService.musaitSaatleriGetir(isletme.id, botDurum.secilen_tarih || bugun);

      // ─── HIZLI KOMUT BYPASS: Basit menü komutlarında AI'a gitmeden state machine kullan ───
      // Sayısal seçim (1,2,3...), onay (evet, onayla), tarih kısayolları (bugün, yarın)
      // Bu komutlar bot zaten bir aşamadayken AI'a sormaya gerek kalmadan lokal işlenebilir.
      const basitKomut = /^[1-9]\d{0,1}$/.test(mesaj) ||                     // Sayısal: 1-99
        /^(evet|hayır|onayla|onaylıyorum|iptal)$/i.test(mesaj.split(',')[0].trim()) ||
        /^(bugün|yarın|yarın|today|tomorrow)$/i.test(mesaj.trim()) ||
        (botDurum.asama === 'onay' && /evet/i.test(mesaj));                   // Onay aşamasında "evet" içeren her mesaj

      const aktifAsama = botDurum.asama && botDurum.asama !== 'baslangic';

      if (basitKomut && aktifAsama) {
        console.log(`⚡ Hızlı bypass: "${mesaj}" → state machine (asama: ${botDurum.asama})`);
        const whatsappWebService = require('../services/whatsappWeb');
        const cevapSm = await whatsappWebService.akisIsle(mesaj, botDurum, isletme, hizmetler, musteriTelefon.replace('whatsapp:', ''), isletme.id);
        if (cevapSm) await this.cevapGonder(musteriTelefon, isletme.id, cevapSm);
        return res.status(200).send('OK');
      }

      // DeepSeek'e sor (API key yoksa null döner)
      const aiCevap = await deepseekService.mesajAnla(mesaj, isletme, botDurum, musaitSaatler, hizmetler);

      // API key yoksa veya hata aldıysak state machine'e yönlendir
      if (!aiCevap) {
        const whatsappWebService = require('../services/whatsappWeb');
        const cevapSm = await whatsappWebService.akisIsle(mesaj, botDurum, isletme, hizmetler, musteriTelefon.replace('whatsapp:', ''), isletme.id);
        if (cevapSm) await this.cevapGonder(musteriTelefon, isletme.id, cevapSm);
        return res.status(200).send('OK');
      }

      // Aksiyona göre işlem yap
      let cevap = aiCevap.cevap;

      switch (aiCevap.aksiyon) {
        case 'hizmet_listele':
          cevap = `${isletme.isim}'e hoş geldiniz! 😊\n\nHizmetlerimiz:\n`;
          hizmetler.forEach((h, i) => {
            cevap += `${i + 1}️⃣ ${h.isim} (${h.sure_dk} dk) - ${h.fiyat} TL\n`;
          });
          cevap += `\nHangi hizmeti almak istersiniz? Numara yazın.`;
          await this.durumGuncelle(musteriTelefon, isletme.id, 'hizmet_secimi');
          break;

        case 'hizmet_secildi':
          const hizmetIndex = (aiCevap.secilen_hizmet_index || parseInt(mesaj)) - 1;
          if (hizmetIndex >= 0 && hizmetIndex < hizmetler.length) {
            const secilenHizmet = hizmetler[hizmetIndex];
            await this.durumGuncelle(musteriTelefon, isletme.id, 'tarih_secimi', { secilen_hizmet_id: secilenHizmet.id });
            cevap = `✅ ${secilenHizmet.isim} seçildi!\n\nHangi gün istersiniz?\n`;
            cevap += `1️⃣ Bugün\n2️⃣ Yarın\n3️⃣ Başka bir gün (tarih yazın: GG.AA.YYYY)`;
          } else {
            cevap = `Lütfen 1-${hizmetler.length} arasında bir numara yazın.`;
          }
          break;

        case 'tarih_secildi':
          let secilenTarih;
          if (mesaj === '1' || mesaj.toLowerCase().includes('bugün')) {
            secilenTarih = new Date().toISOString().split('T')[0];
          } else if (mesaj === '2' || mesaj.toLowerCase().includes('yarın')) {
            const yarin = new Date();
            yarin.setDate(yarin.getDate() + 1);
            secilenTarih = yarin.toISOString().split('T')[0];
          } else if (aiCevap.secilen_tarih) {
            secilenTarih = aiCevap.secilen_tarih;
          } else {
            // Tarih parse etmeye çalış
            const parcalar = mesaj.match(/(\d{1,2})[./](\d{1,2})[./](\d{4})/);
            if (parcalar) {
              secilenTarih = `${parcalar[3]}-${parcalar[2].padStart(2, '0')}-${parcalar[1].padStart(2, '0')}`;
            }
          }

          if (secilenTarih) {
            const saatler = await randevuService.musaitSaatleriGetir(isletme.id, secilenTarih);
            if (saatler.length === 0) {
              cevap = `😔 Bu tarihte müsait saat bulunmuyor. Başka bir gün seçer misiniz?\n`;
              cevap += `1️⃣ Bugün\n2️⃣ Yarın\n3️⃣ Başka bir gün`;
            } else {
              await this.durumGuncelle(musteriTelefon, isletme.id, 'saat_secimi', { secilen_tarih: secilenTarih });
              cevap = `📅 ${this.tarihFormat(secilenTarih)} için müsait saatler:\n\n`;
              saatler.forEach((s, i) => {
                cevap += `${i + 1}️⃣ ${s}\n`;
              });
              cevap += `\nHangi saati istersiniz? Numara veya saat yazın.`;
            }
          } else {
            cevap = `Tarihi anlayamadım. Lütfen şu formatlardan birini kullanın:\n• 1 (Bugün)\n• 2 (Yarın)\n• 15.04.2026 gibi bir tarih`;
          }
          break;

        case 'saat_secildi':
          const guncelDurum = (await pool.query(
            'SELECT * FROM bot_durum WHERE musteri_telefon = $1 AND isletme_id = $2',
            [musteriTelefon, isletme.id]
          )).rows[0];

          const mevcutSaatler = await randevuService.musaitSaatleriGetir(isletme.id, guncelDurum.secilen_tarih);
          
          let secilenSaat;
          const saatIndex = parseInt(mesaj) - 1;
          if (saatIndex >= 0 && saatIndex < mevcutSaatler.length) {
            secilenSaat = mevcutSaatler[saatIndex];
          } else if (aiCevap.secilen_saat) {
            secilenSaat = aiCevap.secilen_saat;
          } else {
            const saatMatch = mesaj.match(/(\d{1,2})[.:](\d{2})/);
            if (saatMatch) {
              secilenSaat = `${saatMatch[1].padStart(2, '0')}:${saatMatch[2]}`;
            }
          }

          if (secilenSaat && mevcutSaatler.includes(secilenSaat)) {
            await this.durumGuncelle(musteriTelefon, isletme.id, 'onay', { secilen_saat: secilenSaat });
            
            const secilenHizmetBilgi = guncelDurum.secilen_hizmet_id
              ? (await pool.query('SELECT * FROM hizmetler WHERE id = $1', [guncelDurum.secilen_hizmet_id])).rows[0]
              : null;

            cevap = `📋 Randevu Özeti:\n\n`;
            cevap += `📍 ${isletme.isim}\n`;
            cevap += `📅 ${this.tarihFormat(guncelDurum.secilen_tarih)}\n`;
            cevap += `🕐 ${secilenSaat}\n`;
            if (secilenHizmetBilgi) {
              cevap += `✂️ ${secilenHizmetBilgi.isim} - ${secilenHizmetBilgi.fiyat} TL\n`;
            }
            cevap += `\nOnaylıyor musunuz?\n1️⃣ Evet, onayla ✅\n2️⃣ Hayır, iptal et ❌`;
          } else {
            cevap = `Bu saat müsait değil. Lütfen listeden bir numara seçin.`;
          }
          break;

        case 'randevu_onayla':
          if (mesaj === '1' || mesaj.toLowerCase().includes('evet') || mesaj.toLowerCase().includes('onayla')) {
            const sonDurum = (await pool.query(
              'SELECT * FROM bot_durum WHERE musteri_telefon = $1 AND isletme_id = $2',
              [musteriTelefon, isletme.id]
            )).rows[0];

            const sonuc = await randevuService.randevuOlustur({
              isletmeId: isletme.id,
              musteriTelefon: musteriTelefon.replace('whatsapp:', ''),
              hizmetId: sonDurum.secilen_hizmet_id,
              calisanId: sonDurum.secilen_calisan_id,
              tarih: sonDurum.secilen_tarih,
              saat: sonDurum.secilen_saat
            });

            cevap = `✅ Randevunuz oluşturuldu!\n\n`;
            cevap += `📍 ${isletme.isim}\n`;
            cevap += `📅 ${this.tarihFormat(sonDurum.secilen_tarih)}\n`;
            cevap += `🕐 ${sonDurum.secilen_saat}\n`;
            if (sonuc.hizmet) cevap += `✂️ ${sonuc.hizmet.isim}\n`;
            cevap += `\n⏰ Randevunuzdan 1 saat önce hatırlatma mesajı göndereceğim.\n`;
            cevap += `\nİptal etmek için "iptal" yazabilirsiniz.`;

            // Durumu sıfırla
            await this.durumGuncelle(musteriTelefon, isletme.id, 'baslangic', {
              secilen_hizmet_id: null, secilen_tarih: null, secilen_saat: null, secilen_calisan_id: null
            });
          } else {
            cevap = `❌ Randevu iptal edildi. Yeni randevu almak ister misiniz?`;
            await this.durumGuncelle(musteriTelefon, isletme.id, 'baslangic', {
              secilen_hizmet_id: null, secilen_tarih: null, secilen_saat: null, secilen_calisan_id: null
            });
          }
          break;

        default:
          // DeepSeek'in serbest cevabını kullan
          break;
      }

      // Cevabı gönder
      await this.cevapGonder(musteriTelefon, isletme.id, cevap);
      
      return res.status(200).send('OK');
    } catch (error) {
      console.error('❌ Bot hatası:', error);
      return res.status(200).send('OK');
    }
  }

  async iptalIsle(musteriTelefon, isletme) {
    const telefonTemiz = musteriTelefon.replace('whatsapp:', '').replace('+90', '0');
    const randevular = await randevuService.musteriRandevulari(telefonTemiz, isletme.id);

    if (randevular.length === 0) {
      return 'Aktif bir randevunuz bulunmuyor.';
    }

    // En yakın randevuyu iptal et
    await randevuService.randevuIptal(randevular[0].id);
    await this.durumGuncelle(musteriTelefon, isletme.id, 'baslangic', {
      secilen_hizmet_id: null, secilen_tarih: null, secilen_saat: null, secilen_calisan_id: null
    });

    return `❌ Randevunuz iptal edildi.\n\n📅 ${this.tarihFormat(randevular[0].tarih)} ${randevular[0].saat}\n\nYeni randevu almak ister misiniz?`;
  }

  async cevapGonder(musteriTelefon, isletmeId, mesaj) {
    await whatsappService.mesajGonder(musteriTelefon, mesaj);
    await pool.query(
      'INSERT INTO sohbet_gecmisi (musteri_telefon, isletme_id, yon, mesaj) VALUES ($1, $2, $3, $4)',
      [musteriTelefon, isletmeId, 'giden', mesaj]
    );
  }

  async durumGuncelle(musteriTelefon, isletmeId, asama, ekstra = {}) {
    const IZINLI_KOLONLAR = new Set(['secilen_hizmet_id', 'secilen_tarih', 'secilen_saat', 'secilen_calisan_id']);
    const fields = ['asama = $3', 'son_aktivite = NOW()'];
    const values = [musteriTelefon, isletmeId, asama];
    let paramIndex = 4;

    for (const [key, value] of Object.entries(ekstra)) {
      if (!IZINLI_KOLONLAR.has(key)) continue;
      fields.push(`${key} = $${paramIndex}`);
      values.push(value);
      paramIndex++;
    }

    await pool.query(
      `UPDATE bot_durum SET ${fields.join(', ')} WHERE musteri_telefon = $1 AND isletme_id = $2`,
      values
    );
  }

  tarihFormat(tarih) {
    const d = new Date(tarih);
    const gunler = ['Pazar', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi'];
    const aylar = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
    return `${d.getDate()} ${aylar[d.getMonth()]} ${gunler[d.getDay()]}`;
  }

  // Test endpoint - webhook olmadan bot'u test et
  async testMesaj(req, res) {
    const cevaplar = [];
    const originalMesajGonder = whatsappService.mesajGonder.bind(whatsappService);
    try {
      const { telefon, mesaj, isletme_id } = req.body;
      
      // Fake webhook body oluştur
      req.body = {
        From: `whatsapp:+90${telefon.replace(/^0/, '')}`,
        Body: mesaj,
        To: ''
      };

      if (isletme_id) {
        const isletme = (await pool.query('SELECT * FROM isletmeler WHERE id = $1', [isletme_id])).rows[0];
        if (isletme) req.body.To = isletme.whatsapp_no || '';
      }

      // Cevabı yakalamak için res'i override et
      whatsappService.mesajGonder = async (hedef, msj) => {
        cevaplar.push(msj);
        return { success: true, test: true };
      };

      await this.gelenMesaj(req, { status: () => ({ send: () => {} }) });

      // Original'e geri dön
      whatsappService.mesajGonder = originalMesajGonder;

      res.json({ cevaplar, durum: 'ok' });
    } catch (error) {
      // Her zaman original'e geri dön
      whatsappService.mesajGonder = originalMesajGonder;
      console.error('❌ Bot test hatası:', error);
      res.json({ cevaplar, durum: 'hata', hata: error.message });
    }
  }
}

module.exports = new BotController();
