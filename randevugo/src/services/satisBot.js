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
const { DENEME_GUN } = require('../config/deneme');
const { telefonNormalize } = require('../utils/telefon');
const G = DENEME_GUN;
const satisAI = require('./satisAI');

// İlk mesajın sonuna eklenen ret satırı — istemeyen şikâyet etmek yerine "dur" yazsın (ban riskini düşürür)

// Avcı verisinden dürüst kişisel cümle (uydurma yok: yalnız Google puanı/yorum sayısı/site bilgisi)
function kisiselSatir(lead = {}) {
  const puan = parseFloat(lead.puan);
  const yorum = parseInt(lead.yorum_sayisi);
  if (puan >= 4.5 && yorum >= 50) {
    return `\n\nGoogle'da ${String(puan).replace('.', ',')} puan ve ${yorum} yorumunuz var; bu kadar müşterinin randevuyu kendisinin alabilmesi işinizi epey kolaylaştırır.`;
  }
  if (lead.web_sitesi === null || lead.web_sitesi === '') {
    return `\n\nAyrı bir web sitesine gerek kalmadan size özel bir online randevu sayfası da açılıyor.`;
  }
  return '';
}

// WhatsApp'ta tıklanır link: sırago.com → https://sırago.com (ASCII sirago.com başkasına ait park alanı)
function linkDuzelt(m) {
  return String(m || '')
    .replace(/(https?:\/\/)?(admin\.)?sirago\.com/gi, (x, sema, alt) => `${sema || ''}${alt || ''}sırago.com`)
    .replace(/(^|[^\/\w.])((?:admin\.)?sırago\.com)/g, '$1https://$2');
}

// Türkçe küçük harf + noktalama temizliği; kelime sınırıyla arama için başa/sona boşluk
function sadeMetin(m) {
  return ' ' + String(m || '').toLocaleLowerCase('tr').replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim() + ' ';
}
const ifadeVar = (sade, liste) => liste.some(k => sade.includes(` ${k} `));

// Ret türleri: sert = "yazma/spam/şikâyet" (ban sinyali), kibar = "ben dönerim/düşüneyim", normal = "hayır/gerek yok".
// Kelime sınırıyla bakılır: "hayırlı olsun", "yazmak istiyorum", "neden olmaz" ret SAYILMAZ.
const RED_SERT = ['spam', 'engel', 'engellerim', 'engelleyeceğim', 'engelliyorum', 'şikayet', 'sikayet', 'şikayet ederim',
  'rahatsız etmeyin', 'rahatsiz etmeyin', 'rahatsız etme', 'rahatsiz etme', 'rahatsız ediyorsunuz', 'yazmayın', 'yazmayin',
  'yazma', 'bir daha yazma', 'mesaj atmayın', 'mesaj atmayin', 'mesaj atma', 'darlamayın', 'darlama', 'numaramı silin',
  'numaramı sil', 'listeden çıkarın', 'beni listeden çıkar'];
const RED_SERT_TEK = ['dur', 'durun', 'stop', 'iptal'];          // yalnız kısa mesajda ("dur bi dakika" ret değil)
const RED_KIBAR = ['ben dönerim', 'ben donerim', 'ben döneceğim', 'size dönerim', 'size döneriz', 'ben ararım', 'ben ararim',
  'biz ararız', 'biz arariz', 'sizi ararız', 'sizi ararım', 'gerekirse ararız', 'gerekirse döneriz', 'düşüneyim', 'dusuneyim',
  'düşüneceğim', 'düşünelim', 'düşünürüz', 'sonra bakarım', 'sonra bakarim', 'sonra bakarız', 'şimdilik gerek yok',
  'simdilik gerek yok', 'şimdilik istemiyorum', 'şu an ilgilenmiyorum', 'şuan ilgilenmiyorum', 'su an ilgilenmiyorum',
  'şu an gerek yok', 'şimdilik değil', 'şu an değil', 'müsait değilim', 'musait degilim', 'meşgulüm', 'mesgulum', 'yoğunum', 'yogunum'];
const RED_NORMAL = ['hayır', 'hayir', 'istemiyorum', 'istemiyoruz', 'istemem', 'istemeyiz', 'gerek yok', 'gerekmez',
  'ilgilenmiyorum', 'ilgilenmiyoruz', 'ilgilenmem', 'ilgilenmeyiz', 'yok teşekkürler', 'yok tesekkurler', 'teşekkürler gerek yok',
  'sağol gerek yok', 'sağolun gerek yok', 'ihtiyacımız yok', 'ihtiyacım yok', 'ihtiyacimiz yok', 'kullanmayız', 'boş ver', 'bos ver'];

function redTipi(metin) {
  const sade = sadeMetin(metin);
  const kelime = sade.trim().split(' ').filter(Boolean).length;
  if (ifadeVar(sade, RED_SERT) || (kelime <= 2 && ifadeVar(sade, RED_SERT_TEK))) return 'sert';
  if (ifadeVar(sade, RED_KIBAR)) return 'kibar';
  if (ifadeVar(sade, RED_NORMAL)) return 'normal';
  return null;
}

// Açık niyet: kayıt akışını hemen başlatır
const KAYIT_NIYET = ['kayıt', 'kayit', 'kaydol', 'kayıt ol', 'üye ol', 'uye ol', 'hesap aç', 'hesap ac', 'hesap açalım',
  'hesap acalim', 'kuralım', 'kuralim', 'başlayalım', 'baslayalim', 'deneyelim', 'deneyeyim', 'denemek istiyorum', 'açalım', 'acalim'];
// Yalnız kapanış/nezaket ("teşekkürler", "sağ olun", "kolay gelsin", 👍): buna cevap yazmak
// "biz de teşekkür ederiz" döngüsü yaratıyor, esnaf ısrarcı/bot sanıyor → sessiz kal.
const NEZAKET = /^(çok )?(teşekkür(ler| ederim| ederiz)?|tesekkur(ler| ederim)?|tşk|tsk|tşkler|tskler|sağ ?ol(un|unuz)?|sag ?ol(un)?|eyvallah|eyv|rica ederim|kolay gelsin|iyi çalışmalar|iyi calismalar|hayırlı işler|hayirli isler|size de|siz de|sizede|iyi günler|iyi gunler|iyi akşamlar|iyi aksamlar)( (abi|abla|hocam|kardeşim|kardesim|usta|ustam|efendim))?$/;
function yalnizNezaket(metin) {
  const t = String(metin || '').toLocaleLowerCase('tr-TR')
    .replace(/[\p{Extended_Pictographic}\uFE0F\u200d]/gu, ' ')
    .replace(/[.,!?;:'"()\-]/g, ' ');
  const parcalar = t.split(/\n/).map(x => x.replace(/\s+/g, ' ').trim()).filter(Boolean);
  if (!parcalar.length) return true;   // yalnız emoji (👍🙏)
  return parcalar.every(x => x.split(/ ve | /).length <= 5 && x.split(/ ve /).every(y => NEZAKET.test(y.trim())));
}

const EVET = ['evet', 'tamam', 'olur', 'doğru', 'dogru', 'aynen', 'kalsın', 'kalsin', 'e', 'he', 'evt'];

// Satış konuşmasındaki sektör adı → işletme kategori kodu
const KATEGORI_KOD = { berber: 'berber', 'kuaför': 'kuafor', kuafor: 'kuafor', 'güzellik salonu': 'guzellik', 'tırnak salonu': 'guzellik',
  'diş kliniği': 'disci', veteriner: 'veteriner', diyetisyen: 'diyetisyen', spa: 'spa', 'dövme': 'dovme', psikolog: 'psikolog' };

// ═══════════════════════════════════════════════════
// İlk mesaj şablonları (DB'de şablon yoksa). l = { ad, k } — k: kişisel cümle (boş olabilir)
// Doğrulanamayan iddia ("%80 azalır", "rakipleriniz geçti") YOK; sonunda tek soru: video.
// ═══════════════════════════════════════════════════
// İlk mesaj KISA ve insanca: gerçek bir temsilci önce selam verip doğru kişiye ulaştığını sorar.
// Tanıtımı, kişi cevap verince satış temsilcisi (satisAI) konuşarak yapar. l.k (kişisel satır) burada
// kullanılmaz; uzun ilk mesaj toplu reklam gibi görünür.
const ACILIS_GENEL = [
  (l) => `Merhaba, ${l.ad} ile mi görüşüyorum?`,
  (l) => `Merhabalar, ${l.ad} işletme sahibine ulaştım mı acaba?`,
  (l) => `İyi günler, ${l.ad} için yazıyorum. Randevuları siz mi takip ediyorsunuz?`,
  (l) => `Merhaba 🙂 ${l.ad} randevuları telefondan mı alıyor, yoksa bir sistem kullanıyor musunuz?`,
];
const MESAJ_SABLONLARI = {
  berber: [
    (l) => `Merhaba, ${l.ad} ile mi görüşüyorum?`,
    (l) => `Selamlar, ${l.ad} için yazıyorum. Müşteri koltuktayken gelen randevu telefonlarına nasıl yetişiyorsunuz?`,
    (l) => `Merhaba ustam, ${l.ad} randevuları telefondan mı alıyor?`,
  ],
  'kuaför': [
    (l) => `Merhaba, ${l.ad} ile mi görüşüyorum?`,
    (l) => `Merhabalar, ${l.ad} için yazıyorum. Boya ya da fön yaparken gelen randevu mesajlarına kim bakıyor?`,
    (l) => `İyi günler, ${l.ad} randevuları WhatsApp'tan mı alıyor?`,
  ],
  'güzellik salonu': [
    (l) => `Merhaba, ${l.ad} ile mi görüşüyorum?`,
    (l) => `Merhabalar, ${l.ad} için yazıyorum. Randevuları siz mi ayarlıyorsunuz, yoksa bir sekreteriniz mi var?`,
    (l) => `İyi günler, ${l.ad} randevuları telefondan mı alıyor?`,
  ],
  'diş kliniği': [
    (l) => `Merhaba, ${l.ad} ile mi görüşüyorum?`,
    (l) => `İyi günler, ${l.ad} için yazıyorum. Hasta randevularını kim takip ediyor, sizinle mi görüşmem gerekir?`,
    (l) => `Merhabalar, ${l.ad} online randevu alıyor mu?`,
  ],
  'veteriner': [
    (l) => `Merhaba, ${l.ad} ile mi görüşüyorum?`,
    (l) => `İyi günler, ${l.ad} için yazıyorum. Muayene ve aşı randevularını telefondan mı alıyorsunuz?`,
  ],
  'diyetisyen': [
    (l) => `Merhaba, ${l.ad} ile mi görüşüyorum?`,
    (l) => `İyi günler, danışan randevularınızı WhatsApp'tan mı ayarlıyorsunuz?`,
  ],
  default: ACILIS_GENEL,
};
for (const k of ['dövme', 'spa', 'tırnak salonu']) MESAJ_SABLONLARI[k] = ACILIS_GENEL;
const TAKIP_SABLONLARI = {
  1: [
    (ad) => `Merhaba, yoğunsunuzdur diye tahmin ediyorum. Kısaca: müşterileriniz WhatsApp'tan kendi randevusunu alıyor, hatırlatma otomatik gidiyor. ${G} gün ücretsiz, merak ederseniz yazın.`,
    (ad) => `Tekrar merhaba, ${ad} için yazmıştım. Randevuları otomatik alan bir sistemimiz var, ${G} gün ücretsiz denenebiliyor. Bir sorunuz olursa buradayım.`,
    (ad) => `Merhaba, mesajım arada kaybolmuş olabilir. ${ad} için online randevu sistemini göstermek isterim, uygun olunca yazmanız yeterli.`,
  ],
  2: [
    (ad) => `Son kez rahatsız ediyorum. Denemek isterseniz *kayıt* yazmanız yeterli, ${G} gün ücretsiz. İlgilenmiyorsanız hiç sorun değil, iyi çalışmalar.`,
    (ad) => `Son bir not bırakayım: ${ad} için ${G} günlük ücretsiz deneme hâlâ açık, *kayıt* yazarsanız hesabı buradan açarım. Kolay gelsin.`,
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
    // Otomatik fren: numara çıkışı/ban, günlük olumsuz cevap eşiği, art arda aynı hata → gönderim durur
    this.fren = null; // { sebep, mesaj, zaman }
    this._sonHata = { mesaj: null, sayi: 0 };
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
      frenSertRedLimit: 3,   // günde bundan fazla sert ret ("yazma", "spam", "şikayet") gelirse gönderim durur
      frenOlumsuzMin: 8,     // ya da günde en az bu kadar olumsuz VE
      frenOlumsuzOran: 0.25, // bugün gönderilenlerin bu oranından fazlası olumsuzsa durur
      frenAyniHata: 3,       // aynı gönderim hatası art arda bu kadar tekrar ederse gönderim durur
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
            console.log(`📨 [#${numaraId}] Mesaj alındı (uzunluk=${(text || '').length})`); // metin loglanmaz: kayıt şifresi içerebilir
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

      if (connection === 'close') { if (global.__kapaniyor) return; // kapanırken yeniden bağlanma (deploy çakışması)
        const statusCode = lastDisconnect?.error?.output?.statusCode;
        const errorMsg = lastDisconnect?.error?.message || '';
        console.log(`❌ [#${numaraId}] Bağlantı kapandı - kod: ${statusCode}, hata: ${errorMsg}`);

        if (statusCode === 440) {
          // Oturum başka yerde açık (deploy sırasında eski sunucu). Eskisi kapanınca geri bağlan.
          ns.sock = null;
          ns.durum = 'kapali';
          ns.cakisma = (ns.cakisma || 0) + 1;
          clearTimeout(ns._reconnectTimer);
          ns._reconnectTimer = setTimeout(() => this.numaraBaslat(numaraId), Math.min(60000 * ns.cakisma, 5 * 60000));
          this._senkronEt();
          return;
        }

        if (statusCode === DisconnectReason.restartRequired || statusCode === 515) {
          ns.durum = 'kapali';
          ns.sock = null;
          ns._reconnectTimer = setTimeout(() => this.numaraBaslat(numaraId), 1500);
        } else if (statusCode === DisconnectReason.loggedOut || statusCode === 403) {
          ns.durum = 'kapali';
          ns.qrBase64 = null;
          ns.sock = null;
          // Numara çıkış yaptırıldı ya da yasaklandı: kalan numaralarla gönderime devam etmek de riskli
          this._frenle('numara_cikis', `Numara #${numaraId} WhatsApp oturumu kapandı (kod ${statusCode}) — ban olabilir.`);
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
    if (connection === 'close') { if (global.__kapaniyor) return; // kapanırken yeniden bağlanma (deploy çakışması)
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
    const mesaj = linkDuzelt(sablon(konusma.isletme_adi || 'işletmeniz'));

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
      fren: this.fren,
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
  // Gönderimi durdurur, sebebi kaydeder (audit_log → Venüs uyarısı) ve Telegram'a bildirir.
  // Yeniden başlatmak elle yapılır (panel ya da Venüs onayıyla); başlatınca fren kalkar.
  async _frenle(sebep, mesaj) {
    if (this.fren || !this.aktif) return;
    this.gonderimDurdur();
    this.fren = { sebep, mesaj, zaman: new Date().toISOString() };
    console.log(`🛑 Satış Bot otomatik fren: ${mesaj}`);
    try {
      await pool.query("INSERT INTO audit_log (kullanici_email, islem, detay) VALUES ('sistem', 'satis_bot_fren', $1)",
        [JSON.stringify(this.fren)]);
    } catch (e) { /* log tablosu yoksa geç */ }
    try { await this._telegramBildirimGonder(`🛑 *Satış botu durdu (otomatik fren)*\n\n${mesaj}\n\nKontrol edip panelden yeniden başlatın.`); } catch (e) {}
  }

  // Bugünkü ret sayıları ve bugün açılan (bizim yazdığımız) konuşma sayısı
  async _redBugun() {
    let r = {};
    try {
    r = (await pool.query(`
      SELECT
        COUNT(*) FILTER (WHERE durum = 'olumsuz' AND son_mesaj_tarihi::date = (NOW() AT TIME ZONE 'Europe/Istanbul')::date)::int AS olumsuz,
        COUNT(*) FILTER (WHERE durum = 'olumsuz' AND red_tipi = 'sert' AND son_mesaj_tarihi::date = (NOW() AT TIME ZONE 'Europe/Istanbul')::date)::int AS sert,
        COUNT(*) FILTER (WHERE olusturma_tarihi::date = (NOW() AT TIME ZONE 'Europe/Istanbul')::date AND gonderilen_mesaj <> 'Müşteri kendisi yazdı')::int AS gonderilen
      FROM satis_konusmalar`)).rows[0] || {};
    } catch (e) { console.log('⚠️ Ret sayımı okunamadı (fren bu tur atlandı):', e.message); }
    return { olumsuz: r.olumsuz || 0, sert: r.sert || 0, gonderilen: r.gonderilen || 0 };
  }

  async gonderimBaslat() {
    if (this.durum !== 'bagli') return { hata: 'WhatsApp bağlı değil' };
    if (this.aktif) return { hata: 'Zaten çalışıyor' };

    this.fren = null;
    this._sonHata = { mesaj: null, sayi: 0 };
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
      // Fren: sert ret (şikâyet/spam) ban sinyalidir; olumsuz oranı çok yükselirse mesaj/hedef kitle sorunludur
      const red = await this._redBugun();
      const sertLimit = this.ayarlar.frenSertRedLimit ?? 3;
      const oranAsildi = red.olumsuz >= (this.ayarlar.frenOlumsuzMin ?? 8)
        && red.olumsuz > red.gonderilen * (this.ayarlar.frenOlumsuzOran ?? 0.25);
      if (red.sert > sertLimit || oranAsildi) {
        await this._frenle(red.sert > sertLimit ? 'sert_ret' : 'olumsuz_oran',
          red.sert > sertLimit
            ? `Bugün ${red.sert} kişi "yazmayın/spam" dedi (eşik ${sertLimit}) — şikâyet ve ban riski.`
            : `Bugün ${red.olumsuz} olumsuz cevap, ${red.gonderilen} gönderim (oran eşiği %${Math.round((this.ayarlar.frenOlumsuzOran ?? 0.25) * 100)}).`);
        this.numaraTimers.delete(numaraId);
        return;
      }
      // Yumuşak fren: 2 sert ret geldiyse günün kalanında limit yarıya iner
      if (red.sert >= 2 && this.gunlukGonderim >= Math.ceil(this.ayarlar.gunlukLimit / 2)) {
        console.log(`📉 [#${numaraId}] ${red.sert} sert ret — bugünkü limit yarıya indi`);
        this.numaraTimers.set(numaraId, setTimeout(() => this._numaraGonderim(numaraId), 60 * 60 * 1000));
        return;
      }

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
      this._sonHata = { mesaj: null, sayi: 0 };
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
      const hm = String(err.message || err).slice(0, 200);
      this._sonHata = this._sonHata.mesaj === hm ? { mesaj: hm, sayi: this._sonHata.sayi + 1 } : { mesaj: hm, sayi: 1 };
      if (this._sonHata.sayi >= (this.ayarlar.frenAyniHata ?? 3)) {
        await this._frenle('ayni_hata', `Aynı gönderim hatası ${this._sonHata.sayi} kez üst üste: ${hm}`);
        this.numaraTimers.delete(numaraId);
        return;
      }
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
          .replace(/{telefon}/g, lead.telefon || '')
          .replace(/{kisisel}/g, kisiselSatir(lead).trim())
          .replace(/{puan}/g, lead.puan ? String(lead.puan).replace('.', ',') : '')
          .replace(/{yorum_sayisi}/g, lead.yorum_sayisi || '');
        await pool.query('UPDATE satis_bot_sablonlar SET gonderilen = gonderilen + 1 WHERE id = $1', [sablonId]);
      }
    } catch(e) { console.log('DB şablon hatası (fallback):', e.message); }
    if (!mesaj) {
      const sablonlar = MESAJ_SABLONLARI[kategori] || MESAJ_SABLONLARI.default;
      const rastgeleSablon = sablonlar[Math.floor(Math.random() * sablonlar.length)];
      mesaj = rastgeleSablon({ ad: lead.isletme_adi || 'işletmeniz', k: kisiselSatir(lead) });
    }
    mesaj = linkDuzelt(mesaj);

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

      // Tanıtım videosu artık ilk mesajla gitmiyor: tanımadığı numaradan gelen video şikâyet/ban riskini artırıyordu.
      // Video gönderimi tamamen kapalı (kullanıcı kararı 2026-10-08).

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
      throw err; // döngü saysın: aynı hata art arda tekrar ederse otomatik fren
    }
  }

  // Eski uyumluluk: leadeMesajGonder (gelen mesaj cevabı vb. için)
  async leadeMesajGonder(lead, kampanya = null) {
    const ns = this._aktifSock();
    if (!ns) { console.log('⚠️ leadeMesajGonder: bağlı numara yok'); return; }
    return this._numaraMesajGonder(ns, lead, kampanya);
  }

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
  // ═══════════════════════════════════════════════════
  // Yardımcılar: yazma, kayıt
  // ═══════════════════════════════════════════════════
  async _yaz(sock, jid, metin, { yaziyor = true } = {}) {
    const txt = linkDuzelt(metin);
    if (yaziyor && this.ayarlar.typingIndicator !== false) {
      try {
        await sock.sendPresenceUpdate('composing', jid);
        // İnsan gibi: uzun cevap daha uzun yazılır (≈ 25 harf/sn), 1,2–9 sn arası
        const sure = Math.min(9000, 1200 + txt.length * 40) * (0.8 + Math.random() * 0.4);
        await new Promise(r => setTimeout(r, sure));
        await sock.sendPresenceUpdate('paused', jid);
      } catch (e) { /* presence önemsiz */ }
    }
    const sent = await sock.sendMessage(jid, { text: txt });
    if (sent?.message) {
      this.msgStore.set(sent.key.id, sent.message);
      setTimeout(() => this.msgStore.delete(sent.key.id), 5 * 60 * 1000);
    }
    return txt;
  }

  async _botKaydet(konusmaId, metin, guncelle = {}) {
    const alanlar = ["gelen_mesajlar = COALESCE(gelen_mesajlar, '') || $1"];
    const deger = [`\n[${turkiyeSaati().toLocaleTimeString('tr-TR')}] Bot: ${metin}`];
    for (const [k, v] of Object.entries(guncelle)) { deger.push(v); alanlar.push(`${k} = $${deger.length}`); }
    deger.push(konusmaId);
    await pool.query(`UPDATE satis_konusmalar SET ${alanlar.join(', ')} WHERE id = $${deger.length}`, deger);
  }

  _mdKacis(x) { return String(x ?? '').replace(/([_*`\[])/g, '\\$1'); }

  // Paket fiyatları (10 dk önbellek) — AI talimatı ve yedek cevaplar uydurma rakam kullanmasın
  async _fiyatlar() {
    if (this._fiyatOnbellek && Date.now() - this._fiyatOnbellek.t < 10 * 60 * 1000) return this._fiyatOnbellek;
    let enUcuz = null, liste = '';
    try {
      const { paketleriYukle } = require('../config/paketler');
      const paketler = await paketleriYukle();
      const satirlar = [];
      for (const p of Object.values(paketler)) {
        const fiyat = parseFloat(p.fiyat);
        if (fiyat > 0 && (enUcuz === null || fiyat < enUcuz)) enUcuz = fiyat;
        const oz = [`${p.calisan_limit >= 999 ? 'sınırsız' : p.calisan_limit} çalışan`,
          `aylık ${p.aylik_randevu_limit >= 9999 ? 'sınırsız' : p.aylik_randevu_limit} randevu`];
        if (p.bot_aktif) oz.push('WhatsApp botu');
        if (p.hatirlatma) oz.push('otomatik hatırlatma');
        satirlar.push(`- ${p.isim}: ${fiyat}₺/ay (${oz.join(', ')})`);
      }
      liste = satirlar.join('\n');
    } catch (e) { /* paket tablosu okunamazsa fiyat söylenmez */ }
    this._fiyatOnbellek = { t: Date.now(), enUcuz, liste };
    return this._fiyatOnbellek;
  }

  // Kayıt durumu deploy/yeniden başlatmada kaybolmasın (şifre ASLA saklanmaz)
  async _kayitDurumKaydet(telefon, d) {
    try {
      await pool.query(
        `UPDATE satis_konusmalar SET kayit_durum = $1
         WHERE id = (SELECT id FROM satis_konusmalar WHERE telefon = $2 ORDER BY olusturma_tarihi DESC LIMIT 1)`,
        [d ? JSON.stringify({ adim: d.adim, onerilenAd: d.onerilenAd || null, isletmeAdi: d.isletmeAdi || null,
          email: d.email || null, kategori: d.kategori || null, t: Date.now() }) : null, telefon]);
    } catch (e) { /* kolon yoksa bellekte devam */ }
  }

  async _kayitDurumYukle(telefon) {
    try {
      const r = (await pool.query(
        "SELECT kayit_durum FROM satis_konusmalar WHERE telefon = $1 AND kayit_durum IS NOT NULL ORDER BY olusturma_tarihi DESC LIMIT 1",
        [telefon])).rows[0];
      const d = typeof r?.kayit_durum === 'string' ? JSON.parse(r.kayit_durum) : r?.kayit_durum;
      if (d && Date.now() - (d.t || 0) < 24 * 3600 * 1000) return d;
    } catch (e) { /* yok say */ }
    return null;
  }

  async _kayitBaslat(remoteJid, telefon, sock, konusma) {
    const onerilenAd = konusma && konusma.gonderilen_mesaj !== 'Müşteri kendisi yazdı' ? konusma.isletme_adi : null;
    const d = { adim: 'isletme_adi', onerilenAd, kategori: konusma?.kategori || null };
    this.konusmalar[telefon] = { ...(this.konusmalar[telefon] || {}), kayit: d };
    await this._kayitDurumKaydet(telefon, d);
    const giris = `Harika, hesabınızı hemen açalım: ${DENEME_GUN} gün ücretsiz, kart bilgisi istemiyoruz.`;
    const txt = onerilenAd
      ? `${giris}\n\nİşletme adı *${onerilenAd}* olarak kalsın mı? Doğruysa *evet* yazın, değilse doğru adı yazın.`
      : `${giris}\n\nİşletmenizin adını yazın:`;
    await this._yaz(sock, remoteJid, txt);
    if (konusma?.id) { try { await this._botKaydet(konusma.id, txt, { durum: 'kayit' }); } catch (e) {} }
  }

  async kayitAkisi(remoteJid, telefon, metin, sock) {
    const d = this.konusmalar[telefon]?.kayit;
    if (!d) return false;
    const yaz = (txt) => this._yaz(sock || this.sock, remoteJid, txt);
    const ham = String(metin || '').trim();
    const sade = sadeMetin(ham);

    if (ifadeVar(sade, ['iptal', 'vazgeç', 'vazgec', 'vazgeçtim'])) {
      delete this.konusmalar[telefon].kayit;
      await this._kayitDurumKaydet(telefon, null);
      await yaz(`Tamam, kaydı durdurdum. İstediğiniz zaman *kayıt* yazarak devam edebilirsiniz.`);
      return true;
    }

    if (d.adim === 'isletme_adi') {
      let ad = null;
      if (d.onerilenAd && ifadeVar(sade, EVET) && sade.trim().split(' ').length <= 3) ad = d.onerilenAd;
      else if (ham.length >= 2 && ham.length <= 100 && !(ifadeVar(sade, EVET) && sade.trim().split(' ').length <= 2)) ad = ham;
      if (!ad) { await yaz(`İşletmenizin adını yazar mısınız? (Kaydı bırakmak için *iptal*)`); return true; }
      d.isletmeAdi = ad; d.adim = 'email';
      await this._kayitDurumKaydet(telefon, d);
      await yaz(`👍 *${ad}*\n\nPanele giriş için *e-posta adresinizi* yazın:`);
      return true;
    }

    if (d.adim === 'email') {
      const email = ham.toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 150) {
        await yaz(`Bu bir e-posta adresine benzemiyor. Örnek: isim@gmail.com\n(Kaydı bırakmak için *iptal*)`);
        return true;
      }
      const mevcut = (await pool.query('SELECT id FROM admin_kullanicilar WHERE LOWER(email) = $1', [email])).rows[0];
      if (mevcut) {
        await yaz(`Bu e-postayla zaten bir hesap var; https://admin.sırago.com adresinden giriş yapabilirsiniz. Şifrenizi hatırlamıyorsanız buraya yazın, yardımcı olalım.\n\nYeni hesap için farklı bir e-posta yazabilirsiniz.`);
        return true;
      }
      d.email = email; d.adim = 'sifre';
      await this._kayitDurumKaydet(telefon, d);
      await yaz(`Son adım: panel için bir *şifre* belirleyin (en az 6 karakter):`);
      return true;
    }

    if (d.adim === 'sifre') {
      if (ham.length < 6 || ham.length > 72) {
        await yaz(`Şifre 6 ile 72 karakter arasında olmalı. Tekrar yazar mısınız?`);
        return true;
      }
      if (!d.isletmeAdi || !d.email) {          // yeniden başlatmada eksik kalmışsa baştan al
        d.adim = d.isletmeAdi ? 'email' : 'isletme_adi';
        await this._kayitDurumKaydet(telefon, d);
        await yaz(d.isletmeAdi ? `E-posta adresinizi tekrar yazar mısınız?` : `İşletmenizin adını tekrar yazar mısınız?`);
        return true;
      }
      return this._hesapOlustur(remoteJid, telefon, ham, d, yaz);
    }
    return false;
  }

  async _hesapOlustur(remoteJid, telefon, sifre, d, yaz) {
    let isletme = null;
    let demodan = false;
    try {
      const bcrypt = require('bcryptjs');
      const tel = telefonNormalize(telefon) || telefon;
      const kategori = KATEGORI_KOD[String(d.kategori || '').toLocaleLowerCase('tr')] || 'genel';
      // Venüs bu numara için demo hazırladıysa onu sahiplen (hizmetler, link, çalışan hazır)
      demodan = false;
      try {
        isletme = (await pool.query(
          `UPDATE isletmeler SET isim = $1, demo = false, olusturma_tarihi = NOW(), deneme_bitis_tarihi = NOW() + make_interval(days => $3)
           WHERE id = (SELECT id FROM isletmeler WHERE demo = true AND telefon = $2 ORDER BY id DESC LIMIT 1) RETURNING *`,
          [d.isletmeAdi, tel, DENEME_GUN])).rows[0];
        demodan = !!isletme;
      } catch (e) { /* demo kolonu yoksa yeni hesap */ }
      if (!isletme) isletme = (await pool.query(
        `INSERT INTO isletmeler (isim, telefon, kategori, aktif, paket, olusturma_tarihi, deneme_bitis_tarihi)
         VALUES ($1, $2, $3, true, 'baslangic', NOW(), NOW() + make_interval(days => $4)) RETURNING *`,
        [d.isletmeAdi, tel, kategori, DENEME_GUN])).rows[0];
      const hash = await bcrypt.hash(sifre, 10);
      await pool.query(
        `INSERT INTO admin_kullanicilar (isim, email, sifre, rol, isletme_id, aktif) VALUES ($1, $2, $3, 'admin', $4, true)`,
        [d.isletmeAdi, d.email, hash, isletme.id]);

      delete this.konusmalar[telefon].kayit;
      await pool.query(
        `UPDATE satis_konusmalar SET kayit_isletme_id = $1, durum = 'musteri', kayit_durum = NULL
         WHERE id = (SELECT id FROM satis_konusmalar WHERE telefon = $2 ORDER BY olusturma_tarihi DESC LIMIT 1)`,
        [isletme.id, telefon]).catch(() => {});
      await pool.query(
        `UPDATE potansiyel_musteriler SET durum = 'musteri'
         WHERE id = (SELECT lead_id FROM satis_konusmalar WHERE telefon = $1 AND lead_id IS NOT NULL ORDER BY olusturma_tarihi DESC LIMIT 1)`,
        [telefon]).catch(() => {});
      console.log(`🎉 WhatsApp kaydı: ${d.isletmeAdi} (isletme_id ${isletme.id})`);

      await yaz(
        `🎉 Hesabınız hazır! ${DENEME_GUN} gün ücretsiz deneyebilirsiniz, kart bilgisi istemiyoruz.\n\n` +
        `Giriş: https://admin.sırago.com\nE-posta: ${d.email}\n\n` +
        `İlk 3 adım (10 dakika):\n1. Hizmetlerinizi ve çalışanlarınızı ekleyin\n2. WhatsApp botunu bağlayın (QR okutmanız yeterli)\n3. Randevu linkinizi müşterilerinize gönderin\n\n` +
        `Takıldığınız yerde buraya yazın, birlikte kuralım. Güvenliğiniz için şifrenizi yazdığınız mesajı silebilirsiniz.`);
      try {
        await this._telegramBildirimGonder(
          `🎉 *WhatsApp'tan yeni kayıt*\n\n🏪 ${this._mdKacis(d.isletmeAdi)}\n🏷️ ${this._mdKacis(kategori)}\n📞 +${this._mdKacis(tel)}\n📧 ${this._mdKacis(d.email)}\n\n👉 İlk 24 saatte arayıp kurulumu birlikte yapın.`);
      } catch (e) { /* bildirim önemsiz */ }
      return true;
    } catch (err) {
      console.error('❌ WhatsApp kayıt hatası:', err.message);
      if (isletme?.id && !demodan) { try { await pool.query('DELETE FROM isletmeler WHERE id = $1', [isletme.id]); } catch (e) {} }
      if (err.code === '23505') {
        d.adim = 'email'; await this._kayitDurumKaydet(telefon, d);
        await yaz(`Bu e-posta az önce kullanılmış görünüyor. Farklı bir e-posta yazar mısınız?`);
      } else {
        await yaz(`Hesabı açarken bir sorun oldu, ekibimize ilettim; kısa süre içinde size buradan dönüyoruz.`);
        try { await this._telegramBildirimGonder(`⚠️ *WhatsApp kaydı başarısız*\n📞 +${this._mdKacis(telefon)}\n${this._mdKacis(err.message)}`); } catch (e) {}
      }
      return true;
    }
  }

  // ═══════════════════════════════════════════════════
  // Gelen Mesaj İşleme + DeepSeek AI Satış
  // ═══════════════════════════════════════════════════
  // Esnaf çoğu zaman tek düşünceyi birkaç mesajda yazar ("selam" / "fiyat ne" / "nasıl çalışıyo").
  // Her birine ayrı cevap vermek bot gibi durur: son mesajdan 8 sn sonra (en geç 25 sn) hepsine birlikte cevap.
  // Kayıt akışı (ad/e-posta/şifre adımları) beklemeden işlenir.
  async gelenMesajIsle(msg, numaraId) {
    const metin = this._getMsgText(msg);
    if (!metin) return;
    const ns = numaraId ? this.numaraSockets.get(numaraId) : null;
    const sock = ns?.sock || this.sock;
    try { await sock?.readMessages?.([msg.key]); } catch (e) { /* okundu önemsiz */ }
    const anahtar = msg.key.remoteJid;
    const alt = msg.key.remoteJidAlt || '';
    const telefon = (anahtar.endsWith('@lid') && alt.includes('@s.whatsapp.net') ? alt : anahtar).replace(/@.*$/, '');
    const kayitIstegi = /^\s*kay[ıi]t\s*$/i.test(metin);
    if (this.konusmalar[telefon]?.kayit || kayitIstegi || this.ayarlar.mesajBirlestir === false) return this._mesajIsle(msg, numaraId, metin);

    this._tampon = this._tampon || new Map();
    const t = this._tampon.get(anahtar) || { metinler: [], ilk: Date.now(), zaman: null };
    t.metinler.push(metin); t.msg = msg; t.numaraId = numaraId;
    clearTimeout(t.zaman);
    const bekle = Date.now() - t.ilk > 17000 ? 0 : (this.ayarlar.mesajBekleMs ?? 8000);
    t.zaman = setTimeout(() => {
      this._tampon.delete(anahtar);
      this._mesajIsle(t.msg, t.numaraId, t.metinler.join('\n')).catch(e => console.error('Satış mesajı işlenemedi:', e.message));
    }, bekle);
    this._tampon.set(anahtar, t);
  }

  async _mesajIsle(msg, numaraId, birlesikMetin) {
    const metin = birlesikMetin ?? this._getMsgText(msg);
    if (!metin) return;

    // Hangi socket'ten geldi? Cevap aynı numaradan gitsin
    const ns = numaraId ? this.numaraSockets.get(numaraId) : null;
    const sock = ns?.sock || this.sock;
    if (!sock) return;

    const remoteJid = msg.key.remoteJid;
    // WhatsApp Business LID desteği: @lid JID'lerde gerçek numara remoteJidAlt'ta
    const altJid = msg.key.remoteJidAlt || '';
    let telefon;
    if (remoteJid.endsWith('@lid') && altJid.includes('@s.whatsapp.net')) {
      telefon = altJid.replace('@s.whatsapp.net', '');
    } else {
      telefon = remoteJid.replace('@s.whatsapp.net', '').replace('@c.us', '');
    }
    console.log(`📩 [#${numaraId || 'tek'}] Satış Bot cevap aldı: …${String(telefon).slice(-4)} (uzunluk=${(metin || '').length})`);

    if (this.ayarlar.mod === 'kapali') return;

    // ─── Kayıt akışı devam ediyorsa (bellekte ya da DB'de) ───
    if (!this.konusmalar[telefon]) this.konusmalar[telefon] = {};
    if (!this.konusmalar[telefon].kayit && this.ayarlar.kayitAktif) {
      const d = await this._kayitDurumYukle(telefon);
      if (d) this.konusmalar[telefon].kayit = d;
    }
    if (this.konusmalar[telefon].kayit && this.ayarlar.kayitAktif) {
      const handled = await this.kayitAkisi(remoteJid, telefon, metin, sock);
      if (handled) return;
    }

    // ─── Konuşma kaydını bul (yoksa oluştur) ───
    let konusma = (await pool.query(
      "SELECT * FROM satis_konusmalar WHERE telefon = $1 OR telefon = $2 OR telefon LIKE $3 ORDER BY (telefon = $1) DESC, olusturma_tarihi DESC LIMIT 1",
      [telefon, '+' + telefon, '%' + telefon.slice(-10)]
    )).rows[0];
    if (!konusma) {
      try {
        konusma = (await pool.query(
          `INSERT INTO satis_konusmalar (telefon, isletme_adi, kategori, gonderilen_mesaj, durum)
           VALUES ($1, $2, 'genel', 'Müşteri kendisi yazdı', 'bekliyor') RETURNING *`,
          [telefon, msg.pushName || 'Müşteri'])).rows[0];
      } catch (dbErr) {
        console.error('❌ Yeni konuşma oluşturma hatası:', dbErr.message);
        return;
      }
    }
    const ilkCevap = konusma.durum === 'bekliyor' && !konusma.gelen_mesajlar;

    // Gelen mesajı kaydet; cevap geldi → takip sekansı durur
    await pool.query(
      "UPDATE satis_konusmalar SET gelen_mesajlar = COALESCE(gelen_mesajlar, '') || $1, son_mesaj_tarihi = (NOW() AT TIME ZONE 'Europe/Istanbul'), durum = CASE WHEN durum = 'bekliyor' THEN 'ai_devrede' ELSE durum END WHERE id = $2",
      [`\n[${turkiyeSaati().toLocaleTimeString('tr-TR')}] Müşteri: ${metin}`, konusma.id]
    );
    if (ilkCevap && konusma.sablon_id) {
      try { await pool.query('UPDATE satis_bot_sablonlar SET cevap_gelen = cevap_gelen + 1 WHERE id = $1', [konusma.sablon_id]); } catch (e) {}
    }

    // ─── Kayıtlı müşteri yazdı → satış değil destek: ekibe ilet ───
    if (konusma.durum === 'musteri') {
      try {
        await this._telegramBildirimGonder(`💬 *Kayıtlı müşteri yazdı* (${this._mdKacis(konusma.isletme_adi)})\n📞 +${this._mdKacis(telefon)}\n"${this._mdKacis(metin.slice(0, 500))}"`);
      } catch (e) {}
      const son = this._destekCevap?.[telefon] || 0;
      if (Date.now() - son > 60 * 60 * 1000) {
        this._destekCevap = { ...(this._destekCevap || {}), [telefon]: Date.now() };
        const txt = `Mesajınızı ekibimize ilettim, en kısa sürede buradan dönüyoruz 🙏`;
        await this._yaz(sock, remoteJid, txt);
        await this._botKaydet(konusma.id, txt);
      }
      return;
    }

    // ─── Açık kayıt niyeti → hemen hesap aç (daha önce "hayır" demiş olsa bile) ───
    if (this.ayarlar.kayitAktif && ifadeVar(sadeMetin(metin), KAYIT_NIYET)) {
      await this._kayitBaslat(remoteJid, telefon, sock, konusma);
      if (konusma.durum !== 'olumsuz' && konusma.sablon_id && !['olumlu', 'sicak'].includes(konusma.durum)) {
        try { await pool.query('UPDATE satis_bot_sablonlar SET olumlu = olumlu + 1 WHERE id = $1', [konusma.sablon_id]); } catch (e) {}
      }
      if (konusma.lead_id) { try { await pool.query("UPDATE potansiyel_musteriler SET durum = 'ilgileniyor' WHERE id = $1", [konusma.lead_id]); } catch (e) {} }
      return;
    }

    // Reddetmiş kişiye bir daha yazılmaz
    if (konusma.durum === 'olumsuz') return;

    // ─── Ret (AI'dan önce, kelime sınırıyla) ───
    const ret = redTipi(metin);
    if (ret) {
      const veda = {
        sert: 'Anlaşıldı, sizi listeden çıkardım; bir daha yazmayacağım. İyi çalışmalar.',
        normal: 'Tamam, sorun değil. Fikriniz değişirse buraya *kayıt* yazmanız yeterli. İyi çalışmalar 🙏',
        kibar: `Tabii, acelesi yok. Vaktiniz olunca bakarsınız: https://sırago.com (${DENEME_GUN} gün ücretsiz). İyi çalışmalar 🙏`,
      }[ret];
      const yeniDurum = ret === 'kibar' ? 'sonra' : 'olumsuz';
      try { await this._yaz(sock, remoteJid, veda); } catch (e) { console.error('Veda gönderilemedi:', e.message); }
      await this._botKaydet(konusma.id, veda, { durum: yeniDurum, red_tipi: ret });
      if (konusma.lead_id && yeniDurum === 'olumsuz') {
        await pool.query("UPDATE potansiyel_musteriler SET durum = 'ilgilenmiyor' WHERE id = $1", [konusma.lead_id]);
      }
      if (konusma.sablon_id && yeniDurum === 'olumsuz') {
        try { await pool.query('UPDATE satis_bot_sablonlar SET olumsuz = olumsuz + 1 WHERE id = $1', [konusma.sablon_id]); } catch (e) {}
      }
      return;
    }

    if (yalnizNezaket(metin)) {
      console.log(`🤝 …${String(telefon).slice(-4)} yalnız teşekkür/kapanış yazdı — cevap verilmedi`);
      return;
    }

    if (this.ayarlar.mod === 'sadece_kayit' || this.ayarlar.mod === 'sadece_satis' || !this.ayarlar.gelenMesajCevap) {
      console.log(`⏸️ Mod: ${this.ayarlar.mod} / cevap ${this.ayarlar.gelenMesajCevap ? 'açık' : 'kapalı'} — mesaj loglandı`);
      return;
    }

    // ─── Cevap: AI (yoksa yedek kurallar) ───
    let cevap = null;
    if (this.ayarlar.aiCevapAktif && satisAI.aktifMi()) {
      const { liste } = await this._fiyatlar();
      const ai = await satisAI.cevapUret({ konusma, paketListesi: liste, sonMesaj: metin });
      if (ai) cevap = { mesajlar: ai.mesajlar, durum: ai.durum, arama: ai.arama_istiyor };
    }
    if (!cevap) {
      const eski = this.ayarlar.aiCevapAktif
        ? await this.deepseekSatisCevabi(metin, konusma)
        : await this.fallbackCevapUret(metin, konusma);
      if (eski?.mesaj) cevap = { mesajlar: [eski.mesaj], durum: eski.durum, arama: false };
    }
    if (!cevap) return;
    // Kişi cevap verdi: AI 'bekliyor' dese de takip sırasına geri düşmesin
    const durum = ['olumlu', 'sicak', 'olumsuz'].includes(cevap.durum) ? cevap.durum : 'ai_devrede';

    const gidenler = [];
    try {
      for (const [i, m] of cevap.mesajlar.entries()) {
        if (i) await new Promise(r => setTimeout(r, 700 + Math.random() * 1300));
        gidenler.push(await this._yaz(sock, remoteJid, m));
      }
    } catch (sendErr) {
      console.error(`❌ Cevap gönderilemedi: …${String(telefon).slice(-4)} → ${sendErr.message}`);
      if (!gidenler.length) return;
    }
    const giden = gidenler.join('\n');
    await this._botKaydet(konusma.id, giden, durum === 'olumsuz' ? { durum, red_tipi: 'normal' } : { durum });
    if (cevap.arama) {
      try {
        await this._telegramBildirimGonder(`📞 *Aranmak istiyor*\n\n🏪 ${this._mdKacis(konusma.isletme_adi)}\n📞 +${this._mdKacis(telefon)}\n💬 "${this._mdKacis(metin.slice(0, 300))}"\n\n👉 Bugün arayın.`);
      } catch (e) { /* bildirim önemsiz */ }
    }

    if (durum === 'sicak' || durum === 'olumlu') {
      if (konusma.lead_id) await pool.query("UPDATE potansiyel_musteriler SET durum = 'ilgileniyor' WHERE id = $1", [konusma.lead_id]);
      if (konusma.sablon_id && !['olumlu', 'sicak'].includes(konusma.durum)) {
        try { await pool.query('UPDATE satis_bot_sablonlar SET olumlu = olumlu + 1 WHERE id = $1', [konusma.sablon_id]); } catch (e) {}
      }
      if (durum === 'sicak' && konusma.durum !== 'sicak') this._sicakLeadBildirim(konusma, metin);
    } else if (durum === 'olumsuz') {
      if (konusma.lead_id) await pool.query("UPDATE potansiyel_musteriler SET durum = 'ilgilenmiyor' WHERE id = $1", [konusma.lead_id]);
      if (konusma.sablon_id) { try { await pool.query('UPDATE satis_bot_sablonlar SET olumsuz = olumsuz + 1 WHERE id = $1', [konusma.sablon_id]); } catch (e) {} }
    }
    // Tanıtım videosu kapalı (kullanıcı kararı 2026-10-08: tanımadığı numaradan video bot gibi duruyor)
  }

  // ─── Yedek cevaplar (AI kapalı/çalışmazsa) — kelime sınırıyla, uydurma rakam yok ───
  async fallbackCevapUret(musteriMesaj, konusma) {
    const sade = sadeMetin(musteriMesaj);
    const { enUcuz } = await this._fiyatlar();
    const fiyat = enUcuz ? `sonrası aylık ${enUcuz}₺'den başlıyor` : 'sonrası için paketleri sitede görebilirsiniz';
    const kayit = `İsterseniz hesabınızı buradan 1 dakikada açayım, *kayıt* yazmanız yeterli.`;
    const ret = redTipi(musteriMesaj);
    if (ret === 'kibar') return { mesaj: `Tabii, acelesi yok. Vaktiniz olunca bakarsınız: https://sırago.com (${DENEME_GUN} gün ücretsiz).`, durum: 'bekliyor' };
    if (ret) return { mesaj: `Tamam, sorun değil. Fikriniz değişirse buraya *kayıt* yazmanız yeterli. İyi çalışmalar 🙏`, durum: 'olumsuz' };
    if (ifadeVar(sade, ['fiyat', 'fiyatı', 'ücret', 'ücreti', 'ucret', 'kaç lira', 'kac lira', 'ne kadar', 'aylık', 'aylik', 'paket', 'paketler']))
      return { mesaj: `${DENEME_GUN} gün ücretsiz, kart bilgisi istemiyoruz; ${fiyat}. ${kayit}`, durum: 'sicak' };
    if (ifadeVar(sade, ['pahalı', 'pahali', 'çok para', 'cok para', 'param yok', 'bütçe', 'butce', 'karşılayamam']))
      return { mesaj: `Ayda birkaç kaçan randevu bile ücretini çıkarır; önce ${DENEME_GUN} gün ücretsiz deneyip kendiniz görün. ${kayit}`, durum: 'olumlu' };
    if (ifadeVar(sade, ['bilmem', 'anlamam', 'anlamıyorum', 'teknoloji', 'bilgisayar', 'zor', 'yapamam', 'kurulum']))
      return { mesaj: `WhatsApp kullanabiliyorsanız yeterli; kurulumda da birlikte yardımcı oluyoruz. ${kayit}`, durum: 'olumlu' };
    if (ifadeVar(sade, ['telefonla', 'zaten yapıyoruz', 'zaten yapiyoruz', 'hallediyoruz', 'hallediyorum', 'defter', 'deftere']))
      return { mesaj: `Siz işlemdeyken telefona bakamadığınız anlarda randevuyu sistem alır, siz sadece onaylarsınız. ${DENEME_GUN} gün ücretsiz deneyebilirsiniz.`, durum: 'olumlu' };
    if (ifadeVar(sade, ['nedir', 'nasıl', 'nasil', 'açıkla', 'acikla', 'detay', 'bilgi', 'anlat', 'özellik', 'ozellik', 'video', 'demo', 'göster', 'goster']))
      return { mesaj: `Müşterileriniz WhatsApp'tan ya da size özel linkten 7/24 randevu alır, randevudan önce hatırlatma otomatik gider. ${kayit}`, durum: 'sicak' };
    if (ifadeVar(sade, ['tamam', 'olur', 'evet', 'ilgileniyorum', 'denerim', 'süper', 'harika', 'güzel', 'guzel', 'at', 'atın', 'gönder']))
      return { mesaj: `Güzel. ${kayit}`, durum: 'sicak' };
    if (ifadeVar(sade, ['merhaba', 'selam', 'selamlar', 'merhabalar', 'iyi günler', 'günaydın', 'gunaydin', 'kimsiniz', 'kim']))
      return { mesaj: `Merhaba, ben SıraGO'nun dijital asistanıyım. ${konusma.isletme_adi || 'İşletmeniz'} için WhatsApp'tan otomatik randevu sistemi hakkında yazmıştım; ${DENEME_GUN} gün ücretsiz. Randevuları şu an nasıl alıyorsunuz?`, durum: 'bekliyor' };
    return { mesaj: `Merak ettiğiniz bir şey olursa buradan sorabilirsiniz; denemek isterseniz *kayıt* yazmanız yeterli.`, durum: 'bekliyor' };
  }

  async deepseekSatisCevabi(musteriMesaj, konusma) {
    const apiKey = process.env.DEEPSEEK_API_KEY;
    if (!apiKey) return this.fallbackCevapUret(musteriMesaj, konusma);

    const gecmis = konusma.gelen_mesajlar || '';
    const mesajSayisi = (gecmis.match(/Müşteri:/g) || []).length + 1;
    const { enUcuz, liste } = await this._fiyatlar();
    const fiyatCumle = enUcuz ? `${DENEME_GUN} gün ücretsiz, sonrası aylık ${enUcuz}₺'den başlıyor.` : `${DENEME_GUN} gün ücretsiz; paketler https://sırago.com sayfasında.`;

    const prompt = `Sen SıraGO'nun WhatsApp satış asistanısın. Bir esnafla konuşuyorsun: kısa, saygılı ve samimi yaz, "siz" diye hitap et.

İŞLETME: ${konusma.isletme_adi || '-'} (${konusma.kategori || '-'})

PAKETLER:
${liste || '(fiyat bilgisi yok — fiyat sorulursa sitede yazdığını söyle)'}
Deneme: ${DENEME_GUN} gün ücretsiz, kart bilgisi istenmez. Kurulum telefondan birkaç dakika.

ÜRÜN (yalnız bunları söyle, başka özellik uydurma):
- Müşteriler WhatsApp'tan ya da işletmeye özel linkten 7/24 kendi randevusunu alır.
- Randevudan önce müşteriye otomatik WhatsApp hatırlatması gider.
- İşletme randevuları telefondan panelde görür, onaylar. Uygulama indirmek gerekmez.

KONUŞMA
İlk mesajımız: ${(konusma.gonderilen_mesaj || '').slice(0, 300)}
Geçmiş: ${gecmis.slice(-900)}
MÜŞTERİNİN SON MESAJI: "${musteriMesaj}"
Bu müşterinin ${mesajSayisi}. mesajı.

NASIL CEVAP VERİRSİN
1. En fazla 2 kısa cümle. Liste ve paragraf yok. En fazla 1 emoji.
2. İlgi gösterirse (evet, olur, tamam, at, gönder, nasıl, göster, demo): tek fayda söyle ve "İsterseniz hesabınızı buradan 1 dakikada açayım, *kayıt* yazmanız yeterli." diye bitir. durum: "sicak".
3. Fiyat sorarsa: "${fiyatCumle}" + kayıt teklifi. durum: "sicak".
4. "Pahalı" derse: ayda birkaç kaçan randevunun bile ücreti çıkardığını söyle, önce ücretsiz denemesini öner. durum: "olumlu".
5. "Telefonla/defterle hallediyorum" derse: işlemdeyken telefona bakamadığı anlarda randevuyu sistemin aldığını söyle. durum: "olumlu".
6. "Teknolojiden anlamam" derse: WhatsApp kullanabiliyorsa yeterli olduğunu, kurulumda birlikte yardımcı olacağımızı söyle. durum: "olumlu".
7. Cevabını bilmediğin bir soru sorarsa uydurma: "Bunu ekibimiz size net söylesin; sizi bugün arayalım mı?" de. durum: "sicak".
8. Reddederse ısrar etme, kibarca vedalaş. durum: "olumsuz".
9. 4. mesajdan sonra hâlâ karar vermediyse linki bırak (https://sırago.com) ve vedalaş. durum: "bekliyor".

KESİN KURALLAR
- Video/dosya gönderme teklifi yok. "Teşekkürler" diye başlama, teşekkür yarışına girme.
- Rakam, yüzde, müşteri sayısı, "rakipleriniz kullanıyor", "iptaller %X azalır" gibi doğrulanamayan iddia YOK.
- Bot olup olmadığın sorulursa SıraGO'nun dijital asistanı olduğunu söyle; kendini insan gibi tanıtma.
- Link yalnız https://sırago.com; kayıt için *kayıt* yazmalarını iste.
- "optimize", "entegre", "minimize" gibi kurumsal kelimeler yok.

Yalnızca JSON döndür: {"mesaj": "...", "durum": "olumlu" | "olumsuz" | "bekliyor" | "sicak"}`;

    try {
      const response = await axios.post('https://api.deepseek.com/chat/completions', {
        model: 'deepseek-chat',
        messages: [
          { role: 'system', content: 'Sen SıraGO satış asistanısın. En fazla 2 kısa cümle, "siz" hitabı, uydurma iddia yok, reddedene ısrar yok. Yalnızca JSON döndür.' },
          { role: 'user', content: prompt }
        ],
        temperature: 0.4,
        max_tokens: 250
      }, {
        headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        timeout: 20000
      });
      const content = response.data.choices[0]?.message?.content || '';
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        if (parsed.mesaj && String(parsed.mesaj).length <= 600) {
          parsed.mesaj = linkDuzelt(parsed.mesaj);
          return parsed;
        }
      }
      console.log('⚠️ DeepSeek cevabı kullanılamadı, yedek cevap');
      return this.fallbackCevapUret(musteriMesaj, konusma);
    } catch (err) {
      console.error('❌ DeepSeek satış hatası:', err.message);
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
  // Satış hunisi: gönderim → cevap → ilgi → kayıt → ödeme (şablon şablon).
  // Kayıt: WhatsApp akışıyla açılan hesap YA DA aynı telefonla sonradan siteden açılan hesap.
  async huni(gun = 30) {
    gun = Math.min(Math.max(parseInt(gun) || 30, 1), 365);
    const satirlar = (await pool.query(`
      WITH k AS (
        SELECT sk.*,
          COALESCE(sk.kayit_isletme_id, (
            SELECT i.id FROM isletmeler i
            WHERE RIGHT(regexp_replace(COALESCE(i.telefon, ''), '[^0-9]', '', 'g'), 10) = RIGHT(regexp_replace(sk.telefon, '[^0-9]', '', 'g'), 10)
              AND LENGTH(regexp_replace(COALESCE(i.telefon, ''), '[^0-9]', '', 'g')) >= 10
              AND i.olusturma_tarihi >= sk.olusturma_tarihi - INTERVAL '1 day'
            ORDER BY i.olusturma_tarihi LIMIT 1)) AS isletme_id
        FROM satis_konusmalar sk
        WHERE sk.olusturma_tarihi >= (NOW() AT TIME ZONE 'Europe/Istanbul') - make_interval(days => $1)
          AND sk.gonderilen_mesaj <> 'Müşteri kendisi yazdı'
      )
      SELECT k.sablon_id, COALESCE(s.isim, 'Hazır metin (şablonsuz)') AS sablon,
        COUNT(*)::int AS gonderilen,
        COUNT(*) FILTER (WHERE COALESCE(k.gelen_mesajlar, '') <> '')::int AS cevap,
        COUNT(*) FILTER (WHERE k.durum IN ('olumlu', 'sicak', 'kayit', 'musteri') OR k.isletme_id IS NOT NULL)::int AS ilgi,
        COUNT(*) FILTER (WHERE k.durum = 'olumsuz')::int AS olumsuz,
        COUNT(*) FILTER (WHERE k.red_tipi = 'sert')::int AS sert_ret,
        COUNT(*) FILTER (WHERE k.isletme_id IS NOT NULL)::int AS kayit,
        COUNT(*) FILTER (WHERE EXISTS (SELECT 1 FROM odemeler o WHERE o.isletme_id = k.isletme_id AND o.durum = 'odendi'))::int AS odeme
      FROM k LEFT JOIN satis_bot_sablonlar s ON s.id = k.sablon_id
      GROUP BY k.sablon_id, s.isim
      ORDER BY gonderilen DESC`, [gun])).rows;
    const toplam = satirlar.reduce((t, r) => {
      for (const a of ['gonderilen', 'cevap', 'ilgi', 'olumsuz', 'sert_ret', 'kayit', 'odeme']) t[a] = (t[a] || 0) + r[a];
      return t;
    }, {});
    return { gun, toplam, sablonlar: satirlar };
  }

  async istatistikler() {
    try {
    const [gonderilen, bekleyen, olumlu, olumsuz, wpYok, sicak] = await Promise.all([
      pool.query("SELECT COUNT(*) as c FROM potansiyel_musteriler WHERE wp_mesaj_durumu = 'gonderildi'"),
      // "Cevap bekliyor" = hiç cevap gelmemiş; kendisi yazan ya da cevap verip AI'ın 'bekliyor' dediği kişiler sayılmaz
      pool.query("SELECT COUNT(*) as c FROM satis_konusmalar WHERE durum = 'bekliyor' AND (gelen_mesajlar IS NULL OR gelen_mesajlar = '')"),
      pool.query("SELECT COUNT(*) as c FROM satis_konusmalar WHERE durum = 'olumlu'"),
      pool.query("SELECT COUNT(*) as c FROM satis_konusmalar WHERE durum = 'olumsuz'"),
      pool.query("SELECT COUNT(*) as c FROM potansiyel_musteriler WHERE wp_mesaj_durumu = 'wp_yok'"),
      pool.query("SELECT COUNT(*) as c FROM satis_konusmalar WHERE durum = 'sicak'"),
    ]);
    let kayit = 0;
    try { kayit = parseInt((await pool.query("SELECT COUNT(*) AS c FROM satis_konusmalar WHERE kayit_isletme_id IS NOT NULL")).rows[0].c) || 0; } catch (e) {}

    return {
      gonderilen: parseInt(gonderilen.rows[0].c),
      bekleyen: parseInt(bekleyen.rows[0].c),
      olumlu: parseInt(olumlu.rows[0].c),
      olumsuz: parseInt(olumsuz.rows[0].c),
      wp_yok: parseInt(wpYok.rows[0].c),
      sicak: parseInt(sicak.rows[0].c),
      kayit,
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
module.exports._test = { redTipi, linkDuzelt, kisiselSatir, sadeMetin, yalnizNezaket };
