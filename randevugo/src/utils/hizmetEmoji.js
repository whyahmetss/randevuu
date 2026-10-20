// Müşteri mesajlarında hizmet satırının ikonu işletmenin sektörüne göre (2026-10-20): dişçide ✂️ tuhaf duruyordu
const { sade } = require('./sekreterKomut');

const KURAL = [
  [/dis|dental|ortodonti/, '🦷'],
  [/veteriner|pet|hayvan/, '🐾'],
  [/tirnak|manikur|nail/, '💅'],
  [/dovme|tattoo|piercing/, '🖋️'],
  [/spa|masaj|hamam/, '💆'],
  [/guzellik|cilt|estetik|lazer|epilasyon|kas|kirpik|makyaj/, '💆‍♀️'],
  [/pilates|yoga|fizyo|spor|fitness/, '🧘'],
  [/diyet|beslenme/, '🥗'],
  [/psikolog|terapi|danisman/, '💬'],
  [/oto|arac|yikama/, '🚗'],
  [/berber|kuafor|sac|barber/, '✂️'],
];

function hizmetEmoji(kategori) {
  const k = sade(kategori || '');
  if (!k || k === 'genel' || k === 'diger') return '✂️';   // SıraGO'nun çoğu işletmesi berber/kuaför
  for (const [re, e] of KURAL) if (re.test(k)) return e;
  return '📋';
}

module.exports = { hizmetEmoji };
