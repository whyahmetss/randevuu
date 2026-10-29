const ELLE_SESSIZ_DK = 180;
// Tanıdık sayılmayı engelleyen dükkân sözleri (sade yazımla): bunlardan biri geçtiyse kişi müşteri olabilir
// Müşteri sözü (tanıdık sayılmaz). "tıraş" sadeleşince "tiras" olur (eskiden yakalanmıyordu); gelme/uygunluk sorusu da dükkân işi
const DUKKAN_SOZU = /\b(randevu|sira|musait|yer var|bos|fiyat|ucret|kac para|ne kadar|tras|tiras|sac|sakal|kesim|bakim|boya|fon|manikur|kas|cilt|kapora|adres|kacta|acik mi|acik misin|kapali mi|gelebilir miyim|gelcem|gelecegim|gelsem|geleyim|gelicem|uygun mu|uygun musun|kac kisi|bekleme)/;   // esnaf telefondan yazınca bot o kişiye 3 saat susar
const { default: makeWASocket, DisconnectReason, fetchLatestBaileysVersion, makeCacheableSignalKeyStore, Browsers } = require('@whiskeysockets/baileys');
const qrcode = require('qrcode');
const pool = require('../config/db');
const EventEmitter = require('events');
const pino = require('pino');
const { bugunTarih, yarinTarih, gunSonraTarih, tarihFormatla } = require('../utils/tarih');
const { usePostgresAuthState } = require('../utils/pgAuthState');
const botMesajlar = require('../utils/botMesajlar');
const socketServer = require('./socketServer');

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
      this.bekciBaslat();
    } catch (err) {
      console.error('❌ WP servisleri başlatılamadı:', err.message);
    }
  }

  // Numara ile bağla: soketi başlatır, WhatsApp'ın verdiği 8 haneli kodu döner (15 sn içinde)
  async eslestirmeKoduAl(isletmeId, isletmeIsim, telefon) {
    let tel = String(telefon || '').replace(/\D/g, '');
    if (tel.startsWith('0')) tel = '9' + tel;
    if (tel.length === 10) tel = '90' + tel;
    if (!/^\d{11,15}$/.test(tel)) throw new Error('Telefon numarasını 05xx xxx xx xx şeklinde yazın');
    const bekle = new Promise((coz) => {
      const t = setTimeout(() => coz(null), 20000);
      this.once(`kod_${isletmeId}`, (kod) => { clearTimeout(t); coz(kod); });
    });
    await this.isletmeBaslat(isletmeId, isletmeIsim, true, { eslestirmeTel: tel });
    const kod = await bekle;
    if (!kod) throw new Error('WhatsApp kodu vermedi, birkaç saniye sonra tekrar deneyin ya da QR ile bağlayın');
    return kod;
  }

  async isletmeBaslat(isletmeId, isletmeIsim, yeniBaslat = true, secenek = {}) {
    // Zaten bağlıysa durdurma
    if (this.isletmeler[isletmeId]?.durum === 'bagli') return;
    // Zaten başlatma/bağlanma sürecindeyse: paralel çağrıyı blokla (race protection)
    // Ama "yeniBaslat=true" ise kullanıcı buton → force restart
    if (this.isletmeler[isletmeId]?._baslatiliyor && !yeniBaslat) return;
    // Varsa kapat ve PROMISIFY EDILEN şekilde bekle (zombie socket 401'e neden oluyor)
    if (this.isletmeler[isletmeId]?.sock) {
      try {
        const eskiSock = this.isletmeler[isletmeId].sock;
        this.isletmeler[isletmeId].sock = null; // referansı kes önce
        try { eskiSock.end(undefined); } catch (e) {}
        try { eskiSock.ws?.close?.(); } catch (e) {}
        // Baileys'in kapanma event'lerinin akması için kısa bir delay
        await new Promise(r => setTimeout(r, 300));
      } catch (e) {}
    }

    // State'i koru (reconnect durumlarında) — kullanıcı yeniBaslat derse sayaçları sıfırla
    const onceki = this.isletmeler[isletmeId];
    this.isletmeler[isletmeId] = {
      sock: null, durum: 'baslatiyor', qr: null, qrBase64: null, isim: isletmeIsim,
      _baslatiliyor: true,
      qrAttempts: yeniBaslat ? 0 : (onceki?.qrAttempts || 0),
      basariliOturumVardi: yeniBaslat ? false : (onceki?.basariliOturumVardi || false),
      reconnectAttempts: yeniBaslat ? 0 : (onceki?.reconnectAttempts || 0),
      cakismaSayisi: yeniBaslat ? 0 : (onceki?.cakismaSayisi || 0),
    };

    try {
      const { state, saveCreds } = await usePostgresAuthState(pool, isletmeId);
      // DB'de kayıtlı oturum varsa (sunucu yeniden başladı) bu "QR taranmamış" yeni bağlantı değildir:
      // ilk kopmada kalıcı durdurulmasın, yeniden bağlanma kuralları geçerli olsun
      if (state.creds?.me?.id) this.isletmeler[isletmeId].basariliOturumVardi = true;
      const { version } = await fetchLatestBaileysVersion();

      const sock = makeWASocket({
        version,
        auth: {
          creds: state.creds,
          keys: makeCacheableSignalKeyStore(state.keys, pino({ level: 'silent' })),
        },
        printQRInTerminal: false,
        // Teşhis (2026-10-15): Baileys yalnız hata seviyesinde loglar (gönderim/şifreleme hataları görünsün)
        logger: pino({ level: 'error' }),
        // WhatsApp'ın tanıdığı standart browser imzası — custom string 401'e yol açıyor
        browser: Browsers.ubuntu('Chrome'),
        generateHighQualityLinkPreview: false,
        syncFullHistory: false,
        markOnlineOnConnect: false,
        getMessage: async () => ({ conversation: '' }),
      });

      this.isletmeler[isletmeId].eslestirmeTel = secenek.eslestirmeTel || null;
      this.isletmeler[isletmeId].eslestirmeKodu = null;
      this.isletmeler[isletmeId].sock = sock;
      // Botun gönderdiği her mesaj işaretlenir: işaretsiz giden mesaj = esnaf telefondan elle yazdı (aşağıda _elleYazdi)
      const asilGonder = sock.sendMessage.bind(sock);
      sock.sendMessage = async (...a) => { const g = await asilGonder(...a); if (g?.key?.id) this._botGidenIsaretle(g.key.id); return g; };

      // Credentials güncellendiğinde kaydet
      sock.ev.on('creds.update', saveCreds);

      // Bağlantı durumu
      sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;

        // Numara ile bağlama: QR yerine 8 haneli kod (WhatsApp → Bağlı cihazlar → Telefon numarasıyla bağla)
        if (qr && this.isletmeler[isletmeId]?.eslestirmeTel && !this.isletmeler[isletmeId].eslestirmeKodu) {
          try {
            const kod = await sock.requestPairingCode(this.isletmeler[isletmeId].eslestirmeTel);
            this.isletmeler[isletmeId].eslestirmeKodu = kod;
            this.isletmeler[isletmeId].durum = 'kod_bekleniyor';
            this.emit(`kod_${isletmeId}`, kod);
            socketServer.emitToIsletme(isletmeId, 'wa:kod', { kod, durum: 'kod_bekleniyor' });
            console.log(`🔢 Eşleştirme kodu hazır: ${isletmeIsim}`);
          } catch (e) { console.error('Eşleştirme kodu alınamadı:', e.message); this.emit(`kod_${isletmeId}`, null); }
          return;
        }
        if (qr && this.isletmeler[isletmeId]?.eslestirmeKodu) return;   // kod beklenirken QR üretme

        if (qr) {
          this.isletmeler[isletmeId].qrAttempts = (this.isletmeler[isletmeId].qrAttempts || 0) + 1;
          if (this.isletmeler[isletmeId].qrAttempts > 5) {
            console.log(`⏹️ QR ${this.isletmeler[isletmeId].qrAttempts}. deneme — ${isletmeIsim} durduruluyor (taranmadı)`);
            this.isletmeler[isletmeId].durum = 'bagli_degil';
            this.isletmeler[isletmeId].qrBase64 = null;
            try { sock.end(); } catch(e) {}
            this.isletmeler[isletmeId].sock = null;
            return;
          }
          try {
            const qrBase64 = await qrcode.toDataURL(qr);
            this.isletmeler[isletmeId].qr = qr;
            this.isletmeler[isletmeId].qrBase64 = qrBase64;
            this.isletmeler[isletmeId].durum = 'qr_bekleniyor';
            console.log(`📱 QR hazır (${this.isletmeler[isletmeId].qrAttempts}/5): ${isletmeIsim}`);
            this.emit(`qr_${isletmeId}`, qrBase64);
            socketServer.emitToIsletme(isletmeId, 'wa:qr', { qr_base64: qrBase64, durum: 'qr_bekleniyor' });
          } catch (e) {
            console.error(`❌ QR oluşturma hatası:`, e.message);
          }
        }

        if (connection === 'open') {
          this.isletmeler[isletmeId].durum = 'bagli';
          this.isletmeler[isletmeId].qr = null;
          this.isletmeler[isletmeId].qrBase64 = null;
          this.isletmeler[isletmeId].basariliOturumVardi = true;
          this.isletmeler[isletmeId].qrAttempts = 0;
          this.isletmeler[isletmeId].reconnectAttempts = 0;
          this.isletmeler[isletmeId].cakismaSayisi = 0;
          this.isletmeler[isletmeId]._baslatiliyor = false;
          const numara = sock.user?.id?.split(':')[0] || sock.user?.id?.split('@')[0] || null;
          if (numara) {
            // booking_acik'e dokunulmaz (2026-10-29): sayfa WhatsApp'sız da açık, esnafın kapattığı da kapalı kalır
            await pool.query(
              `UPDATE isletmeler SET whatsapp_no=$1 WHERE id=$2`,
              [`+${numara}`, isletmeId]
            );
          }
          console.log(`✅ WhatsApp bağlandı: ${isletmeIsim} (${numara})`);
          // Bağlantı geri geldi: açık WhatsApp uyarıları kendiliğinden kapanır
          const su = require('../utils/sistemUyari');
          su.coz(`alarm:WhatsApp çıkış: ${isletmeIsim}`); su.coz(`alarm:WhatsApp bağlanamıyor: ${isletmeIsim}`);
          this.emit(`bagli_${isletmeId}`, numara);
          socketServer.emitToIsletme(isletmeId, 'wa:bagli', { numara, durum: 'bagli' });
        }

        if (connection === 'close') { if (global.__kapaniyor) return; // kapanırken yeniden bağlanma (deploy çakışması)
          const statusCode = lastDisconnect?.error?.output?.statusCode;
          const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
          console.log(`❌ WhatsApp ayrıldı: ${isletmeIsim} - kod: ${statusCode}`);

          // Eski sock'u hemen terminal et (zombie olmasın)
          try { sock.end(undefined); } catch (e) {}
          try { sock.ws?.close?.(); } catch (e) {}

          if (statusCode === DisconnectReason.restartRequired || statusCode === 515) {
            // QR tarandıktan sonra WhatsApp bilerek koparıyor — NORMAL, yeni creds ile yeniden bağlan
            console.log(`🔄 restartRequired — QR tarandı, yeniden bağlanılıyor: ${isletmeIsim}`);
            // State'i koruyarak flagleri temizle (creds.update'in DB'ye flush olmasını bekle)
            if (this.isletmeler[isletmeId]) {
              this.isletmeler[isletmeId].sock = null;
              this.isletmeler[isletmeId].basariliOturumVardi = true; // 515 = session başladı
              this.isletmeler[isletmeId]._baslatiliyor = false;
              this.isletmeler[isletmeId].durum = 'baslatiyor';
            }
            // 2sn gecikme: creds.update listener'ının async DB yazmasını bekle
            setTimeout(() => {
              this.isletmeBaslat(isletmeId, isletmeIsim, false);
            }, 2000);
          } else if (statusCode === 440) {
            // 440 = oturum başka yerde açıldı. Render deploy'da eski ve yeni sunucu bir süre birlikte
            // çalışır; hemen yeniden bağlanmak iki kopyayı birbirini düşürmeye sokuyor ve 5 denemeden
            // sonra oturum anahtarları siliniyordu (esnaf QR'ı baştan okutmak zorunda kalıyordu).
            // Bekle (eski sunucu kapanır), anahtarlara DOKUNMA.
            const st = this.isletmeler[isletmeId];
            if (st) {
              st.sock = null; st._baslatiliyor = false; st.durum = 'baslatiyor';
              st.cakismaSayisi = (st.cakismaSayisi || 0) + 1;
              const bekle = Math.min(60000 * st.cakismaSayisi, 5 * 60000);
              console.log(`⏳ ${isletmeIsim} — oturum başka yerde açık (440), ${bekle / 1000}sn sonra tekrar`);
              clearTimeout(st._cakismaZaman);
              st._cakismaZaman = setTimeout(() => this.isletmeBaslat(isletmeId, isletmeIsim, false), bekle);
            }
          } else if (statusCode === DisconnectReason.loggedOut || statusCode === 401) {
            // 401 ya da loggedOut → oturum geçersiz, DB'den auth temizle, kullanıcıya bilgi ver
            if (this.isletmeler[isletmeId]) {
              this.isletmeler[isletmeId].durum = 'bagli_degil';
              this.isletmeler[isletmeId]._baslatiliyor = false;
              this.isletmeler[isletmeId].sock = null;
              this.isletmeler[isletmeId].qrBase64 = null;
              this.isletmeler[isletmeId].basariliOturumVardi = false;
            }
            try { await pool.query('DELETE FROM wa_auth_keys WHERE isletme_id=$1', [isletmeId]); } catch (e) {}
            const sebep = statusCode === 401 ? 'unauthorized' : 'logged_out';
            require('../utils/alarm').alarm(`WhatsApp çıkış: ${isletmeIsim}`, `İşletme #${isletmeId} WhatsApp oturumu kapandı (${sebep}). Bot bu işletmede çalışmıyor; esnafın tekrar QR okutması gerekiyor, arayın.`, { isletmeId });
            this.emit(`ayrildi_${isletmeId}`, sebep);
            socketServer.emitToIsletme(isletmeId, 'wa:ayrildi', {
              sebep,
              durum: 'bagli_degil',
              mesaj: statusCode === 401
                ? 'WhatsApp bağlantısı reddedildi. Telefonunuzdan WhatsApp → Ayarlar → Bağlı Cihazlar bölümüne girip varsa SıraGO cihazını silin ve tekrar QR tarayın.'
                : null,
            });
          } else if (shouldReconnect && this.isletmeler[isletmeId]?.basariliOturumVardi) {
            // Sadece daha önce başarılı oturum varsa yeniden bağlan
            const ra = (this.isletmeler[isletmeId].reconnectAttempts || 0) + 1;
            if (ra > 5) {
              // Anahtarları SİLME: ağ/WhatsApp kesintisi geçicidir; yalnız gerçek çıkışta (401/loggedOut)
              // silinir. 5 dakikada bir sessizce yeniden dene.
              console.log(`⏸️ ${isletmeIsim} — ${ra - 1} hızlı deneme başarısız, 5 dk'da bir denenecek`);
              require('../utils/alarm').alarm(`WhatsApp bağlanamıyor: ${isletmeIsim}`, `İşletme #${isletmeId} 5 denemede bağlanamadı, 5 dk'da bir tekrar deneniyor.`, { isletmeId });
              this.isletmeler[isletmeId].durum = 'bagli_degil';
              this.isletmeler[isletmeId]._baslatiliyor = false;
              this.isletmeler[isletmeId].sock = null;
              socketServer.emitToIsletme(isletmeId, 'wa:ayrildi', { sebep: 'gecici_kesinti', durum: 'bagli_degil' });
              setTimeout(() => {
                if (this.isletmeler[isletmeId] && this.isletmeler[isletmeId].durum !== 'bagli') {
                  this.isletmeler[isletmeId].reconnectAttempts = 3;   // sonraki turda 2 hızlı deneme daha
                  this.isletmeBaslat(isletmeId, isletmeIsim, false);
                }
              }, 5 * 60000);
            } else {
              const bekleme = Math.min(3000 * ra, 15000);
              console.log(`🔄 Yeniden bağlanılıyor: ${isletmeIsim} (${ra}/5, ${bekleme/1000}sn)`);
              // Canlı hata (2026-10-18): durum 'bagli' kalıyordu → isletmeBaslat "zaten bağlı" deyip dönüyor,
              // bot saatlerce ölü kalıyordu (Elit Barber 428 sonrası 22 saat). Durum ve sock burada sıfırlanır.
              const st = this.isletmeler[isletmeId];
              st.reconnectAttempts = ra; st.durum = 'baslatiyor'; st.sock = null; st._baslatiliyor = false;
              setTimeout(() => {
                this.isletmeBaslat(isletmeId, isletmeIsim, false);
              }, bekleme);
            }
          } else if (shouldReconnect && !this.isletmeler[isletmeId]?.basariliOturumVardi) {
            console.log(`⏹️ ${isletmeIsim} — QR taranmadan bağlantı düştü (kod: ${statusCode}), durduruluyor`);
            if (this.isletmeler[isletmeId]) {
              this.isletmeler[isletmeId].durum = 'bagli_degil';
              this.isletmeler[isletmeId]._baslatiliyor = false;
              this.isletmeler[isletmeId].sock = null;
            }
            socketServer.emitToIsletme(isletmeId, 'wa:ayrildi', { sebep: 'qr_not_scanned', durum: 'bagli_degil' });
          } else {
            if (this.isletmeler[isletmeId]) {
              this.isletmeler[isletmeId].durum = 'bagli_degil';
              this.isletmeler[isletmeId]._baslatiliyor = false;
              this.isletmeler[isletmeId].sock = null;
            }
            this.emit(`ayrildi_${isletmeId}`, 'disconnected');
            socketServer.emitToIsletme(isletmeId, 'wa:ayrildi', { sebep: 'disconnected', durum: 'bagli_degil' });
          }
        }
      });

      // Mesaj dinle
      sock.ev.on('messages.upsert', async (upsert) => {
        console.log(`📩 [${isletmeIsim}] messages.upsert tetiklendi: type=${upsert.type}, mesaj_sayisi=${upsert.messages?.length}`);
        if (upsert.type !== 'notify') {
          // Sekreter modu: telefondan "Kendime mesaj"a yazılan komut bazı WhatsApp sürümlerinde 'append' olarak gelir
          if (upsert.type === 'append') {
            for (const msg of upsert.messages || []) {
              if (this._kendiSohbetiMi(msg, isletmeId)) await this.sekreterKendi(msg, isletmeId).catch(e => console.error('Sekreter:', e.message));
              else if (msg.key?.fromMe) this._elleYazdi(msg, isletmeId);
            }
          }
          return;
        }
        for (const msg of upsert.messages) {
          // Müşteri mesaj metni loglanmaz (KVKK); yalnız uzunluk
          console.log(`📩 [${isletmeIsim}] Mesaj: fromMe=${msg.key.fromMe}, uzunluk=${(this._getMsgText(msg) || '').length}`);
          if (msg.key.fromMe) {
            // Esnafın kendi kendine yazdığı ("Kendime mesaj") → sekreter komutu olabilir; diğer giden mesajlar işlenmez
            if (this._kendiSohbetiMi(msg, isletmeId)) await this.sekreterKendi(msg, isletmeId).catch(e => console.error('Sekreter:', e.message));
            else this._elleYazdi(msg, isletmeId);
            continue;
          }
          if (!this._sonGelen) this._sonGelen = new Map();
          for (const j of [msg.key.remoteJid, msg.key.remoteJidAlt]) if (j) this._sonGelen.set(this._elleAnahtar(isletmeId, j), Date.now());
          if (this._sonGelen.size > 3000) for (const [k, t] of this._sonGelen) if (Date.now() - t > 60 * 1000) this._sonGelen.delete(k);
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


  // Saat kaçtı (2026-10-14): müşteri onaylarken o saati başka bir müşteri az önce aldı.
  // Sessiz kalınmaz: o günün boş saatleri sunulur; gün tamamen dolduysa müşteri bekleme listesine eklenir.
  async _saatKacti(isletme, musteriTelefon, isletmeId) {
    const randevuService = require('./randevu');
    const { tarihFormatla } = require('../utils/tarih');
    const sd = (await pool.query('SELECT * FROM bot_durum WHERE musteri_telefon=$1 AND isletme_id=$2', [musteriTelefon, isletmeId])).rows[0] || {};
    const tarih = sd.secilen_tarih ? tarihFormatla(sd.secilen_tarih) : null;
    const saat = sd.secilen_saat ? String(sd.secilen_saat).slice(0, 5) : '';
    const ozur = `😔 Çok üzgünüz, ${saat ? saat + ' saatini' : 'bu saati'} az önce başka bir müşteri aldı.`;
    if (!tarih) {
      await this.durumGuncelle(musteriTelefon, isletmeId, 'ana_menu', { secilen_hizmet_id: null, secilen_tarih: null, secilen_saat: null, secilen_calisan_id: null });
      return { metin: `${ozur}\n\nBaşka bir saat için gün ve saati yazabilirsiniz.`, butonlar: null };
    }
    // Usta "fark etmez" ile atanmış olabilir: boş saatlere bütün ustalar için bakılır
    const saatler = (await randevuService.musaitSaatleriGetir(isletmeId, tarih, null, sd.secilen_hizmet_id)).map(s => String(s).slice(0, 5));
    if (saatler.length) {
      if (isletme.bot_tarzi === 'menu') {
        await this.durumGuncelle(musteriTelefon, isletmeId, 'saat_secimi', { secilen_saat: null });
        return { metin: `${ozur}\n\n${botMesajlar.get(isletme, 'saatListesi', { tarihStr: this.tarihFormat(tarih), saatler })}`, butonlar: null };
      }
      await this.durumGuncelle(musteriTelefon, isletmeId, 'sohbet', { secilen_saat: null, secilen_calisan_id: null, sohbet_bekleyen: 'saat' });
      const secki = require('./sohbetAsistani').saatSecki(saatler);
      return { metin: `${ozur}\n\n${this.tarihFormat(tarih)} için boş saatler: ${secki}.\nSize hangisi uygun?`, butonlar: null };
    }
    // O gün yer kalmadı: bekleme listesine ekle (biri iptal ederse ilk ona yazılır)
    try { await require('./beklemeListesi').ekle({ isletmeId, telefon: musteriTelefon, hizmetIds: [sd.secilen_hizmet_id].filter(Boolean), tarih, kaynak: 'bot' }); } catch (e) { /* liste olmadan */ }
    await this.durumGuncelle(musteriTelefon, isletmeId, 'ana_menu', { secilen_hizmet_id: null, secilen_tarih: null, secilen_saat: null, secilen_calisan_id: null });
    return { metin: `${ozur}\n\n${this.tarihFormat(tarih)} için başka boş saat kalmadı. Sizi bekleme listesine ekledim; biri iptal ederse hemen buradan yazacağız.\n\nBaşka bir gün isterseniz gün ve saati yazmanız yeterli.`, butonlar: null };
  }

  // ═══ SEKRETER MODU (2026-10-14) ═══
  // Esnafın kendi numarasıyla açtığı "Kendime mesaj" sohbeti mi? Botun oraya yazdığı cevaplar tekrar işlenmez.
  // ── Esnaf sohbete girdi (kullanıcı kararı 2026-10-17): müşteriyle telefondan elle yazışırken bot araya girmesin.
  // Esnaf o kişiye elle yazınca bot ELLE_SESSIZ_DK boyunca o kişiye cevap vermez; her elle mesaj süreyi tazeler.
  _botGidenIsaretle(id) {
    if (!this._botGiden) this._botGiden = new Map();
    this._botGiden.set(id, Date.now());
    if (this._botGiden.size > 3000) for (const [k, t] of this._botGiden) if (Date.now() - t > 10 * 60 * 1000) this._botGiden.delete(k);
  }

  _elleAnahtar(isletmeId, jid) { return `${isletmeId}:${String(jid || '').replace(/[:@].*$/, '')}`; }

  _elleYazdi(msg, isletmeId) {
    const jid = msg?.key?.remoteJid || '';
    if (!msg?.message || !this._getMsgText(msg) || !/@(s\.whatsapp\.net|lid)$/.test(jid)) return;
    const ts = Number(msg.messageTimestamp?.low ?? msg.messageTimestamp ?? 0) * 1000;
    if (ts && Date.now() - ts > 2 * 60 * 1000) return;                 // yeniden bağlanınca gelen eski mesajlar sayılmaz
    // WhatsApp Business karşılama/mesai dışı otomatik mesajı da fromMe gelir: esnaf yazmadı, susturma yok (2026-10-19)
    if (require('./satisBot')._test.otomatikYanit(this._getMsgText(msg))) return;
    // Müşterinin mesajından birkaç sn sonra giden mesajı insan yazamaz → WA Business otomatik cevabı
    const gelen = this._sonGelen?.get(this._elleAnahtar(isletmeId, jid));
    if (gelen && Date.now() - gelen < 3000) return;
    // Gönderimde olay, sendMessage dönmeden gelebilir: kısa bekleyip botun mesajı mı bakılır
    setTimeout(() => {
      if (this._botGiden?.has(msg.key.id) || this._sekreterGiden?.has(msg.key.id)) return;
      if (!this._elleSessiz) this._elleSessiz = new Map();
      const bitis = Date.now() + ELLE_SESSIZ_DK * 60 * 1000;
      for (const j of [jid, msg.key.remoteJidAlt]) {
        if (!j) continue;
        this._elleSessiz.set(this._elleAnahtar(isletmeId, j), bitis);
        // Kalıcı kayıt: sunucu yeniden başlasa da (her güncellemede) susma sürer
        pool.query(`INSERT INTO elle_sessiz (isletme_id, jid, bitis) VALUES ($1, $2, to_timestamp($3 / 1000.0) AT TIME ZONE 'Europe/Istanbul')
          ON CONFLICT (isletme_id, jid) DO UPDATE SET bitis = EXCLUDED.bitis`, [isletmeId, this._elleAnahtar(isletmeId, j).split(':')[1], bitis]).catch(() => {});
      }
      console.log(`👤 [${isletmeId}] esnaf sohbete girdi — bot bu kişiye ${ELLE_SESSIZ_DK} dk cevap vermeyecek`);
      const alt = msg.key.remoteJidAlt || '';
      const tel = (jid.endsWith('@lid') && alt.endsWith('@s.whatsapp.net') ? alt : jid).replace(/[:@].*$/, '');
      this._tanidikKontrol(isletmeId, tel).catch(e => console.error('Tanıdık kontrolü:', e.message));
    }, 4000);
  }

  // Esnaf bu kişiyle elle konuşurken bot susar; dükkân sözü geçen mesaj (randevu, saat, fiyat) yine kayda girer.
  // Yoksa tanıdık kontrolü, esnafın elle randevu verdiği müşteriyi "dükkân sözü yok" sanıp kara listeye alıyordu.
  async _elleKayit(msg, isletmeId, metin) {
    const { sade } = require('../utils/sekreterKomut');
    if (!metin || !DUKKAN_SOZU.test(sade(metin))) return;
    const jid = msg.key.remoteJid || '', alt = msg.key.remoteJidAlt || '';
    const tel = (jid.endsWith('@lid') && alt.endsWith('@s.whatsapp.net') ? alt : jid).replace(/[:@].*$/, '');
    await pool.query('INSERT INTO sohbet_gecmisi (musteri_telefon, isletme_id, yon, mesaj) VALUES ($1, $2, $3, $4)', [tel, isletmeId, 'gelen', metin]);
  }

  // Tanıdık (kullanıcı kararı 2026-10-17): esnaf bir kişiye EN AZ 2 FARKLI GÜN elle yazdıysa, o kişi bu dükkândan hiç
  // randevu almadıysa ve son 50 mesajında randevu/fiyat gibi dükkân sözü geçmiyorsa → kara listeye "tanidik" olarak
  // girer, bot o sohbete hiç bakmaz. Mesaj içeriği yapay zekâya gönderilmez (yalnız yerel kelime kontrolü).
  // Esnafa Fiko'dan haber gider; "aç <numara/isim>" ile geri alınır ve o kişi bir daha otomatik eklenmez.
  async _tanidikKontrol(isletmeId, tel) {
    if (!/^\d{8,15}$/.test(tel)) return;
    await pool.query('INSERT INTO elle_yazisma (isletme_id, telefon, gun) VALUES ($1, $2, CURRENT_DATE) ON CONFLICT DO NOTHING', [isletmeId, tel]);
    const r = (await pool.query(
      `SELECT (SELECT COUNT(*) FROM elle_yazisma WHERE isletme_id = $1 AND telefon = $2)::int AS gun,
              EXISTS (SELECT 1 FROM randevular r JOIN musteriler m ON m.id = r.musteri_id WHERE r.isletme_id = $1 AND m.telefon = $2) AS musteri,
              EXISTS (SELECT 1 FROM kara_liste WHERE isletme_id = $1 AND telefon = $2) AS listede,
              EXISTS (SELECT 1 FROM bot_durum WHERE isletme_id = $1 AND musteri_telefon = $2
                        AND (secilen_hizmet_id IS NOT NULL OR secilen_tarih IS NOT NULL)) AS randevu_sordu,
              (SELECT isim FROM musteriler WHERE telefon = $2) AS isim`, [isletmeId, tel])).rows[0];
    if (r.gun < 2 || r.musteri || r.listede || r.randevu_sordu) return;   // botla randevu konuşmuş kişi müşteridir
    const mesajlar = (await pool.query(
      "SELECT mesaj FROM sohbet_gecmisi WHERE isletme_id = $1 AND musteri_telefon = $2 AND yon = 'gelen' ORDER BY id DESC LIMIT 50", [isletmeId, tel])).rows;
    const { sade } = require('../utils/sekreterKomut');
    if (mesajlar.some(m => DUKKAN_SOZU.test(sade(m.mesaj)))) return;
    await pool.query(`INSERT INTO kara_liste (isletme_id, telefon, sebep, aktif) VALUES ($1, $2, 'tanidik', true) ON CONFLICT (isletme_id, telefon) DO NOTHING`, [isletmeId, tel]);
    const ad = r.isim && r.isim !== tel ? `${r.isim} (+${tel})` : `+${tel}`;
    console.log(`🤝 [${isletmeId}] …${tel.slice(-4)} tanıdık sayıldı — bot karışmayacak`);
    await this._sahibeYaz(isletmeId, `🤝 ${ad} kişisini tanıdık saydım, bot bu sohbete artık hiç karışmayacak.\nYanlışsa bana *aç ${tel.slice(-10)}* yaz.`);
  }

  // Esnafın "Kendime mesaj" sohbetine Fiko'dan not (komut sayılmasın diye işaretlenir)
  async _sahibeYaz(isletmeId, metin) {
    const sock = this.isletmeler[isletmeId]?.sock;
    if (!sock?.user?.id) return;
    const g = await sock.sendMessage(sock.user.id.replace(/:\d+(?=@)/, ''), { text: metin }).catch(() => null);
    if (!this._sekreterGiden) this._sekreterGiden = new Set();
    if (g?.key?.id) this._sekreterGiden.add(g.key.id);
  }

  // "karışma 0532…" / "aç 0532…" (ya da isim): tanıdık listesini esnaf kendisi yönetir
  async _tanidikKomut(isletmeId, metin) {
    const m = require('../utils/sekreterKomut').sade(metin).trim().match(/^(?:fiko[\s,]*)?(karisma|tanidik|ac)\s+(.+)$/);
    if (!m) return null;
    const hedef = m[2].trim();
    const rakam = hedef.replace(/\D/g, '');
    let tel = rakam.length >= 10 ? '90' + rakam.slice(-10) : null;
    if (!tel) {
      const k = (await pool.query(
        `SELECT DISTINCT m.telefon FROM musteriler m WHERE m.isim ILIKE $1 AND m.son_gelinen_isletme_id = $2 LIMIT 2`, [`%${hedef}%`, isletmeId])).rows;
      if (k.length !== 1) return k.length ? `"${hedef}" birden fazla kişiyle eşleşti, numarayı yazar mısın?` : `"${hedef}" adında kimseyi bulamadım, numarayı yazar mısın?`;
      tel = k[0].telefon;
    }
    if (m[1] === 'ac') {
      // Satır silinmez, pasif kalır: otomatik tanıdık bir daha eklemesin
      const r = await pool.query(`UPDATE kara_liste SET aktif = false, sebep = 'tanidik_acildi', bloke_bitis = NULL WHERE isletme_id = $1 AND telefon = $2 RETURNING id`, [isletmeId, tel]);
      if (!r.rows.length) await pool.query(`INSERT INTO kara_liste (isletme_id, telefon, sebep, aktif) VALUES ($1, $2, 'tanidik_acildi', false) ON CONFLICT DO NOTHING`, [isletmeId, tel]);
      return `✅ +${tel} için bot yeniden açık, randevu sorarsa cevap verecek.`;
    }
    await pool.query(`INSERT INTO kara_liste (isletme_id, telefon, sebep, aktif) VALUES ($1, $2, 'tanidik', true)
      ON CONFLICT (isletme_id, telefon) DO UPDATE SET aktif = true, sebep = 'tanidik'`, [isletmeId, tel]);
    return `🤝 Tamam, +${tel} sohbetine bot karışmayacak. Geri açmak için *aç ${tel.slice(-10)}* yaz.`;
  }

  async _elleSessizMi(msg, isletmeId) {
    const jidler = [msg.key.remoteJid, msg.key.remoteJidAlt].filter(Boolean);
    if (jidler.some(j => (this._elleSessiz?.get(this._elleAnahtar(isletmeId, j)) || 0) > Date.now())) return true;
    try {   // bellekte yoksa (yeniden başlatma sonrası) kalıcı kayda bak
      const r = await pool.query('SELECT 1 FROM elle_sessiz WHERE isletme_id = $1 AND jid = ANY($2) AND bitis > NOW() LIMIT 1',
        [isletmeId, jidler.map(j => this._elleAnahtar(isletmeId, j).split(':')[1])]);
      return r.rows.length > 0;
    } catch (e) { return false; }
  }

  _kendiSohbetiMi(msg, isletmeId) {
    const sock = this.isletmeler[isletmeId]?.sock;
    if (!sock?.user || !msg?.key?.fromMe || !msg.message) return false;
    if (this._sekreterGiden?.has(msg.key.id)) return false;
    const yalin = (j) => String(j || '').replace(/:\d+(?=@)/, '');
    const r = yalin(msg.key.remoteJid);
    return !!r && (r === yalin(sock.user.id) || (!!sock.user.lid && r === yalin(sock.user.lid)));
  }

  async sekreterKendi(msg, isletmeId) {
    if (!this._sekreterIslenen) this._sekreterIslenen = new Set();
    if (this._sekreterIslenen.has(msg.key.id)) return;          // 'notify' ve 'append' ikisi birden gelirse bir kez
    this._sekreterIslenen.add(msg.key.id);
    if (this._sekreterIslenen.size > 500) this._sekreterIslenen = new Set([...this._sekreterIslenen].slice(-200));
    // Yeniden bağlanınca gelen eski mesajlar komut sayılmaz
    const ts = Number(msg.messageTimestamp?.low ?? msg.messageTimestamp) * 1000;
    if (ts && Date.now() - ts > 2 * 60 * 1000) return;

    let metin = (this._getMsgText(msg) || '').trim();
    let onEk = '';
    if (!metin) {
      const sm = require('./sesliMesaj');
      if (!sm.sesMesaji(msg)) return;
      const isletme = (await pool.query('SELECT sekreter_aktif FROM isletmeler WHERE id=$1', [isletmeId])).rows[0];
      if (isletme?.sekreter_aktif === false) return;
      const s = await sm.metneCevir(msg, { isletmeId, telefon: 'sahip', sock: this.isletmeler[isletmeId]?.sock });
      if (!s?.metin) return;
      metin = s.metin; onEk = sm.onEk(metin);
    }
    const tanidikCevap = await this._tanidikKomut(isletmeId, metin).catch(e => { console.error('Tanıdık komutu:', e.message); return null; });
    const cevap = tanidikCevap || await require('./sekreter').isle({ isletmeId, metin, kanal: 'kendi' });
    if (!cevap) return;
    const sock = this.isletmeler[isletmeId]?.sock;
    if (!sock) return;
    const giden = await sock.sendMessage(msg.key.remoteJid, { text: onEk + cevap });
    if (!this._sekreterGiden) this._sekreterGiden = new Set();
    if (giden?.key?.id) this._sekreterGiden.add(giden.key.id);
    if (this._sekreterGiden.size > 500) this._sekreterGiden = new Set([...this._sekreterGiden].slice(-200));
  }

  // Bağlı görünüp soketi kapanmış oturum: yeniden başlat (gönderim hatası ya da bekçi yakalar)
  _oluBaglanti(isletmeId, nereden) {
    const st = this.isletmeler[isletmeId];
    if (!st || st._oluTamir) return;
    st._oluTamir = true;
    console.log(`🩺 [${isletmeId}] bağlantı ölü görünüyor (${nereden}) — yeniden bağlanılıyor`);
    try { st.sock?.end?.(undefined); } catch (e) {}
    st.sock = null; st.durum = 'baslatiyor'; st._baslatiliyor = false;
    setTimeout(() => { if (this.isletmeler[isletmeId]) this.isletmeler[isletmeId]._oluTamir = false; }, 60000);
    this.isletmeBaslat(isletmeId, st.isim || `#${isletmeId}`, false).catch(e => console.error('Ölü bağlantı tamiri:', e.message));
  }

  // Bekçi: 2 dk'da bir "bağlı" görünen oturumların soketi gerçekten açık mı bakılır
  bekciBaslat() {
    if (this._bekci) return;
    this._bekci = setInterval(() => {
      for (const [id, st] of Object.entries(this.isletmeler)) {
        if (st?.durum !== 'bagli') continue;
        const ws = st.sock?.ws;
        const kapali = !st.sock || ws?.isClosed === true || ws?.isClosing === true || (ws && 'readyState' in ws && ws.readyState > 1);
        if (kapali) this._oluBaglanti(Number(id), 'bekçi');
      }
    }, 2 * 60000);
    this._bekci.unref?.();
  }

  async mesajGonder(isletmeId, hedef, mesaj, butonlar = null) {
    const state = this.isletmeler[isletmeId];
    if (!state || state.durum !== 'bagli') return { success: false, hata: 'Bağlı değil' };
    // Demo verisinin numaralarına asla mesaj gitmez (utils/demoTel)
    if (require('../utils/demoTel').demoNumaraMi(hedef)) return { success: false, hata: 'Demo numarası — gönderilmedi' };
    try {
      const jid = hedef.includes('@') ? hedef : `${hedef.replace(/^\+/, '')}@s.whatsapp.net`;

      // Butonlu mesaj
      if (butonlar && butonlar.length > 0) {
        const btnSent = await this._butonluMesajGonder(state.sock, jid, mesaj, butonlar);
        if (btnSent) return { success: true };
      }

      // Normal metin mesajı — her zaman YENİ mesaj gönder (edit karışıklık yapıyor)
      // Sahada gönderim hiç dönmeyip log'a iz bırakmadan asılı kaldı (2026-10-15): süre sınırı, hata olarak loglanır
      let zamanlayici;
      await Promise.race([
        state.sock.sendMessage(jid, { text: mesaj }),
        new Promise((_, red) => { zamanlayici = setTimeout(() => red(new Error('sendMessage 25 sn içinde dönmedi')), 25000); }),
      ]).finally(() => clearTimeout(zamanlayici));
      return { success: true };
    } catch (err) {
      console.error(`❌ mesajGonder hata [${isletmeId}]:`, err.message);
      if (/Connection Closed|Connection Terminated/i.test(err.message)) this._oluBaglanti(isletmeId, 'gönderim');
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

  // Sahada mesajlar hatasız ve cevapsız kaldı (2026-10-15): 30 sn'de bitmeyen işlemde hangi adımda takıldığı loglanır
  // Sahada mesajlar hatasız ve cevapsız kaldı (2026-10-15): 30 sn'de bitmeyen işlemde hangi adımda takıldığı,
  // cevap gitmeden biten her işlemde de sebebi loglanır (müşteriye otomatik bir şey gönderilmez)
  async mesajIsle(msg, isletmeId) {
    const iz = { adim: 'başlangıç', gonderildi: false, sessiz: null, musteriMesaji: false };
    const bekci = setTimeout(() => console.error(`⏳ [${isletmeId}] mesaj 30 sn'dir işleniyor, takıldığı adım: ${iz.adim}`), 30000);
    let hata = null;
    try { return await this._mesajIsle(msg, isletmeId, iz); }
    catch (e) { hata = e; throw e; }
    finally {
      clearTimeout(bekci);
      if (iz.musteriMesaji && !iz.gonderildi && !iz.sessiz) {
        const neden = `adım: ${iz.adim}${hata ? `, hata: ${hata.message}` : ''}`;
        console.error(`🔇 [${isletmeId}] müşteri mesajı CEVAPSIZ kaldı — ${neden}`);
        require('../utils/sistemUyari').uyar({ tip: 'cevapsiz', anahtar: `cevapsiz:${isletmeId}`, seviye: 'kritik', isletmeId,
          baslik: `Bot müşteri mesajını cevapsız bıraktı (işletme #${isletmeId})`, detay: neden });
      }
    }
  }

  async _mesajIsle(msg, isletmeId, iz) {
    const basla = Date.now();
    let metin = (this._getMsgText(msg) || '').trim();
    const sesVar = !metin && !!require('./sesliMesaj').sesMesaji(msg);   // sesli mesaj: aşağıda yazıya çevrilir
    const remoteJid = msg.key.remoteJid;
    // Gönderim sonucu izlenir: hiçbiri başarılı olmazsa mesajIsle yedek cevabı devreye girer
    const gonder = async (...a) => {
      const g = await this.mesajGonder(...a);
      if (g?.success) iz.gonderildi = true;
      else {
        console.error(`⚠️ [${isletmeId}] cevap GÖNDERİLEMEDİ (${iz.adim}): ${g?.hata}`);
        require('../utils/sistemUyari').uyar({ tip: 'gonderim', anahtar: `gonderim:${isletmeId}`, isletmeId,
          baslik: `WhatsApp cevabı gönderilemedi (işletme #${isletmeId})`, detay: `${iz.adim}: ${g?.hata}` });
      }
      return g;
    };
    const sus = (sebep) => { iz.sessiz = sebep; console.log(`🤫 [${isletmeId}] bilerek cevap verilmedi: ${sebep}`); };
    // Grup, kanal ve durum güncellemeleri müşteri değil: kaydetme, cevap verme
    if (!remoteJid || remoteJid.endsWith('@g.us') || remoteJid.endsWith('@newsletter') ||
        remoteJid.endsWith('@broadcast')) return;
    console.log(`🔄 mesajIsle: isletme=${isletmeId}, uzunluk=${metin.length}${sesVar ? ', sesli' : ''}`);
    if (!metin && !sesVar) return;
    iz.musteriMesaji = true;

    // ═══ Anti-spam: aynı kişi dakikada 15+ mesaj atıyorsa 10dk mute ═══
    if (!this._spamSayac) this._spamSayac = new Map(); // jid → { sayac, pencereBas, mute_bitis }
    const simdi = Date.now();
    const spamKey = `${isletmeId}:${remoteJid}`;
    let sc = this._spamSayac.get(spamKey);
    if (!sc) { sc = { sayac: 0, pencereBas: simdi, mute_bitis: 0 }; this._spamSayac.set(spamKey, sc); }
    if (sc.mute_bitis > simdi) { sus('anti-spam'); return; } // mute aktif
    if (simdi - sc.pencereBas > 60000) { sc.sayac = 1; sc.pencereBas = simdi; }
    else { sc.sayac++; }
    if (sc.sayac >= require('../utils/platformAyar').al('spam_esik')) {   // Platform Ayarları (varsayılan 15)
      sc.mute_bitis = simdi + 10 * 60 * 1000;
      console.log(`🤐 Anti-spam: ${remoteJid} → 10dk mute (dakikada ${sc.sayac} mesaj)`);
      try {
        await pool.query(
          `INSERT INTO guvenlik_olay_log (isletme_id, tip, detay, telefon) VALUES ($1, 'wa_bot_spam', $2, $3)`,
          [isletmeId, `${sc.sayac} msg/dk → 10dk mute`, remoteJid]
        );
      } catch {}
      sus('anti-spam');
      return;
    }

    if (await this._elleSessizMi(msg, isletmeId)) {
      this._elleKayit(msg, isletmeId, metin).catch(e => console.error('Elle sohbet kaydı:', e.message));
      sus('esnaf bu sohbette elle yazıyor'); return;
    }

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
          const sock = this.isletmeler[isletmeId]?.sock;
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

    // SıraGO'nun kendi numaraları (Satış Bot, Merkez OTP) müşteri değil: esnaf numarasını bağlayınca iki bot
    // birbirine sonsuz cevap yazmasın (kurulum mesajları, şifre kodu, hatırlatmalar bu numaralardan gelir)
    if (require('../utils/sistemNumaralari').sistemNumarasi(musteriTelefon) ||
        (msg.key.remoteJidAlt && require('../utils/sistemNumaralari').sistemNumarasi(msg.key.remoteJidAlt))) {
      sus('SıraGO sistem numarası');
      return;
    }

    iz.adim = 'işletme okuma';
    const isletme = (await pool.query('SELECT * FROM isletmeler WHERE id=$1', [isletmeId])).rows[0];
    if (!isletme) return;

    // ═══ SEKRETER MODU — esnafın panelden girdiği numara (mesai dışında da çalışır) ═══
    try {
      iz.adim = 'sekreter';
      const sekreter = require('./sekreter');
      if (sekreter.sahipNumarasiMi(isletme, musteriTelefon)) {
        let komut = metin, onEk = '';
        if (!komut && sesVar) {
          const sm = require('./sesliMesaj');
          const s = await sm.metneCevir(msg, { isletmeId, telefon: musteriTelefon, sock: this.isletmeler[isletmeId]?.sock });
          if (s?.metin) { komut = s.metin; onEk = sm.onEk(komut); }
        }
        const cevap = komut ? await sekreter.isle({ isletmeId, metin: komut, kanal: 'numara' }) : null;
        if (cevap) { await gonder(isletmeId, remoteJid, onEk + cevap); return; }
      }
    } catch (e) { console.error('Sekreter (numara):', e.message); }

    // Kara liste kontrolü — engelli numaraya cevap verme (kalıcı veya 7-günlük bloke)
    try {
      const kara = (await pool.query(
        `SELECT aktif, bloke_bitis FROM kara_liste 
         WHERE isletme_id=$1 AND telefon=$2 
           AND (aktif=true OR (bloke_bitis IS NOT NULL AND bloke_bitis > NOW()))`,
        [isletmeId, musteriTelefon]
      )).rows[0];
      if (kara) { sus('kara liste'); return; }
    } catch (e) { /* kara_liste tablosu yoksa devam et */ }

    // Mesai dışı kontrolü
    try {
      const simdi = new Date();
      const simdiDk = simdi.getHours() * 60 + simdi.getMinutes();
      // Bugünün saatleri (2026-10-29: gün bazlı; cuma 23:00 kapanan dükkân 21:00'den sonra "mesai dışı" sayılmasın)
      const gs = require('../utils/gunSaatleri').gunSaatleri(isletme, simdi.getDay());
      const basSaat = gs.bas, bitSaat = gs.bit, basDk = gs.basDk, bitDk = gs.bitDk;
      const bugunKapali = gs.kapali;
      const mesaiDisi = simdiDk < basDk || simdiDk >= bitDk || bugunKapali;

      if (mesaiDisi && isletme.mesai_disi_mod && isletme.mesai_disi_mod !== 'randevu_ver') {
        if (isletme.mesai_disi_mod === 'sessiz') { sus('mesai dışı: sessiz mod'); return; }
        if (isletme.mesai_disi_mod === 'kapali_mesaj') {
          // Dönüş değeri çağıran yerde kullanılmıyordu → mesaj hiç gitmiyordu; burada gönder.
          // Aynı kişiye 6 saatte en fazla bir kez gönder (her mesaja tekrar etmesin).
          if (!this._kapaliMesajSon) this._kapaliMesajSon = new Map();
          const kmKey = `${isletmeId}:${remoteJid}`;
          const sonGonderim = this._kapaliMesajSon.get(kmKey) || 0;
          if (Date.now() - sonGonderim > require('../utils/platformAyar').al('kapali_mesaj_tekrar_saat') * 60 * 60 * 1000) {
            const mesaj = isletme.mesai_disi_mesaj || botMesajlar.get(isletme, 'mesaiDisi', { basSaat, bitSaat });
            const g = await gonder(isletmeId, remoteJid, mesaj);
            if (g?.success) this._kapaliMesajSon.set(kmKey, Date.now());   // yalnız gerçekten gittiyse işaretle
          } else sus('mesai dışı mesajı 6 saat içinde zaten gönderildi');
          return;
        }
      }
    } catch (e) { console.error(`❌ [${isletmeId}] mesai dışı kontrolü hatası:`, e.message); }

    // ═══ SESLİ MESAJ → YAZI (2026-10-14) — kara liste ve mesai kontrolünden sonra (boşuna çeviri yapılmasın) ═══
    let sesOnEk = '';
    if (sesVar) {
      if (isletme.sesli_mesaj_aktif === false) { sus('sesli mesaj kapalı'); return; }   // esnaf kapattıysa eskisi gibi cevapsız
      const sm = require('./sesliMesaj');
      const s = await sm.metneCevir(msg, { isletmeId, telefon: musteriTelefon, sock: this.isletmeler[isletmeId]?.sock });
      if (!s || s.hata === 'kapali') { sus('sesli mesaj çevrilemedi/kapalı'); return; }
      if (s.hata) { await gonder(isletmeId, remoteJid, sm.HATA_METNI[s.hata]); return; }
      metin = s.metin;
      sesOnEk = sm.onEk(metin);
    }
    const sesli = (t) => sesOnEk + t;   // bot cevabının başında müşterinin ne dediği anlaşıldı

    // Müşteriyi kaydet / bul (pushName varsa gerçek isim kullan)
    const musteriIsim = msg.pushName || musteriTelefon;
    await pool.query(
      // son_gelinen_isletme_id: müşteri tablosu global; işletmeye ait müşteri sorguları bu kolona ve randevulara bakar
      `INSERT INTO musteriler (telefon, isim, son_gelinen_isletme_id) VALUES ($1, $2, $3) ON CONFLICT (telefon) DO UPDATE
         SET isim = CASE WHEN musteriler.isim = musteriler.telefon THEN EXCLUDED.isim ELSE musteriler.isim END,
             son_gelinen_isletme_id = EXCLUDED.son_gelinen_isletme_id`,
      [musteriTelefon, musteriIsim, isletmeId]
    );

    // Sohbeti kaydet
    await pool.query(
      'INSERT INTO sohbet_gecmisi (musteri_telefon, isletme_id, yon, mesaj) VALUES ($1, $2, $3, $4)',
      [musteriTelefon, isletmeId, 'gelen', sesOnEk ? `🎤 ${metin}` : metin]
    );

    // ═══ MEMNUNİYET ANKETİ — "1–5" cevabı ya da düşük puan açıklaması (2026-10-14) ═══
    try {
      iz.adim = 'memnuniyet';
      const anketCevap = await require('./memnuniyet').cevapIsle({ isletmeId, telefon: musteriTelefon, metin });
      if (anketCevap) {
        await gonder(isletmeId, remoteJid, sesli(anketCevap));
        await pool.query('INSERT INTO sohbet_gecmisi (musteri_telefon, isletme_id, yon, mesaj) VALUES ($1, $2, $3, $4)',
          [musteriTelefon, isletmeId, 'giden', anketCevap]);
        return;
      }
    } catch (e) { console.error('Memnuniyet cevabı hatası:', e.message); }

    // ═══ AKILLI TEYİT ZİNCİRİ — Bot akışından ÖNCE yakala ═══
    const metinKucukTeyit = metin.toLowerCase();
    iz.adim = 'teyit zinciri';
    const teyitSonuc = await this._teyitZinciriKontrol(metinKucukTeyit, metin, musteriTelefon, isletmeId, remoteJid);
    if (teyitSonuc) {
      // Zincir yakaladı — cevabı gönder ve bot akışına geçme
      await gonder(isletmeId, remoteJid, sesli(teyitSonuc));
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

    // Sohbet asistanı (2026-10-14): menü yerine soru sorarak randevu; anlaşılmazsa null → eski menü akışı
    let cevap = null;
    try {
      iz.adim = 'sohbet asistanı';
      cevap = await require('./sohbetAsistani').isle({ wa: this, metin, botDurum, isletme, hizmetler, musteriTelefon, isletmeId });
      if (cevap?.sus) { sus(cevap.sus); return; }
    } catch (e) {
      if (e.code === 'SLOT_DOLU') cevap = await this._saatKacti(isletme, musteriTelefon, isletmeId);
      else { console.error('Sohbet asistanı:', e.message); cevap = null; }
    }

    // Eski akış (state machine) — DeepSeek sadece bilinmeyen mesajlarda
    if (!cevap) {
    iz.adim = 'eski akış';
      try { cevap = await this.akisIsle(metin, botDurum, isletme, hizmetler, musteriTelefon, isletmeId); }
      catch (e) {
        // Aynı saati aynı anda iki müşteri istedi, öteki önce onayladı: bu müşteriye boş saatler / bekleme listesi
        if (e.code === 'SLOT_DOLU') cevap = await this._saatKacti(isletme, musteriTelefon, isletmeId);
        else throw e;
      }
    }

    // Teşhis: her mesajın sonu loglanır (metin değil — KVKK; yalnız aşama, uzunluk, süre, gönderim sonucu)
    const ozet = `aşama=${botDurum.asama || '-'}, cevap=${cevap ? String(typeof cevap === 'object' ? cevap.metin : cevap).length : 0}, ${Date.now() - basla}ms`;
    if (!cevap) console.log(`🔇 [${isletmeId}] cevap üretilmedi: ${ozet}`);
    if (cevap) {
      const cevapMetin = typeof cevap === 'object' ? cevap.metin : cevap;
      const butonlar = typeof cevap === 'object' ? cevap.butonlar : null;
      iz.adim = 'gönderim';
      const g = await gonder(isletmeId, remoteJid, sesli(cevapMetin), butonlar);
      console.log(`${g?.success ? '✉️' : '⚠️'} [${isletmeId}] cevap ${g?.success ? 'gönderildi' : 'GÖNDERİLEMEDİ: ' + g?.hata}: ${ozet}, toplam ${Date.now() - basla}ms`);
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
          return botMesajlar.get(isletme, 'hizmetSecildi', { hizmetAd: h.isim, _hizmetEN: h.isim_en, _hizmetAR: h.isim_ar, sureDk: h.sure_dk, fiyat: this.fiyatFormat(h.fiyat), kartFiyat: this.kartFormat(h) });
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
          return botMesajlar.get(isletme, 'randevuOzet', { isletmeAd: isletme.isim, hizmetAd: hz?.isim, _hizmetEN: hz?.isim_en, _hizmetAR: hz?.isim_ar, tarihStr: this.tarihFormat(gd.secilen_tarih), saatStr: this.saatFormat(saat), ...(await this._ozetFiyat(isletmeId, musteriTelefon, hz)) });
        }
        return cevap;
      }

      case 'randevu_onayla': {
        const sd = (await pool.query('SELECT * FROM bot_durum WHERE musteri_telefon=$1 AND isletme_id=$2', [musteriTelefon, isletmeId])).rows[0];
        if (metin === '1' || metin.toLowerCase().includes('evet') || metin.toLowerCase().includes('onayla')) {
          try {
            const sonuc = await randevuService.randevuOlustur({ isletmeId, musteriTelefon, hizmetId: sd.secilen_hizmet_id, tarih: sd.secilen_tarih, saat: sd.secilen_saat, kaynak: 'bot', ilkIndirim: true });
            await this.durumGuncelle(musteriTelefon, isletmeId, 'ana_menu', { secilen_hizmet_id: null, secilen_tarih: null, secilen_saat: null });
            const mesaj1 = botMesajlar.get(isletme, 'randevuOnaylandi', { isletmeAd: isletme.isim, hizmetAd: sonuc.hizmet?.isim, _hizmetEN: sonuc.hizmet?.isim_en, _hizmetAR: sonuc.hizmet?.isim_ar, tarihStr: this.tarihFormat(sd.secilen_tarih), saatStr: this.saatFormat(sd.secilen_saat) });
            return await this._dogumTarihiHavucEkle(mesaj1, musteriTelefon, isletmeId, isletme);
          } catch (limitErr) {
            if (limitErr.code === 'LIMIT_ASIMI') {
              await this.durumGuncelle(musteriTelefon, isletmeId, 'ana_menu', { secilen_hizmet_id: null, secilen_tarih: null, secilen_saat: null });
              return { metin: '😔 Üzgünüz, şu anda randevu kapasitemiz dolmuştur.\nLütfen daha sonra tekrar deneyin. 🙏', butonlar: null };
            }
            throw limitErr;
          }
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

  // Randevu onaylandı mesajının sonuna "doğum günü havuç" ekler (opsiyonel)
  // Çok kişilik randevu (2026-10-22): müşteri "2 kişiyiz" dediyse ilk randevudan sonra ek kişiler yazılır
  // (aynı saatte boş usta, yoksa arka arkaya). Mesaja eklenecek satırları döndürür; tek kişide boş metin.
  async _ekKisiler(sd, sonuc, isletme, musteriTelefon, isletmeId) {
    const n = Math.min(Number(sd?.kisi_sayisi) || 1, 5);
    if (n < 2 || !sonuc?.randevu) return '';
    await pool.query('UPDATE bot_durum SET kisi_sayisi = NULL WHERE musteri_telefon = $1 AND isletme_id = $2', [musteriTelefon, isletmeId]).catch(() => {});
    const en = isletme._musteriDil === 'en';
    try {
      const ek = await require('./randevu').ekKisilerOlustur({ isletmeId, musteriTelefon, hizmetId: sd.secilen_hizmet_id,
        tarih: require('../utils/tarih').tarihFormatla(sd.secilen_tarih), saat: String(sd.secilen_saat).slice(0, 5), adet: n - 1, kaynak: 'bot' });
      let t = ek.yazilan.map((x, i) => en ? `👥 Person ${i + 2}: ${x.saat}` : `👥 ${i + 2}. kişi: ${x.saat}`).join('\n');
      if (ek.eksik) t += `${t ? '\n' : ''}⚠️ ` + (en ? `No free time left that day for ${ek.eksik} more person(s); please write another time for them.`
        : `${ek.eksik} kişi için o gün yer kalmadı; onlar için başka bir saat yazabilirsiniz.`);
      return t ? `${t}\n` : '';
    } catch (e) {
      console.error('❌ Ek kişi randevusu:', e.message);
      return en ? '⚠️ I could only book 1 person; please write again for the others.\n' : '⚠️ Yalnız 1 kişilik randevu açılabildi; diğerleri için tekrar yazabilirsiniz.\n';
    }
  }

  async _dogumTarihiHavucEkle(onayMesaji, musteriTelefon, isletmeId, isletme) {
    try {
      if (!isletme?.dogum_gunu_aktif) return onayMesaji;
      const musteri = (await pool.query(
        'SELECT id, dogum_tarihi FROM musteriler WHERE telefon=$1 AND (musteriler.son_gelinen_isletme_id = $2 OR EXISTS (SELECT 1 FROM randevular rx WHERE rx.musteri_id = musteriler.id AND rx.isletme_id = $2))',
        [musteriTelefon, isletmeId]
      )).rows[0];
      if (!musteri || musteri.dogum_tarihi) return onayMesaji; // Zaten var, sorma
      const indirim = isletme.dogum_gunu_indirim || 30;
      await this.durumGuncelle(musteriTelefon, isletmeId, 'dogum_tarihi_bekleniyor');
      const havuc = `\n\n━━━━━━━━━━━━━━━\n🎁 *Bir sürprizimiz var!*\nDoğum gününüzde size *%${indirim} indirim* tanımlayabilmemiz için doğum tarihinizi *gün ve ay olarak* yazar mısınız?\n\n_Örn: 15 Mayıs veya 15.05_\n\n_İstemiyorsanız bu mesajı yanıtsız bırakabilirsiniz._`;
      return typeof onayMesaji === 'string' ? onayMesaji + havuc : { ...onayMesaji, metin: (onayMesaji.metin || '') + havuc };
    } catch(e) {
      console.log('⚠️ Doğum günü havuç eklenemedi:', e.message);
      return onayMesaji;
    }
  }

  async akisIsle(metin, botDurum, isletme, hizmetler, musteriTelefon, isletmeId) {
    const metinKucuk = metin.toLowerCase();

    // "Randevum kaçtaydı?": hangi adımda olursa olsun var olan randevuyu söyle (yeni randevu akışı başlatma)
    if (require('../utils/randevuSorgusu').randevuSorgusu(metin)) {
      const randevular = await require('./randevu').musteriRandevulari(musteriTelefon, isletmeId);
      await this.durumGuncelle(musteriTelefon, isletmeId, 'ana_menu');
      if (randevular.length === 0) return { metin: botMesajlar.get(isletme, 'randevuYok'), butonlar: null };
      const liste = randevular.slice(0, 3).map(r => ({ ...r, tarihStr: this.tarihFormat(r.tarih), saatStr: String(r.saat).substring(0, 5) }));
      return { metin: botMesajlar.get(isletme, 'randevularim', { randevular: liste }), butonlar: null };
    }

    // === DOĞUM TARİHİ BEKLİYOR — sıradaki mesaj cevap olarak parse edilir ===
    if (botDurum.asama === 'dogum_tarihi_bekleniyor') {
      const { parseDogumTarihi, formatDogumTarihi } = require('../utils/dogumTarihi');
      const parsed = parseDogumTarihi(metin);
      if (parsed) {
        await pool.query('UPDATE musteriler SET dogum_tarihi=$1 WHERE telefon=$2 AND (musteriler.son_gelinen_isletme_id = $3 OR EXISTS (SELECT 1 FROM randevular rx WHERE rx.musteri_id = musteriler.id AND rx.isletme_id = $3))',
          [parsed, musteriTelefon, isletmeId]);
        await this.durumGuncelle(musteriTelefon, isletmeId, 'ana_menu');
        return { metin: `✅ Teşekkürler! Doğum tarihiniz kaydedildi (*${formatDogumTarihi(parsed)}*). O gün size özel sürprizimiz olacak 🎂`, butonlar: null };
      }
      // Parse edilemedi — kullanıcı başka bir şey yazmış olabilir. Vazgeçme, ana menüye dön.
      await this.durumGuncelle(musteriTelefon, isletmeId, 'ana_menu');
      // Normal akışa düş (aşağıdaki menü/intent handler'ları devreye girer)
    }

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

    // Sıra takibi intent — "sıram", "sırada kaç kişi var", "ne zaman gelecek sıram", "queue"
    if (metinKucuk.includes('sıram') || metinKucuk.includes('siram') || metinKucuk.includes('sırada') || metinKucuk.includes('sirada') || metinKucuk.includes('queue') || metinKucuk.includes('الطابور')) {
      try {
        const bugun = new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Istanbul" });
        const randevum = (await pool.query(`
          SELECT r.id, r.saat, r.tarih, h.sure_dk, h.isim as hizmet_isim
          FROM randevular r
          JOIN musteriler m ON r.musteri_id = m.id
          LEFT JOIN hizmetler h ON r.hizmet_id = h.id
          WHERE r.isletme_id = $1 AND m.telefon = $2
            AND r.tarih = $3 AND r.durum = 'onaylandi'
            AND r.saat >= NOW()::time
          ORDER BY r.saat ASC LIMIT 1
        `, [isletmeId, musteriTelefon, bugun])).rows[0];
        if (!randevum) {
          return { metin: botMesajlar.get(isletme, 'siraTakibiYok'), butonlar: null };
        }
        const oncekiSayi = (await pool.query(`
          SELECT COUNT(*) as sayi FROM randevular
          WHERE isletme_id = $1 AND tarih = $2 AND durum = 'onaylandi'
            AND saat < $3 AND saat >= NOW()::time
        `, [isletmeId, bugun, randevum.saat])).rows[0];
        const sureDk = randevum.sure_dk || isletme.randevu_suresi_dk || 30;
        const tahminiSure = parseInt(oncekiSayi.sayi) * sureDk;
        const saatStr = String(randevum.saat).substring(0, 5);
        return { metin: botMesajlar.get(isletme, 'siraTakibi', { oncekiSayi: oncekiSayi.sayi, tahminiSure, saatStr }), butonlar: null };
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

    switch (botDurum.asama === 'sohbet' ? 'ana_menu' : botDurum.asama) {
      case 'ana_menu': {
        const randevuAl = metin === '1' || metinKucuk.includes('randevu al') || metinKucuk === 'randevu' || metinKucuk === 'al' || metinKucuk === 'almak istiyorum' || metinKucuk === 'randevu almak istiyorum';
        const randevularim = metin === '2' || metinKucuk.includes('randevularım') || metinKucuk.includes('randevularim');
        const randevuIptal = metin === '3' || metinKucuk.includes('randevu iptal');

        // Konum bilgisi
        if (metinKucuk === 'konum' || metinKucuk.includes('adres') || metin === '4') {
          const konum = require('./sohbetAsistani').konumMesaji(isletme, { menusuz: false });
          return { metin: konum || botMesajlar.get(isletme, 'konum', { isletmeAd: isletme.isim, adres: 'Adres bilgisi bulunamadı' }), butonlar: null };
        }
        // Çalışma saatleri
        if (metinKucuk === 'saatler' || metinKucuk.includes('çalışma saat') || metin === '5') {
          const bas = isletme.calisma_baslangic ? String(isletme.calisma_baslangic).substring(0,5) : '09:00';
          const bit = isletme.calisma_bitis ? String(isletme.calisma_bitis).substring(0,5) : '18:00';
          const kapaliGunler = isletme.kapali_gunler || '';
          const gunIsimleri = ['Pazar','Pazartesi','Salı','Çarşamba','Perşembe','Cuma','Cumartesi'];
          const kapaliList = kapaliGunler.split(',').filter(g => g.trim()).map(g => gunIsimleri[parseInt(g.trim())] || g.trim());
          const gunBazli = Object.keys(isletme.haftalik_saatler || {}).length > 0;
          return { metin: botMesajlar.get(isletme, 'calismaSaatleri', { basSaat: bas, bitSaat: bit, kapaliGunler: kapaliList.length > 0 ? kapaliList.join(', ') : null, sureDk: isletme.randevu_suresi_dk || 30,
            haftaOzeti: gunBazli ? require('../utils/gunSaatleri').haftaOzeti(isletme) : null }), butonlar: null };
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
            return { metin: botMesajlar.get(isletme, 'calisanSec', { hizmetAd: secilenHizmet.isim, sureDk: secilenHizmet.sure_dk, fiyat: this.fiyatFormat(secilenHizmet.fiyat), kartFiyat: this.kartFormat(secilenHizmet), calisanlar }), butonlar: null };
          } else if (calisanlar.length > 1 && secimModu === 'otomatik') {
            // Otomatik dağıtım → ardışık blok bazında en boş çalışanı seç
            const bugun = new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Istanbul" });
            const enBos = await randevuService.enBosCalisan(isletmeId, bugun, secilenHizmet.id);
            const secilenCalisan = enBos || calisanlar[0];
            await this.durumGuncelle(musteriTelefon, isletmeId, 'tarih_secimi', { secilen_hizmet_id: secilenHizmet.id, secilen_calisan_id: secilenCalisan.id });
            return { metin: botMesajlar.get(isletme, 'hizmetSecildi', { hizmetAd: secilenHizmet.isim, sureDk: secilenHizmet.sure_dk, fiyat: this.fiyatFormat(secilenHizmet.fiyat), kartFiyat: this.kartFormat(secilenHizmet), calisanAd: secilenCalisan.isim }), butonlar: null };
          } else if (calisanlar.length >= 1 && (secimModu === 'tek' || calisanlar.length === 1)) {
            await this.durumGuncelle(musteriTelefon, isletmeId, 'tarih_secimi', { secilen_hizmet_id: secilenHizmet.id, secilen_calisan_id: calisanlar[0].id });
            return { metin: botMesajlar.get(isletme, 'hizmetSecildi', { hizmetAd: secilenHizmet.isim, sureDk: secilenHizmet.sure_dk, fiyat: this.fiyatFormat(secilenHizmet.fiyat), kartFiyat: this.kartFormat(secilenHizmet), calisanAd: calisanlar[0].isim }), butonlar: null };
          } else {
            await this.durumGuncelle(musteriTelefon, isletmeId, 'tarih_secimi', { secilen_hizmet_id: secilenHizmet.id });
            return { metin: botMesajlar.get(isletme, 'hizmetSecildi', { hizmetAd: secilenHizmet.isim, sureDk: secilenHizmet.sure_dk, fiyat: this.fiyatFormat(secilenHizmet.fiyat), kartFiyat: this.kartFormat(secilenHizmet) }), butonlar: null };
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
          let sonuc;
          try {
            sonuc = await randevuService.randevuOlustur({ isletmeId, musteriTelefon, hizmetId: sd.secilen_hizmet_id, calisanId: sd.secilen_calisan_id, tarih: sd.secilen_tarih, saat: sd.secilen_saat, kaynak: 'bot', ilkIndirim: true });
          } catch (limitErr) {
            if (limitErr.code === 'LIMIT_ASIMI') {
              await this.durumGuncelle(musteriTelefon, isletmeId, 'ana_menu', { secilen_hizmet_id: null, secilen_tarih: null, secilen_saat: null, secilen_calisan_id: null });
              return { metin: '😔 Üzgünüz, şu anda randevu kapasitemiz dolmuştur.\nLütfen daha sonra tekrar deneyin. 🙏', butonlar: null };
            }
            throw limitErr;
          }
          const ekMetin = await this._ekKisiler(sd, sonuc, isletme, musteriTelefon, isletmeId);
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
              if (sonuc.hizmet) kaporaMesaj += `${require('../utils/hizmetEmoji').hizmetEmoji(isletme.kategori)} ${sonuc.hizmet.isim}\n`;
              if (clOnay) kaporaMesaj += `👤 ${clOnay.isim}\n`;
              kaporaMesaj += `🗓️ ${this.tarihFormat(sd.secilen_tarih)}\n`;
              kaporaMesaj += `🕐 ${this.saatFormat(sd.secilen_saat)}\n${ekMetin}`;
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
            if (sonuc.hizmet) bekle += `${require('../utils/hizmetEmoji').hizmetEmoji(isletme.kategori)} ${sonuc.hizmet.isim}\n`;
            if (clOnay) bekle += `👤 ${clOnay.isim}\n`;
            bekle += `🗓️ ${this.tarihFormat(sd.secilen_tarih)}\n`;
            bekle += `🕐 ${this.saatFormat(sd.secilen_saat)}\n${ekMetin}`;
            bekle += `\n⏳ İşletme randevunuzu *${isletme.onay_timeout_dk || 30} dakika* içinde onaylayacak.`;
            bekle += `\nOnay verilmezse randevunuz otomatik iptal edilir.`;
            bekle += `\n\n_Powered by SıraGO — sırago.com_`;
            return { metin: bekle, butonlar: null };
          }

          const tebrik = botMesajlar.get(isletme, 'randevuOnaylandi', { isletmeAd: isletme.isim, hizmetAd: sonuc.hizmet?.isim, _hizmetEN: sonuc.hizmet?.isim_en, _hizmetAR: sonuc.hizmet?.isim_ar, calisanAd: clOnay?.isim, tarihStr: this.tarihFormat(sd.secilen_tarih),
            saatStr: this.saatFormat(sd.secilen_saat) + (ekMetin ? `\n${ekMetin.trimEnd()}` : '') });   // ek kişiler saat satırının altında
          return await this._dogumTarihiHavucEkle({ metin: tebrik, butonlar: null }, musteriTelefon, isletmeId, isletme);
        } else if (metinKucuk !== '2' && !metinKucuk.includes('iptal') && !metinKucuk.includes('hayır') && metin.length > 1) {
          // Musteri not yazdi - onaylayip notu kaydet
          const sd = (await pool.query('SELECT * FROM bot_durum WHERE musteri_telefon=$1 AND isletme_id=$2', [musteriTelefon, isletmeId])).rows[0];
          try {
            const sonuc = await randevuService.randevuOlustur({ isletmeId, musteriTelefon, hizmetId: sd.secilen_hizmet_id, calisanId: sd.secilen_calisan_id, tarih: sd.secilen_tarih, saat: sd.secilen_saat, kaynak: 'bot', ilkIndirim: true });
            if (sonuc && sonuc.randevu) {
              await pool.query('UPDATE randevular SET not_text=$1 WHERE id=$2', [metin, sonuc.randevu.id]);
            }
            await this.durumGuncelle(musteriTelefon, isletmeId, 'ana_menu', { secilen_hizmet_id: null, secilen_tarih: null, secilen_saat: null, secilen_calisan_id: null });
            return { metin: botMesajlar.get(isletme, 'randevuNotKaydedildi', { not: metin }), butonlar: null };
          } catch (limitErr) {
            if (limitErr.code === 'LIMIT_ASIMI') {
              await this.durumGuncelle(musteriTelefon, isletmeId, 'ana_menu', { secilen_hizmet_id: null, secilen_tarih: null, secilen_saat: null, secilen_calisan_id: null });
              return { metin: '😔 Üzgünüz, şu anda randevu kapasitemiz dolmuştur.\nLütfen daha sonra tekrar deneyin. 🙏', butonlar: null };
            }
            throw limitErr;
          }
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
              const rTarih = tarihFormatla(secilenRandevu.tarih);
              const rSaat = String(secilenRandevu.saat).substring(0,5);
              const randevuZamani = new Date(`${rTarih}T${rSaat}:00`);
              const kalanSaat = (randevuZamani - Date.now()) / 3600000;
              if (kalanSaat < iptalSinir) {
                await this.durumGuncelle(musteriTelefon, isletmeId, 'ana_menu', { iptal_randevu_id: null });
                return { metin: `❌ *Bu randevu artık iptal edilemez.*\n\nRandevuya ${iptalSinir} saatten az kaldığı için iptal yapılamaz.\n\n🗓️ Ana menü için *0* yazın.`, butonlar: null };
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
            // İptal edilen randevunun bilgilerini al (bekleme listesi için)
            const iptalEdilen = (await pool.query('SELECT tarih, saat, hizmet_id FROM randevular WHERE id=$1', [gd.iptal_randevu_id])).rows[0];
            await randevuService.randevuIptal(gd.iptal_randevu_id);
            // Bekleme listesindeki ilk kişiye bildir
            if (iptalEdilen) {
              try {
                await this._beklemeListesiBildir(isletmeId, isletme, iptalEdilen.tarih, iptalEdilen.saat, iptalEdilen.hizmet_id);
              } catch (e) { /* skip */ }
            }
          }
          await this.durumGuncelle(musteriTelefon, isletmeId, 'ana_menu', { iptal_randevu_id: null });
          return { metin: botMesajlar.get(isletme, 'iptalBasarili', { hizmetAd: 'Randevu' }), butonlar: null };
        }
        // Geri dön veya vazgeç
        await this.durumGuncelle(musteriTelefon, isletmeId, 'ana_menu', { iptal_randevu_id: null });
        return await this.anaMenu(isletme, musteriTelefon, isletmeId, hizmetler);
      }

      case 'bekleme_onay': {
        // Bekleme listesinden teklif gitti — "evet" → randevu kurulur, "hayır" → sıradaki kişiye geçilir (services/beklemeListesi)
        const randevuService = require('./randevu');
        const bekleme = require('./beklemeListesi');
        const temizle = { secilen_hizmet_id: null, secilen_tarih: null, secilen_saat: null, secilen_calisan_id: null };
        if (metin === '1' || metinKucuk.includes('evet') || metinKucuk.includes('onayla') || metinKucuk.includes('yes') || metinKucuk.includes('نعم')) {
          const sd = (await pool.query('SELECT * FROM bot_durum WHERE musteri_telefon=$1 AND isletme_id=$2', [musteriTelefon, isletmeId])).rows[0];
          const teklif = await bekleme.aktifTeklif(isletmeId, musteriTelefon);
          const hizmetIds = (teklif?.hizmet_ids?.length ? teklif.hizmet_ids : [sd?.secilen_hizmet_id || teklif?.hizmet_id]).filter(Boolean);
          if (sd?.secilen_tarih && sd?.secilen_saat && hizmetIds.length) {
            try {
              const sonuc = await randevuService.randevuOlustur({
                isletmeId, musteriTelefon, musteriIsim: teklif?.musteri_isim || undefined,
                hizmetIds, tarih: sd.secilen_tarih, saat: String(sd.secilen_saat).slice(0, 5), kaynak: 'bot', ilkIndirim: true
              });
              await this.durumGuncelle(musteriTelefon, isletmeId, 'ana_menu', temizle);
              await bekleme.dolduruldu(isletmeId, musteriTelefon, sonuc.randevu);
              return { metin: botMesajlar.get(isletme, 'randevuOnaylandi', {
                isletmeAd: isletme.isim, hizmetAd: sonuc.hizmet?.isim,
                tarihStr: this.tarihFormat(sd.secilen_tarih), saatStr: this.saatFormat(sd.secilen_saat)
              }), butonlar: null };
            } catch (err) {
              await this.durumGuncelle(musteriTelefon, isletmeId, 'ana_menu', temizle);
              if (err.code === 'LIMIT_ASIMI') {
                await bekleme.vazgecti(isletmeId, musteriTelefon, 'hata');
                return { metin: '😔 Üzgünüz, şu anda randevu kapasitemiz dolmuştur.\nLütfen daha sonra tekrar deneyin. 🙏', butonlar: null };
              }
              if (['SLOT_DOLU', 'GECMIS_TARIH'].includes(err.code)) {
                await bekleme.vazgecti(isletmeId, musteriTelefon, 'kacti');
                return { metin: '😔 Üzgünüz, bu saat az önce doldu. Başka bir gün ya da saat için "randevu" yazabilirsiniz.', butonlar: null };
              }
              throw err;
            }
          }
        }
        // Hayır (ya da cevap anlaşılmadı) → teklif bırakılır, sıradaki kişiye gider
        await this.durumGuncelle(musteriTelefon, isletmeId, 'ana_menu', temizle);
        try { await bekleme.vazgecti(isletmeId, musteriTelefon); } catch (e) { console.error('Bekleme listesi sıradaki:', e.message); }
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

    // Online randevu açıksa menüye tek dokunuşluk randevu linki (WhatsApp düğmesi yerine — risksiz)
    let link = null;
    if (isletme.booking_acik !== false) {
      try { link = await require('../utils/randevuLinki').randevuLinki(isletme); } catch (e) { /* linksiz menü */ }
    }
    const msg = botMesajlar.get(isletme, 'anaMenu', { musteriAd, isletmeAd: isletme.isim, link });
    // İlk randevu indirimi: bu dükkâna hiç gelmemiş numaraya karşılamada kampanya satırı
    const ilk = await require('./randevu').ilkIndirimBul(isletmeId, musteriTelefon).catch(() => null);
    if (ilk) {
      const ii = require('../utils/ilkIndirim');
      return { metin: ii.satirEkle(msg, ii.botSatiri(ilk, isletme._musteriDil || botMesajlar.varsayilanDil(isletme))), butonlar: null };
    }
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

    // Akıllı saat önerisi — en boş zaman dilimindeki en uygun saati öner
    let onerilen = null;
    try {
      const bugunStr = secilenTarih;
      const doluSaatler = (await pool.query(`
        SELECT saat FROM randevular WHERE isletme_id = $1 AND tarih = $2 AND durum NOT IN ('iptal','gelmedi')
      `, [isletmeId, bugunStr])).rows.map(r => String(r.saat).substring(0,5));
      // Her saat diliminde kaç randevu var
      const sabahDolu = doluSaatler.filter(s => parseInt(s.split(':')[0]) < 12).length;
      const ogleDolu = doluSaatler.filter(s => { const h = parseInt(s.split(':')[0]); return h >= 12 && h < 17; }).length;
      const aksamDolu = doluSaatler.filter(s => parseInt(s.split(':')[0]) >= 17).length;
      const sabahBos = saatFmt.filter(s => parseInt(s.split(':')[0]) < 12);
      const ogleBos = saatFmt.filter(s => { const h = parseInt(s.split(':')[0]); return h >= 12 && h < 17; });
      const aksamBos = saatFmt.filter(s => parseInt(s.split(':')[0]) >= 17);
      // En az dolu olan dilimi bul
      const dilimler = [
        { ad: 'sabah', dolu: sabahDolu, bos: sabahBos },
        { ad: 'ogle', dolu: ogleDolu, bos: ogleBos },
        { ad: 'aksam', dolu: aksamDolu, bos: aksamBos },
      ].filter(d => d.bos.length > 0).sort((a, b) => a.dolu - b.dolu);
      if (dilimler.length > 0) {
        // En boş dilimin ortasındaki saati öner
        const enBos = dilimler[0].bos;
        onerilen = enBos[Math.floor(enBos.length / 2)];
      }
    } catch (e) { /* skip */ }

    // Az saat varsa direkt listele, çoksa zaman dilimi sor
    if (saatFmt.length <= 6) {
      await this.durumGuncelle(musteriTelefon, isletmeId, 'saat_secimi', { secilen_tarih: secilenTarih });
      let mesaj = botMesajlar.get(isletme, 'saatListesi', { tarihStr: this.tarihFormat(secilenTarih), saatler: saatFmt });
      if (onerilen) mesaj = `💡 *Önerilen: ${onerilen}* _(en müsait saat)_\n\n` + mesaj;
      return { metin: mesaj, butonlar: null };
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
    }) : `🗓️ *${tarihStr}*\n\n`;
    return { metin: txt, butonlar: null, filtreli };
  }

  async _ozetOlustur(isletme, guncelDurum, secilenSaat) {
    const hz = guncelDurum.secilen_hizmet_id ? (await pool.query('SELECT * FROM hizmetler WHERE id=$1', [guncelDurum.secilen_hizmet_id])).rows[0] : null;
    const cl = guncelDurum.secilen_calisan_id ? (await pool.query('SELECT * FROM calisanlar WHERE id=$1', [guncelDurum.secilen_calisan_id])).rows[0] : null;
    const ozet = botMesajlar.get(isletme, 'randevuOzet', {
      isletmeAd: isletme.isim, hizmetAd: hz?.isim, _hizmetEN: hz?.isim_en, _hizmetAR: hz?.isim_ar, calisanAd: cl?.isim,
      tarihStr: this.tarihFormat(guncelDurum.secilen_tarih), saatStr: secilenSaat,
      ...(await this._ozetFiyat(isletme.id, guncelDurum.musteri_telefon, hz))
    });
    return { metin: ozet, butonlar: null };
  }

  // Özetteki fiyat: müşteri ilk kez geliyorsa ilk randevu indirimiyle (üstü çizili eski fiyat), değilse liste fiyatı
  async _ozetFiyat(isletmeId, musteriTelefon, hz) {
    if (!hz) return { fiyat: null, kartFiyat: null };
    const ilk = await require('./randevu').ilkIndirimBul(isletmeId, musteriTelefon).catch(() => null);
    return require('../utils/ilkIndirim').botFiyat(hz, ilk, (x) => this.fiyatFormat(x))
      || { fiyat: this.fiyatFormat(hz.fiyat), kartFiyat: this.kartFormat(hz) };
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

    // Müşteri botla aktif bir akışın ortasındaysa (son 30 dk) cevabı teyit/anket sanma:
    // menüde '2' yazan müşterinin bugünkü randevusu iptal oluyordu. Rakamlar ana menüde de
    // menü seçimi olduğu için orada da yakalanmaz.
    try {
      const bd = (await pool.query(
        `SELECT asama, son_aktivite > NOW() - INTERVAL '30 minutes' AS yeni FROM bot_durum WHERE musteri_telefon=$1 AND isletme_id=$2`,
        [musteriTelefon, isletmeId])).rows[0];
      if (bd?.yeni && bd.asama && bd.asama !== 'baslangic') {
        const rakam = /^\d+$/.test(metinKucuk.trim());
        if (rakam || bd.asama !== 'ana_menu') return null;
      }
    } catch (e) { /* bot_durum okunamazsa eski davranış */ }

    // ─── Aşama 1: Teyit yanıtı (Geliyorum / İptal) ───
    // Müşterinin bugün teyit_gonderildi=true olan onaylı randevusu var mı?
    const geliyorumIntents = ['geliyorum', '1', 'evet', 'geleceğim', 'gelecegim', 'gelicem', 'tamam', 'ok', 'geliyoruz', '✅'];
    const iptalIntents = ['iptal', '2', 'hayır', 'hayir', 'gelemiyorum', 'gelemem', 'yapamam', 'vazgeçtim', 'vazgectim', '❌', 'iptal et'];

    // "Geliyorum.", "geliyorum ✅", "Evet geleceğim" de tanınsın (eskiden yalnız birebir eşleşme)
    const sadeTeyit = metinKucuk.replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim();
    const gucluGeliyorum = /^(evet |tamam )?(geliyorum|geleceğim|gelecegim|gelicem|geliyoruz|orada olacağım|orda olucam)\b/.test(sadeTeyit);
    const gucluIptal = /^(iptal|gelemiyorum|gelemem|gelemicem|gelemeyeceğim|vazgeçtim|vazgectim)\b/.test(sadeTeyit);
    if (gucluGeliyorum) metinKucuk = 'geliyorum';
    else if (gucluIptal) metinKucuk = 'iptal';
    const isTeyitYanit = geliyorumIntents.includes(metinKucuk) || iptalIntents.includes(metinKucuk);

    if (isTeyitYanit) {
      try {
        const teyitRandevu = (await pool.query(`
          SELECT r.id, r.saat, r.tarih, h.isim as hizmet_isim, i.isim as isletme_isim, i.kategori as isletme_kategori
          FROM randevular r
          JOIN isletmeler i ON r.isletme_id = i.id
          JOIN musteriler m ON r.musteri_id = m.id
          LEFT JOIN hizmetler h ON r.hizmet_id = h.id
          WHERE r.isletme_id = $1 AND m.telefon = $2
            AND r.durum IN ('onaylandi', 'onay_bekliyor')
            AND (r.teyit_gonderildi = true OR r.hatirlatma_gonderildi = true)
            -- Bugünkü değil, yaklaşan ilk randevu (24 saat önceki hatırlatma yarına aittir); İstanbul saatiyle
            AND (r.tarih + r.saat) > (NOW() AT TIME ZONE 'Europe/Istanbul')
            AND r.tarih <= (NOW() AT TIME ZONE 'Europe/Istanbul')::date + 2
          ORDER BY r.tarih ASC, r.saat ASC LIMIT 1
        `, [isletmeId, musteriTelefon])).rows[0];

        if (teyitRandevu) {
          const saat = String(teyitRandevu.saat).substring(0, 5);

          if (iptalIntents.includes(metinKucuk)) {
            // Müşteri iptal etti → randevuyu düşür, slotu aç
            await require('./randevu').randevuIptal(teyitRandevu.id);   // bölünmüş randevunun devam parçaları da düşer
            console.log(`❌ Teyit → İPTAL: ${musteriTelefon} - ${teyitRandevu.isletme_isim} ${saat}`);
            return `❌ *Randevunuz iptal edildi.*\n\n🏥 ${teyitRandevu.isletme_isim}\n${teyitRandevu.hizmet_isim ? require('../utils/hizmetEmoji').hizmetEmoji(teyitRandevu.isletme_kategori) + ' ' + teyitRandevu.hizmet_isim + '\n' : ''}🕐 ${saat}\n\nYeni randevu almak için *1* yazın.`;
          }

          if (geliyorumIntents.includes(metinKucuk)) {
            // Müşteri gelecek → durum zaten onaylı, teyit edildi
            console.log(`✅ Teyit → GELİYORUM: ${musteriTelefon} - ${teyitRandevu.isletme_isim} ${saat}`);
            return `✅ *Harika, sizi bekliyoruz!*\n\n🏥 ${teyitRandevu.isletme_isim}\n${teyitRandevu.hizmet_isim ? require('../utils/hizmetEmoji').hizmetEmoji(teyitRandevu.isletme_kategori) + ' ' + teyitRandevu.hizmet_isim + '\n' : ''}🕐 Saat: ${saat}\n\nGörüşmek üzere! 😊`;
          }
        }
        // "Geliyorum" dedi ama yaklaşan randevusu yok: yeni randevu menüsüne düşürme
        if (!teyitRandevu && (gucluGeliyorum || gucluIptal)) {
          return gucluGeliyorum
            ? `Teşekkürler! Yaklaşan bir randevunuz görünmüyor. Yeni randevu için *1* yazabilirsiniz.`
            : `Yaklaşan bir randevunuz görünmüyor. Yeni randevu için *1* yazabilirsiniz.`;
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
          try { await require('./seans').randevuTamamlandi(anketRandevu.id); } catch (e) { console.error('Seans sayacı:', e.message); }

          // Yorum Avcısı açıksa: düşük puanda esnafa alarm + açıklama isteği, yüksekte Google linki (2026-10-14)
          try {
            const ozel = await require('./memnuniyet').anketPuani({
              isletmeId: anketRandevu.isletme_id, randevuId: anketRandevu.id, musteriId: anketRandevu.musteri_id, telefon: musteriTelefon, puan });
            if (ozel) return `${yildizlar}\n\n${ozel}`;
          } catch (e) { console.error('Memnuniyet (otomatik anket):', e.message); }

          if (puan >= 4) {
            return `${yildizlar}\n\n*Teşekkür ederiz!* Memnuniyetiniz bizim için çok değerli. 🙏\n\nTekrar görüşmek üzere!\n\n🗓️ Yeni randevu için *1* yazın.`;
          } else if (puan >= 2) {
            return `${yildizlar}\n\n*Geri bildiriminiz için teşekkürler.* Kendimizi geliştirmek için değerlendireceğiz.\n\n🗓️ Yeni randevu için *1* yazın.`;
          } else {
            return `${yildizlar}\n\n*Üzgünüz, beklentinizi karşılayamadık.* Geri bildiriminiz bizim için çok önemli.\n\n🗓️ Yeni randevu için *1* yazın.`;
          }
        }
      } catch (e) { console.error('Anket puan kontrol hatası:', e.message); }
    }

    return null; // Zincir yakalamadı → normal bot akışına devam
  }

  // Bekleme listesi — iptal olduğunda sıradaki müşteriye teklif (services/beklemeListesi)
  async _beklemeListesiBildir(isletmeId, isletme, tarih, saat, hizmetId) {
    try { await require('./beklemeListesi').bildir(isletmeId, tarih, saat); }
    catch (e) { console.error('❌ Bekleme listesi bildirim hatası:', e.message); }
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

  // Hizmetin kart fiyatı nakitten farklıysa biçimlenmiş hali (şablon " nakit · X TL kart" yazar), yoksa null
  kartFormat(h) {
    return require('../utils/kartFiyat').kartVar(h) ? this.fiyatFormat(h.kart_fiyat) : null;
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
