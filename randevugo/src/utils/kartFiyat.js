// Kart fiyatı (2026-10-29): nakit ve kartla fiyatı farklı dükkânlar (Esse Man: saç 1.800₺ nakit, 2.100₺ kart).
// hizmetler.fiyat ana (nakit) fiyattır: ciro, kapora, sadakat puanı onunla hesaplanır. kart_fiyat yalnız gösterilir.
const kartVar = (h) => Number(h?.fiyat) > 0 && Number(h?.kart_fiyat) > 0 && Number(h.kart_fiyat) !== Number(h.fiyat);
const ETIKET = { tr: ['nakit', 'kart'], en: ['cash', 'card'], ar: ['نقدًا', 'بالبطاقة'] };
const etiket = (dil) => ETIKET[dil] || ETIKET.tr;

// Bot şablonları: "1.800 TL" yazısının arkasına " nakit · 2.100 TL kart"
const kartEki = (h, fmt, dil = 'tr') => {
  if (!kartVar(h)) return '';
  const [n, k] = etiket(dil);
  return ` ${n} · ${fmt(h.kart_fiyat)} TL ${k}`;
};
// Biçimlenmiş kart fiyatı hazır gelince (hizmet seçildi, randevu özeti)
const kartEkiYazi = (kart, dil = 'tr') => {
  if (!kart) return '';
  const [n, k] = etiket(dil);
  return ` ${n} · ${kart} TL ${k}`;
};
// ₺ biçimi (sohbet asistanı): "1.800₺" ya da "1.800₺ nakit · 2.100₺ kart"
const tl = (x) => `${Number(x).toLocaleString('tr-TR')}₺`;
const fiyatYazi = (h, dil = 'tr') => {
  if (!kartVar(h)) return tl(h.fiyat);
  const [n, k] = etiket(dil);
  return `${tl(h.fiyat)} ${n} · ${tl(h.kart_fiyat)} ${k}`;
};
// Panelden gelen değer: boş/0/geçersiz → null (kart farkı yok)
const kartTemiz = (v) => { const n = parseFloat(String(v ?? '').replace(',', '.')); return n > 0 ? n : null; };

module.exports = { kartVar, kartEki, kartEkiYazi, fiyatYazi, kartTemiz };
