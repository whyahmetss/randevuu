/**
 * MERKEZİ API KONFIGURASYONU
 * Tüm URL tanımları burada. Backend taşındığında sadece env güncellenir
 * veya fallback `DEFAULT_API_URL`'si değiştirilir.
 *
 * Öncelik: VITE_API_URL env > DEFAULT_API_URL > localhost
 */

const isLocal = typeof window !== 'undefined' && window.location.hostname === 'localhost';

// Production fallback — yedek hesap v2 backend'i
const DEFAULT_API_URL = isLocal
  ? 'http://localhost:3000/api'
  : 'https://randevugo-api-v2.onrender.com/api';

// Tam API URL (ör. https://randevugo-api-v2.onrender.com/api)
export const API_URL = import.meta.env.VITE_API_URL || DEFAULT_API_URL;

// API kökü (ör. https://randevugo-api-v2.onrender.com) — /api eki olmadan
// Socket.IO, rezervasyon sayfası linkleri vs. için
export const API_ORIGIN = API_URL.replace(/\/api\/?$/, '');

// Rezervasyon linki oluşturucu (backend /book/:slug endpoint'ini sunar)
// Müşteriye verilen tek rezervasyon adresi. Eskiden üç farklı adres vardı (onrender.com, punycode
// admin.xn--…, randevu.sırago.com); API'deki /book artık React sayfasına yönlendiriyor.
export const BOOKING_BASE = import.meta.env.VITE_BOOKING_BASE || 'https://randevu.sırago.com';
export const bookingUrl = (slug) => `${BOOKING_BASE}/book/${slug}`;

// Socket.IO bağlantı URL'i
export const SOCKET_URL = API_ORIGIN;

// Hızlı debug log (production'da sessiz)
if (isLocal) {
  console.log('[config] API_URL:', API_URL, '| API_ORIGIN:', API_ORIGIN);
}
