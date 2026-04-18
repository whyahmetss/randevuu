const { default: makeWASocket, DisconnectReason, fetchLatestBaileysVersion, makeCacheableSignalKeyStore } = require('@whiskeysockets/baileys');
const qrcode = require('qrcode');
const pool = require('../config/db');
const EventEmitter = require('events');
const pino = require('pino');
const axios = require('axios');
const { usePostgresAuthState } = require('../utils/pgAuthState');
const fs = require('fs');
const path = require('path');

const SATIS_BOT_ID = 999999;

// Sektöre özel tanıtım videoları — public/videos/ klasöründe .mp4 olmalı
const TANITIM_VIDEOLARI = {
  berber: 'berber.mp4',
  'kuaför': 'kuafor.mp4',
  'güzellik salonu': 'guzellik.mp4',
  'diş kliniği': 'dis-klinigi.mp4',
  veteriner: 'veteriner.mp4',
  diyetisyen: 'diyetisyen.mp4',
  spa: 'spa.mp4',
  'dövme': 'dovme.mp4',
  'tırnak salonu': 'tirnak.mp4',
  default: 'genel.mp4'
};

// Türkiye saati (UTC+3)
function turkiyeSaati() {
  return new Date(new Date().toLocaleString('en-US', { timeZone: 'Europe/Istanbul' }));
}

// ═══════════════════════════════════════════════════
// Mesaj Varyasyonları — Her seferinde farklı mesaj
// ═══════════════════════════════════════════════════
const MESAJ_SABLONLARI = {
  berber: [
    (ad) => `Selam, müşteri işlemdeyken çalan telefonlara bakmak veya mesajlara yetişmek vakit ve müşteri kaybettirir.\n\n${ad} randevularını 7/24 otomatik veren WhatsApp botumuza devretmek ister misiniz?\n\nSistemin nasıl çalıştığını gösteren 1 dakikalık kısa bir video iletebilirim.`,
    (ad) => `Merhaba, müşterilerinize uygulama indirtmeden, sadece WhatsApp üzerinden kendi kendilerine randevu aldırabileceğiniz bir sistem kurduk.\n\n${ad} için ilk ay ücretsiz — demo linki göndereyim mi?`,
  ],
  'kuaför': [
    (ad) => `Merhaba, müşterilerinize uygulama indirtmeden, sadece WhatsApp üzerinden kendi kendilerine randevu aldırabileceğiniz AI sistemimizi aktif ettik.\n\n${ad} için ilk ay ücretsiz geçiş — 5 dakikalık demo linki göndereyim mi?`,
    (ad) => `Selam, müşteri saçını boyatırken telefon çalıyor, açamıyorsunuz — o arayan müşteri başka salona gidiyor.\n\n${ad} randevularını WhatsApp botu otomatik alsın. İlk ay ücretsiz, demo atayım mı?`,
  ],
  'güzellik salonu': [
    (ad) => `Selam, saçtan tırnağa 10 farklı hizmetiniz var ama müşteri telefon açıp "bugün müsait misiniz" diye soruyor değil mi?\n\n${ad} için hizmet seçimli online randevu botu kurduk. Müşteri kendisi seçiyor, siz onaylıyorsunuz. İlk ay ücretsiz — bakmak ister misiniz?`,
    (ad) => `Merhaba, müşterileriniz hizmet seçip WhatsApp'tan kendi kendine randevu alsın, siz müşteriyle ilgilenin.\n\n${ad} için ilk ay ücretsiz. 2 dakikada aktif — demo atayım mı?`,
  ],
  'dövme': [
    (ad) => `Selam, dövme randevusu uzun süreç — mesajlaşma, tasarım onayı, tarih ayarlama. Hepsini tek yerden yönetebileceğiniz bir sistem kurduk.\n\n${ad} için ilk ay ücretsiz. Demo atayım mı?`,
    (ad) => `Merhaba, ${ad} müşterileri WhatsApp'tan randevu alsın, otomatik hatırlatma gitsin, randevu kaçırma bitsin.\n\nİlk ay ücretsiz — bakmak ister misiniz?`,
  ],
  'diş kliniği': [
    (ad) => `Merhaba, hasta telefonla randevu alıp gelmiyor — sekreter gününün yarısını telefonda geçiriyor.\n\n${ad} için otomatik randevu + WhatsApp hatırlatma sistemi kurduk. İptal oranı %80 düşüyor. Demo atayım mı?`,
    (ad) => `Selam, hastalarınız 7/24 online randevu alsın, randevu öncesi otomatik WhatsApp hatırlatma gitsin.\n\n${ad} için ilk ay ücretsiz — sekreter yükünü azaltmak ister misiniz?`,
  ],
  'veteriner': [
    (ad) => `Merhaba, evcil hayvan sahipleri genelde acil arıyor ama siz muayenedeyken telefona bakamıyorsunuz.\n\n${ad} için WhatsApp'tan 7/24 otomatik randevu sistemi kurduk. İlk ay ücretsiz — demo atayım mı?`,
    (ad) => `Selam, ${ad} müşterileri evcil dostları için WhatsApp'tan randevu alsın, hatırlatma otomatik gitsin.\n\nİlk ay ücretsiz — bakmak ister misiniz?`,
  ],
  'spa': [
    (ad) => `Merhaba, müşterileriniz hizmet ve saat seçip WhatsApp'tan kendi kendine randevu alsın. Siz rahat edin.\n\n${ad} için ilk ay ücretsiz — demo atayım mı?`,
  ],
  'tırnak salonu': [
    (ad) => `Selam, müşteriniz işlem sırasında telefonunuza bakamıyorsunuz — o arayan müşteri başka salona gidiyor.\n\n${ad} için WhatsApp randevu botu kurduk. İlk ay ücretsiz — bakmak ister misiniz?`,
  ],
  'diyetisyen': [
    (ad) => `Merhaba, danışanlarınız 7/24 WhatsApp'tan randevu alsın, otomatik hatırlatma gitsin, randevu kaçırma bitsin.\n\n${ad} için ilk ay ücretsiz — demo atayım mı?`,
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
    // ─── MESAJ RETRY STORE ───
    // getMessage callback için gönderilen mesajları sakla (5dk sonra temizlenir)
    this.msgStore = new Map();
    // ─── ÇOKLU NUMARA DESTEĞİ ───
    // Her numaranın kendi socket, durum, QR'ı var
    this.numaraSockets = new Map(); // numaraId → { sock, durum, qrBase64, reconnectAttempts, basariliOturumVardi, _reconnectTimer }
    // Geriye uyumluluk (eski tek-socket alanlar → artık aktif numaradan okunur)
    this.sock = null;
    this.durum = 'kapali';
    this.qrBase64 = null;
    this.aktif = false; // mesaj gönderme döngüsü aktif mi
    this.gonderimTimer = null; // eski uyumluluk
    this.numaraTimers = new Map(); // numaraId → timer (her numara kendi loop'u)
    this.numaraGunluk = new Map(); // numaraId → { gonderim: 0, tarih: 'YYYY-MM-DD' }
    this.takipTimer = null;
    this.gunlukGonderim = 0;
    this.sonGonderimTarihi = null;
    this.konusmalar = {};
    this.maxReconnectAttempts = 5;
    this.roundRobinIndex = 0; // round-robin gönderimde sıra (gelen mesaj cevabı için)
    // SuperAdmin'den kontrol edilebilir ayarlar
    this.ayarlar = {
      mesaiBaslangic: 9,   // saat
      mesaiBitis: 19,       // saat
      gunlukLimit: 80,
      minBekleme: 5,        // dakika
      maxBekleme: 10,       // dakika
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
        browser: ['SıraGO-Sales', 'Desktop', '4.0.0'],
        generateHighQualityLinkPreview: false,
        syncFullHistory: false,
        markOnlineOnConnect: false,
        getMessage: async (key) => {
          const msg = this.msgStore.get(key.id);
          if (msg) return msg;
          return { conversation: '' };
        },
      });

      ns.sock.ev.on('creds.update', saveCreds);

      ns.sock.ev.on('connection.update', (update) => {
        this._handleNumaraConnectionUpdate(numaraId, update);
      });

      // Mesaj teslim durumu takibi
      ns.sock.ev.on('messages.update', (updates) => {
        for (const u of updates) {
          if (u.update?.status === 2) console.log(`📬 [#${numaraId}] Teslim edildi: ${u.key?.remoteJid?.split('@')[0]} msgId=${u.key?.id}`);
          else if (u.update?.status === 3) console.log(`📭 [#${numaraId}] Okundu: ${u.key?.remoteJid?.split('@')[0]} msgId=${u.key?.id}`);
          else if (u.update?.status === 0 || u.update?.status === 1) console.log(`⚠️ [#${numaraId}] Mesaj durumu=${u.update?.status}: ${u.key?.remoteJid?.split('@')[0]} msgId=${u.key?.id}`);
        }
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
        // 5sn bekle — Baileys session initialization + sock.user set olsun
        await new Promise(r => setTimeout(r, 5000));
        
        if (!ns.sock?.user) {
          console.log(`⚠️ [#${numaraId}] connection:open geldi ama sock.user hâlâ yok — session bozuk olabilir`);
          ns.durum = 'hata';
          this._senkronEt();
          return;
        }

        ns.durum = 'bagli';
        ns.qrBase64 = null;
        ns.reconnectAttempts = 0;
        ns.basariliOturumVardi = true;
        const numara = ns.sock.user.id.split(':')[0] || 'bilinmiyor';
        console.log(`✅ [#${numaraId}] WhatsApp bağlandı — numara: ${numara} (user doğrulandı)`);
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
        browser: ['RandevuGO', 'Desktop', '4.0.0'],
        generateHighQualityLinkPreview: false,
        getMessage: async (key) => {
          const msg = this.msgStore.get(key.id);
          if (msg) return msg;
          return { conversation: '' };
        },
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

  // Session temizle — bozuk auth key'leri sil, sıfırdan QR taratmak için
  async numaraSessionTemizle(numaraId) {
    // Timer'ı temizle
    if (this.numaraTimers.has(numaraId)) {
      clearTimeout(this.numaraTimers.get(numaraId));
      this.numaraTimers.delete(numaraId);
    }
    await this.numaraDurdur(numaraId);
    const authId = 900000 + numaraId;
    // Tüm auth key'leri sil
    const delResult = await pool.query('DELETE FROM wa_auth_keys WHERE isletme_id=$1', [authId]);
    const silinen = delResult?.rowCount || 0;
    try { await pool.query("UPDATE satis_bot_numaralar SET durum='aktif' WHERE id=$1", [numaraId]); } catch(e) {}
    // msgStore da temizle
    this.msgStore.clear();
    console.log(`🗑️ [#${numaraId}] Session temizlendi — ${silinen} auth key silindi (authId: ${authId}). Yeniden QR taratın.`);
    return { mesaj: `Numara #${numaraId} session temizlendi (${silinen} key silindi) — panelden tekrar bağlayın` };
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
    if (!sock || !sock?.user) {
      console.log(`⚠️ Takip mesajı gönderilemedi — socket bağlı değil (${konusma.isletme_adi})`);
      return;
    }

    const takipNo = (konusma.takip_sayisi || 0) + 1;
    const sablonlar = TAKIP_SABLONLARI[takipNo] || TAKIP_SABLONLARI[2];
    const sablon = sablonlar[Math.floor(Math.random() * sablonlar.length)];
    const mesaj = sablon(konusma.isletme_adi || 'işletmeniz');

    const telefon = konusma.telefon;
    const jid = `${telefon}@s.whatsapp.net`;
    const numaraInfo = ns ? `#${ns.numaraId}` : 'legacy';

    try {
      // Anti-ban: Typing indicator
      try {
        await sock.presenceSubscribe(jid);
        await sock.sendPresenceUpdate('composing', jid);
        const typingMs = 2000 + Math.random() * 4000;
        await new Promise(r => setTimeout(r, typingMs));
        await sock.sendPresenceUpdate('paused', jid);
      } catch (e) {}

      const sent = await sock.sendMessage(jid, { text: mesaj });
      if (!sent?.key?.id) {
        console.log(`❌ [${numaraInfo}] Takip #${takipNo} boş response: ${konusma.isletme_adi} (${telefon})`);
        return;
      }

      // Retry store'a kaydet
      if (sent.message) {
        this.msgStore.set(sent.key.id, sent.message);
        setTimeout(() => this.msgStore.delete(sent.key.id), 5 * 60 * 1000);
      }

      const saglamMi = !!sock?.user;

      if (saglamMi) {
        console.log(`🔔 [${numaraInfo}] Takip #${takipNo} gönderildi + socket sağlam: ${konusma.isletme_adi} (${telefon}) msgId=${sent.key.id}`);
      } else {
        console.log(`⚠️ [${numaraInfo}] Takip #${takipNo} gönderildi ama socket DÜŞTÜ: ${konusma.isletme_adi} (${telefon}) msgId=${sent.key.id}`);
      }

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
    // Numara bazlı durumlar + paralel loop bilgisi
    const numaraDurumlari = [];
    for (const [id, ns] of this.numaraSockets) {
      const ng = this.numaraGunluk.get(id);
      numaraDurumlari.push({
        numaraId: id,
        durum: ns.durum,
        qrBase64: ns.qrBase64,
        numara: ns.sock?.user?.id?.split(':')[0] || null,
        paralelAktif: this.numaraTimers.has(id),
        gunlukGonderim: ng?.gonderim || 0,
      });
    }
    const paralelCalisan = [...this.numaraTimers.keys()].length;
    return {
      durum: this.durum,
      qrBase64: this.qrBase64,
      aktif: this.aktif,
      gunlukGonderim: this.gunlukGonderim,
      sonGonderimTarihi: this.sonGonderimTarihi,
      ayarlar: this.ayarlar,
      bagliNumaraSayisi: this._bagliSocklar().length,
      paralelCalisan,
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
    // Her bağlı numara kendi paralel gönderim döngüsünü başlatır
    const baglilar = this._bagliSocklar();
    console.log(`🚀 Satış Bot PARALEL gönderim başladı — ${baglilar.length} numara aynı anda çalışacak`);
    for (const ns of baglilar) {
      this._numaraLoopBaslat(ns.numaraId);
    }
    return { mesaj: `${baglilar.length} numara ile paralel gönderim başladı` };
  }

  gonderimDurdur() {
    this.aktif = false;
    // Tüm numara timer'larını durdur
    for (const [nId, timer] of this.numaraTimers) {
      clearTimeout(timer);
    }
    this.numaraTimers.clear();
    if (this.gonderimTimer) {
      clearTimeout(this.gonderimTimer);
      this.gonderimTimer = null;
    }
    console.log('⏸️ Satış Bot tüm paralel gönderimler durduruldu');
    return { mesaj: 'Gönderim durduruldu' };
  }

  _numaraLoopBaslat(numaraId) {
    // Zaten çalışıyorsa tekrar başlatma
    if (this.numaraTimers.has(numaraId)) return;
    console.log(`🔄 Numara #${numaraId} paralel gönderim loop'u başladı`);
    this._numaraGonderim(numaraId);
  }

  // Her numara kendi paralel döngüsünü çalıştırır
  async _numaraGonderim(numaraId) {
    this._senkronEt();
    if (!this.aktif) { this.numaraTimers.delete(numaraId); return; }

    // Numara hâlâ bağlı mı kontrol et
    const ns = this.numaraSockets.get(numaraId);
    if (!ns || ns.durum !== 'bagli' || !ns.sock || !ns.sock.user) {
      console.log(`⚠️ Numara #${numaraId} bağlı değil (durum=${ns?.durum}, user=${!!ns?.sock?.user}), loop durduruluyor`);
      this.numaraTimers.delete(numaraId);
      return;
    }

    const simdi = turkiyeSaati();
    const bugun = simdi.toISOString().slice(0, 10);

    // Numara bazlı günlük sayaç
    let ng = this.numaraGunluk.get(numaraId) || { gonderim: 0, tarih: bugun };
    if (ng.tarih !== bugun) { ng = { gonderim: 0, tarih: bugun }; }
    this.numaraGunluk.set(numaraId, ng);

    // Global günlük sıfırla
    if (this.sonGonderimTarihi !== bugun) {
      this.gunlukGonderim = 0;
      this.sonGonderimTarihi = bugun;
    }

    // Mod kontrolü
    if (['sadece_kayit', 'sadece_ai', 'kapali'].includes(this.ayarlar.mod)) {
      this.numaraTimers.set(numaraId, setTimeout(() => this._numaraGonderim(numaraId), 30 * 60 * 1000));
      return;
    }

    // Tatil
    if (this.ayarlar.tatil) {
      this.numaraTimers.set(numaraId, setTimeout(() => this._numaraGonderim(numaraId), 60 * 60 * 1000));
      return;
    }

    // Global günlük limit
    if (this.gunlukGonderim >= this.ayarlar.gunlukLimit) {
      console.log(`📊 [#${numaraId}] Global günlük limit doldu (${this.ayarlar.gunlukLimit})`);
      this.numaraTimers.set(numaraId, setTimeout(() => this._numaraGonderim(numaraId), 60 * 60 * 1000));
      return;
    }

    // Numara bazlı günlük limit (global / numara sayısı)
    const bagliSayisi = this._bagliSocklar().length || 1;
    const numaraLimit = Math.ceil(this.ayarlar.gunlukLimit / bagliSayisi) + 5; // biraz tolerans
    if (ng.gonderim >= numaraLimit) {
      console.log(`📊 [#${numaraId}] Numara limiti doldu (${ng.gonderim}/${numaraLimit})`);
      this.numaraTimers.set(numaraId, setTimeout(() => this._numaraGonderim(numaraId), 60 * 60 * 1000));
      return;
    }

    // Gece kontrolü
    const saat = simdi.getHours();
    if (saat < 8 || saat >= 20) {
      this.numaraTimers.set(numaraId, setTimeout(() => this._numaraGonderim(numaraId), 30 * 60 * 1000));
      return;
    }

    try {
      // Kampanya bazlı lead seçimi
      const sonuc = await this.siradakiLeadGetir();
      if (!sonuc) {
        console.log(`📭 [#${numaraId}] Uygun lead kalmadı — 5dk sonra tekrar`);
        this.numaraTimers.set(numaraId, setTimeout(() => this._numaraGonderim(numaraId), 5 * 60 * 1000));
        return;
      }

      const { lead, kampanya } = sonuc;
      const sock = ns.sock;

      // WhatsApp kontrol
      const telefon = this.telefonDuzelt(lead.telefon);
      if (telefon) {
        try {
          const [wpSonuc] = await sock.onWhatsApp(telefon);
          if (!wpSonuc?.exists) {
            console.log(`📵 [#${numaraId}] WP YOK: ${lead.isletme_adi} (${telefon}) — skip`);
            await pool.query("UPDATE potansiyel_musteriler SET wp_mesaj_durumu = 'wp_yok' WHERE id = $1", [lead.id]);
            this.numaraTimers.set(numaraId, setTimeout(() => this._numaraGonderim(numaraId), 2000));
            return;
          }
        } catch(e) { console.log(`⚠️ [#${numaraId}] WP kontrol hatası (devam):`, e.message); }
      }

      // Mesaj gönder — bu numaranın socket'i ile
      await this._numaraMesajGonder(ns, lead, kampanya);
      ng.gonderim++;
      this.numaraGunluk.set(numaraId, ng);
      this.gunlukGonderim++;

      // Kampanya sayacı
      if (kampanya) {
        try {
          await pool.query(`UPDATE satis_kampanyalar SET gonderilen = gonderilen + 1, bugun_gonderilen = CASE WHEN bugun_tarihi = CURRENT_DATE THEN bugun_gonderilen + 1 ELSE 1 END, bugun_tarihi = CURRENT_DATE WHERE id = $1`, [kampanya.id]);
        } catch(e) { /* önemsiz */ }
      }

      // Bekleme — her numara kendi arasında bekler, diğer numaralar aynı anda devam eder
      const minBekleme = this.ayarlar.minBekleme * 60 * 1000;
      const maxBekleme = this.ayarlar.maxBekleme * 60 * 1000;
      const bekleme = minBekleme + Math.random() * (maxBekleme - minBekleme);
      const dakika = Math.round(bekleme / 60000);

      console.log(`⏳ [#${numaraId}] Sonraki mesaj ${dakika}dk sonra (numara: ${ng.gonderim}, global: ${this.gunlukGonderim}/${this.ayarlar.gunlukLimit})`);
      this.numaraTimers.set(numaraId, setTimeout(() => this._numaraGonderim(numaraId), bekleme));

    } catch (err) {
      console.error(`❌ [#${numaraId}] Gönderim hatası:`, err.message);
      this.numaraTimers.set(numaraId, setTimeout(() => this._numaraGonderim(numaraId), 5 * 60 * 1000));
    }
  }

  // Eski uyumluluk: sonrakiGonderim → paralel sisteme yönlendir
  async sonrakiGonderim() {
    const baglilar = this._bagliSocklar();
    if (baglilar.length > 0) {
      for (const ns of baglilar) {
        this._numaraLoopBaslat(ns.numaraId);
      }
    }
  }

  // ═══════════════════════════════════════════════════
  // Lead Seçimi — Kampanya Bazlı Segmentasyon Motoru
  // ═══════════════════════════════════════════════════
  async siradakiLeadGetir() {
    const simdi = turkiyeSaati();
    const saat = simdi.getHours();
    // JS getDay(): 0=Paz, 1=Pzt ... 6=Cmt → PostgreSQL array: 1=Pzt ... 7=Paz
    const jsGun = simdi.getDay(); // 0-6
    const pgGun = jsGun === 0 ? 7 : jsGun; // 1-7

    try {
      // 1. Aktif kampanyalardan, bugünün gününe ve saatine uygun olanları çek
      const kampanyalar = (await pool.query(`
        SELECT * FROM satis_kampanyalar
        WHERE aktif = true
          AND $1 = ANY(gunler)
          AND $2 >= mesai_baslangic AND $2 < mesai_bitis
          AND (bugun_tarihi != CURRENT_DATE OR bugun_gonderilen < gunluk_limit)
        ORDER BY oncelik DESC
      `, [pgGun, saat])).rows;

      // 2. Her kampanya için uygun lead bul
      for (const kamp of kampanyalar) {
        const lead = (await pool.query(`
          SELECT * FROM potansiyel_musteriler
          WHERE telefon IS NOT NULL AND telefon != ''
            AND durum = 'yeni'
            AND wp_mesaj_durumu IS NULL
            AND LOWER(kategori) = LOWER($1)
            AND skor >= $2
            AND id NOT IN (SELECT COALESCE(lead_id,0) FROM satis_konusmalar WHERE durum IN ('olumsuz','musteri'))
            AND telefon NOT IN (SELECT telefon FROM satis_konusmalar)
          ORDER BY skor DESC
          LIMIT 1
        `, [kamp.kategori, kamp.min_skor])).rows[0];

        if (lead) {
          console.log(`🎯 Kampanya: ${kamp.isim} | Lead: ${lead.isletme_adi} (skor:${lead.skor})`);
          return { lead, kampanya: kamp };
        }
      }

      // 3. Hiçbir kampanya uygun değilse → fallback: eski mantık (hedefKategori veya tümü)
      const kategori = this.ayarlar.hedefKategori;
      let query = `
        SELECT * FROM potansiyel_musteriler
        WHERE telefon IS NOT NULL AND telefon != ''
          AND durum = 'yeni'
          AND wp_mesaj_durumu IS NULL
          AND id NOT IN (SELECT COALESCE(lead_id,0) FROM satis_konusmalar WHERE durum IN ('olumsuz','musteri'))
          AND telefon NOT IN (SELECT telefon FROM satis_konusmalar)
      `;
      const params = [];
      if (kategori) {
        query += ` AND LOWER(kategori) = LOWER($1)`;
        params.push(kategori);
      }
      query += ` ORDER BY skor DESC LIMIT 1`;
      const fallback = (await pool.query(query, params)).rows[0];
      if (fallback) {
        console.log(`📋 Fallback lead: ${fallback.isletme_adi} (skor:${fallback.skor}, kategori:${fallback.kategori})`);
        return { lead: fallback, kampanya: null };
      }
    } catch(e) {
      console.error('❌ Kampanya lead seçim hatası:', e.message);
      // Hata durumunda eski basit mantığa düş
      const result = await pool.query(`
        SELECT * FROM potansiyel_musteriler
        WHERE telefon IS NOT NULL AND telefon != ''
          AND durum = 'yeni' AND wp_mesaj_durumu IS NULL
          AND id NOT IN (SELECT COALESCE(lead_id,0) FROM satis_konusmalar WHERE durum IN ('olumsuz','musteri'))
          AND telefon NOT IN (SELECT telefon FROM satis_konusmalar)
        ORDER BY skor DESC LIMIT 1
      `);
      if (result.rows[0]) return { lead: result.rows[0], kampanya: null };
    }
    return null;
  }

  // Belirli numaranın socket'i ile mesaj gönder (paralel sistem)
  async _numaraMesajGonder(ns, lead, kampanya = null) {
    const sock = ns.sock;
    if (!sock) { console.log(`⚠️ [#${ns.numaraId}] Socket yok`); return; }

    const telefon = this.telefonDuzelt(lead.telefon);
    if (!telefon) {
      await pool.query("UPDATE potansiyel_musteriler SET wp_mesaj_durumu = 'gecersiz_numara' WHERE id = $1", [lead.id]);
      return;
    }

    // Çift gönderim koruması — bu telefona zaten başka numara mesaj attıysa atla
    try {
      const mevcutKonusma = (await pool.query(
        "SELECT id FROM satis_konusmalar WHERE telefon = $1 LIMIT 1", [telefon]
      )).rows[0];
      if (mevcutKonusma) {
        console.log(`⚠️ [#${ns.numaraId}] Bu telefona zaten mesaj atılmış, skip: ${lead.isletme_adi} (${telefon})`);
        await pool.query("UPDATE potansiyel_musteriler SET wp_mesaj_durumu = 'zaten_yazildi' WHERE id = $1", [lead.id]);
        return;
      }
    } catch(e) {}

    const kategori = (lead.kategori || '').toLowerCase();
    let mesaj = '';
    let sablonId = null;
    try {
      let dbSablonlar;
      if (kampanya) {
        dbSablonlar = (await pool.query(
          "SELECT * FROM satis_bot_sablonlar WHERE aktif = true AND kampanya_id = $1 ORDER BY RANDOM() LIMIT 1",
          [kampanya.id]
        )).rows;
      }
      if (!dbSablonlar || dbSablonlar.length === 0) {
        dbSablonlar = (await pool.query(
          "SELECT * FROM satis_bot_sablonlar WHERE aktif = true AND kampanya_id IS NULL AND (kategori = $1 OR kategori = 'genel') ORDER BY RANDOM() LIMIT 1",
          [kategori || 'genel']
        )).rows;
      }
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
    } catch(e) { console.log('DB şablon hatası (fallback):', e.message); }
    if (!mesaj) {
      const sablonlar = MESAJ_SABLONLARI[kategori] || MESAJ_SABLONLARI.default;
      const rastgeleSablon = sablonlar[Math.floor(Math.random() * sablonlar.length)];
      mesaj = rastgeleSablon(lead.isletme_adi);
    }

    // Numaranın WhatsApp'ta olduğunu ÖN KONTROL ET — gerçek hedef JID'i al
    let jid;
    try {
      const check = await sock.onWhatsApp(`${telefon}@s.whatsapp.net`);
      if (!check || !check.length || !check[0]?.exists) {
        console.log(`📵 [#${ns.numaraId}] WP YOK (onWhatsApp=false): ${lead.isletme_adi} (${telefon}) — atlanıyor`);
        await pool.query("UPDATE potansiyel_musteriler SET wp_mesaj_durumu = 'wp_yok' WHERE id = $1", [lead.id]);
        return;
      }
      jid = check[0].jid || `${telefon}@s.whatsapp.net`;
    } catch (e) {
      console.log(`⚠️ [#${ns.numaraId}] onWhatsApp kontrolü başarısız (${telefon}): ${e.message} — default JID ile devam`);
      jid = `${telefon}@s.whatsapp.net`;
    }

    try {
      await sock.presenceSubscribe(jid);
      await sock.sendPresenceUpdate('composing', jid);
      const typingMs = (this.ayarlar.typingMinMs || 2000) + Math.random() * ((this.ayarlar.typingMaxMs || 6000) - (this.ayarlar.typingMinMs || 2000));
      await new Promise(r => setTimeout(r, typingMs));
      await sock.sendPresenceUpdate('paused', jid);
    } catch (e) { /* presence hataları önemsiz */ }

    try {
      // Socket bağlantı kontrolü — gönderim öncesi
      if (!sock?.user) {
        throw new Error('Socket bağlı değil — mesaj gönderilemez');
      }

      console.log(`📤 [#${ns.numaraId}] sendMessage başlıyor: jid=${jid}`);
      const sent = await sock.sendMessage(jid, { text: mesaj });
      console.log(`📤 [#${ns.numaraId}] sendMessage döndü:`, JSON.stringify({ keyId: sent?.key?.id, status: sent?.status, hasMessage: !!sent?.message, messageKeys: sent?.message ? Object.keys(sent.message) : [] }));
      if (!sent?.key?.id) {
        throw new Error('sendMessage boş response döndü (mesaj gönderilmemiş olabilir)');
      }

      // Retry store'a kaydet (5dk sonra temizle)
      if (sent.message) {
        this.msgStore.set(sent.key.id, sent.message);
        setTimeout(() => this.msgStore.delete(sent.key.id), 5 * 60 * 1000);
      }

      const kampInfo = kampanya ? ` [${kampanya.isim}]` : '';
      console.log(`✅ [#${ns.numaraId}]${kampInfo} Mesaj gönderildi: ${lead.isletme_adi} (${telefon}) [${kategori}] skor:${lead.skor} msgId=${sent.key.id}`);

      // Tanıtım videosunu .mp4 olarak doğrudan sohbete gönder (link yerine medya)
      await this._tanitimVideosuGonder(sock, jid, kategori, ns.numaraId);

      await pool.query(
        "UPDATE potansiyel_musteriler SET wp_mesaj_durumu = 'gonderildi', wp_mesaj_tarihi = (NOW() AT TIME ZONE 'Europe/Istanbul') WHERE id = $1",
        [lead.id]
      );

      await pool.query(
        `INSERT INTO satis_konusmalar (lead_id, telefon, isletme_adi, kategori, gonderilen_mesaj, durum, sablon_id) 
         VALUES ($1, $2, $3, $4, $5, 'bekliyor', $6)`,
        [lead.id, telefon, lead.isletme_adi, lead.kategori, mesaj, sablonId]
      );
    } catch (err) {
      console.error(`❌ [#${ns.numaraId}] Mesaj gönderme hatası (${lead.isletme_adi}):`, err.message);
      await pool.query("UPDATE potansiyel_musteriler SET wp_mesaj_durumu = 'hata' WHERE id = $1", [lead.id]);
    }
  }

  // Eski uyumluluk: leadeMesajGonder (gelen mesaj cevabı vb. için)
  async leadeMesajGonder(lead, kampanya = null) {
    const ns = this._aktifSock();
    const sock = ns?.sock || this.sock;
    if (!sock) { console.log('⚠️ Aktif socket yok, mesaj gönderilemedi'); return; }

    const telefon = this.telefonDuzelt(lead.telefon);
    if (!telefon) {
      await pool.query("UPDATE potansiyel_musteriler SET wp_mesaj_durumu = 'gecersiz_numara' WHERE id = $1", [lead.id]);
      return;
    }

    // Kategoriye göre mesaj şablonu seç — kampanya varsa kampanyaya bağlı A/B, yoksa fallback
    const kategori = (lead.kategori || '').toLowerCase();
    let mesaj = '';
    let sablonId = null;
    try {
      let dbSablonlar;
      if (kampanya) {
        // A/B test: kampanyaya bağlı şablonlardan rastgele birini seç
        dbSablonlar = (await pool.query(
          "SELECT * FROM satis_bot_sablonlar WHERE aktif = true AND kampanya_id = $1 ORDER BY RANDOM() LIMIT 1",
          [kampanya.id]
        )).rows;
      }
      // Kampanya şablonu yoksa kategori veya genel şablonlara düş
      if (!dbSablonlar || dbSablonlar.length === 0) {
        dbSablonlar = (await pool.query(
          "SELECT * FROM satis_bot_sablonlar WHERE aktif = true AND kampanya_id IS NULL AND (kategori = $1 OR kategori = 'genel') ORDER BY RANDOM() LIMIT 1",
          [kategori || 'genel']
        )).rows;
      }
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

    // Numaranın WhatsApp'ta olduğunu ÖN KONTROL ET — gerçek hedef JID'i al
    let jid;
    const numaraInfo = ns ? `#${ns.numaraId}` : 'tek';
    try {
      const check = await sock.onWhatsApp(`${telefon}@s.whatsapp.net`);
      if (!check || !check.length || !check[0]?.exists) {
        console.log(`📵 [${numaraInfo}] WP YOK (onWhatsApp=false): ${lead.isletme_adi} (${telefon}) — atlanıyor`);
        await pool.query("UPDATE potansiyel_musteriler SET wp_mesaj_durumu = 'wp_yok' WHERE id = $1", [lead.id]);
        return;
      }
      jid = check[0].jid || `${telefon}@s.whatsapp.net`;
    } catch (e) {
      console.log(`⚠️ [${numaraInfo}] onWhatsApp kontrolü başarısız (${telefon}): ${e.message} — default JID ile devam`);
      jid = `${telefon}@s.whatsapp.net`;
    }

    // Anti-ban: Typing indicator
    try {
      await sock.presenceSubscribe(jid);
      await sock.sendPresenceUpdate('composing', jid);
      const typingMs = (this.ayarlar.typingMinMs || 2000) + Math.random() * ((this.ayarlar.typingMaxMs || 6000) - (this.ayarlar.typingMinMs || 2000));
      await new Promise(r => setTimeout(r, typingMs));
      await sock.sendPresenceUpdate('paused', jid);
    } catch (e) { /* presence hataları önemsiz */ }

    // Mesaj gönder
    try {
      if (!sock?.user) {
        throw new Error('Socket bağlı değil — mesaj gönderilemez');
      }

      const sent = await sock.sendMessage(jid, { text: mesaj });
      if (!sent?.key?.id) {
        throw new Error('sendMessage boş response döndü (mesaj gönderilmemiş olabilir)');
      }

      // Retry store'a kaydet (5dk sonra temizle)
      if (sent.message) {
        this.msgStore.set(sent.key.id, sent.message);
        setTimeout(() => this.msgStore.delete(sent.key.id), 5 * 60 * 1000);
      }

      const kampInfo = kampanya ? ` [${kampanya.isim}]` : '';
      console.log(`✅ [${numaraInfo}]${kampInfo} Mesaj gönderildi: ${lead.isletme_adi} (${telefon}) [${kategori}] skor:${lead.skor} msgId=${sent.key.id}`);

      // Tanıtım videosunu .mp4 olarak doğrudan sohbete gönder
      await this._tanitimVideosuGonder(sock, jid, kategori, numaraInfo);

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

  // Tanıtım videosunu .mp4 olarak doğrudan WhatsApp sohbetine gönder (link yerine medya)
  async _tanitimVideosuGonder(sock, jid, kategori, numaraTag) {
    try {
      const videoFile = TANITIM_VIDEOLARI[kategori] || TANITIM_VIDEOLARI.default;
      const videoPath = path.join(__dirname, '../../public/videos', videoFile);
      
      // Sektöre özel video yoksa genel videoyu dene
      let finalPath = videoPath;
      if (!fs.existsSync(finalPath)) {
        finalPath = path.join(__dirname, '../../public/videos', TANITIM_VIDEOLARI.default);
      }
      
      if (!fs.existsSync(finalPath)) {
        console.log(`⚠️ [${numaraTag}] Tanıtım videosu bulunamadı: ${videoFile} (public/videos/ klasörüne .mp4 ekleyin)`);
        return;
      }

      // 3-5 saniye bekle (mesaj + video arası doğal gecikme)
      await new Promise(r => setTimeout(r, 3000 + Math.random() * 2000));

      const videoBuffer = fs.readFileSync(finalPath);
      await sock.sendMessage(jid, {
        video: videoBuffer,
        mimetype: 'video/mp4',
        caption: 'Sistemin nasıl çalıştığını gösteren kısa tanıtım 👆'
      });
      console.log(`🎬 [${numaraTag}] Tanıtım videosu gönderildi (${videoFile})`);
    } catch (err) {
      console.log(`⚠️ [${numaraTag}] Video gönderme hatası:`, err.message);
    }
  }

  // ═══════════════════════════════════════════════════
  // Sıcak Lead Telegram Bildirim
  // ═══════════════════════════════════════════════════
  async _sicakLeadBildirim(konusma, musteriMesaj) {
    try {
      const telefonGosterim = konusma.telefon ? `+${konusma.telefon}` : 'Bilinmiyor';
      const mesaj = `🔥 *SICAK LEAD DÜŞTÜ!*\n\n` +
        `🏪 *İşletme:* ${konusma.isletme_adi || 'Bilinmiyor'}\n` +
        `📞 *Telefon:* ${telefonGosterim}\n` +
        `🏷️ *Kategori:* ${konusma.kategori || '-'}\n` +
        `💬 *Son mesajı:* "${musteriMesaj}"\n\n` +
        `⏰ *Zaman:* ${turkiyeSaati().toLocaleString('tr-TR')}\n\n` +
        `👉 *Hemen ara ve kapat!*`;

      await this._telegramBildirimGonder(mesaj);
      console.log(`🔥 Sıcak lead Telegram bildirimi gönderildi: ${konusma.isletme_adi} (${telefonGosterim})`);
    } catch (err) {
      console.log(`⚠️ Telegram bildirim hatası:`, err.message);
    }
  }

  async _telegramBildirimGonder(mesaj) {
    const botToken = process.env.TELEGRAM_SATIS_BOT_TOKEN || process.env.SATIS_TELEGRAM_BOT_TOKEN;
    const chatId = process.env.SATIS_TELEGRAM_CHAT_ID;
    if (!botToken || !chatId) {
      console.log('⚠️ Telegram bildirim ayarları eksik (SATIS_TELEGRAM_CHAT_ID env ekle)');
      return;
    }
    await axios.post(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      chat_id: chatId,
      text: mesaj,
      parse_mode: 'Markdown'
    }, { timeout: 10000 });
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

    // Olumsuz konuşma — müşteri red etmişse bir daha yazma
    if (konusma.durum === 'olumsuz') {
      console.log(`🚫 Olumsuz konuşma, cevap verilmiyor: ${telefon}`);
      return;
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
      const vedaMesaj = 'Tamam, sorun değil. Fikrin değişirse buradan yazabilirsin. İyi çalışmalar 🙏';
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
        // 🔥 Sıcak lead — Telegram bildirim gönder
        if (fallback.durum === 'sicak') {
          this._sicakLeadBildirim(konusma, metin);
        }
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
      try {
        console.log(`📤 sendMessage başlıyor: jid=${remoteJid}, text=${aiCevap.mesaj.slice(0, 30)}...`);
        const sentReply = await sock.sendMessage(remoteJid, { text: aiCevap.mesaj });
        console.log(`💬 Satış Bot cevap gönderdi: ${telefon} → "${aiCevap.mesaj.slice(0, 60)}..." msgId=${sentReply?.key?.id || 'YOK'} status=${sentReply?.status || 'bilinmiyor'}`);
        if (sentReply?.message) {
          this.msgStore.set(sentReply.key.id, sentReply.message);
          setTimeout(() => this.msgStore.delete(sentReply.key.id), 5 * 60 * 1000);
        }
      } catch (sendErr) {
        console.error(`❌ CEVAP GÖNDERME HATASI: ${telefon} → ${sendErr.message}`, sendErr.stack?.split('\n').slice(0, 3).join(' | '));
      }

      // Konuşma kaydını güncelle
      await pool.query(
        "UPDATE satis_konusmalar SET gelen_mesajlar = COALESCE(gelen_mesajlar, '') || $1, durum = $2 WHERE id = $3",
        [`\n[${turkiyeSaati().toLocaleTimeString('tr-TR')}] Bot: ${aiCevap.mesaj}`, aiCevap.durum || 'ai_devrede', konusma.id]
      );

      // Lead durumunu güncelle
      if (aiCevap.durum === 'sicak' || aiCevap.durum === 'olumlu') {
        await pool.query("UPDATE potansiyel_musteriler SET durum = 'ilgileniyor' WHERE id = $1", [konusma.lead_id]);
        if (konusma.sablon_id) { try { await pool.query('UPDATE satis_bot_sablonlar SET olumlu = olumlu + 1 WHERE id = $1', [konusma.sablon_id]); } catch(e) {} }
        // 🔥 Sıcak lead — Telegram bildirim gönder
        if (aiCevap.durum === 'sicak') {
          this._sicakLeadBildirim(konusma, metin);
        }
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

    // ─── RED / OLUMSUZ ───
    const redKelimeler = ['hayır', 'hayir', 'istemiyorum', 'istemiyoruz', 'gerek yok', 'ilgilenmiyorum', 'ilgilenmiyoruz',
      'boş ver', 'bos ver', 'rahatsız etmeyin', 'spam', 'yazma', 'yazmayın', 'yazmayin',
      'beni arama', 'aramayın', 'aramayin', 'mesaj atma', 'engel', 'darlamayın', 'darlama',
      'ilgilenmem', 'istemem', 'yok teşekkürler', 'teşekkür ederim gerek yok', 'sağol gerek yok',
      'şu an ilgilenmiyorum', 'şimdilik gerek yok', 'şimdilik istemiyorum'];
    if (redKelimeler.some(k => mesajLower.includes(k))) {
      return {
        mesaj: `Tamam, sorun değil. Fikrin değişirse buradan yazabilirsin. İyi çalışmalar 🙏`,
        durum: 'olumsuz'
      };
    }

    // ─── KİBAR RED (ben ararım / düşüneyim / dönerim) ───
    const kibarRedKelimeler = ['ben dönerim', 'ben döneceğim', 'ben donerim', 'ben ararım', 'ben ararim',
      'sizi ararız', 'biz ararız', 'gerekirse ararız', 'gerekirse döneriz',
      'düşüneyim', 'dusuneyim', 'düşüneceğim', 'sonra bakarım', 'sonra bakarim',
      'bi düşüneyim', 'bakayım', 'bakalım', 'sonra'];
    if (kibarRedKelimeler.some(k => mesajLower.includes(k))) {
      return {
        mesaj: `Tabi düşün. Demo linki bırakıyorum, vaktin olunca 2 dk bakarsın 👉 sirago.com`,
        durum: 'bekliyor'
      };
    }

    // ─── FİYAT SORUSU ───
    const fiyatKelimeler = ['fiyat', 'ücret', 'ucret', 'kaç lira', 'kac lira', 'ne kadar', 'para', 'maliyet', 'aylık', 'aylik'];
    if (fiyatKelimeler.some(k => mesajLower.includes(k))) {
      return {
        mesaj: `İlk ay sıfır lira. Sonrası günde 10₺. Bir müşteri kaçırmak bundan pahalı.`,
        durum: 'sicak'
      };
    }

    // ─── PAHALI İTİRAZI ───
    const pahaliKelimeler = ['pahalı', 'pahali', 'çok para', 'cok para', 'param yok', 'bütçe', 'butce', 'ekonomi', 'karşılayamam'];
    if (pahaliKelimeler.some(k => mesajLower.includes(k))) {
      return {
        mesaj: `Günde 1 müşteri kaçırmak ayda 3000₺ kayıp. Sistem ayda 299₺. Kendini 3 günde amorti ediyor.`,
        durum: 'olumlu'
      };
    }

    // ─── TEKNOLOJİ İTİRAZI ───
    const teknolojiKelimeler = ['bilmem', 'anlamam', 'teknoloji', 'bilgisayar', 'zor', 'yapamam', 'kurulum', 'anlamıyorum'];
    if (teknolojiKelimeler.some(k => mesajLower.includes(k))) {
      return {
        mesaj: `WhatsApp kullanıyorsan yeterli. Biz kuruyoruz, sen sadece telefondan bakıyorsun. 5 dakika.`,
        durum: 'olumlu'
      };
    }

    // ─── TELEFONLA HALLEDİYORUM İTİRAZI ───
    const telefonKelimeler = ['telefonla', 'zaten yapıyoruz', 'zaten yapiyoruz', 'hallediyoruz', 'hallediyorum', 'gerek duymuyoruz', 'ihtiyacımız yok'];
    if (telefonKelimeler.some(k => mesajLower.includes(k))) {
      return {
        mesaj: `Telefonla hallediyorsun ama müşteri işlemdeyken çalan telefona bakamıyorsun. O arayan rakibe gidiyor.`,
        durum: 'olumlu'
      };
    }

    // ─── MÜSAİT DEĞİLİM ───
    const musaitKelimeler = ['müsait değilim', 'musait degilim', 'meşgulüm', 'mesgulum', 'yoğunum', 'yogunum', 'şimdi olmaz', 'sonra yaz'];
    if (musaitKelimeler.some(k => mesajLower.includes(k))) {
      return {
        mesaj: `Tamam, link bırakıyorum. İstediğin zaman 2 dakikada aktif 👉 sirago.com`,
        durum: 'bekliyor'
      };
    }

    // ─── MERAK / BİLGİ ───
    const merakKelimeler = ['nedir', 'nasıl', 'nasil', 'açıkla', 'acikla', 'detay', 'bilgi', 'anlat', 'ne yapıyor', 'ne yapiyor', 'özellik'];
    if (merakKelimeler.some(k => mesajLower.includes(k))) {
      return {
        mesaj: `Müşterilerin WhatsApp'tan 7/24 randevu alıyor, otomatik hatırlatma gidiyor. ${ad} için ilk ay ücretsiz 👉 sirago.com`,
        durum: 'sicak'
      };
    }

    // ─── OLUMLU / İLGİ ───
    const olumluKelimeler = ['tamam', 'olur', 'evet', 'ilgileniyorum', 'deneyelim', 'göster', 'goster', 'demo', 'denerim', 'deneyim', 'kuralım', 'kuralim', 'başlayalım', 'baslayalim', 'süper', 'harika', 'güzel'];
    if (olumluKelimeler.some(k => mesajLower.includes(k))) {
      return {
        mesaj: `Süper! sirago.com'a gir, 2 dakikada aktif. İlk ay ücretsiz. Kurulumda takılırsan yaz 👍`,
        durum: 'sicak'
      };
    }

    // ─── SELAM ───
    const selamKelimeler = ['merhaba', 'selam', 'selamlar', 'merhabalar', 'iyi günler', 'gunaydin', 'günaydın'];
    if (selamKelimeler.some(k => mesajLower.includes(k))) {
      return {
        mesaj: `Selam! ${ad} için randevu sistemi hakkında yazmıştım. Müşterilerin WhatsApp'tan randevu alsın, ilk ay ücretsiz. Bakmak ister misin?`,
        durum: 'bekliyor'
      };
    }

    // ─── GENEL ───
    return {
      mesaj: `Teşekkürler! Merak ettiğin olursa yaz, link burada 👉 sirago.com`,
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

    const prompt = `Sen SıraGO satış asistanısın. Esnafla WhatsApp'tan konuşuyorsun. Gerçek bir insan gibi yaz.

═══ İŞLETME ═══
${konusma.isletme_adi} (${konusma.kategori})

═══ PAKETLER ═══
${paketBilgiStr}
İlk ay tamamen ücretsiz — kart bilgisi yok, 2 dakikada kurulum.

═══ KONUŞMA ═══
İlk mesajımız: ${konusma.gonderilen_mesaj?.slice(0, 200)}
Geçmiş: ${konusmaGecmisi.slice(-800)}
MÜŞTERİ SON MESAJ: "${musteriMesaj}"
Mesaj sayısı: ${mesajSayisi}

═══ İTİRAZ KIRICI HAZIR CEVAPLAR (BİREBİR KULLAN) ═══
"Fiyatı ne / ne kadar" → "İlk ay sıfır lira. Sonrası günde 10₺. Bir müşteri kaçırmak bundan pahalı."
"Telefonla hallediyorum" → "Telefonla hallediyorsun ama müşteri işlemdeyken çalan telefona bakamıyorsun. O arayan rakibe gidiyor."
"Teknoloji bilmem" → "WhatsApp kullanıyorsan yeterli. Biz kuruyoruz, sen sadece telefondan bakıyorsun. 5 dakika."
"Düşüneyim / sonra bakarım" → "Tabi düşün. Demo linki bırakıyorum, vaktin olunca 2 dk bakarsın 👉 sirago.com"
"Pahalı / param yok" → "Günde 1 müşteri kaçırmak ayda 3000₺ kayıp. Sistem ayda 299₺. Kendini 3 günde amorti ediyor."
"Şimdi müsait değilim / meşgulüm" → "Tamam, link bırakıyorum. İstediğin zaman 2 dakikada aktif 👉 sirago.com"
"Hayır / istemiyorum / gerek yok" → Kibarca veda et, ISRAR ETME: "Tamam, sorun değil. Fikrin değişirse buradan yazabilirsin. İyi çalışmalar 🙏"
"Arayın / ben dönerim / ben ararım" → Bu KİBAR REDDİR: "Tamam, link bırakıyorum lazım olursa 👉 sirago.com. İyi çalışmalar!"

═══ SATIŞ STRATEJİN ═══
1. İlgi varsa → tek fayda söyle + "kayıt yaz veya sirago.com'a gir" de
2. Soru varsa → kısa cevap ver, 1-2 cümle
3. İtiraz gelirse → yukarıdaki hazır cevapları BİREBİR kullan
4. ${mesajSayisi} > 3 ve karar vermemişse → "Link bırakıyorum, vaktin olunca bakarsın 👉 sirago.com" yaz ve bırak
5. Müşteri reddettiyse → kibarca veda et, bir daha yazma

═══ HANDOFF (DEVRETME) KURALI — ÇOK ÖNEMLİ ═══
Müşteri aşağıdakilerden birini derse durum'u "sicak" yap:
- Fiyat sorusu: "ne kadar", "fiyatı ne", "ücret"
- İlgi: "nasıl çalışıyor", "anlat", "göster", "demo", "video"
- Olumlu sinyal: "ilgileniyorum", "deneyelim", "kuralım", "başlayalım", "tamam"
- Paket sorusu: "paket", "karşılaştır", "fark ne"
Bu durumda KISA bir cevap yaz + durum'u "sicak" olarak dön. Biz aranıp devam edeceğiz.

═══ KESİN KURALLAR ═══
- ASLA 2 CÜMLEDEN UZUN CEVAP VERME. Bu en önemli kural. 2 cümle = HARD LİMİT.
- Tek seferde tek mesaj yaz, maddeli liste YAPMA, paragraf YAPMA.
- Emoji max 1, abartma.
- Samimi ol — esnaf gibi konuş, "siz" değil "sen" de.
- Kayıt linki: sirago.com. ASLA "admin.sirago.com" yazma.
- ASLA "yapay zeka" veya "bot" olduğunu söyleme.
- Uzun özellik listesi DÖKME. Tek fayda söyle, bitir.
- Fiyat/itiraz gelirse HAZIR cevapları BİREBİR kullan, kendinden cümle KURMA.
- "minimize eder", "optimize eder", "entegre" gibi kurumsal kelimeler YASAK.

CEVABINI SADECE ŞU JSON FORMATINDA VER:
{"mesaj": "müşteriye gönderilecek mesaj", "durum": "olumlu" veya "olumsuz" veya "bekliyor" veya "sicak"}`;

    try {
      const response = await axios.post('https://api.deepseek.com/chat/completions', {
        model: 'deepseek-chat',
        messages: [
          { role: 'system', content: 'Sen SıraGO satış asistanısın. Esnafla WhatsApp\'tan konuşuyorsun. ASLA 2 cümleden uzun yazma — bu en önemli kural. Kurumsal dil ve paragraf YASAK. Esnaf kısa mesaj okur. Müşteri reddetmişse ISRAR ETME. Sadece JSON formatında yanıt ver.' },
          { role: 'user', content: prompt }
        ],
        temperature: 0.5,
        max_tokens: 250
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
    const [gonderilen, bekleyen, olumlu, olumsuz, wpYok, sicak] = await Promise.all([
      pool.query("SELECT COUNT(*) as c FROM potansiyel_musteriler WHERE wp_mesaj_durumu = 'gonderildi'"),
      pool.query("SELECT COUNT(*) as c FROM satis_konusmalar WHERE durum = 'bekliyor'"),
      pool.query("SELECT COUNT(*) as c FROM satis_konusmalar WHERE durum = 'olumlu'"),
      pool.query("SELECT COUNT(*) as c FROM satis_konusmalar WHERE durum = 'olumsuz'"),
      pool.query("SELECT COUNT(*) as c FROM potansiyel_musteriler WHERE wp_mesaj_durumu = 'wp_yok'"),
      pool.query("SELECT COUNT(*) as c FROM satis_konusmalar WHERE durum = 'sicak'"),
    ]);

    return {
      gonderilen: parseInt(gonderilen.rows[0].c),
      bekleyen: parseInt(bekleyen.rows[0].c),
      olumlu: parseInt(olumlu.rows[0].c),
      olumsuz: parseInt(olumsuz.rows[0].c),
      wp_yok: parseInt(wpYok.rows[0].c),
      sicak: parseInt(sicak.rows[0].c),
      gunluk_gonderim: this.gunlukGonderim,
      gunluk_limit: this.ayarlar.gunlukLimit || 80
    };
    } catch (err) {
      console.log('⚠️ İstatistik sorgu hatası (tablo henüz yok olabilir):', err.message);
      return { gonderilen: 0, bekleyen: 0, olumlu: 0, olumsuz: 0, wp_yok: 0, sicak: 0, gunluk_gonderim: this.gunlukGonderim, gunluk_limit: this.ayarlar.gunlukLimit || 80 };
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
