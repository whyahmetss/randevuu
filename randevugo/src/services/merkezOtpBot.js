/**
 * SıraGO Merkez OTP Bot
 * ═══════════════════════════════════════════════════
 * Esnafın kendi WhatsApp'ı bağlı değilse/kopuksa OTP kodlarını
 * SıraGO sistem numarası üzerinden müşteriye gönderir.
 *
 * - Multi-number destekli (round-robin — günlük WA gönderim limiti için)
 * - pgAuthState ile DB'de auth saklar (deploy sonrası bağlantı bozulmaz)
 * - auth_id aralığı: 800000..899999 (isletme & satışbot ile çakışmasın)
 */
const { default: makeWASocket, DisconnectReason, fetchLatestBaileysVersion, makeCacheableSignalKeyStore } = require('@whiskeysockets/baileys');
const qrcode = require('qrcode');
const pino = require('pino');
const pool = require('../config/db');
const { usePostgresAuthState } = require('../utils/pgAuthState');

const AUTH_ID_BASE = 800000;
const MAX_RECONNECT = 5;
const GUNLUK_LIMIT_PER_NUMARA = 500; // WA anti-ban için pozitif limit

class MerkezOtpBot {
  constructor() {
    this.sockets = new Map(); // numaraId → { sock, durum, qrBase64, reconnectAttempts, _reconnectTimer, basariliOturum }
    this.roundRobinIndex = 0;
  }

  // ─── Genel servis başlat: DB'deki aktif numaraları yükle ───
  async baslat() {
    try {
      const rows = (await pool.query(
        `SELECT id, numara, auth_id FROM merkez_otp_bot WHERE aktif = true ORDER BY id`
      )).rows;
      if (rows.length === 0) {
        console.log('📞 Merkez OTP Bot: henüz tanımlı numara yok');
        return;
      }
      console.log(`📞 Merkez OTP Bot: ${rows.length} numara başlatılıyor...`);
      for (const r of rows) {
        await this.numaraBaslat(r.id, r.auth_id).catch(e => {
          console.log(`⚠️ Merkez OTP #${r.id} başlatılamadı:`, e.message);
        });
      }
    } catch (e) {
      console.log('⚠️ Merkez OTP Bot başlatma hatası:', e.message);
    }
  }

  // ─── Yeni numara ekle ───
  async numaraEkle() {
    const maxAuthRow = (await pool.query(`SELECT MAX(auth_id) as m FROM merkez_otp_bot`)).rows[0];
    const yeniAuthId = (maxAuthRow?.m || AUTH_ID_BASE) + 1;
    const yeni = (await pool.query(
      `INSERT INTO merkez_otp_bot (auth_id, durum, aktif) VALUES ($1, 'kapali', true) RETURNING id, auth_id`,
      [yeniAuthId]
    )).rows[0];
    return yeni;
  }

  async numaraListe() {
    const rows = (await pool.query(
      `SELECT id, numara, auth_id, durum, qr_base64, gunluk_gonderim, bugun_tarihi, aktif 
       FROM merkez_otp_bot ORDER BY id`
    )).rows;
    return rows.map(r => {
      const mem = this.sockets.get(r.id);
      return {
        ...r,
        durum: mem?.durum || r.durum || 'kapali',
        qr_base64: mem?.qrBase64 || null,
      };
    });
  }

  async numaraSil(numaraId) {
    await this.numaraDurdur(numaraId);
    await pool.query(`DELETE FROM wa_auth_keys WHERE isletme_id IN (SELECT auth_id FROM merkez_otp_bot WHERE id=$1)`, [numaraId]);
    await pool.query(`DELETE FROM merkez_otp_bot WHERE id=$1`, [numaraId]);
  }

  async numaraDurdur(numaraId) {
    const state = this.sockets.get(numaraId);
    if (state) {
      if (state._reconnectTimer) clearTimeout(state._reconnectTimer);
      try { state.sock?.logout(); } catch {}
      try { state.sock?.end(); } catch {}
      this.sockets.delete(numaraId);
    }
    try {
      const numRow = (await pool.query(`SELECT auth_id FROM merkez_otp_bot WHERE id=$1`, [numaraId])).rows[0];
      if (numRow?.auth_id) {
        await pool.query(`DELETE FROM wa_auth_keys WHERE isletme_id=$1`, [numRow.auth_id]);
      }
      await pool.query(`UPDATE merkez_otp_bot SET durum='kapali', qr_base64=NULL WHERE id=$1`, [numaraId]);
    } catch {}
  }

  // ─── Tek numara başlat (Baileys socket) ───
  // isUserInitiated=true → kullanıcı butona bastı, reconnect sayacı sıfırla (fresh start)
  // isUserInitiated=false → otomatik reconnect, sayacı koru
  async numaraBaslat(numaraId, authId = null, isUserInitiated = true) {
    if (!authId) {
      const row = (await pool.query(`SELECT auth_id FROM merkez_otp_bot WHERE id=$1`, [numaraId])).rows[0];
      if (!row) throw new Error(`Merkez OTP #${numaraId} bulunamadı`);
      authId = row.auth_id;
    }

    // Mevcut socket varsa kapat — ama state'i koru (sayaç/flagler için)
    const eski = this.sockets.get(numaraId);
    if (eski) {
      if (eski._reconnectTimer) { clearTimeout(eski._reconnectTimer); eski._reconnectTimer = null; }
      try { eski.sock?.ev?.removeAllListeners?.(); } catch {}
      try { eski.sock?.end(); } catch {}
    }

    const state = eski && !isUserInitiated
      ? { ...eski, sock: null, durum: 'baslatiyor', qrBase64: null, _reconnectTimer: null }
      : { sock: null, durum: 'baslatiyor', qrBase64: null, reconnectAttempts: 0, _reconnectTimer: null, basariliOturum: false };
    this.sockets.set(numaraId, state);

    try {
      const { state: authState, saveCreds } = await usePostgresAuthState(pool, authId);
      const { version } = await fetchLatestBaileysVersion();

      const sock = makeWASocket({
        version,
        auth: {
          creds: authState.creds,
          keys: makeCacheableSignalKeyStore(authState.keys, pino({ level: 'silent' })),
        },
        printQRInTerminal: false,
        logger: pino({ level: 'silent' }),
        browser: ['SıraGO OTP', 'Desktop', '4.0.0'],
        generateHighQualityLinkPreview: false,
        getMessage: async () => ({ conversation: '' }),
      });

      state.sock = sock;
      sock.ev.on('creds.update', saveCreds);

      sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
          try {
            const qrBase64 = await qrcode.toDataURL(qr);
            state.qrBase64 = qrBase64;
            state.durum = 'qr_bekliyor';
            await pool.query(
              `UPDATE merkez_otp_bot SET durum='qr_bekliyor', qr_base64=$1 WHERE id=$2`,
              [qrBase64, numaraId]
            );
            console.log(`📱 Merkez OTP #${numaraId} QR hazır`);
          } catch (e) {
            console.error(`❌ Merkez OTP QR hatası:`, e.message);
          }
        }

        if (connection === 'open') {
          state.durum = 'bagli';
          state.qrBase64 = null;
          state.basariliOturum = true;
          state.reconnectAttempts = 0;
          const numara = sock.user?.id?.split(':')[0] || sock.user?.id?.split('@')[0] || null;
          if (numara) {
            await pool.query(
              `UPDATE merkez_otp_bot SET durum='bagli', qr_base64=NULL, numara=$1 WHERE id=$2`,
              [`+${numara}`, numaraId]
            );
          } else {
            await pool.query(
              `UPDATE merkez_otp_bot SET durum='bagli', qr_base64=NULL WHERE id=$1`,
              [numaraId]
            );
          }
          console.log(`✅ Merkez OTP #${numaraId} bağlandı: +${numara}`);
        }

        if (connection === 'close') {
          const statusCode = lastDisconnect?.error?.output?.statusCode;
          state.durum = 'kapali';

          // Logged out → auth temizle, reconnect YAPMA
          if (statusCode === DisconnectReason.loggedOut) {
            console.log(`🚪 Merkez OTP #${numaraId} logged out — auth temizleniyor`);
            try { await pool.query(`DELETE FROM wa_auth_keys WHERE isletme_id=$1`, [authId]); } catch {}
            await pool.query(`UPDATE merkez_otp_bot SET durum='kapali', qr_base64=NULL WHERE id=$1`, [numaraId]);
            this.sockets.delete(numaraId);
            return;
          }

          // Kullanıcı QR'ı hiç taramamış (basariliOturum=false) → yine QR çıkacak, sonsuz loop
          // Bu durumda kapat ve kullanıcının "Başlat / Yeni QR" butonuna basmasını bekle
          if (!state.basariliOturum) {
            console.log(`⏸️ Merkez OTP #${numaraId} QR tarama bekleniyor ama timeout/close geldi (code=${statusCode}) — kapatılıyor, tekrar başlatmak için butona basın`);
            await pool.query(`UPDATE merkez_otp_bot SET durum='kapali', qr_base64=NULL WHERE id=$1`, [numaraId]);
            this.sockets.delete(numaraId);
            return;
          }

          // Daha önce başarıyla bağlanmıştı → geçici kopma, reconnect dene
          if (state.reconnectAttempts < MAX_RECONNECT) {
            state.reconnectAttempts++;
            const delay = Math.min(state.reconnectAttempts * 2000, 10000);
            console.log(`🔄 Merkez OTP #${numaraId} yeniden bağlanıyor (${state.reconnectAttempts}/${MAX_RECONNECT}) — code=${statusCode}`);
            state._reconnectTimer = setTimeout(() => {
              this.numaraBaslat(numaraId, authId, false).catch(e => console.log('Reconnect hatası:', e.message));
            }, delay);
          } else {
            console.log(`❌ Merkez OTP #${numaraId} ${MAX_RECONNECT} deneme sonrası bağlanamadı — kapatılıyor`);
            await pool.query(`UPDATE merkez_otp_bot SET durum='kapali', qr_base64=NULL WHERE id=$1`, [numaraId]);
            this.sockets.delete(numaraId);
          }
        }
      });
    } catch (e) {
      console.error(`❌ Merkez OTP #${numaraId} başlatma hatası:`, e.message);
      state.durum = 'hata';
      throw e;
    }
  }

  // ─── Aktif bağlı socket var mı ───
  aktifMi() {
    for (const [, s] of this.sockets) {
      if (s.durum === 'bagli' && s.sock?.user) return true;
    }
    return false;
  }

  // ─── Round-robin aktif socket seç ───
  _aktifSock() {
    const baglilar = [];
    for (const [id, s] of this.sockets) {
      if (s.durum === 'bagli' && s.sock?.user) baglilar.push({ id, ...s });
    }
    if (baglilar.length === 0) return null;
    this.roundRobinIndex = (this.roundRobinIndex + 1) % baglilar.length;
    return baglilar[this.roundRobinIndex];
  }

  // ─── Günlük limit kontrolü (WA ban önleme) ───
  async _gunlukLimitKontrol(numaraId) {
    const bugun = new Date().toISOString().slice(0, 10);
    const row = (await pool.query(
      `SELECT gunluk_gonderim, bugun_tarihi FROM merkez_otp_bot WHERE id=$1`,
      [numaraId]
    )).rows[0];
    if (!row) return false;
    if (String(row.bugun_tarihi).slice(0, 10) !== bugun) {
      // Yeni gün, sayacı resetle
      await pool.query(
        `UPDATE merkez_otp_bot SET gunluk_gonderim=0, bugun_tarihi=$1 WHERE id=$2`,
        [bugun, numaraId]
      );
      return true;
    }
    return (row.gunluk_gonderim || 0) < GUNLUK_LIMIT_PER_NUMARA;
  }

  async _sayacArtir(numaraId) {
    const bugun = new Date().toISOString().slice(0, 10);
    await pool.query(
      `UPDATE merkez_otp_bot 
       SET gunluk_gonderim = CASE WHEN bugun_tarihi=$2 THEN gunluk_gonderim+1 ELSE 1 END,
           bugun_tarihi=$2 
       WHERE id=$1`,
      [numaraId, bugun]
    );
  }

  // ─── OTP mesajı gönder (ana API) ───
  async mesajGonder(hedefTelefon, mesaj) {
    // Limit kontrolü ile uygun socket bul
    let aktif = this._aktifSock();
    if (!aktif) {
      return { success: false, hata: 'Merkez OTP servisi bağlı değil' };
    }

    // Günlük limit aşılmadı mı?
    const limitOk = await this._gunlukLimitKontrol(aktif.id);
    if (!limitOk) {
      // Başka numara dene
      let alternatifBulundu = false;
      for (const [id, s] of this.sockets) {
        if (id === aktif.id) continue;
        if (s.durum === 'bagli' && s.sock?.user) {
          const ok = await this._gunlukLimitKontrol(id);
          if (ok) {
            aktif = { id, ...s };
            alternatifBulundu = true;
            break;
          }
        }
      }
      if (!alternatifBulundu) {
        return { success: false, hata: 'Tüm merkez OTP numaralarının günlük limiti doldu' };
      }
    }

    // Telefonu JID formatına çevir
    let jidTel = String(hedefTelefon).replace(/[^\d]/g, '');
    if (jidTel.startsWith('0')) jidTel = '90' + jidTel.substring(1);
    if (!jidTel.startsWith('90') && jidTel.length === 10) jidTel = '90' + jidTel;
    const jid = `${jidTel}@s.whatsapp.net`;

    try {
      await aktif.sock.sendMessage(jid, { text: mesaj });
      await this._sayacArtir(aktif.id);
      console.log(`📤 Merkez OTP #${aktif.id} → ${jidTel}`);
      return { success: true, numaraId: aktif.id };
    } catch (err) {
      console.error(`❌ Merkez OTP mesaj hatası #${aktif.id}:`, err.message);
      return { success: false, hata: err.message };
    }
  }

  // ─── Durum ───
  async getDurum() {
    const numaralar = await this.numaraListe();
    const genel = numaralar.some(n => (this.sockets.get(n.id)?.durum || n.durum) === 'bagli')
      ? 'bagli'
      : numaralar.some(n => (this.sockets.get(n.id)?.durum || n.durum) === 'qr_bekliyor')
      ? 'qr_bekliyor'
      : 'kapali';
    return { durum: genel, numaralar };
  }
}

module.exports = new MerkezOtpBot();
