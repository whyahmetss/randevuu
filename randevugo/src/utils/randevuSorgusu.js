// "Randevum kaçtaydı?" (sahada 2026-10-16): müşteri var olan randevusunu soruyor; bot yeni randevu akışı başlatıyordu.
// Randevu sorgusu = randevuM / randevu saatim + ne zaman / kaçta / hangi gün / var mı… ("randevu almak istiyorum" değil)
const sade = (m) => String(m || '').toLocaleLowerCase('tr')
  .replace(/ı/g, 'i').replace(/ğ/g, 'g').replace(/ü/g, 'u').replace(/ş/g, 's').replace(/ö/g, 'o').replace(/ç/g, 'c')
  .replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();

const KENDI = /\b(randevum|randevumu|randevumun|randevularim|randevu saatim|randevu saatimi|saatim)\b/;
const SORU = /\b(kac|kacta|kactaydi|kacda|ne zaman|hangi gun|hangi saat|saat kac|saati|vardi|var mi|ne zamandi|hatirlat|unuttum|neydi|ogrenmek|soruyorum)\b/;

function randevuSorgusu(metin) {
  const s = sade(metin);
  if (/\brandevularim\b/.test(s)) return true;
  return KENDI.test(s) && SORU.test(s);
}

module.exports = { randevuSorgusu };
