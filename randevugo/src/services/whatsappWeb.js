const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion, makeCacheableSignalKeyStore } = require('@whiskeysockets/baileys');
const qrcode = require('qrcode');
const pool = require('../config/db');
const EventEmitter = require('events');
const fs = require('fs');
const path = require('path');
const pino = require('pino');

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

          if (statusCode === DisconnectReason.loggedOut) {
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
      sock.ev.on('messages.upsert', async ({ messages, type }) => {
        if (type !== 'notify') return;
        for (const msg of messages) {
          if (msg.key.fromMe) continue;
          if (!msg.message) continue;
          try {
            await this.mesajIsle(msg, isletmeId);
          } catch (err) {
            console.error(`❌ Mesaj işleme hatası [${isletmeIsim}]:`, err.message);
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

  // Baileys mesajdan metin çıkart
  _getMsgText(msg) {
    return msg.message?.conversation
      || msg.message?.extendedTextMessage?.text
      || msg.message?.buttonsResponseMessage?.selectedButtonId
      || msg.message?.listResponseMessage?.singleSelectReply?.selectedRowId
      || '';
  }

  async mesajGonder(isletmeId, hedef, mesaj, butonlar = null) {
    const state = this.isletmeler[isletmeId];
    if (!state || state.durum !== 'bagli') return { success: false, hata: 'Bağlı değil' };
    try {
      const jid = hedef.includes('@') ? hedef : `${hedef.replace(/^\+/, '')}@s.whatsapp.net`;
      await state.sock.sendMessage(jid, { text: mesaj });
      return { success: true };
    } catch (err) {
      return { success: false, hata: err.message };
    }
  }

  async mesajIsle(msg, isletmeId) {
    const metin = (this._getMsgText(msg) || '').trim();
    if (!metin) return;
    const remoteJid = msg.key.remoteJid;
    const musteriTelefon = remoteJid.replace('@s.whatsapp.net', '').replace('@c.us', '');

    const isletme = (await pool.query('SELECT * FROM isletmeler WHERE id=$1', [isletmeId])).rows[0];
    if (!isletme) return;

    // Müşteriyi kaydet / bul
    await pool.query(
      'INSERT INTO musteriler (telefon, isim) VALUES ($1, $2) ON CONFLICT (telefon) DO NOTHING',
      [musteriTelefon, musteriTelefon]
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

    const randevuService = require('./randevu');
    const bugun = new Date().toISOString().split('T')[0];
    const musaitSaatler = await randevuService.musaitSaatleriGetir(isletmeId, botDurum.secilen_tarih || bugun);

    // DeepSeek'e sor, hata/key yoksa state machine'e düş
    const deepseekService = require('./deepseek');
    const aiCevap = await deepseekService.mesajAnla(metin, isletme, botDurum, musaitSaatler, hizmetler);

    let cevap;
    if (aiCevap) {
      cevap = await this.aiAksiyon(aiCevap, metin, botDurum, isletme, hizmetler, musteriTelefon, isletmeId);
    } else {
      cevap = await this.akisIsle(metin, botDurum, isletme, hizmetler, musteriTelefon, isletmeId);
    }

    if (cevap) {
      const metin = typeof cevap === 'object' ? cevap.metin : cevap;
      const butonlar = typeof cevap === 'object' ? cevap.butonlar : null;
      await this.mesajGonder(isletmeId, remoteJid, metin, butonlar);
      await pool.query(
        'INSERT INTO sohbet_gecmisi (musteri_telefon, isletme_id, yon, mesaj) VALUES ($1, $2, $3, $4)',
        [musteriTelefon, isletmeId, 'giden', metin]
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
          return `✅ *${h.isim}* seçildi\n\n⏱ Süre: ${h.sure_dk} dk\n� Ücret: ${h.fiyat} TL\n\n� Hangi gün istersiniz?\n\n1️⃣ Bugün\n2️⃣ Yarın\n3️⃣ Bu Hafta`;
        }
        return cevap;
      }

      case 'tarih_secildi': {
        let tarih = aiCevap.secilen_tarih;
        if (metin === '1') tarih = new Date().toISOString().split('T')[0];
        else if (metin === '2') { const y = new Date(); y.setDate(y.getDate()+1); tarih = y.toISOString().split('T')[0]; }
        else if (!tarih) {
          const m = metin.match(/(\d{1,2})[./](\d{1,2})[./](\d{4})/);
          if (m) tarih = `${m[3]}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`;
        }
        if (tarih) {
          const saatler = await randevuService.musaitSaatleriGetir(isletmeId, tarih);
          if (!saatler.length) return `😔 ${this.tarihFormat(tarih)} tarihinde müsait saat yok.\n\n1️⃣ Bugün\n2️⃣ Yarın\n0️⃣ Ana Menü`;
          await this.durumGuncelle(musteriTelefon, isletmeId, 'saat_secimi', { secilen_tarih: tarih });
          let r = `📅 *${this.tarihFormat(tarih)}* müsait saatler:\n\n`;
          saatler.forEach((s, i) => { r += `${i+1}️⃣ ${s}\n`; });
          return r + `\n0️⃣ Ana Menü`;
        }
        return cevap;
      }

      case 'saat_secildi': {
        const gd = (await pool.query('SELECT * FROM bot_durum WHERE musteri_telefon=$1 AND isletme_id=$2', [musteriTelefon, isletmeId])).rows[0];
        const saatler = await randevuService.musaitSaatleriGetir(isletmeId, gd.secilen_tarih);
        let saat = aiCevap.secilen_saat;
        const si = parseInt(metin) - 1;
        if (si >= 0 && si < saatler.length) saat = saatler[si];
        if (saat && saatler.includes(saat)) {
          await this.durumGuncelle(musteriTelefon, isletmeId, 'onay', { secilen_saat: saat });
          const hz = gd.secilen_hizmet_id ? (await pool.query('SELECT * FROM hizmetler WHERE id=$1', [gd.secilen_hizmet_id])).rows[0] : null;
          return `📋 *Randevu Özeti*\n\n🏥  ${isletme.isim}\n${hz ? `${hz.emoji ? hz.emoji + '  ' : ''}${hz.isim}\n` : ''}📅  ${this.tarihFormat(gd.secilen_tarih)}\n🕐  ${saat}\n${hz ? `💰  ${hz.fiyat} TL\n` : ''}\nHer şey doğru mu?\n\n1️⃣ ✅ Onayla\n2️⃣ ❌ İptal`;
        }
        return cevap;
      }

      case 'randevu_onayla': {
        const sd = (await pool.query('SELECT * FROM bot_durum WHERE musteri_telefon=$1 AND isletme_id=$2', [musteriTelefon, isletmeId])).rows[0];
        if (metin === '1' || metin.toLowerCase().includes('evet') || metin.toLowerCase().includes('onayla')) {
          const sonuc = await randevuService.randevuOlustur({ isletmeId, musteriTelefon, hizmetId: sd.secilen_hizmet_id, tarih: sd.secilen_tarih, saat: sd.secilen_saat });
          await this.durumGuncelle(musteriTelefon, isletmeId, 'ana_menu', { secilen_hizmet_id: null, secilen_tarih: null, secilen_saat: null });
          return `✅ *Randevunuz Oluşturuldu!*\n\n🏥  ${isletme.isim}\n${sonuc.hizmet ? `${sonuc.hizmet.emoji ? sonuc.hizmet.emoji + '  ' : ''}${sonuc.hizmet.isim}\n` : ''}📅  ${this.tarihFormat(sd.secilen_tarih)}\n🕐  ${sd.secilen_saat}\n\n⏰ Randevunuzdan 1 saat önce hatırlatma alacaksınız.\n\nGörüşmek üzere! 😊`;
        }
        await this.durumGuncelle(musteriTelefon, isletmeId, 'ana_menu', { secilen_hizmet_id: null, secilen_tarih: null, secilen_saat: null });
        return await this.anaMenu(isletme, musteriTelefon, isletmeId, hizmetler);
      }

      case 'iptal':
        await this.durumGuncelle(musteriTelefon, isletmeId, 'ana_menu', { secilen_hizmet_id: null, secilen_tarih: null, secilen_saat: null });
        return { metin: cevap, butonlar: ['📅 Randevu Al'] };

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

    // İptal butonu
    if ((metinKucuk.includes('iptal') || metinKucuk.includes('❌')) && botDurum.asama !== 'randevu_iptal') {
      await this.durumGuncelle(musteriTelefon, isletmeId, 'randevu_iptal');
      return { metin: `❌ *Randevu İptali*\n\nEmin misiniz?`, butonlar: ['✅ Evet, iptal et', '↩️ Geri dön'] };
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
          return { metin: `📍 *Adresimiz*\n\n🏥 ${isletme.isim}\n📍 ${adres}${ilce ? ', ' + ilce : ''}${sehir ? ', ' + sehir : ''}\n${tel ? '📞 ' + tel + '\n' : ''}\n🗺 Google Maps: ${mapsLink}`, butonlar: ['📅 Randevu Al'] };
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
          txt += `\n⏰ Süre: ${isletme.randevu_suresi_dk || 30} dk seans`;
          return { metin: txt, butonlar: ['📅 Randevu Al'] };
        }
        if (randevuAl) {
          await this.durumGuncelle(musteriTelefon, isletmeId, 'hizmet_secimi');
          return this.hizmetListesi(isletme, hizmetler);
        }
        if (randevularim) {
          const randevuService = require('./randevu');
          const randevular = await randevuService.musteriRandevulari(musteriTelefon, isletmeId);
          if (randevular.length === 0) return { metin: `Aktif randevunuz bulunmuyor. Hemen yeni bir randevu alabilirsiniz!`, butonlar: ['📅 Randevu Al'] };
          let metin2 = `📝 *Randevularınız*\n\n`;
          randevular.slice(0, 3).forEach((r, i) => {
            const saatStr = String(r.saat).substring(0, 5);
            metin2 += `*${i+1}.* ${r.hizmet_isim || 'Hizmet'}\n     📅 ${this.tarihFormat(r.tarih)} • 🕐 ${saatStr}\n\n`;
          });
          return { metin: metin2, butonlar: ['📅 Yeni Randevu', '❌ Randevu İptal'] };
        }
        if (randevuIptal) {
          await this.durumGuncelle(musteriTelefon, isletmeId, 'randevu_iptal');
          const deepseekIptal = require('./deepseek');
          const ikna = await deepseekIptal.serbetCevap('Müşteri randevusunu iptal etmek istiyor. Önce nedenini sor, empati kur, mümkünse ertelemeyi öner. Kısa ve sıcak cevap ver.', isletme, hizmetler, 'whatsapp');
          return { metin: ikna || `Randevunuzu iptal etmek istiyorsunuz. Neden vazgeçtiğinizi öğrenebilir miyiz? Belki size daha uygun bir zaman bulabiliriz!`, butonlar: ['İptal Et', 'Farklı Gün', 'Vazgeç'] };
        }
        // Bilinmeyen mesaj → DeepSeek
        const deepseekFb = require('./deepseek');
        const aiCevap = await deepseekFb.serbetCevap(metin, isletme, hizmetler, 'whatsapp');
        if (aiCevap) return { metin: aiCevap, butonlar: ['📅 Randevu Al', '📝 Randevularım'] };
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
          await this.durumGuncelle(musteriTelefon, isletmeId, 'tarih_secimi', { secilen_hizmet_id: secilenHizmet.id });
          return { metin: `✅ *${secilenHizmet.isim}* seçildi\n\n⏱ Süre: ${secilenHizmet.sure_dk} dk\n💰 Ücret: ${secilenHizmet.fiyat} TL\n\n📅 Hangi gün istersiniz?`, butonlar: ['📅 Bugün', '📅 Yarın', '📆 Bu Hafta'] };
        }
        const deepseek2 = require('./deepseek');
        const ai2 = await deepseek2.serbetCevap(metin, isletme, hizmetler, 'whatsapp');
        if (ai2) return { metin: ai2, butonlar: ['📅 Randevu Al'] };
        return this.hizmetListesi(isletme, hizmetler);
      }

      case 'tarih_secimi': {
        let secilenTarih = null;
        if (metin === '1' || metinKucuk.includes('bugün')) secilenTarih = new Date().toISOString().split('T')[0];
        else if (metin === '2' || metinKucuk.includes('yarın')) {
          const yarin = new Date(); yarin.setDate(yarin.getDate() + 1);
          secilenTarih = yarin.toISOString().split('T')[0];
        } else if (metin === '3' || metinKucuk.includes('başka')) {
          return this.haftaSecenekleri();
        } else if (metinKucuk === '0' || metinKucuk.includes('ana menü')) {
          await this.durumGuncelle(musteriTelefon, isletmeId, 'ana_menu');
          return await this.anaMenu(isletme, musteriTelefon, isletmeId, hizmetler);
        } else {
          const gunIdx = parseInt(metin) - 1;
          if (gunIdx >= 0 && gunIdx < 7) {
            const tarih = new Date(); tarih.setDate(tarih.getDate() + gunIdx);
            secilenTarih = tarih.toISOString().split('T')[0];
          }
          const parca = metin.match(/(\d{1,2})[./](\d{1,2})[./](\d{4})/);
          if (parca) secilenTarih = `${parca[3]}-${parca[2].padStart(2,'0')}-${parca[1].padStart(2,'0')}`;
        }

        if (secilenTarih) {
          const randevuService = require('./randevu');
          const saatler = await randevuService.musaitSaatleriGetir(isletmeId, secilenTarih);
          if (saatler.length === 0) {
            // Bekleme listesi önerisi
            const gd = (await pool.query('SELECT * FROM bot_durum WHERE musteri_telefon=$1 AND isletme_id=$2', [musteriTelefon, isletmeId])).rows[0];
            await pool.query('INSERT INTO bekleme_listesi (musteri_telefon, isletme_id, hizmet_id, istenen_tarih) VALUES ($1,$2,$3,$4)',
              [musteriTelefon, isletmeId, gd?.secilen_hizmet_id || null, secilenTarih]);
            return { metin: `😔 ${this.tarihFormat(secilenTarih)} tarihinde müsait saat yok.\n\n📋 Sizi bekleme listesine ekledik! Yer açılırsa bildirim alacaksınız. 🔔`, butonlar: ['📅 Bugün', '📅 Yarın', '📆 Başka Gün'] };
          }
          await this.durumGuncelle(musteriTelefon, isletmeId, 'saat_secimi', { secilen_tarih: secilenTarih });
          if (saatler.length <= 3) {
            return { metin: `📅 *${this.tarihFormat(secilenTarih)}* müsait saatler:`, butonlar: saatler };
          }
          let txt = `📅 *${this.tarihFormat(secilenTarih)}* müsait saatler:\n\n`;
          saatler.forEach((s, i) => { txt += `${i+1}️⃣ ${s}\n`; });
          return { metin: txt, butonlar: null };
        }
        return { metin: `Tarihi anlayamadım. Lütfen seçin:`, butonlar: ['📅 Bugün', '📅 Yarın', '📆 Başka Gün'] };
      }

      case 'saat_secimi': {
        if (metinKucuk === '0' || metinKucuk.includes('ana menü')) {
          await this.durumGuncelle(musteriTelefon, isletmeId, 'ana_menu');
          return await this.anaMenu(isletme, musteriTelefon, isletmeId, hizmetler);
        }
        const randevuService = require('./randevu');
        const guncelDurum = (await pool.query('SELECT * FROM bot_durum WHERE musteri_telefon=$1 AND isletme_id=$2', [musteriTelefon, isletmeId])).rows[0];
        const saatler = await randevuService.musaitSaatleriGetir(isletmeId, guncelDurum.secilen_tarih);
        let secilenSaat = null;
        if (saatler.includes(metin)) secilenSaat = metin;
        else { const si = parseInt(metin) - 1; if (si >= 0 && si < saatler.length) secilenSaat = saatler[si]; }

        if (secilenSaat) {
          await this.durumGuncelle(musteriTelefon, isletmeId, 'onay', { secilen_saat: secilenSaat });
          const hz = guncelDurum.secilen_hizmet_id ? (await pool.query('SELECT * FROM hizmetler WHERE id=$1', [guncelDurum.secilen_hizmet_id])).rows[0] : null;
          return { metin: `📋 *Randevu Özeti*\n\n🏥  ${isletme.isim}\n${hz ? `${hz.emoji ? hz.emoji + '  ' : ''}${hz.isim}\n` : ''}📅  ${this.tarihFormat(guncelDurum.secilen_tarih)}\n🕐  ${secilenSaat}\n${hz ? `💰  ₺${hz.fiyat}\n` : ''}\nHer şey doğru mu?\n\n💬 Not eklemek için yazın veya:`, butonlar: ['✅ Onayla', '❌ İptal'] };
        }
        let txt = `Lütfen bir saat seçin:\n\n`;
        saatler.forEach((s, i) => { txt += `${i+1}️⃣ ${s}\n`; });
        return { metin: txt, butonlar: null };
      }

      case 'onay': {
        const randevuService = require('./randevu');
        if (metin === '1' || metinKucuk.includes('evet') || metinKucuk.includes('onayla')) {
          const sd = (await pool.query('SELECT * FROM bot_durum WHERE musteri_telefon=$1 AND isletme_id=$2', [musteriTelefon, isletmeId])).rows[0];
          const sonuc = await randevuService.randevuOlustur({ isletmeId, musteriTelefon, hizmetId: sd.secilen_hizmet_id, tarih: sd.secilen_tarih, saat: sd.secilen_saat });
          await this.durumGuncelle(musteriTelefon, isletmeId, 'ana_menu', { secilen_hizmet_id: null, secilen_tarih: null, secilen_saat: null });

          let tebrik = `✅ *Randevunuz Oluşturuldu!*\n\n🏥  ${isletme.isim}\n${sonuc.hizmet ? `${sonuc.hizmet.emoji ? sonuc.hizmet.emoji + '  ' : ''}${sonuc.hizmet.isim}\n` : ''}📅  ${this.tarihFormat(sd.secilen_tarih)}\n🕐  ${sd.secilen_saat}\n\n⏰ Randevunuzdan 1 gün ve 1 saat önce hatırlatma alacaksınız.`;

          // Cross-sell
          const digerHizmetler = hizmetler.filter(h => h.id !== sd.secilen_hizmet_id);
          if (digerHizmetler.length > 0) {
            const oneri = digerHizmetler[Math.floor(Math.random() * digerHizmetler.length)];
            tebrik += `\n\n💡 *Bunu da denediniz mi?*\n${oneri.emoji || '✨'} ${oneri.isim} • ${oneri.sure_dk}dk • ₺${oneri.fiyat}`;
          }

          tebrik += `\n\nGörüşmek üzere! 😊`;
          return { metin: tebrik, butonlar: ['📅 Yeni Randevu'] };
        } else if (metinKucuk !== '2' && !metinKucuk.includes('iptal') && !metinKucuk.includes('hayır') && metin.length > 1) {
          // Müşteri not yazdı - onaylayıp notu kaydet
          const sd = (await pool.query('SELECT * FROM bot_durum WHERE musteri_telefon=$1 AND isletme_id=$2', [musteriTelefon, isletmeId])).rows[0];
          const sonuc = await randevuService.randevuOlustur({ isletmeId, musteriTelefon, hizmetId: sd.secilen_hizmet_id, tarih: sd.secilen_tarih, saat: sd.secilen_saat });
          if (sonuc && sonuc.randevu) {
            await pool.query('UPDATE randevular SET not_text=$1 WHERE id=$2', [metin, sonuc.randevu.id]);
          }
          await this.durumGuncelle(musteriTelefon, isletmeId, 'ana_menu', { secilen_hizmet_id: null, secilen_tarih: null, secilen_saat: null });
          return { metin: `✅ *Randevunuz oluşturuldu!*\n\n💬 Notunuz: _"${metin}"_\n\nGörüşmek üzere! 😊`, butonlar: ['📅 Yeni Randevu'] };
        }
        await this.durumGuncelle(musteriTelefon, isletmeId, 'ana_menu', { secilen_hizmet_id: null, secilen_tarih: null, secilen_saat: null });
        return await this.anaMenu(isletme, musteriTelefon, isletmeId, hizmetler);
      }

      case 'randevu_iptal': {
        const randevuService = require('./randevu');
        if (metinKucuk.includes('iptal') || metinKucuk.includes('evet') || metin === '1') {
          const randevular = await randevuService.musteriRandevulari(musteriTelefon, isletmeId);
          if (!randevular.length) {
            await this.durumGuncelle(musteriTelefon, isletmeId, 'ana_menu');
            return { metin: `Aktif randevunuz bulunmuyor.`, butonlar: ['📅 Randevu Al'] };
          }
          await randevuService.randevuIptal(randevular[0].id);
          await this.durumGuncelle(musteriTelefon, isletmeId, 'ana_menu');
          return { metin: `✅ Randevunuz iptal edildi.`, butonlar: ['📅 Yeni Randevu'] };
        }
        if (metinKucuk.includes('farklı') || metinKucuk.includes('ertele')) {
          await this.durumGuncelle(musteriTelefon, isletmeId, 'tarih_secimi');
          return { metin: `📅 Hangi gün istersiniz?`, butonlar: ['📅 Bugün', '📅 Yarın', '📆 Başka Gün'] };
        }
        await this.durumGuncelle(musteriTelefon, isletmeId, 'ana_menu');
        return await this.anaMenu(isletme, musteriTelefon, isletmeId, hizmetler);
      }

      default:
        return await this.anaMenu(isletme, musteriTelefon, isletmeId, hizmetler);
    }
  }

  async anaMenu(isletme, musteriTelefon, isletmeId, hizmetler) {
    let msg = '';
    try {
      // Geçmiş ve yaklaşan randevu bilgisi
      const gecmisQ = await pool.query(`
        SELECT r.tarih, r.saat, h.isim as hizmet_isim, h.id as hizmet_id
        FROM randevular r
        JOIN musteriler m ON r.musteri_id = m.id
        LEFT JOIN hizmetler h ON r.hizmet_id = h.id
        WHERE m.telefon=$1 AND r.isletme_id=$2 AND r.tarih < CURRENT_DATE
        ORDER BY r.tarih DESC LIMIT 1
      `, [musteriTelefon, isletmeId]);
      const yaklasanQ = await pool.query(`
        SELECT r.tarih, r.saat, h.isim as hizmet_isim
        FROM randevular r
        JOIN musteriler m ON r.musteri_id = m.id
        LEFT JOIN hizmetler h ON r.hizmet_id = h.id
        WHERE m.telefon=$1 AND r.isletme_id=$2 AND r.tarih >= CURRENT_DATE AND r.durum='onaylandi'
        ORDER BY r.tarih ASC LIMIT 1
      `, [musteriTelefon, isletmeId]);
      const gecmisRandevu = gecmisQ.rows[0] || null;
      const yaklasanRandevu = yaklasanQ.rows[0] || null;

      const deepseek = require('./deepseek');
      const kisiselMsg = await Promise.race([
        deepseek.kisiselKarsilama(musteriTelefon, gecmisRandevu, yaklasanRandevu, isletme, hizmetler, 'whatsapp'),
        new Promise(resolve => setTimeout(() => resolve(null), 4000))
      ]);
      msg = kisiselMsg || `*${isletme.isim}*'e hoş geldiniz! 👋\n\nSize nasıl yardımcı olabilirim?`;
    } catch(e) {
      msg = `*${isletme.isim}*'e hoş geldiniz! 👋\n\nSize nasıl yardımcı olabilirim?`;
    }

    msg += `\n\n1️⃣ 📅 Randevu Al\n2️⃣ 📝 Randevularım\n3️⃣ ❌ Randevu İptal\n\n📍 Konum için *konum* yazın\n🕐 Çalışma saatleri için *saatler* yazın`;

    const butonlar = ['📅 Randevu Al', '📝 Randevularım', '❌ Randevu İptal'];
    return { metin: msg, butonlar };
  }

  hizmetListesi(isletme, hizmetler) {
    let metin = `📋 *Hizmetlerimiz*\n\nSize en uygun hizmeti seçin:\n\n`;
    hizmetler.forEach((h, i) => {
      metin += `*${i+1}.* ${h.emoji ? h.emoji + ' ' : ''}${h.isim} • ${h.sure_dk}dk • ₺${h.fiyat}\n`;
    });
    metin += `\nNumara yazarak seçin (0 = Ana Menü):`;
    // WP butonları maks 3 - ilk 3 hizmeti göster
    const butonlar = hizmetler.slice(0, 3).map(h => `${h.emoji ? h.emoji + ' ' : ''}${h.isim} • ₺${h.fiyat}`);
    return { metin, butonlar: butonlar.length > 0 ? butonlar : null };
  }

  haftaSecenekleri() {
    const gunler = ['Pazar','Pazartesi','Salı','Çarşamba','Perşembe','Cuma','Cumartesi'];
    let cevap = `📅 *Gün Seçin:*\n\n`;
    for (let i = 0; i < 7; i++) {
      const t = new Date(); t.setDate(t.getDate() + i);
      cevap += `${i+1}️⃣ ${gunler[t.getDay()]} (${t.getDate()}.${t.getMonth()+1})\n`;
    }
    cevap += `\n0️⃣ Ana Menü`;
    return cevap;
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
}

module.exports = new WhatsAppWebService();
