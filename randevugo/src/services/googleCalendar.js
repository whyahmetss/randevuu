// Google Calendar 2-Way Sync Service
// - OAuth 2.0 (authorization code flow)
// - Push: SıraGO randevu oluşunca/iptal/ertelenince Google event sync
// - Pull (freebusy): Müsaitlik kontrolünde Google'da event varsa slot bloke
// - Token auto-refresh

const { google } = require('googleapis');
const pool = require('../config/db');

const SCOPES = [
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/calendar.readonly',
  'https://www.googleapis.com/auth/userinfo.email',
];

function getOAuthClient() {
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_OAUTH_REDIRECT_URI ||
    `${process.env.BASE_URL || 'http://localhost:3000'}/api/admin/google-calendar/callback`;

  if (!clientId || !clientSecret) {
    throw new Error('GOOGLE_OAUTH_CLIENT_ID ve GOOGLE_OAUTH_CLIENT_SECRET env değişkenleri zorunlu');
  }

  return new google.auth.OAuth2(clientId, clientSecret, redirectUri);
}

// OAuth URL üret
function authUrl(isletmeId) {
  const oauth2 = getOAuthClient();
  const state = Buffer.from(JSON.stringify({ isletmeId, ts: Date.now() })).toString('base64');
  return oauth2.generateAuthUrl({
    access_type: 'offline',        // refresh_token için kritik
    prompt: 'consent',             // her defasında refresh_token dönmesi için
    scope: SCOPES,
    state,
  });
}

// OAuth callback — code → token
async function callbackHandle(code, state) {
  const oauth2 = getOAuthClient();

  let stateData;
  try { stateData = JSON.parse(Buffer.from(state, 'base64').toString()); } catch {}
  if (!stateData?.isletmeId) throw new Error('Geçersiz state');
  const isletmeId = parseInt(stateData.isletmeId);

  const { tokens } = await oauth2.getToken(code);
  oauth2.setCredentials(tokens);

  // Kullanıcı email'ini al
  let email = null;
  try {
    const oauth2Client = google.oauth2({ version: 'v2', auth: oauth2 });
    const userInfo = await oauth2Client.userinfo.get();
    email = userInfo.data.email;
  } catch (e) {
    console.log('Email alınamadı:', e.message);
  }

  const expiresAt = tokens.expiry_date ? new Date(tokens.expiry_date) : null;

  // refresh_token ilk bağlamada geliyor — sonradan null gelebilir, o zaman eskiyi koru
  const existing = (await pool.query(
    'SELECT refresh_token FROM google_calendar_auth WHERE isletme_id=$1', [isletmeId]
  )).rows[0];
  const refreshToken = tokens.refresh_token || existing?.refresh_token;
  if (!refreshToken) {
    throw new Error('refresh_token alınamadı. Google hesabınızda SıraGO yetkisini kaldırıp tekrar deneyin.');
  }

  await pool.query(
    `INSERT INTO google_calendar_auth (isletme_id, google_email, access_token, refresh_token, expires_at, calendar_id, sync_aktif, freebusy_kontrol)
     VALUES ($1, $2, $3, $4, $5, 'primary', true, true)
     ON CONFLICT (isletme_id) DO UPDATE
     SET google_email = EXCLUDED.google_email,
         access_token = EXCLUDED.access_token,
         refresh_token = EXCLUDED.refresh_token,
         expires_at = EXCLUDED.expires_at,
         sync_aktif = true,
         son_senkron = NOW()`,
    [isletmeId, email, tokens.access_token, refreshToken, expiresAt]
  );

  return { isletmeId, email };
}

// Kimliklenmiş OAuth client (token auto-refresh dahil)
async function yetkiliClient(isletmeId) {
  const row = (await pool.query(
    'SELECT * FROM google_calendar_auth WHERE isletme_id=$1 AND sync_aktif=true', [isletmeId]
  )).rows[0];
  if (!row) return null;

  const oauth2 = getOAuthClient();
  oauth2.setCredentials({
    access_token: row.access_token,
    refresh_token: row.refresh_token,
    expiry_date: row.expires_at ? new Date(row.expires_at).getTime() : null,
  });

  // Token otomatik refresh event
  oauth2.on('tokens', async (tokens) => {
    try {
      const newExpires = tokens.expiry_date ? new Date(tokens.expiry_date) : null;
      const updates = ['access_token=$1', 'expires_at=$2', 'son_senkron=NOW()'];
      const params = [tokens.access_token, newExpires];
      if (tokens.refresh_token) {
        updates.push('refresh_token=$3');
        params.push(tokens.refresh_token);
      }
      params.push(isletmeId);
      await pool.query(
        `UPDATE google_calendar_auth SET ${updates.join(', ')} WHERE isletme_id=$${params.length}`,
        params
      );
    } catch (e) { console.error('Google token refresh save hatası:', e.message); }
  });

  return { oauth2, row };
}

// İşletme için Google Calendar bağlı mı?
async function bagliMi(isletmeId) {
  const row = (await pool.query(
    'SELECT id, google_email, sync_aktif, freebusy_kontrol, son_senkron FROM google_calendar_auth WHERE isletme_id=$1 AND sync_aktif=true',
    [isletmeId]
  )).rows[0];
  return row || null;
}

// Bağlantı kes
async function baglantiKes(isletmeId) {
  // Token revoke (best effort)
  try {
    const ctx = await yetkiliClient(isletmeId);
    if (ctx) {
      await ctx.oauth2.revokeCredentials();
    }
  } catch (e) { /* ignore */ }
  await pool.query('DELETE FROM google_calendar_auth WHERE isletme_id=$1', [isletmeId]);
  return { basarili: true };
}

// ────────────────────────────────────────────────────────
// RANDEVU → GOOGLE EVENT (PUSH)
// ────────────────────────────────────────────────────────

// ISO datetime üret (Türkiye saati varsayılan, isletme timezone'a göre ayarlanabilir)
function isoDateTime(tarih, saat, timezone = 'Europe/Istanbul') {
  // tarih: "YYYY-MM-DD", saat: "HH:MM" veya "HH:MM:SS"
  const [yil, ay, gun] = String(tarih).slice(0, 10).split('-').map(Number);
  const saatParts = String(saat).slice(0, 5).split(':').map(Number);
  const [saatH, saatM] = saatParts;
  // Turkey timezone UTC+3 (offset -180 dk — JS'de)
  // Basit yaklaşım: event'i naive string olarak gönder, timeZone parametresi versin
  const isoStr = `${yil}-${String(ay).padStart(2, '0')}-${String(gun).padStart(2, '0')}T${String(saatH).padStart(2, '0')}:${String(saatM).padStart(2, '0')}:00`;
  return { dateTime: isoStr, timeZone: timezone };
}

// Randevuyu Google Calendar'a ekle — fire-and-forget (başarı garanti değil)
async function randevuEventOlustur(isletmeId, randevu) {
  try {
    const ctx = await yetkiliClient(isletmeId);
    if (!ctx) return null;

    const calendar = google.calendar({ version: 'v3', auth: ctx.oauth2 });

    // Detay bilgileri topla
    const detay = (await pool.query(`
      SELECT r.*, m.isim as musteri_isim, m.telefon as musteri_telefon,
             h.isim as hizmet_isim, h.sure_dk as hizmet_sure, h.fiyat as hizmet_fiyat,
             c.isim as calisan_isim,
             i.isim as isletme_isim, i.timezone as isletme_tz
      FROM randevular r
      LEFT JOIN musteriler m ON m.id = r.musteri_id
      LEFT JOIN hizmetler h ON h.id = r.hizmet_id
      LEFT JOIN calisanlar c ON c.id = r.calisan_id
      LEFT JOIN isletmeler i ON i.id = r.isletme_id
      WHERE r.id = $1
    `, [randevu.id])).rows[0];

    if (!detay) return null;

    const tz = detay.isletme_tz || 'Europe/Istanbul';
    const basla = isoDateTime(detay.tarih, detay.saat, tz);
    const bit = isoDateTime(detay.tarih, detay.bitis_saati || detay.saat, tz);

    const event = {
      summary: `📅 ${detay.musteri_isim || 'Müşteri'} — ${detay.hizmet_isim || 'Randevu'}`,
      description: [
        `🏢 ${detay.isletme_isim || ''}`,
        detay.hizmet_isim ? `✂️ Hizmet: ${detay.hizmet_isim}` : null,
        detay.calisan_isim ? `👤 Çalışan: ${detay.calisan_isim}` : null,
        detay.musteri_telefon ? `📞 Telefon: ${detay.musteri_telefon}` : null,
        detay.hizmet_fiyat ? `💰 Fiyat: ${detay.hizmet_fiyat}₺` : null,
        detay.not_text ? `📝 Not: ${detay.not_text}` : null,
        '',
        `_SıraGO otomatik — Randevu #${detay.id}_`
      ].filter(Boolean).join('\n'),
      start: basla,
      end: bit,
      reminders: {
        useDefault: false,
        overrides: [
          { method: 'popup', minutes: 60 },
          { method: 'popup', minutes: 10 },
        ],
      },
      extendedProperties: {
        private: {
          sirago_randevu_id: String(detay.id),
          sirago_isletme_id: String(isletmeId),
        }
      }
    };

    const res = await calendar.events.insert({
      calendarId: ctx.row.calendar_id || 'primary',
      requestBody: event,
    });

    if (res.data?.id) {
      await pool.query('UPDATE randevular SET google_event_id=$1 WHERE id=$2', [res.data.id, detay.id]);
    }
    return res.data;
  } catch (e) {
    console.error(`⚠️ Google Calendar event create hata (isletme ${isletmeId}):`, e.message);
    return null;
  }
}

// Randevu güncellenince event de güncellensin (ertele)
async function randevuEventGuncelle(isletmeId, randevuId) {
  try {
    const ctx = await yetkiliClient(isletmeId);
    if (!ctx) return null;

    const detay = (await pool.query(`
      SELECT r.*, m.isim as musteri_isim, h.isim as hizmet_isim, i.timezone as isletme_tz
      FROM randevular r
      LEFT JOIN musteriler m ON m.id = r.musteri_id
      LEFT JOIN hizmetler h ON h.id = r.hizmet_id
      LEFT JOIN isletmeler i ON i.id = r.isletme_id
      WHERE r.id = $1
    `, [randevuId])).rows[0];

    if (!detay) return null;
    if (!detay.google_event_id) {
      // Event yoksa oluştur
      return await randevuEventOlustur(isletmeId, { id: randevuId });
    }

    const tz = detay.isletme_tz || 'Europe/Istanbul';
    const calendar = google.calendar({ version: 'v3', auth: ctx.oauth2 });

    await calendar.events.patch({
      calendarId: ctx.row.calendar_id || 'primary',
      eventId: detay.google_event_id,
      requestBody: {
        summary: `📅 ${detay.musteri_isim || 'Müşteri'} — ${detay.hizmet_isim || 'Randevu'}`,
        start: isoDateTime(detay.tarih, detay.saat, tz),
        end: isoDateTime(detay.tarih, detay.bitis_saati || detay.saat, tz),
      },
    });
    return true;
  } catch (e) {
    console.error(`⚠️ Google Calendar event update hata:`, e.message);
    return null;
  }
}

// Randevu iptal/silinince event de silinsin
async function randevuEventSil(isletmeId, randevuId) {
  try {
    const row = (await pool.query('SELECT google_event_id FROM randevular WHERE id=$1', [randevuId])).rows[0];
    if (!row?.google_event_id) return null;

    const ctx = await yetkiliClient(isletmeId);
    if (!ctx) return null;

    const calendar = google.calendar({ version: 'v3', auth: ctx.oauth2 });
    await calendar.events.delete({
      calendarId: ctx.row.calendar_id || 'primary',
      eventId: row.google_event_id,
    });
    await pool.query('UPDATE randevular SET google_event_id=NULL WHERE id=$1', [randevuId]);
    return true;
  } catch (e) {
    // Event zaten silindiyse 410/404 dönebilir — sorun değil
    if (String(e.message).includes('Resource has been deleted') || String(e.code) === '410') {
      await pool.query('UPDATE randevular SET google_event_id=NULL WHERE id=$1', [randevuId]).catch(() => {});
      return true;
    }
    console.error(`⚠️ Google Calendar event delete hata:`, e.message);
    return null;
  }
}

// ────────────────────────────────────────────────────────
// GOOGLE → MÜSAİTLİK (FREEBUSY PULL)
// ────────────────────────────────────────────────────────

// Belirli gün için Google'daki meşgul aralıkları getir
// Cache: aynı isletmeId+tarih için 60sn cache (müsaitlik kontrolü sık çağrılıyor)
const _freebusyCache = new Map();

async function freebusyAraliklari(isletmeId, tarih) {
  const cacheKey = `${isletmeId}:${tarih}`;
  const cached = _freebusyCache.get(cacheKey);
  if (cached && Date.now() - cached.t < 60000) {
    return cached.data;
  }

  try {
    const ctx = await yetkiliClient(isletmeId);
    if (!ctx || !ctx.row.freebusy_kontrol) return [];

    const calendar = google.calendar({ version: 'v3', auth: ctx.oauth2 });
    const tz = (await pool.query('SELECT timezone FROM isletmeler WHERE id=$1', [isletmeId])).rows[0]?.timezone || 'Europe/Istanbul';

    const [yil, ay, gun] = String(tarih).slice(0, 10).split('-').map(Number);
    // Günün tümü: 00:00 → 24:00 (tz)
    const timeMin = `${yil}-${String(ay).padStart(2, '0')}-${String(gun).padStart(2, '0')}T00:00:00+03:00`;
    // Gün sonunu UTC'de hesapla (Türkiye için +03:00 ≈ yaklaşık)
    const tomorrow = new Date(Date.UTC(yil, ay - 1, gun));
    tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
    const timeMax = `${tomorrow.getUTCFullYear()}-${String(tomorrow.getUTCMonth() + 1).padStart(2, '0')}-${String(tomorrow.getUTCDate()).padStart(2, '0')}T00:00:00+03:00`;

    const res = await calendar.freebusy.query({
      requestBody: {
        timeMin,
        timeMax,
        timeZone: tz,
        items: [{ id: ctx.row.calendar_id || 'primary' }],
      },
    });

    const busy = res.data?.calendars?.[ctx.row.calendar_id || 'primary']?.busy || [];
    // Busy aralıkları "dakika" formatına çevir (o gün için)
    const araliklar = busy.map(b => {
      const bas = new Date(b.start);
      const bit = new Date(b.end);
      // Türkiye saati varsayımı
      const dkDonustur = (d) => {
        const tarihStr = d.toLocaleString('sv-SE', { timeZone: tz }).slice(0, 10);
        if (tarihStr !== tarih) {
          // Event gün dışı kaldı, o günün başı/sonu kabul et
          return null;
        }
        const [h, m] = d.toLocaleString('sv-SE', { timeZone: tz }).slice(11, 16).split(':').map(Number);
        return h * 60 + m;
      };
      const basDk = dkDonustur(bas);
      const bitDk = dkDonustur(bit);
      if (basDk === null && bitDk === null) return null;
      return {
        bas: basDk !== null ? basDk : 0,
        bit: bitDk !== null ? bitDk : 24 * 60,
      };
    }).filter(Boolean);

    _freebusyCache.set(cacheKey, { t: Date.now(), data: araliklar });
    return araliklar;
  } catch (e) {
    console.error(`⚠️ Google freebusy hata (isletme ${isletmeId}):`, e.message);
    return [];
  }
}

// Cache temizle (randevu oluşunca çağır)
function freebusyCacheTemizle(isletmeId) {
  for (const key of _freebusyCache.keys()) {
    if (key.startsWith(`${isletmeId}:`)) _freebusyCache.delete(key);
  }
}

module.exports = {
  authUrl,
  callbackHandle,
  bagliMi,
  baglantiKes,
  randevuEventOlustur,
  randevuEventGuncelle,
  randevuEventSil,
  freebusyAraliklari,
  freebusyCacheTemizle,
};
