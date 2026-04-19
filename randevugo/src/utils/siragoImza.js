// ═══════════════════════════════════════════════════
// 🚀 SıraGO İmzası — Otomatik sistem mesajlarının altına eklenen reklam satırı.
// Tüm TR/EN/AR mesajlarda ortak kullanım.
// Kapatma: ENV SIRAGO_IMZA=false veya isletmeler.imza_gizle=true
// ═══════════════════════════════════════════════════

const IMZA_METINLER = {
  tr: '━━━━━━━━━━\n🚀 _SıraGO ile güçlendirilmiştir_\nsırago.com',
  en: '━━━━━━━━━━\n🚀 _Powered by SıraGO_\nsırago.com',
  ar: '━━━━━━━━━━\n🚀 _مدعوم من SıraGO_\nsırago.com',
};

function envAcik() {
  // Varsayılan: imza AÇIK. Sadece explicit 'false' ise kapalı.
  return process.env.SIRAGO_IMZA !== 'false';
}

// İmzayı mesajın sonuna ekle.
// isletme: imza_gizle=true ise imza eklenmez (premium paket için rezerve).
// dil: 'tr' | 'en' | 'ar' (varsayılan 'tr')
function imzaEkle(mesaj, isletme = null, dil = 'tr') {
  if (!envAcik()) return mesaj;
  if (isletme?.imza_gizle) return mesaj;

  const imza = IMZA_METINLER[dil] || IMZA_METINLER.tr;
  const sep = mesaj && !mesaj.endsWith('\n') ? '\n\n' : '\n';
  return `${mesaj || ''}${sep}${imza}`;
}

// Tek başına imza satırını döndür (template içinde kullanım için)
function imzaSatiri(isletme = null, dil = 'tr') {
  if (!envAcik()) return '';
  if (isletme?.imza_gizle) return '';
  return '\n\n' + (IMZA_METINLER[dil] || IMZA_METINLER.tr);
}

module.exports = { imzaEkle, imzaSatiri };
