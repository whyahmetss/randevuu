const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion, makeCacheableSignalKeyStore } = require('@whiskeysockets/baileys');
const qrcode = require('qrcode');
const pool = require('../config/db');
const EventEmitter = require('events');
const fs = require('fs');
const path = require('path');
const pino = require('pino');
const axios = require('axios');

const AUTH_DIR = path.join(process.cwd(), '.wwebjs_auth', 'satis_bot');

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
    (ad) => `Merhabalar 🙂\n\n${ad} işletmenizi inceledik!\n\nMüşterileriniz 7/24 online randevu alabilir, WhatsApp ile otomatik hatırlatma gider. Tüm yönetimi tek panelden yaparsınız.\n\nİlk ay tamamen ücretsiz — denemek ister misiniz?`,
    (ad) => `Merhaba, iyi günler 🙂\n\n${ad} için profesyonel bir randevu sistemi sunuyoruz. Müşterileriniz telefonla aramak zorunda kalmaz.\n\nWhatsApp hatırlatıcı dahil. İlk ay bizden — ilgilenir misiniz?`,
    (ad) => `Selam 🙂\n\nBiz SıraGO olarak işletmelere online randevu sistemi kuruyoruz.\n\n${ad} için mükemmel olur: 7/24 randevu, WhatsApp hatırlatma, kolay panel.\n\nÜcretsiz deneyin — bilgi verebilir miyim?`,
  ]
};

class SatisBot extends EventEmitter {
  constructor() {
    super();
    this.sock = null;
    this.durum = 'kapali'; // kapali, qr_bekleniyor, bagli, calisiyor
    this.qrBase64 = null;
    this.aktif = false; // mesaj gönderme döngüsü aktif mi
    this.gonderimTimer = null;
    this.gunlukGonderim = 0;
    this.sonGonderimTarihi = null;
    this.konusmalar = {}; // telefon -> { mesajlar: [], durum: 'bekliyor'|'olumlu'|'olumsuz' }
  }

  // ═══════════════════════════════════════════════════
  // WhatsApp Bağlantısı (Baileys)
  // ═══════════════════════════════════════════════════
  async baslat() {
    if (this.durum === 'bagli' || this.durum === 'qr_bekleniyor') return;

    if (!fs.existsSync(AUTH_DIR)) fs.mkdirSync(AUTH_DIR, { recursive: true });
    this.durum = 'baslatiyor';

    try {
      const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
      const { version } = await fetchLatestBaileysVersion();

      this.sock = makeWASocket({
        version,
        auth: {
          creds: state.creds,
          keys: makeCacheableSignalKeyStore(state.keys, pino({ level: 'silent' })),
        },
        printQRInTerminal: true,
        logger: pino({ level: 'silent' }),
        browser: ['SıraGO Sales', 'Chrome', '4.0.0'],
        generateHighQualityLinkPreview: false,
      });

      this.sock.ev.on('creds.update', saveCreds);

      this.sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
          this.qrBase64 = await qrcode.toDataURL(qr);
          this.durum = 'qr_bekleniyor';
          console.log('📱 Satış Bot QR hazır — SuperAdmin panelden tarayın');
          this.emit('qr', this.qrBase64);
        }

        if (connection === 'open') {
          this.durum = 'bagli';
          this.qrBase64 = null;
          console.log('✅ Satış Bot WhatsApp bağlandı');
          this.emit('bagli');
        }

        if (connection === 'close') {
          const statusCode = lastDisconnect?.error?.output?.statusCode;
          if (statusCode === DisconnectReason.loggedOut) {
            this.durum = 'kapali';
            try { fs.rmSync(AUTH_DIR, { recursive: true, force: true }); } catch (e) {}
            console.log('❌ Satış Bot oturumu kapatıldı');
          } else {
            console.log('🔄 Satış Bot yeniden bağlanıyor...');
            setTimeout(() => this.baslat(), 5000);
          }
        }
      });

      // Gelen mesajları dinle (cevaplar)
      this.sock.ev.on('messages.upsert', async ({ messages, type }) => {
        if (type !== 'notify') return;
        for (const msg of messages) {
          if (msg.key.fromMe) continue;
          if (!msg.message) continue;
          try {
            await this.gelenMesajIsle(msg);
          } catch (err) {
            console.error('❌ Satış bot gelen mesaj hatası:', err.message);
          }
        }
      });

    } catch (err) {
      console.error('❌ Satış bot başlatma hatası:', err.message);
      this.durum = 'hata';
    }
  }

  async durdur() {
    this.aktif = false;
    if (this.gonderimTimer) {
      clearTimeout(this.gonderimTimer);
      this.gonderimTimer = null;
    }
    if (this.sock) {
      try { await this.sock.logout(); } catch (e) {}
      try { this.sock.end(); } catch (e) {}
    }
    this.sock = null;
    this.durum = 'kapali';
    this.qrBase64 = null;
    try { fs.rmSync(AUTH_DIR, { recursive: true, force: true }); } catch (e) {}
    console.log('🛑 Satış Bot durduruldu');
  }

  getDurum() {
    return {
      durum: this.durum,
      qrBase64: this.qrBase64,
      aktif: this.aktif,
      gunlukGonderim: this.gunlukGonderim,
      sonGonderimTarihi: this.sonGonderimTarihi
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
    if (!this.aktif || this.durum !== 'bagli') return;

    // Günlük sayacı sıfırla
    const bugun = new Date().toISOString().slice(0, 10);
    if (this.sonGonderimTarihi !== bugun) {
      this.gunlukGonderim = 0;
      this.sonGonderimTarihi = bugun;
    }

    // Günlük limit: max 50 mesaj
    if (this.gunlukGonderim >= 50) {
      console.log('📊 Günlük limit doldu (50), yarın devam edilecek');
      // Yarın sabah 9'da tekrar başla
      const yarin = new Date();
      yarin.setDate(yarin.getDate() + 1);
      yarin.setHours(9, 0, 0, 0);
      const bekleme = yarin.getTime() - Date.now();
      this.gonderimTimer = setTimeout(() => this.sonrakiGonderim(), bekleme);
      return;
    }

    // Mesai saatleri kontrolü (09:00 - 19:00)
    const saat = new Date().getHours();
    if (saat < 9 || saat >= 19) {
      console.log('🕐 Mesai dışı, 09:00\'da devam edilecek');
      const yarin = new Date();
      if (saat >= 19) yarin.setDate(yarin.getDate() + 1);
      yarin.setHours(9, 0, 0, 0);
      const bekleme = yarin.getTime() - Date.now();
      this.gonderimTimer = setTimeout(() => this.sonrakiGonderim(), bekleme);
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

      // Anti-ban: Rastgele 8-15 dakika bekle (2 saatte ~10 mesaj)
      const minBekleme = 8 * 60 * 1000;  // 8 dk
      const maxBekleme = 15 * 60 * 1000; // 15 dk
      const bekleme = minBekleme + Math.random() * (maxBekleme - minBekleme);
      const dakika = Math.round(bekleme / 60000);

      console.log(`⏳ Sonraki mesaj ${dakika} dakika sonra (bugün: ${this.gunlukGonderim}/50)`);
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
    const result = await pool.query(`
      SELECT * FROM potansiyel_musteriler 
      WHERE telefon IS NOT NULL 
        AND telefon != '' 
        AND durum = 'yeni'
        AND wp_mesaj_durumu IS NULL
      ORDER BY skor DESC 
      LIMIT 1
    `);
    return result.rows[0] || null;
  }

  async leadeMesajGonder(lead) {
    const telefon = this.telefonDuzelt(lead.telefon);
    if (!telefon) {
      await pool.query("UPDATE potansiyel_musteriler SET wp_mesaj_durumu = 'gecersiz_numara' WHERE id = $1", [lead.id]);
      return;
    }

    // Numaranın WhatsApp'ta kayıtlı olup olmadığını kontrol et
    try {
      const [result] = await this.sock.onWhatsApp(telefon);
      if (!result?.exists) {
        console.log(`📵 ${lead.isletme_adi} — numara WhatsApp'ta yok`);
        await pool.query("UPDATE potansiyel_musteriler SET wp_mesaj_durumu = 'wp_yok' WHERE id = $1", [lead.id]);
        return;
      }
    } catch (e) {
      console.log(`⚠️ WhatsApp kontrol hatası: ${e.message}`);
    }

    // Kategoriye göre mesaj şablonu seç
    const kategori = (lead.kategori || '').toLowerCase();
    const sablonlar = MESAJ_SABLONLARI[kategori] || MESAJ_SABLONLARI.default;
    const rastgeleSablon = sablonlar[Math.floor(Math.random() * sablonlar.length)];
    const mesaj = rastgeleSablon(lead.isletme_adi);

    // Anti-ban: Typing indicator
    const jid = `${telefon}@s.whatsapp.net`;
    try {
      await this.sock.presenceSubscribe(jid);
      await this.sock.sendPresenceUpdate('composing', jid);
      // Rastgele 3-8 saniye "yazıyor" göster
      const typingMs = 3000 + Math.random() * 5000;
      await new Promise(r => setTimeout(r, typingMs));
      await this.sock.sendPresenceUpdate('paused', jid);
    } catch (e) { /* presence hataları önemsiz */ }

    // Mesaj gönder
    try {
      await this.sock.sendMessage(jid, { text: mesaj });
      console.log(`✅ Mesaj gönderildi: ${lead.isletme_adi} (${telefon}) [${kategori}]`);

      // DB güncelle
      await pool.query(
        "UPDATE potansiyel_musteriler SET wp_mesaj_durumu = 'gonderildi', wp_mesaj_tarihi = NOW() WHERE id = $1",
        [lead.id]
      );

      // Konuşma kaydı oluştur
      await pool.query(
        `INSERT INTO satis_konusmalar (lead_id, telefon, isletme_adi, kategori, gonderilen_mesaj, durum) 
         VALUES ($1, $2, $3, $4, $5, 'bekliyor')`,
        [lead.id, telefon, lead.isletme_adi, lead.kategori, mesaj]
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
  // Gelen Mesaj İşleme + DeepSeek AI Satış
  // ═══════════════════════════════════════════════════
  async gelenMesajIsle(msg) {
    const metin = this._getMsgText(msg);
    if (!metin) return;

    const remoteJid = msg.key.remoteJid;
    const telefon = remoteJid.replace('@s.whatsapp.net', '').replace('@c.us', '');

    console.log(`📩 Satış Bot cevap aldı: ${telefon} → "${metin}"`);

    // Bu lead'in konuşma kaydını bul
    const konusma = (await pool.query(
      "SELECT * FROM satis_konusmalar WHERE telefon = $1 ORDER BY olusturma_tarihi DESC LIMIT 1",
      [telefon]
    )).rows[0];

    if (!konusma) {
      console.log(`⚠️ Bilinmeyen numara: ${telefon}`);
      return;
    }

    // Gelen mesajı kaydet
    await pool.query(
      "UPDATE satis_konusmalar SET gelen_mesajlar = COALESCE(gelen_mesajlar, '') || $1, son_mesaj_tarihi = NOW() WHERE id = $2",
      [`\n[${new Date().toLocaleTimeString('tr-TR')}] Müşteri: ${metin}`, konusma.id]
    );

    // DeepSeek AI ile satış cevabı oluştur
    const aiCevap = await this.deepseekSatisCevabi(metin, konusma);

    if (aiCevap) {
      // Anti-ban: Typing indicator
      try {
        await this.sock.sendPresenceUpdate('composing', remoteJid);
        const typingMs = 2000 + Math.random() * 4000;
        await new Promise(r => setTimeout(r, typingMs));
        await this.sock.sendPresenceUpdate('paused', remoteJid);
      } catch (e) {}

      // Cevap gönder
      await this.sock.sendMessage(remoteJid, { text: aiCevap.mesaj });
      console.log(`💬 Satış Bot cevap gönderdi: ${telefon} → "${aiCevap.mesaj.slice(0, 60)}..."`);

      // Konuşma kaydını güncelle
      await pool.query(
        "UPDATE satis_konusmalar SET gelen_mesajlar = COALESCE(gelen_mesajlar, '') || $1, durum = $2 WHERE id = $3",
        [`\n[${new Date().toLocaleTimeString('tr-TR')}] Bot: ${aiCevap.mesaj}`, aiCevap.durum || konusma.durum, konusma.id]
      );

      // Lead durumunu güncelle
      if (aiCevap.durum === 'olumlu') {
        await pool.query("UPDATE potansiyel_musteriler SET durum = 'ilgileniyor' WHERE id = $1", [konusma.lead_id]);
      } else if (aiCevap.durum === 'olumsuz') {
        await pool.query("UPDATE potansiyel_musteriler SET durum = 'ilgilenmiyor' WHERE id = $1", [konusma.lead_id]);
      }
    }
  }

  async deepseekSatisCevabi(musteriMesaj, konusma) {
    const apiKey = process.env.DEEPSEEK_API_KEY;
    if (!apiKey) {
      console.log('⚠️ DEEPSEEK_API_KEY yok, AI satış devre dışı');
      return null;
    }

    const prompt = `Sen SıraGO'nun satış temsilcisisin. İşletmelere online randevu sistemi satıyorsun.

ÜRÜNLERİN:
- Online randevu sistemi (7/24 müşteriler randevu alabilir)
- WhatsApp ile otomatik hatırlatma
- Kolay yönetim paneli
- Fiyat: Aylık 299₺ (Başlangıç), 599₺ (Profesyonel)
- İlk ay tamamen ücretsiz deneme

KONUŞMA GEÇMİŞİ:
İşletme: ${konusma.isletme_adi} (${konusma.kategori})
İlk gönderilen mesaj: ${konusma.gonderilen_mesaj?.slice(0, 200)}
${konusma.gelen_mesajlar || ''}

MÜŞTERİ SON MESAJI: "${musteriMesaj}"

KURALLAR:
- Türkçe, samimi ve profesyonel ol
- Kısa ve öz cevaplar ver (max 3-4 cümle)
- Müşteriyi demo denemeye yönlendir
- Demo linki: admin.sirago.com
- Fiyat sorarlarsa "İlk ay ücretsiz, sonra aylık 299₺'den başlıyor" de
- İlgisizlerse nazikçe teşekkür et
- Emoji kullan ama abartma

CEVABINI ŞU JSON FORMATINDA VER (sadece JSON, başka bir şey yazma):
{
  "mesaj": "müşteriye gönderilecek mesaj",
  "durum": "olumlu" veya "olumsuz" veya "bekliyor"
}`;

    try {
      const response = await axios.post('https://api.deepseek.com/chat/completions', {
        model: 'deepseek-chat',
        messages: [
          { role: 'system', content: 'Sen bir satış asistanısın. Sadece JSON formatında yanıt ver.' },
          { role: 'user', content: prompt }
        ],
        temperature: 0.7,
        max_tokens: 500
      }, {
        headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        timeout: 15000
      });

      const content = response.data.choices[0]?.message?.content || '';
      // JSON parse et
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
      return { mesaj: content.replace(/```json|```/g, '').trim(), durum: 'bekliyor' };
    } catch (err) {
      console.error('❌ DeepSeek satış hatası:', err.message);
      return null;
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
  }

  async konusmalarGetir(limit = 20) {
    const result = await pool.query(
      "SELECT * FROM satis_konusmalar ORDER BY son_mesaj_tarihi DESC NULLS LAST, olusturma_tarihi DESC LIMIT $1",
      [limit]
    );
    return result.rows;
  }
}

module.exports = new SatisBot();
