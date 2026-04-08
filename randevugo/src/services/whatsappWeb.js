const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion, makeCacheableSignalKeyStore } = require('@whiskeysockets/baileys');
const qrcode = require('qrcode');
const pool = require('../config/db');
const EventEmitter = require('events');
const fs = require('fs');
const path = require('path');
const pino = require('pino');
const { bugunTarih, yarinTarih, gunSonraTarih } = require('../utils/tarih');

const AUTH_DIR = path.join(process.cwd(), '.wwebjs_auth');

class WhatsAppWebService extends EventEmitter {
  constructor() {
    super();
    this.isletmeler = {}; // isletme_id -> { sock, durum, qr, qrBase64 }
  }

  async tumIsletmeleriBaslat() {
    try {
      const result = await pool.query(
        "SELECT id, isim FROM isletmeler WHERE aktif = true"
      );
      for (const isletme of result.rows) {
        if (!this.isletmeler[isletme.id]) {
          this.isletmeBaslat(isletme.id, isletme.isim, false);
        }
      }
      console.log(`📱 ${result.rows.length} işletme için WP servisi başlatıldı (Baileys)`);
    } catch (err) {
      console.error('❌ WP servisleri başlatılamadı:', err.message);
    }
  }

  async isletmeBaslat(isletmeId, isletmeIsim, yeniBaslat = true) {
    // Zaten bağlıysa durdurma
    if (this.isletmeler[isletmeId]?.durum === 'bagli') return;
    // Yeniden başlatma değilse ve zaten başlatılıyorsa atla
    if (!yeniBaslat && this.isletmeler[isletmeId]) return;
    // Varsa kapat
    if (this.isletmeler[isletmeId]?.sock) {
      try { this.isletmeler[isletmeId].sock.end(); } catch (e) {}
    }

    const authFolder = path.join(AUTH_DIR, `isletme_${isletmeId}`);
    if (!fs.existsSync(authFolder)) fs.mkdirSync(authFolder, { recursive: true });

    this.isletmeler[isletmeId] = { sock: null, durum: 'baslatiyor', qr: null, qrBase64: null };

    try {
      const { state, saveCreds } = await useMultiFileAuthState(authFolder);
      const { version } = await fetchLatestBaileysVersion();

      const sock = makeWASocket({
        version,
        auth: {
          creds: state.creds,
          keys: makeCacheableSignalKeyStore(state.keys, pino({ level: 'silent' })),
        },
        printQRInTerminal: false,
        logger: pino({ level: 'silent' }),
        browser: ['RandevuGO', 'Chrome', '4.0.0'],
        generateHighQualityLinkPreview: false,
      });

      this.isletmeler[isletmeId].sock = sock;

      // Credentials güncellendiğinde kaydet
      sock.ev.on('creds.update', saveCreds);

      // Bağlantı durumu
      sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
          try {
            const qrBase64 = await qrcode.toDataURL(qr);
            this.isletmeler[isletmeId].qr = qr;
            this.isletmeler[isletmeId].qrBase64 = qrBase64;
            this.isletmeler[isletmeId].durum = 'qr_bekleniyor';
            console.log(`📱 QR hazır: ${isletmeIsim}`);
            this.emit(`qr_${isletmeId}`, qrBase64);
          } catch (e) {
            console.error(`❌ QR oluşturma hatası:`, e.message);
          }
        }

        if (connection === 'open') {
          this.isletmeler[isletmeId].durum = 'bagli';
          this.isletmeler[isletmeId].qr = null;
          this.isletmeler[isletmeId].qrBase64 = null;
          const numara = sock.user?.id?.split(':')[0] || sock.user?.id?.split('@')[0] || null;
          if (numara) {
            await pool.query('UPDATE isletmeler SET whatsapp_no=$1 WHERE id=$2', [`+${numara}`, isletmeId]);
          }
          console.log(`✅ WhatsApp bağlandı: ${isletmeIsim} (${numara})`);
          this.emit(`bagli_${isletmeId}`, numara);
        }

        if (connection === 'close') {
          const statusCode = lastDisconnect?.error?.output?.statusCode;
          const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
          console.log(`❌ WhatsApp ayrıldı: ${isletmeIsim} - kod: ${statusCode}`);

          if (statusCode === DisconnectReason.restartRequired || statusCode === 515) {
            // QR tarandıktan sonra WhatsApp bilerek koparıyor — NORMAL, hemen yeniden bağlan
            console.log(`🔄 restartRequired — QR tarandı, yeniden bağlanılıyor: ${isletmeIsim}`);
            setTimeout(() => {
              this.isletmeler[isletmeId] = null;
              this.isletmeBaslat(isletmeId, isletmeIsim, true);
            }, 1000);
          } else if (statusCode === DisconnectReason.loggedOut) {
            // Oturum silindi, auth dosyalarını temizle
            this.isletmeler[isletmeId].durum = 'bagli_degil';
            try { fs.rmSync(authFolder, { recursive: true, force: true }); } catch (e) {}
            this.emit(`ayrildi_${isletmeId}`, 'logged_out');
          } else if (shouldReconnect) {
            // Yeniden bağlan
            console.log(`🔄 Yeniden bağlanılıyor: ${isletmeIsim}`);
            setTimeout(() => {
              this.isletmeler[isletmeId] = null;
              this.isletmeBaslat(isletmeId, isletmeIsim, true);
            }, 3000);
          } else {
            this.isletmeler[isletmeId].durum = 'bagli_degil';
            this.emit(`ayrildi_${isletmeId}`, 'disconnected');
          }
        }
      });

      // Mesaj dinle
      sock.ev.on('messages.upsert', async (upsert) => {
        console.log(`📩 [${isletmeIsim}] messages.upsert tetiklendi: type=${upsert.type}, mesaj_sayisi=${upsert.messages?.length}`);
        if (upsert.type !== 'notify') return;
        for (const msg of upsert.messages) {
          console.log(`📩 [${isletmeIsim}] Mesaj: fromMe=${msg.key.fromMe}, jid=${msg.key.remoteJid}, metin=${this._getMsgText(msg)?.slice(0, 50)}`);
          if (msg.key.fromMe) continue;
          if (!msg.message) continue;
          try {
            await this.mesajIsle(msg, isletmeId);
          } catch (err) {
            console.error(`❌ Mesaj işleme hatası [${isletmeIsim}]:`, err.message, err.stack);
          }
        }
      });

    } catch (err) {
      console.error(`❌ WP başlatma hatası [${isletmeIsim}]:`, err.message);
      this.isletmeler[isletmeId].durum = 'hata';
    }
  }

  async isletmeDurdur(isletmeId) {
    if (this.isletmeler[isletmeId]) {
      try { await this.isletmeler[isletmeId].sock?.logout(); } catch (e) {}
      try { this.isletmeler[isletmeId].sock?.end(); } catch (e) {}
      delete this.isletmeler[isletmeId];
    }
    const authFolder = path.join(AUTH_DIR, `isletme_${isletmeId}`);
    try { fs.rmSync(authFolder, { recursive: true, force: true }); } catch (e) {}
    await pool.query('UPDATE isletmeler SET whatsapp_no=NULL WHERE id=$1', [isletmeId]);
  }

  getDurum(isletmeId) {
    const state = this.isletmeler[isletmeId];
    if (!state) return { durum: 'baslatilmadi', qrBase64: null };
    return { durum: state.durum, qrBase64: state.qrBase64 };
  }

  // Baileys mesajdan metin çıkart — tüm wrapper'ları (viewOnce, ephemeral, protocol) aç
  _getMsgText(msg) {
    let m = msg.message;
    if (!m) return '';

    // Wrapper'ları aç (viewOnceMessage, viewOnceMessageV2, ephemeralMessage, documentWithCaptionMessage)
    if (m.viewOnceMessage) m = m.viewOnceMessage.message || m;
    if (m.viewOnceMessageV2) m = m.viewOnceMessageV2.message || m;
    if (m.ephemeralMessage) m = m.ephemeralMessage.message || m;
    if (m.documentWithCaptionMessage) m = m.documentWithCaptionMessage.message || m;

    // Normal metin
    if (m.conversation) return m.conversation;
    if (m.extendedTextMessage?.text) return m.extendedTextMessage.text;

    // Resim/video/belge caption
    if (m.imageMessage?.caption) return m.imageMessage.caption;
    if (m.videoMessage?.caption) return m.videoMessage.caption;

    // Buton yanıtları - ID'den label'ı çıkar (btn_0_Bugün → Bugün, row_1_Yarın → Yarın)
    const btnId = m.buttonsResponseMessage?.selectedButtonId
      || m.templateButtonReplyMessage?.selectedId
      || m.listResponseMessage?.singleSelectReply?.selectedRowId;
    if (btnId) {
      const parts = btnId.split('_');
      if (parts.length >= 3) return parts.slice(2).join('_');
      return btnId;
    }

    // Buton display text (alternatif)
    if (m.buttonsResponseMessage?.selectedDisplayText) return m.buttonsResponseMessage.selectedDisplayText;
    if (m.templateButtonReplyMessage?.selectedDisplayText) return m.templateButtonReplyMessage.selectedDisplayText;
    if (m.listResponseMessage?.title) return m.listResponseMessage.title;

    // Interactive response (nativeFlowResponseMessage)
    const interResp = m.interactiveResponseMessage;
    if (interResp?.nativeFlowResponseMessage?.paramsJson) {
      try {
        const params = JSON.parse(interResp.nativeFlowResponseMessage.paramsJson);
        // display_text varsa onu döndür, yoksa id'den label çıkar
        if (params.display_text) return params.display_text;
        if (params.id) {
          const parts = params.id.split('_');
          if (parts.length >= 3) return parts.slice(2).join('_');
          return params.id;
        }
      } catch (e) { /* ignore */ }
    }

    // editedMessage wrapper
    if (m.editedMessage?.message) {
      return this._getMsgText({ message: m.editedMessage.message });
    }

    // protocolMessage (mesaj silinmesi vs) → boş döndür, işleme
    if (m.protocolMessage || m.reactionMessage || m.senderKeyDistributionMessage) return '';

    return '';
  }


  async mesajGonder(isletmeId, hedef, mesaj, butonlar = null) {
    const state = this.isletmeler[isletmeId];
    if (!state || state.durum !== 'bagli') return { success: false, hata: 'Bağlı değil' };
    try {
      const jid = hedef.includes('@') ? hedef : `${hedef.replace(/^\+/, '')}@s.whatsapp.net`;

      // Butonlu mesaj
      if (butonlar && butonlar.length > 0) {
        const btnSent = await this._butonluMesajGonder(state.sock, jid, mesaj, butonlar);
        if (btnSent) return { success: true };
      }

      // Normal metin mesajı — her zaman YENİ mesaj gönder (edit karışıklık yapıyor)
      await state.sock.sendMessage(jid, { text: mesaj });
      return { success: true };
    } catch (err) {
      console.error(`❌ mesajGonder hata [${isletmeId}]:`, err.message);
      return { success: false, hata: err.message };
    }
  }

  async _butonluMesajGonder(sock, jid, mesaj, butonlar) {
    const btnLabels = butonlar.map(b => typeof b === 'string' ? b : (b.text || b.body || ''));

    // Numaralı metin — en stabil yöntem, tüm WhatsApp sürümlerinde çalışır
    let butonMetin = mesaj + '\n';
    btnLabels.forEach((label, i) => { butonMetin += `\n${i + 1}️⃣ ${label}`; });
    const sent = await sock.sendMessage(jid, { text: butonMetin });
    console.log('✅ Butonlu mesaj gönderildi:', btnLabels.join(', '));
    return sent;
  }

  async mesajIsle(msg, isletmeId) {
    const metin = (this._getMsgText(msg) || '').trim();
    const remoteJid = msg.key.remoteJid;
    console.log(`🔄 mesajIsle: isletme=${isletmeId}, metin="${metin}", jid=${remoteJid}, keys=${msg.message ? Object.keys(msg.message).join(',') : 'null'}`);
    if (!metin) return;

    // @lid veya @s.whatsapp.net — telefon numarasını çıkar
    let musteriTelefon;
    if (remoteJid.endsWith('@s.whatsapp.net')) {
      musteriTelefon = remoteJid.replace('@s.whatsapp.net', '');
    } else if (remoteJid.endsWith('@lid')) {
      // LID formatında telefon numarası yok, pushName + lid kullan
      musteriTelefon = remoteJid.replace('@lid', '');
    } else {
      musteriTelefon = remoteJid.replace('@c.us', '');
    }

    const isletme = (await pool.query('SELECT * FROM isletmeler WHERE id=$1', [isletmeId])).rows[0];
    if (!isletme) return;

    // Müşteriyi kaydet / bul (pushName varsa gerçek isim kullan)
    const musteriIsim = msg.pushName || musteriTelefon;
    await pool.query(
      'INSERT INTO musteriler (telefon, isim) VALUES ($1, $2) ON CONFLICT (telefon) DO UPDATE SET isim = EXCLUDED.isim WHERE musteriler.isim = musteriler.telefon',
      [musteriTelefon, musteriIsim]
    );

    // Sohbeti kaydet
    await pool.query(
      'INSERT INTO sohbet_gecmisi (musteri_telefon, isletme_id, yon, mesaj) VALUES ($1, $2, $3, $4)',
      [musteriTelefon, isletmeId, 'gelen', metin]
    );

    // Bot durumu
    let botDurum = (await pool.query(
      'SELECT * FROM bot_durum WHERE musteri_telefon=$1 AND isletme_id=$2',
      [musteriTelefon, isletmeId]
    )).rows[0];

    if (!botDurum) {
      botDurum = (await pool.query(
        'INSERT INTO bot_durum (musteri_telefon, isletme_id, asama) VALUES ($1, $2, $3) RETURNING *',
        [musteriTelefon, isletmeId, 'baslangic']
      )).rows[0];
    }

    const hizmetler = (await pool.query(
      'SELECT * FROM hizmetler WHERE isletme_id=$1 AND aktif=true ORDER BY id', [isletmeId]
    )).rows;

    // Önce state machine (akışIsle) çalışsın — DeepSeek sadece bilinmeyen mesajlarda
    let cevap = await this.akisIsle(metin, botDurum, isletme, hizmetler, musteriTelefon, isletmeId);

    if (cevap) {
      const cevapMetin = typeof cevap === 'object' ? cevap.metin : cevap;
      const butonlar = typeof cevap === 'object' ? cevap.butonlar : null;
      await this.mesajGonder(isletmeId, remoteJid, cevapMetin, butonlar);
      await pool.query(
        'INSERT INTO sohbet_gecmisi (musteri_telefon, isletme_id, yon, mesaj) VALUES ($1, $2, $3, $4)',
        [musteriTelefon, isletmeId, 'giden', cevapMetin]
      );
    }
  }

  async aiAksiyon(aiCevap, metin, botDurum, isletme, hizmetler, musteriTelefon, isletmeId) {
    const randevuService = require('./randevu');
    let cevap = aiCevap.cevap;

    switch (aiCevap.aksiyon) {
      case 'hizmet_listele':
        await this.durumGuncelle(musteriTelefon, isletmeId, 'hizmet_secimi');
        return this.hizmetListesi(isletme, hizmetler);

      case 'hizmet_secildi': {
        const idx = (aiCevap.secilen_hizmet_index || parseInt(metin)) - 1;
        if (idx >= 0 && idx < hizmetler.length) {
          const h = hizmetler[idx];
          await this.durumGuncelle(musteriTelefon, isletmeId, 'tarih_secimi', { secilen_hizmet_id: h.id });
          return `✅ *${h.isim}* seçildi\n\n⏱ Süre: ${h.sure_dk} dk\n💰 Ücret: ${this.fiyatFormat(h.fiyat)} TL\n\n📅 Hangi gün istersiniz?\n\n*1.* Bugün\n*2.* Yarın\n*3.* Bu Hafta`;
        }
        return cevap;
      }

      case 'tarih_secildi': {
        let tarih = aiCevap.secilen_tarih;
        if (metin === '1') tarih = bugunTarih();
        else if (metin === '2') tarih = yarinTarih();
        else if (!tarih) {
          const m = metin.match(/(\d{1,2})[./](\d{1,2})[./](\d{4})/);
          if (m) tarih = `${m[3]}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`;
        }
        if (tarih) {
          const saatler = await randevuService.musaitSaatleriGetir(isletmeId, tarih, botDurum.secilen_calisan_id, botDurum.secilen_hizmet_id);
          if (!saatler.length) return `${this.tarihFormat(tarih)} tarihinde müsait saat yok.\n\n*1.* Bugün\n*2.* Yarın\n*0.* Ana Menü`;
          await this.durumGuncelle(musteriTelefon, isletmeId, 'saat_secimi', { secilen_tarih: tarih });
          const saatFmtAi = saatler.map(s => String(s).substring(0,5));
          let r = `📅 *${this.tarihFormat(tarih)}* müsait saatler:\n\n`;
          saatFmtAi.forEach((s, i) => { r += `*${i+1}.* ${s}\n`; });
          return r + `\nNumara yazarak seçin:`;
        }
        return cevap;
      }

      case 'saat_secildi': {
        const gd = (await pool.query('SELECT * FROM bot_durum WHERE musteri_telefon=$1 AND isletme_id=$2', [musteriTelefon, isletmeId])).rows[0];
        const saatler = await randevuService.musaitSaatleriGetir(isletmeId, gd.secilen_tarih, gd.secilen_calisan_id, gd.secilen_hizmet_id);
        let saat = aiCevap.secilen_saat;
        const si = parseInt(metin) - 1;
        if (si >= 0 && si < saatler.length) saat = saatler[si];
        if (saat && saatler.includes(saat)) {
          await this.durumGuncelle(musteriTelefon, isletmeId, 'onay', { secilen_saat: saat });
          const hz = gd.secilen_hizmet_id ? (await pool.query('SELECT * FROM hizmetler WHERE id=$1', [gd.secilen_hizmet_id])).rows[0] : null;
          let ozetAi = `📋 *Randevu Özeti*\n\n`;
          ozetAi += `🏥 ${isletme.isim}\n`;
          if (hz) ozetAi += `✂️ ${hz.isim}\n`;
          ozetAi += `📅 ${this.tarihFormat(gd.secilen_tarih)}\n`;
          ozetAi += `🕐 ${this.saatFormat(saat)}\n`;
          if (hz) ozetAi += `💰 ${this.fiyatFormat(hz.fiyat)} TL\n`;
          ozetAi += `\nHer şey doğru mu?\n\n*1.* ✅ Onayla\n*2.* ❌ İptal`;
          return ozetAi;
        }
        return cevap;
      }

      case 'randevu_onayla': {
        const sd = (await pool.query('SELECT * FROM bot_durum WHERE musteri_telefon=$1 AND isletme_id=$2', [musteriTelefon, isletmeId])).rows[0];
        if (metin === '1' || metin.toLowerCase().includes('evet') || metin.toLowerCase().includes('onayla')) {
          const sonuc = await randevuService.randevuOlustur({ isletmeId, musteriTelefon, hizmetId: sd.secilen_hizmet_id, tarih: sd.secilen_tarih, saat: sd.secilen_saat });
          await this.durumGuncelle(musteriTelefon, isletmeId, 'ana_menu', { secilen_hizmet_id: null, secilen_tarih: null, secilen_saat: null });
          let tebrikAi = `✅ *Randevunuz Oluşturuldu!*\n\n`;
          tebrikAi += `🏥 ${isletme.isim}\n`;
          if (sonuc.hizmet) tebrikAi += `✂️ ${sonuc.hizmet.isim}\n`;
          tebrikAi += `📅 ${this.tarihFormat(sd.secilen_tarih)}\n`;
          tebrikAi += `🕐 ${this.saatFormat(sd.secilen_saat)}\n`;
          tebrikAi += `\n⏰ Randevunuzdan 1 saat önce hatırlatma alacaksınız.\n\nGörüşmek üzere! 😊`;
          return tebrikAi;
        }
        await this.durumGuncelle(musteriTelefon, isletmeId, 'ana_menu', { secilen_hizmet_id: null, secilen_tarih: null, secilen_saat: null });
        return await this.anaMenu(isletme, musteriTelefon, isletmeId, hizmetler);
      }

      case 'iptal':
        await this.durumGuncelle(musteriTelefon, isletmeId, 'ana_menu', { secilen_hizmet_id: null, secilen_tarih: null, secilen_saat: null });
        return { metin: cevap + '\n\nRandevu almak için *1* yazın.', butonlar: null };

      default:
        return cevap;
    }
  }

  async akisIsle(metin, botDurum, isletme, hizmetler, musteriTelefon, isletmeId) {
    const metinKucuk = metin.toLowerCase();

    // Merhaba / başlangıç / ana menü
    const merhabaSozler = ['merhaba', 'selam', 'hi', 'hello', 'alo', '/start', '0', 'ana menü', 'menu', 'menü', 'başlat'];
    if (merhabaSozler.includes(metinKucuk) || botDurum.asama === 'baslangic') {
      await this.durumGuncelle(musteriTelefon, isletmeId, 'ana_menu');
      return await this.anaMenu(isletme, musteriTelefon, isletmeId, hizmetler);
    }

    // İptal butonu — randevu seçim listesine yönlendir
    if ((metinKucuk.includes('iptal') || metinKucuk.includes('❌')) && botDurum.asama !== 'randevu_iptal_secim' && botDurum.asama !== 'iptal_onay') {
      const randevuService = require('./randevu');
      const randevular = await randevuService.musteriRandevulari(musteriTelefon, isletmeId);
      if (!randevular.length) {
        return { metin: `Aktif randevunuz bulunmuyor.\n\n📅 Randevu almak için *1* yazın.`, butonlar: null };
      }
      await this.durumGuncelle(musteriTelefon, isletmeId, 'randevu_iptal_secim');
      let txt = `❌ *Randevu İptali*\n\nHangi randevuyu iptal etmek istiyorsunuz?\n\n`;
      randevular.forEach((r, i) => {
        txt += `*${i+1}.* ${r.hizmet_isim || 'Randevu'}\n     📅 ${this.tarihFormat(r.tarih)} - 🕐 ${String(r.saat).substring(0,5)}\n\n`;
      });
      txt += `*0.* Vazgeç`;
      return { metin: txt, butonlar: null };
    }

    switch (botDurum.asama) {
      case 'ana_menu': {
        const randevuAl = metin === '1' || metinKucuk.includes('randevu al');
        const randevularim = metin === '2' || metinKucuk.includes('randevularım');
        const randevuIptal = metin === '3' || metinKucuk.includes('randevu iptal');

        // Konum bilgisi
        if (metinKucuk === 'konum' || metinKucuk.includes('adres') || metin === '4') {
          const adres = isletme.adres || 'Adres bilgisi bulunamadı';
          const sehir = isletme.sehir || '';
          const ilce = isletme.ilce || '';
          const tel = isletme.telefon || '';
          const mapsLink = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(adres + ' ' + ilce + ' ' + sehir)}`;
          return { metin: `📍 *Adresimiz*\n\n${isletme.isim}\n📍 ${adres}${ilce ? ', ' + ilce : ''}${sehir ? ', ' + sehir : ''}\n${tel ? '📞 ' + tel + '\n' : ''}\n🗺 Google Maps: ${mapsLink}\n\nRandevu almak için *1* yazın.`, butonlar: null };
        }
        // Çalışma saatleri
        if (metinKucuk === 'saatler' || metinKucuk.includes('çalışma saat') || metin === '5') {
          const bas = isletme.calisma_baslangic ? String(isletme.calisma_baslangic).substring(0,5) : '09:00';
          const bit = isletme.calisma_bitis ? String(isletme.calisma_bitis).substring(0,5) : '18:00';
          const kapaliGunler = isletme.kapali_gunler || '';
          const gunIsimleri = ['Pazar','Pazartesi','Salı','Çarşamba','Perşembe','Cuma','Cumartesi'];
          const kapaliList = kapaliGunler.split(',').filter(g => g.trim()).map(g => gunIsimleri[parseInt(g.trim())] || g.trim());
          let txt = `🕐 *Çalışma Saatlerimiz*\n\n✅ Açık: ${bas} - ${bit}\n`;
          if (kapaliList.length > 0) txt += `❌ Kapalı: ${kapaliList.join(', ')}\n`;
          txt += `\n⏱ Süre: ${isletme.randevu_suresi_dk || 30} dk seans\n\nRandevu almak için *1* yazın.`;
          return { metin: txt, butonlar: null };
        }
        if (randevuAl) {
          await this.durumGuncelle(musteriTelefon, isletmeId, 'hizmet_secimi');
          return this.hizmetListesi(isletme, hizmetler);
        }
        if (randevularim) {
          const randevuService = require('./randevu');
          const randevular = await randevuService.musteriRandevulari(musteriTelefon, isletmeId);
          if (randevular.length === 0) return { metin: `Aktif randevunuz bulunmuyor.\n\nRandevu almak için *1* yazın.`, butonlar: null };
          let metin2 = `📋 *Randevularınız*\n\n`;
          randevular.slice(0, 3).forEach((r, i) => {
            const saatStr = String(r.saat).substring(0, 5);
            metin2 += `*${i+1}.* ${r.hizmet_isim || 'Hizmet'}\n     📅 ${this.tarihFormat(r.tarih)} - 🕐 ${saatStr}\n\n`;
          });
          metin2 += `*0.* Ana Menü`;
          return { metin: metin2, butonlar: null };
        }
        if (randevuIptal) {
          const randevuService = require('./randevu');
          const randevular = await randevuService.musteriRandevulari(musteriTelefon, isletmeId);
          if (!randevular.length) {
            return { metin: `Aktif randevunuz bulunmuyor.\n\n📅 Randevu almak için *1* yazın.`, butonlar: null };
          }
          await this.durumGuncelle(musteriTelefon, isletmeId, 'randevu_iptal_secim');
          let txt = `❌ *Randevu İptali*\n\nHangi randevuyu iptal etmek istiyorsunuz?\n\n`;
          randevular.forEach((r, i) => {
            txt += `*${i+1}.* ${r.hizmet_isim || 'Randevu'}\n     📅 ${this.tarihFormat(r.tarih)} - 🕐 ${String(r.saat).substring(0,5)}\n\n`;
          });
          txt += `*0.* Vazgeç`;
          return { metin: txt, butonlar: null };
        }
        // Bilinmeyen mesaj → DeepSeek
        const deepseekFb = require('./deepseek');
        const aiCevap = await deepseekFb.serbetCevap(metin, isletme, hizmetler, 'whatsapp');
        if (aiCevap) return { metin: aiCevap + '\n\nRandevu almak için *1* yazın.', butonlar: null };
        return await this.anaMenu(isletme, musteriTelefon, isletmeId, hizmetler);
      }

      case 'hizmet_secimi': {
        if (metinKucuk === '0' || metinKucuk.includes('ana menü') || metinKucuk.includes('geri')) {
          await this.durumGuncelle(musteriTelefon, isletmeId, 'ana_menu');
          return await this.anaMenu(isletme, musteriTelefon, isletmeId, hizmetler);
        }
        let secilenHizmet = null;
        const idx = parseInt(metin) - 1;
        if (idx >= 0 && idx < hizmetler.length) {
          secilenHizmet = hizmetler[idx];
        } else {
          secilenHizmet = hizmetler.find(h => metinKucuk.includes(h.isim.toLowerCase()));
        }
        if (secilenHizmet) {
          // Çalışan kontrolü (hizmete uygun çalışanları getir)
          const randevuService = require('./randevu');
          const calisanlar = await randevuService.uygunCalisanlar(isletmeId, secilenHizmet.id);
          if (calisanlar.length > 1) {
            // Birden fazla çalışan → seçtir
            await this.durumGuncelle(musteriTelefon, isletmeId, 'calisan_secimi', { secilen_hizmet_id: secilenHizmet.id });
            let txt = `✅ *${secilenHizmet.isim}* seçildi\n\n⏱ Süre: ${secilenHizmet.sure_dk} dk\n💰 Ücret: ${this.fiyatFormat(secilenHizmet.fiyat)} TL\n\n👤 Çalışan seçin:\n\n`;
            calisanlar.forEach((c, i) => { txt += `*${i+1}.* ${c.isim}\n`; });
            return { metin: txt, butonlar: null };
          } else if (calisanlar.length === 1) {
            // Tek çalışan → otomatik ata
            await this.durumGuncelle(musteriTelefon, isletmeId, 'tarih_secimi', { secilen_hizmet_id: secilenHizmet.id, secilen_calisan_id: calisanlar[0].id });
            return { metin: `✅ *${secilenHizmet.isim}* seçildi\n\n⏱ Süre: ${secilenHizmet.sure_dk} dk\n💰 Ücret: ${this.fiyatFormat(secilenHizmet.fiyat)} TL\n👤 Çalışan: ${calisanlar[0].isim}\n\n📅 Hangi gün istersiniz?\n\n*1.* Bugün\n*2.* Yarın\n*3.* Bu Hafta`, butonlar: null };
          } else {
            // Çalışan yok → null bırak, direkt tarih seçimine geç
            await this.durumGuncelle(musteriTelefon, isletmeId, 'tarih_secimi', { secilen_hizmet_id: secilenHizmet.id });
            return { metin: `✅ *${secilenHizmet.isim}* seçildi\n\n⏱ Süre: ${secilenHizmet.sure_dk} dk\n💰 Ücret: ${this.fiyatFormat(secilenHizmet.fiyat)} TL\n\n📅 Hangi gün istersiniz?\n\n*1.* Bugün\n*2.* Yarın\n*3.* Bu Hafta`, butonlar: null };
          }
        }
        const deepseek2 = require('./deepseek');
        const ai2 = await deepseek2.serbetCevap(metin, isletme, hizmetler, 'whatsapp');
        if (ai2) return { metin: ai2 + '\n\nRandevu almak için *1* yazın.', butonlar: null };
        return this.hizmetListesi(isletme, hizmetler);
      }

      case 'calisan_secimi': {
        if (metinKucuk === '0' || metinKucuk.includes('ana menü') || metinKucuk.includes('geri')) {
          await this.durumGuncelle(musteriTelefon, isletmeId, 'hizmet_secimi');
          return this.hizmetListesi(isletme, hizmetler);
        }
        const calisanlarQ = (await pool.query('SELECT * FROM calisanlar WHERE isletme_id=$1 AND (aktif IS NULL OR aktif=true) ORDER BY id', [isletmeId])).rows;
        let secilenCalisan = null;
        const cIdx = parseInt(metin) - 1;
        if (cIdx >= 0 && cIdx < calisanlarQ.length) {
          secilenCalisan = calisanlarQ[cIdx];
        } else {
          secilenCalisan = calisanlarQ.find(c => metinKucuk.includes(c.isim.toLowerCase()));
        }
        if (secilenCalisan) {
          await this.durumGuncelle(musteriTelefon, isletmeId, 'tarih_secimi', { secilen_calisan_id: secilenCalisan.id });
          return { metin: `👤 *${secilenCalisan.isim}* seçildi\n\n📅 Hangi gün istersiniz?\n\n*1.* Bugün\n*2.* Yarın\n*3.* Bu Hafta`, butonlar: null };
        }
        let txt = `👤 Çalışan seçin:\n\n`;
        calisanlarQ.forEach((c, i) => { txt += `*${i+1}.* ${c.isim}\n`; });
        return { metin: txt, butonlar: null };
      }

      case 'tarih_secimi': {
        let secilenTarih = null;
        if (metin === '1' || metinKucuk.includes('bugün')) secilenTarih = bugunTarih();
        else if (metin === '2' || metinKucuk.includes('yarın')) {
          secilenTarih = yarinTarih();
        } else if (metin === '3' || metinKucuk.includes('başka') || metinKucuk.includes('bu hafta')) {
          await this.durumGuncelle(musteriTelefon, isletmeId, 'hafta_gun_secimi');
          return this.haftaSecenekleri();
        } else if (metinKucuk === '0' || metinKucuk.includes('ana menü')) {
          await this.durumGuncelle(musteriTelefon, isletmeId, 'ana_menu');
          return await this.anaMenu(isletme, musteriTelefon, isletmeId, hizmetler);
        } else {
          secilenTarih = this._tarihParse(metin, metinKucuk);
        }
        if (secilenTarih) {
          return await this._tarihSecildi(secilenTarih, musteriTelefon, isletmeId, isletme, hizmetler);
        }
        return { metin: `Tarihi anlayamadım.\n\n*1.* Bugün\n*2.* Yarın\n*3.* Bu Hafta`, butonlar: null };
      }

      case 'hafta_gun_secimi': {
        if (metinKucuk === '0' || metinKucuk.includes('ana menü')) {
          await this.durumGuncelle(musteriTelefon, isletmeId, 'ana_menu');
          return await this.anaMenu(isletme, musteriTelefon, isletmeId, hizmetler);
        }
        let secilenTarih = null;
        // Numara ile gun secimi (1-7)
        const gunIdx = parseInt(metin);
        if (gunIdx >= 1 && gunIdx <= 7) {
          secilenTarih = gunSonraTarih(gunIdx - 1);
        }
        // Diger formatlar
        if (!secilenTarih) {
          secilenTarih = this._tarihParse(metin, metinKucuk);
        }
        if (secilenTarih) {
          await this.durumGuncelle(musteriTelefon, isletmeId, 'tarih_secimi');
          return await this._tarihSecildi(secilenTarih, musteriTelefon, isletmeId, isletme, hizmetler);
        }
        return this.haftaSecenekleri();
      }

      case 'saat_secimi': {
        if (metinKucuk === '0' || metinKucuk.includes('ana menü')) {
          await this.durumGuncelle(musteriTelefon, isletmeId, 'ana_menu');
          return await this.anaMenu(isletme, musteriTelefon, isletmeId, hizmetler);
        }
        const randevuService = require('./randevu');
        const guncelDurum = (await pool.query('SELECT * FROM bot_durum WHERE musteri_telefon=$1 AND isletme_id=$2', [musteriTelefon, isletmeId])).rows[0];
        const saatler = await randevuService.musaitSaatleriGetir(isletmeId, guncelDurum.secilen_tarih, guncelDurum.secilen_calisan_id, guncelDurum.secilen_hizmet_id);
        const saatFmt = saatler.map(s => String(s).substring(0,5));
        let secilenSaat = null;
        if (saatFmt.includes(metin)) secilenSaat = metin;
        else if (saatler.includes(metin)) secilenSaat = String(metin).substring(0,5);
        else { const si = parseInt(metin) - 1; if (si >= 0 && si < saatFmt.length) secilenSaat = saatFmt[si]; }

        if (secilenSaat) {
          await this.durumGuncelle(musteriTelefon, isletmeId, 'onay', { secilen_saat: secilenSaat });
          const hz = guncelDurum.secilen_hizmet_id ? (await pool.query('SELECT * FROM hizmetler WHERE id=$1', [guncelDurum.secilen_hizmet_id])).rows[0] : null;
          const cl = guncelDurum.secilen_calisan_id ? (await pool.query('SELECT * FROM calisanlar WHERE id=$1', [guncelDurum.secilen_calisan_id])).rows[0] : null;
          let ozet = `📋 *Randevu Özeti*\n\n`;
          ozet += `🏥 ${isletme.isim}\n`;
          if (hz) ozet += `✂️ ${hz.isim}\n`;
          if (cl) ozet += `👤 ${cl.isim}\n`;
          ozet += `📅 ${this.tarihFormat(guncelDurum.secilen_tarih)}\n`;
          ozet += `🕐 ${secilenSaat}\n`;
          if (hz) ozet += `💰 ${this.fiyatFormat(hz.fiyat)} TL\n`;
          ozet += `\nHer şey doğru mu?\n\n*1.* ✅ Onayla\n*2.* ❌ İptal\n\n💬 Not eklemek için yazabilirsiniz.`;
          return { metin: ozet, butonlar: null };
        }
        let txt = `🕐 Saat seçin:\n\n`;
        saatFmt.forEach((s, i) => { txt += `*${i+1}.* ${s}\n`; });
        txt += `\nNumara yazarak seçin:`;
        return { metin: txt, butonlar: null };
      }

      case 'onay': {
        const randevuService = require('./randevu');
        if (metin === '1' || metinKucuk.includes('evet') || metinKucuk.includes('onayla')) {
          const sd = (await pool.query('SELECT * FROM bot_durum WHERE musteri_telefon=$1 AND isletme_id=$2', [musteriTelefon, isletmeId])).rows[0];
          const sonuc = await randevuService.randevuOlustur({ isletmeId, musteriTelefon, hizmetId: sd.secilen_hizmet_id, calisanId: sd.secilen_calisan_id, tarih: sd.secilen_tarih, saat: sd.secilen_saat });
          await this.durumGuncelle(musteriTelefon, isletmeId, 'ana_menu', { secilen_hizmet_id: null, secilen_tarih: null, secilen_saat: null, secilen_calisan_id: null });
          const clOnay = sd.secilen_calisan_id ? (await pool.query('SELECT isim FROM calisanlar WHERE id=$1', [sd.secilen_calisan_id])).rows[0] : null;

          // Kapora gerekiyorsa ödeme linki gönder
          if (sonuc.kapora && sonuc.kapora.gerekli) {
            try {
              const shopierService = require('./shopierService');
              const urun = await shopierService.urunOlustur({
                baslik: `Kapora - ${isletme.isim} - ${sonuc.hizmet?.isim || 'Randevu'}`,
                aciklama: `${sd.secilen_tarih} ${sd.secilen_saat} randevusu için kapora ödemesi`,
                fiyat: sonuc.kapora.tutar
              });
              // Randevuya Shopier bilgilerini kaydet
              await pool.query('UPDATE randevular SET kapora_link=$1, kapora_shopier_urun_id=$2 WHERE id=$3',
                [urun.url, urun.id, sonuc.randevu.id]);
              let kaporaMesaj = `📋 *Randevunuz kaydedildi!*\n\n`;
              kaporaMesaj += `🏥 ${isletme.isim}\n`;
              if (sonuc.hizmet) kaporaMesaj += `✂️ ${sonuc.hizmet.isim}\n`;
              if (clOnay) kaporaMesaj += `👤 ${clOnay.isim}\n`;
              kaporaMesaj += `📅 ${this.tarihFormat(sd.secilen_tarih)}\n`;
              kaporaMesaj += `🕐 ${this.saatFormat(sd.secilen_saat)}\n`;
              kaporaMesaj += `\n💳 *Kapora: ${sonuc.kapora.tutar} ₺* (%${sonuc.kapora.yuzde})\n`;
              kaporaMesaj += `\n⚠️ Randevunuz, kapora ödemeniz onaylandıktan sonra kesinleşecektir.\n`;
              kaporaMesaj += `\n🔗 Ödeme linki: ${urun.url}`;
              kaporaMesaj += `\n\n⏳ Ödemeniz otomatik kontrol edilecektir.`;
              return { metin: kaporaMesaj, butonlar: null };
            } catch (err) {
              console.error('❌ Kapora ödeme linki hatası:', err.message);
              // Shopier hatası — randevuyu yine de normal onayla
              await pool.query("UPDATE randevular SET durum='onaylandi', kapora_durumu='yok' WHERE id=$1", [sonuc.randevu.id]);
            }
          }

          let tebrik = `✅ *Randevunuz Oluşturuldu!*\n\n`;
          tebrik += `🏥 ${isletme.isim}\n`;
          if (sonuc.hizmet) tebrik += `✂️ ${sonuc.hizmet.isim}\n`;
          if (clOnay) tebrik += `👤 ${clOnay.isim}\n`;
          tebrik += `📅 ${this.tarihFormat(sd.secilen_tarih)}\n`;
          tebrik += `🕐 ${this.saatFormat(sd.secilen_saat)}\n`;
          tebrik += `\n⏰ Randevunuzdan 1 gün ve 1 saat önce hatırlatma alacaksınız.`;
          tebrik += `\n\nGörüşmek üzere! 😊`;
          tebrik += `\n\n📅 Yeni randevu için *1* yazın.`;
          return { metin: tebrik, butonlar: null };
        } else if (metinKucuk !== '2' && !metinKucuk.includes('iptal') && !metinKucuk.includes('hayır') && metin.length > 1) {
          // Musteri not yazdi - onaylayip notu kaydet
          const sd = (await pool.query('SELECT * FROM bot_durum WHERE musteri_telefon=$1 AND isletme_id=$2', [musteriTelefon, isletmeId])).rows[0];
          const sonuc = await randevuService.randevuOlustur({ isletmeId, musteriTelefon, hizmetId: sd.secilen_hizmet_id, calisanId: sd.secilen_calisan_id, tarih: sd.secilen_tarih, saat: sd.secilen_saat });
          if (sonuc && sonuc.randevu) {
            await pool.query('UPDATE randevular SET not_text=$1 WHERE id=$2', [metin, sonuc.randevu.id]);
          }
          await this.durumGuncelle(musteriTelefon, isletmeId, 'ana_menu', { secilen_hizmet_id: null, secilen_tarih: null, secilen_saat: null, secilen_calisan_id: null });
          return { metin: `✅ *Randevunuz oluşturuldu!*\n\n💬 Notunuz: "${metin}"\n\nGörüşmek üzere! 😊`, butonlar: null };
        }
        await this.durumGuncelle(musteriTelefon, isletmeId, 'ana_menu', { secilen_hizmet_id: null, secilen_tarih: null, secilen_saat: null, secilen_calisan_id: null });
        return await this.anaMenu(isletme, musteriTelefon, isletmeId, hizmetler);
      }

      case 'randevu_iptal_secim': {
        // Kullanıcı numara ile randevu seçiyor
        if (metinKucuk === '0' || metinKucuk.includes('vazgeç') || metinKucuk.includes('geri')) {
          await this.durumGuncelle(musteriTelefon, isletmeId, 'ana_menu');
          return await this.anaMenu(isletme, musteriTelefon, isletmeId, hizmetler);
        }
        const randevuService = require('./randevu');
        const randevular = await randevuService.musteriRandevulari(musteriTelefon, isletmeId);
        if (!randevular.length) {
          await this.durumGuncelle(musteriTelefon, isletmeId, 'ana_menu');
          return { metin: `Aktif randevunuz bulunmuyor.\n\n📅 Randevu almak için *1* yazın.`, butonlar: null };
        }
        const secimIdx = parseInt(metin) - 1;
        let secilenRandevu = null;
        if (secimIdx >= 0 && secimIdx < randevular.length) {
          secilenRandevu = randevular[secimIdx];
        } else {
          // Tarih ile eşleştirmeyi dene ("9 nisan" gibi)
          const temiz = metinKucuk.replace(/[^a-z0-9ğüşıöç\s]/gi, '').trim();
          for (const r of randevular) {
            const rTarih = this.tarihFormat(r.tarih).toLowerCase();
            if (temiz.includes(rTarih.split(' ')[0]) || rTarih.includes(temiz.split(' ')[0])) {
              secilenRandevu = r; break;
            }
          }
        }
        if (secilenRandevu) {
          await this.durumGuncelle(musteriTelefon, isletmeId, 'iptal_onay', { iptal_randevu_id: secilenRandevu.id });
          return { metin: `❌ *Bu randevuyu iptal etmek istediğinize emin misiniz?*\n\n✂️ ${secilenRandevu.hizmet_isim || 'Randevu'}\n📅 ${this.tarihFormat(secilenRandevu.tarih)}\n🕐 ${String(secilenRandevu.saat).substring(0,5)}\n\n*1.* ✅ Evet, iptal et\n*2.* ↩️ Geri dön`, butonlar: null };
        }
        // Anlaşılamadı, listeyi tekrar göster
        let txt = `Anlayamadım. Numara yazarak seçin:\n\n`;
        randevular.forEach((r, i) => {
          txt += `*${i+1}.* ${r.hizmet_isim || 'Randevu'}\n     📅 ${this.tarihFormat(r.tarih)} - 🕐 ${String(r.saat).substring(0,5)}\n\n`;
        });
        txt += `*0.* Vazgeç`;
        return { metin: txt, butonlar: null };
      }

      case 'iptal_onay': {
        const randevuService = require('./randevu');
        if (metin === '1' || metinKucuk.includes('evet') || metinKucuk.includes('iptal et')) {
          const gd = (await pool.query('SELECT iptal_randevu_id FROM bot_durum WHERE musteri_telefon=$1 AND isletme_id=$2', [musteriTelefon, isletmeId])).rows[0];
          if (gd?.iptal_randevu_id) {
            await randevuService.randevuIptal(gd.iptal_randevu_id);
          }
          await this.durumGuncelle(musteriTelefon, isletmeId, 'ana_menu', { iptal_randevu_id: null });
          return { metin: `✅ Randevunuz başarıyla iptal edildi.\n\n📅 Yeni randevu için *1* yazın.`, butonlar: null };
        }
        // Geri dön veya vazgeç
        await this.durumGuncelle(musteriTelefon, isletmeId, 'ana_menu', { iptal_randevu_id: null });
        return await this.anaMenu(isletme, musteriTelefon, isletmeId, hizmetler);
      }

      default:
        return await this.anaMenu(isletme, musteriTelefon, isletmeId, hizmetler);
    }
  }

  async anaMenu(isletme, musteriTelefon, isletmeId, hizmetler) {
    // Musteri ismini DB'den al (pushName kaydedilmis olmali)
    let musteriAd = '';
    try {
      const mRes = await pool.query('SELECT isim FROM musteriler WHERE telefon=$1', [musteriTelefon]);
      if (mRes.rows[0] && mRes.rows[0].isim && mRes.rows[0].isim !== musteriTelefon) {
        musteriAd = mRes.rows[0].isim;
      }
    } catch(e) {}

    const selamIsim = musteriAd ? ` ${musteriAd}` : '';
    const msg = `Merhaba${selamIsim}! 👋\n*${isletme.isim}*'e hoş geldiniz.\n\nSize nasıl yardımcı olabilirim?\n\n*1.* 📅 Randevu Al\n*2.* 📋 Randevularım\n*3.* ❌ Randevu İptal\n\nNumara yazarak seçin:`;

    return { metin: msg, butonlar: null };
  }

  hizmetListesi(isletme, hizmetler) {
    let metin = `✂️ *${isletme.isim} - Hizmetlerimiz*\n\n`;
    hizmetler.forEach((h, i) => {
      metin += `*${i+1}.* ${h.isim} - ${h.sure_dk}dk - ${this.fiyatFormat(h.fiyat)} TL\n`;
    });
    metin += `\nNumara yazarak seçin:`;
    return { metin, butonlar: null };
  }

  haftaSecenekleri() {
    const gunler = ['Pazar','Pazartesi','Salı','Çarşamba','Perşembe','Cuma','Cumartesi'];
    const aylar = ['Ocak','Şubat','Mart','Nisan','Mayıs','Haziran','Temmuz','Ağustos','Eylül','Ekim','Kasım','Aralık'];
    let cevap = `📅 *Gün Seçin:*\n\n`;
    for (let i = 0; i < 7; i++) {
      const t = new Date(); t.setDate(t.getDate() + i);
      const label = `${t.getDate()} ${aylar[t.getMonth()]} ${gunler[t.getDay()]}`;
      cevap += `*${i+1}.* ${label}\n`;
    }
    cevap += `\nNumara yazarak seçin:`;
    return { metin: cevap, butonlar: null };
  }

  _tarihParse(metin, metinKucuk) {
    // Parantez icinde tarih: "Cuma (4.4)"
    const parantezMatch = metin.match(/\((\d{1,2})\.(\d{1,2})\)/);
    if (parantezMatch) {
      const gun = parantezMatch[1].padStart(2, '0');
      const ay = parantezMatch[2].padStart(2, '0');
      return `${new Date().getFullYear()}-${ay}-${gun}`;
    }
    // gun.ay formati: "6.4"
    const gunAyMatch = metin.match(/^(\d{1,2})\.(\d{1,2})$/);
    if (gunAyMatch) {
      const gun = gunAyMatch[1].padStart(2, '0');
      const ay = gunAyMatch[2].padStart(2, '0');
      return `${new Date().getFullYear()}-${ay}-${gun}`;
    }
    // Gun ismi: "Pazartesi" — UZUN isimler once
    const gunSirali = [
      {isim:'pazartesi', idx:1}, {isim:'persembe', idx:4}, {isim:'carsamba', idx:3},
      {isim:'cumartesi', idx:6}, {isim:'pazar', idx:0}, {isim:'sali', idx:2},
      {isim:'cuma', idx:5}
    ];
    const temiz = metinKucuk.replace(/[\u0131]/g,'i').replace(/[\u015f]/g,'s').replace(/[\u00e7]/g,'c').replace(/[\u00f6]/g,'o').replace(/[\u00fc]/g,'u').replace(/[\u011f]/g,'g');
    for (const g of gunSirali) {
      if (temiz.startsWith(g.isim)) {
        const bugunGun = new Date().getDay();
        let fark = g.idx - bugunGun;
        if (fark <= 0) fark += 7;
        return gunSonraTarih(fark);
      }
    }
    // Tam tarih: 06.04.2026
    const parca = metin.match(/(\d{1,2})[./](\d{1,2})[./](\d{4})/);
    if (parca) return `${parca[3]}-${parca[2].padStart(2,'0')}-${parca[1].padStart(2,'0')}`;
    return null;
  }

  async _tarihSecildi(secilenTarih, musteriTelefon, isletmeId, isletme, hizmetler) {
    const randevuService = require('./randevu');
    const gdTarih = (await pool.query('SELECT secilen_calisan_id, secilen_hizmet_id FROM bot_durum WHERE musteri_telefon=$1 AND isletme_id=$2', [musteriTelefon, isletmeId])).rows[0];
    const saatler = await randevuService.musaitSaatleriGetir(isletmeId, secilenTarih, gdTarih?.secilen_calisan_id, gdTarih?.secilen_hizmet_id);
    if (saatler.length === 0) {
      try { await pool.query('INSERT INTO bekleme_listesi (musteri_telefon, isletme_id, hizmet_id, istenen_tarih) VALUES ($1,$2,$3,$4)',
        [musteriTelefon, isletmeId, gdTarih?.secilen_hizmet_id || null, secilenTarih]); } catch(e) {}
      return { metin: `${this.tarihFormat(secilenTarih)} tarihinde müsait saat yok.\n\n📋 Bekleme listesine eklendiniz.\n\n*1.* Bugün\n*2.* Yarın\n*3.* Başka Gün`, butonlar: null };
    }
    await this.durumGuncelle(musteriTelefon, isletmeId, 'saat_secimi', { secilen_tarih: secilenTarih });
    const saatFmt = saatler.map(s => String(s).substring(0,5));

    // Sabah / Ogle / Aksam gruplama
    const sabah = [], ogle = [], aksam = [];
    saatFmt.forEach((s, i) => {
      const saat = parseInt(s.split(':')[0]);
      if (saat < 12) sabah.push({s, n: i+1});
      else if (saat < 17) ogle.push({s, n: i+1});
      else aksam.push({s, n: i+1});
    });

    let txt = `📅 *${this.tarihFormat(secilenTarih)}* müsait saatler:\n`;
    if (sabah.length > 0) {
      txt += `\n🌅 *Sabah:*\n`;
      sabah.forEach(x => { txt += `*${x.n}.* ${x.s}\n`; });
    }
    if (ogle.length > 0) {
      txt += `\n☀️ *Öğle:*\n`;
      ogle.forEach(x => { txt += `*${x.n}.* ${x.s}\n`; });
    }
    if (aksam.length > 0) {
      txt += `\n🌙 *Akşam:*\n`;
      aksam.forEach(x => { txt += `*${x.n}.* ${x.s}\n`; });
    }
    txt += `\nNumara yazarak seçin:`;
    return { metin: txt, butonlar: null };
  }

  async durumGuncelle(musteriTelefon, isletmeId, asama, ekstra = {}) {
    const fields = ['asama = $3', 'son_aktivite = NOW()'];
    const values = [musteriTelefon, isletmeId, asama];
    let i = 4;
    for (const [k, v] of Object.entries(ekstra)) { fields.push(`${k} = $${i}`); values.push(v); i++; }
    await pool.query(`UPDATE bot_durum SET ${fields.join(', ')} WHERE musteri_telefon=$1 AND isletme_id=$2`, values);
  }

  tarihFormat(tarih) {
    const d = new Date(tarih);
    const gunler = ['Pazar','Pazartesi','Salı','Çarşamba','Perşembe','Cuma','Cumartesi'];
    const aylar = ['Ocak','Şubat','Mart','Nisan','Mayıs','Haziran','Temmuz','Ağustos','Eylül','Ekim','Kasım','Aralık'];
    return `${d.getDate()} ${aylar[d.getMonth()]} ${gunler[d.getDay()]}`;
  }

  fiyatFormat(fiyat) {
    const f = parseFloat(fiyat);
    if (isNaN(f)) return fiyat;
    return f % 1 === 0 ? f.toLocaleString('tr-TR') : f.toLocaleString('tr-TR', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  }

  saatFormat(saat) {
    return String(saat).substring(0, 5);
  }
}

module.exports = new WhatsAppWebService();
