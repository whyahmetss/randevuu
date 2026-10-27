// Bot müşteriye çalışanı hangi unvanla sorar (2026-10-27): masaj salonunda "Tercih ettiğiniz bir usta var mı?" yazıyordu,
// esnaf "terapist" istedi. Panelde yazılan unvan → kategoriye göre → "usta" (eski davranış; kategorisi "genel" kalan berberler çok).
const sade = (s) => String(s || '').toLocaleLowerCase('tr')
  .replace(/ı/g, 'i').replace(/ş/g, 's').replace(/ğ/g, 'g').replace(/ü/g, 'u').replace(/ö/g, 'o').replace(/ç/g, 'c');

const KATEGORI = [
  [/masaj|spa|wellness|fizyoterapi/, 'terapist', 'therapist'],
  [/berber|barber/, 'usta', 'barber'],
  [/kuafor|sac/, 'kuaför', 'stylist'],
  [/guzellik|beauty|cilt|estetik|epilasyon|lazer|tirnak|nail|manikur|kirpik|kas/, 'uzman', 'specialist'],
  [/dis|dent/, 'doktor', 'dentist'],
  [/veteriner|vet/, 'veteriner', 'vet'],
  [/dovme|tattoo|piercing/, 'sanatçı', 'artist'],
  [/diyet|beslenme/, 'diyetisyen', 'dietitian'],
  [/psikolog|terapi|danisman/, 'uzman', 'specialist'],
  [/klinik|doktor|hekim|muayene/, 'doktor', 'doctor'],
];

// → { tr: 'terapist', en: 'therapist' }
function calisanUnvani(isletme) {
  const elle = String(isletme?.calisan_unvani || '').trim();
  if (elle) return { tr: elle.toLocaleLowerCase('tr'), en: elle.toLocaleLowerCase('tr') };
  const k = sade(isletme?.kategori);
  const e = KATEGORI.find(([re]) => re.test(k));
  return e ? { tr: e[1], en: e[2] } : { tr: 'usta', en: 'staff member' };
}

const buyukHarf = (s) => s.charAt(0).toLocaleUpperCase('tr') + s.slice(1);

module.exports = { calisanUnvani, buyukHarf };
