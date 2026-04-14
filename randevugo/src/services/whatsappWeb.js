const { default: makeWASocket, DisconnectReason, fetchLatestBaileysVersion, makeCacheableSignalKeyStore } = require('@whiskeysockets/baileys');
const qrcode = require('qrcode');
const pool = require('../config/db');
const EventEmitter = require('events');
const pino = require('pino');
const { bugunTarih, yarinTarih, gunSonraTarih } = require('../utils/tarih');
const { usePostgresAuthState } = require('../utils/pgAuthState');
const botMesajlar = require('../utils/botMesajlar');

// Türkçe karakter normalize + Levenshtein mesafe (yazım hatası toleransı)
function trNormalize(str) {
  return str.toLowerCase().replace(/ı/g,'i').replace(/ğ/g,'g').replace(/ü/g,'u').replace(/ş/g,'s').replace(/ö/g,'o').replace(/ç/g,'c').replace(/İ/g,'i').replace(/Ğ/g,'g').replace(/Ü/g,'u').replace(/Ş/g,'s').replace(/Ö/g,'o').replace(/Ç/g,'c');
}
function levenshtein(a, b) {
  const m = a.length, n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const d = Array.from({length: m+1}, () => new Array(n+1).fill(0));
  for (let i = 0; i <= m; i++) d[i][0] = i;
  for (let j = 0; j <= n; j++) d[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i-1] === b[j-1] ? 0 : 1;
      d[i][j] = Math.min(d[i-1][j]+1, d[i][j-1]+1, d[i-1][j-1]+cost);
    }
  }
  return d[m][n];
}
function fuzzyMatch(metin, hedef) {
  const a = trNormalize(metin), b = trNormalize(hedef);
  // Tam/substring eşleşme
  if (a.includes(b) || b.includes(a)) return true;
  // Kelime bazlı eşleşme
  const aKelime = a.split(/\s+/), bKelime = b.split(/\s+/);
  if (bKelime.some(w => w.length > 2 && a.includes(w))) return true;
  if (aKelime.some(w => w.length > 2 && b.includes(w))) return true;
  // Levenshtein: kısa kelimeler için 1 harf, uzunlar için 2 harf tolerans
  const esik = Math.min(a.length, b.length) <= 4 ? 1 : 2;
  if (levenshtein(a, b) <= esik) return true;
  // Kelime bazlı Levenshtein
  for (const aw of aKelime) {
    for (const bw of bKelime) {
      if (aw.length > 2 && bw.length > 2) {
        const kEsik = Math.min(aw.length, bw.length) <= 4 ? 1 : 2;
        if (levenshtein(aw, bw) <= kEsik) return true;
      }
    }
  }
  return false;
}

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

    this.isletmeler[isletmeId] = { sock: null, durum: 'baslatiyor', qr: null, qrBase64: null };

    try {
      const { state, saveCreds } = await usePostgresAuthState(pool, isletmeId);
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
            // Oturum silindi, DB'den auth verilerini temizle
            this.isletmeler[isletmeId].durum = 'bagli_degil';
            try { await pool.query('DELETE FROM wa_auth_keys WHERE isletme_id=$1', [isletmeId]); } catch (e) {}
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
    try { await pool.query('DELETE FROM wa_auth_keys WHERE isletme_id=$1', [isletmeId]); } catch (e) {}
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
      // LID formatında gerçek numara yok — remoteJidAlt'tan al
      const altJid = msg.key.remoteJidAlt;
      if (altJid && altJid.endsWith('@s.whatsapp.net')) {
        musteriTelefon = altJid.replace('@s.whatsapp.net', '');
      } else {
        // Alt JID yoksa store'dan dene
        try {
          const sock = this.connections.get(isletmeId)?.sock;
          if (sock?.store) {
            const contact = sock.store.contacts?.[remoteJid];
            if (contact?.id?.endsWith('@s.whatsapp.net')) {
              musteriTelefon = contact.id.replace('@s.whatsapp.net', '');
            }
          }
        } catch(e) {}
        // Hala bulunamadıysa LID'yi kullan
        if (!musteriTelefon) musteriTelefon = remoteJid.replace('@lid', '');
      }
    } else {
      musteriTelefon = remoteJid.replace('@c.us', '');
    }

    const isletme = (await pool.query('SELECT * FROM isletmeler WHERE id=$1', [isletmeId])).rows[0];
    if (!isletme) return;

    // Kara liste kontrolü — engelli numaraya cevap verme
    try {
      const kara = (await pool.query(
        'SELECT aktif FROM kara_liste WHERE isletme_id=$1 AND telefon=$2 AND aktif=true',
        [isletmeId, musteriTelefon]
      )).rows[0];
      if (kara) return;
    } catch (e) { /* kara_liste tablosu yoksa devam et */ }

    // Mesai dışı kontrolü
    try {
      const simdi = new Date();
      const simdiDk = simdi.getHours() * 60 + simdi.getMinutes();
      const basSaat = isletme.calisma_baslangic ? String(isletme.calisma_baslangic).substring(0,5) : '09:00';
      const bitSaat = isletme.calisma_bitis ? String(isletme.calisma_bitis).substring(0,5) : '19:00';
      const [basH, basM] = basSaat.split(':').map(Number);
      const [bitH, bitM] = bitSaat.split(':').map(Number);
      const basDk = basH * 60 + basM;
      const bitDk = bitH * 60 + bitM;
      const bugunKapali = (isletme.kapali_gunler || '').split(',').filter(Boolean).map(Number).includes(simdi.getDay());
      const mesaiDisi = simdiDk < basDk || simdiDk > bitDk || bugunKapali;

      if (mesaiDisi && isletme.mesai_disi_mod && isletme.mesai_disi_mod !== 'randevu_ver') {
        if (isletme.mesai_disi_mod === 'sessiz') return;
        if (isletme.mesai_disi_mod === 'kapali_mesaj') {
          const mesaj = isletme.mesai_disi_mesaj || botMesajlar.get(isletme, 'mesaiDisi', { basSaat, bitSaat });
          return { metin: mesaj, butonlar: null };
        }
      }
    } catch (e) { /* mesai dışı kontrolü başarısız — devam et */ }

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

    // ═══ AKILLI TEYİT ZİNCİRİ — Bot akışından ÖNCE yakala ═══
    const metinKucukTeyit = metin.toLowerCase();
    const teyitSonuc = await this._teyitZinciriKontrol(metinKucukTeyit, metin, musteriTelefon, isletmeId, remoteJid);
    if (teyitSonuc) {
      // Zincir yakaladı — cevabı gönder ve bot akışına geçme
      await this.mesajGonder(isletmeId, remoteJid, teyitSonuc);
      await pool.query(
        'INSERT INTO sohbet_gecmisi (musteri_telefon, isletme_id, yon, mesaj) VALUES ($1, $2, $3, $4)',
        [musteriTelefon, isletmeId, 'giden', teyitSonuc]
      );
      return;
    }

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

    // ═══ DİL ALGILAMA VE KAYDETME ═══
    const botMesajlar = require('../utils/botMesajlar');
    const algilananDil = botMesajlar.dilAlgila(metin);
    if (algilananDil && algilananDil !== botDurum.secilen_dil) {
      const desteklenen = Array.isArray(isletme.bot_diller) ? isletme.bot_diller : 
        (typeof isletme.bot_diller === 'string' ? isletme.bot_diller.split(',').map(d => d.trim()) : ['tr']);
      if (desteklenen.includes(algilananDil)) {
        await pool.query('UPDATE bot_durum SET secilen_dil=$1 WHERE musteri_telefon=$2 AND isletme_id=$3', [algilananDil, musteriTelefon, isletmeId]);
        botDurum.secilen_dil = algilananDil;
        console.log(`🌐 Dil değişti: ${algilananDil} (müşteri: ${musteriTelefon})`);
      }
    }
    // İsletme objesine müşterinin dil tercihini ekle — tüm botMesajlar.get() çağrıları otomatik kullanır
    isletme._musteriDil = botDurum.secilen_dil || null;

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
          return botMesajlar.get(isletme, 'hizmetSecildi', { hizmetAd: h.isim, _hizmetEN: h.isim_en, _hizmetAR: h.isim_ar, sureDk: h.sure_dk, fiyat: this.fiyatFormat(h.fiyat) });
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
          if (!saatler.length) return botMesajlar.get(isletme, 'saatYok', { tarihStr: this.tarihFormat(tarih) });
          await this.durumGuncelle(musteriTelefon, isletmeId, 'saat_secimi', { secilen_tarih: tarih });
          const saatFmtAi = saatler.map(s => String(s).substring(0,5));
          return botMesajlar.get(isletme, 'saatListesi', { tarihStr: this.tarihFormat(tarih), saatler: saatFmtAi });
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
          return botMesajlar.get(isletme, 'randevuOzet', { isletmeAd: isletme.isim, hizmetAd: hz?.isim, _hizmetEN: hz?.isim_en, _hizmetAR: hz?.isim_ar, tarihStr: this.tarihFormat(gd.secilen_tarih), saatStr: this.saatFormat(saat), fiyat: hz ? this.fiyatFormat(hz.fiyat) : null });
        }
        return cevap;
      }

      case 'randevu_onayla': {
        const sd = (await pool.query('SELECT * FROM bot_durum WHERE musteri_telefon=$1 AND isletme_id=$2', [musteriTelefon, isletmeId])).rows[0];
        if (metin === '1' || metin.toLowerCase().includes('evet') || metin.toLowerCase().includes('onayla')) {
          const sonuc = await randevuService.randevuOlustur({ isletmeId, musteriTelefon, hizmetId: sd.secilen_hizmet_id, tarih: sd.secilen_tarih, saat: sd.secilen_saat });
          await this.durumGuncelle(musteriTelefon, isletmeId, 'ana_menu', { secilen_hizmet_id: null, secilen_tarih: null, secilen_saat: null });
          return botMesajlar.get(isletme, 'randevuOnaylandi', { isletmeAd: isletme.isim, hizmetAd: sonuc.hizmet?.isim, _hizmetEN: sonuc.hizmet?.isim_en, _hizmetAR: sonuc.hizmet?.isim_ar, tarihStr: this.tarihFormat(sd.secilen_tarih), saatStr: this.saatFormat(sd.secilen_saat) });
        }
        await this.durumGuncelle(musteriTelefon, isletmeId, 'ana_menu', { secilen_hizmet_id: null, secilen_tarih: null, secilen_saat: null });
        return await this.anaMenu(isletme, musteriTelefon, isletmeId, hizmetler);
      }

      case 'iptal':
        await this.durumGuncelle(musteriTelefon, isletmeId, 'ana_menu', { secilen_hizmet_id: null, secilen_tarih: null, secilen_saat: null });
        return { metin: cevap + '\n\n' + botMesajlar.get(isletme, 'randevuAlIcin'), butonlar: null };

      default:
        return cevap;
    }
  }

  async akisIsle(metin, botDurum, isletme, hizmetler, musteriTelefon, isletmeId) {
    const metinKucuk = metin.toLowerCase();

    // === GLOBAL INTENT DETECTION (her aşamada çalışır) ===

    // Merhaba / başlangıç / ana menü
    const merhabaSozler = ['merhaba', 'selam', 'hi', 'hello', 'alo', '/start', '0', 'ana menü', 'menu', 'menü', 'başlat'];
    if (merhabaSozler.includes(metinKucuk) || botDurum.asama === 'baslangic') {
      await this.durumGuncelle(musteriTelefon, isletmeId, 'ana_menu');
      return await this.anaMenu(isletme, musteriTelefon, isletmeId, hizmetler);
    }

    // İptal intent — her aşamada yakalanır (state sıfırlanır, direkt iptal listesi)
    if ((metinKucuk.includes('iptal') || metinKucuk.includes('❌')) && botDurum.asama !== 'randevu_iptal_secim' && botDurum.asama !== 'iptal_onay') {
      await this.durumGuncelle(musteriTelefon, isletmeId, 'ana_menu', { secilen_hizmet_id: null, secilen_tarih: null, secilen_saat: null, secilen_calisan_id: null });
      const randevuService = require('./randevu');
      const randevular = await randevuService.musteriRandevulari(musteriTelefon, isletmeId);
      if (!randevular.length) {
        return { metin: botMesajlar.get(isletme, 'randevuYok'), butonlar: null };
      }
      await this.durumGuncelle(musteriTelefon, isletmeId, 'randevu_iptal_secim');
      const rList = randevular.map(r => ({ ...r, tarihStr: this.tarihFormat(r.tarih), saatStr: String(r.saat).substring(0,5) }));
      return { metin: botMesajlar.get(isletme, 'iptalListesi', { randevular: rList }), butonlar: null };
    }

    // Randevu alma intent — hangi aşamada olursa olsun direkt hizmet listesine at
    const randevuAlIntents = ['randevu', 'randevu al', 'randevu almak istiyorum', 'al', 'almak istiyorum', 'randevu alalim', 'randevu alayim'];
    if (randevuAlIntents.includes(metinKucuk) && botDurum.asama !== 'hizmet_secimi' && botDurum.asama !== 'calisan_secimi' && botDurum.asama !== 'tarih_secimi' && botDurum.asama !== 'saat_secimi' && botDurum.asama !== 'onay') {
      await this.durumGuncelle(musteriTelefon, isletmeId, 'hizmet_secimi', { secilen_hizmet_id: null, secilen_tarih: null, secilen_saat: null, secilen_calisan_id: null });
      return this.hizmetListesi(isletme, hizmetler);
    }

    // Referans kodu sorgulama
    if (metinKucuk.includes('referans') || metinKucuk.includes('davet') || metinKucuk.includes('arkadaş')) {
      try {
        const referansServis = require('./referans');
        const sonuc = await referansServis.kodSorgula(isletmeId, musteriTelefon);
        if (sonuc) {
          return { metin: `🤝 *Referans Kodunuz:* ${sonuc.kod}\n\nBu kodu arkadaşlarınızla paylaşın! Arkadaşınız ilk randevusunu aldığında ikiniz de puan kazanırsınız! 🎁\n\n✅ Şimdiye kadar ${sonuc.davetSayisi} kişiyi davet ettiniz.`, butonlar: null };
        }
      } catch (e) { /* referans aktif değilse skip */ }
    }

    // Referans kodu kullanma (6 karakterli büyük harf/rakam)
    if (/^[A-F0-9]{6}$/.test(metin.trim().toUpperCase())) {
      try {
        const referansServis = require('./referans');
        const sonuc = await referansServis.referansKullan(isletmeId, musteriTelefon, metin.trim());
        if (sonuc?.basarili) {
          return { metin: `✅ Referans kodu kullanıldı! ${sonuc.davetEden} sizi davet etti.\n\n🎁 İlk randevunuz tamamlandığında ikiniz de bonus puan kazanacaksınız!`, butonlar: null };
        }
        if (sonuc?.hata) {
          return { metin: `❌ ${sonuc.hata}`, butonlar: null };
        }
      } catch (e) { /* skip */ }
    }

    // Puan sorgulama intent
    if (metinKucuk.includes('puan') || metinKucuk.includes('puanım') || metinKucuk.includes('puanim') || metinKucuk.includes('sadakat')) {
      try {
        const sadakatPuan = require('./sadakatPuan');
        const puan = await sadakatPuan.puanSorgula(isletmeId, musteriTelefon);
        if (puan) {
          let msg = `🎯 *Sadakat Puan Bilginiz*\n\n⭐ Mevcut bakiye: *${puan.bakiye} puan*\n📊 Toplam kazanılan: *${puan.toplam} puan*`;
          if (puan.kalan > 0) msg += `\n🎁 Ödüle *${puan.kalan} puan* kaldı!`;
          else msg += `\n🎉 *Ödül hakkınız var!* Bir sonraki randevunuzda kullanabilirsiniz.`;
          return { metin: msg, butonlar: null };
        }
      } catch (e) { /* sadakat aktif değilse skip */ }
    }

    // Geri / değiştir intent — adım geri al
    if ((metinKucuk === 'geri' || metinKucuk === 'değiştir' || metinKucuk === 'degistir') && !['ana_menu', 'baslangic'].includes(botDurum.asama)) {
      const geriMap = { 'onay': 'saat_secimi', 'saat_secimi': 'tarih_secimi', 'tarih_secimi': 'hizmet_secimi', 'calisan_secimi': 'hizmet_secimi', 'hizmet_secimi': 'ana_menu' };
      const oncekiAsama = geriMap[botDurum.asama] || 'ana_menu';
      if (oncekiAsama === 'ana_menu') {
        await this.durumGuncelle(musteriTelefon, isletmeId, 'ana_menu');
        return await this.anaMenu(isletme, musteriTelefon, isletmeId, hizmetler);
      }
      if (oncekiAsama === 'hizmet_secimi') {
        await this.durumGuncelle(musteriTelefon, isletmeId, 'hizmet_secimi');
        return this.hizmetListesi(isletme, hizmetler);
      }
      if (oncekiAsama === 'tarih_secimi') {
        await this.durumGuncelle(musteriTelefon, isletmeId, 'tarih_secimi');
        return { metin: botMesajlar.get(isletme, 'tarihSec'), butonlar: null };
      }
      if (oncekiAsama === 'saat_secimi') {
        const gdGeri = (await pool.query('SELECT secilen_tarih, secilen_calisan_id, secilen_hizmet_id FROM bot_durum WHERE musteri_telefon=$1 AND isletme_id=$2', [musteriTelefon, isletmeId])).rows[0];
        if (gdGeri?.secilen_tarih) return await this._tarihSecildi(gdGeri.secilen_tarih, musteriTelefon, isletmeId, isletme, hizmetler);
        await this.durumGuncelle(musteriTelefon, isletmeId, 'tarih_secimi');
        return { metin: botMesajlar.get(isletme, 'tarihSec'), butonlar: null };
      }
    }

    switch (botDurum.asama) {
      case 'ana_menu': {
        const randevuAl = metin === '1' || metinKucuk.includes('randevu al') || metinKucuk === 'randevu' || metinKucuk === 'al' || metinKucuk === 'almak istiyorum' || metinKucuk === 'randevu almak istiyorum';
        const randevularim = metin === '2' || metinKucuk.includes('randevularım') || metinKucuk.includes('randevularim');
        const randevuIptal = metin === '3' || metinKucuk.includes('randevu iptal');

        // Konum bilgisi
        if (metinKucuk === 'konum' || metinKucuk.includes('adres') || metin === '4') {
          const adres = isletme.adres || 'Adres bilgisi bulunamadı';
          const sehir = isletme.sehir || '';
          const ilce = isletme.ilce || '';
          const tel = isletme.telefon || '';
          const mapsLink = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(adres + ' ' + ilce + ' ' + sehir)}`;
          return { metin: botMesajlar.get(isletme, 'konum', { isletmeAd: isletme.isim, adres, sehir, ilce, telefon: tel, mapsLink }), butonlar: null };
        }
        // Çalışma saatleri
        if (metinKucuk === 'saatler' || metinKucuk.includes('çalışma saat') || metin === '5') {
          const bas = isletme.calisma_baslangic ? String(isletme.calisma_baslangic).substring(0,5) : '09:00';
          const bit = isletme.calisma_bitis ? String(isletme.calisma_bitis).substring(0,5) : '18:00';
          const kapaliGunler = isletme.kapali_gunler || '';
          const gunIsimleri = ['Pazar','Pazartesi','Salı','Çarşamba','Perşembe','Cuma','Cumartesi'];
          const kapaliList = kapaliGunler.split(',').filter(g => g.trim()).map(g => gunIsimleri[parseInt(g.trim())] || g.trim());
          return { metin: botMesajlar.get(isletme, 'calismaSaatleri', { basSaat: bas, bitSaat: bit, kapaliGunler: kapaliList.length > 0 ? kapaliList.join(', ') : null, sureDk: isletme.randevu_suresi_dk || 30 }), butonlar: null };
        }
        if (randevuAl) {
          await this.durumGuncelle(musteriTelefon, isletmeId, 'hizmet_secimi');
          return this.hizmetListesi(isletme, hizmetler);
        }
        if (randevularim) {
          const randevuService = require('./randevu');
          const randevular = await randevuService.musteriRandevulari(musteriTelefon, isletmeId);
          if (randevular.length === 0) return { metin: botMesajlar.get(isletme, 'randevuYok'), butonlar: null };
          const rListRm = randevular.slice(0, 3).map(r => ({ ...r, tarihStr: this.tarihFormat(r.tarih), saatStr: String(r.saat).substring(0, 5) }));
          return { metin: botMesajlar.get(isletme, 'randevularim', { randevular: rListRm }), butonlar: null };
        }
        if (randevuIptal) {
          const randevuService = require('./randevu');
          const randevular = await randevuService.musteriRandevulari(musteriTelefon, isletmeId);
          if (!randevular.length) {
            return { metin: botMesajlar.get(isletme, 'randevuYok'), butonlar: null };
          }
          await this.durumGuncelle(musteriTelefon, isletmeId, 'randevu_iptal_secim');
          const rListIp = randevular.map(r => ({ ...r, tarihStr: this.tarihFormat(r.tarih), saatStr: String(r.saat).substring(0,5) }));
          return { metin: botMesajlar.get(isletme, 'iptalListesi', { randevular: rListIp }), butonlar: null };
        }
        // Bilinmeyen mesaj → DeepSeek
        const deepseekFb = require('./deepseek');
        const aiCevap = await deepseekFb.serbetCevap(metin, isletme, hizmetler, 'whatsapp');
        if (aiCevap) return { metin: aiCevap + '\n\n' + botMesajlar.get(isletme, 'randevuAlIcin'), butonlar: null };
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
          // Fuzzy match: substring + Levenshtein yazım hatası toleransı
          secilenHizmet = hizmetler.find(h => fuzzyMatch(metin, h.isim));
        }
        if (secilenHizmet) {
          // Çalışan kontrolü (hizmete uygun çalışanları getir)
          const randevuService = require('./randevu');
          const calisanlar = await randevuService.uygunCalisanlar(isletmeId, secilenHizmet.id);
          const secimModu = isletme.calisan_secim_modu || 'musteri';

          if (calisanlar.length > 1 && secimModu === 'musteri') {
            // Müşteri seçer modu → listeyi göster
            await this.durumGuncelle(musteriTelefon, isletmeId, 'calisan_secimi', { secilen_hizmet_id: secilenHizmet.id });
            return { metin: botMesajlar.get(isletme, 'calisanSec', { hizmetAd: secilenHizmet.isim, sureDk: secilenHizmet.sure_dk, fiyat: this.fiyatFormat(secilenHizmet.fiyat), calisanlar }), butonlar: null };
          } else if (calisanlar.length > 1 && secimModu === 'otomatik') {
            // Otomatik dağıtım → ardışık blok bazında en boş çalışanı seç
            const bugun = new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Istanbul" });
            const enBos = await randevuService.enBosCalisan(isletmeId, bugun, secilenHizmet.id);
            const secilenCalisan = enBos || calisanlar[0];
            await this.durumGuncelle(musteriTelefon, isletmeId, 'tarih_secimi', { secilen_hizmet_id: secilenHizmet.id, secilen_calisan_id: secilenCalisan.id });
            return { metin: botMesajlar.get(isletme, 'hizmetSecildi', { hizmetAd: secilenHizmet.isim, sureDk: secilenHizmet.sure_dk, fiyat: this.fiyatFormat(secilenHizmet.fiyat), calisanAd: secilenCalisan.isim }), butonlar: null };
          } else if (calisanlar.length >= 1 && (secimModu === 'tek' || calisanlar.length === 1)) {
            await this.durumGuncelle(musteriTelefon, isletmeId, 'tarih_secimi', { secilen_hizmet_id: secilenHizmet.id, secilen_calisan_id: calisanlar[0].id });
            return { metin: botMesajlar.get(isletme, 'hizmetSecildi', { hizmetAd: secilenHizmet.isim, sureDk: secilenHizmet.sure_dk, fiyat: this.fiyatFormat(secilenHizmet.fiyat), calisanAd: calisanlar[0].isim }), butonlar: null };
          } else {
            await this.durumGuncelle(musteriTelefon, isletmeId, 'tarih_secimi', { secilen_hizmet_id: secilenHizmet.id });
            return { metin: botMesajlar.get(isletme, 'hizmetSecildi', { hizmetAd: secilenHizmet.isim, sureDk: secilenHizmet.sure_dk, fiyat: this.fiyatFormat(secilenHizmet.fiyat) }), butonlar: null };
          }
        }
        // Hizmet bulunamadı — direkt listeyi tekrar göster
        return { metin: botMesajlar.get(isletme, 'hizmetBulunamadi', { hizmetler, fiyatFormat: this.fiyatFormat }), butonlar: null };
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
          // Fuzzy match: substring + Levenshtein yazım hatası toleransı
          secilenCalisan = calisanlarQ.find(c => fuzzyMatch(metin, c.isim));
        }
        if (secilenCalisan) {
          await this.durumGuncelle(musteriTelefon, isletmeId, 'tarih_secimi', { secilen_calisan_id: secilenCalisan.id });
          return { metin: botMesajlar.get(isletme, 'hizmetSecildi', { hizmetAd: secilenCalisan.isim, calisanAd: secilenCalisan.isim }), butonlar: null };
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
          return this.haftaSecenekleri(isletme);
        } else if (metinKucuk === '0' || metinKucuk.includes('ana menü')) {
          await this.durumGuncelle(musteriTelefon, isletmeId, 'ana_menu');
          return await this.anaMenu(isletme, musteriTelefon, isletmeId, hizmetler);
        } else {
          secilenTarih = this._tarihParse(metin, metinKucuk);
        }
        if (secilenTarih) {
          return await this._tarihSecildi(secilenTarih, musteriTelefon, isletmeId, isletme, hizmetler);
        }
        return { metin: botMesajlar.get(isletme, 'tarihSec'), butonlar: null };
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
        return this.haftaSecenekleri(isletme);
      }

      // ═══ ZAMAN DİLİMİ SEÇİMİ (sabah/öğle/akşam) ═══
      case 'saat_dilimi_secimi': {
        if (metinKucuk === '0' || metinKucuk.includes('ana menü') || metinKucuk.includes('main menu') || metinKucuk.includes('الرئيسية')) {
          await this.durumGuncelle(musteriTelefon, isletmeId, 'ana_menu');
          return await this.anaMenu(isletme, musteriTelefon, isletmeId, hizmetler);
        }
        const randevuService1 = require('./randevu');
        const gd1 = (await pool.query('SELECT * FROM bot_durum WHERE musteri_telefon=$1 AND isletme_id=$2', [musteriTelefon, isletmeId])).rows[0];
        const saatler1 = await randevuService1.musaitSaatleriGetir(isletmeId, gd1.secilen_tarih, gd1.secilen_calisan_id, gd1.secilen_hizmet_id);
        const saatFmt1 = saatler1.map(s => String(s).substring(0,5));
        const tarihStr1 = this.tarihFormat(gd1.secilen_tarih);

        // Serbest saat girişi her zaman çalışır: "14:30", "18:00"
        const saatMatch1 = metin.match(/^(\d{1,2})[.:](\d{2})$/);
        if (saatMatch1) {
          const giris = saatMatch1[1].padStart(2,'0') + ':' + saatMatch1[2];
          if (saatFmt1.includes(giris)) {
            await this.durumGuncelle(musteriTelefon, isletmeId, 'onay', { secilen_saat: giris });
            return await this._ozetOlustur(isletme, gd1, giris);
          }
          const alternatifler = this._enYakinAlternatif(saatFmt1, giris);
          if (alternatifler.length > 0) {
            const txt = botMesajlar.get(isletme, 'saatDolu', { saat: giris, alternatifler: alternatifler.map(a => a.saat) });
            return { metin: txt, butonlar: null };
          }
        }

        // Dilim seçimi: 1=sabah, 2=öğle, 3=akşam, 4=tümü + kelime alias
        const dilimler = { '1': 'sabah', '2': 'ogle', '3': 'aksam', '4': 'hepsi' };
        const dilimAlias = { 'sabah': 'sabah', 'öğle': 'ogle', 'ogle': 'ogle', 'akşam': 'aksam', 'aksam': 'aksam', 'tümü': 'hepsi', 'hepsi': 'hepsi', 'morning': 'sabah', 'afternoon': 'ogle', 'evening': 'aksam', 'all': 'hepsi', 'show all': 'hepsi', 'صباح': 'sabah', 'ظهر': 'ogle', 'مساء': 'aksam' };
        let secDilim = dilimler[metin] || dilimAlias[metinKucuk];
        if (secDilim) {
          const dilimKey = secDilim === 'hepsi' ? 'hepsi' : secDilim;
          const sonuc = this._saatDilimiListele(saatFmt1, secDilim === 'hepsi' ? null : secDilim, tarihStr1, isletme);
          // Filtreli saatler varsa saat_secimi'ne geç, seçilen dilimi kaydet
          if (sonuc.filtreli && sonuc.filtreli.length > 0) {
            await this.durumGuncelle(musteriTelefon, isletmeId, 'saat_secimi', { secilen_dilim: dilimKey });
          }
          return { metin: sonuc.metin, butonlar: null };
        }

        // Anlaşılamadı → dilim sorusunu tekrar göster
        const sabah1 = saatFmt1.filter(s => parseInt(s.split(':')[0]) < 12);
        const ogle1 = saatFmt1.filter(s => { const h = parseInt(s.split(':')[0]); return h >= 12 && h < 17; });
        const aksam1 = saatFmt1.filter(s => parseInt(s.split(':')[0]) >= 17);
        const txt1 = botMesajlar.get(isletme, 'zamanDilimiSor', {
          tarihStr: tarihStr1, toplamSaat: saatFmt1.length,
          sabah: sabah1.length ? `${sabah1[0]} - ${sabah1[sabah1.length-1]}` : null, sabahSayi: sabah1.length,
          ogle: ogle1.length ? `${ogle1[0]} - ${ogle1[ogle1.length-1]}` : null, ogleSayi: ogle1.length,
          aksam: aksam1.length ? `${aksam1[0]} - ${aksam1[aksam1.length-1]}` : null, aksamSayi: aksam1.length,
        });
        return { metin: txt1, butonlar: null };
      }

      // ═══ SAAT SEÇİMİ (listeden numara seç veya saat yaz) ═══
      case 'saat_secimi': {
        if (metinKucuk === '0' || metinKucuk.includes('ana menü') || metinKucuk.includes('main menu') || metinKucuk.includes('الرئيسية')) {
          await this.durumGuncelle(musteriTelefon, isletmeId, 'ana_menu');
          return await this.anaMenu(isletme, musteriTelefon, isletmeId, hizmetler);
        }
        // Context switch: tarih değiştirmek istiyor
        if (metinKucuk.includes('bugün') || metinKucuk.includes('bugun') || metinKucuk.includes('today') || metinKucuk.includes('اليوم')) {
          return await this._tarihSecildi(bugunTarih(), musteriTelefon, isletmeId, isletme, hizmetler);
        }
        if (metinKucuk.includes('yarın') || metinKucuk.includes('yarin') || metinKucuk.includes('tomorrow') || metinKucuk.includes('غدا')) {
          return await this._tarihSecildi(yarinTarih(), musteriTelefon, isletmeId, isletme, hizmetler);
        }
        if (metinKucuk.includes('bu hafta') || metinKucuk.includes('başka gün') || metinKucuk.includes('baska gun') || metinKucuk.includes('this week') || metinKucuk.includes('هذا الأسبوع')) {
          await this.durumGuncelle(musteriTelefon, isletmeId, 'hafta_gun_secimi');
          return this.haftaSecenekleri(isletme);
        }
        const randevuService = require('./randevu');
        const guncelDurum = (await pool.query('SELECT * FROM bot_durum WHERE musteri_telefon=$1 AND isletme_id=$2', [musteriTelefon, isletmeId])).rows[0];
        const saatler = await randevuService.musaitSaatleriGetir(isletmeId, guncelDurum.secilen_tarih, guncelDurum.secilen_calisan_id, guncelDurum.secilen_hizmet_id);
        const tumSaatFmt = saatler.map(s => String(s).substring(0,5));

        // Filtreli liste — secilen_dilim'e göre
        let saatFmt = tumSaatFmt;
        const dilim = guncelDurum.secilen_dilim;
        if (dilim && dilim !== 'hepsi') {
          if (dilim === 'sabah') saatFmt = tumSaatFmt.filter(s => parseInt(s.split(':')[0]) < 12);
          else if (dilim === 'ogle') saatFmt = tumSaatFmt.filter(s => { const h = parseInt(s.split(':')[0]); return h >= 12 && h < 17; });
          else if (dilim === 'aksam') saatFmt = tumSaatFmt.filter(s => parseInt(s.split(':')[0]) >= 17);
        }

        // Serbest saat girişi: "14:30", "18:00", "14.30"
        const saatMatch = metin.match(/^(\d{1,2})[.:](\d{2})$/);
        if (saatMatch) {
          const giris = saatMatch[1].padStart(2,'0') + ':' + saatMatch[2];
          if (tumSaatFmt.includes(giris)) {
            await this.durumGuncelle(musteriTelefon, isletmeId, 'onay', { secilen_saat: giris, secilen_dilim: null });
            return await this._ozetOlustur(isletme, guncelDurum, giris);
          }
          const alternatifler = this._enYakinAlternatif(tumSaatFmt, giris);
          if (alternatifler.length > 0) {
            const txt = botMesajlar.get(isletme, 'saatDolu', { saat: giris, alternatifler: alternatifler.map(a => a.saat) });
            return { metin: txt, butonlar: null };
          }
        }

        // Numara ile seçim — filtreli listedeki saat numarası
        const si = parseInt(metin);
        let secilenSaat = null;
        if (tumSaatFmt.includes(metin)) secilenSaat = metin;
        else if (si >= 1 && si <= saatFmt.length) secilenSaat = saatFmt[si - 1];

        if (secilenSaat) {
          await this.durumGuncelle(musteriTelefon, isletmeId, 'onay', { secilen_saat: secilenSaat, secilen_dilim: null });
          return await this._ozetOlustur(isletme, guncelDurum, secilenSaat);
        }

        // Anlaşılamadı → dilim seçimine geri dön veya tekrar listele
        if (tumSaatFmt.length > 6) {
          await this.durumGuncelle(musteriTelefon, isletmeId, 'saat_dilimi_secimi', { secilen_dilim: null });
          const tarihStr = this.tarihFormat(guncelDurum.secilen_tarih);
          const sabah = tumSaatFmt.filter(s => parseInt(s.split(':')[0]) < 12);
          const ogle = tumSaatFmt.filter(s => { const h = parseInt(s.split(':')[0]); return h >= 12 && h < 17; });
          const aksam = tumSaatFmt.filter(s => parseInt(s.split(':')[0]) >= 17);
          const txt = botMesajlar.get(isletme, 'zamanDilimiSor', {
            tarihStr, toplamSaat: tumSaatFmt.length,
            sabah: sabah.length ? `${sabah[0]} - ${sabah[sabah.length-1]}` : null, sabahSayi: sabah.length,
            ogle: ogle.length ? `${ogle[0]} - ${ogle[ogle.length-1]}` : null, ogleSayi: ogle.length,
            aksam: aksam.length ? `${aksam[0]} - ${aksam[aksam.length-1]}` : null, aksamSayi: aksam.length,
          });
          return { metin: txt, butonlar: null };
        }
        const txt = botMesajlar.get(isletme, 'saatAnlasilamadi', { saatler: saatFmt.slice(0, 6), fazla: 0 });
        return { metin: txt, butonlar: null };
      }

      case 'onay': {
        const randevuService = require('./randevu');
        if (metin === '1' || metinKucuk.includes('evet') || metinKucuk.includes('onayla') || metinKucuk.includes('yes') || metinKucuk.includes('confirm') || metinKucuk.includes('نعم') || metinKucuk.includes('تأكيد')) {
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
              kaporaMesaj += `\n\n_Powered by SıraGO — sırago.com_`;
              return { metin: kaporaMesaj, butonlar: null };
            } catch (err) {
              console.error('❌ Kapora ödeme linki hatası:', err.message);
              // Shopier hatası — randevuyu yine de normal onayla
              await pool.query("UPDATE randevular SET durum='onaylandi', kapora_durumu='yok' WHERE id=$1", [sonuc.randevu.id]);
            }
          }

          // Manuel onay modunda farklı mesaj göster
          if (sonuc.manuelOnay) {
            let bekle = `⏳ *Randevunuz kaydedildi!*\n\n`;
            bekle += `🏥 ${isletme.isim}\n`;
            if (sonuc.hizmet) bekle += `✂️ ${sonuc.hizmet.isim}\n`;
            if (clOnay) bekle += `👤 ${clOnay.isim}\n`;
            bekle += `📅 ${this.tarihFormat(sd.secilen_tarih)}\n`;
            bekle += `🕐 ${this.saatFormat(sd.secilen_saat)}\n`;
            bekle += `\n⏳ İşletme randevunuzu *${isletme.onay_timeout_dk || 30} dakika* içinde onaylayacak.`;
            bekle += `\nOnay verilmezse randevunuz otomatik iptal edilir.`;
            bekle += `\n\n_Powered by SıraGO — sırago.com_`;
            return { metin: bekle, butonlar: null };
          }

          const tebrik = botMesajlar.get(isletme, 'randevuOnaylandi', { isletmeAd: isletme.isim, hizmetAd: sonuc.hizmet?.isim, _hizmetEN: sonuc.hizmet?.isim_en, _hizmetAR: sonuc.hizmet?.isim_ar, calisanAd: clOnay?.isim, tarihStr: this.tarihFormat(sd.secilen_tarih), saatStr: this.saatFormat(sd.secilen_saat) });
          return { metin: tebrik, butonlar: null };
        } else if (metinKucuk !== '2' && !metinKucuk.includes('iptal') && !metinKucuk.includes('hayır') && metin.length > 1) {
          // Musteri not yazdi - onaylayip notu kaydet
          const sd = (await pool.query('SELECT * FROM bot_durum WHERE musteri_telefon=$1 AND isletme_id=$2', [musteriTelefon, isletmeId])).rows[0];
          const sonuc = await randevuService.randevuOlustur({ isletmeId, musteriTelefon, hizmetId: sd.secilen_hizmet_id, calisanId: sd.secilen_calisan_id, tarih: sd.secilen_tarih, saat: sd.secilen_saat });
          if (sonuc && sonuc.randevu) {
            await pool.query('UPDATE randevular SET not_text=$1 WHERE id=$2', [metin, sonuc.randevu.id]);
          }
          await this.durumGuncelle(musteriTelefon, isletmeId, 'ana_menu', { secilen_hizmet_id: null, secilen_tarih: null, secilen_saat: null, secilen_calisan_id: null });
          return { metin: botMesajlar.get(isletme, 'randevuNotKaydedildi', { not: metin }), butonlar: null };
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
          return { metin: botMesajlar.get(isletme, 'randevuYok'), butonlar: null };
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
          // İptal sınırı kontrolü
          const iptalSinir = isletme.iptal_sinir_saat || 0;
          if (iptalSinir > 0) {
            try {
              const rTarih = new Date(secilenRandevu.tarih).toISOString().split('T')[0];
              const rSaat = String(secilenRandevu.saat).substring(0,5);
              const randevuZamani = new Date(`${rTarih}T${rSaat}:00`);
              const kalanSaat = (randevuZamani - Date.now()) / 3600000;
              if (kalanSaat < iptalSinir) {
                await this.durumGuncelle(musteriTelefon, isletmeId, 'ana_menu', { iptal_randevu_id: null });
                return { metin: `❌ *Bu randevu artık iptal edilemez.*\n\nRandevuya ${iptalSinir} saatten az kaldığı için iptal yapılamaz.\n\n📅 Ana menü için *0* yazın.`, butonlar: null };
              }
            } catch (e) { /* tarih parse hatası — devam et */ }
          }
          await this.durumGuncelle(musteriTelefon, isletmeId, 'iptal_onay', { iptal_randevu_id: secilenRandevu.id });
          return { metin: botMesajlar.get(isletme, 'iptalOnay', { hizmetAd: secilenRandevu.hizmet_isim || 'Randevu', tarihStr: this.tarihFormat(secilenRandevu.tarih), saatStr: String(secilenRandevu.saat).substring(0,5) }), butonlar: null };
        }
        // Anlaşılamadı, listeyi tekrar göster
        const rListRetry = randevular.map(r => ({ ...r, tarihStr: this.tarihFormat(r.tarih), saatStr: String(r.saat).substring(0,5) }));
        return { metin: botMesajlar.get(isletme, 'iptalListesi', { randevular: rListRetry }), butonlar: null };
      }

      case 'iptal_onay': {
        const randevuService = require('./randevu');
        if (metin === '1' || metinKucuk.includes('evet') || metinKucuk.includes('iptal et')) {
          const gd = (await pool.query('SELECT iptal_randevu_id FROM bot_durum WHERE musteri_telefon=$1 AND isletme_id=$2', [musteriTelefon, isletmeId])).rows[0];
          if (gd?.iptal_randevu_id) {
            await randevuService.randevuIptal(gd.iptal_randevu_id);
          }
          await this.durumGuncelle(musteriTelefon, isletmeId, 'ana_menu', { iptal_randevu_id: null });
          return { metin: botMesajlar.get(isletme, 'iptalBasarili', { hizmetAd: 'Randevu' }), butonlar: null };
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
    let musteriAd = '';
    try {
      const mRes = await pool.query('SELECT isim FROM musteriler WHERE telefon=$1', [musteriTelefon]);
      if (mRes.rows[0] && mRes.rows[0].isim && mRes.rows[0].isim !== musteriTelefon) {
        musteriAd = mRes.rows[0].isim;
      }
    } catch(e) {}

    const msg = botMesajlar.get(isletme, 'anaMenu', { musteriAd, isletmeAd: isletme.isim });
    return { metin: msg, butonlar: null };
  }

  hizmetListesi(isletme, hizmetler) {
    const metin = botMesajlar.get(isletme, 'hizmetListesi', { isletmeAd: isletme.isim, hizmetler, fiyatFormat: this.fiyatFormat });
    return { metin, butonlar: null };
  }

  haftaSecenekleri(isletme) {
    const gunler = ['Pazar','Pazartesi','Salı','Çarşamba','Perşembe','Cuma','Cumartesi'];
    const aylar = ['Ocak','Şubat','Mart','Nisan','Mayıs','Haziran','Temmuz','Ağustos','Eylül','Ekim','Kasım','Aralık'];
    const gunLabels = [];
    for (let i = 0; i < 7; i++) {
      const t = new Date(); t.setDate(t.getDate() + i);
      gunLabels.push(`${t.getDate()} ${aylar[t.getMonth()]} ${gunler[t.getDay()]}`);
    }
    const metin = botMesajlar.get(isletme || {}, 'gunSec', { gunler: gunLabels });
    return { metin, butonlar: null };
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
      return { metin: botMesajlar.get(isletme, 'saatYok', { tarihStr: this.tarihFormat(secilenTarih) }), butonlar: null };
    }
    const saatFmt = saatler.map(s => String(s).substring(0,5));

    // Az saat varsa direkt listele, çoksa zaman dilimi sor
    if (saatFmt.length <= 6) {
      await this.durumGuncelle(musteriTelefon, isletmeId, 'saat_secimi', { secilen_tarih: secilenTarih });
      return { metin: botMesajlar.get(isletme, 'saatListesi', { tarihStr: this.tarihFormat(secilenTarih), saatler: saatFmt }), butonlar: null };
    }

    // Çok saat var → zaman dilimi sorusu, ayrı aşama
    await this.durumGuncelle(musteriTelefon, isletmeId, 'saat_dilimi_secimi', { secilen_tarih: secilenTarih });
    const sabah = saatFmt.filter(s => parseInt(s.split(':')[0]) < 12);
    const ogle = saatFmt.filter(s => { const h = parseInt(s.split(':')[0]); return h >= 12 && h < 17; });
    const aksam = saatFmt.filter(s => parseInt(s.split(':')[0]) >= 17);

    const txt = botMesajlar.get(isletme, 'zamanDilimiSor', {
      tarihStr: this.tarihFormat(secilenTarih), toplamSaat: saatFmt.length,
      sabah: sabah.length ? `${sabah[0]} - ${sabah[sabah.length-1]}` : null, sabahSayi: sabah.length,
      ogle: ogle.length ? `${ogle[0]} - ${ogle[ogle.length-1]}` : null, ogleSayi: ogle.length,
      aksam: aksam.length ? `${aksam[0]} - ${aksam[aksam.length-1]}` : null, aksamSayi: aksam.length,
    });
    return { metin: txt, butonlar: null };
  }

  _saatDilimiListele(saatFmt, dilim, tarihStr, isletme) {
    let filtreli;
    if (dilim === 'sabah') filtreli = saatFmt.filter(s => parseInt(s.split(':')[0]) < 12);
    else if (dilim === 'ogle') filtreli = saatFmt.filter(s => { const h = parseInt(s.split(':')[0]); return h >= 12 && h < 17; });
    else if (dilim === 'aksam') filtreli = saatFmt.filter(s => parseInt(s.split(':')[0]) >= 17);
    else filtreli = saatFmt;

    const dilimAdiMap = { sabah: '🌅 Sabah', ogle: '☀️ Öğle', aksam: '🌙 Akşam' };
    const txt = isletme ? botMesajlar.get(isletme, 'zamanDilimiListele', {
      tarihStr, dilimAdi: dilimAdiMap[dilim] || null, saatler: filtreli, bos: !filtreli.length
    }) : `📅 *${tarihStr}*\n\n`;
    return { metin: txt, butonlar: null, filtreli };
  }

  async _ozetOlustur(isletme, guncelDurum, secilenSaat) {
    const hz = guncelDurum.secilen_hizmet_id ? (await pool.query('SELECT * FROM hizmetler WHERE id=$1', [guncelDurum.secilen_hizmet_id])).rows[0] : null;
    const cl = guncelDurum.secilen_calisan_id ? (await pool.query('SELECT * FROM calisanlar WHERE id=$1', [guncelDurum.secilen_calisan_id])).rows[0] : null;
    const ozet = botMesajlar.get(isletme, 'randevuOzet', {
      isletmeAd: isletme.isim, hizmetAd: hz?.isim, _hizmetEN: hz?.isim_en, _hizmetAR: hz?.isim_ar, calisanAd: cl?.isim,
      tarihStr: this.tarihFormat(guncelDurum.secilen_tarih), saatStr: secilenSaat,
      fiyat: hz ? this.fiyatFormat(hz.fiyat) : null
    });
    return { metin: ozet, butonlar: null };
  }

  _enYakinAlternatif(saatFmt, istenenSaat) {
    // "14:30" → dakikaya çevir, en yakın 2 boş saati bul
    const [ih, im] = istenenSaat.split(':').map(Number);
    const istenenDk = ih * 60 + (im || 0);
    const mesafeler = saatFmt.map(s => {
      const [sh, sm] = s.split(':').map(Number);
      return { saat: s, fark: Math.abs((sh * 60 + sm) - istenenDk) };
    }).sort((a, b) => a.fark - b.fark);
    return mesafeler.slice(0, 2);
  }

  // ═══════════════════════════════════════════════════════
  // AKILLI TEYİT ZİNCİRİ — mesajIsle'den önce çağrılır
  // Geliyorum / İptal → randevu teyidi
  // 1-5 puan → post-randevu anket cevabı
  // null döndürürse → normal bot akışına devam
  // ═══════════════════════════════════════════════════════
  async _teyitZinciriKontrol(metinKucuk, metin, musteriTelefon, isletmeId, remoteJid) {
    const randevuService = require('./randevu');

    // ─── Aşama 1: Teyit yanıtı (Geliyorum / İptal) ───
    // Müşterinin bugün teyit_gonderildi=true olan onaylı randevusu var mı?
    const geliyorumIntents = ['geliyorum', '1', 'evet', 'geleceğim', 'gelecegim', 'gelicem', 'tamam', 'ok', 'geliyoruz', '✅'];
    const iptalIntents = ['iptal', '2', 'hayır', 'hayir', 'gelemiyorum', 'gelemem', 'yapamam', 'vazgeçtim', 'vazgectim', '❌', 'iptal et'];

    const isTeyitYanit = geliyorumIntents.includes(metinKucuk) || iptalIntents.includes(metinKucuk);

    if (isTeyitYanit) {
      try {
        const teyitRandevu = (await pool.query(`
          SELECT r.id, r.saat, r.tarih, h.isim as hizmet_isim, i.isim as isletme_isim
          FROM randevular r
          JOIN isletmeler i ON r.isletme_id = i.id
          JOIN musteriler m ON r.musteri_id = m.id
          LEFT JOIN hizmetler h ON r.hizmet_id = h.id
          WHERE r.isletme_id = $1 AND m.telefon = $2
            AND r.durum = 'onaylandi'
            AND r.teyit_gonderildi = true
            AND r.tarih = CURRENT_DATE
            AND r.saat > NOW()::time
          ORDER BY r.saat ASC LIMIT 1
        `, [isletmeId, musteriTelefon])).rows[0];

        if (teyitRandevu) {
          const saat = String(teyitRandevu.saat).substring(0, 5);

          if (iptalIntents.includes(metinKucuk)) {
            // Müşteri iptal etti → randevuyu düşür, slotu aç
            await pool.query("UPDATE randevular SET durum = 'iptal' WHERE id = $1", [teyitRandevu.id]);
            console.log(`❌ Teyit → İPTAL: ${musteriTelefon} - ${teyitRandevu.isletme_isim} ${saat}`);
            return `❌ *Randevunuz iptal edildi.*\n\n🏥 ${teyitRandevu.isletme_isim}\n${teyitRandevu.hizmet_isim ? '✂️ ' + teyitRandevu.hizmet_isim + '\n' : ''}🕐 ${saat}\n\nYeni randevu almak için *1* yazın.`;
          }

          if (geliyorumIntents.includes(metinKucuk)) {
            // Müşteri gelecek → durum zaten onaylı, teyit edildi
            console.log(`✅ Teyit → GELİYORUM: ${musteriTelefon} - ${teyitRandevu.isletme_isim} ${saat}`);
            return `✅ *Harika, sizi bekliyoruz!*\n\n🏥 ${teyitRandevu.isletme_isim}\n${teyitRandevu.hizmet_isim ? '✂️ ' + teyitRandevu.hizmet_isim + '\n' : ''}🕐 Saat: ${saat}\n\nGörüşmek üzere! 😊`;
          }
        }
      } catch (e) { console.error('Teyit zinciri kontrol hatası:', e.message); }
    }

    // ─── Aşama 3: Puan yanıtı (1-5) — anket gönderilmiş randevu var mı? ───
    const puanMatch = metin.match(/^([1-5])$/);
    if (puanMatch) {
      try {
        const anketRandevu = (await pool.query(`
          SELECT r.id, r.musteri_id, r.isletme_id, r.saat, h.isim as hizmet_isim, i.isim as isletme_isim
          FROM randevular r
          JOIN isletmeler i ON r.isletme_id = i.id
          JOIN musteriler m ON r.musteri_id = m.id
          LEFT JOIN hizmetler h ON r.hizmet_id = h.id
          WHERE r.isletme_id = $1 AND m.telefon = $2
            AND r.durum = 'onaylandi'
            AND r.anket_gonderildi = true
            AND r.tarih = CURRENT_DATE
          ORDER BY r.saat DESC LIMIT 1
        `, [isletmeId, musteriTelefon])).rows[0];

        if (anketRandevu) {
          const puan = parseInt(puanMatch[1]);
          // Randevuyu tamamlandı yap (puan veren adam gelmiştir)
          await pool.query("UPDATE randevular SET durum = 'tamamlandi' WHERE id = $1", [anketRandevu.id]);
          // Memnuniyet kaydı oluştur
          try {
            await pool.query(
              'INSERT INTO memnuniyet (randevu_id, musteri_id, isletme_id, puan) VALUES ($1, $2, $3, $4)',
              [anketRandevu.id, anketRandevu.musteri_id, anketRandevu.isletme_id, puan]
            );
          } catch (e) { /* memnuniyet tablosu yoksa skip */ }

          const yildizlar = '⭐'.repeat(puan);
          console.log(`⭐ Anket → ${puan} puan: ${musteriTelefon} - ${anketRandevu.isletme_isim}`);

          if (puan >= 4) {
            return `${yildizlar}\n\n*Teşekkür ederiz!* Memnuniyetiniz bizim için çok değerli. 🙏\n\nTekrar görüşmek üzere!\n\n📅 Yeni randevu için *1* yazın.`;
          } else if (puan >= 2) {
            return `${yildizlar}\n\n*Geri bildiriminiz için teşekkürler.* Kendimizi geliştirmek için değerlendireceğiz.\n\n📅 Yeni randevu için *1* yazın.`;
          } else {
            return `${yildizlar}\n\n*Üzgünüz, beklentinizi karşılayamadık.* Geri bildiriminiz bizim için çok önemli.\n\n📅 Yeni randevu için *1* yazın.`;
          }
        }
      } catch (e) { console.error('Anket puan kontrol hatası:', e.message); }
    }

    return null; // Zincir yakalamadı → normal bot akışına devam
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
