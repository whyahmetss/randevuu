// Esnafa SıraGO'dan WhatsApp mesajı (2026-10-15): önce Merkez numarası (bildirim düşer), olmazsa esnafın kendi
// bağlı WhatsApp'ı (kendine mesaj; yalnız esnaf mesajı beklerken işe yarar: şifre, kod). Göndermezse { gitti: false }.
const { telefonNormalize } = require('./telefon');

async function esnafaYaz(isletme, metin, { kendineDe = false } = {}) {
  const tel = telefonNormalize(isletme?.telefon);
  if (!/^905\d{9}$/.test(tel)) return { gitti: false, tel: null };
  try {
    if ((await require('../services/merkezOtpBot').mesajGonder(tel, metin))?.success) return { gitti: true, tel, kanal: 'merkez' };
  } catch (e) { /* yedeğe geç */ }
  if (kendineDe && isletme.id) {
    try {
      const wa = require('../services/whatsappWeb');
      if (wa.getDurum(isletme.id)?.durum === 'bagli' && (await wa.mesajGonder(isletme.id, tel, metin))?.success) return { gitti: true, tel, kanal: 'kendi' };
    } catch (e) { /* gönderilemedi */ }
  }
  return { gitti: false, tel };
}

const telMaskele = (t) => { const d = String(t || '').replace(/\D/g, ''); return d.length >= 4 ? `•••• ••• ${d.slice(-4, -2)} ${d.slice(-2)}` : ''; };

module.exports = { esnafaYaz, telMaskele };
