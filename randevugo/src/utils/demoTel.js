// Demo verisinin telefonları (kullanıcı kararı 2026-10-14): eski demo numaraları gerçek hatlara denk geliyordu,
// bot test edilirken gerçek kişilere mesaj gitti. Demo artık 905990000NNN aralığını kullanır ve
// WhatsApp/SMS gönderimi demo numaralarına (eski + yeni) hiçbir durumda mesaj atmaz.
const { telefonNormalize } = require('./telefon');

const ESKI_DEMO = new Set([
  ...Array.from({ length: 15 }, (_, i) => `9053210000${String(i + 1).padStart(2, '0')}`),   // eski demo müşteriler
  ...Array.from({ length: 3 }, (_, i) => `90555111000${i + 1}`),                              // eski demo çalışanlar
]);

const demoTel = (n) => `+905990000${String(n).padStart(3, '0')}`;

function demoNumaraMi(tel) {
  const t = telefonNormalize(String(tel || '').split('@')[0]);
  return /^905990000\d{3}$/.test(t) || ESKI_DEMO.has(t);
}

module.exports = { demoTel, demoNumaraMi, ESKI_DEMO };
