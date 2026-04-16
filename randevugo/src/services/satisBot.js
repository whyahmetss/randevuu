const { default: makeWASocket, DisconnectReason, fetchLatestBaileysVersion, makeCacheableSignalKeyStore } = require('@whiskeysockets/baileys');
const qrcode = require('qrcode');
const pool = require('../config/db');
const EventEmitter = require('events');
const pino = require('pino');
const axios = require('axios');
const { usePostgresAuthState } = require('../utils/pgAuthState');

const SATIS_BOT_ID = 999999; // sabit isletme_id for satis bot auth

// Türkiye saati (UTC+3)
function turkiyeSaati() {
  return new Date(new Date().toLocaleString('en-US', { timeZone: 'Europe/Istanbul' }));
}

// ═══════════════════════════════════════════════════
// Mesaj Varyasyonları — Her seferinde farklı mesaj
// ═══════════════════════════════════════════════════
const MESAJ_SABLONLARI = {
  berber: [
    (ad) => `Merhabalar 🙂\n\n${ad} berber dükkanınızı inceledik, müşteri yorumlarınız çok olumlu!\n\nİşletmenize özel online randevu sistemi kuruyoruz. Müşterileriniz sıra beklemeden telefondan randevu alır, WhatsApp ile otomatik hatırlatma gider.\n\nİlk ay tamamen ücretsiz — denemek ister misiniz?`,
    (ad) => `Merhaba, iyi günler 🙂\n\n${ad} için harika bir çözümümüz var! Müşterileriniz artık telefonla aramak yerine 7/24 online randevu alabilir.\n\nSıra bekleme sorunu biter, WhatsApp hatırlatıcı ile randevu kaçırma olmaz.\n\nİlk ay ücretsiz deneyin — ilgilenir misiniz?`,
    (ad) => `Selam, iyi çalışmalar 🙂\n\nBiz SıraGO olarak berber dükkanlarına özel randevu sistemi kuruyoruz.\n\n${ad} için mükemmel olur: müşterileriniz telefondan randevu alır, siz de WhatsApp ile hatırlatma gönderirsiniz.\n\nÜcretsiz deneme hakkınız var — bilgi verebilir miyim?`,
  ],
  'kuaför': [
    (ad) => `Merhabalar 🙂\n\n${ad} salonunuzu inceledik, çok şık çalışmalarınız var!\n\nMüşterileriniz 7/24 online randevu alsın, randevu öncesi WhatsApp hatırlatma gitsin, unutulan randevular bitsin.\n\nBiz SıraGO olarak bu sistemi sizin için kuruyoruz. İlk ay ücretsiz — detay vermemi ister misiniz?`,
    (ad) => `Merhaba, günaydın 🙂\n\n${ad} için profesyonel bir randevu sistemi sunuyoruz. Müşterileriniz telefonla aramak zorunda kalmaz, online randevu alır.\n\nWhatsApp ile otomatik hatırlatma gider, randevu kaçırma biter.\n\nİlk ay bizden — denemek ister misiniz?`,
    (ad) => `İyi günler 🙂\n\nSalonunuzu inceledik ve dijital randevu sistemiyle işlerinizi kolaylaştırabileceğimizi düşündük.\n\n${ad} müşterileri 7/24 randevu alabilir, WhatsApp ile hatırlatma alır.\n\nÜcretsiz deneme hakkınız var — ilgilenir misiniz?`,
  ],
  'güzellik salonu': [
    (ad) => `Merhabalar 🙂\n\n${ad} güzellik salonunuzu inceledik, hizmetleriniz çok kapsamlı!\n\nMüşterileriniz hizmet seçip anında online randevu alabilir. WhatsApp hatırlatıcı ile randevu kaçırma biter.\n\nİlk ay bizden — denemek ister misiniz? 🙏`,
    (ad) => `Merhaba, iyi günler 🙂\n\n${ad} için harika bir çözüm: müşterileriniz telefondan hizmet seçip randevu alsın, WhatsApp ile hatırlatma gitsin.\n\nTek panelden tüm randevuları yönetin. İlk ay ücretsiz — ne dersiniz?`,
    (ad) => `Selam 🙂\n\nGüzellik salonunuz için dijital randevu sistemi kuruyoruz. ${ad} müşterileri online randevu alır, hatırlatma mesajı alır.\n\nİlk ay tamamen ücretsiz — bilgi verebilir miyim?`,
  ],
  'dövme': [
    (ad) => `Merhabalar 🙂\n\n${ad} stüdyonuzu inceledik, çok güzel çalışmalarınız var!\n\nMüşterileriniz telefondan randevu alsın, WhatsApp ile otomatik hatırlatma gitsin. Randevu karışıklığına son verin.\n\nİlk ay tamamen ücretsiz — ilgilenirseniz demo gösterebilirim.`,
    (ad) => `Merhaba 🙂\n\n${ad} için online randevu sistemi sunuyoruz. Müşterileriniz 7/24 randevu alabilir, siz de WhatsApp ile hatırlatma gönderirsiniz.\n\nİlk ay bizden — denemek ister misiniz?`,
    (ad) => `İyi günler 🙂\n\nDövme stüdyonuz için profesyonel randevu yönetim sistemi kuruyoruz.\n\n${ad} müşterileri telefonla aramak yerine online randevu alsın. WhatsApp hatırlatıcı dahil.\n\nÜcretsiz deneyin — ne dersiniz?`,
  ],
  'diş kliniği': [
    (ad) => `Merhabalar 🙂\n\n${ad} kliniğinizi inceledik, hasta yorumlarınız çok olumlu!\n\nHastalarınız 7/24 online randevu alabilir, randevu öncesi otomatik WhatsApp hatırlatma gider.\n\nSekreter yükünü azaltır, randevu kaçırma oranı düşer. İlk ay ücretsiz — denemek ister misiniz?`,
    (ad) => `Merhaba, iyi günler 🙂\n\n${ad} için dijital randevu çözümü sunuyoruz. Hastalarınız telefonla aramadan online randevu alır.\n\nWhatsApp ile otomatik hatırlatma gider. İlk ay bizden — ilgilenir misiniz?`,
  ],
  'veteriner': [
    (ad) => `Merhabalar 🙂\n\n${ad} kliniğinizi inceledik, hayvan severler tarafından çok seviliyorsunuz!\n\nMüşterileriniz evcil dostları için 7/24 online randevu alabilir. WhatsApp hatırlatıcı ile randevular unutulmaz.\n\nİlk ay tamamen ücretsiz — ilgilenirseniz detay verebilirim 🙏`,
    (ad) => `Merhaba 🙂\n\nVeteriner kliniğiniz için online randevu sistemi kuruyoruz. ${ad} müşterileri telefondan randevu alsın, WhatsApp ile hatırlatma alsın.\n\nİlk ay ücretsiz — ne dersiniz?`,
  ],
  'spa': [
    (ad) => `Merhabalar 🙂\n\n${ad} salonunuzu inceledik, çok huzurlu bir mekan!\n\nMüşterileriniz hizmet ve saat seçip online randevu alsın. WhatsApp ile otomatik hatırlatma gitsin.\n\nİlk ay bizden — denemek ister misiniz?`,
  ],
  'tırnak salonu': [
    (ad) => `Merhabalar 🙂\n\n${ad} sayfanızı inceledik, nail art çalışmalarınız muhteşem!\n\nMüşterileriniz hizmet seçip online randevu alsın, WhatsApp ile hatırlatma gitsin.\n\nİlk ay ücretsiz deneyin — ne dersiniz?`,
  ],
  'diyetisyen': [
    (ad) => `Merhabalar 🙂\n\n${ad} sayfanızı inceledik, danışanlarınız çok memnun!\n\nDanışanlarınız 7/24 online randevu alabilir, WhatsApp ile hatırlatma gider.\n\nİlk ay ücretsiz — detay vermemi ister misiniz?`,
  ],
  default: [
    (ad) => `Selam, müşteri işlemdeyken çalan telefonlara bakmak veya mesajlara yetişmek vakit ve müşteri kaybettirir. ${ad} randevularını 7/24 otomatik veren WhatsApp botumuza devretmek ister misiniz? Sistemin nasıl çalıştığını gösteren 1 dakikalık kısa bir video iletebilirim.`,
    (ad) => `Merhaba, müşterilerinize uygulama indirtmeden, sadece WhatsApp üzerinden kendi kendilerine randevu aldırabileceğiniz AI sistemimizi aktif ettik. ${ad} için ilk ay ücretsiz geçiş — 5 dakikalık demo linki göndereyim mi?`,
  ]
};

// ═══════════════════════════════════════════════════
// Takip Mesajları — 12 saat cevap vermeyenlere
// ═══════════════════════════════════════════════════
const TAKIP_SABLONLARI = {
  // İlk takip (12 saat sonra)
  1: [
    (ad) => `Tekrar merhaba 🙂\n\n${ad} için yazmıştım — hızla dönemediyseniz sorun değil!\n\nSadece şunu bilmenizi isterim: Sektörünüzdeki işletmeler online randevuya geçiyor ve müşteri kaybını ciddi azaltıyor.\n\nÜcretsiz deneme hakkınız hâlâ aktif 👉 sırago.com`,
    (ad) => `Merhaba tekrar 🙂\n\nDaha önce ${ad} için online randevu sisteminden bahsetmiştim.\n\nBugün 3 yeni işletme daha sisteme katıldı! İlk ay ücretsiz deneme hakkınız devam ediyor.\n\nMerak ettikleriniz varsa yazabilirsiniz 👉 sırago.com`,
    (ad) => `İyi günler 🙂\n\n${ad} hakkında geçen yazmıştım. Müşterilerinizin 7/24 randevu alabildiği bir sistem — telefonla arama derdi biter.\n\nÜcretsiz deneme hâlâ geçerli, 2 dakikada kurulum 👉 sırago.com`,
  ],
  // İkinci takip (24 saat sonra)
  2: [
    (ad) => `Son bir mesaj bırakayım 🙏\n\n${ad} için online randevu sistemi gerçekten fark yaratır. Rakipleriniz zaten kullanmaya başladı.\n\nSize özel: İlk 2 ay tamamen ücretsiz! Bu teklif sınırlı süre.\n\n👉 sırago.com`,
    (ad) => `${ad} için son hatırlatma 🙂\n\nOnline randevu sistemiyle müşteri kaybınız %80 azalır, WhatsApp hatırlatmayla randevu kaçırma biter.\n\nSon teklif: 2 ay ücretsiz deneme! Karar sizin.\n\n👉 sırago.com`,
    (ad) => `Merhaba, sizi rahatsız etmek istemem 🙏\n\nAma ${ad} gibi işletmeler için bu sistem gerçekten dönüm noktası. Müşterileriniz 7/24 randevu alır, siz rahat edersiniz.\n\nSon teklifim: 2 ay ücretsiz. Fırsatı kaçırmayın 👉 sırago.com`,
  ]
};

class SatisBot extends EventEmitter {
  constructor() {
    super();
    // ─── ÇOKLU NUMARA DESTEĞİ ───
    // Her numaranın kendi socket, durum, QR'ı var
    this.numaraSockets = new Map(); // numaraId → { sock, durum, qrBase64, reconnectAttempts, basariliOturumVardi, _reconnectTimer }
    // Geriye uyumluluk (eski tek-socket alanlar → artık aktif numaradan okunur)
    this.sock = null;
    this.durum = 'kapali';
    this.qrBase64 = null;
    this.aktif = false; // mesaj gönderme döngüsü aktif mi
    this.gonderimTimer = null;
    this.takipTimer = null;
    this.gunlukGonderim = 0;
    this.sonGonderimTarihi = null;
    this.konusmalar = {};
    this.maxReconnectAttempts = 5;
    this.roundRobinIndex = 0; // round-robin gönderimde sıra
    // SuperAdmin'den kontrol edilebilir ayarlar
    this.ayarlar = {
      mesaiBaslangic: 9,   // saat
      mesaiBitis: 19,       // saat
      gunlukLimit: 50,
      minBekleme: 8,        // dakika
      maxBekleme: 15,       // dakika
      tatil: false,         // bugün tatil mi
      hedefKategori: '',    // boş = tüm kategoriler, değilse sadece o kategori
      // Yeni gelişmiş ayarlar
      mod: 'hepsi',          // 'hepsi' = kayıt+satış+ai, 'sadece_kayit' = sadece kayıt akışı, 'sadece_satis' = sadece giden mesaj (kayıt kapalı), 'sadece_ai' = gelen cevap+ai (giden mesaj yok), 'kapali' = hiçbir şey yapma
      aiCevapAktif: true,    // AI ile otomatik cevap versin mi
      kayitAktif: true,      // WhatsApp'tan kayıt olma aktif mi
      takipAktif: true,      // 12 saat takip mesajı aktif mi
      takipSaati: 12,        // Kaç saat sonra takip mesajı (varsayılan 12)
      maxTakipSayisi: 2,     // Maksimum kaç takip mesajı gönderilsin
      gelenMesajCevap: true, // Gelen mesajlara cevap versin mi
      typingIndicator: true, // "yazıyor..." göstersin mi (anti-ban)
      typingMinMs: 2000,     // Minimum typing süresi ms
      typingMaxMs: 6000,     // Maximum typing süresi ms
    };
  }

  // Bağlı numara socket'lerinden birini döndür (round-robin)
  _aktifSock() {
    const baglilar = [];
    for (const [id, ns] of this.numaraSockets) {
      if (ns.durum === 'bagli' && ns.sock && ns.sock.user) baglilar.push(ns);
    }
    if (baglilar.length === 0) return null;
    this.roundRobinIndex = (this.roundRobinIndex + 1) % baglilar.length;
    return baglilar[this.roundRobinIndex];
  }

  // Tüm bağlı socket'lerin listesi
  _bagliSocklar() {
    const baglilar = [];
    for (const [id, ns] of this.numaraSockets) {
      if (ns.durum === 'bagli' && ns.sock) baglilar.push(ns);
    }
    return baglilar;
  }

  // Genel durum: en az 1 numara bağlıysa 'bagli'
  _genelDurum() {
    for (const [, ns] of this.numaraSockets) {
      if (ns.durum === 'bagli') return 'bagli';
    }
    for (const [, ns] of this.numaraSockets) {
      if (ns.durum === 'qr_bekleniyor') return 'qr_bekleniyor';
    }
    return 'kapali';
  }

  ayarGuncelle(yeniAyarlar) {
    this.ayarlar = { ...this.ayarlar, ...yeniAyarlar };
    console.log('⚙️ Satış Bot ayarları güncellendi:', this.ayarlar);
    this._ayarlariKaydet();
    return this.ayarlar;
  }

  async _ayarlariKaydet() {
    try {
      await pool.query(`
        INSERT INTO satis_bot_ayarlar (id, ayarlar) VALUES (1, $1)
        ON CONFLICT (id) DO UPDATE SET ayarlar = $1, guncelleme_tarihi = NOW()
      `, [JSON.stringify(this.ayarlar)]);
    } catch(e) { console.log('⚠️ Satış Bot ayar kaydetme hatası:', e.message); }
  }

  async _ayarlariYukle() {
    try {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS satis_bot_ayarlar (
          id INTEGER PRIMARY KEY DEFAULT 1,
          ayarlar JSONB NOT NULL DEFAULT '{}',
          guncelleme_tarihi TIMESTAMP DEFAULT NOW()
        )
      `);
      const row = (await pool.query('SELECT ayarlar FROM satis_bot_ayarlar WHERE id=1')).rows[0];
      if (row?.ayarlar) {
        this.ayarlar = { ...this.ayarlar, ...row.ayarlar };
        console.log('✅ Satış Bot ayarları DB\'den yüklendi');
      }
    } catch(e) { console.log('⚠️ Satış Bot ayar yükleme hatası:', e.message); }
  }

  // ═══════════════════════════════════════════════════
  // WhatsApp Bağlantısı — Çoklu Numara (Baileys)
  // ═══════════════════════════════════════════════════

  // Tüm aktif numaraları DB'den oku ve bağla
  async baslat() {
    await this._ayarlariYukle();
    // DB'den aktif numaraları çek
    let numaralar = [];
    try {
      numaralar = (await pool.query("SELECT * FROM satis_bot_numaralar WHERE durum = 'aktif' ORDER BY id")).rows;
    } catch(e) { console.log('⚠️ Numara tablosu henüz yok:', e.message); }

    if (numaralar.length === 0) {
      // Geriye uyumluluk: numara yoksa eski tek-numara modunda başlat
      console.log('📱 Aktif numara yok, eski tek-numara modunda başlatılıyor...');
      return this._tekNumaraBaslat(SATIS_BOT_ID);
    }

    console.log(`📱 ${numaralar.length} aktif numara bulundu, hepsi bağlanıyor...`);
    for (const n of numaralar) {
      await this.numaraBaslat(n.id);
    }
  }

  // Belirli bir numarayı bağla (numaraId = DB id)
  async numaraBaslat(numaraId) {
    const authId = 900000 + numaraId; // Her numara için benzersiz auth ID
    const mevcut = this.numaraSockets.get(numaraId);
    if (mevcut && (mevcut.durum === 'bagli' || mevcut.durum === 'qr_bekleniyor' || mevcut.durum === 'baslatiyor')) {
      console.log(`🔄 Numara #${numaraId} zaten ${mevcut.durum} durumunda`);
      return mevcut;
    }

    // Eski socket varsa kapat
    if (mevcut?.sock) {
      try { mevcut.sock.end(); } catch(e) {}
    }
    if (mevcut?._reconnectTimer) {
      clearTimeout(mevcut._reconnectTimer);
    }

    const ns = { sock: null, durum: 'baslatiyor', qrBase64: null, reconnectAttempts: 0, basariliOturumVardi: false, _reconnectTimer: null, numaraId, authId };
    this.numaraSockets.set(numaraId, ns);
    console.log(`🔄 Numara #${numaraId} başlatılıyor (authId: ${authId})...`);

    try {
      const { state, saveCreds } = await usePostgresAuthState(pool, authId);
      const { version } = await fetchLatestBaileysVersion();

      ns.sock = makeWASocket({
        version,
        auth: {
          creds: state.creds,
          keys: makeCacheableSignalKeyStore(state.keys, pino({ level: 'silent' })),
        },
        logger: pino({ level: 'silent' }),
        browser: ['SıraGO-Sales', 'Chrome', '4.0.0'],
        generateHighQualityLinkPreview: false,
      });

      ns.sock.ev.on('creds.update', saveCreds);

      ns.sock.ev.on('connection.update', (update) => {
        this._handleNumaraConnectionUpdate(numaraId, update);
      });

      // Gelen mesajları dinle
      ns.sock.ev.on('messages.upsert', async (data) => {
        try {
          const messages = data?.messages || (Array.isArray(data) ? data : []);
          for (const msg of messages) {
            if (!msg?.key) continue;
            const jid = msg.key.remoteJid || '';
            const fromMe = msg.key.fromMe;
            if (fromMe) continue;
            if (!msg.message) continue;
            if (jid.endsWith('@g.us')) continue;
            if (jid === 'status@broadcast') continue;
            
            const text = this._getMsgText(msg);
            console.log(`📨 [#${numaraId}] Mesaj: jid=${jid}, text="${(text || '').slice(0, 80)}"`);
            await this.gelenMesajIsle(msg, numaraId);
          }
        } catch (err) {
          console.error(`❌ [#${numaraId}] messages.upsert HATA:`, err.message);
        }
      });

      console.log(`✅ [#${numaraId}] Event listener'lar bağlandı`);
      // Geriye uyumluluk
      this._senkronEt();

    } catch (err) {
      console.error(`❌ [#${numaraId}] Başlatma hatası:`, err.message);
      ns.durum = 'hata';
      this._senkronEt();
    }
    return ns;
  }

  async _handleNumaraConnectionUpdate(numaraId, update) {
    const ns = this.numaraSockets.get(numaraId);
    if (!ns) return;
    const authId = ns.authId;

    try {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        ns.durum = 'qr_bekleniyor';
        try {
          ns.qrBase64 = await qrcode.toDataURL(qr);
          this.emit('qr', { numaraId, qr: ns.qrBase64 });
        } catch(e) { console.error('QR dönüşüm hatası:', e); }
        console.log(`📱 [#${numaraId}] QR hazır — panelden tarayın`);
        this._senkronEt();
      }

      if (connection === 'open') {
        ns.durum = 'bagli';
        ns.qrBase64 = null;
        ns.reconnectAttempts = 0;
        ns.basariliOturumVardi = true;
        const numara = ns.sock?.user?.id?.split(':')[0] || 'bilinmiyor';
        console.log(`✅ [#${numaraId}] WhatsApp bağlandı — numara: ${numara}`);
        // DB'de numarayı güncelle
        try { await pool.query("UPDATE satis_bot_numaralar SET durum='aktif', telefon=$1 WHERE id=$2", [numara, numaraId]); } catch(e) {}
        this.emit('bagli', { numaraId });
        this._senkronEt();
        // Takip timer'ı başlat (ilk bağlanan numara başlatsın)
        if (!this.takipTimer) this.takipTimerBaslat();
        // Gönderim aktifse ve timer yoksa, devam ettir
        if (this.aktif && !this.gonderimTimer) {
          console.log('🚀 Gönderim aktifti, timer devam ettiriliyor...');
          this.sonrakiGonderim();
        }
      }

      if (connection === 'close') {
        const statusCode = lastDisconnect?.error?.output?.statusCode;
        const errorMsg = lastDisconnect?.error?.message || '';
        console.log(`❌ [#${numaraId}] Bağlantı kapandı - kod: ${statusCode}, hata: ${errorMsg}`);

        if (statusCode === 440) {
          ns.sock = null;
          this._senkronEt();
          return;
        }

        if (statusCode === DisconnectReason.restartRequired || statusCode === 515) {
          ns.durum = 'kapali';
          ns.sock = null;
          ns._reconnectTimer = setTimeout(() => this.numaraBaslat(numaraId), 1500);
        } else if (statusCode === DisconnectReason.loggedOut) {
          ns.durum = 'kapali';
          ns.qrBase64 = null;
          ns.sock = null;
          try { await pool.query('DELETE FROM wa_auth_keys WHERE isletme_id=$1', [authId]); } catch(e) {}
          try { await pool.query("UPDATE satis_bot_numaralar SET durum='bekliyor' WHERE id=$1", [numaraId]); } catch(e) {}
          console.log(`🗑️ [#${numaraId}] Oturum kapatıldı. Panelden yeniden QR tarayın.`);
        } else if (ns.basariliOturumVardi && ns.reconnectAttempts < this.maxReconnectAttempts) {
          ns.reconnectAttempts++;
          ns.durum = 'kapali';
          ns.sock = null;
          const bekleme = Math.min(3000 * ns.reconnectAttempts, 30000);
          console.log(`🔄 [#${numaraId}] ${bekleme/1000}sn sonra yeniden bağlanıyor (deneme ${ns.reconnectAttempts}/${this.maxReconnectAttempts})...`);
          ns._reconnectTimer = setTimeout(() => this.numaraBaslat(numaraId), bekleme);
        } else if (!ns.basariliOturumVardi && ns.reconnectAttempts < 3) {
          ns.reconnectAttempts++;
          ns.durum = 'kapali';
          ns.sock = null;
          ns._reconnectTimer = setTimeout(() => this.numaraBaslat(numaraId), 3000);
        } else {
          ns.durum = 'kapali';
          ns.qrBase64 = null;
          ns.sock = null;
          if (ns.reconnectAttempts >= this.maxReconnectAttempts) {
            try { await pool.query('DELETE FROM wa_auth_keys WHERE isletme_id=$1', [authId]); } catch(e) {}
          }
          console.log(`⏹️ [#${numaraId}] Numara durdu.`);
        }
        this._senkronEt();
      }
    } catch (connErr) {
      console.error(`❌ [#${numaraId}] connection.update HATA:`, connErr.message);
    }
  }

  // Geriye uyumluluk: this.sock, this.durum, this.qrBase64 senkron et
  _senkronEt() {
    this.durum = this._genelDurum();
    // İlk bağlı socket'i this.sock olarak ata (geriye uyumluluk)
    const aktif = this._aktifSock();
    this.sock = aktif?.sock || null;
    // QR: qr_bekleniyor olan ilk numaranın QR'ını göster
    this.qrBase64 = null;
    for (const [, ns] of this.numaraSockets) {
      if (ns.qrBase64) { this.qrBase64 = ns.qrBase64; break; }
    }
  }

  // Geriye uyumluluk: eski tek-numara başlatma
  async _tekNumaraBaslat(authId) {
    if (this.durum === 'bagli' || this.durum === 'qr_bekleniyor' || this.durum === 'baslatiyor') {
      return;
    }
    if (this._reconnectTimer) { clearTimeout(this._reconnectTimer); this._reconnectTimer = null; }
    if (this.sock) { try { this.sock.end(); } catch(e) {} this.sock = null; }
    this.durum = 'baslatiyor';
    console.log('🔄 Satış Bot başlatılıyor (tek numara modu)...');
    try {
      const { state, saveCreds } = await usePostgresAuthState(pool, authId);
      const { version } = await fetchLatestBaileysVersion();
      this.sock = makeWASocket({
        version,
        auth: { creds: state.creds, keys: makeCacheableSignalKeyStore(state.keys, pino({ level: 'silent' })) },
        logger: pino({ level: 'silent' }),
        browser: ['RandevuGO', 'Chrome', '4.0.0'],
        generateHighQualityLinkPreview: false,
      });
      this.sock.ev.on('creds.update', saveCreds);
      this.sock.ev.on('connection.update', (update) => this._handleTekNumaraUpdate(update, authId));
      this.sock.ev.on('messages.upsert', async (data) => {
        try {
          const messages = data?.messages || (Array.isArray(data) ? data : []);
          for (const msg of messages) {
            if (!msg?.key || msg.key.fromMe || !msg.message) continue;
            const jid = msg.key.remoteJid || '';
            if (jid.endsWith('@g.us') || jid === 'status@broadcast') continue;
            await this.gelenMesajIsle(msg);
          }
        } catch(err) { console.error('❌ messages.upsert HATA:', err.message); }
      });
    } catch(err) { console.error('❌ Başlatma hatası:', err.message); this.durum = 'hata'; }
  }

  async _handleTekNumaraUpdate(update, authId) {
    const { connection, lastDisconnect, qr } = update;
    if (qr) { this.durum = 'qr_bekleniyor'; try { this.qrBase64 = await qrcode.toDataURL(qr); } catch(e) {} }
    if (connection === 'open') { this.durum = 'bagli'; this.qrBase64 = null; this.reconnectAttempts = 0; this.basariliOturumVardi = true; console.log('✅ Satış Bot WhatsApp bağlandı'); this.takipTimerBaslat(); if (this.aktif && !this.gonderimTimer) this.sonrakiGonderim(); }
    if (connection === 'close') {
      const statusCode = lastDisconnect?.error?.output?.statusCode;
      if (statusCode === DisconnectReason.loggedOut) { this.durum = 'kapali'; this.sock = null; try { await pool.query('DELETE FROM wa_auth_keys WHERE isletme_id=$1', [authId]); } catch(e) {} }
      else if (this.basariliOturumVardi && (this.reconnectAttempts || 0) < this.maxReconnectAttempts) { this.reconnectAttempts = (this.reconnectAttempts || 0) + 1; this.durum = 'kapali'; this.sock = null; setTimeout(() => this._tekNumaraBaslat(authId), 3000 * this.reconnectAttempts); }
      else { this.durum = 'kapali'; this.sock = null; }
    }
  }

  // Belirli bir numarayı durdur
  async numaraDurdur(numaraId) {
    const ns = this.numaraSockets.get(numaraId);
    if (!ns) return;
    if (ns._reconnectTimer) clearTimeout(ns._reconnectTimer);
    if (ns.sock) { try { ns.sock.end(); } catch(e) {} }
    ns.sock = null;
    ns.durum = 'kapali';
    ns.qrBase64 = null;
    this.numaraSockets.delete(numaraId);
    this._senkronEt();
    console.log(`🛑 [#${numaraId}] Numara durduruldu`);
  }

  async durdur() {
    this.aktif = false;
    if (this.gonderimTimer) { clearTimeout(this.gonderimTimer); this.gonderimTimer = null; }
    if (this.takipTimer) { clearInterval(this.takipTimer); this.takipTimer = null; }
    // Tüm numara socket'lerini kapat
    for (const [id, ns] of this.numaraSockets) {
      if (ns._reconnectTimer) clearTimeout(ns._reconnectTimer);
      if (ns.sock) { try { ns.sock.end(); } catch(e) {} }
    }
    this.numaraSockets.clear();
    // Eski tek-socket
    if (this.sock) { try { this.sock.end(); } catch(e) {} }
    this.sock = null;
    this.durum = 'kapali';
    this.qrBase64 = null;
    console.log('🛑 Satış Bot durduruldu (tüm numaralar)');
  }

  async tamamenKapat() {
    await this.durdur();
    try { await pool.query('DELETE FROM wa_auth_keys WHERE isletme_id >= 900000'); } catch(e) {}
    try { await pool.query('DELETE FROM wa_auth_keys WHERE isletme_id=$1', [SATIS_BOT_ID]); } catch(e) {}
    console.log('🗑️ Satış Bot oturumları tamamen silindi');
  }

  // ═══════════════════════════════════════════════════
  // Takip Mesajı Sistemi — 12 saat cevap vermeyenlere
  // ═══════════════════════════════════════════════════
  takipTimerBaslat() {
    if (this.takipTimer) clearInterval(this.takipTimer);
    // Her 30 dakikada kontrol et
    this.takipTimer = setInterval(() => this.takipKontrol(), 30 * 60 * 1000);
    // İlk kontrolü 5dk sonra yap (sunucu açılınca hemen değil)
    setTimeout(() => this.takipKontrol(), 5 * 60 * 1000);
    console.log('🔔 Takip mesaj timer başlatıldı (30dk aralıklarla kontrol)');
  }

  async takipKontrol() {
    const aktifNs = this._aktifSock();
    if (!aktifNs && (this.durum !== 'bagli' || !this.sock)) return;

    // Takip aktif mi kontrol et
    if (!this.ayarlar.takipAktif) return;
    
    // Mod kontrolü — kapali modunda takip gönderme
    if (this.ayarlar.mod === 'kapali') return;

    // Mesai saatleri dışında takip gönderme
    const saat = turkiyeSaati().getHours();
    if (saat < this.ayarlar.mesaiBaslangic || saat >= this.ayarlar.mesaiBitis) return;

    const takipSaati = this.ayarlar.takipSaati || 12;
    const maxTakip = this.ayarlar.maxTakipSayisi || 2;

    try {
      // takipSaati saat+ cevap vermeyen, takip_sayisi < maxTakip, durum = 'bekliyor'
      const bekleyenler = (await pool.query(`
        SELECT * FROM satis_konusmalar 
        WHERE durum = 'bekliyor'
          AND (gelen_mesajlar IS NULL OR gelen_mesajlar = '')
          AND COALESCE(takip_sayisi, 0) < $1
          AND (
            (COALESCE(takip_sayisi, 0) = 0 AND olusturma_tarihi < (NOW() AT TIME ZONE 'Europe/Istanbul') - INTERVAL '1 hour' * $2)
            OR
            (COALESCE(takip_sayisi, 0) >= 1 AND son_takip_tarihi < (NOW() AT TIME ZONE 'Europe/Istanbul') - INTERVAL '1 hour' * $2)
          )
        ORDER BY olusturma_tarihi ASC
        LIMIT 5
      `, [maxTakip, takipSaati])).rows;

      if (bekleyenler.length === 0) return;

      console.log(`🔔 ${bekleyenler.length} kişiye takip mesajı gönderilecek`);

      for (const konusma of bekleyenler) {
        // Anti-ban: Mesajlar arası rastgele bekleme
        const bekleme = 30000 + Math.random() * 60000; // 30-90sn
        await new Promise(r => setTimeout(r, bekleme));
        await this.takipMesajGonder(konusma);
      }
    } catch (err) {
      console.error('❌ Takip kontrol hatası:', err.message);
    }
  }

  async takipMesajGonder(konusma) {
    const ns = this._aktifSock();
    const sock = ns?.sock || this.sock;
    if (!sock) return;

    const takipNo = (konusma.takip_sayisi || 0) + 1;
    const sablonlar = TAKIP_SABLONLARI[takipNo] || TAKIP_SABLONLARI[2];
    const sablon = sablonlar[Math.floor(Math.random() * sablonlar.length)];
    const mesaj = sablon(konusma.isletme_adi || 'işletmeniz');

    const telefon = konusma.telefon;
    const jid = `${telefon}@s.whatsapp.net`;

    try {
      // Anti-ban: Typing indicator
      try {
        await sock.presenceSubscribe(jid);
        await sock.sendPresenceUpdate('composing', jid);
        const typingMs = 2000 + Math.random() * 4000;
        await new Promise(r => setTimeout(r, typingMs));
        await sock.sendPresenceUpdate('paused', jid);
      } catch (e) {}

      await sock.sendMessage(jid, { text: mesaj });
      console.log(`🔔 Takip #${takipNo} gönderildi: ${konusma.isletme_adi} (${telefon})`);

      // DB güncelle
      await pool.query(
        `UPDATE satis_konusmalar 
         SET takip_sayisi = $1, 
             son_takip_tarihi = (NOW() AT TIME ZONE 'Europe/Istanbul'),
             gonderilen_mesaj = gonderilen_mesaj || $2
         WHERE id = $3`,
        [takipNo, `\n[Takip #${takipNo}] ${mesaj}`, konusma.id]
      );

      // 2. takip sonrası hâlâ cevap yoksa durumu 'takip_tamamlandi' yap
      if (takipNo >= 2) {
        await pool.query(
          "UPDATE satis_konusmalar SET durum = 'takip_tamamlandi' WHERE id = $1",
          [konusma.id]
        );
        if (konusma.lead_id) {
          await pool.query(
            "UPDATE potansiyel_musteriler SET durum = 'cevapsiz' WHERE id = $1",
            [konusma.lead_id]
          );
        }
        console.log(`📭 ${konusma.isletme_adi} — 2 takip sonrası cevap yok, tamamlandı`);
      }
    } catch (err) {
      console.error(`❌ Takip mesaj hatası (${konusma.isletme_adi}):`, err.message);
    }
  }

  async getDurum() {
    // DB'den ayarları yükle (ilk çağrıda)
    if (!this._ayarlarYuklendi) {
      await this._ayarlariYukle();
      this._ayarlarYuklendi = true;
    }
    // Senkronize et
    this._senkronEt();
    // Gerçek socket durumunu kontrol et (tek numara modu)
    if (this.numaraSockets.size === 0 && this.durum === 'bagli' && (!this.sock || !this.sock.user)) {
      this.durum = 'kapali';
      this.aktif = false;
      this.sock = null;
    }
    // Numara bazlı durumlar
    const numaraDurumlari = [];
    for (const [id, ns] of this.numaraSockets) {
      numaraDurumlari.push({
        numaraId: id,
        durum: ns.durum,
        qrBase64: ns.qrBase64,
        numara: ns.sock?.user?.id?.split(':')[0] || null,
      });
    }
    return {
      durum: this.durum,
      qrBase64: this.qrBase64,
      aktif: this.aktif,
      gunlukGonderim: this.gunlukGonderim,
      sonGonderimTarihi: this.sonGonderimTarihi,
      ayarlar: this.ayarlar,
      bagliNumaraSayisi: this._bagliSocklar().length,
      numaraDurumlari,
    };
  }

  // ═══════════════════════════════════════════════════
  // Mesaj Gönderim Döngüsü (Anti-Ban)
  // ═══════════════════════════════════════════════════
  async gonderimBaslat() {
    if (this.durum !== 'bagli') return { hata: 'WhatsApp bağlı değil' };
    if (this.aktif) return { hata: 'Zaten çalışıyor' };

    this.aktif = true;
    console.log('🚀 Satış Bot mesaj gönderimi başladı');
    this.sonrakiGonderim();
    return { mesaj: 'Gönderim başladı' };
  }

  gonderimDurdur() {
    this.aktif = false;
    if (this.gonderimTimer) {
      clearTimeout(this.gonderimTimer);
      this.gonderimTimer = null;
    }
    console.log('⏸️ Satış Bot mesaj gönderimi durduruldu');
    return { mesaj: 'Gönderim durduruldu' };
  }

  async sonrakiGonderim() {
    this._senkronEt();
    if (!this.aktif || this.durum !== 'bagli') return;

    // Günlük sayacı sıfırla (Türkiye saati)
    const simdi = turkiyeSaati();
    const bugun = simdi.toISOString().slice(0, 10);
    if (this.sonGonderimTarihi !== bugun) {
      this.gunlukGonderim = 0;
      this.sonGonderimTarihi = bugun;
    }

    // Mod kontrolü — sadece_kayit, sadece_ai veya kapali modunda giden mesaj gönderme
    if (['sadece_kayit', 'sadece_ai', 'kapali'].includes(this.ayarlar.mod)) {
      console.log(`⏸️ Mod: ${this.ayarlar.mod} — giden mesaj gönderilmiyor. 30dk sonra tekrar kontrol.`);
      this.gonderimTimer = setTimeout(() => this.sonrakiGonderim(), 30 * 60 * 1000);
      return;
    }

    // Tatil kontrolü
    if (this.ayarlar.tatil) {
      console.log('🏖️ Bugün tatil — gönderim yapılmıyor. 1 saat sonra tekrar kontrol.');
      this.gonderimTimer = setTimeout(() => this.sonrakiGonderim(), 60 * 60 * 1000);
      return;
    }

    // Günlük limit
    if (this.gunlukGonderim >= this.ayarlar.gunlukLimit) {
      console.log(`📊 Günlük limit doldu (${this.ayarlar.gunlukLimit}), yarın devam edilecek`);
      // 1 saat sonra tekrar kontrol (yeni gün olmuş olabilir)
      this.gonderimTimer = setTimeout(() => this.sonrakiGonderim(), 60 * 60 * 1000);
      return;
    }

    // Mesai saatleri kontrolü (Türkiye saati)
    const saat = simdi.getHours();
    if (saat < this.ayarlar.mesaiBaslangic || saat >= this.ayarlar.mesaiBitis) {
      console.log(`🕐 Mesai dışı — TR saat: ${saat}:00 (mesai: ${this.ayarlar.mesaiBaslangic}:00-${this.ayarlar.mesaiBitis}:00). 30dk sonra tekrar kontrol.`);
      this.gonderimTimer = setTimeout(() => this.sonrakiGonderim(), 30 * 60 * 1000);
      return;
    }

    try {
      // DB'den mesaj gönderilmemiş bir lead çek
      const lead = await this.siradakiLeadGetir();
      if (!lead) {
        console.log('📭 Gönderilecek lead kalmadı');
        // 1 saat sonra tekrar kontrol et (yeni tarama olabilir)
        this.gonderimTimer = setTimeout(() => this.sonrakiGonderim(), 60 * 60 * 1000);
        return;
      }

      // Mesaj gönder
      await this.leadeMesajGonder(lead);
      this.gunlukGonderim++;

      // Anti-ban: Rastgele bekleme (ayarlardan)
      const minBekleme = this.ayarlar.minBekleme * 60 * 1000;
      const maxBekleme = this.ayarlar.maxBekleme * 60 * 1000;
      const bekleme = minBekleme + Math.random() * (maxBekleme - minBekleme);
      const dakika = Math.round(bekleme / 60000);

      console.log(`⏳ Sonraki mesaj ${dakika} dakika sonra (bugün: ${this.gunlukGonderim}/${this.ayarlar.gunlukLimit})`);
      this.gonderimTimer = setTimeout(() => this.sonrakiGonderim(), bekleme);

    } catch (err) {
      console.error('❌ Gönderim hatası:', err.message);
      // Hata olursa 30 dk bekle
      this.gonderimTimer = setTimeout(() => this.sonrakiGonderim(), 30 * 60 * 1000);
    }
  }

  // ═══════════════════════════════════════════════════
  // Lead Seçimi ve Mesaj Gönderimi
  // ═══════════════════════════════════════════════════
  async siradakiLeadGetir() {
    // Telefonu olan, mesaj gönderilmemiş, yeni durumdaki lead'ler
    // hedefKategori seçiliyse sadece o kategoriden
    const kategori = this.ayarlar.hedefKategori;
    let query = `
      SELECT * FROM potansiyel_musteriler 
      WHERE telefon IS NOT NULL 
        AND telefon != '' 
        AND durum = 'yeni'
        AND wp_mesaj_durumu IS NULL
    `;
    const params = [];
    if (kategori) {
      query += ` AND LOWER(kategori) = LOWER($1)`;
      params.push(kategori);
    }
    query += ` ORDER BY skor DESC LIMIT 1`;
    const result = await pool.query(query, params);
    return result.rows[0] || null;
  }

  async leadeMesajGonder(lead) {
    const ns = this._aktifSock();
    const sock = ns?.sock || this.sock;
    if (!sock) { console.log('⚠️ Aktif socket yok, mesaj gönderilemedi'); return; }

    const telefon = this.telefonDuzelt(lead.telefon);
    if (!telefon) {
      await pool.query("UPDATE potansiyel_musteriler SET wp_mesaj_durumu = 'gecersiz_numara' WHERE id = $1", [lead.id]);
      return;
    }

    // Numaranın WhatsApp'ta kayıtlı olup olmadığını kontrol et
    try {
      const [result] = await sock.onWhatsApp(telefon);
      if (!result?.exists) {
        console.log(`📵 ${lead.isletme_adi} — numara WhatsApp'ta yok`);
        await pool.query("UPDATE potansiyel_musteriler SET wp_mesaj_durumu = 'wp_yok' WHERE id = $1", [lead.id]);
        return;
      }
    } catch (e) {
      console.log(`⚠️ WhatsApp kontrol hatası: ${e.message}`);
    }

    // Kategoriye göre mesaj şablonu seç — önce DB şablonları, yoksa hardcoded
    const kategori = (lead.kategori || '').toLowerCase();
    let mesaj = '';
    let sablonId = null;
    try {
      const dbSablonlar = (await pool.query(
        "SELECT * FROM satis_bot_sablonlar WHERE aktif = true AND (kategori = $1 OR kategori = 'genel') ORDER BY RANDOM() LIMIT 1",
        [kategori || 'genel']
      )).rows;
      if (dbSablonlar.length > 0) {
        const s = dbSablonlar[0];
        sablonId = s.id;
        mesaj = s.mesaj
          .replace(/{isletme_adi}/g, lead.isletme_adi || '')
          .replace(/{isletme_sahibi}/g, lead.isletme_sahibi || lead.isletme_adi || '')
          .replace(/{kategori}/g, lead.kategori || 'işletme')
          .replace(/{telefon}/g, lead.telefon || '');
        await pool.query('UPDATE satis_bot_sablonlar SET gonderilen = gonderilen + 1 WHERE id = $1', [sablonId]);
      }
    } catch(e) { console.log('DB şablon hatası (fallback kullanılacak):', e.message); }
    if (!mesaj) {
      const sablonlar = MESAJ_SABLONLARI[kategori] || MESAJ_SABLONLARI.default;
      const rastgeleSablon = sablonlar[Math.floor(Math.random() * sablonlar.length)];
      mesaj = rastgeleSablon(lead.isletme_adi);
    }

    // Anti-ban: Typing indicator
    const jid = `${telefon}@s.whatsapp.net`;
    try {
      await sock.presenceSubscribe(jid);
      await sock.sendPresenceUpdate('composing', jid);
      // Rastgele 3-8 saniye "yazıyor" göster
      const typingMs = 3000 + Math.random() * 5000;
      await new Promise(r => setTimeout(r, typingMs));
      await sock.sendPresenceUpdate('paused', jid);
    } catch (e) { /* presence hataları önemsiz */ }

    // Mesaj gönder
    try {
      await sock.sendMessage(jid, { text: mesaj });
      const numaraInfo = ns ? `#${ns.numaraId}` : 'tek';
      console.log(`✅ [${numaraInfo}] Mesaj gönderildi: ${lead.isletme_adi} (${telefon}) [${kategori}]`);

      // DB güncelle
      await pool.query(
        "UPDATE potansiyel_musteriler SET wp_mesaj_durumu = 'gonderildi', wp_mesaj_tarihi = (NOW() AT TIME ZONE 'Europe/Istanbul') WHERE id = $1",
        [lead.id]
      );

      // Konuşma kaydı oluştur
      await pool.query(
        `INSERT INTO satis_konusmalar (lead_id, telefon, isletme_adi, kategori, gonderilen_mesaj, durum, sablon_id) 
         VALUES ($1, $2, $3, $4, $5, 'bekliyor', $6)`,
        [lead.id, telefon, lead.isletme_adi, lead.kategori, mesaj, sablonId]
      );

    } catch (err) {
      console.error(`❌ Mesaj gönderme hatası (${lead.isletme_adi}):`, err.message);
      await pool.query("UPDATE potansiyel_musteriler SET wp_mesaj_durumu = 'hata' WHERE id = $1", [lead.id]);
    }
  }

  telefonDuzelt(telefon) {
    if (!telefon) return null;
    let t = telefon.replace(/[\s\-\(\)]/g, '');
    // +90 ile başlamıyorsa ekle
    if (t.startsWith('0')) t = '90' + t.slice(1);
    if (!t.startsWith('90') && !t.startsWith('+90')) t = '90' + t;
    t = t.replace(/^\+/, '');
    // 12 haneli olmalı (90 + 10 haneli numara)
    if (t.length !== 12) return null;
    return t;
  }

  // ═══════════════════════════════════════════════════
  // Kayıt Akışı — Bot üzerinden hesap açma
  // ═══════════════════════════════════════════════════
  async kayitAkisi(remoteJid, telefon, metin, sock) {
    const kayitDurum = this.konusmalar[telefon]?.kayit;
    
    if (!kayitDurum) return false; // Kayıt akışında değil

    const _sock = sock || this.sock;
    const mesajGonder = async (txt) => {
      try {
        await _sock.sendPresenceUpdate('composing', remoteJid);
        await new Promise(r => setTimeout(r, 1000 + Math.random() * 2000));
        await _sock.sendPresenceUpdate('paused', remoteJid);
      } catch(e) {}
      await _sock.sendMessage(remoteJid, { text: txt });
    };

    const metinKucuk = metin.toLowerCase().trim();

    // Vazgeç kontrolü (sadece açıkça iptal/vazgeç yazarsa)
    if (metinKucuk === 'iptal' || metinKucuk === 'vazgeç' || metinKucuk === 'vazgec') {
      delete this.konusmalar[telefon].kayit;
      await mesajGonder(`❌ Kayıt işlemi iptal edildi.\n\nTekrar denemek için *kayıt* yazın.`);
      return true;
    }

    switch (kayitDurum.adim) {
      case 'isletme_adi': {
        if (metin.length < 2) {
          await mesajGonder(`⚠️ İşletme adı çok kısa. Lütfen geçerli bir isim yazın:`);
          return true;
        }
        this.konusmalar[telefon].kayit.isletmeAdi = metin.trim();
        this.konusmalar[telefon].kayit.adim = 'email';
        await mesajGonder(`✅ İşletme adı: *${metin.trim()}*\n\n📧 Şimdi giriş için kullanacağınız *e-posta adresinizi* yazın:`);
        return true;
      }

      case 'email': {
        // Basit email kontrolü
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(metin.trim())) {
          await mesajGonder(`⚠️ Geçerli bir e-posta adresi yazın.\n\nÖrnek: isim@email.com`);
          return true;
        }
        // Email zaten kayıtlı mı?
        const mevcut = (await pool.query('SELECT id FROM admin_kullanicilar WHERE email = $1', [metin.trim().toLowerCase()])).rows[0];
        if (mevcut) {
          await mesajGonder(`⚠️ Bu e-posta zaten kayıtlı!\n\nFarklı bir e-posta yazın veya *admin.sırago.com* adresinden giriş yapın.`);
          return true;
        }
        this.konusmalar[telefon].kayit.email = metin.trim().toLowerCase();
        this.konusmalar[telefon].kayit.adim = 'sifre';
        await mesajGonder(`✅ E-posta: *${metin.trim()}*\n\n🔒 Şimdi bir *şifre* belirleyin (en az 6 karakter):`);
        return true;
      }

      case 'sifre': {
        if (metin.trim().length < 6) {
          await mesajGonder(`⚠️ Şifre en az 6 karakter olmalı. Tekrar deneyin:`);
          return true;
        }
        this.konusmalar[telefon].kayit.sifre = metin.trim();
        this.konusmalar[telefon].kayit.adim = 'onay';
        const k = this.konusmalar[telefon].kayit;
        await mesajGonder(
          `📋 *Kayıt Özeti*\n\n` +
          `🏪 İşletme: *${k.isletmeAdi}*\n` +
          `📧 E-posta: *${k.email}*\n` +
          `🔒 Şifre: *${'•'.repeat(k.sifre.length)}*\n\n` +
          `Her şey doğru mu?\n\n` +
          `*1.* ✅ Onayla ve hesabı oluştur\n` +
          `*2.* ❌ İptal et`
        );
        return true;
      }

      case 'onay': {
        if (metin === '1' || metinKucuk.includes('evet') || metinKucuk.includes('onayla')) {
          // Onaylandı — referans kodu adımına geç
          this.konusmalar[telefon].kayit.adim = 'referans_kodu';
          await mesajGonder(
            `✅ Bilgiler onaylandı!\n\n` +
            `🎟️ *Referans kodunuz* var mı?\n\n` +
            `Varsa kodu yazın, yoksa *hayır* yazın.`
          );
          return true;
        }
        // Sadece "2" veya açıkça iptal/vazgeç yazıldığında iptal et
        if (metin === '2' || metinKucuk === 'iptal' || metinKucuk === 'vazgeç' || metinKucuk === 'vazgec') {
          delete this.konusmalar[telefon].kayit;
          await mesajGonder(`❌ Kayıt işlemi iptal edildi.\n\nTekrar denemek için *kayıt* yazın.`);
          return true;
        }
        // Referans kodum var gibi şeyler yazarsa da referans adımına yönlendir
        if (metinKucuk.includes('ref') || metinKucuk.includes('kod')) {
          this.konusmalar[telefon].kayit.adim = 'referans_kodu';
          await mesajGonder(
            `🎟️ Harika! Referans kodunuzu yazın:`
          );
          return true;
        }
        // Tanınmayan cevap — tekrar onay iste
        await mesajGonder(
          `Lütfen bir seçenek belirleyin:\n\n` +
          `*1.* ✅ Onayla ve hesabı oluştur\n` +
          `*2.* ❌ İptal et`
        );
        return true;
      }

      case 'referans_kodu': {
        // Referans kodu atla
        const atlaCevaplari = ['hayır', 'hayir', 'yok', 'atla', 'geç', 'gec', 'pas'];
        let referansKodu = null;

        if (!atlaCevaplari.includes(metinKucuk)) {
          // Referans kodunu doğrula
          const kodDenemesi = metin.trim().toUpperCase();
          const ref = (await pool.query("SELECT * FROM referanslar WHERE referans_kodu = $1", [kodDenemesi])).rows[0];
          if (!ref) {
            await mesajGonder(
              `⚠️ *${kodDenemesi}* geçerli bir referans kodu değil.\n\n` +
              `Tekrar deneyin veya atlamak için *hayır* yazın:`
            );
            return true;
          }
          referansKodu = kodDenemesi;
        }

        // Hesabı oluştur
        const k = this.konusmalar[telefon].kayit;
        try {
          const bcrypt = require('bcryptjs');
          // Telefonu +90XXXXXXXXXX formatına çevir
          let telFormatli = telefon;
          if (telFormatli.startsWith('90')) telFormatli = '+' + telFormatli;
          else if (!telFormatli.startsWith('+')) telFormatli = '+90' + telFormatli;
          // Aynı telefon varsa farklı yap (timestamp ekle)
          const telMevcut = (await pool.query('SELECT id FROM isletmeler WHERE telefon = $1', [telFormatli])).rows[0];
          if (telMevcut) telFormatli = telFormatli + '_' + Date.now();
          const isletme = (await pool.query(
            `INSERT INTO isletmeler (isim, telefon, kategori, aktif, paket, olusturma_tarihi, deneme_bitis_tarihi) 
             VALUES ($1, $2, 'genel', true, 'baslangic', NOW(), NOW() + INTERVAL '7 days') RETURNING *`,
            [k.isletmeAdi, telFormatli]
          )).rows[0];

          // Admin kullanıcı oluştur
          const hashSifre = await bcrypt.hash(k.sifre, 10);
          await pool.query(
            `INSERT INTO admin_kullanicilar (isim, email, sifre, rol, isletme_id, aktif) 
             VALUES ($1, $2, $3, 'admin', $4, true)`,
            [k.isletmeAdi, k.email, hashSifre, isletme.id]
          );

          // Referans kodu varsa kaydet
          let referansMesaj = '';
          if (referansKodu) {
            try {
              const ref = (await pool.query("SELECT * FROM referanslar WHERE referans_kodu = $1", [referansKodu])).rows[0];
              if (ref) {
                await pool.query("UPDATE referanslar SET toplam_davet = toplam_davet + 1 WHERE id = $1", [ref.id]);
                await pool.query("UPDATE isletmeler SET referans_ile_gelen = $1 WHERE id = $2", [ref.sahip_isletme_id, isletme.id]);
                referansMesaj = `\n🎟️ Referans kodu *${referansKodu}* uygulandı!`;
                console.log(`🤝 Referans kaydedildi: ${referansKodu}, yeni: ${isletme.id}, sahip: ${ref.sahip_isletme_id}`);
              }
            } catch(e) { console.error('Referans uygulama hatası:', e.message); }
          }

          console.log(`🎉 Bot kayıt tamamlandı: ${k.isletmeAdi} (${k.email}) - isletme_id: ${isletme.id} - kanal: WhatsApp${referansKodu ? ' - ref: ' + referansKodu : ''}`);

          delete this.konusmalar[telefon].kayit;
          await mesajGonder(
            `🎉 *Tebrikler! Hesabınız oluşturuldu!*\n\n` +
            `🏪 İşletme: *${k.isletmeAdi}*\n` +
            `📧 E-posta: *${k.email}*${referansMesaj}\n\n` +
            `Artık admin panelinize giriş yapabilirsiniz:\n\n` +
            `🔗 *admin.sırago.com*\n\n` +
            `E-posta ve şifrenizle giriş yapın. İlk ay tamamen ücretsiz! 🚀\n\n` +
            `Yardıma ihtiyacınız olursa bize yazın 💪`
          );
        } catch (err) {
          console.error('❌ Bot kayıt hatası:', err.message);
          await mesajGonder(`❌ Kayıt sırasında bir hata oluştu: ${err.message}\n\nTekrar denemek için *kayıt* yazın.`);
          delete this.konusmalar[telefon].kayit;
        }
        return true;
      }
    }
    return false;
  }

  // ═══════════════════════════════════════════════════
  // Gelen Mesaj İşleme + DeepSeek AI Satış
  // ═══════════════════════════════════════════════════
  async gelenMesajIsle(msg, numaraId) {
    const metin = this._getMsgText(msg);
    if (!metin) return;

    // Hangi socket'ten geldi? O socket'i kullan (cevap aynı numaradan gitsin)
    const ns = numaraId ? this.numaraSockets.get(numaraId) : null;
    const sock = ns?.sock || this.sock;
    if (!sock) return;

    const remoteJid = msg.key.remoteJid;
    // WhatsApp Business LID desteği: @lid JID'lerde gerçek numara remoteJidAlt'ta
    const altJid = msg.key.remoteJidAlt || '';
    let telefon;
    if (remoteJid.endsWith('@lid') && altJid.includes('@s.whatsapp.net')) {
      telefon = altJid.replace('@s.whatsapp.net', '');
      console.log(`📩 LID → telefon çevrildi: ${remoteJid} → ${telefon}`);
    } else {
      telefon = remoteJid.replace('@s.whatsapp.net', '').replace('@c.us', '');
    }

    console.log(`📩 [#${numaraId || 'tek'}] Satış Bot cevap aldı: ${telefon} → "${metin}"`);

    // Mod kontrolü — kapali modunda hiçbir şey yapma
    if (this.ayarlar.mod === 'kapali') {
      console.log(`⏸️ Mod: kapali — gelen mesaj işlenmiyor`);
      return;
    }

    // Gelen mesajlara cevap verme ayarı kapalıysa atla
    if (!this.ayarlar.gelenMesajCevap && this.ayarlar.mod !== 'sadece_kayit') {
      console.log(`⏸️ Gelen mesaj cevap kapalı — mesaj loglanıyor ama cevap verilmiyor`);
    }

    // ─── Kayıt akışı kontrolü ───
    if (!this.konusmalar[telefon]) this.konusmalar[telefon] = {};
    
    // Kayıt akışı devam ediyorsa ona yönlendir (kayıt aktifse)
    if (this.konusmalar[telefon].kayit && this.ayarlar.kayitAktif) {
      const handled = await this.kayitAkisi(remoteJid, telefon, metin, sock);
      if (handled) return;
    }

    // Kayıt komutu — akışı başlat (kayıt aktifse)
    const metinKucuk = metin.toLowerCase().trim();
    const kayitKomutlari = ['kayıt', 'kayit', '/kayit', '/kayıt', 'hesap aç', 'hesap ac', 'kaydol', 'üye ol', 'uye ol', 'register'];
    if (this.ayarlar.kayitAktif && kayitKomutlari.some(k => metinKucuk.includes(k))) {
      this.konusmalar[telefon].kayit = { adim: 'isletme_adi' };
      try {
        await sock.sendPresenceUpdate('composing', remoteJid);
        await new Promise(r => setTimeout(r, 1500));
        await sock.sendPresenceUpdate('paused', remoteJid);
      } catch(e) {}
      await sock.sendMessage(remoteJid, { text: 
        `🎉 *SıraGO'ya Hoş Geldiniz!*\n\n` +
        `Hemen ücretsiz hesabınızı oluşturalım 🚀\n\n` +
        `Adım 1/3\n` +
        `🏪 *İşletmenizin adını* yazın:`
      });
      return;
    }

    // ─── Normal satış akışı ───
    // Bu lead'in konuşma kaydını bul — birden fazla format dene
    const son10 = telefon.slice(-10);
    let konusma = (await pool.query(
      "SELECT * FROM satis_konusmalar WHERE telefon = $1 ORDER BY olusturma_tarihi DESC LIMIT 1",
      [telefon]
    )).rows[0];

    if (!konusma) {
      // +90 prefix ile dene
      konusma = (await pool.query(
        "SELECT * FROM satis_konusmalar WHERE telefon = $1 ORDER BY olusturma_tarihi DESC LIMIT 1",
        ['+' + telefon]
      )).rows[0];
    }
    if (!konusma) {
      // Son 10 hane ile dene (LIKE)
      konusma = (await pool.query(
        "SELECT * FROM satis_konusmalar WHERE telefon LIKE $1 ORDER BY olusturma_tarihi DESC LIMIT 1",
        ['%' + son10]
      )).rows[0];
    }

    if (!konusma) {
      console.log(`📝 Yeni numara, konuşma oluşturuluyor: ${telefon}`);
      // Bilinmeyen numaradan gelen mesaj — yeni konuşma oluştur ve cevap ver
      try {
        const pushName = msg.pushName || 'Müşteri';
        const yeniKonusma = (await pool.query(
          `INSERT INTO satis_konusmalar (telefon, isletme_adi, kategori, gonderilen_mesaj, durum, gelen_mesajlar)
           VALUES ($1, $2, 'genel', 'Müşteri kendisi yazdı', 'bekliyor', $3) RETURNING *`,
          [telefon, pushName, `\n[${turkiyeSaati().toLocaleTimeString('tr-TR')}] Müşteri: ${metin}`]
        )).rows[0];
        konusma = yeniKonusma;
        console.log(`✅ Yeni konuşma oluşturuldu: id=${konusma.id}, telefon=${telefon}, isim=${pushName}`);
      } catch (dbErr) {
        console.error(`❌ Yeni konuşma oluşturma hatası:`, dbErr.message);
        return;
      }
    }

    // Gelen mesajı kaydet + takip sekansını durdur (ai_devrede)
    await pool.query(
      "UPDATE satis_konusmalar SET gelen_mesajlar = COALESCE(gelen_mesajlar, '') || $1, son_mesaj_tarihi = (NOW() AT TIME ZONE 'Europe/Istanbul'), durum = CASE WHEN durum = 'bekliyor' THEN 'ai_devrede' ELSE durum END WHERE id = $2",
      [`\n[${turkiyeSaati().toLocaleTimeString('tr-TR')}] Müşteri: ${metin}`, konusma.id]
    );

    // Şablon performansı güncelle — ilk cevap geldiğinde
    if (konusma.durum === 'bekliyor' && konusma.sablon_id) {
      try {
        await pool.query('UPDATE satis_bot_sablonlar SET cevap_gelen = cevap_gelen + 1 WHERE id = $1', [konusma.sablon_id]);
      } catch(e) {}
    }

    // Olumsuz konuşma — müşteri tekrar yazarsa ikinci şans ver
    if (konusma.durum === 'olumsuz') {
      console.log(`� Olumsuz konuşma tekrar aktif ediliyor: ${telefon}`);
      await pool.query(
        "UPDATE satis_konusmalar SET durum = 'ai_devrede' WHERE id = $1",
        [konusma.id]
      );
      konusma.durum = 'ai_devrede';
    }

    // Red / ilgilenmiyorum algılama — AI'dan önce yakala
    const metinLower = metin.toLowerCase().replace(/[?!.,]/g, '');
    const redKelimeler = ['hayır', 'hayir', 'istemiyorum', 'istemiyoruz', 'gerek yok', 'ilgilenmiyorum', 'ilgilenmiyoruz',
      'boş ver', 'bos ver', 'rahatsız etmeyin', 'spam', 'yazma', 'yazmayın', 'yazmayin', 'engel',
      'beni arama', 'aramayın', 'aramayin', 'mesaj atma', 'mesaj atmayin', 'rahatsız', 'darlamayın', 'darlama',
      'ilgilenmem', 'istemem', 'yok teşekkürler', 'teşekkür ederim gerek yok', 'sağol gerek yok',
      'ben dönerim', 'ben döneceğim', 'ben donerim', 'ben size döneceğim', 'ben ararım', 'ben ararim',
      'sizi ararız', 'biz ararız', 'gerekirse ararız', 'gerekirse döneriz',
      'şu an ilgilenmiyorum', 'şuan ilgilenmiyorum', 'şimdilik gerek yok', 'şimdilik istemiyorum',
      'anlamıyorum bu konulardan', 'bilgilenemiyo', 'anlamıyo'];
    if (redKelimeler.some(k => metinLower.includes(k))) {
      console.log(`🚫 Red algılandı: ${telefon} → "${metin}"`);
      const ad = konusma.isletme_adi || '';
      const vedaMesaj = `Anlıyorum ${ad}, rahatsız ettiysem özür dilerim 🙏\n\nFikrinizi değiştirirseniz sırago.com adresinden bize ulaşabilirsiniz.\n\nİyi çalışmalar dilerim! 🙂`;
      try {
        await sock.sendPresenceUpdate('composing', remoteJid);
        await new Promise(r => setTimeout(r, 1500));
        await sock.sendPresenceUpdate('paused', remoteJid);
      } catch(e) {}
      await sock.sendMessage(remoteJid, { text: vedaMesaj });
      await pool.query(
        "UPDATE satis_konusmalar SET gelen_mesajlar = COALESCE(gelen_mesajlar, '') || $1, durum = 'olumsuz' WHERE id = $2",
        [`\n[${turkiyeSaati().toLocaleTimeString('tr-TR')}] Bot: ${vedaMesaj}`, konusma.id]
      );
      if (konusma.lead_id) {
        await pool.query("UPDATE potansiyel_musteriler SET durum = 'ilgilenmiyor' WHERE id = $1", [konusma.lead_id]);
      }
      // Şablon olumsuz sayacı
      if (konusma.sablon_id) {
        try { await pool.query('UPDATE satis_bot_sablonlar SET olumsuz = olumsuz + 1 WHERE id = $1', [konusma.sablon_id]); } catch(e) {}
      }
      return;
    }

    // Sadece kayıt modundaysa veya gelen mesaj cevap kapalıysa — buraya kadar gel, loglayıp dur
    if (this.ayarlar.mod === 'sadece_kayit' || this.ayarlar.mod === 'sadece_satis') {
      console.log(`⏸️ Mod: ${this.ayarlar.mod} — AI cevap verilmiyor (mesaj loglandı)`);
      return;
    }
    if (!this.ayarlar.gelenMesajCevap) {
      console.log(`⏸️ Gelen mesaj cevap kapalı — mesaj loglandı ama cevap verilmiyor`);
      return;
    }

    // DeepSeek AI ile satış cevabı oluştur
    if (!this.ayarlar.aiCevapAktif) {
      console.log(`⏸️ AI cevap kapalı — fallback cevap kullanılacak`);
      const fallback = this.fallbackCevapUret(metin, konusma);
      if (fallback) {
        if (this.ayarlar.typingIndicator) {
          try {
            await sock.sendPresenceUpdate('composing', remoteJid);
            const typingMs = (this.ayarlar.typingMinMs || 2000) + Math.random() * ((this.ayarlar.typingMaxMs || 6000) - (this.ayarlar.typingMinMs || 2000));
            await new Promise(r => setTimeout(r, typingMs));
            await sock.sendPresenceUpdate('paused', remoteJid);
          } catch(e) {}
        }
        await sock.sendMessage(remoteJid, { text: fallback.mesaj });
        await pool.query(
          "UPDATE satis_konusmalar SET gelen_mesajlar = COALESCE(gelen_mesajlar, '') || $1, durum = $2 WHERE id = $3",
          [`\n[${turkiyeSaati().toLocaleTimeString('tr-TR')}] Bot: ${fallback.mesaj}`, fallback.durum || 'ai_devrede', konusma.id]
        );
      }
      return;
    }

    console.log(`🤖 AI cevap üretiliyor: konusma_id=${konusma.id}, isletme=${konusma.isletme_adi}`);
    const aiCevap = await this.deepseekSatisCevabi(metin, konusma);
    console.log(`🤖 AI cevap sonuç:`, aiCevap ? `mesaj="${aiCevap.mesaj?.slice(0, 50)}..." durum=${aiCevap.durum}` : 'NULL');

    if (aiCevap) {
      // Anti-ban: Typing indicator
      try {
        await sock.sendPresenceUpdate('composing', remoteJid);
        const typingMs = 2000 + Math.random() * 4000;
        await new Promise(r => setTimeout(r, typingMs));
        await sock.sendPresenceUpdate('paused', remoteJid);
      } catch (e) {}

      // Cevap gönder
      await sock.sendMessage(remoteJid, { text: aiCevap.mesaj });
      console.log(`💬 Satış Bot cevap gönderdi: ${telefon} → "${aiCevap.mesaj.slice(0, 60)}..."`);

      // Konuşma kaydını güncelle
      await pool.query(
        "UPDATE satis_konusmalar SET gelen_mesajlar = COALESCE(gelen_mesajlar, '') || $1, durum = $2 WHERE id = $3",
        [`\n[${turkiyeSaati().toLocaleTimeString('tr-TR')}] Bot: ${aiCevap.mesaj}`, aiCevap.durum || 'ai_devrede', konusma.id]
      );

      // Lead durumunu güncelle
      if (aiCevap.durum === 'olumlu') {
        await pool.query("UPDATE potansiyel_musteriler SET durum = 'ilgileniyor' WHERE id = $1", [konusma.lead_id]);
        if (konusma.sablon_id) { try { await pool.query('UPDATE satis_bot_sablonlar SET olumlu = olumlu + 1 WHERE id = $1', [konusma.sablon_id]); } catch(e) {} }
      } else if (aiCevap.durum === 'olumsuz') {
        await pool.query("UPDATE potansiyel_musteriler SET durum = 'ilgilenmiyor' WHERE id = $1", [konusma.lead_id]);
        if (konusma.sablon_id) { try { await pool.query('UPDATE satis_bot_sablonlar SET olumsuz = olumsuz + 1 WHERE id = $1', [konusma.sablon_id]); } catch(e) {} }
      }
    }
  }

  // ─── Fallback cevap şablonları (AI çalışmazsa) ───
  fallbackCevapUret(musteriMesaj, konusma) {
    const mesajLower = musteriMesaj.toLowerCase().replace(/[?!.,]/g, '');
    const ad = konusma.isletme_adi || 'işletmeniz';

    // Olumsuz / red cevapları
    const redKelimeler = ['hayır', 'hayir', 'istemiyorum', 'istemiyoruz', 'gerek yok', 'ilgilenmiyorum', 'ilgilenmiyoruz',
      'boş ver', 'bos ver', 'rahatsız etmeyin', 'spam', 'yazma', 'yazmayın', 'yazmayin',
      'beni arama', 'aramayın', 'aramayin', 'mesaj atma', 'engel', 'darlamayın', 'darlama',
      'ilgilenmem', 'istemem', 'yok teşekkürler', 'teşekkür ederim gerek yok', 'sağol gerek yok',
      'ben dönerim', 'ben döneceğim', 'ben donerim', 'ben ararım', 'ben ararim',
      'sizi ararız', 'biz ararız', 'gerekirse ararız', 'gerekirse döneriz',
      'şu an ilgilenmiyorum', 'şimdilik gerek yok', 'şimdilik istemiyorum',
      'anlamıyorum bu konulardan', 'bilgilenemiyo', 'anlamıyo'];
    if (redKelimeler.some(k => mesajLower.includes(k))) {
      return {
        mesaj: `Anlıyorum, rahatsız ettiysem özür dilerim 🙏\n\nFikrinizi değiştirirseniz bize ulaşabilirsiniz: sırago.com\n\nİyi çalışmalar dilerim! 🙂`,
        durum: 'olumsuz'
      };
    }

    // Fiyat soruları
    const fiyatKelimeler = ['fiyat', 'ücret', 'ucret', 'kaç lira', 'kac lira', 'ne kadar', 'pahalı', 'pahali', 'para', 'maliyet', 'aylık', 'aylik'];
    if (fiyatKelimeler.some(k => mesajLower.includes(k))) {
      return {
        mesaj: `Harika soru! 💰\n\nİlk ay tamamen ÜCRETSİZ — hiçbir ödeme yok, kart bilgisi istemiyoruz.\n\nSonra:\n• Başlangıç: 299₺/ay (1 çalışan)\n• Profesyonel: 599₺/ay (5 çalışana kadar)\n• Premium: 999₺/ay (sınırsız)\n\nGünde bir kahve parası ile müşteri kaybını %80 azaltırsınız ☕\n\nÜcretsiz denemeyi hemen başlatayım mı? 👉 sırago.com`,
        durum: 'olumlu'
      };
    }

    // Ne olduğunu sorma / merak
    const merakKelimeler = ['nedir', 'ne', 'nasıl', 'nasil', 'anlamadım', 'anlamadim', 'açıkla', 'acikla', 'detay', 'bilgi', 'anlat', 'ne yapıyor', 'ne yapiyor', 'özellik'];
    if (merakKelimeler.some(k => mesajLower.includes(k))) {
      return {
        mesaj: `Tabii, kısaca anlatayım 😊\n\nSıraGO, ${ad} için online randevu sistemi:\n\n✅ Müşterileriniz 7/24 telefondan randevu alır\n✅ WhatsApp ile otomatik hatırlatma gider\n✅ Randevu kaçırma oranı %80 düşer\n✅ Tüm yönetimi tek panelden yaparsınız\n\nSektörünüzdeki işletmeler bunu kullanarak müşteri memnuniyetini ciddi artırdı.\n\nÜcretsiz deneyin: sırago.com 🚀`,
        durum: 'olumlu'
      };
    }

    // Olumlu / ilgi gösteren
    const olumluKelimeler = ['tamam', 'olur', 'evet', 'ilgileniyorum', 'deneyelim', 'bakalım', 'göster', 'goster', 'demo', 'denerim', 'deneyim', 'kuralım', 'kuralim', 'başlayalım', 'baslayalim', 'güzel', 'iyi', 'süper', 'harika'];
    if (olumluKelimeler.some(k => mesajLower.includes(k))) {
      return {
        mesaj: `Harika! 🎉\n\nHemen başlayalım! Şu adrese girin:\n👉 sırago.com\n\n30 saniyede kayıt olun, sistemi hemen kullanmaya başlayın. İlk ay tamamen ücretsiz!\n\nKurulumda yardıma ihtiyacınız olursa ben buradayım 💪`,
        durum: 'olumlu'
      };
    }

    // Selam / merhaba
    const selamKelimeler = ['merhaba', 'selam', 'selamlar', 'merhabalar', 'iyi günler', 'gunaydin', 'günaydın'];
    if (selamKelimeler.some(k => mesajLower.includes(k))) {
      return {
        mesaj: `Merhabalar! 🙂\n\n${ad} için online randevu sistemi hakkında yazmıştım. Müşterileriniz telefonla aramak yerine 7/24 online randevu alabilir.\n\nİlk ay tamamen ücretsiz — denemek ister misiniz?\n\n👉 sırago.com`,
        durum: 'bekliyor'
      };
    }

    // Genel / bilinmeyen mesajlar — kibar ve kısa
    return {
      mesaj: `Teşekkürler yanıtınız için! 🙏\n\n${ad} için online randevu sistemi hakkında merak ettiğiniz bir şey olursa sırago.com'dan bilgi alabilirsiniz.\n\nİyi çalışmalar! �`,
      durum: 'bekliyor'
    };
  }

  async deepseekSatisCevabi(musteriMesaj, konusma) {
    const apiKey = process.env.DEEPSEEK_API_KEY;
    if (!apiKey) {
      console.log('⚠️ DEEPSEEK_API_KEY yok, fallback şablon kullanılıyor');
      return this.fallbackCevapUret(musteriMesaj, konusma);
    }

    const konusmaGecmisi = konusma.gelen_mesajlar || '';
    const mesajSayisi = (konusmaGecmisi.match(/Müşteri:/g) || []).length;

    // DB'den güncel paket bilgilerini çek
    let paketBilgiStr = '';
    try {
      const { paketleriYukle } = require('../config/paketler');
      const paketler = await paketleriYukle();
      const paketListesi = Object.entries(paketler).map(([kod, p]) => {
        const ozellikler = [];
        ozellikler.push(`${p.calisan_limit >= 999 ? 'Sınırsız' : p.calisan_limit} çalışan`);
        ozellikler.push(`${p.hizmet_limit >= 999 ? 'Sınırsız' : p.hizmet_limit} hizmet`);
        ozellikler.push(`Aylık ${p.aylik_randevu_limit >= 9999 ? 'sınırsız' : p.aylik_randevu_limit} randevu`);
        if (p.bot_aktif) ozellikler.push('WhatsApp & Telegram botu');
        if (p.hatirlatma) ozellikler.push('Otomatik hatırlatma');
        if (p.istatistik) ozellikler.push('Gelişmiş istatistik & analiz');
        if (p.export_aktif) ozellikler.push('Excel dışa aktarma, CRM, toplu kampanya');
        return `📦 ${p.isim} (${p.fiyat}₺/ay): ${ozellikler.join(' • ')}`;
      });
      paketBilgiStr = paketListesi.join('\n');
    } catch (e) {
      paketBilgiStr = `📦 Başlangıç (299₺/ay): 1 çalışan, 5 hizmet, 200 randevu/ay, WhatsApp bot
📦 Profesyonel (999₺/ay): 3 çalışan, 20 hizmet, sınırsız randevu, Telegram, istatistik, export`;
    }

    const prompt = `Sen profesyonel ve saygılı bir satış danışmanısın. Kibar ve yardımseversin. Müşteriye yardımcı olmak istiyorsun ama ASLA ISRAR ETMİYORSUN.

SEN KİMSİN: SıraGO satış temsilcisi (Gerçek bir insan gibi yaz, BOT olduğun belli olmasın)
NE SATIYORSUN: İşletmelere online randevu & müşteri yönetim sistemi

═══ PAKET DETAYLARI ═══
${paketBilgiStr}

═══ ÜRÜN ÖZELLİKLERİ ═══
🔹 7/24 online randevu: Müşteriler WhatsApp/Telegram üzerinden anında randevu alır, siz uğraşmazsınız
🔹 Akıllı WhatsApp botu: Müşterilerle otomatik konuşur, hizmet seçtirir, randevu oluşturur
🔹 Otomatik hatırlatma: Randevu öncesi müşteriye WhatsApp ile otomatik hatırlatma — randevu kaçırma %80 azalır
🔹 Tek panel yönetimi: Randevu, müşteri, çalışan, hizmet, finans hepsi tek ekrandan
🔹 Çalışan yönetimi: Her çalışana ayrı mesai saati, mola saati, kapalı gün tanımlama
🔹 Müşteri CRM: Müşteri kartları, etiketleme, geçmiş randevular, harcama takibi
🔹 Kapora sistemi: Online ödeme ile kapora alma, no-show azaltma
🔹 Google Calendar entegrasyonu: Randevular otomatik takvime düşer
🔹 Çok dilli destek: Türkçe, İngilizce, Arapça bot desteği
🔹 İstatistik & grafik: Haftalık/aylık randevu, gelir, hizmet dağılımı grafikleri
🔹 Excel export: Müşteri listesi, randevu verileri dışa aktarma
🔹 Telegram botu: WhatsApp'a ek olarak Telegram kanalından da randevu alma
🔹 İLK 7 GÜN TAMAMEN ÜCRETSİZ — kart bilgisi istemiyoruz, 2 dakikada kurulum

═══ KONUŞMA BİLGİLERİ ═══
İşletme: ${konusma.isletme_adi} (Kategori: ${konusma.kategori})
İlk mesajımız: ${konusma.gonderilen_mesaj?.slice(0, 300)}
Konuşma geçmişi: ${konusmaGecmisi.slice(-1000)}

MÜŞTERİNİN SON MESAJI: "${musteriMesaj}"
Bu konuşmada müşteri ${mesajSayisi}. kez cevap veriyor.

═══ SATIŞ STRATEJİN ═══
1. Müşteri "merhaba/selam/bilgi" derse → işletmesine uygun paketi öner, 2-3 somut fayda söyle, ücretsiz denemeyi vurgula
2. Müşteri belirli bir paket sorarsa → O paketin TÜM özelliklerini madde madde anlat, rakamlarla (kaç çalışan, kaç randevu vs.)
3. Müşteri "fark ne / karşılaştır" derse → paketleri karşılaştır, hangisinin ona uygun olduğunu söyle
4. Müşteri fiyat sorarsa → günlük maliyeti hesapla, "günde bir kahve parası" gibi somutlaştır, ilk 7 gün ücretsiz vurgula
5. Müşteri "nasıl çalışıyor" derse → adım adım anlat: kayıt ol → bot bağla → müşterilerin randevu alsın
6. Müşteri ilgileniyorsa → hemen kayıt yönlendir: "Hemen kayıt olmak için *kayıt* yazabilirsiniz" de
7. Müşteri tereddüt ediyorsa → işletmesine özel faydaları anlat (berber için randevu kuyruğu, kuaför için çalışan yönetimi vs.)
8. Müşteri reddederse → HEMEN kabul et, kibar veda mesajı yaz, ISRAR ETME
9. Müşteri "arayın/döneceğim/ben ararım" derse → bu KİBAR REDDİR, kabul et ve veda et
10. ${mesajSayisi} > 4 ve hala karar vermemişse → son kez nazikçe hatırlat ve bırak

═══ KURALLAR ═══
- Türkçe yaz, doğal ve samimi ol (gerçek bir satış danışmanı gibi)
- Paket sorulduğunda DETAYLI cevap ver (7-10 cümle olabilir), genel sorularda kısa tut (3-5 cümle)
- Kayıt linki olarak sırago.com VER veya "kayıt yazmak yeterli" de
- ASLA "admin.sırago.com" yazma! Sadece "sırago.com" yaz
- Emoji kullan ama abartma (max 3-4)
- Müşterinin işletme adını kullan
- ASLA "yapay zeka" veya "bot" olduğunu söyleme
- Rakip ismi verme
- Paket fiyatlarını doğru ver (DB'deki güncel fiyatlar yukarıda)

CEVABINI SADECE ŞU JSON FORMATINDA VER:
{"mesaj": "müşteriye gönderilecek mesaj", "durum": "olumlu" veya "olumsuz" veya "bekliyor"}`;

    try {
      const response = await axios.post('https://api.deepseek.com/chat/completions', {
        model: 'deepseek-chat',
        messages: [
          { role: 'system', content: 'Sen kibar ve saygılı bir satış danışmanısın. Müşteri ilgilenmiyorsa veya reddetmişse ASLA ISRAR ETME, kibarca veda et. Sadece JSON formatında yanıt ver, başka hiçbir şey yazma.' },
          { role: 'user', content: prompt }
        ],
        temperature: 0.8,
        max_tokens: 800
      }, {
        headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        timeout: 20000
      });

      const content = response.data.choices[0]?.message?.content || '';
      console.log(`🤖 DeepSeek raw response: ${content.slice(0, 200)}`);
      
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        if (parsed.mesaj) {
          // Post-processing: yanlış domain varsa düzelt
          parsed.mesaj = parsed.mesaj.replace(/admin\.sirago\.com/gi, 'sırago.com').replace(/sirago\.com/gi, 'sırago.com');
          return parsed;
        }
      }
      // JSON parse başarısız — fallback
      console.log('⚠️ DeepSeek JSON parse hatası, fallback kullanılıyor');
      return this.fallbackCevapUret(musteriMesaj, konusma);
    } catch (err) {
      console.error('❌ DeepSeek satış hatası:', err.message);
      // AI hata verirse fallback şablonlarla cevap ver
      return this.fallbackCevapUret(musteriMesaj, konusma);
    }
  }

  _getMsgText(msg) {
    if (msg.message?.conversation) return msg.message.conversation;
    if (msg.message?.extendedTextMessage?.text) return msg.message.extendedTextMessage.text;
    return '';
  }

  // ═══════════════════════════════════════════════════
  // İstatistikler
  // ═══════════════════════════════════════════════════
  async istatistikler() {
    try {
    const [gonderilen, bekleyen, olumlu, olumsuz, wpYok] = await Promise.all([
      pool.query("SELECT COUNT(*) as c FROM potansiyel_musteriler WHERE wp_mesaj_durumu = 'gonderildi'"),
      pool.query("SELECT COUNT(*) as c FROM satis_konusmalar WHERE durum = 'bekliyor'"),
      pool.query("SELECT COUNT(*) as c FROM satis_konusmalar WHERE durum = 'olumlu'"),
      pool.query("SELECT COUNT(*) as c FROM satis_konusmalar WHERE durum = 'olumsuz'"),
      pool.query("SELECT COUNT(*) as c FROM potansiyel_musteriler WHERE wp_mesaj_durumu = 'wp_yok'"),
    ]);

    return {
      gonderilen: parseInt(gonderilen.rows[0].c),
      bekleyen: parseInt(bekleyen.rows[0].c),
      olumlu: parseInt(olumlu.rows[0].c),
      olumsuz: parseInt(olumsuz.rows[0].c),
      wp_yok: parseInt(wpYok.rows[0].c),
      gunluk_gonderim: this.gunlukGonderim,
      gunluk_limit: 50
    };
    } catch (err) {
      console.log('⚠️ İstatistik sorgu hatası (tablo henüz yok olabilir):', err.message);
      return { gonderilen: 0, bekleyen: 0, olumlu: 0, olumsuz: 0, wp_yok: 0, gunluk_gonderim: this.gunlukGonderim, gunluk_limit: 50 };
    }
  }

  async konusmalarGetir(limit = 20) {
    try {
      const result = await pool.query(
        "SELECT * FROM satis_konusmalar ORDER BY son_mesaj_tarihi DESC NULLS LAST, olusturma_tarihi DESC LIMIT $1",
        [limit]
      );
      return result.rows;
    } catch (err) {
      console.log('⚠️ Konuşma sorgu hatası:', err.message);
      return [];
    }
  }
}

module.exports = new SatisBot();
