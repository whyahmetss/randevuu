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

module.exports = { bugunTarih, yarinTarih, gunSonraTarih, simdiSaat, tarihFormatla };
