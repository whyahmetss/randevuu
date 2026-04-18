/**
 * DDoS / Troll / Spam Koruma Middleware
 * ═══════════════════════════════════════════════════
 * 1) IP bazlı günlük randevu limiti (başarı sayacı, rate-limit'ten ayrı)
 * 2) Browser fingerprint kontrolü (aynı fingerprint'ten 10dk'da çok telefon)
 * 3) Honeypot field (formda gizli input — bot doldurursa reddet)
 * 4) Form süresi kontrolü (3sn'den hızlı = bot)
 * 5) User-Agent blacklist (curl, python-requests, vb.)
 *
 * Sadece public booking endpoint'lerinde (randevuOlustur) kullanılır.
 */
const pool = require('../config/db');
const crypto = require('crypto');

// Bellek içi fingerprint sayaç (10dk pencere)
const fingerprintSayac = new Map(); // hash → [{ telefon, zaman }, ...]
const FINGERPRINT_PENCERE_MS = 10 * 60 * 1000; // 10 dakika
const FINGERPRINT_MAX_TELEFON = 3;

// Periyodik temizlik
setInterval(() => {
  const simdi = Date.now();
  for (const [hash, list] of fingerprintSayac.entries()) {
    const yeni = list.filter(e => simdi - e.zaman < FINGERPRINT_PENCERE_MS);
    if (yeni.length === 0) fingerprintSayac.delete(hash);
    else fingerprintSayac.set(hash, yeni);
  }
}, 5 * 60 * 1000);

const BOT_UA_PATTERNS = [
  /curl\//i, /python-requests/i, /python-urllib/i, /axios\//i,
  /node-fetch/i, /go-http-client/i, /java\//i, /postman/i,
  /httpx/i, /okhttp/i, /headless/i, /phantomjs/i,
];

function _clientIp(req) {
  // Trust proxy (Render) → X-Forwarded-For'un ilk IP'sini al
  const xff = req.headers['x-forwarded-for'];
  if (xff) return String(xff).split(',')[0].trim();
  return req.ip || req.connection?.remoteAddress || 'unknown';
}

function _fingerprint(req) {
  const ua = req.headers['user-agent'] || '';
  const fp = String(req.body?.fingerprint || '');
  const al = req.headers['accept-language'] || '';
  // Client fingerprint + server tespiti
  const veri = `${fp}|${ua}|${al}`;
  return crypto.createHash('sha256').update(veri).digest('hex').substring(0, 16);
}

async function _olayLogla(isletmeId, tip, detay, ip, telefon) {
  try {
    await pool.query(
      `INSERT INTO guvenlik_olay_log (isletme_id, tip, detay, ip, telefon) VALUES ($1, $2, $3, $4, $5)`,
      [isletmeId, tip, detay, ip, telefon || null]
    );
  } catch {}
}

/**
 * Ana DDoS guard middleware — randevuOlustur'dan önce
 * req.params.slug kullanır, işletme_id'yi kendi çıkarır
 */
async function ddosGuard(req, res, next) {
  try {
    const ip = _clientIp(req);
    const ua = (req.headers['user-agent'] || '').toLowerCase();

    // ─── (1) User-Agent blacklist ───
    if (!ua || BOT_UA_PATTERNS.some(rx => rx.test(ua))) {
      await _olayLogla(null, 'bot_ua', ua || 'empty', ip, null);
      return res.status(403).json({ hata: 'Lütfen tarayıcı üzerinden randevu alın.' });
    }

    // ─── (2) Honeypot field — gizli alan bot doldurursa ───
    // Frontend'de `<input name="website" style="display:none">` ekleniyor
    if (req.body?.website || req.body?.email_confirm) {
      await _olayLogla(null, 'honeypot', JSON.stringify({ website: req.body?.website, email_confirm: req.body?.email_confirm }), ip, req.body?.musteriTelefon || null);
      // Sessiz başarı — bot farketmesin
      return res.status(200).json({ basarili: true, randevu: { id: 0, tarih: '2099-01-01', saat: '00:00', durum: 'iptal' } });
    }

    // ─── (3) Form süresi — 3sn'den hızlı = bot ───
    const formSure = parseInt(req.body?.form_sure_ms || '0', 10);
    if (formSure > 0 && formSure < 3000) {
      await _olayLogla(null, 'form_hiz', `${formSure}ms`, ip, req.body?.musteriTelefon || null);
      return res.status(403).json({ hata: 'Lütfen formu dikkatli doldurun.' });
    }

    // İşletme ID'sini slug'tan çıkar (bir kere sorgula, sonraki middleware de kullanır)
    const { slug } = req.params;
    const isletme = (await pool.query(
      `SELECT id, ip_gunluk_limit, booking_acik FROM isletmeler WHERE slug=$1 AND aktif=true`,
      [slug]
    )).rows[0];
    if (!isletme) return res.status(404).json({ hata: 'İşletme bulunamadı' });
    if (!isletme.booking_acik) {
      return res.status(423).json({ hata: 'Bu işletme henüz randevu kabul etmiyor', bookingKapali: true });
    }
    req._isletme = isletme;

    // ─── (4) IP günlük randevu limiti (bu işletme için) ───
    const bugun = new Date().toISOString().slice(0, 10);
    const ipLimitSinir = isletme.ip_gunluk_limit || 5;
    const ipRow = (await pool.query(
      `SELECT sayi FROM ip_randevu_log WHERE ip=$1 AND isletme_id=$2 AND tarih=$3`,
      [ip, isletme.id, bugun]
    )).rows[0];
    const ipSayi = ipRow?.sayi || 0;
    if (ipSayi >= ipLimitSinir) {
      await _olayLogla(isletme.id, 'ip_limit', `${ipSayi}/${ipLimitSinir}`, ip, req.body?.musteriTelefon || null);
      return res.status(429).json({ hata: 'Günlük randevu limitine ulaştınız. Lütfen yarın tekrar deneyin.' });
    }
    // IP günlük randevu limiti (global — tüm işletmeler toplam)
    const globalRow = (await pool.query(
      `SELECT COALESCE(SUM(sayi), 0) as toplam FROM ip_randevu_log WHERE ip=$1 AND tarih=$2`,
      [ip, bugun]
    )).rows[0];
    if (parseInt(globalRow.toplam) >= 20) {
      await _olayLogla(isletme.id, 'ip_global_limit', `${globalRow.toplam}/20`, ip, req.body?.musteriTelefon || null);
      return res.status(429).json({ hata: 'Çok fazla randevu denemesi. Lütfen yarın tekrar deneyin.' });
    }

    // ─── (5) Fingerprint — aynı cihazdan 10dk'da 3+ farklı telefon ───
    const fpHash = _fingerprint(req);
    const telefon = String(req.body?.musteriTelefon || '').replace(/[^\d]/g, '');
    const mevcut = fingerprintSayac.get(fpHash) || [];
    const benzersizTelefonlar = new Set(
      mevcut
        .filter(e => Date.now() - e.zaman < FINGERPRINT_PENCERE_MS)
        .map(e => e.telefon)
    );
    if (telefon && !benzersizTelefonlar.has(telefon) && benzersizTelefonlar.size >= FINGERPRINT_MAX_TELEFON) {
      await _olayLogla(isletme.id, 'fingerprint', `hash=${fpHash} telefonlar=${benzersizTelefonlar.size + 1}`, ip, telefon);
      return res.status(429).json({ hata: 'Aynı cihazdan çok fazla farklı telefon ile randevu denendi.' });
    }

    req._ddosCtx = { ip, isletmeId: isletme.id, fpHash, telefon, bugun };
    next();
  } catch (e) {
    console.error('ddosGuard hatası:', e.message);
    next(); // Guard hatası yüzünden müşteri randevu alamasın diye bypass
  }
}

/**
 * Başarılı randevu sonrası — sayaçları artır
 * bookingController.randevuOlustur sonunda çağrılır
 */
async function ddosSayacArtir(ctx) {
  if (!ctx) return;
  const { ip, isletmeId, fpHash, telefon, bugun } = ctx;
  try {
    await pool.query(
      `INSERT INTO ip_randevu_log (ip, isletme_id, tarih, sayi) VALUES ($1, $2, $3, 1)
       ON CONFLICT (ip, isletme_id, tarih) DO UPDATE SET sayi = ip_randevu_log.sayi + 1`,
      [ip, isletmeId, bugun]
    );
  } catch {}
  // Fingerprint bellek kaydı
  try {
    const list = fingerprintSayac.get(fpHash) || [];
    list.push({ telefon, zaman: Date.now() });
    fingerprintSayac.set(fpHash, list);
  } catch {}
  // Fingerprint DB log (opsiyonel, istatistik için)
  try {
    await pool.query(
      `INSERT INTO fingerprint_log (hash, telefon, tarih, sayi) VALUES ($1, $2, $3, 1)
       ON CONFLICT (hash, tarih, telefon) DO UPDATE SET sayi = fingerprint_log.sayi + 1`,
      [fpHash, telefon, bugun]
    );
  } catch {}
}

module.exports = { ddosGuard, ddosSayacArtir, _olayLogla };
