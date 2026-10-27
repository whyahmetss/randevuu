// Türkiye saatine göre tarih/saat yardımcıları
function bugunTarih() {
  return new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Istanbul' });
}

function yarinTarih() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toLocaleDateString('sv-SE', { timeZone: 'Europe/Istanbul' });
}

function gunSonraTarih(gun) {
  const d = new Date();
  d.setDate(d.getDate() + gun);
  return d.toLocaleDateString('sv-SE', { timeZone: 'Europe/Istanbul' });
}

function simdiSaat() {
  const now = new Date();
  const saat = parseInt(now.toLocaleString('en-US', { timeZone: 'Europe/Istanbul', hour: 'numeric', hour12: false }));
  const dakika = parseInt(now.toLocaleString('en-US', { timeZone: 'Europe/Istanbul', minute: 'numeric' }));
  return { saat, dakika, toplam: saat * 60 + dakika };
}

function tarihFormatla(tarih) {
  const d = new Date(tarih);
  return d.toLocaleDateString('sv-SE', { timeZone: 'Europe/Istanbul' });
}

// Kapanış saati dakikası (2026-10-27): "00:00" kapanış gece yarısı demek ama 0. dakika okunuyordu; 13:30–00:00 açık
// salonda hiç saat çıkmıyordu. Kapanış açılıştan önce/eşitse gün sonu (24:00) sayılır; gece yarısını aşan mesai gün sonunda biter.
function kapanisDk(bas, bit) {
  const dk = (x) => { const [h, m] = String(x || '').slice(0, 5).split(':').map(Number); return (h || 0) * 60 + (m || 0); };
  const b = dk(bit);
  return b <= dk(bas) ? 24 * 60 : b;
}

module.exports = { bugunTarih, yarinTarih, gunSonraTarih, simdiSaat, tarihFormatla, kapanisDk };
