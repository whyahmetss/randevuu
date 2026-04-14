/**
 * Webhook Güvenlik Middleware'leri
 * 1) Numara bazlı rate-limit (From alanına göre)
 * 2) Payload doğrulama (Twilio formatı kontrolü)
 */

// ─── NUMARA BAZLI RATE-LIMIT ───
// Bellek tabanlı: { telefon → { sayac, ilk_istek_zamani } }
const numaraIstek = new Map();
const PENCERE_MS = 10 * 1000;  // 10 saniye pencere
const MAX_ISTEK   = 5;         // pencere başına max istek
const TEMIZLEME_ARALIĞI = 60 * 1000; // 1 dk'da bir eski kayıtları temizle

// Bellek sızıntısını önle — periyodik temizlik
setInterval(() => {
  const simdi = Date.now();
  for (const [tel, veri] of numaraIstek.entries()) {
    if (simdi - veri.pencere_baslangic > PENCERE_MS * 6) {
      numaraIstek.delete(tel);
    }
  }
}, TEMIZLEME_ARALIĞI);

function numaraRateLimit(req, res, next) {
  // From alanından telefon numarasını çıkar
  const from = req.body?.From || req.body?.from || '';
  if (!from || typeof from !== 'string') {
    return next(); // From yoksa IP bazlı rate-limit'e bırak
  }

  const simdi = Date.now();
  let kayit = numaraIstek.get(from);

  if (!kayit || (simdi - kayit.pencere_baslangic > PENCERE_MS)) {
    // Yeni pencere başlat
    kayit = { sayac: 1, pencere_baslangic: simdi };
    numaraIstek.set(from, kayit);
    return next();
  }

  kayit.sayac++;

  if (kayit.sayac > MAX_ISTEK) {
    console.warn(`🛑 Rate-limit: ${from} → ${kayit.sayac}/${MAX_ISTEK} istek (${PENCERE_MS / 1000}s pencere)`);
    return res.status(429).json({
      hata: 'Çok fazla mesaj gönderdiniz. Lütfen birkaç saniye bekleyin.',
      retry_after_ms: PENCERE_MS - (simdi - kayit.pencere_baslangic)
    });
  }

  return next();
}

// ─── PAYLOAD DOĞRULAMA ───
// Twilio webhook formatı: { From: "whatsapp:+90...", Body: "...", To: "..." }
function payloadDogrula(req, res, next) {
  const body = req.body;

  // Body hiç yoksa veya obje değilse
  if (!body || typeof body !== 'object') {
    return res.status(400).json({ hata: 'Geçersiz payload: body boş veya obje değil' });
  }

  // Twilio formatı: From ve Body zorunlu
  const from = body.From || body.from;
  const msg  = body.Body || body.body;

  if (!from || typeof from !== 'string') {
    return res.status(400).json({ hata: 'Geçersiz payload: "From" alanı eksik veya hatalı' });
  }

  if (msg === undefined || msg === null) {
    return res.status(400).json({ hata: 'Geçersiz payload: "Body" alanı eksik' });
  }

  // From formatı kontrol — whatsapp:+XXXXXXXXXXX veya +XXXXXXXXXXX
  if (typeof from === 'string' && !from.match(/^(whatsapp:)?\+?\d{6,20}$/)) {
    return res.status(400).json({ hata: 'Geçersiz payload: "From" formatı hatalı' });
  }

  // Body string olmalı
  if (typeof msg !== 'string') {
    return res.status(400).json({ hata: 'Geçersiz payload: "Body" string olmalı' });
  }

  // Aşırı uzun mesaj koruması (10KB üstü)
  if (msg.length > 10000) {
    return res.status(400).json({ hata: 'Mesaj çok uzun (max 10000 karakter)' });
  }

  return next();
}

module.exports = { numaraRateLimit, payloadDogrula };
